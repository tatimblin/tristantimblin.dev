// screw — a small part: a machine screw standing on its point, the head an
// iso cylinder with a blue Phillips cross on its cap, the shank tapering
// to the tip with dim thread lines across it. 48×32.
import { recipe } from "../recipe";

const [CX, CAP] = [24, 9];
// The cross lies along the world axes on the 2:1 cap: an axis point at
// world s is (±0.866s, ±0.5s) from the centre, and s = 3.2 keeps it inside
// the r 5 cap.
const [SX, SY] = [2.77, 1.6];
// The shank meets the head's base ellipse (r 5 by 2.5 at y 12) at x ± 2.5.
const NECK = 14.2;

export default recipe((k) => [
	k.isoCylinder(CX, 12, 5, 3, { top: "none" }),
	k.path(`M ${CX - SX} ${CAP - SY} L ${CX + SX} ${CAP + SY} M ${CX + SX} ${CAP - SY} L ${CX - SX} ${CAP + SY}`, { paint: "blue" }),
	k.polyline([[21.5, NECK], [21.5, 24], [24, 28], [26.5, 24], [26.5, NECK]]),
	k.path([16, 18.5, 21, 23.5].map((y) => `M 21.5 ${y} L 26.5 ${y - 1}`).join(" "), { paint: "dim", weight: "hair", cap: "butt" }),
]);
