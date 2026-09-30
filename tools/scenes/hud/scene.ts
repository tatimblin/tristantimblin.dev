/**
 * The hud — the L4 hand-vector route's proof: a driving HUD drawn "in
 * Figma" at 2× on a 640×360 frame with the placeholder swatches
 * (../SWATCHES.md) and exported as source.svg, cruft and all — layer ids,
 * a `style=`, a fill-opacity wash, strokes of 2 and 3, the frame's clip
 * and mask, the background rect, an unused gradient, a rotated rect, a
 * translated group. The importer strips, flattens, maps and refits it to
 * the plate; the centre line's dashes run under the dash motion. The
 * readouts (FREQ, the dials, FF, the colour bars) are HTML over the frame,
 * placed by the page; nothing here is text.
 *
 *   bun run scenes:bake      → packages/design-system/src/scenes/hud.svg
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { scene } from "@whois/design-system/scenes/recipe";
import { importVector } from "../lib/import-vector";

export default scene({
	viewBox: "0 0 320 180",
	draw: (_k, ctx) =>
		importVector(readFileSync(join(ctx.dir, "source.svg"), "utf8"), {
			viewBox: "0 0 320 180",
			motion: { "road/centre": { motion: "dash", speed: 0.5 } },
		}),
});
