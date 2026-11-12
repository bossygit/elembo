#!/usr/bin/env python3
"""Static QA for public/models/elembo-mug/elembo-mug.glb (no external dependency)."""
import json
import math
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
GLB = ROOT / "public/models/elembo-mug/elembo-mug.glb"
raw = GLB.read_bytes()
magic, version, length = struct.unpack_from("<III", raw, 0)
assert magic == 0x46546C67 and version == 2 and length == len(raw)
offset = 12
j = binary = None
while offset < length:
    chunk_len, chunk_type = struct.unpack_from("<II", raw, offset)
    payload = raw[offset + 8 : offset + 8 + chunk_len]
    if chunk_type == 0x4E4F534A:
        j = json.loads(payload.decode("utf-8"))
    elif chunk_type == 0x004E4942:
        binary = payload
    offset += 8 + chunk_len
assert j and binary

COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
FORMATS = {5121: ("B", 1), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4), 5120: ("b", 1)}


def accessor(index):
    a = j["accessors"][index]
    bv = j["bufferViews"][a["bufferView"]]
    fmt, size = FORMATS[a["componentType"]]
    comps = COMPONENTS[a["type"]]
    stride = bv.get("byteStride") or comps * size
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    return [
        struct.unpack_from("<" + fmt * comps, binary, base + i * stride)
        for i in range(a["count"])
    ]


def mesh_by_name(name):
    for mesh in j["meshes"]:
        if mesh.get("name") == name:
            return mesh
    raise KeyError(name)


def primitive_material(mesh):
    return j["materials"][mesh["primitives"][0]["material"]]


report = {"file": str(GLB.relative_to(ROOT)), "bytes": len(raw), "nodes": [], "meshes": {}, "checks": {}}
for node in j.get("nodes", []):
    report["nodes"].append(node.get("name"))
report["materials"] = [m.get("name") for m in j.get("materials", [])]
report["extensionsUsed"] = j.get("extensionsUsed", [])
report["extensionsRequired"] = j.get("extensionsRequired", [])

tri_count = 0
for mesh in j["meshes"]:
    prim = mesh["primitives"][0]
    pos = accessor(prim["attributes"]["POSITION"])
    idx = accessor(prim["indices"])
    tris = len(idx) // 3
    tri_count += tris
    mn = [min(p[k] for p in pos) for k in range(3)]
    mx = [max(p[k] for p in pos) for k in range(3)]
    uv_sets = sorted(k for k in prim["attributes"] if k.startswith("TEXCOORD_"))
    material = j["materials"][prim["material"]].get("name")
    info = {
        "triangles": tris,
        "vertices": len(pos),
        "material": material,
        "uvSets": uv_sets,
        "bbox": {"min": [round(v, 6) for v in mn], "max": [round(v, 6) for v in mx]},
    }
    report["meshes"][mesh.get("name")] = info

# Print surface-specific checks.
p = mesh_by_name("MUG_PRINT_SURFACE")["primitives"][0]
pos = accessor(p["attributes"]["POSITION"])
uv = accessor(p["attributes"]["TEXCOORD_0"])
uv1 = accessor(p["attributes"]["TEXCOORD_1"])
idx = [i[0] for i in accessor(p["indices"])]
mins = [min(v[k] for v in uv) for k in range(2)]
maxs = [max(v[k] for v in uv) for k in range(2)]
top = [uv[i] for i in range(len(pos)) if abs(pos[i][1] - max(q[1] for q in pos)) < 1e-6]
bottom = [uv[i] for i in range(len(pos)) if abs(pos[i][1] - min(q[1] for q in pos)) < 1e-6]
front = [pos[i] for i in range(len(pos)) if abs(uv[i][0] - 0.5) < 1e-6 and abs(uv[i][1] - 0.5) < 0.01]
back = [pos[i] for i in range(len(pos)) if (abs(uv[i][0]) < 1e-6 or abs(uv[i][0] - 1) < 1e-6) and abs(uv[i][1] - 0.5) < 0.01]
sides = {
    "u_front": 0.5,
    "u_back": 0.0,
    "front_position": [round(v, 6) for v in (front[0] if front else (0, 0, 0))],
    "back_position": [round(v, 6) for v in (back[0] if back else (0, 0, 0))],
    "left_position": [round(v, 6) for v in min(pos, key=lambda q: (q[0] + 99, abs(q[1] - .047)))],
    "right_position": [round(v, 6) for v in max(pos, key=lambda q: (q[0] - 99, abs(q[1] - .047)))],
}
left = [pos[i] for i in range(len(pos)) if abs(uv[i][0] - .25) < 1e-6 and abs(uv[i][1] - .5) < 0.01]
right = [pos[i] for i in range(len(pos)) if abs(uv[i][0] - .75) < 1e-6 and abs(uv[i][1] - .5) < 0.01]
sides["left_position"] = [round(v, 6) for v in (left[0] if left else (0, 0, 0))]
sides["right_position"] = [round(v, 6) for v in (right[0] if right else (0, 0, 0))]

