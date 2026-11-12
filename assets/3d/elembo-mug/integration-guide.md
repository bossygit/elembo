# ELEMBO Mug — Customisable Ceramic Mug 11 oz

**Web-ready glTF asset and integration guide**  
Version 1.0 · Blender 4.5 LTS · three.js / React Three Fiber compatible

The ELEMBO mug is a complete, blank 330 ml ceramic mug generated procedurally in Blender. It is delivered with one continuous cylindrical print surface, independent ceramic materials, a ready-to-embed GLB, UV templates, studio previews and a standalone Three.js test viewer.

The artwork is intentionally **not baked into the model**. A blank, fully transparent print layer is shipped in the GLB and is designed to be replaced at runtime by the configurator.

---

## 1. Files

| File | Purpose |
|---|---|
| `public/models/elembo-mug/elembo-mug.glb` | Web asset. 24 292 triangles, 702 KiB, five meshes, embedded PBR material. |
| `assets/3d/elembo-mug/elembo-mug.blend` | Editable Blender project: product, materials, studio, composition setup, six cameras. |
| `assets/3d/elembo-mug/uv-mug-print.png` | Main cylindrical print template, exactly the printable texture aspect: 3072 × 954 px (257.6 × 80 mm). |
| `assets/3d/elembo-mug/uv-mug-zones.png` | Visual zone guide. Printed area map 3072 × 954 px under a 3072 × 246 px legend. |
| `assets/3d/elembo-mug/preview-front.png` | Blank front product view, 1200 × 1500 px. |
| `assets/3d/elembo-mug/preview-back.png` | Blank back / handle-side product view, 1200 × 1500 px. |
| `assets/3d/elembo-mug/preview-three-quarter.png` | Blank three-quarter product view, 1200 × 1500 px. |
| `assets/3d/elembo-mug/preview-top.png` | Blank top view of rim and interior, 1200 × 1200 px. |
| `assets/3d/elembo-mug/preview-handle.png` | Additional handle-detail view, 1200 × 1500 px. |
| `assets/3d/elembo-mug/preview-print.png` | Additional diagnostic render using the print-zone map on the mug. |
| `assets/3d/elembo-mug/viewer.html` | Independent Three.js material/print test viewer with upload, presets and 360° inspection. |
| `assets/3d/elembo-mug/build.py` | Reproducible Blender generation script (geometry, UVs, materials, GLB, .blend, studio, previews, UV template rasterisation). |
| `assets/3d/elembo-mug/zones.json` | Machine-readable dimensions, UV ranges and material/zone metadata. |
| `assets/3d/elembo-mug/_uv.json` | Print mesh UV triangles and outline. |
| `assets/3d/elembo-mug/uv-template.html` | Source of the two UV PNGs, editable at 3072 px width. |
| `assets/3d/elembo-mug/textures/` | Embedded source maps: glaze micro-normal and transparent print placeholder. |
| `assets/3d/elembo-mug/qc/` | Validation report, browser screenshots, final WebGL load check and print diagnostic files. |

**Template use:** both UV PNGs are reference/guide images, not customer artwork. Use the 3072 × 954 canvas proportions for production artwork and hide the guides before exporting. `uv-mug-zones.png` includes a 246 px legend above the exact 3072 × 954 printable map.

In Next.js the GLB is served from:

```text
/models/elembo-mug/elembo-mug.glb
```

`public/` is not part of the URL.

---

## 2. Quick start

### Three.js test viewer

The viewer imports the local three.js installation. Serve the repository root:

```bash
python3 -m http.server 8765 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:8765/assets/3d/elembo-mug/viewer.html
```

Optional URL parameters:

| Parameter | Value |
|---|---|
| `view` | `front`, `back`, `three-quarter`, `handle`, `top`, `print` |
| `preset` | `front`, `back`, `sides`, `full`, `seam`, `transparent` |
| `surface` + `color` | e.g. `surface=exterior&color=%23B3262D` |
| `capture=1` | Hide all UI for clean screenshots |
| `autorotate=1` | Start the turntable |

The viewer exposes `window.__elemboQC` for automated QA:

