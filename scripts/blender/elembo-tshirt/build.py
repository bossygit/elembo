"""
Elembo — T-shirt 3D personnalisable : construction procédurale complète.

Lancer (depuis la racine du dépôt) :

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P scripts/blender/elembo-tshirt/build.py -- root=$PWD [sim=1] [h=0.013]

Le script produit, dans assets/3d/elembo-tshirt/ :
    elembo-tshirt.blend, textures/, zones.json (métadonnées des zones)
et public/models/elembo-tshirt/elembo-tshirt.glb.

Principe :
  1. Des patrons plats (devant, dos, manches) sont triangulés puis posés en 3D. Les
     coutures (côtés, épaules, emmanchures) partagent exactement leurs points : une fois
     fusionné, le vêtement est un seul maillage continu.
  2. Chaque panneau est déplié (ABF) puis réaligné sur son patron : on obtient un
     « patron en mètres » sans miroir, qui sert à l'atlas du tissu ET aux zones
     d'impression.
  3. Simulation de tissu (Cloth) sur un mannequin invisible : plis et tombé naturels.
  4. Col côtes, atlas (coutures, surpiqûres), occlusion précalculée, épaisseur.
  5. Cinq surfaces d'impression indépendantes (avant, dos, manches, intérieur du col),
     copies exactes de la surface du tissu décalées de 0,4 mm, chacune avec son matériau,
     ses UV propres (0..1, isotropes) et une texture remplaçable.
"""

import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.geometry import delaunay_2d_cdt

# ─────────────────────────────────────────────────────────────────────────────
# Options
# ─────────────────────────────────────────────────────────────────────────────
ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OPT = dict(a.split("=", 1) if "=" in a else (a, "1") for a in ARGS)
ROOT = os.path.abspath(OPT.get("root", os.getcwd()))
OUT = os.path.join(ROOT, "assets/3d/elembo-tshirt")
TEX = os.path.join(OUT, "textures")
GLB_DIR = os.path.join(ROOT, "public/models/elembo-tshirt")
SIM = OPT.get("sim", "1") == "1"
H = float(OPT.get("h", "0.013"))  # longueur d'arête visée (m)
SIM_FRAMES = int(OPT.get("frames", "30"))
os.makedirs(TEX, exist_ok=True)
os.makedirs(GLB_DIR, exist_ok=True)

# ─────────────────────────────────────────────────────────────────────────────
# Patron (mètres) — unisexe oversize, taille M. x horizontal, z vertical (ourlet = 0).
# ─────────────────────────────────────────────────────────────────────────────
W = 0.29  # demi-largeur de poitrine à plat (58 cm)
ZA = 0.47  # dessous de bras
SP = (0.272, 0.705)  # pointe d'épaule (épaule tombante)
HPS = (0.098, 0.745)  # point haut d'épaule (départ du col)
ZN_FRONT = 0.650  # creux d'encolure devant
ZN_BACK = 0.722  # creux d'encolure dos
TP = 0.11  # longueur de patron qui s'enroule sur l'épaule
HB = 0.075  # hauteur 3D de cet enroulement
N_SE = 3.0  # exposant de la superellipse du torse (3 = carré doux)

# Zone « intérieur du col » (patron du dos, vue de l'intérieur)
COLLAR_RECT = (-0.06, 0.06, ZN_BACK - 0.074, ZN_BACK - 0.014)

# Manches
SLEEVE_ANGLE = math.radians(50)  # sous l'horizontale
SLEEVE_LEN = 0.20  # longueur à l'axe
SLEEVE_HEM_R = 0.066  # rayon de l'ourlet de manche (tour ≈ 41 cm)

ZONES = {1: "front", 2: "back", 3: "left_sleeve", 4: "right_sleeve", 5: "collar_rib"}
SLEEVE_FRAME = {}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def resample(f, n, include_end=False):
    ts = np.linspace(0, 1, 1201)
    pts = np.array([f(t) for t in ts])
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    targets = np.linspace(0, s[-1], n + 1)
    if not include_end:
        targets = targets[:-1]
    return np.stack([np.interp(targets, s, pts[:, 0]), np.interp(targets, s, pts[:, 1])], 1), s[-1]


def seg_count(f):
    _, length = resample(f, 8)
    return max(2, int(round(length / H)))


def mirror(f):
    return lambda t: (-f(1 - t)[0], f(1 - t)[1])


def armhole(t):
    return (W - (W - SP[0]) * t**2, ZA + (SP[1] - ZA) * t)


def shoulder(t):
    return (SP[0] + (HPS[0] - SP[0]) * t, SP[1] + (HPS[1] - SP[1]) * t)


def neck_half(zn):
    return lambda t: (HPS[0] * math.cos(t * math.pi / 2), HPS[1] - (HPS[1] - zn) * math.sin(t * math.pi / 2))


def z_seam(x):
    """Hauteur de la couture d'épaule dans le patron (prolongée au centre et à l'emmanchure)."""
    ax = np.abs(x)
    t = np.clip((ax - HPS[0]) / (SP[0] - HPS[0]), 0, 1)
    return HPS[1] + (SP[1] - HPS[1]) * t


# Nombres de points par segment : identiques devant/dos pour que les coutures coïncident.
N_HEM = seg_count(lambda t: (-W + 2 * W * t, 0.0))
N_SIDE = seg_count(lambda t: (W, ZA * t))
N_ARM = seg_count(armhole)
N_SH = seg_count(shoulder)


def panel_outline(zn):
    """Contour CCW du panneau, avec index des segments utiles."""
    pieces = [
        ("hem", lambda t: (-W + 2 * W * t, 0.0), N_HEM),
        ("side_r", lambda t: (W, ZA * t), N_SIDE),
        ("arm_r", armhole, N_ARM),
        ("sh_r", shoulder, N_SH),
        ("neck_r", neck_half(zn), seg_count(neck_half(zn))),
        ("neck_l", mirror(neck_half(zn)), seg_count(neck_half(zn))),
        ("sh_l", mirror(shoulder), N_SH),
        ("arm_l", mirror(armhole), N_ARM),
        ("side_l", lambda t: (-W, ZA * (1 - t)), N_SIDE),
    ]
    pts, idx = [], {}
    for name, f, n in pieces:
        p, _ = resample(f, n)
        idx[name] = (len(pts), len(pts) + n)  # [début, fin) ; le point de fin = début du suivant
        pts.extend(p.tolist())
    return np.array(pts), idx


def point_in_poly(p, poly):
    x, y = p[:, 0][:, None], p[:, 1][:, None]
    x1, y1 = poly[:, 0][None, :], poly[:, 1][None, :]
    x2, y2 = np.roll(poly[:, 0], -1)[None, :], np.roll(poly[:, 1], -1)[None, :]
    cond = (y1 > y) != (y2 > y)
    xin = (x2 - x1) * (y - y1) / np.where(y2 - y1 == 0, 1e-12, y2 - y1) + x1
    return (cond & (x < xin)).sum(1) % 2 == 1


def dist_to_polyline(p, poly, closed=True):
    a = poly
    b = np.roll(poly, -1, axis=0) if closed else poly[1:]
    if not closed:
        a = poly[:-1]
    d = np.full(len(p), np.inf)
    for i in range(len(a)):
        ab = b[i] - a[i]
        t = np.clip(((p - a[i]) @ ab) / max(ab @ ab, 1e-12), 0, 1)
        d = np.minimum(d, np.linalg.norm(p - (a[i] + t[:, None] * ab), axis=1))
    return d


