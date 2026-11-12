"""
ELEMBO — Mug céramique personnalisable 11 oz : construction procédurale Blender.

Lancer depuis la racine du dépôt :

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P assets/3d/elembo-mug/build.py -- root=$PWD [previews=0] [templates=0] [qc=0]

Produit :
  - assets/3d/elembo-mug/elembo-mug.blend
  - public/models/elembo-mug/elembo-mug.glb
  - assets/3d/elembo-mug/textures/*.png
  - assets/3d/elembo-mug/zones.json, _uv.json
  - aperçus Cycles, gabarits UV et contrôles qualité

Conventions (glTF, après export Y-up) :
  - unités : mètres ; Y vers le haut ;
  - devant de la tasse : +Z ; anse : −Z ;
  - U = tour de la tasse (0..1), U=0/1 sous l'anse, U=0,25 côté gauche
    (à gauche quand on regarde le devant), U=0,5 devant, U=0,75 côté droit ;
  - V = hauteur imprimable (0..1), 0 en bas du galbe, 1 sous le bord.
  - Le maillage d'impression MUG_PRINT_SURFACE est une surface cylindrique
    continue, sans trou ni couture géométrique visible, décalée de 0,12 mm
    au-dessus de la céramique émaillée. L'anse ne reçoit jamais cette texture.
"""

import json
import math
import os
import shutil
import subprocess
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Vector

# ─────────────────────────────────────────────────────────────────────────────
# Options et chemins
# ─────────────────────────────────────────────────────────────────────────────
ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OPT = dict(a.split("=", 1) if "=" in a else (a, "1") for a in ARGS)
ROOT = os.path.abspath(OPT.get("root", os.getcwd()))
OUT = os.path.join(ROOT, "assets/3d/elembo-mug")
TEX = os.path.join(OUT, "textures")
QC = os.path.join(OUT, "qc")
GLB_DIR = os.path.join(ROOT, "public/models/elembo-mug")
for d in (OUT, TEX, QC, GLB_DIR):
    os.makedirs(d, exist_ok=True)
DO_PREVIEWS = OPT.get("previews", "1") == "1"
DO_TEMPLATES = OPT.get("templates", "1") == "1"
DO_QC = OPT.get("qc", "1") == "1"
RENDER_SAMPLES = int(OPT.get("samples", "96"))
QC_SAMPLES = int(OPT.get("qc_samples", "48"))

# ─────────────────────────────────────────────────────────────────────────────
# Dimensions cibles (mètres). Toutes les dimensions sont documentées après construction.
# ─────────────────────────────────────────────────────────────────────────────
OVERALL_H = 0.095             # hauteur céramique
OUTER_R = 0.0410              # rayon extérieur à la paroi (Ø 82 mm)
WALL_T = 0.0040               # épaisseur de paroi au droit du galbe
PRINT_Z0 = 0.0075             # début de la surface imprimable (au-dessus du pied)
PRINT_Z1 = 0.0875             # fin de la surface imprimable (sous le bord)
PRINT_R_OFFSET = 0.00010      # épaisseur du vernis d'impression
GLAZE_TILE = 0.020            # tuile du grain de glaçure (20 mm)
SEG = 128                     # segments du corps autour de l'axe
HANDLE_SEG = 64               # échantillons le long de l'anse
HANDLE_RING = 20              # sommets par section d'anse

COLORS = [
    ("Blanc", "white", "#F4F1EA"),
    ("Noir", "black", "#171719"),
    ("Crème", "cream", "#EADFC8"),
    ("Rouge", "red", "#B3262D"),
    ("Bleu", "blue", "#1E3A63"),
    ("Vert", "green", "#225C43"),
    ("Jaune", "yellow", "#F0C33C"),
    ("Orange Elembo", "orange", "#FF5A12"),
]

# ─────────────────────────────────────────────────────────────────────────────
# Utilitaires généraux
# ─────────────────────────────────────────────────────────────────────────────
def srgb_to_linear(c):
    c = float(c)
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, linear=True):
    h = h.lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [srgb_to_linear(c) for c in rgb] if linear else rgb


