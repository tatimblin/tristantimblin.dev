import { test, expect } from "@playwright/test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	validateArt,
	slugOf,
	RULES,
	BUDGET,
} from "../packages/design-system/scripts/validate-art.mjs";

/**
 * POST ART.
 *
 * Every artwork — a post's `src/content/txt/<slug>.svg`, a filler in the
 * design-system package — is a drawing in one language, and the frame, the
 * tokens and the motion CSS assume it: a file that carries its own colours,
 * its own <style> or an <animate> renders, but outside the language, and the
 * page has no way to say so. The validator
 * (packages/design-system/scripts/validate-art.mjs) is that way; this spec
 * runs it over every file that ships and, with one fixture per rule, checks
 * that each rule still fires — a validator that passes everything is the
 * silent failure here.
 *
 * Static checks on the source: no browser, no page.
 */

const POSTS = "src/content/txt";
const FILLERS = "packages/design-system/src/art";

const svgsIn = (dir: string) =>
	readdirSync(dir)
		.filter((f) => f.endsWith(".svg"))
		.sort()
		.map((f) => join(dir, f));

/** A violation's rule is the text before its first colon. */
const ruleOf = (violation: string) => violation.slice(0, violation.indexOf(":"));

test.describe("post art: the files that ship", () => {
	const files = [...svgsIn(POSTS), ...svgsIn(FILLERS)];

	test("there is art to validate", () => {
		// The template at least — the glob must never quietly meet nothing.
		expect(files).toContain(join(FILLERS, "_template.svg"));
	});

	for (const file of files) {
		test(`${file} passes the validator`, () => {
			const violations = validateArt(readFileSync(file, "utf8"), { slug: slugOf(file) });
			expect(violations, violations.join("\n")).toEqual([]);
		});
	}
});

test.describe("post art: every published post has its art", () => {
	test("every non-draft post has a sibling .svg", () => {
		const posts = readdirSync(POSTS)
			.filter((f) => f.endsWith(".mdx"))
			.sort()
			.filter((f) => {
				const head = readFileSync(join(POSTS, f), "utf8").split(/^---\s*$/m)[1] ?? "";
				return !/^\s*draft:\s*true\s*$/m.test(head);
			});
		const missing = posts.filter((f) => !existsSync(join(POSTS, f.replace(/\.mdx$/, ".svg"))));

		// GATED UNTIL PHASE 2. No post art exists yet — it arrives one post at a
		// time — so until every post has its file this reports the missing ones
		// as a fixme rather than failing the suite. The moment the last one lands
		// it turns strict on its own; Phase 2's catalogue unit can then drop the
		// gate.
		test.fixme(
			missing.length > 0,
			`no art yet for: ${missing.join(", ")} (Phase 2 draws them)`,
		);
		expect(missing).toEqual([]);
	});
});

// --- One fixture per rule ---------------------------------------------------

const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">';
const LINE = 'fill="none" stroke="var(--art-ink)" class="art-line" vector-effect="non-scaling-stroke"';
/** A clean file: one trace, one dot — then the fixture's own markup. */
const wrap = (inner: string, open = OPEN) => `${open}
  <g>
    <path d="M -10 60 H 130" ${LINE} />
    <circle cx="130" cy="60" r="2.5" fill="var(--art-ink)" />
    ${inner}
  </g>
</svg>`;

const SLUG = "fx";