def triangulate(boundary, extra_loops=()):
    """Triangulation de Delaunay contrainte : contour + réseau hexagonal intérieur."""
    xmin, zmin = boundary.min(0)
    xmax, zmax = boundary.max(0)
    rows = []
    dz = H * math.sqrt(3) / 2
    for i, z in enumerate(np.arange(zmin + dz / 2, zmax, dz)):
        off = (H / 2) * (i % 2)
        xs = np.arange(xmin + off, xmax, H)
        rows.append(np.stack([xs, np.full_like(xs, z)], 1))
    grid = np.concatenate(rows)
    grid = grid[point_in_poly(grid, boundary)]
    keep = dist_to_polyline(grid, boundary) > 0.6 * H
    for loop in extra_loops:
        keep &= dist_to_polyline(grid, loop) > 0.5 * H
    grid = grid[keep]

    verts = boundary.tolist()
    edges = [(i, (i + 1) % len(boundary)) for i in range(len(boundary))]
    for loop in extra_loops:
        base = len(verts)
        verts += loop.tolist()
        edges += [(base + i, base + (i + 1) % len(loop)) for i in range(len(loop))]
    n_constrained = len(verts)
    verts += grid.tolist()
    out_v, _, out_f, orig_v, _, _ = delaunay_2d_cdt([Vector(v) for v in verts], edges, [], 1, 1e-9)
    # Retrouver les coordonnées d'entrée exactes (la sortie peut être réordonnée).
    coords = np.array([verts[o[0]] if o else tuple(out_v[i]) for i, o in enumerate(orig_v)])
    origin = [o[0] if o else -1 for o in orig_v]
    return coords, [list(f) for f in out_f], origin, n_constrained


# ─────────────────────────────────────────────────────────────────────────────
# Passage patron → 3D (torse)
# ─────────────────────────────────────────────────────────────────────────────
def D_of(z):
    t = smoothstep(0.36, 0.64, z)
    return 0.132 * (1 - t) + 0.086 * t


_A_TABLE = {}


def quarter_table(D):
    """Quart de superellipse (demi-largeur A choisie pour une longueur d'arc = W)."""
    key = round(float(D), 5)
    if key in _A_TABLE:
        return _A_TABLE[key]
    th = np.linspace(0, math.pi / 2, 400)

    def build(A):
        X = A * np.sin(th) ** (2 / N_SE)
        Y = D * np.cos(th) ** (2 / N_SE)
        s = np.concatenate([[0], np.cumsum(np.hypot(np.diff(X), np.diff(Y)))])
        return X, Y, s

    lo, hi = 0.05, 0.4
    for _ in range(50):
        mid = (lo + hi) / 2
        if build(mid)[2][-1] < W:
            lo = mid
        else:
            hi = mid
    _A_TABLE[key] = build((lo + hi) / 2)
    return _A_TABLE[key]


DEND = 0.068  # demi-profondeur de l'emmanchure (bras + aisance)


def row_xy(x, z):
    """Profil horizontal. Sous le bras, le côté est fermé (couture de côté, Y = 0) ;
    au-dessus, le profil s'ouvre pour former une emmanchure ovale (et non en pointe)."""
    X, Y, s = quarter_table(D_of(z))
    a = min(abs(x), W)
    t = float(np.clip((z - ZA) / 0.09, 0, 1))
    opening = DEND * math.sqrt(1 - (1 - t) ** 2) * (a / W) ** 4
    return math.copysign(float(np.interp(a, s, X)), x), float(np.interp(a, s, Y)) + opening


def map_body(x, z, side):
    """side = -1 devant (face -Y), +1 dos."""
    zb = float(z_seam(x)) - TP
    if z <= zb:
        X, Y = row_xy(x, z)
        return Vector((X, side * Y, z))
    X, Y = row_xy(x, zb)
    phi = min((z - zb) / TP, 1.0) * math.pi / 2
    return Vector((X, side * Y * math.cos(phi), zb + HB * math.sin(phi)))


# ─────────────────────────────────────────────────────────────────────────────
# Construction des objets
# ─────────────────────────────────────────────────────────────────────────────
def new_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def ensure_layers(bm):
    lay = {
        "atlas": bm.loops.layers.uv.new("UV_ATLAS"),
        "design": bm.loops.layers.uv.new("DESIGN"),
        "param": bm.loops.layers.uv.new("PARAM"),
        "zone": bm.faces.layers.int.new("zone"),
        "collar": bm.faces.layers.int.new("collar"),
        "pin": bm.verts.layers.float.new("pin"),
    }
    return lay


def build_panel(side):
    zn = ZN_FRONT if side < 0 else ZN_BACK
    outline, idx = panel_outline(zn)
    extra = []
    if side > 0:  # contour exact de la zone « intérieur du col » dans le dos
        x0, x1, z0, z1 = COLLAR_RECT
        rect = []
        for a, b in [((x0, z0), (x1, z0)), ((x1, z0), (x1, z1)), ((x1, z1), (x0, z1)), ((x0, z1), (x0, z0))]:
            n = max(2, int(round(math.dist(a, b) / (H * 0.6))))
            for t in np.linspace(0, 1, n, endpoint=False):
                rect.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        extra.append(np.array(rect))
    coords, faces, _, _ = triangulate(outline, extra)

    bm = bmesh.new()
    lay = ensure_layers(bm)
    neck = np.array([outline[i] for i in range(idx["neck_r"][0], idx["neck_l"][1] + 1)])
    vs = []
    for x, z in coords:
        v = bm.verts.new(map_body(x, z, side))
        top = float(z_seam(x)) - z
        near_neck = dist_to_polyline(np.array([[x, z]]), neck, closed=False)[0]
        # Maintien dégradé (épaules, encolure) : pas de marche à la limite des zones tenues.
        w_sh = float(np.clip(1 - top / 0.045, 0, 1)) * float(np.clip((SP[0] + 0.01 - abs(x)) / 0.02, 0, 1))
        w_nk = float(np.clip(1 - near_neck / 0.03, 0, 1))
        w = max(w_sh, w_nk) ** 1.5
        mode = OPT.get("pinmode", "old")
        if mode == "old":
            w = float((top < 0.028 and abs(x) <= SP[0] + 0.004) or near_neck < 0.018)
        elif mode == "bin":
            w = float(w > 0.35)
        v[lay["pin"]] = w
        vs.append(v)
    for f in faces:
        if side > 0:
            f = f[::-1]  # normale vers l'extérieur (dos)
        face = bm.faces.new([vs[i] for i in f])
        face[lay["zone"]] = 1 if side < 0 else 2
        cx = np.mean([coords[i][0] for i in f])
        cz = np.mean([coords[i][1] for i in f])
        x0, x1, z0, z1 = COLLAR_RECT
        face[lay["collar"]] = int(side > 0 and x0 < cx < x1 and z0 < cz < z1)
    # UV de conception et paramètres (par coin de face)
    lookup = {v: coords[i] for i, v in enumerate(vs)}
    for face in bm.faces:
        for loop in face.loops:
            x, z = lookup[loop.vert]
            loop[lay["param"]].uv = (x, z)
            # Vu de dos, la droite du spectateur est −X : le dos est lu en x inversé.
            loop[lay["design"]].uv = (x if side < 0 else -x, z)
    ob = new_object("panel_front" if side < 0 else "panel_back", bm)
    return ob, outline, idx


