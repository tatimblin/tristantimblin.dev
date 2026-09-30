/**
 * Asserting on Agent Behavior — the post's art, as a baked scene: THE
 * GRAPHIC ALONE. A teaser, not a sheet: the agent is a black box you
 * cannot open, so the one strong element is a closed box — the bold
 * `iso-stripes` cube, opaque, read from its bars alone — and the only other
 * thing on the plate is what Aptitude reads off it: the dotted trace of its
 * tool calls, running off the top and the bottom of the plate, and the three
 * assertions of the read-order test as nodes on it, named by the tool each
 * one checks (READ_FILE, READ_FILE, READ).
 *
 * The motion is `steps`, three beats, one per assertion: the node ticks
 * green with a ripple. The still frame is the finished run — every tick.
 *
 *   bun run scenes:bake      → src/content/txt/asserting-on-agent-behavior.svg
 *
 * Drawn from the kit and the iso-stripes recipe: no credit.
 */

import isoStripes from "@whois/design-system/glyphs/recipes/iso-stripes";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

/** The tool each assertion of the read-order test checks, as the terminal printed it. */
const ASSERTIONS = ["READ_FILE", "READ_FILE", "READ"] as const;

/** The cube's centre and scale (the recipe's cube is ~21 × 24 tile units). */
const CUBE = { x: 98, y: 91, scale: 5.6 };
/** The trace: a dotted spine off the top and bottom edges, a node per assertion. */
const SPINE = 204;
const ROWS = [44, 91, 138];
const R = 6.5;

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const out: string[] = [
			// The black box.
			part(k, isoStripes, { at: [CUBE.x, CUBE.y], scale: CUBE.scale }),
			// The trace out of it, into the assertions: all you can see of what it did.
			k.guide([[CUBE.x + 66, CUBE.y], [SPINE - R - 3, CUBE.y]]),
			k.arrowhead(SPINE - R - 3, CUBE.y, 90, 3, { paint: "dim" }),
			k.guide([[SPINE, -4], [SPINE, ROWS[0] - R]]),
			k.guide([[SPINE, ROWS[0] + R], [SPINE, ROWS[1] - R]]),
			k.guide([[SPINE, ROWS[1] + R], [SPINE, ROWS[2] - R]]),
			k.guide([[SPINE, ROWS[2] + R], [SPINE, 184]]),
		];
		ASSERTIONS.forEach((name, i) => {
			out.push(k.ring(SPINE, ROWS[i], R, { fill: "none" }), k.text(SPINE + R + 7, ROWS[i] + 3.2, name, { role: "title", size: 9 }));
		});

		// The run: one beat per assertion — a green tick in its node, and a ripple.
		const beats = ROWS.map((y) => [
			k.ring(SPINE, y, R, { paint: "green", mark: "ripple" }),
			k.check(SPINE, y, R, { paint: "green", weight: "line" }),
		]);
		out.push(k.steps(beats));

		return out;
	},
});
