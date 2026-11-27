"""
ELEMBO — Casquette baseball 6 panneaux personnalisable : construction procédurale Blender.

Lancer depuis la racine du dépôt :

    /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
        -P assets/3d/elembo-casquette/build.py -- root=$PWD [previews=0] [templates=0]

Produit :
  - public/models/elembo-casquette/elembo-casquette.glb
  - assets/3d/elembo-casquette/elembo-casquette.blend
  - assets/3d/elembo-casquette/textures/*.png
  - assets/3d/elembo-casquette/zones.json (dimensions, zones, contrôle d'isotropie)
  - assets/3d/elembo-casquette/uv-<zone>.png et public/zones/<zone>.png (gabarits)
  - aperçus Cycles (preview-*.png) et rendu de contrôle des zones (qc/)

Conventions (glTF, après export Y-up) :
  - unités : mètres ; Y vers le haut ; origine au centre de la base, au sol ;
  - devant (visière) : +Z ; côté GAUCHE DU PORTEUR : +X (comme le T-shirt) ;
  - cinq surfaces d'impression indépendantes (CAP_*_PRINT), décalées de 0,35 mm
    au-dessus du tissu, chacune avec son matériau transparent et ses UV 0..1 ;
  - UV d'impression ISOTROPES : 1 cm de texture = 1 cm de tissu, mesuré le long de la
    surface (abscisse curviligne horizontale × méridienne). U croît vers la droite de
    l'observateur qui regarde la zone ; glTF V = 0 en HAUT de l'image.
  - le visuel n'est jamais cuit dans le modèle : les textures d'impression livrées sont
    transparentes, l'atelier 3D les remplace à l'exécution.

Repère interne (Blender, Z-up) : avant = −Y, gauche du porteur = +X. φ = azimut mesuré
depuis l'avant (φ = 0) vers la gauche du porteur (φ = 90°), l'arrière (180°) puis la
droite (270°). θ ∈ [0, 1] = paramètre de hauteur de la calotte (0 = base, 1 = sommet).
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
OUT = os.path.join(ROOT, "assets/3d/elembo-casquette")
TEX = os.path.join(OUT, "textures")
QC = os.path.join(OUT, "qc")
GLB_DIR = os.path.join(ROOT, "public/models/elembo-casquette")
PUBLIC_ZONES = os.path.join(ROOT, "public/zones")
for d in (OUT, TEX, QC, GLB_DIR, PUBLIC_ZONES):
    os.makedirs(d, exist_ok=True)
DO_PREVIEWS = OPT.get("previews", "1") == "1"
DO_TEMPLATES = OPT.get("templates", "1") == "1"
RENDER_SAMPLES = int(OPT.get("samples", "64"))

# ─────────────────────────────────────────────────────────────────────────────
# Dimensions (mètres) — casquette adulte taille 57-59 cm, structurée, 6 panneaux
# ─────────────────────────────────────────────────────────────────────────────
A_X = 0.0905            # demi-largeur de la base (oreille à oreille)
B_Y = 0.0985            # demi-longueur de la base (front à nuque)
H = 0.098               # hauteur de la calotte (base → bouton)
N_FRONT = 2.7           # superellipse du profil : avant structuré (plus vertical)
N_BACK = 1.95           # arrière plus souple, qui fuit vers la nuque
APEX_SHIFT = 0.016      # sommet décalé vers l'arrière
SEAM_DENT = 0.0009      # creux des coutures
SEAM_W = 0.0019         # demi-largeur du creux (gaussienne)
SHELL_T = 0.0018        # épaisseur du tissu + bougran (doublure décalée vers l'intérieur)
PRINT_OFFSET = 0.00035  # surfaces d'impression au-dessus du tissu
ARCH_HALF_W = 0.036     # demi-largeur de l'ouverture arrière (le long de la base)
ARCH_H = 0.052          # hauteur de l'ouverture arrière
SWEAT_H = 0.034         # hauteur du bandeau intérieur
VISOR_PHI = math.radians(82)   # extension angulaire de la visière (de chaque côté)
VISOR_L = 0.073         # profondeur de la visière au centre
VISOR_T = 0.0032        # épaisseur de la visière
VISOR_Z = 0.0006        # dessus de la visière au ras de la base
SEAMS = [math.radians(60 * k) for k in range(6)]

N_PHI_SECTOR = 40       # colonnes par panneau (resserrées près des coutures)
N_ROWS = 60             # rangées de la calotte
CLUSTER = 0.75          # resserrement des colonnes près des coutures

COLORS = [
    ("Noir", "black", "#1B1B1D"),
    ("Blanc", "white", "#F2F1EC"),
    ("Gris", "grey", "#8E9093"),
    ("Bleu marine", "navy", "#1E2740"),
    ("Rouge", "red", "#A8232B"),
    ("Kaki", "khaki", "#5B5E3C"),
    ("Beige", "beige", "#CDB892"),
    ("Orange Elembo", "orange", "#FF5A12"),
]
DEFAULT_COLOR = "#1B1B1D"

# Zones d'impression. W × Ht = taille de la TEXTURE (cm) ; s_top / s_bottom = abscisse
# méridienne (cm, mesurée depuis la base de la calotte, ou depuis le bord intérieur de la
# visière) des bords haut et bas de l'image.
ZONES = {
    "cap-front": {"mesh": "CAP_FRONT_PRINT", "material": "MAT_CAP_PRINT_FRONT", "label": "Panneau avant",
                  "phi_c": 0.0, "W": 14.0, "s_top": 8.4, "s_bottom": 0.4},
    "cap-left": {"mesh": "CAP_LEFT_PRINT", "material": "MAT_CAP_PRINT_LEFT", "label": "Côté gauche",
                 "phi_c": math.pi / 2, "W": 10.0, "s_top": 7.6, "s_bottom": 0.6},
    "cap-right": {"mesh": "CAP_RIGHT_PRINT", "material": "MAT_CAP_PRINT_RIGHT", "label": "Côté droit",
                  "phi_c": 3 * math.pi / 2, "W": 10.0, "s_top": 7.6, "s_bottom": 0.6},
    "cap-back": {"mesh": "CAP_BACK_PRINT", "material": "MAT_CAP_PRINT_BACK", "label": "Arrière",
                 "phi_c": math.pi, "W": 10.0, "s_top": 11.1, "s_bottom": 5.6},
    "visor": {"mesh": "CAP_VISOR_PRINT", "material": "MAT_CAP_PRINT_VISOR", "label": "Visière",
              "W": 16.0, "s_top": 0.6, "s_bottom": 6.6},
}

FABRIC_MATERIALS = ["CAP_FABRIC", "CAP_BUTTON", "CAP_LINING", "CAP_BINDING", "CAP_SWEATBAND",
                    "CAP_VISOR", "CAP_UNDERVISOR", "CAP_STRAP"]


# ─────────────────────────────────────────────────────────────────────────────
# Utilitaires
# ─────────────────────────────────────────────────────────────────────────────
def srgb_to_linear(c):
    c = float(c)
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_rgb(h, linear=True):
    h = h.lstrip("#")
    rgb = [int(h[i : i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [srgb_to_linear(c) for c in rgb] if linear else rgb


def save_png(name, rgba, colorspace="sRGB", folder=TEX):
    """Enregistre un tableau RGBA (ligne 0 = haut de l'image) en PNG via Blender."""
    h, w = rgba.shape[:2]
    img = bpy.data.images.new(name, w, h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(rgba[::-1]).astype(np.float32).ravel())
    path = os.path.join(folder, name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    img.filepath = path
    img.source = "FILE"
    img.reload()
    return img


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def wrap_angle(a):
    """Ramène un angle dans ]−π, π]."""
    return (a + np.pi) % (2 * np.pi) - np.pi


# ─────────────────────────────────────────────────────────────────────────────
# Surface analytique de la calotte
# ─────────────────────────────────────────────────────────────────────────────
def base_radius(phi):
    phi = np.asarray(phi, dtype=np.float64)
    return 1.0 / np.sqrt((np.sin(phi) / A_X) ** 2 + (np.cos(phi) / B_Y) ** 2)


def exponent(phi):
    return N_BACK + (N_FRONT - N_BACK) * (0.5 + 0.5 * np.cos(phi))


def rho_h(phi, theta):
    """Facteur radial et hauteur relative (superellipse) du profil méridien."""
    n = exponent(phi)
    a = np.clip(theta, 0.0, 1.0) * (np.pi / 2)
    c = np.clip(np.cos(a), 0.0, 1.0)
    s = np.clip(np.sin(a), 0.0, 1.0)
    return c ** (2.0 / n), s ** (2.0 / n)


def crown_point(phi, theta):
    """Point de la calotte (sans creux de couture). phi, theta : tableaux de même forme."""
    phi = np.asarray(phi, dtype=np.float64)
    theta = np.asarray(theta, dtype=np.float64)
    rho, hh = rho_h(phi, theta)
    r = rho * base_radius(phi)
    x = r * np.sin(phi)
    y = -r * np.cos(phi) + APEX_SHIFT * (1.0 - rho)
    z = hh * H
    return np.stack([x, y, z], axis=-1)


def crown_normal(phi, theta, eps=1e-5):
    """Normale extérieure analytique (différences finies)."""
    t = np.clip(theta, eps, 1 - eps)
    dp = crown_point(phi + eps, t) - crown_point(phi - eps, t)
    dt = crown_point(phi, t + eps) - crown_point(phi, t - eps)
    n = np.cross(dp, dt)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def seam_distance(phi, theta):
    """Distance (m) à la couture la plus proche, mesurée le long de la rangée."""
    rho, _ = rho_h(phi, theta)
    d = np.full(np.shape(phi), np.inf)
    for s in SEAMS:
        d = np.minimum(d, np.abs(wrap_angle(np.asarray(phi) - s)))
    return d * rho * base_radius(phi)


def crown_surface(phi, theta, offset=0.0):
    """Point de la calotte avec creux de couture, décalé de `offset` le long de la normale."""
    p = crown_point(phi, theta)
    n = crown_normal(phi, theta)
    rho, _ = rho_h(phi, theta)
    d = seam_distance(phi, theta)
    dent = SEAM_DENT * np.exp(-((d / SEAM_W) ** 2)) * smoothstep(0.06, 0.25, rho)
    return p + n * (offset - dent)[..., None]


def arch_theta_min(phi):
    """θ minimal de la calotte : 0, sauf dans l'ouverture arrière (arc au-dessus de la patte)."""
    phi = np.asarray(phi, dtype=np.float64)
    ds = base_radius(np.pi) * wrap_angle(phi - np.pi)
    u = np.clip(np.abs(ds) / ARCH_HALF_W, 0.0, 1.0)
    z = ARCH_H * np.sqrt(np.clip(1.0 - u ** 2.2, 0.0, 1.0))
    n = exponent(phi)
    ratio = np.clip(z / H, 0.0, 1.0) ** (n / 2.0)
    return np.where(np.abs(ds) < ARCH_HALF_W, np.arcsin(ratio) * 2 / np.pi, 0.0)


def meridian_s(phi, theta, steps=120):
    """Abscisse méridienne (m) depuis la base θ = 0 jusqu'à θ (tableaux 1D)."""
    phi = np.atleast_1d(np.asarray(phi, dtype=np.float64))
    theta = np.atleast_1d(np.asarray(theta, dtype=np.float64))
    k = (np.linspace(0, 1, steps) ** 1.6)[None, :]  # resserré près de la base (dérivée infinie)
    th = theta[:, None] * k
    pts = crown_point(np.repeat(phi[:, None], steps, axis=1), th)
    return np.linalg.norm(np.diff(pts, axis=1), axis=-1).sum(axis=1)


def row_s(phi, theta, phi_c, steps=96):
    """Abscisse horizontale signée (m) le long de la rangée θ, depuis φ_c jusqu'à φ."""
    phi = np.atleast_1d(np.asarray(phi, dtype=np.float64))
    theta = np.atleast_1d(np.asarray(theta, dtype=np.float64))
    dphi = wrap_angle(phi - phi_c)
    k = np.linspace(0, 1, steps)[None, :]
    ph = phi_c + dphi[:, None] * k
    pts = crown_point(ph, np.repeat(theta[:, None], steps, axis=1))
    return np.sign(dphi) * np.linalg.norm(np.diff(pts, axis=1), axis=-1).sum(axis=1)


def phi_columns():
    """Azimuts des colonnes, resserrés près des six coutures."""
    t = np.arange(N_PHI_SECTOR) / N_PHI_SECTOR
    local = t - CLUSTER * np.sin(2 * np.pi * t) / (2 * np.pi)
    return np.concatenate([np.radians(60 * k) + np.radians(60) * local for k in range(6)])


def row_thetas(n_rows, theta_top):
    """θ des rangées, régulières en abscisse méridienne sur le méridien avant."""
    fine = np.linspace(0, 1, 4001) ** 1.4
    s = np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(crown_point(np.zeros_like(fine), fine), axis=0), axis=-1))])
    s_top = np.interp(theta_top, fine, s)
    targets = np.linspace(0, s_top, n_rows + 1)
    return np.interp(targets, s, fine)