def armhole_loop_3d(outline, idx):
    """Boucle d'emmanchure droite du patron (côté +X) : dessous de bras → devant → épaule → dos."""
    a0, a1 = idx["arm_r"]
    pts2d = [outline[i] for i in range(a0, a1 + 1)]  # dessous de bras … pointe d'épaule
    front = [map_body(x, z, -1) for x, z in pts2d]
    back = [map_body(x, z, +1) for x, z in pts2d[1:-1]][::-1]
    return front + back


def build_sleeve(loop, mirror_x):
    P = np.array([tuple(v) for v in loop])
    NL = len(P)
    seglen = np.linalg.norm(np.roll(P, -1, 0) - P, axis=1)
    f = np.concatenate([[0], np.cumsum(seglen)[:-1]]) / seglen.sum()
    Lloop = seglen.sum()
    C = P.mean(0)
    a = np.array([math.cos(SLEEVE_ANGLE), 0, -math.sin(SLEEVE_ANGLE)])
    up = np.array([0, 0, 1.0])
    e1 = up - (up @ a) * a
    e1 /= np.linalg.norm(e1)
    e2 = np.cross(a, e1)
    Ch = C + a * SLEEVE_LEN
    if not mirror_x:
        SLEEVE_FRAME.update(C=C, a=a, e1=e1, Ch=Ch, top=P[NL // 2], hem_top=Ch + SLEEVE_HEM_R * e1)
    theta = math.pi - 2 * math.pi * f
    Hm = Ch + SLEEVE_HEM_R * (np.cos(theta)[:, None] * e1 + np.sin(theta)[:, None] * e2)
    lens = np.linalg.norm(Hm - P, axis=1)
    M = max(4, int(round(lens.mean() / H)))

    bm = bmesh.new()
    lay = ensure_layers(bm)
    grid = []
    for k in range(M + 1):
        t = k / M
        ring = []
        for j in range(NL):
            p = (1 - t) * P[j] + t * Hm[j]
            radial = p - (C + a * ((p - C) @ a))
            rn = np.linalg.norm(radial)
            if rn > 1e-9:
                p = p + 0.010 * math.sin(math.pi * t) * radial / rn
            if mirror_x:
                p = p * np.array([-1, 1, 1])
            v = bm.verts.new(Vector(p))
            v[lay["pin"]] = 0.0
            ring.append(v)
        grid.append(ring)
    for k in range(M):
        for j in range(NL):
            j2 = (j + 1) % NL
            quad = [grid[k][j], grid[k][j2], grid[k + 1][j2], grid[k + 1][j]]
            face = bm.faces.new(quad)
            face[lay["zone"]] = 4 if mirror_x else 3
            face[lay["collar"]] = 0
            for loop in face.loops:
                kk = 0 if loop.vert in (grid[k][j], grid[k][j2]) else 1
                jj = j if loop.vert in (grid[k][j], grid[k + 1][j]) else j + 1
                fu = 1.0 if jj == NL else f[jj % NL]
                u = fu * Lloop
                v = (1 - (k + kk) / M) * lens[jj % NL]
                # Manche gauche (+X) vue de l'extérieur : u croît de l'avant vers l'arrière.
                # Manche droite (−X) : de l'arrière vers l'avant.
                loop[lay["design"]].uv = ((Lloop - u) if mirror_x else u, v)
                loop[lay["param"]].uv = (fu, (k + kk) / M)
    # Orientation : normale vers l'extérieur de la manche.
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    sample = bm.faces[len(bm.faces) // 2]
    c = sample.calc_center_median()
    axis_c = Vector(C * (np.array([-1, 1, 1]) if mirror_x else 1))
    axis_a = Vector(a * (np.array([-1, 1, 1]) if mirror_x else 1))
    radial = (c - axis_c) - axis_a * (c - axis_c).dot(axis_a)
    if sample.normal.dot(radial) < 0:
        for face in bm.faces:
            face.normal_flip()
    # Couture sous le bras : colonne j = 0.
    for k in range(M):
        e = bm.edges.get([grid[k][0], grid[k + 1][0]])
        if e:
            e.seam = True
    return new_object("sleeve_right" if mirror_x else "sleeve_left", bm)




# ─────────────────────────────────────────────────────────────────────────────
# Dépliage : ABF de tout le vêtement (coutures = limites de zones), puis chaque île
# est réalignée sur son patron (similitude, miroir interdit) et mise à l'échelle réelle.
# ─────────────────────────────────────────────────────────────────────────────
def select_only(ob):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def loop_array(me, layer):
    a = np.zeros(len(me.loops) * 2)
    me.uv_layers[layer].data.foreach_get("uv", a)
    return a.reshape(-1, 2)


def face_attr(me, name):
    a = np.zeros(len(me.polygons), dtype=np.int32)
    me.attributes[name].data.foreach_get("value", a)
    return a


def loop_faces(me):
    lf = np.zeros(len(me.loops), dtype=np.int32)
    for p in me.polygons:
        lf[p.loop_start : p.loop_start + p.loop_total] = p.index
    return lf


def unwrap_to_pattern(ob):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    zl = bm.faces.layers.int["zone"]
    for e in bm.edges:
        fs = e.link_faces
        if len(fs) == 2 and fs[0][zl] != fs[1][zl]:
            e.seam = True
    bm.to_mesh(me)
    bm.free()

    select_only(ob)
    me.uv_layers.active = me.uv_layers["UV_ATLAS"]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.0)
    bpy.ops.object.mode_set(mode="OBJECT")

    uv = loop_array(me, "UV_ATLAS")
    des = loop_array(me, "DESIGN")
    zone_of_loop = face_attr(me, "zone")[loop_faces(me)]
    out = uv.copy()
    report = {}
    for z in (1, 2, 3, 4):
        sel = zone_of_loop == z
        u, d = uv[sel], des[sel]
        mu, md = u.mean(0), d.mean(0)
        U, _, Vt = np.linalg.svd((u - mu).T @ (d - md))
        R = (U @ Vt).T
        det = float(np.linalg.det(R))
        rot = (u - mu) @ R.T
        area3d, area_uv = 0.0, 0.0
        pos = np.where(sel)[0]
        rot_full = np.zeros_like(uv)
        rot_full[sel] = rot
        for p in me.polygons:
            if me.attributes["zone"].data[p.index].value != z:
                continue
            area3d += p.area
            q = rot_full[list(p.loop_indices)]
            area_uv += 0.5 * abs(np.dot(q[:, 0], np.roll(q[:, 1], -1)) - np.dot(q[:, 1], np.roll(q[:, 0], -1)))
        s = math.sqrt(area3d / area_uv)
        out[pos] = rot * s + md
        report[ZONES[z]] = {"det": round(det, 3), "area_m2": round(area3d, 4)}
    me.uv_layers["UV_ATLAS"].data.foreach_set("uv", out.ravel())
    return report


# ─────────────────────────────────────────────────────────────────────────────
# Mannequin invisible (collisions de la simulation)
# ─────────────────────────────────────────────────────────────────────────────
def to_collection(ob, coll):
    for c in ob.users_collection:
        c.objects.unlink(ob)
    coll.objects.link(ob)


def add_collision(ob):
    ob.modifiers.new("Collision", "COLLISION")
    ob.collision.thickness_outer = 0.003
    ob.collision.cloth_friction = 10


def capsule(name, p0, p1, r, coll):
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=r, depth=d.length, location=(p0 + p1) / 2)
    cyl = bpy.context.active_object
    cyl.rotation_mode = "QUATERNION"
    cyl.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    cyl.name = name
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=p1, segments=32, ring_count=16)
    end = bpy.context.active_object
    end.name = name + "_END"
    for o in (cyl, end):
        to_collection(o, coll)
        add_collision(o)


