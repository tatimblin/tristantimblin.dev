# head

The L4 3D → line route: a scanned head read from a `.glb`, welded, cut into
plane slices, outlined by its silhouette edges, hidden lines removed by a
z-buffer, and projected orthographically onto the 400×400 panel, through
[`tools/scenes/lib/mesh-lines.ts`](../lib/mesh-lines.ts). `bun run scenes:bake`
writes `theme/design-system/src/scenes/head.svg`; `bun run scenes:check`
fails when this directory or its output has drifted.

## Credits

- **The model** — `head.glb` is the **Lee Perry-Smith head scan** by
  [Infinite-Realities](https://ir-ltd.net/), licensed
  **[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)** — attribution
  is required, and the credit line in the baked file's header — *Lee
  Perry-Smith head scan by Infinite-Realities, CC BY 3.0* — is what `Scene`
  shows under the drawing wherever the scene is used. Do not drop it. The
  file is byte-identical to three.js's copy,
  [`examples/models/gltf/LeePerrySmith/LeePerrySmith.glb`](https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/LeePerrySmith/LeePerrySmith.glb)
  (sha256 `402b8a8a…48bedc9c576`): one mesh, 9,279 vertices / 17,684
  triangles, positions + normals + UVs, no textures (three.js keeps those
  beside it as JPEGs, not used here).

The model is committed as the original GLB (405 KB) rather than trimmed to
positions and indices: it is the reproducible form — anyone can check it
against upstream by hash — and `readGlb` is exercised on a real export. It
is read at bake time only and never ships; the site sees the 38 KB SVG.

## The pipeline

All in `scene.ts`, in order:

1. **Read and weld** — `readGlb` takes the first primitive's positions and
   indices; `weld` merges vertices at the same position (to 1e-4), since the
   export splits every UV seam — 9,279 → 8,844 vertices — and each seam would
   otherwise read as an open edge.
2. **View** — yaw **−20°** (the nose to the viewer's left), pitch **8°**
   (looking slightly down). The camera sits on +z looking down −z; the scan's
   face is +z, so yaw 0 is face-on.
3. **Fit** — orthographic, the rotated bounds centred and scaled to the panel
   inside a 34-unit margin (the bust is 8.55 model units wide, so about 39
   panel units per model unit).
4. **Slices** —
   - horizontal: 38 planes normal to y, at the middles of equal bands across
     y ∈ [−3.9, 3.9] (the bust's height), green, hair;
   - vertical: 9 planes normal to x across x ∈ [−4.2, −0.2] — the far side —
     kept only below the chin (y < −0.25), red, hair;
   - the eye plane: one plane at y = 1.6, lavender, dashed, in the `dash`
     motion group (the scanner's line marches on hover).
5. **Silhouette** — every edge between a front- and a back-facing triangle,
   and every open edge on a front face; ink, hair.
6. **Hidden lines** — a z-buffer of the front faces at 2× the panel (800×800),
   ε 0.08 model units; every line is tested every panel unit along it and cut
   where it goes behind the surface. Front is decided from the mesh's signed
   volume (it winds counter-clockwise, as glTF says it must).
7. **Chrome** — the kit's corner brackets, a 38-tick scale on the left edge
   (one tick a plane), dotted crosshair guides and a lavender reticle on the
   near eye — model point (1.05, 1.6, 1.7), projected by the same fit, so it
   lands on the eye by construction — with a blinking red centre (the second
   motion group).

Output: four paths of line work (about 34 KB of `d`, every number to a
tenth), ~20 elements in all, under the scene profile's 400 / 64 KB. Every
step is deterministic; the bake's check compares bytes.
