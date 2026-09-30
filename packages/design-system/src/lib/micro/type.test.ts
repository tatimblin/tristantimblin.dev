/**
 * Type and the module sheet (type.ts, layout.ts, ids.ts): every helper's
 * output passes the art and scene profiles, the kit's voices and scale are
 * the validator's, the glyph kit refuses type, and the grid and the ids
 * are what they say. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, TYPE_SCALE as VALIDATOR_SCALE, TYPE_SIZES, validateSvg } from "../../../scripts/validate-art.mjs";
import { ids, STATES } from "./ids";
import { kit } from "./kit";
import { grid, span } from "./layout";
import { advance, caps, sectionDepth, TYPE_SCALE, VOICE_SIZES, type Voice } from "./type";

const a = kit("art");
const sc = kit("scene");

/** A plate around `children`, with a token so the palette rule has one. */
const plate = (k = a, ...children: string[]) => k.svg({ viewBox: "0 0 320 180", children: [k.dot(300, 170, 2, { paint: "red" }), ...children] });
const clean = (k = a, ...children: string[]) => {
	for (const profile of [PROFILES.art, PROFILES.scene]) {
		expect(validateSvg(plate(k, ...children), { profile }), profile.name).toEqual([]);
	}
};

describe("type: the kit's voices are the validator's", () => {
	test("the scale and each voice's steps agree with TYPE_SCALE / TYPE_SIZES", () => {
		expect(TYPE_SCALE.map(String)).toEqual([...VALIDATOR_SCALE]);
		for (const [voice, sizes] of Object.entries(VOICE_SIZES)) {
			expect(sizes.map(String), voice).toEqual([...TYPE_SIZES[`art-${voice}`]]);
		}
		expect(Object.keys(TYPE_SIZES).sort()).toEqual(Object.keys(VOICE_SIZES).map((v) => `art-${v}`).sort());
	});

	test("every voice at every one of its sizes, anchors and a quarter turn validate on art and a scene", () => {
		for (const k of [a, sc]) {
			const lines: string[] = [];
			for (const [voice, sizes] of Object.entries(VOICE_SIZES) as [Voice, readonly number[]][]) {
				for (const size of sizes) lines.push(k.text(20, 40, "07 NODE", { role: voice, size: size as never }));
			}
			lines.push(k.text(160, 90, "EPOCH", { role: "title", anchor: "middle" }));
			lines.push(k.text(300, 90, "045", { role: "numeral", anchor: "end", paint: "red" }));
			lines.push(k.text(10, 170, "MAINTENANCE MODE", { role: "caption", turn: -90 }));
			clean(k, ...lines);
		}
	});

	test("a text writes its voice's class, the baseline, the size, and the voice's paint", () => {
		expect(a.text(20, 40, "ID: 7F-C2")).toBe('<text class="art-label" x="20" y="40" font-size="4.5" fill="var(--art-ink)">ID: 7F-C2</text>');
		expect(a.text(20, 40, "SYNC", { role: "caption" })).toContain('fill="var(--art-ink-2)"');
		expect(a.text(20, 40, "45", { role: "numeral", anchor: "end" })).toContain('font-size="22" text-anchor="end"');
		expect(a.text(10, 170, "UP", { turn: -90 })).toContain('transform="rotate(-90 10 170)"');
	});

	test("words are escaped, and still validate", () => {
		const t = a.text(20, 40, "R&D <SYNC>");
		expect(t).toContain(">R&amp;D &lt;SYNC&gt;<");
		clean(a, t);
	});

	test("a size off the voice's steps throws; the glyph kit has no type", () => {
		expect(() => a.text(0, 0, "45", { role: "numeral", size: 4.5 })).toThrow(/numeral is set at 9, 14, 22, 32/);
		expect(() => a.text(0, 0, "X", { role: "caption", size: 32 })).toThrow();
		expect(() => kit("glyph").text(0, 0, "X")).toThrow(/glyph kit has no type/);
		expect(() => kit("glyph").section(0, 0, 10, "X")).toThrow(/glyph kit has no type/);
	});
});

