/**
 * The scale recipe's exported ruler: the recipe is the ruler with its
 * pointer, the ruler alone draws no pointer, and a pointer drawn apart
 * lands on its tick — so a scene's timeline (one pointer copy per beat of
 * a steps motion) is the glyph's drawing. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { kit } from "../../lib/micro";
import scale, { ruler, rulerPointer } from "./scale";

const g = kit("glyph");
const sc = kit("scene");
const GLYPH = { x0: 6, x1: 42, y: 17, ticks: 13 } as const;

describe("scale's ruler", () => {
	test("the recipe is the ruler with its pointer at tick 8", () => {
		expect(scale.draw(g)).toEqual(ruler(g, { ...GLYPH, pointerAt: 8 }));
	});

	test("without a pointer: every tick in one path, the baseline, nothing else", () => {
		const out = ruler(g, GLYPH);
		expect(out).toHaveLength(2);
		expect(out[0].match(/M /g)).toHaveLength(13);
		expect(out[0]).toContain("M 6 17 V 9"); // tall at 0
		expect(out[0]).toContain("M 15 17 V 11.5"); // middling at 3
		expect(out[0]).toContain("M 9 17 V 14"); // short
		expect(out[1]).toStartWith('<line x1="6" y1="17" x2="42" y2="17"');
		expect(out.join("")).not.toContain("polygon");
	});

	test("a pointer apart: the tick in the accent and the triangle under it, at the tick's x", () => {
		const [tick, tri] = rulerPointer(g, GLYPH, 4);
		expect(tick).toContain('d="M 18 17 V 14"');
		expect(tick).toContain('stroke="var(--art-cyan)"');
		expect(tri).toContain('points="18,18.5');
		expect(tri).toContain('fill="var(--art-cyan)"');
	});

	test("a scene's timeline: another length and count, tall every third, no middling, its own paints and size", () => {
		const o = { x0: 118, x1: 212, y: 163, ticks: 16, major: 3, mid: 0, heights: [5, 0, 2.5] as const, paint: "green", accent: "ink", size: 2.6 } as const;
		const [ticks, base] = ruler(sc, o);
		expect(ticks.match(/M /g)).toHaveLength(16);
		expect(ticks).toContain("M 118 163 V 158");
		expect(ticks).toContain("M 136.8 163 V 158"); // tick 3 is tall
		expect(ticks).not.toContain("V 161.5"); // no middling height
		expect(ticks).toContain('stroke="var(--art-green)"');
		expect(base).toContain('stroke="var(--art-green)"');
		const [, tri] = rulerPointer(sc, o, 3);
		expect(tri).toContain('points="136.8,164.3');
		expect(tri).toContain('fill="var(--art-ink)"');
	});
});
