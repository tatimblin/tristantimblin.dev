// colour-bars — the HUD's segmented colour bar row: three groups of short
// filled bars, red, blue, then ink (a glyph carries two colours at most),
// over a dim dotted guide.
import { recipe } from "../recipe";
import type { Paint } from "../../lib/micro";
import { round } from "../../lib/micro";

/** A bar's width and height, the pitch in a group, the gap between groups, bars per group. */
const [W, H, PITCH, GAP, N] = [2, 8, 3, 3.5, 4];
const GROUPS: readonly Paint[] = ["red", "blue", "ink"];
const span = GROUPS.length * (N * PITCH - (PITCH - W)) + (GROUPS.length - 1) * GAP;
const X0 = 24 - span / 2;
const Y = 16 - H / 2 - 1.5;

export default recipe((k) => [
	k.guide([[round(X0), 21.5], [round(X0 + span), 21.5]]),
	...GROUPS.map((paint, g) => {
		const gx = X0 + g * (N * PITCH - (PITCH - W) + GAP);
		const d = Array.from({ length: N }, (_, i) => `M ${round(gx + i * PITCH)} ${Y} h ${W} v ${H} h ${-W} Z`).join(" ");
		return k.path(d, { paint: "none", fill: paint });
	}),
]);
