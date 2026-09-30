// checker-warp — an 8×8 checkerboard pushed out from behind: the middle
// cells swell, the edges crowd, the outline stays square (the pack's shape
// 10). The 32 dark cells are quads between warped grid points, one filled
// path in the ink. 48×32.
import { round, type Point } from "../../lib/micro";
import { recipe } from "../recipe";

const [CX, CY, H] = [24, 16, 12];
const N = 8;
/** 1-D swell: w(±1) = ±1, steepest (1.5×) at the middle, flat at the edges. */
const w = (s: number) => s * (1.5 - 0.5 * s * s);
/** The warp: the swell on each axis, plus a pull that bows the grid lines and leaves the outline straight. */
const warp = (s: number, t: number): Point => [
	round(CX + H * (w(s) + 0.14 * s * (1 - s * s) * (1 - t * t))),
	round(CY + H * (w(t) + 0.14 * t * (1 - t * t) * (1 - s * s))),
];
const at = (i: number, j: number) => warp((2 * i) / N - 1, (2 * j) / N - 1);

const cells: string[] = [];
for (let j = 0; j < N; j++) {
	for (let i = 0; i < N; i++) {
		if ((i + j) % 2) continue;
		const [a, b, c, d] = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
		cells.push(`M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}L${d[0]} ${d[1]}Z`);
	}
}

export default recipe((k) => [k.path(cells.join(""), { paint: "none", fill: "ink" })]);
