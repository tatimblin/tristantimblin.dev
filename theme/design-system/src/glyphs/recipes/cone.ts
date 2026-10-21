// cone — the speaker driver, lying in its square frame: an ink iso frame
// with a dim mounting hole at each corner, and on it the surround, the
// cone's rings and the dust cap in coral. Wide (96×64).
import { iso } from "../../lib/micro";
import { recipe } from "../recipe";

const S = 40;
const H = 3;
const AT = [48, 55] as const;
/** A point on the frame's top face, in world terms. */
const P = (x: number, y: number) => iso(x - S, y - S, H, AT);
const [CX, CY] = P(S / 2, S / 2);

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoBox(AT[0], AT[1], S, S, H, { paint: "ink", top: "none" }),
		...[[4, 4], [36, 4], [4, 36], [36, 36]].map(([x, y]) => k.dot(...P(x, y), 0.75, { paint: "dim" })),
		k.isoEllipse(CX, CY, 17, { paint: "red" }),
		k.isoEllipse(CX, CY, 12, { paint: "red", weight: "hair" }),
		k.isoEllipse(CX, CY, 8, { paint: "red", weight: "hair" }),
		k.isoEllipse(CX, CY, 4, { paint: "none", fill: "red" }),
	],
});
