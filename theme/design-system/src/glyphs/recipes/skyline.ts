// skyline — the HUD's equaliser city: a row of blue bars of seeded heights,
// leaning taller to the middle, standing on an ink baseline. One path of
// bars, one line.
import { recipe } from "../recipe";
import { round } from "../../lib/micro";
import { rng } from "../../lib/micro/gen";

/** The baseline's y and ends, the bar pitch, the tallest and shortest bar, the seed. */
const [B, X0, X1, PITCH, TOP, LOW, SEED] = [25, 6, 42, 2.4, 17, 3, 11];

export default recipe((k) => {
	const next = rng(SEED);
	const n = Math.floor((X1 - X0) / PITCH) + 1;
	const d = Array.from({ length: n }, (_, i) => {
		const x = X0 + i * PITCH;
		const mid = 1 - Math.abs(i / (n - 1) - 0.5) * 1.2;
		const h = LOW + (TOP - LOW) * mid * (0.35 + 0.65 * next());
		return `M ${round(x)} ${B - 1} V ${round(B - 1 - h)}`;
	}).join(" ");
	return [k.path(d, { paint: "blue", cap: "butt" }), k.line(X0 - 1, B, X1 + 1, B, { weight: "hair" })];
});
