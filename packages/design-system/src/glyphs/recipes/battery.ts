// battery — the cell, lying along x as it sits in the phone: a blue iso
// cylinder with a hairline shoulder band near the + end, the terminal a
// short cylinder on its cap with a coral dot. Wide (96×64).
import { iso } from "../../lib/micro";
import { recipe } from "../recipe";

const [R, L] = [10, 50];
const BASE = [25, 19.5] as const;
/** A point `s` along the cell's axis from the base end. */
const along = (s: number) => iso(s, 0, 0, BASE);
const CAP = along(L);
const TIP = along(L + 3);
// The shoulder band: the visible half of the cross-section 40 in — the
// half toward the viewer, up-left of the axis — between the disc's
// major-axis ends r·(−0.5, 0.866) either side of the centre, drawn
// clockwise (sweep 1) so it passes the up-left point.
const BAND = along(40);
const [UX, UY] = [-R / 2, (R * Math.sqrt(3)) / 2];

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoCylinder(BASE[0], BASE[1], R, L, { paint: "blue", top: "none", axis: "x" }),
		k.path(`M ${BAND[0] + UX} ${BAND[1] + UY} A ${R} ${R / 2} 120 0 1 ${BAND[0] - UX} ${BAND[1] - UY}`, { paint: "blue", weight: "hair" }),
		k.isoCylinder(CAP[0], CAP[1], 3.5, 3, { paint: "blue", weight: "hair", top: "none", axis: "x" }),
		k.dot(TIP[0], TIP[1], 1.25, { paint: "red" }),
	],
});