def save_png(name, rgba, colorspace="sRGB", folder=TEX):
    """Enregistre un tableau RGBA (np.float/déjà orienté haut en bas) en PNG via Blender."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    # Blender stocke les pixels avec la première ligne = bas de l'image.
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).astype(np.float32).ravel())
    path = os.path.join(folder, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.filepath = path
    img.source = "FILE"
    img.reload()
    return img


def clamp(x, a, b):
    return max(a, min(b, x))


def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def bezier(p0, c1, c2, p3, n):
    """Échantillonne une cubique (p0, c1, c2, p3), extrémités comprises."""
    out = []
    for i in range(n + 1):
        t = i / n
        u = 1 - t
        out.append(
            (
                u**3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t**3 * p3[0],
                u**3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t**3 * p3[1],
            )
        )
    return out


def line(p0, p1, n):
    return [(p0[0] + (p1[0] - p0[0]) * i / n, p0[1] + (p1[1] - p0[1]) * i / n) for i in range(n + 1)]


def add_unique(out, pts):
    for p in pts:
        if not out or math.dist(out[-1], p) > 1e-8:
            out.append(p)
    return out


def resample_polyline(pts, max_seg=0.0012):
    """Rééchantillonne une polyline 2D avec une longueur de segment maximale."""
    out = []
    for a, b in zip(pts[:-1], pts[1:]):
        d = math.dist(a, b)
        n = max(1, int(math.ceil(d / max_seg)))
        for i in range(n):
            t = i / n
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
    out.append(pts[-1])
    return add_unique([], out)


def simplify_rdp(points, eps=0.00003):
    """Simplifie une polyligne en conservant sa silhouette à eps près (Ramer-Douglas-Peucker)."""
    pts = add_unique([], [(float(x), float(y)) for x, y in points])

    def dist_point_seg(p, a, b):
        ax, ay = a
        bx, by = b
        px, py = p
        abx, aby = bx - ax, by - ay
        den = abx * abx + aby * aby
        if den < 1e-18:
            return math.hypot(px - ax, py - ay)
        t = clamp(((px - ax) * abx + (py - ay) * aby) / den, 0.0, 1.0)
        return math.hypot(px - (ax + t * abx), py - (ay + t * aby))

    def simplify(sub):
        if len(sub) < 3:
            return sub
        a, b = sub[0], sub[-1]
        best_d, best_i = 0.0, -1
        for i in range(1, len(sub) - 1):
            d = dist_point_seg(sub[i], a, b)
            if d > best_d:
                best_d, best_i = d, i
        if best_d > eps and best_i > 0:
            left = simplify(sub[: best_i + 1])
            right = simplify(sub[best_i:])
            return left[:-1] + right
        return [a, b]

    return simplify(pts)


# ─────────────────────────────────────────────────────────────────────────────
# Profil de la céramique (demi-section, plan RZ)
# ─────────────────────────────────────────────────────────────────────────────
def build_body_profile():
    """Profil extérieur + bord + paroi intérieure + fond, dans cet ordre."""
    p = []
    # Fond extérieur légèrement creusé (repose sur une couronne de pied).
    p += line((0.0, 0.0025), (0.0290, 0.0025), 8)
    p += bezier((0.0290, 0.0025), (0.0325, 0.0025), (0.0341, 0.0007), (0.0350, 0.0000), 10)
    p += line((0.0350, 0.0000), (0.0361, 0.0000), 2)
    p += bezier((0.0361, 0.0000), (0.0372, 0.0000), (0.0378, 0.0011), (0.0381, 0.0038), 12)
    # Transition du pied vers la paroi, terminée dès 7 mm : le galbe imprimable
    # (7,5–87,5 mm) est ainsi un vrai cylindre de rayon constant.
    p += bezier((0.0381, 0.0038), (0.0388, 0.0048), (0.0400, 0.0058), (0.0410, 0.0070), 10)
    p += line((0.0410, 0.0070), (0.0410, 0.0875), 6)
    # Épaulement et lèvre arrondie.
    p += bezier((0.0410, 0.0875), (0.0410, 0.0920), (0.0400, 0.0942), (0.0384, 0.0950), 16)
    p += bezier((0.0384, 0.0950), (0.0378, 0.0950), (0.0372, 0.0948), (0.03685, 0.0942), 8)
    # Paroi intérieure : diamètre intérieur ≈ 74 mm.
    p += line((0.03685, 0.0942), (0.03688, 0.0860), 4)
    p += line((0.03688, 0.0860), (0.03698, 0.0220), 5)
    # Fond intérieur arrondi.
    p += bezier((0.03698, 0.0220), (0.03698, 0.0120), (0.0353, 0.0077), (0.0300, 0.0065), 16)
    p += line((0.0300, 0.0065), (0.0, 0.0064), 8)
    return [(r, min(z, OVERALL_H)) for r, z in simplify_rdp(p, 0.000035)]


BODY_PROFILE = build_body_profile()


def outer_radius_at(z):
    """Rayon extérieur interpolé sur le profil céramique (côté externe)."""
    # Le profil est parcouru du centre du dessous vers le bord puis l'intérieur.
    outer = [(r, zz) for r, zz in BODY_PROFILE if zz <= 0.0951 and r > 0.0]
    # Ne garder que la partie extérieure montante : jusqu'au premier point du bord.
    # On borne par les rayons croissants jusqu'au maximum (0,0410).
    seg = []
    for r, zz in BODY_PROFILE:
        if r <= OUTER_R + 1e-6:
            seg.append((zz, r))
        if r >= OUTER_R - 1e-6 and zz > 0.04:
            break
    pts = []
    for zz, r in seg:
        if not pts or zz >= pts[-1][0] - 1e-9:
            pts.append((zz, r))
    # interpolation monotone sur z
    pts = sorted(pts)
    zs = [a for a, _ in pts]
    rs = [b for _, b in pts]
    return float(np.interp(z, zs, rs))


def inner_profile_for_overlay():
    """Section intérieure, du bord vers le fond (normales tournées vers la cavité)."""
    p = []
    p += line((0.03685, 0.0942), (0.03688, 0.0860), 3)
    p += line((0.03688, 0.0860), (0.03698, 0.0220), 4)
    p += bezier((0.03698, 0.0220), (0.03698, 0.0120), (0.0353, 0.0077), (0.0300, 0.0065), 16)
    p += line((0.0300, 0.0065), (0.0, 0.0064), 8)
    return simplify_rdp(p, 0.000035)


def bottom_profile_for_overlay():
    """Dessous + pied extérieur jusqu'à 6 mm au-dessus du sol."""
    p = []
    p += line((0.0, 0.0025), (0.0290, 0.0025), 8)
    p += bezier((0.0290, 0.0025), (0.0325, 0.0025), (0.0341, 0.0007), (0.0350, 0.0000), 10)
    p += line((0.0350, 0.0000), (0.0361, 0.0000), 2)
    p += bezier((0.0361, 0.0000), (0.0372, 0.0000), (0.0378, 0.0011), (0.0381, 0.0038), 12)
    # Le pied visible est inclus jusqu'au ras de la surface imprimable : il peut
    # ainsi porter sa propre couleur (MAT_MUG_BOTTOM) sans laisser d'anneau blanc.
    p += bezier((0.0381, 0.0038), (0.0389, 0.0048), (0.0402, 0.0060), (0.0410, 0.0076), 10)
    return simplify_rdp(p, 0.000035)


INTERIOR_PROFILE = inner_profile_for_overlay()
BOTTOM_PROFILE = bottom_profile_for_overlay()


# ─────────────────────────────────────────────────────────────────────────────
# Maillages de révolution (corps, revêtements intérieur/dessous)
# ─────────────────────────────────────────────────────────────────────────────
def ring_coords(r, z, n=SEG):
    return [
        (r * math.sin(-math.pi + 2 * math.pi * j / n),
         -r * math.cos(-math.pi + 2 * math.pi * j / n),
         z)
        for j in range(n)
    ]


def make_object(name, verts, faces, collection):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def recalc_closed(ob):
    me = ob.data
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    me.update()


def shade_smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def set_uv(me, layer_name, uv_values, face_loop_indices):
    """uv_values : liste de (u,v) dans l'ordre des boucles de face_loop_indices."""
    if layer_name in me.uv_layers:
        layer = me.uv_layers[layer_name]
    else:
        layer = me.uv_layers.new(name=layer_name)
    for li, uv in zip(face_loop_indices, uv_values):
        layer.data[li].uv = uv


def build_revolved(name, profile_rz, collection, flip=False, close_top=False, close_bottom=False,
                   nseg=SEG):
    """Surface de révolution à partir d'un profil (r,z) ordonné.

    Le maillage possède un seul tour topologique (pas de couture dupliquée), et ses UV
    sont calculés par boucle de face pour permettre une couture U visible dans la texture.
    """
    verts = []
    ring_indices = []
    for r, z in profile_rz:
        if r <= 1e-9:
            idx = len(verts)
            verts.append((0.0, 0.0, z))
            ring_indices.append([idx])
        else:
            row = []
            for j in range(nseg):
                a = -math.pi + 2 * math.pi * j / nseg
                idx = len(verts)
                verts.append((r * math.sin(a), -r * math.cos(a), z))
                row.append(idx)
            ring_indices.append(row)
    faces = []
    for i in range(len(ring_indices) - 1):
        a, b = ring_indices[i], ring_indices[i + 1]
        if len(a) == 1 and len(b) == 1:
            continue
        if len(a) == 1:
            for j in range(nseg):
                j2 = (j + 1) % nseg
                faces.append((a[0], b[j2], b[j]))
        elif len(b) == 1:
            for j in range(nseg):
                j2 = (j + 1) % nseg
                faces.append((a[j], a[j2], b[0]))
        else:
            for j in range(nseg):
                j2 = (j + 1) % nseg
                faces.append((a[j], a[j2], b[j2], b[j]))
    if flip:
        faces = [tuple(reversed(f)) for f in faces]
    if close_top:
        top = ring_indices[0]
        if len(top) > 2:
            faces.append(tuple(top))
    if close_bottom:
        bot = ring_indices[-1]
        if len(bot) > 2:
            faces.append(tuple(reversed(bot)))
    ob = make_object(name, verts, faces, collection)
    me = ob.data
    # UV de glaçure (coordonnées physiques, répétition dans la texture).
    uv = []
    for p in me.polygons:
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            rr = math.hypot(v.x, v.y)
            if rr < 1e-8:
                u = 0.5
            else:
                a = math.atan2(v.x, -v.y)
                u = (a + math.pi) / (2 * math.pi)
            # Pour les faces qui chevauchent la couture, on décale les U proches de 0.
            us = []
            for lj in p.loop_indices:
                vv = me.vertices[me.loops[lj].vertex_index].co
                aa = math.atan2(vv.x, -vv.y)
                us.append((aa + math.pi) / (2 * math.pi))
            if max(us) - min(us) > 0.5:
                if u < 0.5:
                    u += 1.0
            uv.append((u * 13.0, v.z / GLAZE_TILE))
    set_uv(me, "UVMap", uv, [li for p in me.polygons for li in p.loop_indices])
    shade_smooth(ob)
    return ob