def theta_for_radius(r_target):
    """θ où le rayon horizontal de la calotte avant vaut r_target (haut de la grille)."""
    fine = np.linspace(0.5, 1.0, 5001)
    rho, _ = rho_h(np.zeros_like(fine), fine)
    r = rho * base_radius(0.0)
    return float(fine[np.argmin(np.abs(r - r_target))])


THETA_TOP = theta_for_radius(0.0065)
PHIS = phi_columns()
ROWS = row_thetas(N_ROWS, THETA_TOP)


def crown_grid_thetas():
    """θ de chaque sommet de la grille (rangée, colonne), arc arrière compris."""
    tmin = arch_theta_min(PHIS)[None, :]
    rows = ROWS[:, None] / THETA_TOP
    return tmin + (THETA_TOP - tmin) * rows


# ─────────────────────────────────────────────────────────────────────────────
# Construction des maillages
# ─────────────────────────────────────────────────────────────────────────────
def make_object(name, verts, faces, collection):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(map(float, v)) for v in verts], [], [tuple(int(i) for i in f) for f in faces])
    me.validate(clean_customdata=False)
    me.update()
    ob = bpy.data.objects.new(name, me)
    collection.objects.link(ob)
    return ob


def shade_smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def set_uv_layers(ob, layers):
    """layers : liste (nom, fonction(poly_index, loop_rank, vertex_index) -> (u, v))."""
    me = ob.data
    for name, fn in layers:
        layer = me.uv_layers.new(name=name)
        for p in me.polygons:
            for rank, li in enumerate(p.loop_indices):
                layer.data[li].uv = fn(p.index, rank, me.loops[li].vertex_index)
    me.uv_layers.active = me.uv_layers[layers[0][0]]


def orient(ob, face_index, expected):
    """Retourne toutes les faces si la normale de `face_index` ne suit pas `expected`."""
    me = ob.data
    n = me.polygons[face_index].normal
    if n.dot(Vector(expected)) < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()


TILE = 0.008  # tuile du sergé (8 mm)


def build_crown(collection, mat):
    thetas = crown_grid_thetas()
    nr, nc = thetas.shape
    phis = np.broadcast_to(PHIS[None, :], thetas.shape)
    pts = crown_surface(phis, thetas)
    verts = pts.reshape(-1, 3).tolist()
    apex = crown_surface(np.array([0.0]), np.array([1.0]))[0]
    apex_i = len(verts)
    verts.append(apex.tolist())
    idx = lambda r, c: r * nc + (c % nc)
    faces = []
    meta = []  # (rangée, colonne) de chaque coin, pour les UV
    for r in range(nr - 1):
        for c in range(nc):
            faces.append((idx(r, c), idx(r, c + 1), idx(r + 1, c + 1), idx(r + 1, c)))
            meta.append(((r, c), (r, c + 1), (r + 1, c + 1), (r + 1, c)))
    for c in range(nc):
        faces.append((idx(nr - 1, c), idx(nr - 1, c + 1), apex_i))
        meta.append(((nr - 1, c), (nr - 1, c + 1), None))
    ob = make_object("CAP_CROWN", verts, faces, collection)

    # UV0 : paramètres (φ / 2π, θ) → atlas des coutures et surpiqûres.
    # UV1 : tuile du sergé, en abscisses curvilignes (≈ isotrope).
    flat_phi = phis.reshape(-1)
    flat_theta = thetas.reshape(-1)
    s_v = meridian_s(flat_phi, flat_theta).reshape(thetas.shape)
    s_h = row_s(flat_phi, flat_theta, 0.0).reshape(thetas.shape)

    def uv0(pi, rank, vi):
        rc = meta[pi][rank]
        if rc is None:
            return (float(PHIS[meta[pi][0][1] % nc] / (2 * np.pi)), 1.0)
        r, c = rc
        u = PHIS[c % nc] / (2 * np.pi)
        if c == nc:  # colonne de raccord φ = 2π
            u = 1.0
        return (float(u), float(thetas[r, c % nc]))

    def uv1(pi, rank, vi):
        rc = meta[pi][rank]
        if rc is None:
            return (0.0, float(s_v[-1, 0] / TILE))
        r, c = rc
        sh = s_h[r, c % nc]
        # Couture arrière (φ = π) : l'abscisse change de signe d'un côté à l'autre ; sur une
        # face à cheval, on prolonge du côté positif (le contour est symétrique en x).
        corners = [s_h[q[0], q[1] % nc] for q in meta[pi] if q is not None]
        if max(corners) > 0.1 and min(corners) < -0.1:
            sh = abs(sh)
        return (float(sh / TILE), float(s_v[r, c % nc] / TILE))

    set_uv_layers(ob, [("UVMap", uv0), ("UV_TILE", uv1)])
    shade_smooth(ob)
    orient(ob, nc * 10, (0, -1, 0.2))
    ob.data.materials.append(mat)
    return ob, thetas, pts


def build_lining(collection, mat, thetas):
    """Doublure : même grille (une rangée sur deux), décalée vers l'intérieur, normales vers la tête."""
    sel = list(range(0, thetas.shape[0], 3))
    if sel[-1] != thetas.shape[0] - 1:
        sel.append(thetas.shape[0] - 1)
    th = thetas[sel]
    nr, nc = th.shape
    phis = np.broadcast_to(PHIS[None, :], th.shape)
    pts = crown_point(phis, th) - crown_normal(phis, th) * SHELL_T
    verts = pts.reshape(-1, 3).tolist()
    apex = crown_point(np.array([0.0]), np.array([1.0]))[0] - np.array([0, 0, SHELL_T])
    apex_i = len(verts)
    verts.append(apex.tolist())
    idx = lambda r, c: r * nc + (c % nc)
    faces = []
    for r in range(nr - 1):
        for c in range(nc):
            faces.append((idx(r, c), idx(r + 1, c), idx(r + 1, c + 1), idx(r, c + 1)))
    for c in range(nc):
        faces.append((idx(nr - 1, c), apex_i, idx(nr - 1, c + 1)))
    ob = make_object("CAP_LINING", verts, faces, collection)
    me = ob.data

    def tile(pi, rank, vi):
        co = me.vertices[vi].co
        return (float(math.atan2(co.x, -co.y) * 0.09 / TILE), float(co.z / TILE))

    set_uv_layers(ob, [("UVMap", tile), ("UV_TILE", tile)])
    shade_smooth(ob)
    orient(ob, nc * 4, (0, 1, 0))  # face avant de la doublure : normale vers l'arrière (la tête)
    ob.data.materials.append(mat)
    return ob


