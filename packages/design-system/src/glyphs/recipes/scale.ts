// scale — a ruler: an ink baseline with hair ticks rising from it, tall at
// every sixth, middling at every third, short between (the numbers are the
// heights, never text), and a blue pointer triangle under it, pointing up
// at its reading, with that tick in blue.
//
// The ruler is exported: a scene's timeline is the same drawing at another
// length and tick count, with the pointer drawn apart (`rulerPointer`) or
// not at all.
import type { Kit, Paint } from "../../lib/micro";
import { recipe } from "../recipe";

export interface RulerOpts {
	/** the baseline's ends and its y */
	x0: number;
	x1: number;
	y: number;
	/** how many ticks, both ends included */
	ticks: number;
	/** every `major`-th tick is tall (6 unless said); every `mid`-th middling (3; 0 for none) */
	major?: number;
	mid?: number;
	/** the tick heights: tall, middling, short (8 / 5.5 / 3 unless said) */
	heights?: readonly [number, number, number];
	/** the baseline's and the ticks' paint; `ink` unless said */
	paint?: Paint;
	/** the pointer's paint, and its tick's; `blue` unless said */
	accent?: Paint;
	/** the pointer's size: the triangle's circumradius (3 unless said); it sits 1.5 sizes under the line */
	size?: number;
	/** draw the pointer at this tick, and that tick in the accent; none unless said */
	pointerAt?: number;
}

const DEFAULTS = { major: 6, mid: 3, heights: [8, 5.5, 3] as const, paint: "ink", accent: "blue", size: 3 } as const;

const pitch = (o: RulerOpts): number => (o.x1 - o.x0) / (o.ticks - 1);
const tickAt = (o: RulerOpts, i: number): number => o.x0 + i * pitch(o);
const tickD = (o: RulerOpts, i: number): string => {
	const { major, mid, heights } = { ...DEFAULTS, ...o };
	const h = i % major === 0 ? heights[0] : mid > 0 && i % mid === 0 ? heights[1] : heights[2];
	return `M ${tickAt(o, i)} ${o.y} V ${o.y - h}`;
};

/** The ruler: the ticks (the pointer's left out, if any), the baseline, then the pointer. */
export function ruler(k: Kit, o: RulerOpts): string[] {
	const { paint, pointerAt } = { ...DEFAULTS, ...o };
	const ticks = Array.from({ length: o.ticks }, (_, i) => i).filter((i) => i !== pointerAt);
	return [
		k.path(ticks.map((i) => tickD(o, i)).join(" "), { paint, weight: "hair", cap: "butt" }),
		k.line(o.x0, o.y, o.x1, o.y, { paint }),
		...(pointerAt === undefined ? [] : rulerPointer(k, o, pointerAt)),
	];
}

/** The pointer at tick `at`: that tick in the accent, and the triangle under the line pointing up at it. */
export function rulerPointer(k: Kit, o: RulerOpts, at: number): string[] {
	const { accent, size } = { ...DEFAULTS, ...o };
	return [
		k.path(tickD(o, at), { paint: accent, weight: "hair", cap: "butt" }),
		k.tri(tickAt(o, at), o.y + size * 1.5, size, { paint: "none", fill: accent }),
	];
}

export default recipe((k) => ruler(k, { x0: 6, x1: 42, y: 17, ticks: 13, pointerAt: 8 }));
