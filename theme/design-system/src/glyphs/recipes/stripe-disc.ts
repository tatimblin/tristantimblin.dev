// stripe-disc — a solid disc cut into five parallel bars on a slant, the
// plate showing between them (the pack's shapes 07 and 29): each bar is the
// disc between two chords, one subpath, so the disc is one filled path.
// 48×32.
import { round, type Point } from "../../lib/micro";
import { recipe } from "../recipe";

const [CX, CY, R] = [24, 16, 12];
/** The bars' direction: across them runs at this angle from the x axis (degrees). */
const TILT = -35;
const [BAR, GAP] = [3.8, 1.25];
const BARS = 5;

const t = (TILT * Math.PI) / 180;
const e1: Point = [Math.cos(t), Math.sin(t)]; // across the bars
const e2: Point = [-Math.sin(t), Math.cos(t)]; // along them
const at = (u: number, v: number): Point => [round(CX + u * e1[0] + v * e2[0]), round(CY + u * e1[1] + v * e2[1])];
const half = (u: number) => Math.sqrt(Math.max(0, R * R - u * u));
/** The arc from p to q the short way round the disc; its sweep read off the turn (y down: positive is clockwise). */
const arc = (p: Point, q: Point) => {
	const cross = (p[0] - CX) * (q[1] - CY) - (p[1] - CY) * (q[0] - CX);
	return `A ${R} ${R} 0 0 ${cross > 0 ? 1 : 0} ${q[0]} ${q[1]}`;
};

const total = BARS * BAR + (BARS - 1) * GAP;
const d = Array.from({ length: BARS }, (_, i) => {
	const u0 = -total / 2 + i * (BAR + GAP);
	const u1 = u0 + BAR;
	const [a, b, c, e] = [at(u0, -half(u0)), at(u0, half(u0)), at(u1, half(u1)), at(u1, -half(u1))];
	return `M ${a[0]} ${a[1]} L ${b[0]} ${b[1]} ${arc(b, c)} L ${e[0]} ${e[1]} ${arc(e, a)} Z`;
}).join(" ");

export default recipe((k) => [k.path(d, { paint: "none", fill: "ink" })]);
