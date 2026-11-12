"""
Exporte les UV d'impression (TEXCOORD_0) de chaque zone en JSON, pour dessiner les gabarits.

    Blender -b assets/3d/elembo-tshirt/elembo-tshirt.blend -P scripts/blender/elembo-tshirt/export_uv.py
"""

import json
import os

import bpy

OUT = os.path.dirname(bpy.data.filepath)
ZONES = {
    "front": "TSHIRT_FRONT_PRINT",
    "back": "TSHIRT_BACK_PRINT",
    "left_sleeve": "TSHIRT_LEFT_SLEEVE_PRINT",
    "right_sleeve": "TSHIRT_RIGHT_SLEEVE_PRINT",
    "collar": "TSHIRT_COLLAR_PRINT",
}
data = {}
for zone, name in ZONES.items():
    me = bpy.data.objects[name].data
    uv = me.uv_layers["UV_PRINT"].data
    tris, edges = [], {}
    for p in me.polygons:
        pts = [tuple(round(c, 5) for c in uv[i].uv) for i in p.loop_indices]
        tris.append(pts)
        vs = list(p.vertices)
        for k in range(len(vs)):
            key = tuple(sorted((vs[k], vs[(k + 1) % len(vs)])))
            edges.setdefault(key, []).append((pts[k], pts[(k + 1) % len(vs)]))
    # Contour : arêtes portées par une seule face.
    outline = [segs[0] for segs in edges.values() if len(segs) == 1]
    data[zone] = {"faces": tris, "outline": outline}
with open(os.path.join(OUT, "_uv.json"), "w") as fh:
    json.dump(data, fh)
print("UV exportés :", {z: len(d["faces"]) for z, d in data.items()})
