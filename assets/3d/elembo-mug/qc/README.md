# QC evidence — ELEMBO mug

This folder contains the verification artefacts for the mug. The full machine-readable GLB validation is in `validation.json`; the browser test summary is in `browser-report.json`.

## Static GLB checks

```bash
python3 assets/3d/elembo-mug/qc/validate_glb.py
```

19 / 19 checks pass:

- names and hierarchy preserved;
- five expected materials, with a separate print material;
- one continuous print UV island with no overlap and exactly 1.0 UV area;
- glTF V = 0 at the top/rim, V = 1 at the foot; no vertical flip mistake;
- front U = 0.5 and +Z, back U = 0/1 and −Z (handle side), left = viewer left, right = viewer right;
- print band strictly between 7.5 and 87.5 mm above the floor;
- handle uses `MAT_MUG_HANDLE`, never `MAT_MUG_PRINT`;
- all images embedded, no external buffers, no cameras, lights, animations or Draco.

## Browser / three.js checks

Captured at 1600 × 1200 from the independent `viewer.html` in headless Chrome with WebGL 2 via SwiftShader, UI hidden with `?capture=1`.

| Screenshot | Test |
|---|---|
| `browser-front.png` | Transparent front artwork, upright, front opposite the handle |
| `browser-back.png` | Separate back composition on both sides of the handle |
| `browser-side-left.png`, `browser-side-right.png` | Left and right zones are independently addressable |
| `browser-fullwrap-front.png`, `browser-fullwrap-back.png` | Full-wrap graphic continues over the back seam |
| `browser-seam.png` | Strong seam-crossing test; continuous orange ring at U=1 → 0 |
| `browser-transparent-black.png` | Alpha PNG over black ceramic; no white background plate and no colour contamination |
| `browser-colors-interior.png` | Exterior red / interior cream / handle black / foot blue materials |
| `browser-colors-detail.png` | Same independent materials from a three-quarter view, including the now independently coloured foot band |
| `browser-uploaded-alpha.png` | A transparent PNG generated at runtime, converted to a `File`, decoded and uploaded to the print material |
| `browser-360-000.png` … `browser-360-270.png` | 360° turntable inspection at 0°, 90°, 180°, 270° |

Also included:

- `print-zone-map.png` — saturated UV/zone diagnostic texture used for `preview-print.png`.
- `print-zone-map.html` — source of that diagnostic texture.
- `validation.json` — complete automatic report.
- `browser-report.json` — browser test summary and exact material state.

The headless test environment emits SwiftShader GPU-stall performance warnings on its own; there are no page errors, failed model loads or JavaScript exceptions in the final run.

- `final-webgl-load.png` — final clean load of the exported GLB through the shipped viewer after the last build (0 page errors, 24,292 triangles).