def build_print_surface(collection, material, nseg=SEG, rows=14):
    zs = [PRINT_Z0 + (PRINT_Z1 - PRINT_Z0) * i / rows for i in range(rows + 1)]
    verts = []
    rings = []
    for z in zs:
        r = outer_radius_at(z) + PRINT_R_OFFSET
        row = []
        for j in range(nseg):
            a = -math.pi + 2 * math.pi * j / nseg
            idx = len(verts)
            verts.append((r * math.sin(a), -r * math.cos(a), z))
            row.append(idx)
        rings.append(row)
    faces = []
    for i in range(rows):
        for j in range(nseg):
            j2 = (j + 1) % nseg
            faces.append((rings[i][j], rings[i][j2], rings[i + 1][j2], rings[i + 1][j]))
    ob = make_object("MUG_PRINT_SURFACE", verts, faces, collection)
    me = ob.data
    art_uv = []
    glaze_uv = []
    # U = tour (0/1 derrière l'anse). V = hauteur du galbe (0 bas, 1 haut).
    for p in me.polygons:
        # Coordonnées angulaires brutes des boucles.
        raw = []
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a = math.atan2(v.x, -v.y)
            raw.append(((a + math.pi) / (2 * math.pi), v))
        if max(u for u, _ in raw) - min(u for u, _ in raw) > 0.5:
            adjusted = [(u + 1.0 if u < 0.5 else u, v) for u, v in raw]
        else:
            adjusted = raw
        for u, v in adjusted:
            art_uv.append((u, (v.z - PRINT_Z0) / (PRINT_Z1 - PRINT_Z0)))
            glaze_uv.append((u * 13.0, (v.z - PRINT_Z0) / GLAZE_TILE))
    loop_ids = [li for p in me.polygons for li in p.loop_indices]
    set_uv(me, "UVMap", art_uv, loop_ids)
    set_uv(me, "UV_GLAZE", glaze_uv, loop_ids)
    me.uv_layers.active = me.uv_layers["UVMap"]
    shade_smooth(ob)
    ob.data.materials.append(material)
    # Normales extérieures : le sens de bobinage est choisi pour cela.
    ob["zone"] = "printable_wrap"
    return ob