def build_mannequin(coll):
    rings, K, NR = [], 24, 48
    bm = bmesh.new()
    for z in np.linspace(-0.08, 0.585, K):
        t = smoothstep(0.30, 0.585, z)
        A = 0.185 * (1 - t) + 0.16 * t
        D = 0.100 * (1 - t) + 0.062 * t
        ring = []
        for i in range(NR):
            th = 2 * math.pi * i / NR
            c, s_ = math.cos(th), math.sin(th)
            ring.append(bm.verts.new((A * math.copysign(abs(s_) ** (2 / 3.2), s_), D * math.copysign(abs(c) ** (2 / 3.2), c), z)))
        rings.append(ring)
    for k in range(K - 1):
        for i in range(NR):
            i2 = (i + 1) % NR
            bm.faces.new([rings[k][i], rings[k][i2], rings[k + 1][i2], rings[k + 1][i]])
    bm.faces.new(rings[-1][::-1])
    bm.faces.new(rings[0])
    torso = new_object("MANNEQUIN_TORSO", bm)
    to_collection(torso, coll)
    # Le torse n'est PAS un obstacle : les panneaux pendent librement depuis les épaules
    # (un torse collisionneur fait « étagère » sous les épaules). Gardé comme repère visuel.
    if OPT.get("torso", "0") == "1":
        add_collision(torso)

    fr = SLEEVE_FRAME
    r_arm = float(OPT.get("rarm", "0.045"))
    gap = float(OPT.get("agap", "0.012"))  # > distance de collision, sinon la simulation est éjectée
    # Le bras suit la ligne du dessus de la manche (épaule → ourlet), juste sous le tissu :
    # la manche repose sur toute sa longueur au lieu de s'écraser près de l'épaule.
    d = fr["hem_top"] - fr["top"]
    d /= np.linalg.norm(d)
    n = fr["e1"] - (fr["e1"] @ d) * d
    n /= np.linalg.norm(n)
    arms = []
    back = float(OPT.get("aback", "0.0"))
    for sign, name in ((1, "MANNEQUIN_ARM_L"), (-1, "MANNEQUIN_ARM_R")):
        m = np.array([sign, 1, 1])
        p0 = (fr["top"] - n * (r_arm + gap) - d * back) * m
        p1 = (fr["hem_top"] - n * (r_arm + gap) + d * 0.10) * m
        capsule(name, p0, p1, r_arm, coll)
        arms.append((p0, p1, r_arm))
    return arms


def contacts_at_start(co, arms, margin=0.0065):
    """Sommets du vêtement déjà dans la zone de collision d'un bras (doit valoir 0)."""
    n = 0
    for p0, p1, r in arms:
        ab = p1 - p0
        t = np.clip(((co - p0) @ ab) / (ab @ ab), 0, 1)
        dist = np.linalg.norm(co - (p0 + t[:, None] * ab), axis=1)
        n += int((dist < r + margin).sum())
    return n


def edge_stats(me, label):
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    e = np.zeros(len(me.edges) * 2, dtype=np.int64)
    me.edges.foreach_get("vertices", e)
    e = e.reshape(-1, 2)
    L = np.linalg.norm(co[e[:, 0]] - co[e[:, 1]], axis=1)
    print(f"  [contrôle {label}] arête max {L.max():.3f} m, > 5 cm : {(L > 0.05).sum()}", flush=True)


