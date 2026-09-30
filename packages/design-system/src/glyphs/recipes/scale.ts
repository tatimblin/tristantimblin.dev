// scale — a ruler: an ink baseline with hair ticks rising from it, tall at
// every sixth, middling at every third, short between (the numbers are the
// heights, never text), and a blue pointer triangle under it, pointing up
// at its reading, with that tick in blue.
import { recipe } from "../recipe";

/** The baseline's y and ends, the tick count, the pointer's tick. */
const [B, X0, X1, N, AT] = [17, 6, 42, 13, 8];
const PITCH = (X1 - X0) / (N - 1);
const height = (i: number) => (i % 6 === 0 ? 8 : i % 3 === 0 ? 5.5 : 3);

export default recipe((k) => {
	const tick = (i: number) => `M ${X0 + i * PITCH} ${B} V ${B - height(i)}`;
	const ticks = Array.from({ length: N }, (_, i) => i).filter((i) => i !== AT);
	const px = X0 + AT * PITCH;
	return [
		k.path(ticks.map(tick).join(" "), { weight: "hair", cap: "butt" }),
		k.line(X0, B, X1, B),
		k.path(tick(AT), { paint: "blue", weight: "hair", cap: "butt" }),
		k.tri(px, B + 4.5, 3, { paint: "none", fill: "blue" }),
	];
});