```js
__elemboQC.ready
__elemboQC.triangles
__elemboQC.objects
__elemboQC.materials
__elemboQC.materialSnapshot()
__elemboQC.bounds()
__elemboQC.state()
__elemboQC.setView(name)
__elemboQC.setAzimuth(degrees, elevation)
__elemboQC.setColor(surface, "#RRGGBB")
__elemboQC.setPreset(name)
__elemboQC.uploadFile(file)
```

If you copy `viewer.html` outside this repository, update the `importmap` paths (`three` and `three/addons/`) to a CDN or to your own copy of three.js. Also adjust `MODEL_URL` if the GLB moves.

### Quick use in three.js

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltf = await new GLTFLoader().loadAsync('/models/elembo-mug/elembo-mug.glb');
const mug = gltf.scene.getObjectByName('ELEMBO_MUG');
scene.add(mug);

const byName = new Map();
mug.traverse((object) => {
  if (!object.isMesh) return;
  object.material = [object.material].flat().map((material) => material.clone());
  for (const material of [object.material].flat()) byName.set(material.name, material);
});

byName.get('MAT_MUG_CERAMIC').color.set('#B3262D');
// The print material and the artwork are untouched.
```

For multiple mug instances, clone both the scene graph and its materials. The GLTFLoader cache is shared.

---

## 3. Product specification

All dimensions are metres in the GLB; millimetres are used in this document.

| Property | Value |
|---|---|
| Nominal capacity | **330 ml / 11 oz** |
| Brimful capacity | **371 ml** |
| Recommended fill headspace | ≈ **9.6 mm** below the rim |
| Height, base to rim | **95.0 mm** |
| Ceramic outer diameter | **82.0 mm** |
| Outer diameter including the 0.1 mm print layer | **82.2 mm** |
| Inner diameter at the lip | **73.7 mm** |
| Inner diameter mid-wall | **74.0 mm** |
| Wall thickness | **4.0 mm** |
| Foot contact-ring diameter | **72.2 mm** |
| Handle | Ergonomic C-shaped, separate mesh |
| Handle projection beyond the wall | ≈ **37.5 mm** |
| Overall bounding box | **82.2 × 95.0 × 119.7 mm** (X × Y × Z) |
| Print band above the base | **7.5 mm → 87.5 mm** (80.0 mm tall) |
| Material | Glazed ceramic, PBR |

The object root is at the **centre of the base, on the floor** (Y = 0).  
The body is a straight-sided cylinder with a rounded foot transition and a rounded lip. The interior floor, inner wall and foot are modelled.

> Capacity is calculated to the rim: 371.3 ml. A 330 ml serving leaves about 9.6 mm of headspace, which is the intended nominal coffee capacity.

---

## 4. Coordinate system, hierarchy and naming

glTF convention after Blender’s Y-up export:

```text
+X = viewer’s right when looking at the front of the mug
+Y = up
+Z = FRONT (the printable display face)
-Z = BACK / handle side
origin = centre of the base, at floor level
```

| Node | Mesh | Material | Role |
|---|---|---|---|
| `ELEMBO_MUG` | — | — | Empty root. All product meshes are direct children. |
| `MUG_BODY` | `MUG_BODY` | `MAT_MUG_CERAMIC` | Watertight ceramic body, outer wall, rounded rim, hidden interior backing. |
| `MUG_HANDLE` | `MUG_HANDLE` | `MAT_MUG_HANDLE` | Independent C-shaped handle. **Never receives the print material.** |
| `MUG_INTERIOR` | `MUG_INTERIOR` | `MAT_MUG_INTERIOR` | Flush interior liner surface: inner wall + inner floor, offset 0.10 mm into the cavity. |
| `MUG_BOTTOM` | `MUG_BOTTOM` | `MAT_MUG_BOTTOM` | Flush underside and foot band up to 7.6 mm above floor, offset 0.08 mm. |
| `MUG_PRINT_SURFACE` | `MUG_PRINT_SURFACE` | `MAT_MUG_PRINT` | Single continuous cylindrical print layer, z = 7.5 → 87.5 mm, radius +0.10 mm. |

The material and mesh names above are preserved in the GLB. The studio objects (`STUDIO_*`, lights, cameras) are **not exported**; they exist only in the .blend.

### Why overlay meshes for the interior and bottom?

The object naming and independent recolouring requirements are satisfied by thin flush liners over the ceramic body. They follow the exact same profile as the body, are offset by 0.08–0.10 mm and are shaded smooth, so they read as one moulded ceramic object. They do not create visible gaps or cracks. Each liner has its own material and colour.

The print surface is a similar, extremely thin ceramic-print film. It is **not** a floating decal: its normals and curvature follow the body; it is offset by 0.10 mm to avoid z-fighting; it is transparent except where artwork is drawn. Changing the ceramic colour beneath it never tints the artwork.

---

## 5. Materials

All materials are glTF 2.0 PBR. The only extension used is `KHR_materials_clearcoat`, supported natively by three.js (`MeshPhysicalMaterial`). There are no Blender-only shader nodes, no procedural textures at runtime, no animations and no Draco.

| Material | Applies to | Base colour | Roughness | Clearcoat / roughness | Special |
|---|---|---|---|---|---|
| `MAT_MUG_CERAMIC` | Body + rim | `#F4F1EA` | 0.105 | 0.50 / 0.025 | Micro-normal glaze map |
| `MAT_MUG_INTERIOR` | Inner wall + floor | `#F4F1EA` | 0.170 | 0.35 / 0.050 | Micro-normal glaze map |
| `MAT_MUG_HANDLE` | Handle | `#F4F1EA` | 0.105 | 0.50 / 0.025 | Micro-normal glaze map |
| `MAT_MUG_BOTTOM` | Underside + foot band | `#F4F1EA` | 0.260 | 0.18 / 0.120 | Micro-normal glaze map |
| `MAT_MUG_PRINT` | Printable film | `#FFFFFF` | 0.235 | 0.22 / 0.080 | Alpha blend, 8×8 transparent placeholder map, normal map on `TEXCOORD_1` |