describe("the module sheet: rules, sections, brackets, readouts", () => {
	test("each helper validates on art and a scene", () => {
		for (const k of [a, sc]) {
			clean(
				k,
				k.rule(16, 120, 30),
				k.rule(16, 120, 34, { dotted: true }),
				k.section(16, 50, 100, "Sound systems"),
				k.bracketLabel(16, 80, "active"),
				k.readout(16, 130, { value: "14", label: "sound", caption: "speakers" }),
				k.readout(160, 130, { value: "0079", caption: "sync complete", captionAt: "below", size: 14, paint: "lavender" }),
			);
		}
	});

	test("a rule is a solid ink hair, or dim dots", () => {
		expect(a.rule(0, 10, 5)).toContain('stroke="var(--art-ink)"');
		const dotted = a.rule(0, 10, 5, { dotted: true });
		expect(dotted).toContain('stroke="var(--art-ink-2)"');
		expect(dotted).toContain('stroke-dasharray="2 6"');
		expect(dotted).toContain('stroke-linecap="round"');
	});

	test("a section: the dotted rule at y, its title in caps hanging under it, sectionDepth deep", () => {
		const s = a.section(20, 50, 80, "Performance");
		expect(s).toContain('x1="20" y1="50" x2="100" y2="50"');
		expect(s).toContain(`y="${50 + sectionDepth()}"`);
		expect(s).toContain(">PERFORMANCE<");
	});

	test("a bracket label is the state in caps between spaced brackets", () => {
		expect(a.bracketLabel(0, 10, "Active")).toContain(">[ ACTIVE ]<");
	});

	test("a readout: the numeral on the baseline, the label over it, the caption past its end", () => {
		const r = a.readout(20, 100, { value: "14", label: "sound", caption: "speakers" });
		const texts = [...r.matchAll(/<text class="art-(\w+)" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => ({ voice: m[1], x: Number(m[2]), y: Number(m[3]) }));
		const numeral = texts.find((t) => t.voice === "numeral")!;
		const label = texts.find((t) => t.voice === "label")!;
		const caption = texts.find((t) => t.voice === "caption")!;
		expect(numeral).toEqual({ voice: "numeral", x: 20, y: 100 });
		expect(label.y).toBeLessThan(100 - 22 * 0.7);
		expect(caption.x).toBeGreaterThan(20 + advance("14", "numeral", 22));
		expect(caption.y).toBeLessThan(100);
		const below = a.readout(20, 100, { value: "14", caption: "speakers", captionAt: "below" });
		expect(below).toMatch(/class="art-caption" x="20" y="10[4-9]/);
	});
});

describe("advance and caps", () => {
	test("advance: the measured faces — figures 0.575 em, capitals 0.72, the label's tracking on top", () => {
		expect(advance("0000", "numeral", 10)).toBeCloseTo(23, 0);
		expect(advance("ABCD", "title", 10)).toBeCloseTo(28.8, 0);
		expect(advance("AB", "label", 10)).toBeCloseTo(2 * (0.72 + 0.1) * 10, 1);
		expect(advance("", "label", 10)).toBe(0);
	});

	test("caps: upper case, but a hex prefix keeps its x", () => {
		expect(caps("node b43")).toBe("NODE B43");
		expect(caps("code: 0x7b8a")).toBe("CODE: 0x7B8A");
		expect(caps("box")).toBe("BOX");
	});
});

describe("ids", () => {
	test("deterministic: the same seed gives the same strings, another seed others", () => {
		const draw = (seed: number) => {
			const i = ids(seed);
			return [i.file(), i.node(), i.module(), i.hex(), i.id(), i.code(), i.status(), i.coords(), i.num(4)];
		};
		expect(draw(7)).toEqual(draw(7));
		expect(draw(7)).not.toEqual(draw(8));
	});

	test("each string has its form, in the voice's case", () => {
		for (let seed = 0; seed < 50; seed++) {
			const i = ids(seed);
			expect(i.file()).toMatch(/^[A-Z]+_\d{3}\.[A-Z]{3}$/);
			expect(i.node()).toMatch(/^NODE [A-Z]\d{2}$/);
			expect(i.module()).toMatch(/^MODULE [A-Z][1-9]$/);
			expect(i.hex()).toMatch(/^0x[0-9A-F]{4}$/);
			expect(i.id()).toMatch(/^ID: [0-9A-F]{2}-[0-9A-F]{2}$/);
			expect(i.code()).toMatch(/^[A-Z]\d-\d{2}$/);
			const status = i.status();
			expect(status).toMatch(/^\[[A-Z]+\]$/);
			expect(STATES).toContain(status.slice(1, -1));
			expect(i.coords()).toMatch(/^\d{2}\.\d{2} \/ \d{3}\.\d{2}$/);
			expect(i.num(4)).toMatch(/^\d{4}$/);
			expect(i.num(2)).toMatch(/^\d{2}$/);
		}
	});

	test("the strings set as type validate", () => {
		const i = ids(3);
		clean(a, ...[i.file(), i.node(), i.hex(), i.id(), i.status(), i.coords()].map((s, n) => a.text(20, 20 + n * 8, s)));
	});
});

describe("grid", () => {
	test("cells tile the plate inside the margin, gutter apart, row-major", () => {
		const cells = grid(3, 2, 10, 16);
		expect(cells).toHaveLength(6);
		expect(cells[0]).toMatchObject({ x: 16, y: 16, col: 0, row: 0 });
		const last = cells[5];
		expect(last).toMatchObject({ col: 2, row: 1 });
		expect(last.x + last.w).toBeCloseTo(320 - 16, 1);
		expect(last.y + last.h).toBeCloseTo(180 - 16, 1);
		expect(cells[1].x - (cells[0].x + cells[0].w)).toBeCloseTo(10, 1);
		expect(cells[3].y - (cells[0].y + cells[0].h)).toBeCloseTo(10, 1);
		expect(cells[4]).toMatchObject({ col: 1, row: 1 });
	});

	test("another box, a per-axis inset, and a span across cells", () => {
		const cells = grid(2, 2, 0, 0, { width: 400, height: 400 });
		expect(cells[3]).toEqual({ x: 200, y: 200, w: 200, h: 200, col: 1, row: 1 });
		const inset = grid(1, 1, 0, 0, { inset: [20, 10] });
		expect(inset[0]).toMatchObject({ x: 20, y: 10, w: 280, h: 160 });
		const s = span(grid(3, 2)[0], grid(3, 2)[4]);
		expect(s).toMatchObject({ x: 16, y: 16 });
		expect(s.x + s.w).toBeCloseTo(grid(3, 2)[4].x + grid(3, 2)[4].w, 1);
	});

	test("no room, or not whole cells, throws", () => {
		expect(() => grid(0, 2)).toThrow();
		expect(() => grid(2.5, 2)).toThrow();
		expect(() => grid(40, 1, 10, 16)).toThrow(/no room/);
	});
});
