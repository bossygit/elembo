"""
Studio, aperçus produit et rendus de contrôle du T-shirt Elembo (Cycles).

    Blender -b assets/3d/elembo-tshirt/elembo-tshirt.blend \
        -P scripts/blender/elembo-tshirt/render.py -- [samples=96] [qc=1] [previews=1]

1. Ajoute au .blend un studio : 5 caméras nommées, éclairage 3 points, fond neutre ;
   puis ré-enregistre le .blend (sans visuels de test).
2. Aperçus du T-shirt vierge : preview-front.png, preview-back.png,
   preview-three-quarter.png, preview-sleeves.png.
3. Contrôle qualité (qc/) : un visuel de test différent par zone, plusieurs couleurs de
   tissu ; ces rendus ne sont pas enregistrés dans le .blend.
"""

import math
import os
import sys

import bpy
import numpy as np
from mathutils import Vector

ARGS = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
OPT = dict(a.split("=", 1) if "=" in a else (a, "1") for a in ARGS)
OUT = os.path.dirname(bpy.data.filepath)
QC = os.path.join(OUT, "qc")
os.makedirs(QC, exist_ok=True)
SAMPLES = int(OPT.get("samples", "96"))
scene = bpy.context.scene

PRINTS = {
    "front": "TSHIRT_FRONT_PRINT",
    "back": "TSHIRT_BACK_PRINT",
    "left_sleeve": "TSHIRT_LEFT_SLEEVE_PRINT",
    "right_sleeve": "TSHIRT_RIGHT_SLEEVE_PRINT",
    "collar": "TSHIRT_COLLAR_PRINT",
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def set_fabric_color(hex_):
    h = hex_.lstrip("#")
    rgb = [srgb_to_linear(int(h[i : i + 2], 16) / 255) for i in (0, 2, 4)]
    for name in ("FABRIC", "FABRIC_RIB"):
        bpy.data.materials[name].node_tree.nodes["FABRIC_COLOR"].inputs["B"].default_value = (*rgb, 1)


def print_node(obj_name):
    mat = bpy.data.objects[obj_name].data.materials[0]
    for n in mat.node_tree.nodes:
        if n.type == "TEX_IMAGE" and n.image and n.image.name.startswith("print_"):
            return n
        if n.type == "TEX_IMAGE" and n.image and n.image.name.startswith("test-"):
            return n
    raise RuntimeError(obj_name)


def bbox(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


# ─────────────────────────────────────────────────────────────────────────────
# Studio
# ─────────────────────────────────────────────────────────────────────────────
def build_studio():
    coll = bpy.data.collections.get("STUDIO") or bpy.data.collections.new("STUDIO")
    if coll.name not in scene.collection.children:
        scene.collection.children.link(coll)
    for o in list(coll.objects):
        bpy.data.objects.remove(o)

    # Fond neutre vu par la caméra, éclairage d'ambiance gris plus sombre.
    world = bpy.data.worlds.get("STUDIO_WORLD") or bpy.data.worlds.new("STUDIO_WORLD")
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg_cam = nt.nodes.new("ShaderNodeBackground")
    bg_cam.inputs["Color"].default_value = (0.80, 0.79, 0.77, 1)  # ≈ #E8E6E3
    bg_cam.inputs["Strength"].default_value = 3.2
    bg_env = nt.nodes.new("ShaderNodeBackground")
    bg_env.inputs["Color"].default_value = (0.55, 0.55, 0.56, 1)
    bg_env.inputs["Strength"].default_value = 0.3
    lp = nt.nodes.new("ShaderNodeLightPath")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], mix.inputs["Fac"])
    nt.links.new(bg_env.outputs["Background"], mix.inputs[1])
    nt.links.new(bg_cam.outputs["Background"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    scene.world = world

    def area(name, loc, energy, size, color=(1, 1, 1)):
        d = bpy.data.lights.new(name, "AREA")
        d.energy = energy
        d.size = size
        d.color = color
        o = bpy.data.objects.new(name, d)
        o.location = loc
        o.rotation_euler = (-Vector(loc)).to_track_quat("-Z", "Y").to_euler()
        coll.objects.link(o)

    area("LIGHT_KEY", (-1.8, -2.0, 1.4), 380, 1.6, (1.0, 0.98, 0.95))
    area("LIGHT_FILL", (2.2, -1.6, 0.3), 90, 2.2, (0.95, 0.97, 1.0))
    area("LIGHT_RIM", (0.9, 2.4, 1.8), 420, 1.2)
    area("LIGHT_TOP", (0.0, -0.3, 2.6), 60, 2.5)

    garment = [bpy.data.objects["TSHIRT_BODY"]]
    lo, hi = bbox(garment)
    center = (lo + hi) / 2
    height = hi.z - lo.z
    width = hi.x - lo.x

    def camera(name, direction, target, dist, lens=85):
        d = bpy.data.cameras.new(name)
        d.lens = lens
        d.sensor_width = 36
        o = bpy.data.objects.new(name, d)
        direction = Vector(direction).normalized()
        o.location = target + direction * dist
        o.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        coll.objects.link(o)
        return o

    # Portrait 4:5, objectif 85 mm : en portrait, les 36 mm du capteur couvrent la hauteur.
    fov_v = 2 * math.atan(18 / 85)
    fov_h = 2 * math.atan(18 * 4 / 5 / 85)
    dist = max((height * 1.16 / 2) / math.tan(fov_v / 2), (width * 1.08 / 2) / math.tan(fov_h / 2)) + 0.15
    camera("CAM_FRONT", (0, -1, 0.04), center, dist)
    camera("CAM_BACK", (0, 1, 0.04), center, dist)
    camera("CAM_THREE_QUARTER", (-0.62, -1, 0.18), center, dist)
    for side, sign in (("LEFT", 1), ("RIGHT", -1)):
        sl = bpy.data.objects[f"TSHIRT_{side}_SLEEVE_PRINT"]
        slo, shi = bbox([sl])
        c = (slo + shi) / 2
        camera(f"CAM_{side}_SLEEVE", (sign * 1.0, -0.35, 0.45), c, 1.15)
    return coll


def setup_render(w, h):
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 6
    scene.render.resolution_x = w
    scene.render.resolution_y = h
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    # « Standard » : couleurs sRGB des visuels restituées fidèlement (AgX les désature).
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = float(OPT.get("exposure", "-1.7"))
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"


def shoot(cam, path, w, h):
    setup_render(w, h)
    scene.camera = bpy.data.objects[cam]
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print("rendu :", path, flush=True)


def side_by_side(paths, out):
    imgs = []
    for p in paths:
        im = bpy.data.images.load(p)
        w, h = im.size
        imgs.append(np.array(im.pixels[:]).reshape(h, w, 4))
        bpy.data.images.remove(im)
    row = np.concatenate(imgs, 1)
    o = bpy.data.images.new("sbs", row.shape[1], row.shape[0])
    o.pixels.foreach_set(row.astype(np.float32).ravel())
    o.filepath_raw = out
    o.file_format = "PNG"
    o.save()
    bpy.data.images.remove(o)
    for p in paths:
        os.remove(p)


def main():
    build_studio()
    # Repère de simulation : jamais rendu.
    for name in ("MANNEQUIN_SIMULATION",):
        c = bpy.data.collections.get(name)
        if c:
            for o in c.objects:
                o.hide_render = True
    set_fabric_color("#F4F3EF")
    setup_render(1200, 1500)
    scene.camera = bpy.data.objects["CAM_FRONT"]
    bpy.ops.wm.save_mainfile()
    print("studio enregistré dans le .blend", flush=True)

    if OPT.get("previews", "1") == "1":
        shoot("CAM_FRONT", os.path.join(OUT, "preview-front.png"), 1200, 1500)
        shoot("CAM_BACK", os.path.join(OUT, "preview-back.png"), 1200, 1500)
        shoot("CAM_THREE_QUARTER", os.path.join(OUT, "preview-three-quarter.png"), 1200, 1500)
        a = os.path.join(OUT, "_l.png")
        b = os.path.join(OUT, "_r.png")
        shoot("CAM_LEFT_SLEEVE", a, 1000, 1000)
        shoot("CAM_RIGHT_SLEEVE", b, 1000, 1000)
        side_by_side([b, a], os.path.join(OUT, "preview-sleeves.png"))

    if OPT.get("qc", "1") == "1":
        # Un visuel de test différent par zone (non enregistré dans le .blend).
        for zone, obj in PRINTS.items():
            img = bpy.data.images.load(os.path.join(QC, f"test-{zone.replace('_', '-')}.png"))
            print_node(obj).image = img
        for hex_, tag in (("#1A1A1C", "noir"),):
            set_fabric_color(hex_)
            shoot("CAM_FRONT", os.path.join(QC, f"qc-front-{tag}.png"), 800, 1000)
            shoot("CAM_BACK", os.path.join(QC, f"qc-back-{tag}.png"), 800, 1000)
        set_fabric_color("#F4F3EF")
        shoot("CAM_THREE_QUARTER", os.path.join(QC, "qc-three-quarter-blanc.png"), 800, 1000)
        a = os.path.join(QC, "_l.png")
        b = os.path.join(QC, "_r.png")
        shoot("CAM_LEFT_SLEEVE", a, 800, 800)
        shoot("CAM_RIGHT_SLEEVE", b, 800, 800)
        side_by_side([b, a], os.path.join(QC, "qc-sleeves-blanc.png"))
        # Intérieur du col : caméra plongeante dans l'encolure, depuis l'avant.
        cam = bpy.data.objects["CAM_FRONT"].copy()
        cam.data = cam.data.copy()
        scene.collection.objects.link(cam)
        body = bpy.data.objects["TSHIRT_BODY"]
        lo, hi = bbox([body])
        target = Vector((0, 0.03, hi.z - 0.07))
        d = Vector((0, -0.55, 1.0)).normalized()
        cam.location = target + d * 0.75
        cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 70
        shoot(cam.name, os.path.join(QC, "qc-collar-blanc.png"), 800, 800)
        # Couleur changée : visuels inchangés
        frames = []
        for hex_, tag in (("#F2C230", "jaune"), ("#1F2A44", "marine"), ("#FF5A12", "orange"), ("#9C9EA1", "gris")):
            set_fabric_color(hex_)
            p = os.path.join(QC, f"_c-{tag}.png")
            shoot("CAM_FRONT", p, 480, 600)
            frames.append(p)
        side_by_side(frames, os.path.join(QC, "qc-colors-front.png"))
    print("terminé", flush=True)


main()