- `metallicFactor = 0` on every material.
- The ceramic normal map is 256 × 256 px, embedded in the GLB. It uses repeat tiling and a very low strength (0.14 on ceramic, 0.15 on print). It adds a subtle glazed orange-peel grain.
- The print material is `alphaMode: BLEND`. It is visible only where the uploaded PNG has alpha. The transparent regions show the ceramic and its colour.
- The print material has `baseColorFactor = #FFFFFF`; do not set it to the ceramic colour.

### Preset colours

The palette in `zones.json` and the viewer:

| Name | Hex |
|---|---|
| Blanc / Glazed white | `#F4F1EA` |
| Noir / Midnight | `#171719` |
| Crème | `#EADFC8` |
| Rouge / Elembo red | `#B3262D` |
| Bleu / Cobalt | `#1E3A63` |
| Vert / Forest | `#225C43` |
| Jaune / Saffron | `#F0C33C` |
| Orange Elembo | `#FF5A12` |
| Custom | any sRGB `#RRGGBB` |

### Independent colour customisation

```js
const SURFACE_MATERIAL = {
  exterior: 'MAT_MUG_CERAMIC',
  interior: 'MAT_MUG_INTERIOR',
  handle:   'MAT_MUG_HANDLE',
  foot:     'MAT_MUG_BOTTOM',
};

function setSurfaceColor(byName, surface, hex) {
  const material = byName.get(SURFACE_MATERIAL[surface]);
  if (!material) return;
  material.color.set(hex);      // sRGB CSS hex
  material.needsUpdate = true;
}

// Global ceramic colour: apply to all four ceramic surfaces, never to MAT_MUG_PRINT.
function setAllCeramic(byName, hex) {
  for (const name of Object.values(SURFACE_MATERIAL)) {
    byName.get(name).color.set(hex);
  }
}
```

The artwork stays unchanged because it lives in a different material and texture. The clearcoat, normals and roughness are preserved when only `.color` is changed.

---

## 6. UV mapping and print zones

### 6.1 Overview

`MUG_PRINT_SURFACE` has **one UV island** covering exactly the full printable rectangle.

