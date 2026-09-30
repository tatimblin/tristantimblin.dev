/**
 * The glyph profile of the SVG validator
 * (packages/design-system/scripts/validate-art.mjs): a clean glyph passes,
 * and each rule where a glyph differs from art still fires — a validator that
 * passes everything is the silent failure. The art profile's fixtures are
 * tests/post-art.spec.ts. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import {
	PROFILES,
	RULES,
	validateArt,
	validateSvg,
} from "../../scripts/validate-art.mjs";

const glyph = (source: string) => validateSvg(source, { profile: PROFILES.glyph });
/** A violation's rule is the text before its first colon. */
const ruleOf = (violation: string) => violation.slice(0, violation.indexOf(":"));

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32">';
const LINE = 'fill="none" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke"';
/** A clean glyph, as a baked file starts: a waveform, a dotted guide, one coral dot — then the fixture's own markup. */
const wrap = (inner: string, open = OPEN) => `<!-- baked from recipes/fx.ts — edit the recipe -->
${open}
  <g>
    <path d="M 2 16 Q 8 4 14 16 T 26 16 T 38 16" ${LINE} />
    <line x1="2" y1="28" x2="46" y2="28" stroke="var(--glyph-dim)" stroke-width="1" stroke-linecap="round" stroke-dasharray="0.01 3.99" vector-effect="non-scaling-stroke" />
    <circle cx="42" cy="16" r="2" fill="var(--art-coral)" />
    ${inner}
  </g>
</svg>`;

const circles = (n: number, fill = "currentColor") =>
	Array.from({ length: n }, (_, i) => `<circle cx="${i % 48}" cy="10" r="1" fill="${fill}" />`).join("\n");

/** [what it does wrong, the rule that must fire — and only it, the file] */
const fixtures: Array<[string, string, string]> = [
	// root
	["the art plate's viewBox", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">')],
	["a square viewBox", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">')],
	["width and height on the root", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="48" height="32">')],
	// element: what art allows and a glyph does not
	["a clipPath", RULES.element, wrap('<clipPath><rect x="0" y="0" width="4" height="4" /></clipPath>')],
	["a <defs>", RULES.element, wrap("<defs></defs>")],
	["a <text>", RULES.element, wrap('<text x="1" y="1" fill="currentColor">hi</text>')],
	// paint
	["the plate's ink (--art-ink)", RULES.paint, wrap(`<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" stroke-width="1" vector-effect="non-scaling-stroke" />`)],
	["the plate's dim ink (--art-ink-2)", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="var(--art-ink-2)" />')],
	["an opacity attribute", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="currentColor" opacity="0.5" />')],
	["a hex fill", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="#fff" />')],
	["an outline with no fill (renders black-filled)", RULES.paint, wrap('<circle cx="4" cy="4" r="3" stroke="currentColor" stroke-width="1" vector-effect="non-scaling-stroke" />')],
	// attribute
	["a class, even art's own", RULES.attribute, wrap(`<path d="M 0 0 H 10" ${LINE} class="art-line" />`)],
	// stroke
	["a stroked shape with no stroke-width", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="currentColor" vector-effect="non-scaling-stroke" />')],
	["a stroke-width outside 1 / 1.5", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" />')],
	["a stroke with no vector-effect", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="currentColor" stroke-width="1" />')],
	["art's 2 6 dash", RULES.stroke, wrap(`<path d="M 0 0 H 10" ${LINE} stroke-dasharray="2 6" />`)],
	["a 3 3 dash (period 6: the dash motion would jump)", RULES.stroke, wrap(`<path d="M 0 0 H 10" ${LINE} stroke-dasharray="3 3" />`)],
	// motion (the art contract)
	["two data-motion groups", RULES.motion, wrap(`<g data-motion="spin"><circle cx="4" cy="4" r="1" fill="currentColor" /></g><g data-motion="blink"><circle cx="8" cy="4" r="1" fill="currentColor" /></g>`)],
	["a speed outside the set", RULES.motion, wrap(`<g data-motion="spin" data-speed="3"><circle cx="4" cy="4" r="1" fill="currentColor" /></g>`)],
	// budget
	["41 elements on the standard viewBox", RULES.budget, wrap(circles(40 - 4 + 1))],
	["81 elements on a wide viewBox", RULES.budget, wrap(circles(80 - 4 + 1), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 64">')],
	["more than 3 KB on the standard viewBox", RULES.budget, wrap(`<!-- ${"x".repeat(3 * 1024)} -->`)],
	["groups 4 deep", RULES.budget, wrap('<g><g><g><circle cx="4" cy="4" r="1" fill="currentColor" /></g></g></g>')],
	// ids
	["an id on a shape", RULES.ids, wrap('<circle id="fx-dot" cx="4" cy="4" r="1" fill="currentColor" />')],
	["an id on a group", RULES.ids, wrap('<g id="fx-group"><circle cx="4" cy="4" r="1" fill="currentColor" /></g>')],
	// palette
	[
		"three colours",
		RULES.palette,
		wrap(["lavender", "cyan"].map((c, i) => `<circle cx="${10 * i}" cy="4" r="1" fill="var(--art-${c})" />`).join("")),
	],
	["nothing painted", RULES.palette, `${OPEN}<path d="M 0 0 H 10" fill="none" stroke="none" /></svg>`],
];

describe("glyph profile", () => {
	test("the clean fixture passes", () => {
		expect(glyph(wrap(""))).toEqual([]);
	});

	test("the wide viewBoxes pass, with the wide budget", () => {
		for (const vb of ["0 0 96 32", "0 0 96 64"]) {
			const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">`;
			expect(glyph(wrap(circles(80 - 4), open))).toEqual([]);
		}
	});

	test("the glyph dashes pass, and so does a motion group", () => {
		const dashed = ["0.01 3.99", "2 2", "4 4"].map((d) => `<path d="M 0 4 H 10" ${LINE} stroke-dasharray="${d}" />`).join("");
		expect(glyph(wrap(`<g data-motion="dash" data-speed="0.5">${dashed}</g>`))).toEqual([]);
	});

	test("a stroke-width inherited from a group counts", () => {
		expect(
			glyph(wrap('<g stroke="currentColor" stroke-width="1.5"><path d="M 0 0 H 10" fill="none" vector-effect="non-scaling-stroke" /></g>')),
		).toEqual([]);
	});

	test("a clean glyph is not art: the profiles differ", () => {
		expect(validateArt(wrap("")).map(ruleOf)).toContain(RULES.root);
	});

	for (const [what, rule, source] of fixtures) {
		test(`${what} → ${rule}`, () => {
			const violations = glyph(source);
			expect(violations.length).toBeGreaterThan(0);
			expect(new Set(violations.map(ruleOf))).toEqual(new Set([rule]));
			// Every message names the element and its line.
			for (const v of violations) expect(v).toMatch(/^\w+: <\w+> line \d+: /);
		});
	}
});