# Overlap test: triangle centroids must not fall inside another triangle in UV.
tri_uv = [(uv[idx[i]], uv[idx[i + 1]], uv[idx[i + 2]]) for i in range(0, len(idx), 3)]


def point_in_tri(pt, tri):
    (x, y) = pt
    (x1, y1), (x2, y2), (x3, y3) = tri
    d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
    if abs(d) < 1e-12:
        return False
    a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d
    b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d
    return a >= -1e-8 and b >= -1e-8 and a + b <= 1 + 1e-8


overlaps = 0
for n, tri in enumerate(tri_uv):
    cx = sum(p[0] for p in tri) / 3
    cy = sum(p[1] for p in tri) / 3
    for m, other in enumerate(tri_uv):
        if n == m:
            continue
        if min(p[0] for p in other) <= cx <= max(p[0] for p in other) and min(p[1] for p in other) <= cy <= max(p[1] for p in other):
            if point_in_tri((cx, cy), other):
                overlaps += 1
                break
uv_areas = []
for tri in tri_uv:
    (x1, y1), (x2, y2), (x3, y3) = tri
    uv_areas.append(abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)) / 2)

# Connectivity (one UV island = one connected component via shared positions/faces).
parent = list(range(len(pos)))


def find(a):
    while parent[a] != a:
        parent[a] = parent[parent[a]]
        a = parent[a]
    return a


def union(a, b):
    a, b = find(a), find(b)
    if a != b:
        parent[b] = a


for k in range(0, len(idx), 3):
    a, b, c = idx[k : k + 3]
    union(a, b)
    union(b, c)
components = len({find(i) for i in range(len(pos))})

report["print_surface"] = {
    "mesh": "MUG_PRINT_SURFACE",
    "material": primitive_material(mesh_by_name("MUG_PRINT_SURFACE")).get("name"),
    "uv_bounds": [round(mins[0], 8), round(mins[1], 8), round(maxs[0], 8), round(maxs[1], 8)],
    "uv_area_sum": round(sum(uv_areas), 6),
    "uv_overlap_centroids": overlaps,
    "uv_island_components": components,
    "uv0_image_orientation": {
        "top_vertices_v": sorted({round(v[1], 6) for v in top}),
        "bottom_vertices_v": sorted({round(v[1], 6) for v in bottom}),
    },
    "front_center_u": sides["u_front"],
    "world": sides,
    "glaze_uv_set": "TEXCOORD_1",
    "glaze_uv_range": [round(min(v[k] for v in uv1), 4) for k in range(2)] + [round(max(v[k] for v in uv1), 4) for k in range(2)],
}
report["checks"] = {
    "one_uv_island": components == 1,
    "no_centroid_overlap": overlaps == 0,
    "uv_covers_rectangle": abs(sum(uv_areas) - 1.0) < 1e-4,
    "v_zero_is_top": all(abs(v[1]) < 1e-6 for v in top),
    "v_one_is_bottom": all(abs(v[1] - 1) < 1e-6 for v in bottom),
    "front_is_plus_z": sides["front_position"][2] > 0.04,
    "back_is_minus_z_handle_side": sides["back_position"][2] < -0.04,
    "left_is_minus_x_viewer_left": sides["left_position"][0] < -0.04,
    "right_is_plus_x_viewer_right": sides["right_position"][0] > 0.04,
    "print_above_foot": min(p[1] for p in pos) >= 0.0074,
    "print_below_rim": max(p[1] for p in pos) <= 0.0876,
    "print_material_separate": primitive_material(mesh_by_name("MUG_PRINT_SURFACE"))["extras"].get("print_zone") == "full_wrap",
    "print_material_name": primitive_material(mesh_by_name("MUG_PRINT_SURFACE")).get("name") == "MAT_MUG_PRINT",
    "handle_never_gets_print_material": all(
        j["materials"][prim["material"]].get("name") != "MAT_MUG_PRINT"
        for mesh in j["meshes"]
        for prim in mesh["primitives"]
        if mesh.get("name") == "MUG_HANDLE"
    ),
    "embedded_images": all("bufferView" in image and "uri" not in image for image in j.get("images", [])),
    "no_external_buffers": all("uri" not in b for b in j.get("buffers", [])),
    "no_cameras_or_lights": not j.get("cameras") and not j.get("lights") and "KHR_lights_punctual" not in j.get("extensionsUsed", []),
    "no_animation": not j.get("animations"),
    "no_draco": "KHR_draco_mesh_compression" not in j.get("extensionsUsed", []),
}
report["triangles_total"] = tri_count
report["nodes_root"] = next((n for n in j["nodes"] if n.get("name") == "ELEMBO_MUG"), None)
report["samplers"] = j.get("samplers", [])
report["textures"] = j.get("textures", [])
report["images"] = [{"name": im.get("name"), "mimeType": im.get("mimeType")} for im in j.get("images", [])]
print(json.dumps(report, indent=2))