| Property | Value |
|---|---|
| UV set for artwork | `TEXCOORD_0` / Blender `UVMap` |
| UV set for glaze normal | `TEXCOORD_1` / Blender `UV_GLAZE` |
| U range | `0.0 → 1.0`, wrapping around the full circumference |
| V range in glTF | `0.0` at the **rim-side top** → `1.0` at the **foot-side bottom** |
| Physical rectangle | **257.6 × 80.0 mm** (nominal ceramic circumference × print height; the 0.10 mm print film remains within production tolerance) |
| Recommended canvas | **3072 × 954 px**, aspect **3.2201**, ≈ 303 dpi |
| UV area | 1.0 |
| UV islands | 1 |
| Overlap | 0 |
| Seam | Behind the handle, U = 0 / 1 |

The delivered template `uv-mug-print.png` already has the exact canvas aspect. **Do not use a square texture**: it would be stretched horizontally.

### 6.2 U = circumference

The seam is hidden at the back, under the handle.

| U | World angle | Physical location (front view) | Screen |
|---|---|---|---|
| `0.0 / 1.0` | 180° | Back centre / handle | behind the handle |
| `0.25` | −90° | Left side (world −X) | viewer’s left |
| `0.50` | 0° | Front centre (world +Z) | centre |
| `0.75` | +90° | Right side (world +X) | viewer’s right |

Formula for a glTF point on the print wall:

```js
const u = ((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) % 1;
// front (+Z) → 0.5, right (+X) → 0.75, back (−Z) → 0.0, left (−X) → 0.25
```

Text is not mirrored: when viewed from the front, increasing U moves toward the viewer’s right. The textured text has been verified upright in Cycles and in three.js.

### 6.3 V = height, and the texture origin

This is the part that most integrations get wrong:

- In the GLB, **V = 0 is the top of the print band (rim side)**.
- **V = 1 is the bottom of the print band (foot side)**.
- The PNG image should therefore have the **rim at the top** and the **foot at the bottom**.
- In three.js, textures loaded for this asset must use **`flipY = false`** because that is the glTF convention.

The Blender file authors its UVs in Blender’s bottom-left convention; the glTF exporter performs the V flip. The resulting GLB has the values above. Use the exported GLB as the source of truth.

Physical mapping, with `yMm` measured from the floor:

```text
v = (87.5 − yMm) / 80.0        for 7.5 ≤ yMm ≤ 87.5
u = (atan2(x, z) + π) / (2π) mod 1
```

Image pixel mapping:

```text
canvasX = u * canvasWidth
canvasY = v * canvasHeight
```

Draw upright in the canvas: the top of the image is the rim. Do not vertical-flip a PNG before assigning it.

In Blender, the same PNG is loaded normally with the rim at the top; the glTF exporter converts Blender’s bottom-left V convention to glTF’s top-left V convention. If you replace the print texture in the `.blend`, do not flip the image manually. The web-side rule is the inverse-looking one: `flipY = false`.

### 6.4 Printable zones

All four display areas are **logical regions on one continuous print surface**. There is no geometry break, no second mesh and no seam line between them. Full-wrap artwork can cross every zone boundary. Zones are guides for a single image, a logo or a text block.

| Zone | Mesh/UV centre | U range (25 % bands) | World centre (mm) | Content-safe width × height |
|---|---|---|---|---|
| **01 · Full wrap** | U 0 → 1 | all | full circumference | 257.6 × 80 mm minus 4 mm top/bottom |
| **02 · Front** | U = **0.50** | 0.375 → 0.625 | (0, 47.5, +41.1) | Zone band 64.4 × 80 mm; content-safe **56.4 × 72.0 mm** (4 mm margins) |
| **03 · Back** | U = **0.0 / 1.0** | 0 → 0.125 and 0.875 → 1.0 | (0, 47.5, −41.1) | Split by the handle; use both side lobes |
| **04 · Left** | U = **0.25** | 0.125 → 0.375 | (−41.1, 47.5, 0) | Zone band 64.4 × 80 mm; content-safe **56.4 × 72.0 mm** (4 mm margins) |
| **05 · Right** | U = **0.75** | 0.625 → 0.875 | (+41.1, 47.5, 0) | Zone band 64.4 × 80 mm; content-safe **56.4 × 72.0 mm** (4 mm margins) |

The exact numerical values are in `zones.json`.

Recommended safe content bounds for a single-zone composition:

