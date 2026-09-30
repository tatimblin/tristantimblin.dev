// iso-shell — a handset shell half, one of the exploded phone's parts: a
// rounded tray in lavender line work, lying long along x, its rim's inner
// edge a hairline on the top face. Wide (96×64), as every iso part is.
import { recipe } from "../recipe";

// The tray: 54 along x, 26 along y, 6 tall, corners of 5, placed by its
// near corner so the outline centres on the tile.
const [W, D, H, C] = [54, 26, 6, 5];
const AT = [60, 55] as const;
// The rim inset 2 on the top face: its near corner is straight up from the tray's.
const RIM = 2;

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoRoundBox(AT[0], AT[1], W, D, H, C, { paint: "lavender", top: "none" }),
		k.isoRoundRect(AT[0], AT[1] - 2 * RIM - H, W - 2 * RIM, D - 2 * RIM, C - RIM, { paint: "lavender", weight: "hair" }),
	],
});
