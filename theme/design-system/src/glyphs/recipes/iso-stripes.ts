// iso-stripes — an iso cube drawn only in bars: five upright bars down each
// side face and five across the top, the plate between them, so the solid
// is read from its stripes alone (the pack's shape 15). A true-30° cube
// centred on the tile, one filled path in the ink. 48×32.
import { iso, type Point } from "../../lib/micro";
import { recipe } from "../recipe";

const S = 12;
/** The cube's centre, (S/2, S/2, S/2), projects to `at`: the tile's centre. */
const AT: Point = [24, 16 - 0.5];
const P = (x: number, y: number, z: number) => iso(x - S / 2, y - S / 2, z - S / 2, AT);
const BARS = 5;
const PITCH = S / BARS;
const BAR = PITCH * 0.58;
const quad = (pts: Point[]) => `M${pts.map((p) => `${p[0]} ${p[1]}`).join("L")}Z`;

const d: string[] = [];
for (let i = 0; i < BARS; i++) {
	const [a, b] = [i * PITCH + (PITCH - BAR) / 2, i * PITCH + (PITCH + BAR) / 2];
	// the right face (x = S): upright bars along y
	d.push(quad([P(S, a, 0), P(S, b, 0), P(S, b, S), P(S, a, S)]));
	// the left face (y = S): upright bars along x
	d.push(quad([P(a, S, 0), P(b, S, 0), P(b, S, S), P(a, S, S)]));
	// the top (z = S): bars running along y
	d.push(quad([P(a, 0, S), P(b, 0, S), P(b, S, S), P(a, S, S)]));
}

export default recipe((k) => [k.path(d.join(""), { paint: "none", fill: "ink" })]);