/** [what it does wrong, the rule that must fire — and only it, the file] */
const fixtures: Array<[string, string, string]> = [
	// 1. root
	["a viewBox that is not the tile", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">')],
	["no viewBox", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg">')],
	["width and height on the root", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180">')],
	["another namespace", RULES.root, wrap("", '<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 320 180">')],
	// 2. element
	["a <text>", RULES.element, wrap('<text x="10" y="20" fill="var(--art-ink)">hi</text>')],
	["a gradient in defs", RULES.element, wrap('<defs><linearGradient id="fx-g"></linearGradient></defs>')],
	["an <animateTransform>", RULES.element, wrap('<animateTransform attributeName="transform" type="rotate" />')],
	["an element outside the set", RULES.element, wrap("<marker></marker>")],
	// 3. attribute
	["a style attribute", RULES.attribute, wrap(`<circle cx="60" cy="30" r="3" fill="var(--art-coral)" style="opacity:.5" />`)],
	["a class of its own", RULES.attribute, wrap(`<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" class="thin" vector-effect="non-scaling-stroke" />`)],
	["an event handler", RULES.attribute, wrap(`<circle cx="60" cy="30" r="3" fill="var(--art-coral)" onclick="x()" />`)],
	["the xlink namespace", RULES.attribute, wrap("", '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 320 180">')],
	// 4. paint
	["a hex fill", RULES.paint, wrap('<circle cx="60" cy="30" r="3" fill="#ffffff" />')],
	["an outline with no fill (renders black-filled)", RULES.paint, wrap(`<circle cx="60" cy="30" r="3" stroke="var(--art-ink)" vector-effect="non-scaling-stroke" />`)],
	["an rgb stroke", RULES.paint, wrap('<path d="M 0 0 H 10" fill="none" stroke="rgb(255,255,255)" class="art-line" vector-effect="non-scaling-stroke" />')],
	["a named colour", RULES.paint, wrap('<circle cx="60" cy="30" r="3" fill="white" />')],
	["an opacity attribute", RULES.paint, wrap('<circle cx="60" cy="30" r="3" fill="var(--art-ink)" opacity="0.5" />')],
	["a fill-opacity attribute", RULES.paint, wrap('<circle cx="60" cy="30" r="3" fill="var(--art-ink)" fill-opacity="0.5" />')],
	["the plate token", RULES.paint, wrap('<rect x="0" y="0" width="320" height="180" fill="var(--art-plate)" />')],
	["a shape with no fill or stroke (black by default)", RULES.paint, wrap('<circle cx="60" cy="30" r="3" />')],
	// 5. stroke
	["a stroke with no vector-effect", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" class="art-line" />')],
	["a stroke inherited from a <g> with no vector-effect on the shape", RULES.stroke, wrap('<g stroke="var(--art-ink-2)"><path d="M 0 0 H 10" fill="none" /></g>')],
	["a stroke-width outside 1 / 1.5", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" stroke-width="2" vector-effect="non-scaling-stroke" />')],
	["a class and a stroke-width that disagree", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" class="art-line" stroke-width="1.5" vector-effect="non-scaling-stroke" />')],
	["a dash pattern outside 4 4 / 2 6", RULES.stroke, wrap(`<path d="M 0 0 H 10" ${LINE} stroke-dasharray="3 3" />`)],
	["a vector-effect other than non-scaling-stroke", RULES.stroke, wrap('<path d="M 0 0 H 10" fill="none" stroke="var(--art-ink)" vector-effect="none" />')],
	// 6. motion
	["two data-motion groups", RULES.motion, wrap(`<g data-motion="spin"><circle cx="60" cy="30" r="3" fill="var(--art-coral)" /></g><g data-motion="blink"><circle cx="90" cy="30" r="3" fill="var(--art-coral)" /></g>`)],
	["a motion outside the set", RULES.motion, wrap(`<g data-motion="wiggle"><circle cx="60" cy="30" r="3" fill="var(--art-coral)" /></g>`)],
	["a transform on the motion group (the animation replaces it)", RULES.motion, wrap(`<g data-motion="spin" transform="translate(4 0)"><circle cx="60" cy="30" r="3" fill="var(--art-coral)" /></g>`)],
	["a speed outside the set", RULES.motion, wrap(`<g data-motion="spin" data-speed="3"><circle cx="60" cy="30" r="3" fill="var(--art-coral)" /></g>`)],
	["data-speed without data-motion", RULES.motion, wrap(`<g data-speed="2"><circle cx="60" cy="30" r="3" fill="var(--art-coral)" /></g>`)],
	["data-motion on a shape", RULES.motion, wrap(`<circle cx="60" cy="30" r="3" fill="var(--art-coral)" data-motion="blink" />`)],
	["an empty motion group", RULES.motion, wrap(`<g data-motion="spin"></g>`)],
	["a dash group that sets stroke-dashoffset", RULES.motion, wrap(`<g data-motion="dash"><path d="M 0 0 H 10" ${LINE} stroke-dasharray="4 4" stroke-dashoffset="2" /></g>`)],
	["a dash group whose trace is not dashed", RULES.motion, wrap(`<g data-motion="dash"><path d="M 0 0 H 10" ${LINE} /></g>`)],
	// 7. budget
	[
		`more than ${BUDGET.elements} elements`,
		RULES.budget,
		wrap(Array.from({ length: BUDGET.elements }, (_, i) => `<circle cx="${i}" cy="10" r="1.5" fill="var(--art-ink)" />`).join("\n")),
	],
	[`more than ${BUDGET.bytes} bytes`, RULES.budget, wrap(`<!-- ${"x".repeat(BUDGET.bytes)} -->`)],
	[
		`more than ${BUDGET.clipPaths} clipPaths`,
		RULES.budget,
		wrap(
			"<defs>" +
				["a", "b", "c", "d"].map((n) => `<clipPath id="${SLUG}-${n}"><rect x="0" y="0" width="10" height="10" /></clipPath>`).join("") +
				"</defs>",
		),
	],
	[`groups more than ${BUDGET.depth} deep`, RULES.budget, wrap('<g><g><g><g><circle cx="60" cy="30" r="3" fill="var(--art-ink)" /></g></g></g></g>')],
	// 8. ids
	["a clipPath id without the slug prefix", RULES.ids, wrap('<defs><clipPath id="clip"><rect x="0" y="0" width="10" height="10" /></clipPath></defs>')],
	["a clipPath with no id", RULES.ids, wrap('<defs><clipPath><rect x="0" y="0" width="10" height="10" /></clipPath></defs>')],
	["an id on a shape", RULES.ids, wrap(`<circle id="${SLUG}-dot" cx="60" cy="30" r="3" fill="var(--art-ink)" />`)],
	["a use that points at nothing", RULES.ids, wrap('<use href="#nowhere" />')],
	["a clip-path that points at nothing", RULES.ids, wrap('<g clip-path="url(#nowhere)"><circle cx="60" cy="30" r="3" fill="var(--art-ink)" /></g>')],
	// 9. palette
	[
		"all four colours",
		RULES.palette,
		wrap(["lavender", "coral", "cyan", "green"].map((c, i) => `<circle cx="${20 * i}" cy="30" r="3" fill="var(--art-${c})" />`).join("")),
	],
	[
		"no token at all",
		RULES.palette,
		`${OPEN}<path d="M -10 60 H 130" fill="none" stroke="currentColor" class="art-line" vector-effect="non-scaling-stroke" /></svg>`,
	],
	// The file itself.
	["a tag that never closes", RULES.markup, wrap("<g>")],
	["a close tag that closes nothing", RULES.markup, wrap("</g>")],
	["character data between tags", RULES.markup, wrap("stray words")],
];

test.describe("post art: each rule fires, and only it", () => {
	test("the clean fixture passes", () => {
		expect(validateArt(wrap(""), { slug: SLUG })).toEqual([]);
	});

	for (const [what, rule, source] of fixtures) {
		test(`${what} → ${rule}`, () => {
			const violations = validateArt(source, { slug: SLUG });
			expect(violations.length, "expected a violation").toBeGreaterThan(0);
			expect(new Set(violations.map(ruleOf)), violations.join("\n")).toEqual(new Set([rule]));
			// Every message names the element and its line.
			for (const v of violations) expect(v).toMatch(/^\w+: <\w+> line \d+: /);
		});
	}

	test("the same drawing with two ids on one page cannot collide: ids carry the slug", () => {
		const file = wrap(
			`<defs><clipPath id="${SLUG}-window"><rect x="0" y="0" width="160" height="180" /></clipPath></defs>` +
				`<g clip-path="url(#${SLUG}-window)"><circle cx="60" cy="30" r="3" fill="var(--art-cyan)" /></g>`,
		);
		expect(validateArt(file, { slug: SLUG })).toEqual([]);
		expect(validateArt(file, { slug: "other" }).map(ruleOf)).toEqual([RULES.ids]);
	});

	test("comments are prose: a rule word inside one does not fire", () => {
		expect(
			validateArt(wrap("<!-- no <text>, no style=, no #fff, no data-motion twice -->"), { slug: SLUG }),
		).toEqual([]);
	});
});