| Zone | Safe U (full-wrap fractions) | Safe glTF V |
|---|---|---|
| Front | 0.3905 → 0.6095 | 0.05 → 0.95 |
| Left | 0.1405 → 0.3595 | 0.05 → 0.95 |
| Right | 0.6405 → 0.8595 | 0.05 → 0.95 |
| Back, left lobe | 0.0000 → 0.1095 | 0.05 → 0.95 |
| Back, right lobe | 0.8905 → 1.0000 | 0.05 → 0.95 |

- **Safe top/bottom margin:** 4 mm (V = 0.05 / 0.95).
- **Per-zone side margin:** 4 mm, already encoded by the `safe_u` ranges (front/left/right content-safe width 56.4 mm). The zone coloured bands are 64.4 mm wide; the safe boxes are narrower. These are logical guides only.
- **Horizontal full-wrap padding:** none. U = 0 and U = 1 are the same physical line; adding a horizontal border introduces a visible line at the seam. If a single image is intended for one display zone, leave transparent space outside that zone instead of creating new geometry.
- **Handle exclusion:** U = 0 → 0.035 and U = 0.965 → 1.0, glTF V ≈ 0.119 → 0.870 (approximately 18–78 mm above the base). Keep critical artwork out of this region. The handle is a separate mesh and never receives the print texture.

### 6.5 The seam

The seam is hidden under the handle. Because the full-wrap texture repeats, U = 0 and U = 1 meet at the back:

```js
texture.wrapS = THREE.RepeatWrapping;      // required for the 360° seam
texture.wrapT = THREE.ClampToEdgeWrapping; // avoid bleeding above/below the print band
texture.flipY = false;
texture.colorSpace = THREE.SRGBColorSpace;
```

If your artwork crosses the seam, make its left and right edge pixels match. The viewer’s **Seam crossing** preset demonstrates a continuous orange ring that is literally split across U = 1 → 0 and rejoined on the back.

---

## 7. Replacing the print texture

### 7.1 The three.js path

```js
import * as THREE from 'three';

function setPrintTexture(root, source, renderer) {
  const mesh = root.getObjectByName('MUG_PRINT_SURFACE');
  const material = mesh.material;

  const texture = source instanceof HTMLCanvasElement
    ? new THREE.CanvasTexture(source)
    : new THREE.Texture(source);

  texture.flipY = false;                          // glTF UV origin: top-left
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;           // continuous 360° seam
  texture.wrapT = THREE.ClampToEdgeWrapping;      // keep clean at rim/foot
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;

  material.map?.dispose();
  material.map = texture;
  material.color.set('#FFFFFF'); // never tint the ink
  material.transparent = true;
  material.depthWrite = false;
  material.needsUpdate = true;
}

setPrintTexture(root, myFullWrapCanvas, renderer);
```

The print mesh already sits 0.10 mm above the ceramic. Do not also move it or create a new decal plane unless your pipeline specifically requires one. If you see shimmering with very tight depth ranges, enable polygon offset on the print material (`polygonOffset = true`, `polygonOffsetFactor = -1`, `polygonOffsetUnits = -1`); the geometry offset normally makes this unnecessary.

To update an editor preview without re-creating the texture, keep the same `CanvasTexture`, redraw its canvas and set `texture.needsUpdate = true`. This avoids GPU allocation churn and memory leaks.

To clear the print, draw fully transparent pixels into the canvas and set `needsUpdate = true`. Alternatively assign a 1 × 1 transparent texture.

### 7.2 Canvas composition

The easiest integration with the ELEMBO configurator is a single full-wrap canvas:

```js
const W = 3072, H = 954; // exact 257.6 × 80 mm aspect
const canvas = document.createElement('canvas');
canvas.width = W;
canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.clearRect(0, 0, W, H);

// U=0.5 front centre, with the standard 4 mm safety Y.
const cx = 0.5 * W;
const cy = 0.5 * H;

// Draw your logo, image or text upright; image top = rim side.
drawMyLogo(ctx, cx, cy);

// Example: a second, independent back design placed in the two back lobes.
drawBackMark(ctx, 0.06 * W, 0.35 * H);
drawBackMark(ctx, 0.94 * W, 0.35 * H);
```

