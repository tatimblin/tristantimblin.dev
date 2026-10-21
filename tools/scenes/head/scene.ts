/**
 * The head — the L4 3D → line route's proof: a scanned head (the Lee
 * Perry-Smith scan, CC BY 3.0; README.md) read from `head.glb` beside this
 * file, welded, and drawn by `tools/scenes/lib/mesh-lines` as the contour
 * lines of a scan — green horizontal slices over the whole bust, red
 * vertical ones below the chin on the far side, the eye plane in lavender
 * as the scanner's marching line, the silhouette in ink — hidden lines
 * removed, turned 20° and tipped 8°, orthographic on the 400×400 panel.
 * The kit adds a little console chrome: corner brackets, a slice-count
 * scale on the left edge, the crosshair guides and a reticle on the near
 * eye with a blinking centre. The readouts (the SCAN tag, the slice count,
 * the yaw, the ladder) are HTML over the frame, placed by the page with
 * SceneLabel; nothing here is text.
 *
 *   bun run scenes:bake      → theme/design-system/src/scenes/head.svg
 *
 * Every parameter of the view and the cut is here; the credit and the
 * pipeline are in README.md beside this file.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scene } from "@whois/design-system/scenes/recipe";
import { meshLines, readGlb, weld } from "../lib/mesh-lines";
import type { Paint, Weight } from "@whois/design-system/lib/micro";

/** The panel and how much of it the bust takes. */
const S = 400;
const MARGIN = 34;

/** The view: turned so the nose points to the viewer's left, tipped so the viewer looks slightly down. */
export const YAW = -20;
export const PITCH = 8;

/** The cut: 38 horizontal planes over the bust's height; 9 vertical ones on the far side, below the chin. */
export const SLICES = 38;
export const SECTIONS = 9;
const CHIN = -0.25;

/** The near eye, model units (found on the mesh: the eye at x ≈ ±1.05, y ≈ 1.6; the surface there z ≈ 1.7). */
const EYE: [number, number, number] = [1.05, 1.6, 1.7];

export default scene({
	viewBox: "0 0 400 400",
	credit: "Lee Perry-Smith head scan by Infinite-Realities, CC BY 3.0",
	draw(k, ctx) {
		const mesh = weld(readGlb(readFileSync(join(ctx.dir, "head.glb"))));
		const { sets, project } = meshLines<Paint, Weight>(mesh, {
			yaw: YAW,
			pitch: PITCH,
			fit: { width: S, height: S, margin: MARGIN },
			slices: [
				{ axis: "y", count: SLICES, range: [-3.9, 3.9], paint: "green", weight: "hair" },
				{ axis: "x", count: SECTIONS, range: [-4.2, -0.2], region: (p) => p[1] < CHIN, paint: "red", weight: "hair" },
				{ axis: "y", values: [EYE[1]], paint: "lavender", weight: "hair" },
			],
			silhouette: { paint: "ink", weight: "hair" },
		});
		const [horizontal, vertical, eyePlane, silhouette] = sets;
		const [ex, ey] = project(EYE).map((v) => Math.round(v * 10) / 10);

		const chrome = { paint: "green", weight: "line" } as const;
		const guide = { paint: "dim", weight: "hair", dash: "dotted" } as const;

		return [
			// The console's guides: the crosshair through the near eye, out to the edges.
			k.path(`M 16 ${ey} H ${ex - 22} M ${ex + 22} ${ey} H 384`, guide),
			k.path(`M ${ex} 16 V ${ey - 22} M ${ex} ${ey + 22} V 384`, guide),
			// The scan: the slices, then the outline over them.
			k.path(horizontal.d, { paint: horizontal.paint, weight: horizontal.weight }),
			k.path(vertical.d, { paint: vertical.paint, weight: vertical.weight }),
			k.group([k.path(eyePlane.d, { paint: eyePlane.paint, weight: eyePlane.weight, dash: "dash" })], { motion: "dash" }),
			k.path(silhouette.d, { paint: silhouette.paint, weight: silhouette.weight }),
			// The reticle on the near eye, its centre blinking.
			k.ring(ex, ey, 12, { paint: "lavender", weight: "line" }),
			k.path(`M ${ex - 18} ${ey} H ${ex - 8} M ${ex + 8} ${ey} H ${ex + 18} M ${ex} ${ey - 18} V ${ey - 8} M ${ex} ${ey + 8} V ${ey + 18}`, { paint: "lavender", weight: "line" }),
			k.group([k.dot(ex, ey, 2.5, { paint: "red" })], { motion: "blink" }),
			// The frame chrome: corner brackets, and the slice scale down the left edge — one tick a plane.
			k.bracket(14, 14, 16, "tl", chrome),
			k.bracket(386, 14, 16, "tr", chrome),
			k.bracket(14, 386, 16, "bl", chrome),
			k.bracket(386, 386, 16, "br", chrome),
			k.ticksLinear(22, 60, 22, 340, SLICES, 4, { paint: "green", weight: "hair" }),
			k.ticksLinear(22, 60, 22, 340, 3, 8, { paint: "green", weight: "hair" }),
		];
	},
});
