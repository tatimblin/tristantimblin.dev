// transient — an attack: the red burst (the wave generator's) on its dim
// midline, under a dim outline of the envelope it rings down inside.
import { recipe } from "../recipe";
import { lineD, simplify, wave, type Point } from "../../lib/micro";

// the burst's impulse: from x 14, 22 wide, peaking a fifth of the way in
const LEAD = 14;
const SPAN = 22;
const A = 12;
const env = (t: number) => (t < 0.2 ? t / 0.2 : Math.exp(-(t - 0.2) * 4.2));
const edge = (sign: 1 | -1): Point[] =>
	simplify(Array.from({ length: 41 }, (_, i) => [LEAD + (SPAN * i) / 40, 16 - sign * A * env(i / 40)] as Point), 0.1);

export default recipe((k) => [
	k.path(`${lineD(edge(1))} ${lineD(edge(-1))}`, { paint: "dim", weight: "hair" }),
	...wave("burst", { amp: 8 }).children,
]);