Helpful zone helpers:

```js
const rect = (u0, v0, u1, v1) => ({
  x: u0 * W, y: v0 * H, w: (u1 - u0) * W, h: (v1 - v0) * H,
});

// Front content-safe rectangle in glTF UV space:
const front = rect(0.3905, 0.05, 0.6095, 0.95); // 56.4 × 72 mm content area
```

A square logo canvas uploaded by the customer should be drawn with `contain` inside the front safe rectangle, preserving its aspect; never stretch it to fill the 3.22:1 full wrap.

For a full-wrap design, the left/right canvas edges are the same physical point. Draw a matching band or repeat a motif so that pixel column 0 and column 3071 join seamlessly.

### 7.3 Transparent PNGs

Alpha is preserved. Leave the full-wrap canvas transparent outside the artwork and draw the uploaded PNG normally:

```js
ctx.drawImage(uploadedImage, x, y, w, h);
```

The white/coloured glaze below shows through. This is what the viewer’s **PNG alpha** test demonstrates; on a black mug the transparent background is clearly the black ceramic, not a white rectangle.

### 7.4 Print scale and distortion

- The UV mapping is cylindrical and locally isotropic when the canvas has the recommended 3.2201 aspect.
- A 100 × 100 px square at 3072 × 954 prints as a square (~8.4 mm on this mug).
- A full-wrap PNG should be 3072 × 954 or a proportional multiple (e.g. 1536 × 477, 4096 × 1272). Above 4096 px, memory and upload time become significant.
- The design curves with the cylinder in perspective. That is correct physical projection, not UV distortion.
- The print band stops at 7.5 mm above the floor and 7.5 mm below the rim. Keep critical content inside the 4 mm safe margins; the rim and foot stay ceramic.

---

## 8. Three.js and React Three Fiber integration

### 8.1 Loading and sharing

```js
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/elembo-mug/elembo-mug.glb');

// The loaded scene is cached/shared; clone the graph and its materials per instance.
function makeMugInstance() {
  const root = gltf.scene.clone(true);
  const materials = new Map();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.material = [object.material].flat().map((material) => {
      const clone = material.clone();
      materials.set(clone.name, clone);
      return clone;
    });
    object.castShadow = object.name !== 'MUG_PRINT_SURFACE';
    object.receiveShadow = true;
  });
  return { root, materials };
}
```

The root `ELEMBO_MUG` is at the base centre. In a scene with a floor, place the mug at `y = 0` (or your floor height). The model is in metres; do not scale to “centimetres” unless your whole scene is authored that way.

### 8.2 Renderer

```js
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping; // avoids desaturating vivid print colours
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
```

Neutral tone mapping matches the rest of the ELEMBO configurator’s approach. Avoid ACES for this product: it significantly desaturates Elembo orange and rich customer artwork. Use a soft PMREM environment (e.g. `RoomEnvironment`) plus area/softbox lighting. A directional key, a low fill and a rim/back light reproduce the look of the studio previews.

For shadow contact, use a soft shadow under the foot. The GLB contains no ground plane.

### 8.3 Colours

```js
function setMugColor(materials, hex) {
  for (const name of [
    'MAT_MUG_CERAMIC',
    'MAT_MUG_INTERIOR',
    'MAT_MUG_HANDLE',
    'MAT_MUG_BOTTOM',
  ]) {
    const material = materials.get(name);
    if (material) material.color.set(hex);
  }
}
```

Keep `MAT_MUG_PRINT` out of this loop. For per-surface customisation, set only the corresponding material.

### 8.4 React Three Fiber