def offset_along_normals(ob, amount):
    """Décale une surface le long de ses normales (décalque céramique sans z-fighting)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * amount
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()


# ─────────────────────────────────────────────────────────────────────────────
# Anse C ergonomique
# ─────────────────────────────────────────────────────────────────────────────
def catmull_rom_open(ctrl, n):
    pts = [Vector(p) for p in ctrl]
    ext = [pts[0] * 2 - pts[1]] + pts + [pts[-1] * 2 - pts[-2]]
    out = []
    for i in range(1, len(ext) - 2):
        p0, p1, p2, p3 = ext[i - 1], ext[i], ext[i + 1], ext[i + 2]
        steps = n if i < len(ext) - 3 else n
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            p = 0.5 * (
                (2 * p1)
                + (-p0 + p2) * t
                + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                + (-p0 + 3 * p1 - 3 * p2 + p3) * t3
            )
            out.append(p)
    out.append(pts[-1])
    return out


def build_handle(collection, material):
    # Contrôle de l'anse dans le plan YZ (X=0). Y+ = arrière (côté anse).
    # Les extrémités pénètrent la paroi céramique sans entrer dans la cavité intérieure.
    ctrl = [
        (0.0, 0.0390, 0.0740),
        (0.0, 0.0520, 0.0745),
        (0.0, 0.0660, 0.0720),
        (0.0, 0.0740, 0.0620),
        (0.0, 0.0750, 0.0485),
        (0.0, 0.0700, 0.0350),
        (0.0, 0.0550, 0.0255),
        (0.0, 0.0390, 0.0230),
    ]
    path = catmull_rom_open(ctrl, 8)
    # Longueur cumulée pour les UV.
    arcs = [0.0]
    for a, b in zip(path[:-1], path[1:]):
        arcs.append(arcs[-1] + (b - a).length)
    total = arcs[-1]
    # base orthonormale par échantillon
    verts = []
    rings = []
    ring_uvs = []
    for i, (p, s) in enumerate(zip(path, arcs)):
        t = i / max(1, len(path) - 1)
        if i == 0:
            tangent = (path[1] - path[0]).normalized()
        elif i == len(path) - 1:
            tangent = (path[-1] - path[-2]).normalized()
        else:
            tangent = (path[i + 1] - path[i - 1]).normalized()
        xaxis = Vector((1.0, 0.0, 0.0))
        b2 = tangent.cross(xaxis)
        if b2.length < 1e-8:
            b2 = Vector((0.0, 1.0, 0.0))
        b2.normalize()
        # Élargissement progressif aux points d'ancrage : la main courante se fond
        # dans la paroi au lieu de finir en tube coupé.
        edge = min(t, 1.0 - t)
        scale = 1.0 + 0.20 * math.exp(-((edge / 0.105) ** 2))
        rx = 0.00500 * scale
        rn = 0.00320 * scale
        row = []
        row_uv = []
        for k in range(HANDLE_RING):
            a = 2 * math.pi * k / HANDLE_RING
            ca, sa = math.cos(a), math.sin(a)
            # section super-elliptique douce : galet céramique aplati
            x = rx * math.copysign(abs(ca) ** (2 / 2.35), ca)
            y = rn * math.copysign(abs(sa) ** (2 / 2.35), sa)
            v = p + xaxis * x + b2 * y
            row.append(len(verts))
            verts.append((v.x, v.y, v.z))
            row_uv.append((s / 0.020, (a / (2 * math.pi)) * 0.027 / 0.020))
        rings.append(row)
        ring_uvs.append(row_uv)
    faces = []
    for i in range(len(rings) - 1):
        for k in range(HANDLE_RING):
            k2 = (k + 1) % HANDLE_RING
            faces.append((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    # Bouchons cachés dans l'épaisseur de la céramique.
    faces.append(tuple(reversed(rings[0])))
    faces.append(tuple(rings[-1]))
    ob = make_object("MUG_HANDLE", verts, faces, collection)
    recalc_closed(ob)
    me = ob.data
    # UV par boucle : u = longueur de chemin, v = angle autour de la section.
    loop_uv = []
    for p in me.polygons:
        if len(p.vertices) == HANDLE_RING:  # bouchon
            for li in p.loop_indices:
                loop_uv.append((0.0, 0.0))
            continue
        for li in p.loop_indices:
            vidx = me.loops[li].vertex_index
            # retrouver le bloc de sommet (i,k)
            i = vidx // HANDLE_RING
            k = vidx % HANDLE_RING
            loop_uv.append(ring_uvs[i][k])
    set_uv(me, "UVMap", loop_uv, [li for p in me.polygons for li in p.loop_indices])
    shade_smooth(ob)
    ob.data.materials.append(material)
    ob["handle_side"] = "back"
    return ob


# ─────────────────────────────────────────────────────────────────────────────
# Textures procédurales
# ─────────────────────────────────────────────────────────────────────────────
def periodic_noise(n, seed=12, freqs=(2, 3, 5, 8, 13, 21)):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / n
    h = np.zeros((n, n), dtype=np.float64)
    for f in freqs:
        for _ in range(3):
            kx = int(rng.integers(-f, f + 1))
            ky = int(rng.integers(-f, f + 1))
            if kx == 0 and ky == 0:
                continue
            h += (1.0 / math.hypot(kx, ky)) * np.cos(2 * np.pi * (kx * x + ky * y) + rng.uniform(0, 2 * np.pi))
    h += 0.16 * rng.standard_normal((n, n))
    h -= h.min()
    h /= max(1e-9, h.max())
    return h


def make_glaze_normal(res=256):
    """Normal map de micro-grain de glaçure, périodique (aucune couture visible)."""
    h = periodic_noise(res, 9)
    # gradient périodique
    gy, gx = np.gradient(h)
    gx = (gx + np.roll(gx, -1, axis=1)) * 0.5
    gy = (gy + np.roll(gy, -1, axis=0)) * 0.5
    strength = 3.4
    nx = -gx * strength
    ny = -gy * strength
    nz = np.ones_like(h)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / norm, ny / norm, nz / norm], axis=-1)
    rgba = np.concatenate([rgb * 0.5 + 0.5, np.ones_like(h)[..., None]], axis=-1)
    img = save_png("mug_glaze_normal", rgba, "Non-Color")
    return img


def make_print_placeholder():
    # 8 × 8 entièrement transparent : la tasse est vierge au chargement.
    rgba = np.zeros((8, 8, 4), dtype=np.float32)
    img = save_png("print_placeholder", rgba, "sRGB")
    return img

def make_studio_backdrop(res=1400):
    """Fond studio flou, sans raccord ni horizon, pour les aperçus e-commerce.

    Un dégradé chaud, légèrement éclairé derrière le produit, remplace un cyclorama :
    l'ombre de contact est rendue séparément par un shadow catcher Cycles.
    """
    yy, xx = np.mgrid[0:res, 0:res].astype(np.float64)
    x = xx / (res - 1)
    y = yy / (res - 1)
    nx = (x - 0.5) * 2.0
    ny = (y - 0.52) * 2.0
    top = np.array(srgb_to_linear_hex("#776E63"))
    bottom = np.array(srgb_to_linear_hex("#C8C0B6"))
    # Léger dégradé vertical (haut plus profond, bas plus lumineux).
    t = np.clip(y, 0, 1) ** 0.82
    base = top[None, None, :] * (1 - t[..., None]) + bottom[None, None, :] * t[..., None]
    # Halo de studio derrière le produit, très diffus.
    glow = np.exp(-((nx / 0.95) ** 2 + ((ny - 0.10) / 0.88) ** 2) * 1.8)
    warm = np.array(srgb_to_linear_hex("#E4DDD3"))
    base = base * (1 - 0.32 * glow[..., None]) + warm[None, None, :] * (0.32 * glow[..., None])
    # Vignette périphérique.
    radius = np.sqrt(nx * nx + (ny * 0.86) ** 2)
    vt = np.clip((radius - 0.55) / (1.45 - 0.55), 0, 1)
    vs = vt * vt * (3 - 2 * vt)
    vignette = 0.73 + 0.27 * (1 - vs)
    rgb = base * vignette[..., None]
    # Dithering imperceptible contre le banding de dégradé.
    rng = np.random.default_rng(41)
    rgb = np.clip(rgb + rng.normal(0, 0.0015, rgb.shape), 0, 1)
    # Les pixels d'image sont stockés en sRGB dans le PNG.
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.maximum(rgb, 0), 1 / 2.4) - 0.055)
    rgba = np.concatenate([np.clip(srgb, 0, 1), np.ones((res, res, 1))], axis=-1)
    return save_png("studio_backdrop", rgba, "sRGB")


def srgb_to_linear_hex(h):
    h = h.lstrip("#")
    return [srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)]


# ─────────────────────────────────────────────────────────────────────────────
# Matériaux PBR glTF
# ─────────────────────────────────────────────────────────────────────────────
def node_uv(nt, name, loc):
    n = nt.nodes.new("ShaderNodeUVMap")
    n.uv_map = name
    n.location = loc
    return n


def make_ceramic(name, hex_color, roughness, normal_img, uv_layer="UVMap",
                 coat=0.35, coat_rough=0.055):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    nodes = nt.nodes
    bsdf = nodes.get("Principled BSDF")
    rgb = hex_rgb(hex_color)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["IOR"].default_value = 1.50
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    bsdf.inputs["Coat Weight"].default_value = coat
    bsdf.inputs["Coat Roughness"].default_value = coat_rough
    bsdf.inputs["Coat IOR"].default_value = 1.50
    if normal_img is not None:
        uvn = node_uv(nt, uv_layer, (-950, -260))
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = normal_img
        tex.interpolation = "Linear"
        tex.extension = "REPEAT"
        tex.location = (-700, -260)
        nm = nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = 0.14
        nm.location = (-370, -260)
        nt.links.new(uvn.outputs["UV"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["base_color_hex"] = hex_color
    m["usage"] = name
    return m


def make_print_material(print_img, normal_img):
    m = bpy.data.materials.new("MAT_MUG_PRINT")
    m.use_nodes = True
    m.use_backface_culling = True
    m.surface_render_method = "BLENDED"
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.235
    bsdf.inputs["IOR"].default_value = 1.50
    bsdf.inputs["Specular IOR Level"].default_value = 0.5
    bsdf.inputs["Coat Weight"].default_value = 0.22
    bsdf.inputs["Coat Roughness"].default_value = 0.08
    # Texture d'impression : UVMap (UV0)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = print_img
    tex.interpolation = "Linear"
    tex.extension = "REPEAT"
    tex.location = (-780, 300)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    # Grain de glaçure : UV_GLAZE (UV1), indépendant du visuel.
    uvn = node_uv(nt, "UV_GLAZE", (-1050, -280))
    ntex = nt.nodes.new("ShaderNodeTexImage")
    ntex.image = normal_img
    ntex.interpolation = "Linear"
    ntex.extension = "REPEAT"
    ntex.location = (-820, -280)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.15
    nm.location = (-480, -280)
    nt.links.new(uvn.outputs["UV"], ntex.inputs["Vector"])
    nt.links.new(ntex.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["print_zone"] = "full_wrap"
    m["base_color_hex"] = "#FFFFFF"
    return m


# ─────────────────────────────────────────────────────────────────────────────
# Processus principal
# ─────────────────────────────────────────────────────────────────────────────
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.fps = 24
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


def create_product(scene):
    product = bpy.data.collections.new("ELEMBO_MUG")
    scene.collection.children.link(product)
    root = bpy.data.objects.new("ELEMBO_MUG", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.02
    product.objects.link(root)

    normal_img = make_glaze_normal()
    placeholder = make_print_placeholder()

    mats = {
        "body": make_ceramic("MAT_MUG_CERAMIC", "#F4F1EA", 0.105, normal_img, "UVMap", 0.50, 0.025),
        "interior": make_ceramic("MAT_MUG_INTERIOR", "#F4F1EA", 0.17, normal_img, "UVMap", 0.35, 0.05),
        "handle": make_ceramic("MAT_MUG_HANDLE", "#F4F1EA", 0.105, normal_img, "UVMap", 0.50, 0.025),
        "bottom": make_ceramic("MAT_MUG_BOTTOM", "#F4F1EA", 0.26, normal_img, "UVMap", 0.18, 0.12),
        "print": make_print_material(placeholder, normal_img),
    }

    body = build_revolved("MUG_BODY", BODY_PROFILE, product, nseg=SEG)
    recalc_closed(body)
    body.data.materials.append(mats["body"])
    body["role"] = "ceramic_body"
    body["outer_diameter_mm"] = 82.0
    body["height_mm"] = 95.0

    interior = build_revolved("MUG_INTERIOR", INTERIOR_PROFILE, product, nseg=SEG)
    # Paroi intérieure visible : ses normales doivent pointer vers la cavité.
    # Le profil est ordonné du bord vers le fond ; le bobinage de build_revolved
    # donne déjà des normales vers l'intérieur pour ce sens.
    bn = interior.data.polygons[len(interior.data.polygons) // 2].normal
    sample = interior.data.polygons[len(interior.data.polygons) // 2].center
    outward = Vector((sample.x, sample.y, 0))
    if outward.length > 1e-9 and bn.dot(outward) > 0:
        # normales extérieures : retourner
        bm = bmesh.new()
        bm.from_mesh(interior.data)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(interior.data)
        bm.free()
    offset_along_normals(interior, 0.00010)
    interior.data.materials.append(mats["interior"])
    interior["role"] = "interior_surface"
    interior["inner_diameter_mm"] = 74.0

    bottom = build_revolved("MUG_BOTTOM", BOTTOM_PROFILE, product, nseg=SEG)
    # Le dessous est construit du centre vers l'extérieur : le bobinage donne des normales
    # tournées vers le bas (visibles depuis le dessous). Aucun retournement.
    offset_along_normals(bottom, -0.00008)
    bottom.data.materials.append(mats["bottom"])
    bottom["role"] = "bottom_and_foot"

    print_surface = build_print_surface(product, mats["print"])
    handle = build_handle(product, mats["handle"])
    handle["role"] = "ceramic_handle"

    for ob in (body, interior, bottom, print_surface, handle):
        ob.parent = root
        ob.matrix_parent_inverse.identity()
        ob.data.name = ob.name
    root["elembo_version"] = "1.0"
    root["product_id"] = "mug-11oz"
    root["units"] = "meters"
    root["dimensions_mm"] = {
        "height": 95.0,
        "outer_diameter": 82.0,
        "inner_diameter": 74.0,
        "wall_thickness": 4.0,
        "print_width": 257.6,
        "print_height": 80.0,
    }
    root["colors"] = {cid: hexv for _, cid, hexv in COLORS}
    root["color_names"] = {cid: name for name, cid, _ in COLORS}
    root["default_color"] = "#F4F1EA"
    root["fabric_materials"] = []  # compatibilité avec les diagnostics Elembo
    root["ceramic_materials"] = ["MAT_MUG_CERAMIC", "MAT_MUG_INTERIOR", "MAT_MUG_HANDLE", "MAT_MUG_BOTTOM"]
    root["print_material"] = "MAT_MUG_PRINT"
    root["handle_center_u"] = 0.0
    root["front_center_u"] = 0.5
    root["print_mesh"] = "MUG_PRINT_SURFACE"
    root["uv_convention"] = "U=circumference, front U=0.5, handle/back seam U=0/1; glTF V=0 at rim, V=1 at foot"
    root["front_axis"] = "+Z"
    root["handle_axis"] = "-Z"
    root["up_axis"] = "+Y"
    root["origin"] = "centre of the base, on the floor"

    print_surface["print_width_mm"] = 257.6
    print_surface["print_height_mm"] = 80.0
    print_surface["print_aspect"] = 3.22
    print_surface["recommended_texture_px"] = [3072, 954]
    print_surface["uv_set"] = "TEXCOORD_0 (UVMap)"
    print_surface["glaze_uv_set"] = "TEXCOORD_1 (UV_GLAZE)"
    print_surface["front_center_u"] = 0.5
    print_surface["left_center_u"] = 0.25
    print_surface["right_center_u"] = 0.75
    print_surface["back_center_u"] = 0.0
    print_surface["handle_exclusion_u"] = [[0.0, 0.035], [0.965, 1.0]]
    print_surface["handle_exclusion_mm"] = [18.0, 78.0]

    return root, product, mats, normal_img, placeholder


# ─────────────────────────────────────────────────────────────────────────────
# Studio de rendu Cycles, caméras et aperçus
# ─────────────────────────────────────────────────────────────────────────────
def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def make_simple_material(name, hex_color, roughness=0.5, emission_strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    rgb = hex_rgb(hex_color)
    bsdf.inputs["Base Color"].default_value = (*rgb, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    if emission_strength:
        bsdf.inputs["Emission Color"].default_value = (*rgb, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return m


def setup_compositor(scene, backdrop_img):
    """Compose l'ombre de contact transparente sur le fond studio peint."""
    scene.use_nodes = True
    tree = scene.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    rl = tree.nodes.new("CompositorNodeRLayers")
    rl.location = (-700, 0)
    img = tree.nodes.new("CompositorNodeImage")
    img.image = backdrop_img
    img.location = (-700, 320)
    scale = tree.nodes.new("CompositorNodeScale")
    scale.space = "RENDER_SIZE"
    scale.frame_method = "STRETCH"
    scale.location = (-450, 320)
    tree.links.new(img.outputs["Image"], scale.inputs["Image"])
    over = tree.nodes.new("CompositorNodeAlphaOver")
    over.location = (-80, 200)
    tree.links.new(scale.outputs["Image"], over.inputs[1])
    tree.links.new(rl.outputs["Image"], over.inputs[2])
    # Micro courbe de contraste : garde le blanc de l'émail sans l'écraser.
    curve = tree.nodes.new("CompositorNodeCurveRGB")
    curve.location = (170, 120)
    mapping = curve.mapping
    mapping.initialize()
    for i, (x, y) in enumerate([(0.08, 0.07), (0.24, 0.215), (0.58, 0.60), (0.90, 0.925)]):
        if i < len(mapping.curves[0].points):
            mapping.curves[0].points[i].location = (x, y)
        else:
            mapping.curves[0].points.new(x, y)
    mapping.update()
    tree.links.new(over.outputs["Image"], curve.inputs["Image"])
    comp = tree.nodes.new("CompositorNodeComposite")
    comp.location = (420, 120)
    tree.links.new(curve.outputs["Image"], comp.inputs["Image"])


