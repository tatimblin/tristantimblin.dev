// scatter — a sparse seeded field of dots, dim and blue, one of them red
// and ringed: the outlier, the pick.
import { recipe } from "../recipe";
import { rng } from "../../lib/micro";

const N = 14;
/** The dots, placed by a seed and kept a little apart. */
function points(seed: number): [number, number][] {
	const r = rng(seed);
	const out: [number, number][] = [];
	for (let tries = 0; out.length < N && tries < 500; tries++) {
		const p: [number, number] = [Math.round(6 + r() * 36), Math.round(6 + r() * 20)];
		if (out.every(([x, y]) => Math.hypot(x - p[0], y - p[1]) > 5.5)) out.push(p);
	}
	return out;
}

const PTS = points(11);
const HOT = 3;

export default recipe((k) => [
	...PTS.map(([x, y], i) => (i === HOT ? "" : k.dot(x, y, i % 3 === 0 ? 1.5 : 1.25, { paint: i % 3 === 0 ? "blue" : "dim" }))).filter(Boolean),
	k.ring(PTS[HOT][0], PTS[HOT][1], 4, { paint: "red", weight: "hair" }),
	k.dot(PTS[HOT][0], PTS[HOT][1], 1.75, { paint: "red" }),
]);