def build_binding(collection, mat, thetas):
    """Bord roulé (biais) qui ferme la calotte en bas et autour de l'ouverture arrière."""
    th0 = thetas[0]
    th1 = thetas[1]
    po = crown_surface(PHIS, th0)
    pi_ = crown_point(PHIS, th0) - crown_normal(PHIS, th0) * SHELL_T
    up = crown_point(PHIS, th1) - crown_point(PHIS, th0)
    e = -up / np.linalg.norm(up, axis=-1, keepdims=True)
    K = 8
    rings = []
    for k in range(K + 1):
        b = math.pi * k / K
        m = (po + pi_) / 2
        half = (po - pi_) / 2
        rings.append(m + half * math.cos(b) + e * (0.0011 * math.sin(b)))
    nc = len(PHIS)
    verts = np.concatenate(rings).tolist()
    idx = lambda k, c: k * nc + (c % nc)
    faces = [(idx(k, c), idx(k + 1, c), idx(k + 1, c + 1), idx(k, c + 1)) for k in range(K) for c in range(nc)]
    ob = make_object("CAP_BINDING", verts, faces, collection)
    me = ob.data

    def tile(pi, rank, vi):
        k, c = divmod(vi, nc)
        return (float(c * 0.0016 / TILE), float(k * 0.0005 / TILE))

    set_uv_layers(ob, [("UVMap", tile), ("UV_TILE", tile)])
    shade_smooth(ob)
    # Face du milieu du biais, à l'avant : normale vers le bas.
    orient(ob, (K // 2) * nc + 2, (0, 0, -1))
    ob.data.materials.append(mat)
    return ob


def build_sweatband(collection, mat):
    """Bandeau intérieur (hors ouverture arrière)."""
    tmin = arch_theta_min(PHIS)
    arch = [i for i in range(len(PHIS)) if tmin[i] > 0]
    # Colonnes contiguës : de la fin de l'arc (côté droit) jusqu'au début (côté gauche).
    order = list(range(arch[-1] + 1, len(PHIS))) + list(range(0, arch[0]))
    phis = PHIS[order]
    fine = np.linspace(0, 0.5, 2001)
    hz = rho_h(np.zeros_like(fine), fine)[1] * H
    th_top = float(np.interp(SWEAT_H, hz, fine))
    rows = np.linspace(0.0, th_top, 7)
    P = np.broadcast_to(phis[None, :], (len(rows), len(phis)))
    T = np.broadcast_to(rows[:, None], P.shape)
    inset = SHELL_T + 0.0012
    pts = crown_point(P, T) - crown_normal(P, T) * inset
    pts[0, :, 2] = np.maximum(pts[0, :, 2], 0.0006)
    # Repli supérieur : rejoint la doublure.
    fold = crown_point(P[-1], T[-1]) - crown_normal(P[-1], T[-1]) * (SHELL_T + 0.0002)
    pts = np.concatenate([pts, fold[None]], axis=0)
    nr, nc = pts.shape[:2]
    verts = pts.reshape(-1, 3).tolist()
    idx = lambda r, c: r * nc + c
    faces = [(idx(r, c), idx(r + 1, c), idx(r + 1, c + 1), idx(r, c + 1)) for r in range(nr - 1) for c in range(nc - 1)]
    ob = make_object("CAP_SWEATBAND", verts, faces, collection)
    me = ob.data

    def tile(pi, rank, vi):
        r, c = divmod(vi, nc)
        return (float(c * 0.0022 / TILE), float(r * 0.005 / TILE))

    set_uv_layers(ob, [("UVMap", tile), ("UV_TILE", tile)])
    shade_smooth(ob)
    front_col = int(np.argmin(np.abs(wrap_angle(phis))))
    orient(ob, 2 * (nc - 1) + front_col, (0, 1, 0))
    ob.data.materials.append(mat)
    return ob


def build_button(collection, mat):
    apex = crown_point(np.array([0.0]), np.array([1.0]))[0]
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=1.0)
    for v in bm.verts:
        v.co.x *= 0.0088
        v.co.y *= 0.0088
        v.co.z = v.co.z * 0.0036 + apex[2] - 0.0004
        v.co.y += apex[1]
    me = bpy.data.meshes.new("CAP_BUTTON")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("CAP_BUTTON", me)
    collection.objects.link(ob)

    def tile(pi, rank, vi):
        co = me.vertices[vi].co
        return (float(co.x / TILE), float((co.y - apex[1]) / TILE))

    set_uv_layers(ob, [("UVMap", tile), ("UV_TILE", tile)])
    shade_smooth(ob)
    ob.data.materials.append(mat)
    return ob


# ─────────────────────────────────────────────────────────────────────────────
# Visière
# ─────────────────────────────────────────────────────────────────────────────
VISOR_NU = 110
VISOR_NW = 20


def visor_frame(u):
    """Bord intérieur, direction de la visière (unitaire) et profondeur pour u ∈ [−1, 1]."""
    u = np.asarray(u, dtype=np.float64)
    phi = u * VISOR_PHI
    r = base_radius(phi) - 0.003
    inner = np.stack([r * np.sin(phi), -r * np.cos(phi), np.full_like(phi, VISOR_Z)], axis=-1)
    x, y = inner[..., 0], inner[..., 1]
    nrm = np.stack([x / A_X**2, y / B_Y**2], axis=-1)
    nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    # Visière pré-courbée : la pente vers le bas augmente vers les côtés.
    alpha = math.radians(7) + math.radians(38) * np.sin(phi) ** 2
    d = np.stack([nrm[..., 0] * np.cos(alpha), nrm[..., 1] * np.cos(alpha), -np.sin(alpha)], axis=-1)
    L = VISOR_L * np.clip(1 - (phi / VISOR_PHI) ** 2, 0.0, 1.0) ** 0.55
    return inner, d, np.maximum(L, 0.0018)


def visor_point(u, w):
    inner, d, L = visor_frame(u)
    return inner + d * (np.asarray(w) * L)[..., None]


def visor_normal(u, w, eps=1e-4):
    du = visor_point(u + eps, w) - visor_point(u - eps, w)
    dw = visor_point(u, np.clip(w + eps, 0, 1)) - visor_point(u, np.clip(w - eps, 0, 1))
    n = np.cross(dw, du)  # vers le haut
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.where(n[..., 2:3] < 0, -n, n)


def visor_grid():
    us = np.linspace(-1, 1, VISOR_NU + 1) * 0.995
    ws = np.linspace(0, 1, VISOR_NW + 1)
    U, Wg = np.meshgrid(us, ws)  # (nw, nu)
    return U, Wg


def visor_coords(U, Wg):
    """Abscisse le long des rangées (depuis l'axe) et profondeur depuis le bord intérieur (m)."""
    pts = visor_point(U, Wg)
    seg = np.linalg.norm(np.diff(pts, axis=1), axis=-1)
    cum = np.concatenate([np.zeros((pts.shape[0], 1)), np.cumsum(seg, axis=1)], axis=1)
    mid = pts.shape[1] // 2
    s_h = cum - cum[:, mid : mid + 1]
    _, _, L = visor_frame(U)
    s_v = Wg * L
    return s_h, s_v, L


def build_visor(collection, mat_top, mat_bottom):
    U, Wg = visor_grid()
    nw, nu = U.shape
    top = visor_point(U, Wg)
    nrm = visor_normal(U, Wg)
    bottom = top - nrm * VISOR_T
    s_h, s_v, L = visor_coords(U, Wg)
    d_edge = (1 - Wg) * L  # distance au bord extérieur (rangs de surpiqûres)

    def grid_faces(nw_, nu_, flip=False, base=0):
        out = []
        for i in range(nw_ - 1):
            for j in range(nu_ - 1):
                a, b, c, d = base + i * nu_ + j, base + i * nu_ + j + 1, base + (i + 1) * nu_ + j + 1, base + (i + 1) * nu_ + j
                out.append((a, d, c, b) if flip else (a, b, c, d))
        return out

    # Dessus.
    ob_top = make_object("CAP_VISOR_TOP", top.reshape(-1, 3).tolist(), grid_faces(nw, nu), collection)
    me = ob_top.data
    flat_sh, flat_de, flat_sv = s_h.reshape(-1), d_edge.reshape(-1), s_v.reshape(-1)
    set_uv_layers(ob_top, [
        ("UVMap", lambda p, r, vi: (float(flat_sh[vi] / STITCH_TILE_X), float(1 - flat_de[vi] / STITCH_SPAN))),
        ("UV_TILE", lambda p, r, vi: (float(flat_sh[vi] / TILE), float(flat_sv[vi] / TILE))),
    ])
    shade_smooth(ob_top)
    orient(ob_top, (nw // 2) * (nu - 1) + nu // 2, (0, 0, 1))
    ob_top.data.materials.append(mat_top)

    # Dessous.
    ob_bot = make_object("CAP_VISOR_BOTTOM", bottom.reshape(-1, 3).tolist(), grid_faces(nw, nu, flip=True), collection)
    set_uv_layers(ob_bot, [
        ("UVMap", lambda p, r, vi: (float(flat_sh[vi] / TILE), float(flat_sv[vi] / TILE))),
        ("UV_TILE", lambda p, r, vi: (float(flat_sh[vi] / TILE), float(flat_sv[vi] / TILE))),
    ])
    shade_smooth(ob_bot)
    orient(ob_bot, (nw // 2) * (nu - 1) + nu // 2, (0, 0, -1))
    ob_bot.data.materials.append(mat_bottom)

    # Tranche arrondie : bord extérieur + deux extrémités.
    K = 6
    outline = [(nw - 1, j) for j in range(nu)]
    outline = [(i, 0) for i in range(0, nw - 1)] + outline + [(i, nu - 1) for i in range(nw - 2, -1, -1)]
    edge_rings = []
    for (i, j) in outline:
        t, b = top[i, j], bottom[i, j]
        if i == nw - 1:
            out = visor_frame(U[i, j])[1]
        else:
            out = top[i, j] - top[i, min(max(j + (1 if j == 0 else -1), 0), nu - 1)]
        out = out / (np.linalg.norm(out) + 1e-12)
        m, half = (t + b) / 2, (t - b) / 2
        edge_rings.append([m + half * math.cos(math.pi * k / K) + out * (VISOR_T * 0.42 * math.sin(math.pi * k / K)) for k in range(K + 1)])
    edge = np.array(edge_rings)  # (n_outline, K+1, 3)
    n_out = edge.shape[0]
    verts = edge.reshape(-1, 3).tolist()
    idx = lambda a, k: a * (K + 1) + k
    faces = [(idx(a, k), idx(a, k + 1), idx(a + 1, k + 1), idx(a + 1, k)) for a in range(n_out - 1) for k in range(K)]
    ob_edge = make_object("CAP_VISOR_EDGE", verts, faces, collection)
    set_uv_layers(ob_edge, [
        ("UVMap", lambda p, r, vi: (float((vi // (K + 1)) * 0.002 / TILE), float((vi % (K + 1)) * 0.0006 / TILE))),
        ("UV_TILE", lambda p, r, vi: (float((vi // (K + 1)) * 0.002 / TILE), float((vi % (K + 1)) * 0.0006 / TILE))),
    ])
    shade_smooth(ob_edge)
    # Face au milieu du bord avant : normale vers l'avant (−Y).
    orient(ob_edge, ((nw - 1) + nu // 2) * K + K // 2, (0, -1, 0))
    ob_edge.data.materials.append(mat_top)
    return ob_top, ob_bot, ob_edge


# ─────────────────────────────────────────────────────────────────────────────
# Patte de fermeture (snapback)
# ─────────────────────────────────────────────────────────────────────────────
def build_strap(collection, mat):
    half = (ARCH_HALF_W + 0.013) / base_radius(np.pi)
    phis = np.pi + np.linspace(-half, half, 49)
    z0, z1 = 0.0045, 0.0265
    fine = np.linspace(0, 0.5, 2001)
    hz = rho_h(np.full_like(fine, np.pi), fine)[1] * H
    rows = np.interp(np.linspace(z0, z1, 6), hz, fine)
    P = np.broadcast_to(phis[None, :], (len(rows), len(phis)))
    T = np.broadcast_to(rows[:, None], P.shape)
    base = crown_point(P, T)
    nrm = crown_normal(P, T)
    outer = base - nrm * 0.0005
    inner = base - nrm * 0.0016
    nr, nc = outer.shape[:2]
    verts = np.concatenate([outer.reshape(-1, 3), inner.reshape(-1, 3)]).tolist()
    off = nr * nc
    idx = lambda r, c: r * nc + c
    faces = []
    for r in range(nr - 1):
        for c in range(nc - 1):
            faces.append((idx(r, c), idx(r, c + 1), idx(r + 1, c + 1), idx(r + 1, c)))  # extérieur
            faces.append((off + idx(r, c), off + idx(r + 1, c), off + idx(r + 1, c + 1), off + idx(r, c + 1)))
    for c in range(nc - 1):  # tranches haute et basse
        faces.append((idx(0, c), off + idx(0, c), off + idx(0, c + 1), idx(0, c + 1)))
        faces.append((idx(nr - 1, c), idx(nr - 1, c + 1), off + idx(nr - 1, c + 1), off + idx(nr - 1, c)))
    ob = make_object("CAP_STRAP", verts, faces, collection)
    me = ob.data

    def tile(pi, rank, vi):
        co = me.vertices[vi].co
        return (float(co.x / TILE), float(co.z / TILE))

    set_uv_layers(ob, [("UVMap", tile), ("UV_TILE", tile)])
    shade_smooth(ob)
    orient(ob, (nr // 2) * 2 * (nc - 1) + 2 * (nc // 2), (0, 1, 0))
    ob.data.materials.append(mat)

    # Pressions : sept têtes arrondies alignées au milieu de la patte.
    bm = bmesh.new()
    zc = (z0 + z1) / 2
    thc = float(np.interp(zc, hz, fine))
    for k in range(7):
        ds = -0.030 + k * 0.010
        ph = np.pi + ds / base_radius(np.pi)
        c = crown_point(np.array([ph]), np.array([thc]))[0]
        n = crown_normal(np.array([ph]), np.array([thc]))[0]
        geom = bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=8, radius=1.0)
        q = Vector((0, 0, 1)).rotation_difference(Vector(n.tolist()))
        for v in geom["verts"]:
            local = Vector((v.co.x * 0.0027, v.co.y * 0.0027, max(v.co.z, -0.2) * 0.0013))
            v.co = Vector(c.tolist()) + q @ local - Vector(n.tolist()) * 0.0002
    me2 = bpy.data.meshes.new("CAP_SNAPS")
    bm.to_mesh(me2)
    bm.free()
    snaps = bpy.data.objects.new("CAP_SNAPS", me2)
    collection.objects.link(snaps)

    def tile2(pi, rank, vi):
        co = me2.vertices[vi].co
        return (float(co.x / TILE), float(co.z / TILE))

    set_uv_layers(snaps, [("UVMap", tile2), ("UV_TILE", tile2)])
    shade_smooth(snaps)
    snaps.data.materials.append(mat)
    return ob, snaps


# ─────────────────────────────────────────────────────────────────────────────
# Surfaces d'impression (UV isotropes, découpées exactement au rectangle 0..1)
# ─────────────────────────────────────────────────────────────────────────────
def clip_polygon(poly, axis, value, keep_greater):
    """Sutherland–Hodgman sur un attribut (poly : liste de vecteurs numpy)."""
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        ina = a[axis] >= value if keep_greater else a[axis] <= value
        inb = b[axis] >= value if keep_greater else b[axis] <= value
        if ina:
            out.append(a)
        if ina != inb:
            t = (value - a[axis]) / (b[axis] - a[axis])
            out.append(a + (b - a) * t)
    return out


def clipped_patch(params, uv):
    """params : (nr, nc, 2) paramètres de surface ; uv : (nr, nc, 2) en 0..1 attendu.

    Retourne une liste de polygones convexes ; chaque sommet = [p0, p1, u, v].
    """
    nr, nc = params.shape[:2]
    data = np.concatenate([params, uv], axis=-1)
    polys = []
    for r in range(nr - 1):
        for c in range(nc - 1):
            quad = [data[r, c], data[r, c + 1], data[r + 1, c + 1], data[r + 1, c]]
            if any(np.isnan(q[2]) for q in quad):
                continue
            us = [q[2] for q in quad]
            vs = [q[3] for q in quad]
            if max(us) < 0 or min(us) > 1 or max(vs) < 0 or min(vs) > 1:
                continue
            for tri in ((quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])):
                poly = list(tri)
                for axis, value, keep in ((2, 0.0, True), (2, 1.0, False), (3, 0.0, True), (3, 1.0, False)):
                    poly = clip_polygon(poly, axis, value, keep)
                    if len(poly) < 3:
                        break
                if len(poly) >= 3:
                    polys.append(poly)
    return polys


def polys_to_mesh(name, polys, position_fn, collection, mat, expected_normal):
    keys = {}
    verts, uvs, faces = [], [], []
    params = []
    for poly in polys:
        f = []
        for q in poly:
            key = (round(float(q[0]), 9), round(float(q[1]), 9))
            if key not in keys:
                keys[key] = len(params)
                params.append((float(q[0]), float(q[1])))
                uvs.append((float(np.clip(q[2], 0, 1)), float(np.clip(q[3], 0, 1))))
            idx = keys[key]
            if idx not in f:
                f.append(idx)
        if len(f) >= 3:
            faces.append(f)
    P = np.array(params)
    verts = position_fn(P[:, 0], P[:, 1])
    ob = make_object(name, verts.tolist(), faces, collection)
    me = ob.data
    uv_arr = np.array(uvs)
    # Blender : v vers le haut ; glTF V = 1 − v_blender (l'exportateur retourne).
    set_uv_layers(ob, [
        ("UVMap", lambda p, r, vi: (float(uv_arr[vi, 0]), float(1.0 - uv_arr[vi, 1]))),
        ("UV_TILE", lambda p, r, vi: (float(uv_arr[vi, 0] * 10), float(uv_arr[vi, 1] * 10))),
    ])
    shade_smooth(ob)
    # Orientation : normale moyenne pondérée vers l'extérieur attendu.
    me.update()
    total = Vector((0, 0, 0))
    for p in me.polygons:
        total += p.normal * p.area
    if total.dot(Vector(expected_normal)) < 0:
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        me.update()
    ob.data.materials.append(mat)
    return ob, P, uv_arr, faces


def unwrap_slim(verts, faces):
    """Dépliage à étirement minimal (SLIM de Blender) d'un maillage temporaire ; UV par sommet."""
    me = bpy.data.meshes.new("_flatten")
    me.from_pydata(verts.tolist(), [], faces)
    me.update()
    ob = bpy.data.objects.new("_flatten", me)
    bpy.context.scene.collection.objects.link(ob)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.unwrap(method="MINIMUM_STRETCH", fill_holes=False, margin=0.0, iterations=60)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = np.zeros((len(verts), 2))
    layer = me.uv_layers.active.data
    for loop in me.loops:
        uv[loop.vertex_index] = layer[loop.index].uv
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.meshes.remove(me)
    return uv


def procrustes(src, dst, weights):
    """Similitude (rotation, échelle, translation, symétrie permise) src → dst, pondérée."""
    w = weights / weights.sum()
    ms, md = (src * w[:, None]).sum(0), (dst * w[:, None]).sum(0)
    xs, xd = src - ms, dst - md
    cov = (xd * w[:, None]).T @ xs
    u, sv, vt = np.linalg.svd(cov)
    R = u @ vt
    scale = sv.sum() / (w * (xs ** 2).sum(1)).sum()
    return lambda x: (x - ms) @ (scale * R).T + md


def flattened_uv(params, est, valid, position_fn, center_est):
    """UV isotropes (m) d'une grille de paramètres : dépliage SLIM, recalé sur l'estimation
    (s_h, s_v) au voisinage du centre de la zone. `est` : (nr, nc, 2) en mètres."""
    nr, nc = valid.shape
    quads = []
    for r in range(nr - 1):
        for c in range(nc - 1):
            if valid[r, c] and valid[r, c + 1] and valid[r + 1, c + 1] and valid[r + 1, c]:
                quads.append((r * nc + c, r * nc + c + 1, (r + 1) * nc + c + 1, (r + 1) * nc + c))
    used = np.unique(np.array(quads).ravel())
    remap = -np.ones(nr * nc, dtype=int)
    remap[used] = np.arange(len(used))
    flat = params.reshape(-1, 2)[used]
    verts = position_fn(flat[:, 0], flat[:, 1])
    faces = [tuple(int(remap[i]) for i in q) for q in quads]
    uv = unwrap_slim(verts, faces)
    e = est.reshape(-1, 2)[used]
    weights = np.exp(-np.sum((e - center_est) ** 2, axis=1) / (0.02 ** 2)) + 1e-9
    aligned = procrustes(uv, e, weights)(uv)
    out = np.full((nr * nc, 2), np.nan)
    out[used] = aligned
    return out.reshape(nr, nc, 2)


def crown_print_zone(key, collection, mat):
    z = ZONES[key]
    W, top, bottom = z["W"] / 100, z["s_top"] / 100, z["s_bottom"] / 100
    Ht = top - bottom
    phi_c = z["phi_c"]
    dphi = wrap_angle(PHIS - phi_c)
    cols = PHIS[np.abs(dphi) < np.pi * 0.95]
    cols = phi_c + np.sort(wrap_angle(cols - phi_c))
    thetas = np.linspace(0.0, 0.985, 110)
    P = np.broadcast_to(cols[None, :], (len(thetas), len(cols)))
    T = np.broadcast_to(thetas[:, None], P.shape).copy()
    tmin = arch_theta_min(P)
    s_v = meridian_s(P.reshape(-1), T.reshape(-1)).reshape(P.shape)
    s_h = row_s(P.reshape(-1), T.reshape(-1), phi_c).reshape(P.shape)
    est = np.stack([s_h, s_v], axis=-1)
    # Pièce à déplier : la zone et une marge de 2 cm, au-dessus de l'ouverture arrière.
    valid = (np.abs(s_h) < W / 2 + 0.02) & (s_v > bottom - 0.02) & (s_v < top + 0.02) & (T > tmin + 1e-4)
    params = np.stack([P, T], axis=-1)
    center = np.array([0.0, (top + bottom) / 2])
    flat = flattened_uv(params, est, valid, lambda a, b: crown_point(a, b), center)
    U = 0.5 + flat[..., 0] / W
    V = (top - flat[..., 1]) / Ht
    polys = clipped_patch(params, np.stack([U, V], axis=-1))
    c = crown_point(np.array([phi_c]), np.array([0.3]))[0]
    expected = (c[0], c[1], 0.0)

    def position(phi, theta):
        return crown_surface(phi, theta, offset=PRINT_OFFSET)

    return polys_to_mesh(z["mesh"], polys, position, collection, mat, expected)


def visor_print_zone(collection, mat):
    z = ZONES["visor"]
    W, top, bottom = z["W"] / 100, z["s_top"] / 100, z["s_bottom"] / 100
    us = np.linspace(-1, 1, 161) * 0.995
    ws = np.linspace(0, 1, 56)
    Ug, Wg = np.meshgrid(us, ws)
    s_h, s_v, _ = visor_coords(Ug, Wg)
    est = np.stack([s_h, s_v], axis=-1)
    params = np.stack([Ug, Wg], axis=-1)
    valid = np.abs(s_h) < W / 2 + 0.03
    center = np.array([0.0, (top + bottom) / 2])
    flat = flattened_uv(params, est, valid, lambda a, b: visor_point(a, b), center)
    U = 0.5 + flat[..., 0] / W
    V = (flat[..., 1] - top) / (bottom - top)
    polys = clipped_patch(params, np.stack([U, V], axis=-1))

    def position(u, w):
        return visor_point(u, w) + visor_normal(u, w) * PRINT_OFFSET

    return polys_to_mesh(z["mesh"], polys, position, collection, mat, (0, 0, 1))


def isotropy(ob, W_cm, H_cm):
    """Écart d'échelle de la paramétrisation UV → surface (1 = isotrope, 1 cm = 1 cm)."""
    me = ob.data
    me.calc_loop_triangles()
    uv = me.uv_layers["UVMap"].data
    ratios, scales, areas = [], [], []
    for tri in me.loop_triangles:
        p = [Vector(me.vertices[v].co) * 100 for v in tri.vertices]
        q = [Vector((uv[li].uv[0] * W_cm, uv[li].uv[1] * H_cm)) for li in tri.loops]
        e1, e2 = p[1] - p[0], p[2] - p[0]
        f1, f2 = q[1] - q[0], q[2] - q[0]
        det = f1.x * f2.y - f2.x * f1.y
        if abs(det) < 1e-10 or e1.cross(e2).length < 1e-8:
            continue
        # Jacobien (3×2) : dP/du, dP/dv.
        du = (e1 * f2.y - e2 * f1.y) / det
        dv = (e2 * f1.x - e1 * f2.x) / det
        g = np.array([[du.dot(du), du.dot(dv)], [du.dot(dv), dv.dot(dv)]])
        s = np.sqrt(np.linalg.eigvalsh(g))
        ratios.append(s[1] / s[0])
        scales.append(math.sqrt(s[0] * s[1]))
        areas.append(e1.cross(e2).length / 2)
    ratios, scales, areas = np.array(ratios), np.array(scales), np.array(areas)

    def wp(x, q):  # percentile pondéré par l'aire (les éclats de découpe ne comptent pas)
        o = np.argsort(x)
        cum = np.cumsum(areas[o]) / areas.sum()
        return float(x[o][np.searchsorted(cum, q / 100)])

    return {
        "methode": "écarts pondérés par l'aire ; anisotropie = σmax/σmin du jacobien UV(cm) → surface(cm)",
        "anisotropie_p50": round(wp(ratios, 50), 4),
        "anisotropie_p95": round(wp(ratios, 95), 4),
        "echelle_p05": round(wp(scales, 5), 4),
        "echelle_p50": round(wp(scales, 50), 4),
        "echelle_p95": round(wp(scales, 95), 4),
        "triangles": int(len(ratios)),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Textures procédurales
# ─────────────────────────────────────────────────────────────────────────────
STITCH_TILE_X = 0.0064   # surpiqûres de visière : tuile de 6,4 mm (deux points)
STITCH_SPAN = 0.080      # hauteur couverte par la texture (80 mm depuis le bord)
VISOR_ROWS_MM = [4.0, 9.5, 15.0, 20.5, 26.0, 31.5, 37.0, 42.5]


def periodic_noise(n, seed=7, freqs=(3, 5, 8, 13, 21)):
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:n, 0:n] / n
    out = np.zeros((n, n))
    for f in freqs:
        for _ in range(2):
            a, b = rng.integers(-f, f + 1, size=2)
            ph = rng.uniform(0, 2 * np.pi)
            out += np.cos(2 * np.pi * (a * x + b * y) + ph) / f
    out -= out.min()
    return out / max(out.max(), 1e-9)


def make_twill_normal(res=256):
    """Sergé diagonal tuilable (8 mm) : 16 côtes par tuile, grain irrégulier léger."""
    y, x = np.mgrid[0:res, 0:res] / res
    ridges = 0.5 + 0.5 * np.sin(2 * np.pi * 16 * (x + y))
    weave = 0.5 + 0.5 * np.sin(2 * np.pi * 48 * (x - y)) * 0.35
    h = ridges * 0.8 + weave * 0.2 + periodic_noise(res) * 0.35
    gy, gx = np.gradient(h)
    k = 2.2
    nx, ny, nz = -gx * k, gy * k, np.ones_like(h)
    norm = np.sqrt(nx**2 + ny**2 + nz**2)
    rgba = np.zeros((res, res, 4))
    rgba[..., 0] = nx / norm * 0.5 + 0.5
    rgba[..., 1] = ny / norm * 0.5 + 0.5
    rgba[..., 2] = nz / norm * 0.5 + 0.5
    rgba[..., 3] = 1
    return save_png("cap_twill_normal", rgba, colorspace="Non-Color")


def thread(dist, width):
    """Profil d'un fil (1 au centre, 0 au-delà de width/2)."""
    return np.clip(1 - (np.abs(dist) / (width / 2)) ** 2, 0, 1)


def make_crown_atlas(w=4096, h=1024):
    """Multiplicateur de couleur de la calotte en (φ / 2π, θ) : coutures, surpiqûres, œillets."""
    phi = (np.arange(w) + 0.5) / w * 2 * np.pi
    theta = 1 - (np.arange(h) + 0.5) / h  # ligne 0 (haut de l'image) = V Blender 1 = sommet
    # Abscisse méridienne par colonne (table grossière interpolée).
    coarse_phi = np.linspace(0, 2 * np.pi, 181)
    s_table = np.stack([meridian_s(np.full(h, p), theta, steps=96) for p in coarse_phi])  # (181, h)
    col = np.interp(phi, coarse_phi, np.arange(181))
    i0 = np.floor(col).astype(int).clip(0, 179)
    f = (col - i0)[:, None]
    s_v = (s_table[i0] * (1 - f) + s_table[i0 + 1] * f).T  # (h, w)
    PH, TH = np.meshgrid(phi, theta)
    rho, _ = rho_h(PH, TH)
    rr = rho * base_radius(PH)
    m = np.ones((h, w))
    fade = smoothstep(0.010, 0.016, rr)
    # Coutures et doubles surpiqûres.
    for s in SEAMS:
        d = wrap_angle(PH - s) * rr
        m -= 0.38 * thread(d, 0.0006) * smoothstep(0.004, 0.009, rr)
        dash = (np.mod(s_v, 0.0030) < 0.0021).astype(float)
        for off in (-0.0028, 0.0028):
            m -= 0.24 * thread(d - off, 0.00045) * dash * fade
    # Surpiqûre du bas (bandeau), à 5 mm du bord.
    s_min = np.interp(phi, PHIS_SORTED, S_MIN_SORTED)[None, :]
    dash_h = (np.mod(wrap_angle(PH) * rr, 0.0030) < 0.0021).astype(float)
    m -= 0.22 * thread(s_v - s_min - 0.005, 0.00045) * dash_h
    # Œillets brodés : un par panneau.
    for k in range(6):
        pe = math.radians(30 + 60 * k)
        se = 0.70 * float(meridian_s(np.array([pe]), np.array([1.0]))[0])
        dx = wrap_angle(PH - pe) * rr
        dy = s_v - se
        r = np.sqrt(dx**2 + dy**2)
        ring = smoothstep(0.0019, 0.0022, r) * (1 - smoothstep(0.0031, 0.0034, r))
        ang = np.arctan2(dy, dx)
        m -= ring * (0.16 + 0.10 * (0.5 + 0.5 * np.cos(ang * 28)))
        m = np.where(r < 0.0020, 0.16 + 0.05 * (r / 0.002), m)
    m = np.clip(m, 0, 1)
    rgba = np.stack([m, m, m, np.ones_like(m)], axis=-1)
    return save_png("cap_crown_atlas", rgba)


def make_visor_stitches(w=128, h=1024):
    """Rangs de surpiqûres parallèles au bord de visière (U tuilé, V = distance au bord)."""
    x = (np.arange(w) + 0.5) / w * STITCH_TILE_X
    d = (np.arange(h) + 0.5) / h * STITCH_SPAN  # V Blender = 1 − d/SPAN → ligne 0 (haut) = bord
    X, D = np.meshgrid(x, d)
    m = np.ones((h, w))
    dash = (np.mod(X, 0.0032) < 0.0022).astype(float)
    for row in VISOR_ROWS_MM:
        m -= 0.26 * thread(D - row / 1000, 0.00048) * dash
        m -= 0.05 * thread(D - row / 1000, 0.0016)
    m = np.clip(m, 0, 1)
    rgba = np.stack([m, m, m, np.ones_like(m)], axis=-1)
    return save_png("cap_visor_stitches", rgba)


def make_print_placeholder():
    return save_png("print_placeholder", np.zeros((4, 4, 4)))


# ─────────────────────────────────────────────────────────────────────────────
# Matériaux
# ─────────────────────────────────────────────────────────────────────────────
def node_uv(nt, name, loc):
    n = nt.nodes.new("ShaderNodeUVMap")
    n.uv_map = name
    n.location = loc
    return n


def make_fabric(name, hex_color, roughness, normal_img, strength=0.35, base_img=None, sheen=0.08):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*hex_rgb(hex_color), 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Specular IOR Level"].default_value = 0.25
    # L'exportateur glTF écrit la teinte de sheen telle quelle (sans le poids) : le poids est
    # donc porté par la teinte, sinon three.js pose un voile velours blanc sur les tissus foncés.
    if sheen > 0:
        bsdf.inputs["Sheen Weight"].default_value = 1.0
        bsdf.inputs["Sheen Tint"].default_value = (sheen, sheen, sheen, 1.0)
    else:
        bsdf.inputs["Sheen Weight"].default_value = 0.0
    if base_img is not None:
        uv0 = node_uv(nt, "UVMap", (-1000, 300))
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = base_img
        tex.location = (-760, 300)
        # Exporté tel quel : baseColorTexture × baseColorFactor (la couleur choisie est posée
        # par l'atelier 3D sur material.color, qui multiplie la texture).
        nt.links.new(uv0.outputs["UV"], tex.inputs["Vector"])
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if normal_img is not None:
        uv1 = node_uv(nt, "UV_TILE", (-1000, -260))
        ntex = nt.nodes.new("ShaderNodeTexImage")
        ntex.image = normal_img
        ntex.location = (-760, -260)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = strength
        nm.uv_map = "UV_TILE"
        nm.location = (-420, -260)
        nt.links.new(uv1.outputs["UV"], ntex.inputs["Vector"])
        nt.links.new(ntex.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["base_color_hex"] = hex_color
    return m


def make_print_material(name, print_img, normal_img):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = True
    m.surface_render_method = "BLENDED"
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1, 1, 1, 1)
    bsdf.inputs["Roughness"].default_value = 0.82
    bsdf.inputs["Metallic"].default_value = 0.0
    uv0 = node_uv(nt, "UVMap", (-1000, 300))
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = print_img
    tex.extension = "CLIP"
    tex.location = (-760, 300)
    nt.links.new(uv0.outputs["UV"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    uv1 = node_uv(nt, "UV_TILE", (-1000, -260))
    ntex = nt.nodes.new("ShaderNodeTexImage")
    ntex.image = normal_img
    ntex.location = (-760, -260)
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nm.inputs["Strength"].default_value = 0.3
    nm.uv_map = "UV_TILE"
    nm.location = (-420, -260)
    nt.links.new(uv1.outputs["UV"], ntex.inputs["Vector"])
    nt.links.new(ntex.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["base_color_hex"] = "#FFFFFF"
    return m


# ─────────────────────────────────────────────────────────────────────────────
# Scène
# ─────────────────────────────────────────────────────────────────────────────
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    return scene


# Bas de la calotte (abscisse méridienne du bord) par azimut, pour la surpiqûre du bas.
PHIS_SORTED = np.linspace(0, 2 * np.pi, 721)
S_MIN_SORTED = meridian_s(PHIS_SORTED, arch_theta_min(PHIS_SORTED))


def create_product(scene):
    product = bpy.data.collections.new("ELEMBO_CASQUETTE")
    scene.collection.children.link(product)
    root = bpy.data.objects.new("ELEMBO_CASQUETTE", None)
    root.empty_display_type = "PLAIN_AXES"
    root.empty_display_size = 0.03
    product.objects.link(root)

    twill = make_twill_normal()
    atlas = make_crown_atlas()
    visor_st = make_visor_stitches()
    placeholder = make_print_placeholder()

    c = DEFAULT_COLOR
    mats = {
        "fabric": make_fabric("CAP_FABRIC", c, 0.86, twill, 0.40, atlas),
        "button": make_fabric("CAP_BUTTON", c, 0.84, twill, 0.30),
        "lining": make_fabric("CAP_LINING", c, 0.9, twill, 0.25),
        "binding": make_fabric("CAP_BINDING", c, 0.85, twill, 0.25),
        "sweat": make_fabric("CAP_SWEATBAND", c, 0.92, twill, 0.45),
        "visor": make_fabric("CAP_VISOR", c, 0.84, twill, 0.40, visor_st),
        "undervisor": make_fabric("CAP_UNDERVISOR", c, 0.88, twill, 0.35),
        "strap": make_fabric("CAP_STRAP", c, 0.45, None, sheen=0.0),
    }
    prints = {key: make_print_material(z["material"], placeholder, twill) for key, z in ZONES.items()}

    objs = []
    crown, thetas, _ = build_crown(product, mats["fabric"])
    objs.append(crown)
    objs.append(build_lining(product, mats["lining"], thetas))
    objs.append(build_binding(product, mats["binding"], thetas))
    objs.append(build_sweatband(product, mats["sweat"]))
    objs.append(build_button(product, mats["button"]))
    objs.extend(build_visor(product, mats["visor"], mats["undervisor"]))
    objs.extend(build_strap(product, mats["strap"]))

    zone_meshes = {}
    for key in ("cap-front", "cap-left", "cap-right", "cap-back"):
        ob, _, uv, faces = crown_print_zone(key, product, prints[key])
        zone_meshes[key] = (ob, uv, faces)
        objs.append(ob)
    ob, _, uv, faces = visor_print_zone(product, prints["visor"])
    zone_meshes["visor"] = (ob, uv, faces)
    objs.append(ob)

    for ob in objs:
        ob.parent = root
        ob.matrix_parent_inverse.identity()
        ob.data.name = ob.name

    root["elembo_version"] = "1.0"
    root["product_id"] = "casquette-personnalisee"
    root["units"] = "meters"
    root["colors"] = {cid: hexv for _, cid, hexv in COLORS}
    root["color_names"] = {cid: name for name, cid, _ in COLORS}
    root["default_color"] = DEFAULT_COLOR
    root["fabric_materials"] = FABRIC_MATERIALS
    root["print_meshes"] = {k: z["mesh"] for k, z in ZONES.items()}
    root["front_axis"] = "+Z"
    root["wearer_left_axis"] = "+X"
    root["up_axis"] = "+Y"
    root["origin"] = "centre of the base, on the floor"
    return root, product, zone_meshes


# ─────────────────────────────────────────────────────────────────────────────
# Gabarits (Chrome headless) : surface réellement couverte, grille en cm, sens de lecture
# ─────────────────────────────────────────────────────────────────────────────
def find_chrome():
    for candidate in [
        os.environ.get("CHROME_PATH", ""),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome") or "",
        shutil.which("chromium") or "",
    ]:
        if candidate and os.path.exists(candidate):
            return candidate
    return None


GUIDE = {
    "cap-front": ("ZONE 01 — PANNEAU AVANT", "vue de face", "← droite du porteur", "gauche du porteur →"),
    "cap-left": ("ZONE 02 — CÔTÉ GAUCHE", "vue de l'extérieur (côté gauche du porteur)", "← avant", "arrière →"),
    "cap-right": ("ZONE 03 — CÔTÉ DROIT", "vue de l'extérieur (côté droit du porteur)", "← arrière", "avant →"),
    "cap-back": ("ZONE 04 — ARRIÈRE", "vue de dos, au-dessus de l'ouverture", "← gauche du porteur", "droite du porteur →"),
    "visor": ("ZONE 05 — VISIÈRE (DESSUS)", "vue de face, de dessus · haut de l'image = côté calotte", "← droite du porteur", "gauche du porteur →"),
}


def template_svg(key, uv, faces, W, Ht, px_per_cm):
    w, h = W * px_per_cm, Ht * px_per_cm
    tris = []
    for f in faces:
        pts = " ".join(f"{uv[i, 0] * w:.1f},{uv[i, 1] * h:.1f}" for i in f)
        tris.append(f'<polygon points="{pts}"/>')
    grid = []
    for i in range(int(W) + 1):
        x = i * px_per_cm
        major = abs((i - W / 2) % 5) < 1e-6
        grid.append(f'<line x1="{x:.1f}" y1="0" x2="{x:.1f}" y2="{h:.1f}" class="{"g5" if major else "g1"}"/>')
    for j in range(int(math.floor(Ht)) + 1):
        y = j * px_per_cm
        grid.append(f'<line x1="0" y1="{y:.1f}" x2="{w:.1f}" y2="{y:.1f}" class="{"g5" if j % 5 == 0 else "g1"}"/>')
    title, sub, left, right = GUIDE[key]
    fs = max(w, h) / 62
    return f"""<!doctype html><meta charset="utf-8">
<style>html,body{{margin:0;background:transparent}}svg{{display:block}}
.g1{{stroke:rgba(255,120,60,.28);stroke-width:1}}.g5{{stroke:rgba(255,90,18,.55);stroke-width:1.4}}
.surf polygon{{fill:rgba(255,190,160,.42);stroke:rgba(255,190,160,.42);stroke-width:.6}}
text{{font-family:-apple-system,Helvetica,Arial,sans-serif;fill:#1a1a1a}}</style>
<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.1f} {h:.1f}">
<g class="surf">{''.join(tris)}</g>
<g>{''.join(grid)}</g>
<line x1="{w / 2:.1f}" y1="0" x2="{w / 2:.1f}" y2="{h:.1f}" stroke="#FF5A12" stroke-width="1.6" stroke-dasharray="8 6"/>
<rect x="1.5" y="1.5" width="{w - 3:.1f}" height="{h - 3:.1f}" fill="none" stroke="#1a1a1a" stroke-width="2" stroke-dasharray="10 7"/>
<text x="{fs * 0.9:.1f}" y="{fs * 1.7:.1f}" font-size="{fs * 1.25:.1f}" font-weight="800">{title}</text>
<text x="{fs * 0.9:.1f}" y="{fs * 3.0:.1f}" font-size="{fs * 0.8:.1f}">{W:g} × {Ht:g} cm · {sub}</text>
<text x="{fs * 0.9:.1f}" y="{fs * 4.1:.1f}" font-size="{fs * 0.8:.1f}">Grille : 1 cm / 5 cm · Surface rose = tissu imprimable · Hors surface : transparent</text>
<text x="{w - fs * 0.9:.1f}" y="{fs * 1.7:.1f}" font-size="{fs * 1.1:.1f}" font-weight="800" text-anchor="end">↑ HAUT</text>
<text x="{fs * 0.9:.1f}" y="{h - fs * 0.9:.1f}" font-size="{fs * 0.8:.1f}">{left}</text>
<text x="{w - fs * 0.9:.1f}" y="{h - fs * 0.9:.1f}" font-size="{fs * 0.8:.1f}" text-anchor="end">{right}</text>
</svg>"""


def render_templates(zone_meshes):
    chrome = find_chrome()
    if not chrome:
        print("Gabarits : Chrome absent — PNG existants conservés", flush=True)
        return
    profile = tempfile.mkdtemp(prefix="elembo-chrome-")
    try:
        for key, (ob, uv, faces) in zone_meshes.items():
            z = ZONES[key]
            W = z["W"]
            Ht = abs(z["s_top"] - z["s_bottom"])
            px = 1120 / max(W, Ht)
            html = os.path.join(profile, f"{key}.html")
            with open(html, "w") as fh:
                fh.write(template_svg(key, uv, faces, W, Ht, px))
            dest = os.path.join(OUT, f"uv-{key}.png")
            cmd = [chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
                   "--hide-scrollbars", "--force-device-scale-factor=1",
                   f"--window-size={round(W * px)},{round(Ht * px)}", f"--user-data-dir={profile}",
                   "--default-background-color=00000000", f"--screenshot={dest}", "file://" + html]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=90)
            if result.returncode != 0 or not os.path.exists(dest):
                print("Gabarit : échec Chrome pour", key, result.stderr[-300:], flush=True)
                continue
            pub = os.path.join(PUBLIC_ZONES, f"{key}.png")
            shutil.copyfile(dest, pub)
            subprocess.run(["sips", "-Z", "560", pub, "--out", pub], capture_output=True)
            print("Gabarit :", os.path.relpath(dest, ROOT), "→", os.path.relpath(pub, ROOT), flush=True)
    finally:
        shutil.rmtree(profile, ignore_errors=True)


# ─────────────────────────────────────────────────────────────────────────────
# Studio Cycles et aperçus
# ─────────────────────────────────────────────────────────────────────────────
def look_at(obj, target):
    d = Vector(target) - obj.location
    obj.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()


def create_studio(scene):
    studio = bpy.data.collections.new("STUDIO")
    scene.collection.children.link(studio)
    me = bpy.data.meshes.new("STUDIO_FLOOR")
    me.from_pydata([(-3, -3, 0), (3, -3, 0), (3, 3, 0), (-3, 3, 0)], [], [(0, 1, 2, 3)])
    floor = bpy.data.objects.new("STUDIO_FLOOR", me)
    studio.objects.link(floor)
    zmin = min((ob.matrix_world @ v.co).z for ob in bpy.data.collections["ELEMBO_CASQUETTE"].objects
               if ob.type == "MESH" for v in ob.data.vertices)
    floor.location = (0, 0, zmin - 0.0002)
    floor.is_shadow_catcher = True

    def area(name, loc, target, energy, size, color=(1, 1, 1)):
        ld = bpy.data.lights.new(name, "AREA")
        ld.energy = energy
        ld.size = size
        ld.color = color
        ob = bpy.data.objects.new(name, ld)
        studio.objects.link(ob)
        ob.location = loc
        look_at(ob, target)

    t = (0, -0.02, 0.05)
    area("LIGHT_KEY", (-0.45, -0.45, 0.55), t, 26, 0.45, (1.0, 0.97, 0.93))
    area("LIGHT_FILL", (0.55, -0.30, 0.25), t, 7, 0.7, (0.93, 0.96, 1.0))
    area("LIGHT_RIM", (0.25, 0.55, 0.45), t, 16, 0.3)
    area("LIGHT_TOP", (0, 0, 0.8), t, 9, 0.8)

    world = bpy.data.worlds.new("STUDIO_WORLD")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*hex_rgb("#D9D2C7"), 1)
    bg.inputs["Strength"].default_value = 0.45
    scene.world = world

    def camera(name, loc, target, lens=70):
        cd = bpy.data.cameras.new(name)
        cd.lens = lens
        ob = bpy.data.objects.new(name, cd)
        studio.objects.link(ob)
        ob.location = loc
        look_at(ob, target)

    camera("CAM_FRONT", (0.0, -0.62, 0.16), (0, -0.03, 0.055))
    camera("CAM_THREE_QUARTER", (0.44, -0.44, 0.24), (0, -0.02, 0.05))
    camera("CAM_BACK", (-0.14, 0.60, 0.17), (0, 0.0, 0.05))
    camera("CAM_SIDE", (0.62, -0.06, 0.12), (0, -0.02, 0.05))
    camera("CAM_TOP", (0.0, -0.36, 0.52), (0, -0.04, 0.03))
    camera("CAM_VITRINE", (0.50, -0.62, 0.25), (0.012, -0.03, 0.022), lens=58)

    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = RENDER_SAMPLES
    scene.cycles.use_denoising = True
    # Fond uni : rendu transparent (ombre portée conservée) composé sur la couleur studio.
    scene.render.film_transparent = True
    scene.use_nodes = True
    tree = scene.node_tree
    for n in list(tree.nodes):
        tree.nodes.remove(n)
    rl = tree.nodes.new("CompositorNodeRLayers")
    over = tree.nodes.new("CompositorNodeAlphaOver")
    over.name = "STUDIO_BG"
    comp = tree.nodes.new("CompositorNodeComposite")
    tree.links.new(rl.outputs["Image"], over.inputs[2])
    tree.links.new(over.outputs["Image"], comp.inputs["Image"])
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    # Vue « Standard » : la couleur du tissu et le fond sortent tels quels (AgX éclaircit les noirs).
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    set_exposure(scene, -1.7)


STUDIO_BG = "#ECE7DF"


def set_exposure(scene, ev):
    """Exposition de la vue ; le fond composé est compensé pour garder sa teinte exacte."""
    scene.view_settings.exposure = ev
    over = scene.node_tree.nodes.get("STUDIO_BG")
    if over is not None:
        k = 2.0 ** (-ev)
        over.inputs[1].default_value = (*[c * k for c in hex_rgb(STUDIO_BG)], 1)


def render_view(scene, cam, path):
    scene.camera = bpy.data.objects[cam]
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("Rendu :", os.path.relpath(path, ROOT), flush=True)


def add_preview_tint():
    """Après l'export : insère une teinte (multiplication) entre l'atlas et la couleur de base,
    pour que les rendus Cycles montrent la couleur comme l'atelier 3D."""
    for name in FABRIC_MATERIALS:
        m = bpy.data.materials[name]
        nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        link = next((l for l in nt.links if l.to_socket == bsdf.inputs["Base Color"]), None)
        if link is None:
            continue
        mix = nt.nodes.new("ShaderNodeMixRGB")
        mix.name = "TINT"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Fac"].default_value = 1.0
        mix.inputs["Color2"].default_value = (*hex_rgb(m["base_color_hex"]), 1)
        src = link.from_socket
        nt.links.remove(link)
        nt.links.new(src, mix.inputs["Color1"])
        nt.links.new(mix.outputs["Color"], bsdf.inputs["Base Color"])


def set_color(hex_color):
    for name in FABRIC_MATERIALS:
        m = bpy.data.materials[name]
        bsdf = m.node_tree.nodes["Principled BSDF"]
        bsdf.inputs["Base Color"].default_value = (*hex_rgb(hex_color), 1)
        tint = m.node_tree.nodes.get("TINT")
        if tint:
            tint.inputs["Color2"].default_value = (*hex_rgb(hex_color), 1)


def set_print_images(images):
    for key, img in images.items():
        m = bpy.data.materials[ZONES[key]["material"]]
        for n in m.node_tree.nodes:
            if n.type == "TEX_IMAGE" and n.image and n.image.name.startswith("print_"):
                n.image = img
            elif n.type == "TEX_IMAGE" and img is None:
                pass


def render_previews(scene):
    if not DO_PREVIEWS:
        return
    render_view(scene, "CAM_THREE_QUARTER", os.path.join(OUT, "preview-three-quarter.png"))
    render_view(scene, "CAM_FRONT", os.path.join(OUT, "preview-front.png"))
    render_view(scene, "CAM_BACK", os.path.join(OUT, "preview-back.png"))
    render_view(scene, "CAM_SIDE", os.path.join(OUT, "preview-side.png"))
    # Visuel de la fiche boutique (4:5), casquette noire, en JPEG.
    old = (scene.render.resolution_x, scene.render.resolution_y, scene.render.image_settings.file_format)
    scene.render.resolution_x, scene.render.resolution_y = 1600, 2000
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 86
    render_view(scene, "CAM_VITRINE", os.path.join(ROOT, "public/mockups/casquette-elembo-3d.jpg"))
    scene.render.resolution_x, scene.render.resolution_y, scene.render.image_settings.file_format = old
    # Contrôle des zones : les gabarits posés sur un tissu blanc.
    images = {}
    for key in ZONES:
        path = os.path.join(OUT, f"uv-{key}.png")
        if os.path.exists(path):
            images[key] = bpy.data.images.load(path)
    if images:
        set_color("#F2F1EC")
        set_print_images(images)
        render_view(scene, "CAM_THREE_QUARTER", os.path.join(QC, "zones-three-quarter.png"))
        render_view(scene, "CAM_TOP", os.path.join(QC, "zones-top.png"))
        render_view(scene, "CAM_BACK", os.path.join(QC, "zones-back.png"))


# ─────────────────────────────────────────────────────────────────────────────
# Programme principal
# ─────────────────────────────────────────────────────────────────────────────
def main():
    scene = reset_scene()
    root, product, zone_meshes = create_product(scene)

    tris = {}
    pts = []
    for ob in product.objects:
        if ob.type != "MESH":
            continue
        ob.data.calc_loop_triangles()
        tris[ob.name] = len(ob.data.loop_triangles)
        pts.extend(v.co for v in ob.data.vertices)
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))

    zones_out = {}
    for key, (ob, uv, faces) in zone_meshes.items():
        z = ZONES[key]
        Ht = abs(z["s_top"] - z["s_bottom"])
        zones_out[key] = {
            "mesh": z["mesh"],
            "material": z["material"],
            "label": z["label"],
            "texture_cm": [z["W"], Ht],
            "recommended_texture_px": [round(z["W"] / 2.54 * 300), round(Ht / 2.54 * 300)],
            "image_top": ("bord intérieur (côté calotte)" if key == "visor" else "côté sommet"),
            "s_top_cm": z["s_top"],
            "s_bottom_cm": z["s_bottom"],
            "s_reference": ("bord intérieur de la visière" if key == "visor" else "base de la calotte, le long du méridien"),
            "center_azimuth_deg": round(math.degrees(z.get("phi_c", 0.0)), 1),
            "isotropie": isotropy(ob, z["W"], Ht),
        }
        print("Zone", key, zones_out[key]["isotropie"], flush=True)

    meridien = {
        "avant_cm": round(float(meridian_s(np.array([0.0]), np.array([1.0]))[0]) * 100, 2),
        "cote_cm": round(float(meridian_s(np.array([math.pi / 2]), np.array([1.0]))[0]) * 100, 2),
        "arriere_cm": round(float(meridian_s(np.array([math.pi]), np.array([1.0]))[0]) * 100, 2),
        "haut_ouverture_arriere_cm": round(float(S_MIN_SORTED[360]) * 100, 2),
    }
    tour = np.linalg.norm(np.diff(crown_point(PHIS_SORTED, np.zeros_like(PHIS_SORTED)), axis=0), axis=-1).sum()
    data = {
        "product": "elembo-casquette",
        "version": "1.0",
        "units": "meters",
        "coordinate_system": {"up": "+Y", "front": "+Z", "wearer_left": "+X", "origin": "centre of the base, on the floor"},
        "dimensions_mm": {
            "width_x": round((hi.x - lo.x) * 1000, 1),
            "depth_with_visor": round((hi.y - lo.y) * 1000, 1),
            "height": round((hi.z - lo.z) * 1000, 1),
            "head_circumference": round(tour * 1000, 1),
            "crown_height": H * 1000,
            "visor_depth": VISOR_L * 1000,
            "back_opening": [ARCH_HALF_W * 2000, ARCH_H * 1000],
        },
        "meridiens": meridien,
        "uv": {
            "convention": "TEXCOORD_0 0..1 par zone, isotrope (cm de texture = cm de tissu) ; glTF V = 0 en haut de l'image",
            "u_increases": "vers la droite de l'observateur qui regarde la zone",
            "flipY": False,
        },
        "zones": zones_out,
        "colors": [{"name": n, "id": i, "hex": h} for n, i, h in COLORS],
        "fabric_materials": FABRIC_MATERIALS,
        "materials": {
            "CAP_FABRIC": "calotte (atlas de coutures, surpiqûres et œillets en multiplicateur)",
            "CAP_BUTTON": "bouton du sommet",
            "CAP_LINING": "doublure intérieure",
            "CAP_BINDING": "biais du bord et de l'ouverture arrière",
            "CAP_SWEATBAND": "bandeau intérieur",
            "CAP_VISOR": "dessus et tranche de la visière (surpiqûres)",
            "CAP_UNDERVISOR": "dessous de visière",
            "CAP_STRAP": "patte de fermeture et pressions",
            **{z["material"]: f"impression transparente — {z['label']}" for z in ZONES.values()},
        },
        "triangles": tris,
        "total_triangles": sum(tris.values()),
    }

    for ob in bpy.context.selected_objects:
        ob.select_set(False)
    for ob in [root, *product.objects]:
        ob.select_set(True)
    bpy.context.view_layer.objects.active = root
    glb_path = os.path.join(GLB_DIR, "elembo-casquette.glb")
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
    )
    data["glb_kib"] = os.path.getsize(glb_path) // 1024
    with open(os.path.join(OUT, "zones.json"), "w") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    print("Dimensions :", data["dimensions_mm"], "méridiens :", meridien, flush=True)
    print("Triangles :", data["total_triangles"], "GLB :", data["glb_kib"], "Kio", flush=True)

    if DO_TEMPLATES:
        render_templates(zone_meshes)
    add_preview_tint()
    create_studio(scene)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "elembo-casquette.blend"), relative_remap=True)
    render_previews(scene)


if __name__ == "__main__":
    main()
