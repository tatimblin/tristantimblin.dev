// cards — a stack of three keycap cards, offset up and to the right: the
// two behind are dim hairline edges peeking out, the front one an ink
// card holding a small blue envelope (the envelope generator, scaled in).
import { recipe } from "../recipe";
import { envelope } from "../../lib/micro";

const W = 24;
const H = 16;
const R = 2;
const DX = 4;
const DY = 4;
/** The front card's corner; each card behind sits DX right and DY up. */
const X0 = 8;
const Y0 = 11;

/** What shows of a card at (x, y) from behind the one in front of it: its top and right edges, and the ends of its left and bottom. */
function peek(x: number, y: number): string {
	return `M ${x} ${y + DY} V ${y + R} Q ${x} ${y} ${x + R} ${y} H ${x + W - R} Q ${x + W} ${y} ${x + W} ${y + R} V ${y + H - R} Q ${x + W} ${y + H} ${x + W - R} ${y + H} H ${x + W - DX}`;
}

const env = envelope({ paint: "blue" });

export default recipe((k) => [
	k.path(peek(X0 + 2 * DX, Y0 - 2 * DY), { paint: "dim", weight: "hair" }),
	k.path(peek(X0 + DX, Y0 - DY), { paint: "dim" }),
	k.roundRect(X0, Y0, W, H, R),
	k.group(env.children, { transform: `translate(${X0 + 2} ${Y0 + 1.5}) scale(0.5)` }),
]);
