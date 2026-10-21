// handset — the handset body lying flat, in lavender: a pill-shaped slab
// (a rounded box whose corners are half its width) with the ear and mouth
// pieces as short cylinders at its ends, a dot at the heart of each. Wide
// (96×64).
import { iso } from "../../lib/micro";
import { recipe } from "../recipe";

const [W, D, H] = [64, 16, 5];
const AT = [69, 55] as const;
/** A point on the slab's top face, in world terms. */
const P = (x: number, y: number) => iso(x - W, y - D, H, AT);
const CUPS = [12, 52];

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoRoundBox(AT[0], AT[1], W, D, H, D / 2, { paint: "lavender", top: "none" }),
		...CUPS.flatMap((x) => {
			const [cx, cy] = P(x, D / 2);
			return [k.isoCylinder(cx, cy, 5, 3, { paint: "lavender", top: "none" }), k.dot(cx, cy - 3, 1, { paint: "lavender" })];
		}),
	],
});