```jsx
import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';

function ElemboMug({ color = '#F4F1EA', canvas, surface = 'all' }) {
  const gl = useThree((state) => state.gl);
  const { scene } = useGLTF('/models/elembo-mug/elembo-mug.glb');

  const root = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((object) => {
      if (!object.isMesh) return;
      object.material = [object.material].flat().map((material) => material.clone());
      object.castShadow = object.name !== 'MUG_PRINT_SURFACE';
      object.receiveShadow = true;
    });
    return copy;
  }, [scene]);

  useEffect(() => {
    root.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of [object.material].flat()) {
        if (material.name !== 'MAT_MUG_PRINT') material.color.set(color);
      }
    });
  }, [root, color]);

  useEffect(() => {
    if (!canvas) return;
    const texture = new THREE.CanvasTexture(canvas);
    texture.flipY = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    texture.needsUpdate = true;

    const print = root.getObjectByName('MUG_PRINT_SURFACE');
    const material = [print.material].flat()[0];
    material.map?.dispose();
    material.map = texture;
    material.color.set('#FFFFFF');
    material.transparent = true;
    material.depthWrite = false;
    material.needsUpdate = true;
  }, [root, canvas, gl]);

  return <primitive object={root} position={[0, 0, 0]} />;
}
```

For per-part colours, do not recolour every mesh; target the four ceramic material names individually.

### 8.5 Camera and framing

Useful framing presets in metres (look-at around `(0, 0.048, 0)`):

| View | Suggested camera position | Notes |
|---|---|---|
| Front | `(0, 0.15, 0.36)` | Opposite handle; print U = 0.5 centred. |
| Back | `(0.07, 0.13, -0.35)` | Handle visible; back zone is split around it. |
| Three-quarter | `(0.36, 0.17, 0.20)` | Front-right; handle on screen right. |
| Handle | `(0.29, 0.15, 0.23)` | Rear-right; shows the C profile. |
| Top | `(0.08, 0.34, 0.16)` | Interior and rim. |

The Blender camera names are `CAM_FRONT`, `CAM_BACK`, `CAM_THREE_QUARTER`, `CAM_HANDLE`, `CAM_TOP` and `CAM_PRINT`.

---

## 9. Testing evidence (QC)

### Static GLB validation

Run:

```bash
python3 assets/3d/elembo-mug/qc/validate_glb.py
```

The full output is in `qc/validation.json`. All 19 automatic checks pass, including:

- five meshes with the expected names;
- five expected materials, with the print material separate;
- 24 292 triangles total;
- one connected UV island covering exactly 1.0 UV area, with 0 overlap detections;
- V = 0 exactly at the top/rim ring and V = 1 at the bottom;
- front at +Z / U = 0.5; back at −Z / handle; left = viewer’s left; right = viewer’s right;
- print mesh strictly above the foot and below the rim;
- handle never uses `MAT_MUG_PRINT`;
- all images embedded, no external buffers, no cameras/lights/animations, no Draco;
- transparent print material with alpha blend.

### Real-time browser tests

The `qc/` folder contains screenshots from a headless Chromium WebGL 2 run:

- `browser-front.png` — front transparent PNG artwork, upright and unmirrored.
- `browser-back.png` — back mark placed either side of the handle.
- `browser-side-left.png` / `browser-side-right.png` — independent side artwork.
- `browser-fullwrap-front.png` / `browser-fullwrap-back.png` — continuous full-wrap composition across the seam.
- `browser-seam.png` — a continuous ring crossing U = 1 → 0.
- `browser-transparent-black.png` — transparent PNG over a black body; artwork is not tinted.
- `browser-colors-interior.png`, `browser-colors-detail.png` — independent exterior, interior, handle and foot colours.
- `browser-uploaded-alpha.png` — runtime upload of a transparent PNG, decoded and applied.
- `browser-360-000.png`, `browser-360-090.png`, `browser-360-180.png`, `browser-360-270.png` — 360° inspection.
- `final-webgl-load.png` — final clean import of the delivered GLB after the last build; 0 page errors, 24 292 triangles.

The test report is `qc/browser-report.json`.

### What has been verified

- The front appears opposite the handle.
- Text is never mirrored or upside down.
- A 360° graphic remains continuous at the seam.
- Transparent PNG artwork preserves alpha and reveals the ceramic colour.
- The handle never receives the print texture.
- The print never covers the rim or foot.
- Ceramic colours can be changed without altering the artwork.
- The handle, interior and foot can be recoloured independently.
- The GLB loads and renders in Three.js / a real browser WebGL 2 context.

---

## 10. Build reproduction

### Blender

The script was built and tested with **Blender 4.5 LTS**. It uses only Blender’s bundled Python, `numpy`, `bmesh`, `bpy` and standard-library modules. No add-ons or external textures are required.