def create_studio(scene):
    studio = bpy.data.collections.new("STUDIO")
    scene.collection.children.link(studio)

    # Shadow catcher : sol invisible, ombre portée conservée dans l'alpha puis composée
    # sur le fond dégradé (setup_compositor).
    sc_me = bpy.data.meshes.new("STUDIO_SHADOW_CATCHER")
    sc_me.from_pydata([(-2, -2, 0), (2, -2, 0), (2, 2, 0), (-2, 2, 0)], [], [(0, 1, 2, 3)])
    sc_me.update()
    floor = bpy.data.objects.new("STUDIO_SHADOW_CATCHER", sc_me)
    studio.objects.link(floor)
    floor.location = (0, 0, -0.00015)
    floor.is_shadow_catcher = True
    floor["studio_only"] = True

    # Lumière principale : boîte à lumière verticale à gauche.
    def area(name, loc, target, energy, sx, sy, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.shape = "RECTANGLE"
        ld.size = sx
        ld.size_y = sy
        ld.color = color
        ob = bpy.data.objects.new(name, ld)
        studio.objects.link(ob)
        ob.location = loc
        look_at(ob, target)
        ob["studio_only"] = True
        return ob

    area("LIGHT_KEY", (-0.31, -0.30, 0.40), (0, 0, 0.075), 7.5, 0.25, 0.42, (1.0, 0.975, 0.94))
    area("LIGHT_FILL", (0.34, -0.22, 0.20), (0, 0, 0.07), 0.30, 0.5, 0.5, (0.92, 0.96, 1.0))
    area("LIGHT_RIM", (0.16, 0.31, 0.33), (0, 0, 0.075), 4.0, 0.16, 0.28, (1.0, 0.99, 0.96))
    area("LIGHT_TOP", (0.02, -0.02, 0.58), (0, 0, 0.06), 0.8, 0.4, 0.4, (1.0, 1.0, 1.0))
    area("LIGHT_STRIP", (-0.16, -0.33, 0.14), (0, 0, 0.055), 1.4, 0.04, 0.34, (1.0, 1.0, 1.0))

    # Drapeaux de studio : invisibles à la caméra, visibles uniquement dans les reflets.
    def studio_flag(name, loc, target, width, height, color):
        me = bpy.data.meshes.new(name)
        hw, hh = width / 2, height / 2
        me.from_pydata([(-hw, -hh, 0), (hw, -hh, 0), (hw, hh, 0), (-hw, hh, 0)], [], [(0, 1, 2, 3)])
        me.update()
        ob = bpy.data.objects.new(name, me)
        studio.objects.link(ob)
        ob.location = loc
        direction = Vector(target) - Vector(loc)
        ob.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
        mat = make_simple_material("MAT_" + name, color, roughness=0.9)
        ob.data.materials.append(mat)
        ob.visible_camera = False
        ob.visible_diffuse = False
        ob.visible_transmission = False
        ob.visible_volume_scatter = False
        ob.visible_shadow = False
        ob["studio_only"] = True
        return ob

    studio_flag("FLAG_DARK_RIGHT", (0.49, -0.20, 0.23), (0, 0, 0.065), 0.60, 0.85, "#181410")
    studio_flag("FLAG_DARK_LEFT", (-0.54, 0.16, 0.22), (0, 0, 0.065), 0.45, 0.75, "#211B16")

    # Environnement basse intensité (reflets doux), sans HDRI externe.
    world = bpy.data.worlds.new("STUDIO_WORLD")
    world.use_nodes = True
    nt = world.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (*hex_rgb("#BEB5A9"), 1.0)
    bg.inputs["Strength"].default_value = 0.28
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    scene.world = world

    target = bpy.data.objects.new("CAM_TARGET", None)
    studio.objects.link(target)
    target.location = (0, 0, 0.0495)
    target.empty_display_type = "PLAIN_AXES"
    target.empty_display_size = 0.012
    target.hide_render = True
    target["studio_only"] = True

    def camera(name, loc, target_loc, lens=85.0, sensor=36.0, ortho=None):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens
        cd.sensor_width = sensor
        cd.sensor_fit = "AUTO"
        if ortho is not None:
            cd.type = "ORTHO"
            cd.ortho_scale = ortho
        cd.dof.use_dof = False
        ob = bpy.data.objects.new(name, cd)
        studio.objects.link(ob)
        ob.location = loc
        look_at(ob, target_loc)
        ob["studio_only"] = True
        return ob

    t_center = (0.0, 0.0, 0.0495)
    camera("CAM_FRONT", (0.0, -0.360, 0.125), t_center, lens=100.0)
    camera("CAM_BACK", (0.072, 0.352, 0.130), t_center, lens=100.0)
    # Trois-quarts : angle de 65° côté anse pour montrer à la fois la face imprimée
    # et le profil de l'anse, avec une marge à droite.
    camera("CAM_THREE_QUARTER", (0.360, -0.200, 0.170), (0.006, 0.0, 0.052), lens=82.0)
    camera("CAM_HANDLE", (0.285, 0.228, 0.145), (0.0, 0.014, 0.057), lens=72.0)
    camera("CAM_TOP", (0.078, -0.160, 0.335), (0.0, 0.0, 0.052), lens=85.0)
    camera("CAM_PRINT", (0.0, -0.50, 0.0495), (0.0, 0.0, 0.0495), ortho=0.132)

    scene.camera = bpy.data.objects["CAM_FRONT"]

    # Rendu Cycles studio.
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = RENDER_SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.denoiser = "OPENIMAGEDENOISE"
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 8
    scene.cycles.transparent_max_bounces = 8
    scene.render.film_transparent = True
    scene.render.use_file_extension = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.image_settings.color_depth = "8"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1500
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = -0.40
    scene.render.use_persistent_data = True
    scene.render.fps = 24
    backdrop = make_studio_backdrop()
    setup_compositor(scene, backdrop)
    return studio


def render_view(scene, camera_name, path, width, height, samples):
    old = (scene.render.resolution_x, scene.render.resolution_y, scene.cycles.samples)
    scene.camera = bpy.data.objects[camera_name]
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.cycles.samples = samples
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("Rendu :", os.path.relpath(path, ROOT), flush=True)
    scene.render.resolution_x, scene.render.resolution_y, scene.cycles.samples = old


def find_chrome():
    """Localise un navigateur Chromium pour rasteriser les gabarits UV (optionnel)."""
    candidates = [
        os.environ.get("CHROME_PATH", ""),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome") or "",
        shutil.which("google-chrome-stable") or "",
        shutil.which("chromium") or "",
        shutil.which("chromium-browser") or "",
    ]
    for candidate in candidates:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


def render_uv_templates():
    """Rasterise les deux gabarits UV depuis uv-template.html (Chrome headless).

    Le HTML est fourni à côté du .blend : il contient toutes les cotes et les zones.
    Si aucun Chromium n'est disponible, les PNG déjà livrés sont conservés.
    """
    if not DO_TEMPLATES:
        return
    page = os.path.join(OUT, "uv-template.html")
    if not os.path.exists(page):
        print("Gabarits UV : uv-template.html introuvable", flush=True)
        return
    chrome = find_chrome()
    if not chrome:
        print("Gabarits UV : Chrome/Chromium absent — PNG existants conservés", flush=True)
        return
    url = "file://" + page.replace(" ", "%20")
    profile = tempfile.mkdtemp(prefix="elembo-chrome-")
    try:
        for mode, height, output in [
            ("print", "954", "uv-mug-print.png"),
            ("zones", "1200", "uv-mug-zones.png"),
        ]:
            dest = os.path.join(OUT, output)
            cmd = [
                chrome,
                "--headless=new",
                "--disable-gpu",
                "--no-sandbox",
                "--no-first-run",
                "--no-default-browser-check",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                f"--window-size=3072,{height}",
                f"--user-data-dir={profile}",
                "--virtual-time-budget=1500",
                f"--screenshot={dest}",
                f"{url}?mode={mode}",
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            if result.returncode != 0 or not os.path.exists(dest):
                print("Gabarits UV : échec Chrome pour", mode, result.stderr[-400:], flush=True)
            else:
                print("Gabarit UV :", os.path.relpath(dest, ROOT), flush=True)
    finally:
        shutil.rmtree(profile, ignore_errors=True)


def render_print_preview(scene):
    """Rendu de contrôle de la surface imprimable avec le gabarit posé à plat.

    Le visuel n'est appliqué que pour ce rendu, après l'enregistrement du .blend.
    """
    if not DO_PREVIEWS:
        return
    # Texture de contrôle lisible sur la tasse : carte des zones saturée.
    template = os.path.join(QC, "print-zone-map.png")
    if not os.path.exists(template):
        template = os.path.join(OUT, "uv-mug-print.png")
    if not os.path.exists(template):
        return
    mat = bpy.data.materials.get("MAT_MUG_PRINT")
    if not mat:
        return
    node = None
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and n.image.name.startswith("print_"):
            node = n
            break
    if node is None:
        return
    old = node.image
    test = bpy.data.images.load(template)
    node.image = test
    scene.cycles.samples = max(32, RENDER_SAMPLES // 2)
    render_view(scene, "CAM_PRINT", os.path.join(OUT, "preview-print.png"),
                int(1200 * float(OPT.get("scale", "1.0"))),
                int(1500 * float(OPT.get("scale", "1.0"))),
                max(32, RENDER_SAMPLES // 2))
    node.image = old
    bpy.data.images.remove(test, do_unlink=True)


def render_previews(scene):
    scale = float(OPT.get("scale", "1.0"))
    if not DO_PREVIEWS:
        return
    w, h = int(1200 * scale), int(1500 * scale)
    render_view(scene, "CAM_FRONT", os.path.join(OUT, "preview-front.png"), w, h, RENDER_SAMPLES)
    render_view(scene, "CAM_BACK", os.path.join(OUT, "preview-back.png"), w, h, RENDER_SAMPLES)
    render_view(scene, "CAM_THREE_QUARTER", os.path.join(OUT, "preview-three-quarter.png"), w, h, RENDER_SAMPLES)
    render_view(scene, "CAM_TOP", os.path.join(OUT, "preview-top.png"), int(1200 * scale), int(1200 * scale), RENDER_SAMPLES)
    render_view(scene, "CAM_HANDLE", os.path.join(OUT, "preview-handle.png"), w, h, RENDER_SAMPLES)
    render_print_preview(scene)


def mesh_stats(ob):
    me = ob.data
    me.calc_loop_triangles()
    return len(me.loop_triangles), len(me.vertices)


def compute_capacity():
    """Volume intérieur jusqu'au bord (ml) par intégration conique du profil."""
    prof = list(reversed(INTERIOR_PROFILE))  # du fond vers le bord
    # limiter au-dessus du fond : jusqu'au dernier point (bord)
    vol = 0.0
    for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
        dz = z1 - z0
        # rayon intérieur effectif ; on ne compte que le volume au-dessus du fond
        # et sous le bord. Les deux extrémités axis (r=0) sont traitées naturellement.
        vol += math.pi * dz * (r0 * r0 + r0 * r1 + r1 * r1) / 3.0
    # Enlever le volume du pied sous le fond (la cavité commence au-dessus du fond) :
    # l'intégration du profil intérieur ne descend pas sous 6,4 mm, donc c'est bon.
    return abs(vol) * 1e6


def main():
    scene = reset_scene()
    root, product, mats, normal_img, placeholder = create_product(scene)
    total_tris = 0
    tri_by_object = {}
    for ob in product.objects:
        if ob.type == "MESH":
            tris, _ = mesh_stats(ob)
            tri_by_object[ob.name] = tris
            total_tris += tris

    # Dimensions mesurées.
    deps = bpy.context.evaluated_depsgraph_get()
    points = []
    for ob in product.objects:
        if ob.type != "MESH":
            continue
        for v in ob.data.vertices:
            points.append(ob.matrix_world @ v.co)
    lo = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    hi = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    dims_mm = {
        "width_x": round((hi.x - lo.x) * 1000, 2),
        "depth_y_with_handle": round((hi.y - lo.y) * 1000, 2),
        "height_z": round((hi.z - lo.z) * 1000, 2),
        "min": [round(v * 1000, 2) for v in lo],
        "max": [round(v * 1000, 2) for v in hi],
    }
    cap_ml = compute_capacity()
    print("Dimensions mesurées :", dims_mm)
    print("Capacité jusqu'au bord : %.1f ml" % cap_ml)
    print("Triangles :", tri_by_object, "total", total_tris)

    # Métadonnées de zones partagées avec l'intégrateur.
    UV_RECTS = {
        "full_wrap": {
            "u": [0.0, 1.0], "v_gltf": [0.0, 1.0], "safe_v_gltf": [0.05, 0.95],
            "note": "Single continuous editing surface. No horizontal cut; U=0 and U=1 are the same seam.",
        },
        "front": {
            "u": [0.375, 0.625], "safe_u": [0.3905, 0.6095], "v_gltf": [0.05, 0.95],
            "center_u": 0.5, "center_v_gltf": 0.5, "center_deg": 0,
            "center_world_mm": [0.0, 47.5, 41.1],
            "zone_band_mm": [64.4, 80.0], "safe_content_mm": [56.4, 72.0],
        },
        "back": {
            "u": [[0.0, 0.125], [0.875, 1.0]], "safe_u": [[0.0, 0.1095], [0.8905, 1.0]],
            "v_gltf": [0.05, 0.95], "center_u": 0.0, "center_v_gltf": 0.5, "center_deg": 180,
            "center_world_mm": [0.0, 47.5, -41.1], "split_at_seam": True,
            "note": "Split by the handle: use both side lobes, or a design that intentionally crosses the seam.",
        },
        "left": {
            "u": [0.125, 0.375], "safe_u": [0.1405, 0.3595], "v_gltf": [0.05, 0.95],
            "center_u": 0.25, "center_v_gltf": 0.5, "center_deg": -90,
            "center_world_mm": [-41.1, 47.5, 0.0],
            "zone_band_mm": [64.4, 80.0], "safe_content_mm": [56.4, 72.0],
        },
        "right": {
            "u": [0.625, 0.875], "safe_u": [0.6405, 0.8595], "v_gltf": [0.05, 0.95],
            "center_u": 0.75, "center_v_gltf": 0.5, "center_deg": 90,
            "center_world_mm": [41.1, 47.5, 0.0],
            "zone_band_mm": [64.4, 80.0], "safe_content_mm": [56.4, 72.0],
        },
    }
    zones = {
        "product": "elembo-mug",
        "version": "1.0",
        "units": "meters",
        "uv": {
            "u": "circumference; seam at back under the handle; U=0/1",
            "v_gltf": "print height; glTF V=0 at the TOP/rim, V=1 at the BOTTOM/foot",
            "image_orientation": "image top = rim side, image bottom = foot side",
            "u_increases": "toward the viewer's right when looking at the front",
            "front_u": 0.5,
            "left_u": 0.25,
            "right_u": 0.75,
            "back_u": 0.0,
            "texture_aspect": 3072 / 954,
            "recommended_texture_px": [3072, 954],
            "pixels_per_mm_at_recommended": round(3072 / 257.6, 3),
            "min_vertical_padding_mm": 4.0,
            "horizontal_padding": "none: U=0/1 is a continuous wrap and must stay seamless",
        },
        "print_surface": {
            "mesh": "MUG_PRINT_SURFACE",
            "material": "MAT_MUG_PRINT",
            "width_mm": 257.6,
            "height_mm": 80.0,
            "z0_mm": PRINT_Z0 * 1000,
            "z1_mm": PRINT_Z1 * 1000,
            "recommended_texture_px": [3072, 954],
        },
        "zones": UV_RECTS,
        "handle": {
            "center_u": 0.0,
            "center_deg": 180,
            "axis": "-Z",
            "mesh": "MUG_HANDLE",
            "material": "MAT_MUG_HANDLE",
            "exclusion_u": [[0.0, 0.035], [0.965, 1.0]],
            "exclusion_v_gltf": [0.119, 0.870],
            "exclusion_height_mm": [18.0, 78.0],
            "never_print_material": True,
        },
        "colors": [{"name": n, "id": i, "hex": h} for n, i, h in COLORS],
        "materials": {
            "MAT_MUG_CERAMIC": "extérieur et bord",
            "MAT_MUG_INTERIOR": "paroi intérieure et fond intérieur",
            "MAT_MUG_HANDLE": "anse",
            "MAT_MUG_BOTTOM": "dessous et pied",
            "MAT_MUG_PRINT": "impression transparente plein tour",
        },
        "dimensions_mm": {
            **dims_mm,
            "body_outer_diameter": 82.0,
            "outer_diameter_including_print": 82.2,
            "inner_diameter_lip": 73.7,
            "inner_diameter_mid_wall": 74.0,
            "wall_thickness": 4.0,
            "foot_contact_diameter": 72.2,
            "printable_width": 257.6,
            "printable_height": 80.0,
            "printable_z_above_base": [7.5, 87.5],
            "handle_reach_above_wall": 37.5,
        },
        "capacity": {
            "nominal_ml": 330,
            "brimful_ml": round(cap_ml, 1),
            "nominal_headspace_mm": round(((cap_ml - 330) * 1e-6 / (math.pi * 0.0370**2)) * 1000 if cap_ml > 330 else 0, 1),
        },
        "coordinate_system": {
            "up": "+Y",
            "front": "+Z",
            "handle": "-Z",
            "origin": "centre of the base, on the floor",
            "units": "meters",
        },
        "texture_usage": {
            "print_material": "MAT_MUG_PRINT",
            "basecolor_uv_set": "TEXCOORD_0 / UVMap",
            "normal_uv_set": "TEXCOORD_1 / UV_GLAZE",
            "flipY": False,
            "wrapS": "REPEAT",
            "wrapT": "CLAMP_TO_EDGE",
            "colorSpace": "SRGBColorSpace",
        },
        "triangles": tri_by_object,
        "total_triangles": total_tris,
    }

    # Sauvegarde GLB (uniquement la hiérarchie produit).
    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in [root, *product.objects]:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb_path = os.path.join(GLB_DIR, "elembo-mug.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
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
        export_optimize_animation_size=False,
    )

    # JSON publics : zones et UV.
    with open(os.path.join(OUT, "zones.json"), "w") as fh:
        json.dump(zones, fh, indent=2, ensure_ascii=False)
    # Export des polygones UV du maillage d'impression pour le gabarit vectoriel.
    me = bpy.data.objects["MUG_PRINT_SURFACE"].data
    uv_layer = me.uv_layers["UVMap"]
    faces = []
    outline = {}
    for p in me.polygons:
        pts = [tuple(round(c, 6) for c in uv_layer.data[li].uv) for li in p.loop_indices]
        faces.append(pts)
        vs = list(p.vertices)
        for k in range(len(vs)):
            key = tuple(sorted((vs[k], vs[(k + 1) % len(vs)])))
            outline.setdefault(key, []).append((pts[k], pts[(k + 1) % len(vs)]))
    segments = [seg[0] for seg in outline.values() if len(seg) == 1]
    with open(os.path.join(OUT, "_uv.json"), "w") as fh:
        json.dump({"faces": faces, "outline": segments, "uv_rect": [0, 0, 1, 1]}, fh)

    print("GLB :", glb_path, os.path.getsize(glb_path) // 1024, "Ko")

    create_studio(scene)
    # Le fichier .blend est un projet studio complet, sans visuel de test.
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "elembo-mug.blend"), relative_remap=True)
    print("Blend enregistré")

    render_uv_templates()
    render_previews(scene)
    return scene, root, product


if __name__ == "__main__":
    main()
