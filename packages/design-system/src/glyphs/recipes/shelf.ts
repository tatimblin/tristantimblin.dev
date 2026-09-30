// shelf — a high shelf: a red curve flat at 0 dB on the left, rising
// through the corner to its gain on the right, where it levels off just
// under a dim dotted ceiling across the tile.
import { recipe } from "../recipe";
import { lineD, simplify, type Point } from "../../lib/micro";

const ZERO = 24;
const CEIL = 7;
const TOP = 10; // where the shelf levels off, a gap under the ceiling
const GAIN_DB = 12;
const OCTAVES = 7;
const CUTOFF = 0.5;
// a first-order high shelf: |H| = sqrt((1 + G²ρ²) / (1 + ρ²)), ρ the frequency over the corner
const G = 10 ** (GAIN_DB / 20);
const pts: Point[] = Array.from({ length: 81 }, (_, i) => {
	const u = i / 80;
	const rho = 2 ** ((u - CUTOFF) * OCTAVES) * Math.sqrt(G);
	const db = 20 * Math.log10(Math.sqrt((1 + G * G * rho * rho) / (1 + rho * rho)));
	return [4 + 40 * u, ZERO - ((ZERO - TOP) * db) / GAIN_DB];
});

export default recipe((k) => [
	k.guide([[4, CEIL], [44, CEIL]]),
	k.path(lineD(simplify(pts)), { paint: "red" }),
]);