From the repository root:

```bash
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  -P assets/3d/elembo-mug/build.py -- \
  root="$PWD" previews=1 templates=1 samples=64
```

On another OS, replace the Blender executable path with your installation. Options:

| Option | Default | Meaning |
|---|---|---|
| `root` | current directory | Repository root |
| `previews` | `1` | Render the five blank studio views + diagnostic print view |
| `templates` | `1` | Rasterise the UV PNGs through local Chrome/Chromium |
| `samples` | `96` | Cycles samples per beauty view |
| `qc` | `1` | Reserved for optional QC passes; the delivered browser QC is in `qc/` |
| `scale` | `1` | Preview resolution multiplier (e.g. `0.5` for fast tests) |

The script regenerates:

- `public/models/elembo-mug/elembo-mug.glb`
- `assets/3d/elembo-mug/elembo-mug.blend`
- `zones.json` and `_uv.json`
- the previews, the UV template PNGs and the diagnostic print render

If Chrome/Chromium is not available, the script keeps the existing UV PNGs and still builds the 3D asset and previews. Set `CHROME_PATH` if your browser is in a non-standard location.

The .blend is saved **before** the temporary print-test renders. The shipped Blender project always opens with the blank print layer.

### Viewer

The viewer is intentionally dependency-light:

```text
viewer.html
   ├── imports three.js from ../../../node_modules/
   ├── loads ../../../public/models/elembo-mug/elembo-mug.glb
   └── generates test artwork procedurally in a canvas
```

For standalone deployment, modify the import map and `MODEL_URL`. The GLB itself has no external dependencies.

---

## 11. Production and artwork notes

- Artwork should be delivered as a transparent **PNG**, sRGB, 3072 × 954 px (or proportional), around 300 dpi at the stated physical size.
- Keep 4 mm top/bottom clearance. Keep critical art out of the handle keep-out at the U seam.
- The print texture is composed in the same 360° canvas; never scale a full-wrap image to a square.
- The front display is at U = 0.5, i.e. opposite the handle. If your UI displays a “front” artboard, its texture centre is exactly 50 % of the full-wrap canvas width.
- The handle area is excluded physically: the handle is a separate object and has no print material.
- For sublimation, the geometric print band is 7.5–87.5 mm above the base. Your press operator should use the template and preserve the 4 mm safe margins; the print surface radius offset is only 0.10 mm.
- The back zone is real but interrupted by the handle. For production books, treat it as two back lobes (`U 0 → 0.125` and `U 0.875 → 1`) unless the artwork intentionally wraps under the handle.

### Known limitations / intentional choices

1. **The handle-side back zone is split** by the handle; there is no printable “centre” directly behind the handle. This is a physical consequence of the product, not a mesh seam.
2. **No horizontal UV gutter**: a full wrap cannot have one without creating a seam. Use transparent edge padding only for single-zone art; a full-wrap design must tile.
3. **The print texture is an alpha-blended glazed layer**, not real displacement. It is offset 0.10 mm from the ceramic to avoid z-fighting. The effect is visually flush in the browser and studio previews.
4. **The model is not wired into the ELEMBO catalogue or checkout**. This delivery is the 3D asset, integration guide and test viewer: adding the mug to the current configurator requires a product entry and the mug-specific zone configuration described above.
5. **The studio is Blender-only.** Cameras, lights, compositor, shadow catcher and studio backdrop are in the .blend and are not part of the GLB. The web asset is deliberately limited to the product.

---

## 12. Version

| Field | Value |
|---|---|
| Product | ELEMBO Mug 11 oz |
| Asset version | 1.0 |
| Root node | `ELEMBO_MUG` |
| Print mesh | `MUG_PRINT_SURFACE` |
| Units | metres |
| glTF extensions | `KHR_materials_clearcoat` |
| Triangles | 24 292 |
| GLB size | ≈ 702 KiB |
| Texture inputs | 1 × 256 px glaze normal map, 1 × 8 px transparent print placeholder |
| Default print | fully transparent (blank glazed mug) |
| UV aspect | 3072 : 954 (257.6 : 80 mm) |
| Last generated | 2026-11-12 |