def simulate(garment, coll):
    """Tombé du coton : épaules et encolure tenues, manches posées sur les bras."""
    me = garment.data
    if OPT.get("coll", "1") == "1":
        arms = build_mannequin(coll)
        co0 = np.zeros(len(me.vertices) * 3)
        me.vertices.foreach_get("co", co0)
        print(f"  sommets en contact initial avec les bras : {contacts_at_start(co0.reshape(-1, 3), arms)}", flush=True)
    pins = np.zeros(len(me.vertices))
    me.attributes["pin"].data.foreach_get("value", pins)
    vg = garment.vertex_groups.new(name="pin")
    for i, w in enumerate(pins):
        if w > 0:
            vg.add([i], float(w), "REPLACE")

    mod = garment.modifiers.new("Cloth", "CLOTH")
    st = mod.settings
    st.quality = 8
    st.mass = 0.2
    st.air_damping = 2.0
    st.tension_stiffness = st.compression_stiffness = 20
    st.shear_stiffness = 8
    st.bending_stiffness = float(OPT.get("bend", "3.0"))
    st.tension_damping = st.compression_damping = 8
    st.shear_damping = 8
    st.bending_damping = 0.8
    st.vertex_group_mass = "pin"
    st.pin_stiffness = 2.0
    cs = mod.collision_settings
    cs.collision_quality = 4
    cs.distance_min = 0.003
    cs.use_self_collision = OPT.get("selfc", "1") == "1"
    cs.self_distance_min = 0.003
    cs.self_friction = 5
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = SIM_FRAMES
    scene = bpy.context.scene
    scene.frame_start, scene.frame_end = 1, SIM_FRAMES
    for fr in range(1, SIM_FRAMES + 1):
        scene.frame_set(fr)
        if fr % 5 == 0 or fr <= 3:
            ev_ = garment.evaluated_get(bpy.context.evaluated_depsgraph_get())
            c_ = np.zeros(len(ev_.data.vertices) * 3)
            ev_.data.vertices.foreach_get("co", c_)
            print(f"  simulation : image {fr}/{SIM_FRAMES} — rayon max {np.abs(c_).max():.3f} m", flush=True)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = garment.evaluated_get(dg)
    co = np.zeros(len(me.vertices) * 3)
    ev.data.vertices.foreach_get("co", co)
    garment.modifiers.remove(mod)
    scene.frame_set(1)
    edge_stats(me, "avant copie")
    me.vertices.foreach_set("co", co)
    me.update()
    edge_stats(me, "après copie")
    # Lissage léger : garde les plis, retire les facettes de la résolution de simulation.
    bm = bmesh.new()
    bm.from_mesh(me)
    inner = [v for v in bm.verts if not v.is_boundary]
    # Moyenne simple (et non Laplace/cotangente, qui diverge sur les petits triangles froissés).
    bmesh.ops.smooth_vert(bm, verts=inner, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(me)
    bm.free()
    for o in coll.objects:
        o.hide_render = True
        o.hide_viewport = True


# ─────────────────────────────────────────────────────────────────────────────
# Col côtes
# ─────────────────────────────────────────────────────────────────────────────
COLLAR_W = 0.021


def boundary_loops(bm):
    edges = [e for e in bm.edges if e.is_boundary]
    adj = {}
    for e in edges:
        a, b = e.verts
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)
    seen, loops = set(), []
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = [v for v in adj[cur] if v is not prev and v not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
            seen.add(cur)
            loop.append(cur)
        loops.append(loop)
    return loops


def add_collar(garment):
    me = garment.data
    bm = bmesh.new()
    bm.from_mesh(me)
    loops = boundary_loops(bm)
    neck = max(loops, key=lambda L: np.mean([v.co.z for v in L]))
    # Départ au milieu du dos, sens : vers la gauche du porteur (+X) en passant par l'avant.
    i0 = max(range(len(neck)), key=lambda i: neck[i].co.y - 3 * abs(neck[i].co.x))
    neck = neck[i0:] + neck[:i0]
    if neck[1].co.x < neck[0].co.x:
        neck = [neck[0]] + neck[1:][::-1]
    neck_set = set(neck)
    center = sum((v.co for v in neck), Vector()) / len(neck)

    zl = bm.faces.layers.int["zone"]
    cl = bm.faces.layers.int["collar"]
    uvl = bm.loops.layers.uv["UV_ATLAS"]
    rows = [neck]
    up = Vector((0, 0, 1))
    dirs = []
    for v in neck:
        inner = [e.other_vert(v) for e in v.link_edges if e.other_vert(v) not in neck_set]
        c = sum((w.co for w in inner), Vector()) / max(len(inner), 1)
        d = (v.co - c).normalized()
        dirs.append((0.45 * d + up).normalized())
    for r, w in enumerate((COLLAR_W * 0.5, COLLAR_W), start=1):
        rows.append([bm.verts.new(v.co + dirs[i] * w + (v.co - center).normalized() * 0.0015 * r) for i, v in enumerate(neck)])
    arc = [0.0]
    for i in range(1, len(neck) + 1):
        arc.append(arc[-1] + (neck[i % len(neck)].co - neck[i - 1].co).length)
    n = len(neck)
    new_faces = []
    for r in range(2):
        for i in range(n):
            i2 = (i + 1) % n
            f = bm.faces.new([rows[r][i], rows[r][i2], rows[r + 1][i2], rows[r + 1][i]])
            f[zl], f[cl] = 5, 0
            f.material_index = 1
            for lp in f.loops:
                ii = i if lp.vert in (rows[r][i], rows[r + 1][i]) else i + 1
                rr = r if lp.vert in (rows[r][i], rows[r][i2]) else r + 1
                lp[uvl].uv = (arc[ii], [0, COLLAR_W * 0.5, COLLAR_W][rr])
            new_faces.append(f)
    bm.normal_update()
    f = new_faces[n // 4]
    if f.normal.dot(f.calc_center_median() - center) < 0:
        for f in new_faces:
            f.normal_flip()
    for i in range(2):
        e = bm.edges.get([rows[i][0], rows[i + 1][0]])
        if e:
            e.seam = True
    bm.to_mesh(me)
    bm.free()
    return arc[-1]


# ─────────────────────────────────────────────────────────────────────────────
# Atlas : îles du patron (mètres) rangées dans un carré 0..1
# ─────────────────────────────────────────────────────────────────────────────
ATLAS_GAP = 0.03
PRINT_ASPECT = {1: 4 / 5, 2: 4 / 5, 3: 2.0, 4: 2.0}


def layout_atlas(me):
    pm = loop_array(me, "UV_ATLAS")
    me.uv_layers.new(name="PATTERN_M").data.foreach_set("uv", pm.ravel())
    zol = face_attr(me, "zone")[loop_faces(me)]
    boxes = {}
    for z in (1, 2, 3, 4, 5):
        p = pm[zol == z]
        boxes[z] = (p.min(0), p.max(0))
    size = {z: boxes[z][1] - boxes[z][0] for z in boxes}
    g = ATLAS_GAP
    place = {
        1: (g, g),
        2: (2 * g + size[1][0], g),
    }
    y2 = 2 * g + max(size[1][1], size[2][1])
    place[3] = (g, y2)
    place[4] = (2 * g + size[3][0], y2)
    y3 = y2 + g + max(size[3][1], size[4][1])
    place[5] = (g, y3)
    S = max(
        place[2][0] + size[2][0] + g,
        place[4][0] + size[4][0] + g,
        place[5][0] + size[5][0] + g,
        y3 + size[5][1] + g,
    )
    out = pm.copy()
    for z in boxes:
        sel = zol == z
        out[sel] = (pm[sel] - boxes[z][0] + np.array(place[z])) / S
    me.uv_layers["UV_ATLAS"].data.foreach_set("uv", out.ravel())
    return S, boxes


def print_rects(me, boxes):
    """Rectangle d'impression de chaque zone, en mètres du patron (isotrope)."""
    rects = {}
    for z, aspect in PRINT_ASPECT.items():
        (x0, y0), (x1, y1) = boxes[z]
        w, h = x1 - x0 + 0.02, y1 - y0 + 0.02
        h = max(h, w / aspect)
        h = math.ceil(h * 100) / 100
        w = h * aspect
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        rects[z] = (cx - w / 2, cy - h / 2, w, h)
    # Intérieur du col : boîte exacte des faces marquées, lue de l'intérieur (x non inversé).
    pm = loop_array(me, "PATTERN_M")
    lf = loop_faces(me)
    sel = face_attr(me, "collar")[lf] == 1
    p = pm[sel] * np.array([-1, 1])
    (x0, y0), (x1, y1) = p.min(0), p.max(0)
    rects["collar"] = (x0, y0, x1 - x0, y1 - y0)
    return rects


def stretch_report(me, layer, rects=None):
    """Écart entre longueurs 3D et longueurs du patron, par zone (arêtes)."""
    pm = loop_array(me, layer)
    zones = face_attr(me, "zone")
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    ratios = {z: [] for z in (1, 2, 3, 4, 5)}
    for p in me.polygons:
        li = list(p.loop_indices)
        vi = list(p.vertices)
        for k in range(len(li)):
            a, b = (k, (k + 1) % len(li))
            d3 = np.linalg.norm(co[vi[a]] - co[vi[b]])
            d2 = np.linalg.norm(pm[li[a]] - pm[li[b]])
            if d2 > 1e-6:
                ratios[zones[p.index]].append(d3 / d2)
    rep = {}
    for z, r in ratios.items():
        if r:
            r = np.array(r)
            rep[ZONES[z]] = {
                "median": round(float(np.median(r)), 3),
                "p05": round(float(np.percentile(r, 5)), 3),
                "p95": round(float(np.percentile(r, 95)), 3),
            }
    return rep


# ─────────────────────────────────────────────────────────────────────────────
# Textures procédurales (numpy) — enregistrées en PNG
# ─────────────────────────────────────────────────────────────────────────────
def save_png(name, rgba, colorspace="sRGB"):
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).astype(np.float32).ravel())
    path = os.path.join(TEX, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.filepath = path
    img.source = "FILE"
    img.reload()
    return img


def periodic_noise(n, freqs, rng):
    y, x = np.mgrid[0:n, 0:n] / n
    out = np.zeros((n, n))
    for f in freqs:
        for _ in range(3):
            kx, ky = rng.integers(-f, f + 1, 2)
            out += np.cos(2 * np.pi * (kx * x + ky * y) + rng.uniform(0, 2 * np.pi)) / max(f, 1)
    return out / (np.abs(out).max() + 1e-9)


def height_to_normal(hgt, strength):
    gy, gx = np.gradient(hgt)
    n = np.stack([-gx * strength, gy * strength, np.ones_like(hgt)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgba = np.concatenate([n * 0.5 + 0.5, np.ones(hgt.shape + (1,))], -1)
    return rgba


KNIT_TILE_M = 0.02  # 1 tuile = 2 cm de jersey
RIB_TILE_M = 0.01


def make_knit_normal():
    n = 512
    y, x = np.mgrid[0:n, 0:n].astype(float)
    wales, courses = 20, 25  # mailles de 1 mm × 0,8 mm
    u = (x * wales / n) % 1.0
    v = (y * courses / n) % 1.0
    lean = 0.13 * (v - 0.5)

    def leg(d):
        return np.clip(np.cos(np.clip(d / 0.2, -1, 1) * np.pi / 2), 0, 1) ** 1.5

    hgt = np.maximum(leg(u - 0.28 + lean), leg(u - 0.72 - lean))
    hgt *= 0.75 + 0.25 * np.cos(2 * np.pi * v)
    rng = np.random.default_rng(7)
    hgt += 0.35 * periodic_noise(n, (1, 2, 3), rng)  # irrégularités du fil (flammé)
    return save_png("fabric_knit_normal", height_to_normal(hgt, 6.0), "Non-Color")


def make_rib_normal():
    n = 256
    y, x = np.mgrid[0:n, 0:n].astype(float)
    ribs = 5
    u = (x * ribs / n) % 1.0
    hgt = np.cos(2 * np.pi * u) * 0.5 + 0.5
    hgt = hgt**0.7
    v = (y * 12 / n) % 1.0
    hgt += 0.08 * np.cos(2 * np.pi * v)
    return save_png("fabric_rib_normal", height_to_normal(hgt, 9.0), "Non-Color")


STROKES = {
    # type de bord : (décalages en m, largeur m, intensité, pointillé)
    "hem": [((0.016, 0.022), 0.0007, 0.30, True), ((0.026,), 0.0025, 0.07, False)],
    "neck": [((0.005, 0.0105), 0.0007, 0.28, True)],
    "seam": [((0.0,), 0.0013, 0.16, False)],
    "collar_edge": [((0.0,), 0.0016, 0.10, False)],
}


def make_base_atlas(garment, S, res=2048):
    """Blanc pur (la couleur vient du matériau) + coutures et surpiqûres ton sur ton."""
    bm = bmesh.new()
    bm.from_mesh(garment.data)
    zl = bm.faces.layers.int["zone"]
    uvl = bm.loops.layers.uv["UV_ATLAS"]

    def uv_in(face, vert):
        for lp in face.loops:
            if lp.vert is vert:
                return np.array(lp[uvl].uv)

    segs = []
    for e in bm.edges:
        fs = list(e.link_faces)
        zs = [f[zl] for f in fs]
        if len(fs) == 1:
            kind = "hem" if zs[0] in (1, 2, 3, 4) else "collar_edge"
        elif len(fs) == 2:
            if zs[0] == zs[1]:
                a0, a1 = uv_in(fs[0], e.verts[0]), uv_in(fs[1], e.verts[0])
                if np.linalg.norm(a0 - a1) < 1e-7:
                    continue
                kind = "seam"
            elif 5 in zs:
                kind = "neck"
            else:
                kind = "seam"
        else:
            continue
        for f in fs:
            if kind == "neck" and f[zl] == 5:
                continue
            segs.append((uv_in(f, e.verts[0]) * res, uv_in(f, e.verts[1]) * res, kind))
    bm.free()

    px_per_m = res / S
    dark = np.zeros((res, res))
    for p0, p1, kind in segs:
        for offsets, width, strength, dashed in STROKES[kind]:
            reach = (max(offsets) + width * 2) * px_per_m + 2
            lo = np.floor(np.minimum(p0, p1) - reach).astype(int).clip(0, res - 1)
            hi = np.ceil(np.maximum(p0, p1) + reach).astype(int).clip(0, res - 1)
            yy, xx = np.mgrid[lo[1] : hi[1] + 1, lo[0] : hi[0] + 1] + 0.5
            ab = p1 - p0
            L = np.linalg.norm(ab)
            if L < 1e-6:
                continue
            t = ((xx - p0[0]) * ab[0] + (yy - p0[1]) * ab[1]) / (L * L)
            dist = np.abs((xx - p0[0]) * ab[1] - (yy - p0[1]) * ab[0]) / L
            inside = (t >= -0.03) & (t <= 1.03)
            for off in offsets:
                m = np.clip(1 - np.abs(dist - off * px_per_m) / max(width * px_per_m, 0.7), 0, 1)
                if dashed:
                    # pas de 4 mm, 3 mm de fil visible (repère absolu : continu d'un segment à l'autre)
                    along = (xx * ab[0] + yy * ab[1]) / L / px_per_m
                    m = m * ((along / 0.004) % 1.0 < 0.72)
                m = m * inside * strength
                sub = dark[lo[1] : hi[1] + 1, lo[0] : hi[0] + 1]
                np.maximum(sub, m, out=sub)
    col = 1.0 - dark
    rgba = np.stack([col, col, col, np.ones_like(col)], -1)
    # l'image est stockée haut en bas ; UV v=0 en bas → retourner
    return save_png("fabric_atlas_basecolor", rgba[::-1], "sRGB")


# ─────────────────────────────────────────────────────────────────────────────
# Matériaux (compatibles glTF : Principled BSDF + textures + Mapping)
# ─────────────────────────────────────────────────────────────────────────────
def gltf_output_group():
    name = "glTF Material Output"
    if name in bpy.data.node_groups:
        return bpy.data.node_groups[name]
    g = bpy.data.node_groups.new(name, "ShaderNodeTree")
    g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    g.interface.new_socket("Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    return g


def tex_node(nt, img, uv_name, scale=None, x=-900, y=0):
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv_name
    uvn.location = (x - 400, y)
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    t.location = (x, y)
    if scale:
        mp = nt.nodes.new("ShaderNodeMapping")
        mp.location = (x - 200, y)
        mp.inputs["Scale"].default_value = (scale[0], scale[1], 1)
        nt.links.new(uvn.outputs["UV"], mp.inputs["Vector"])
        nt.links.new(mp.outputs["Vector"], t.inputs["Vector"])
    else:
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
    return t


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, linear=True):
    h = h.lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return [srgb_to_linear(c) for c in rgb] if linear else rgb


def material_fabric(name, base_img, normal_img, normal_scale, ao_img, color_hex, atlas_uv, ao_uv, strength):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.93
    bsdf.inputs["Metallic"].default_value = 0.0
    # Reflet satiné du coton. L'exporteur glTF écrit sheenColorFactor = teinte (le poids est
    # ignoré) : la teinte grise règle donc l'intensité, sinon un T-shirt noir paraît gris.
    bsdf.inputs["Sheen Weight"].default_value = 1.0
    bsdf.inputs["Sheen Tint"].default_value = (0.22, 0.22, 0.22, 1)
    bsdf.inputs["Sheen Roughness"].default_value = 0.6
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    base = tex_node(nt, base_img, atlas_uv, None, y=300)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    mix.inputs["B"].default_value = (*hex_rgb(color_hex), 1)
    mix.label = mix.name = "FABRIC_COLOR"
    mix.location = (-400, 300)
    nt.links.new(base.outputs["Color"], mix.inputs["A"])
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    nrm_tex = tex_node(nt, normal_img, atlas_uv, normal_scale, y=-300)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.uv_map = atlas_uv
    nm.inputs["Strength"].default_value = strength
    nm.location = (-400, -300)
    nt.links.new(nrm_tex.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if ao_img is not None:
        ao = tex_node(nt, ao_img, ao_uv, None, y=-700)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        sep.location = (-400, -700)
        grp = nt.nodes.new("ShaderNodeGroup")
        grp.node_tree = gltf_output_group()
        grp.location = (200, -700)
        nt.links.new(ao.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    return m


def material_print(name, placeholder, normal_img, normal_scale, ao_img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    m.surface_render_method = "BLENDED"
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Specular IOR Level"].default_value = 0.3
    t = tex_node(nt, placeholder, "UV_PRINT", None, y=300)
    t.interpolation = "Linear"
    t.extension = "CLIP"
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
    nrm = tex_node(nt, normal_img, "UV_ATLAS", normal_scale, y=-300)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.uv_map = "UV_ATLAS"
    nm.inputs["Strength"].default_value = 0.6
    nm.location = (-400, -300)
    nt.links.new(nrm.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    ao = tex_node(nt, ao_img, "UV_ATLAS", None, y=-700)
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    grp = nt.nodes.new("ShaderNodeGroup")
    grp.node_tree = gltf_output_group()
    nt.links.new(ao.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Red"], grp.inputs["Occlusion"])
    return m


def placeholder_image(name):
    rgba = np.zeros((4, 4, 4))
    return save_png(name, rgba, "sRGB")


# ─────────────────────────────────────────────────────────────────────────────
# Occlusion ambiante précalculée (Cycles)
# ─────────────────────────────────────────────────────────────────────────────
def bake_ao(garment, res=1024):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 96
    scene.render.bake.margin = 8
    img = bpy.data.images.new("fabric_atlas_ao", res, res, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    nodes = []
    for mat in garment.data.materials:
        n = mat.node_tree.nodes.new("ShaderNodeTexImage")
        n.image = img
        mat.node_tree.nodes.active = n
        nodes.append((mat, n))
    garment.data.uv_layers.active = garment.data.uv_layers["UV_ATLAS"]
    select_only(garment)
    bpy.ops.object.bake(type="AO")
    for mat, n in nodes:
        mat.node_tree.nodes.remove(n)
    # Adoucir : l'AO ne doit pas creuser les plis au point de les salir.
    px = np.zeros(res * res * 4, dtype=np.float32)
    img.pixels.foreach_get(px)
    px = px.reshape(res, res, 4)
    ao = 0.35 + 0.65 * px[..., 0]
    rgba = np.stack([ao, ao, ao, np.ones_like(ao)], -1)
    bpy.data.images.remove(img)
    return save_png("fabric_atlas_ao", rgba[::-1], "Non-Color")


# ─────────────────────────────────────────────────────────────────────────────
# Surfaces d'impression
# ─────────────────────────────────────────────────────────────────────────────
PRINT_OFFSET = 0.0004
THICKNESS = 0.0018
PRINT_NAMES = {
    1: ("TSHIRT_FRONT_PRINT", "PRINT_FRONT", "front"),
    2: ("TSHIRT_BACK_PRINT", "PRINT_BACK", "back"),
    3: ("TSHIRT_LEFT_SLEEVE_PRINT", "PRINT_LEFT_SLEEVE", "left_sleeve"),
    4: ("TSHIRT_RIGHT_SLEEVE_PRINT", "PRINT_RIGHT_SLEEVE", "right_sleeve"),
    "collar": ("TSHIRT_COLLAR_PRINT", "PRINT_COLLAR", "collar"),
}


def build_print_mesh(garment, key, rect, material):
    me = garment.data
    zones = face_attr(me, "zone")
    collar = face_attr(me, "collar")
    pm = loop_array(me, "PATTERN_M")
    atlas = loop_array(me, "UV_ATLAS")
    nrm = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("normal", nrm)
    nrm = nrm.reshape(-1, 3)
    co = np.zeros(len(me.vertices) * 3)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    inside = key == "collar"
    faces = [p for p in me.polygons if (collar[p.index] == 1 if inside else zones[p.index] == key)]
    x0, y0, w, h = rect

    bm = bmesh.new()
    l_print = bm.loops.layers.uv.new("UV_PRINT")
    l_atlas = bm.loops.layers.uv.new("UV_ATLAS")
    vmap = {}
    off = -(THICKNESS + PRINT_OFFSET) if inside else PRINT_OFFSET
    for p in faces:
        vs = []
        for vi in p.vertices:
            if vi not in vmap:
                vmap[vi] = bm.verts.new(Vector(co[vi] + nrm[vi] * off))
            vs.append(vmap[vi])
        f = bm.faces.new(vs[::-1] if inside else vs)
        f.smooth = True
        li = list(p.loop_indices)
        order = li[::-1] if inside else li
        for lp, src in zip(f.loops, order):
            u, v = pm[src]
            if inside:
                u = -u  # lu de l'intérieur, depuis l'avant
            lp[l_print].uv = ((u - x0) / w, (v - y0) / h)
            lp[l_atlas].uv = tuple(atlas[src])
    name, _, _ = PRINT_NAMES[key]
    ob = new_object(name, bm)
    ob.data.materials.append(material)
    uvp = loop_array(ob.data, "UV_PRINT")
    return ob, (float(uvp.min()), float(uvp.max()))


# ─────────────────────────────────────────────────────────────────────────────
# Programme principal
# ─────────────────────────────────────────────────────────────────────────────
COLORS = [
    ("Blanc", "white", "#F4F3EF"),
    ("Noir", "black", "#1A1A1C"),
    ("Gris chiné", "grey", "#9C9EA1"),
    ("Bleu marine", "navy", "#1F2A44"),
    ("Rouge", "red", "#B3202A"),
    ("Vert", "green", "#1E5E3B"),
    ("Jaune", "yellow", "#F2C230"),
    ("Orange Elembo", "orange", "#FF5A12"),
]


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.render.fps = 24
    return scene


def main():
    scene = reset_scene()
    studio = bpy.data.collections.new("STUDIO")
    scene.collection.children.link(studio)
    mannequin = bpy.data.collections.new("MANNEQUIN_SIMULATION")
    scene.collection.children.link(mannequin)

    front, outline_f, idx_f = build_panel(-1)
    back, _, _ = build_panel(+1)
    loop = armhole_loop_3d(outline_f, idx_f)
    sl = build_sleeve(loop, mirror_x=False)
    sr = build_sleeve(loop, mirror_x=True)

    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in (front, back, sl, sr):
        ob.select_set(True)
    bpy.context.view_layer.objects.active = front
    bpy.ops.object.join()
    garment = bpy.context.active_object
    garment.name = garment.data.name = "TSHIRT_BODY"

    bm = bmesh.new()
    bm.from_mesh(garment.data)
    nv = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    print(f"fusion des coutures : {nv} → {len(bm.verts)} sommets")
    inner = [v for v in bm.verts if not v.is_boundary]
    for _ in range(4):
        bmesh.ops.smooth_laplacian_vert(
            bm, verts=inner, lambda_factor=0.25, lambda_border=0.0, use_x=True, use_y=True, use_z=True, preserve_volume=True
        )
    bm.to_mesh(garment.data)
    bm.free()

    report = {"unwrap": unwrap_to_pattern(garment)}
    if SIM:
        print("simulation du tissu…", flush=True)
        simulate(garment, mannequin)
    # Deux emplacements de matériau (tissu, côtes) ; les vrais matériaux viennent plus bas.
    tmp_mats = [bpy.data.materials.new("_tmp_fabric"), bpy.data.materials.new("_tmp_rib")]
    for m in tmp_mats:
        garment.data.materials.append(m)
    edge_stats(garment.data, "après simulation")
    report["collar_length_m"] = add_collar(garment)
    edge_stats(garment.data, "après col")

    S, boxes = layout_atlas(garment.data)
    rects = print_rects(garment.data, boxes)
    report["stretch_pattern_vs_3d"] = stretch_report(garment.data, "PATTERN_M")
    report["atlas_meters_per_uv"] = S
    print(json.dumps(report, indent=1), flush=True)

    # Textures
    knit = make_knit_normal()
    rib = make_rib_normal()
    base = make_base_atlas(garment, S)
    knit_scale = (S / KNIT_TILE_M, S / KNIT_TILE_M)
    rib_scale = (S / RIB_TILE_M, S / RIB_TILE_M)

    # Matériaux provisoires pour le précalcul, puis définitifs
    garment.data.materials.clear()
    for m in tmp_mats:
        bpy.data.materials.remove(m)
    fabric = material_fabric("FABRIC", base, knit, knit_scale, None, "#F4F3EF", "UV_ATLAS", "UV_ATLAS", 0.55)
    fabric_rib = material_fabric("FABRIC_RIB", base, rib, rib_scale, None, "#F4F3EF", "UV_ATLAS", "UV_ATLAS", 0.8)
    garment.data.materials.append(fabric)
    garment.data.materials.append(fabric_rib)
    for p in garment.data.polygons:
        p.use_smooth = True
    print("précalcul de l'occlusion…", flush=True)
    ao = bake_ao(garment)
    garment.data.materials.clear()
    bpy.data.materials.remove(fabric)
    bpy.data.materials.remove(fabric_rib)
    fabric = material_fabric("FABRIC", base, knit, knit_scale, ao, "#F4F3EF", "UV_ATLAS", "UV_ATLAS", 0.55)
    fabric_rib = material_fabric("FABRIC_RIB", base, rib, rib_scale, ao, "#F4F3EF", "UV_ATLAS", "UV_ATLAS", 0.8)
    garment.data.materials.append(fabric)
    garment.data.materials.append(fabric_rib)
    zones = face_attr(garment.data, "zone")
    for p in garment.data.polygons:
        p.material_index = 1 if zones[p.index] == 5 else 0

    # Surfaces d'impression (avant l'épaisseur : copies de la surface extérieure)
    prints, uv_ranges = {}, {}
    for key in (1, 2, 3, 4, "collar"):
        name, mat_name, zone_id = PRINT_NAMES[key]
        mat = material_print(mat_name, placeholder_image(f"print_{zone_id}_placeholder"), knit, knit_scale, ao)
        ob, rng = build_print_mesh(garment, key, rects[key], mat)
        prints[key] = ob
        uv_ranges[zone_id] = rng
    print("UV d'impression (min, max) :", uv_ranges, flush=True)

    # Épaisseur du tissu
    sol = garment.modifiers.new("Solidify", "SOLIDIFY")
    sol.thickness = THICKNESS
    sol.offset = -1
    sol.use_rim = True
    # Pas d'« épaisseur constante » : elle divise par le cosinus des plis serrés → pointes.
    sol.use_even_offset = False
    sol.use_quality_normals = True
    select_only(garment)
    bpy.ops.object.modifier_apply(modifier=sol.name)
    edge_stats(garment.data, "après épaisseur")
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(50))

    # Recentrage : origine au centre du vêtement
    lo = np.min([garment.matrix_world @ Vector(c) for c in garment.bound_box], axis=0)
    hi = np.max([garment.matrix_world @ Vector(c) for c in garment.bound_box], axis=0)
    center = Vector(((lo + hi) / 2).tolist())
    from mathutils import Matrix

    shift = Matrix.Translation(-center)
    for ob in [garment, *prints.values()]:
        ob.data.transform(shift)
    for ob in mannequin.objects:
        ob.matrix_world = shift @ ob.matrix_world

    # Nettoyage des calques de travail (gardés : UV_ATLAS ; zone/collar/pin en attributs)
    for name in ("DESIGN", "PARAM", "PATTERN_M"):
        garment.data.uv_layers.remove(garment.data.uv_layers[name])

    # Hiérarchie
    root = bpy.data.objects.new("ELEMBO_TSHIRT", None)
    scene.collection.objects.link(root)
    for ob in [garment, *prints.values()]:
        ob.parent = root

    zone_meta = {}
    for key, ob in prints.items():
        name, mat_name, zone_id = PRINT_NAMES[key]
        x0, y0, w, h = rects[key]
        ppcm = 25 if key in (1, 2) else 20 if key in (3, 4) else 40
        meta = {
            "zone": zone_id,
            "mesh": name,
            "material": mat_name,
            "print_width_cm": round(w * 100, 1),
            "print_height_cm": round(h * 100, 1),
            "aspect": round(w / h, 4),
            "recommended_texture_px": [int(round(w * 100 * ppcm)), int(round(h * 100 * ppcm))],
            "uv_set": "TEXCOORD_0 (UV_PRINT)",
            "inside": key == "collar",
        }
        zone_meta[zone_id] = meta
        for k, v in meta.items():
            ob[k] = v
    root["elembo_version"] = 1
    root["units"] = "meters"
    root["colors"] = {c[1]: c[2] for c in COLORS}
    root["fabric_materials"] = ["FABRIC", "FABRIC_RIB"]
    garment["fabric_color_hex"] = "#F4F3EF"

    meta = {
        "zones": zone_meta,
        "colors": [{"name": c[0], "id": c[1], "hex": c[2]} for c in COLORS],
        "atlas": {"meters_per_uv": S, "texture": "fabric_atlas_basecolor.png"},
        "triangles": {},
        "report": report,
        "print_rects_pattern_m": {str(k): v for k, v in rects.items()},
        "center_offset_m": list(center),
    }
    for ob in [garment, *prints.values()]:
        ob.data.calc_loop_triangles()
        meta["triangles"][ob.name] = len(ob.data.loop_triangles)
    with open(os.path.join(OUT, "zones.json"), "w") as fh:
        json.dump(meta, fh, indent=2, ensure_ascii=False)

    # Export GLB : uniquement la hiérarchie ELEMBO_TSHIRT
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in [root, garment, *prints.values()]:
        ob.select_set(True)
    glb = os.path.join(GLB_DIR, "elembo-tshirt.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_yup=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    print("GLB :", glb, os.path.getsize(glb) // 1024, "Ko", flush=True)
    for img in bpy.data.images:
        if img.source == "FILE":
            img.filepath = bpy.path.relpath(img.filepath_raw, start=OUT) if False else img.filepath
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "elembo-tshirt.blend"), relative_remap=True)
    print("terminé", flush=True)


if __name__ == "__main__":
    main()
