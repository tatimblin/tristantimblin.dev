/**
 * The scene profile of the SVG validator
 * (theme/design-system/scripts/validate-art.mjs): a clean scene passes,
 * the wash, the dot-dash and the second motion group it adds over art
 * pass, and each rule where a scene differs from art (or keeps art's
 * limit) still fires. The glyph fixtures are validate-glyph.test.ts, the
 * art ones validate-art.test.ts. `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { PROFILES, RULES, SCENE_VIEWBOXES, validateArt, validateSvg } from "../../scripts/validate-art.mjs";

const scene = (source: string, slug?: string) => validateSvg(source, { profile: PROFILES.scene, slug });
/** A violation's rule is the text before its first colon. */
const ruleOf = (violation: string) => violation.slice(0, violation.indexOf(":"));

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">';
const LINE = 'fill="none" stroke="var(--art-ink)" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke"';
const GREEN = 'fill="none" stroke="var(--art-green)" stroke-width="1.5" class="art-line--2" vector-effect="non-scaling-stroke"';
const WASH = "color-mix(in oklab, var(--art-cyan) 22%, transparent)";
/** A clean scene, as a baked file starts: a washed sphere, its limb, a graticule, a spinning dot-dash orbit, a blinking marker — then the fixture's own markup. */
const wrap = (inner: string, open = OPEN) => `<!-- baked from tools/scenes/fx/scene.ts (sources 0123456789abcdef) — edit the source -->
<!-- credit: a fixture -->
${open}
  <circle cx="200" cy="200" r="120" fill="${WASH}" />
  <circle cx="200" cy="200" r="120" ${LINE} />
  <path d="M 80 200 H 320 M 200 80 V 320" fill="none" stroke="var(--art-ink-2)" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke" />
  <g data-motion="spin">
    <path d="M 60 200 A 140 140 0 0 1 200 60" fill="none" stroke="var(--art-coral)" stroke-width="1.5" class="art-line--2" vector-effect="non-scaling-stroke" stroke-dasharray="6 3 1 3" />
    <path d="M 340 200 A 140 140 0 0 1 200 340" fill="none" stroke="var(--art-coral)" stroke-width="1.5" class="art-line--2" vector-effect="non-scaling-stroke" stroke-dasharray="6 3 1 3" />
  </g>
  <g data-motion="blink" data-speed="0.5">
    <circle cx="168" cy="140" r="4" fill="var(--art-coral)" />
  </g>
  ${inner}
</svg>`;

const circles = (n: number, fill = "var(--art-ink)") =>
	Array.from({ length: n }, (_, i) => `<circle cx="${i % 400}" cy="10" r="1" fill="${fill}" />`).join("\n");

/** [what it does wrong, the rule that must fire — and only it, the file] */
const fixtures: Array<[string, string, string]> = [
	// root
	["a glyph's viewBox", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32">')],
	["a wide panel", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400">')],
	["width and height on the root", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">')],
	// element: art's list, nothing more
	// type: art's voices (a scene's plate may set words; validate-art.test.ts holds a fixture per type rule)
	["a <text> with no voice", RULES.type, wrap('<text x="1" y="1" font-size="4.5" fill="var(--art-ink)">300.733 MHZ</text>')],
	["a <text> off the scale", RULES.type, wrap('<text class="art-label" x="1" y="1" font-size="5" fill="var(--art-ink)">300.733 MHZ</text>')],
	["a <text> that names its face", RULES.type, wrap('<text class="art-label" x="1" y="1" font-size="4.5" font-family="Mondwest" fill="var(--art-ink)">300.733 MHZ</text>')],
	["a gradient", RULES.element, wrap("<defs><linearGradient></linearGradient></defs>")],
	["a filter (the glow is the host's CSS)", RULES.element, wrap("<defs><filter></filter></defs>")],
	// paint: the wash, and its edges
	["a wash past 25%", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="color-mix(in oklab, var(--art-cyan) 26%, transparent)" />')],
	["a wash at 0%", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="color-mix(in oklab, var(--art-cyan) 0%, transparent)" />')],
	["a wash of the ink", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="color-mix(in oklab, var(--art-ink) 20%, transparent)" />')],
	["a wash in srgb", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="color-mix(in srgb, var(--art-cyan) 20%, transparent)" />')],
	["a wash over a colour, not transparent", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="color-mix(in oklab, var(--art-cyan) 20%, var(--art-green))" />')],
	["a wash as a stroke", RULES.paint, wrap(`<path d="M 0 0 H 10" fill="none" stroke="${WASH}" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke" />`)],
	["a glyph's dim (--glyph-dim)", RULES.paint, wrap(`<path d="M 0 0 H 10" fill="none" stroke="var(--glyph-dim)" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke" />`)],
	["an opacity attribute", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="var(--art-ink)" opacity="0.5" />')],
	["a fill-opacity (the wash is the one translucency)", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="var(--art-cyan)" fill-opacity="0.2" />')],
	["a hex fill", RULES.paint, wrap('<circle cx="4" cy="4" r="1" fill="#5b8def" />')],
	["the frame's plate token", RULES.paint, wrap('<rect x="0" y="0" width="400" height="400" fill="var(--art-plate)" />')],
	// stroke
	["a stroke-width outside 1 / 1.5", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" stroke-width="2" vector-effect="non-scaling-stroke" />')],
	["a stroke with no vector-effect", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" stroke-width="1" />')],
	["a glyph's 2 2 dash", RULES.stroke, wrap(`<path d="M 0 0 H 10" ${LINE} stroke-dasharray="2 2" />`)],
	["a dot-dash of another rhythm", RULES.stroke, wrap(`<path d="M 0 0 H 10" ${LINE} stroke-dasharray="6 3 2 3" />`)],
	// motion: two groups, not three; the dot-dash never in a dash group
	["a third data-motion group", RULES.motion, wrap('<g data-motion="drift"><circle cx="8" cy="4" r="1" fill="var(--art-ink)" /></g>')],
	["the dot-dash in a dash group (period 13: the loop would jump)", RULES.motion, wrap(`<g data-motion="dash"><path d="M 0 0 H 10" ${GREEN} stroke-dasharray="6 3 1 3" /></g>`).replace('<g data-motion="blink" data-speed="0.5">', '<g>')],
	["a speed outside the set", RULES.motion, wrap('<g data-motion="spin" data-speed="3"><circle cx="4" cy="4" r="1" fill="var(--art-ink)" /></g>').replace('<g data-motion="blink" data-speed="0.5">', "<g>")],
	// budget
	["401 elements", RULES.budget, wrap(circles(400 - 8 + 1))],
	["more than 64 KB", RULES.budget, wrap(`<!-- ${"x".repeat(64 * 1024)} -->`)],
	["a fourth clipPath", RULES.budget, wrap(Array.from({ length: 4 }, (_, i) => `<clipPath id="fx-c${i}"><rect x="0" y="0" width="4" height="4" /></clipPath>`).join(""))],
	["groups 5 deep", RULES.budget, wrap('<g><g><g><g><g><circle cx="4" cy="4" r="1" fill="var(--art-ink)" /></g></g></g></g></g>')],
	// ids: art's rule — a clipPath's, prefixed with the scene's name
	["an id on a shape", RULES.ids, wrap('<circle id="fx-dot" cx="4" cy="4" r="1" fill="var(--art-ink)" />')],
	// palette: three colours at most, a wash counting as its colour
	["four colours, one of them a wash", RULES.palette, wrap('<circle cx="4" cy="4" r="1" fill="var(--art-lavender)" /><circle cx="8" cy="4" r="1" fill="color-mix(in oklab, var(--art-green) 10%, transparent)" />')],
	["nothing but a wash", RULES.palette, `${OPEN}<circle cx="4" cy="4" r="1" fill="${WASH}" /></svg>`.replace(WASH, "none")],
];

describe("scene profile", () => {
	test("the clean fixture passes", () => {
		expect(scene(wrap(""))).toEqual([]);
	});

	test("both roots pass, with the same budget", () => {
		for (const vb of SCENE_VIEWBOXES) {
			const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">`;
			expect(scene(wrap(circles(400 - 8), open))).toEqual([]);
		}
	});

	test("a wash at 1% and at 25% pass, on every colour", () => {
		for (const c of ["lavender", "coral", "cyan", "green"]) {
			for (const pct of [1, 25]) {
				const file = `${OPEN}<circle cx="4" cy="4" r="1" fill="color-mix(in oklab, var(--art-${c}) ${pct}%, transparent)" /></svg>`;
				expect(scene(file), `${c} ${pct}%`).toEqual([]);
			}
		}
	});

	test("art's dashes and the dot-dash pass; art's dashes may move", () => {
		const still = ["4 4", "2 6", "6 3 1 3"].map((d) => `<path d="M 0 4 H 10" ${LINE} stroke-dasharray="${d}" />`).join("");
		expect(scene(wrap(still))).toEqual([]);
		const moving = ["4 4", "2 6"].map((d) => `<path d="M 0 4 H 10" ${LINE} stroke-dasharray="${d}" />`).join("");
		const one = wrap(`<g data-motion="dash">${moving}</g>`).replace('<g data-motion="blink" data-speed="0.5">', "<g>");
		expect(scene(one)).toEqual([]);
	});

	test("a scene may set type in art's four voices", () => {
		const type = [
			'<text class="art-label" x="20" y="30" font-size="4.5" fill="var(--art-ink)">300.733 MHZ</text>',
			'<text class="art-numeral" x="380" y="380" font-size="32" text-anchor="end" fill="var(--art-coral)">045</text>',
			'<text class="art-caption" x="20" y="40" font-size="3.5" fill="var(--art-ink-2)">LAT <tspan class="art-title" font-size="6">N 37.4</tspan></text>',
		].join("");
		expect(scene(wrap(type))).toEqual([]);
	});

	test("a clipPath id prefixed with the scene's name passes; another prefix fails", () => {
		const clip = (id: string) => `<clipPath id="${id}"><circle cx="200" cy="200" r="120" /></clipPath><g clip-path="url(#${id})"><path d="M 0 200 H 400" ${LINE} /></g>`;
		expect(scene(wrap(clip("globe-disc")), "globe")).toEqual([]);
		expect(scene(wrap(clip("disc")), "globe").map(ruleOf)).toEqual([RULES.ids]);
	});

	test("a clean scene is not art: the second motion group and the wash are the scene's", () => {
		const rules = new Set(validateArt(wrap("")).map(ruleOf));
		expect(rules).toEqual(new Set([RULES.root, RULES.paint, RULES.stroke, RULES.motion]));
	});

	test("a clean scene on the plate is art but for the wash and the second motion", () => {
		const open = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">';
		const rules = new Set(validateArt(wrap("", open)).map(ruleOf));
		expect(rules).toEqual(new Set([RULES.paint, RULES.stroke, RULES.motion]));
	});

	for (const [what, rule, source] of fixtures) {
		test(`${what} → ${rule}`, () => {
			const violations = scene(source);
			expect(violations.length).toBeGreaterThan(0);
			expect(new Set(violations.map(ruleOf))).toEqual(new Set([rule]));
			// Every message names the element and its line.
			for (const v of violations) expect(v).toMatch(/^\w+: <\w+> line \d+: /);
		});
	}
});
