// The SVG validator: the rules of the drawing languages, enforceable from a
// shell and from the test suite. A drawing is a drawing only — its host
// supplies the size, the tokens supply every colour, the host's CSS supplies
// the motion — so what is left to check is that a file carries nothing else.
//
// Three languages share one scanner and one set of rules, and differ only in
// their constants, which a PROFILE holds:
//
//   art    — the 320×180 post-art plates (src/content/txt/<slug>.svg, the
//            fillers in src/art/), rendered through ArtFrame. The rules are the
//            CONVENTIONS "Art" section and the comment in src/art/_template.svg,
//            made mechanical; tests/post-art.spec.ts holds a fixture per rule.
//   glyph  — the micrographics (src/glyphs/<name>.svg): 48×32 or 96-wide
//            hairline marks inlined beside text, their line work currentColor
//            so they take the colour of the text they sit in. No classes, no
//            ids, no clipPaths — many sit on one page and none owns a frame.
//            Its fixtures are src/lib/validate-glyph.test.ts (`bun run test:unit`).
//   scene  — the L4 scenes (src/scenes/<name>.svg, baked from
//            tools/scenes/<name>/scene.ts): art's language on the plate or on
//            a 400×400 panel, with the budget a projected map or a sliced
//            mesh needs, one WASH fill (a colour token mixed down to at most
//            25% over transparent — an ocean, a ruler's band), a dot-dash, and
//            two motion groups. Rendered through Scene (an ArtFrame). Its
//            fixtures are src/lib/validate-scene.test.ts.
//
//   import { validateSvg, validateArt, PROFILES } from ".../validate-art.mjs";
//   validateSvg(source, { profile: PROFILES.glyph }) → string[]   // [] when clean
//   validateArt(source, { slug: "mega-desk" }) → string[]         // the art profile
//
//   bun packages/design-system/scripts/validate-art.mjs [--profile glyph|scene] <file…>
//   bun run validate:art src/content/txt/mega-desk.svg      // exit 1 on a violation
//   bun run validate:glyph packages/design-system/src/glyphs/*.svg
//   bun run validate:scene packages/design-system/src/scenes/*.svg
//
// Every violation is one line, `<rule>: <element> line N: <what>`, where
// <rule> is one of RULES below, so a reader (or the spec) knows which rule
// fired without reading the prose. The slug is the file's basename: an art
// file's clipPath ids must be prefixed with it so two artworks inlined on one
// page cannot collide.
//
// No XML dependency: the format is constrained enough (tags, attributes,
// comments, nothing else) that a tag/attribute scanner reads it whole, and a
// file it cannot read is itself a violation. The file keeps its old name
// (validate-art) so nothing that imports it has to move.

import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The rule names, as they prefix a violation. Numbers are the art rules; a glyph's differences follow. */
export const RULES = Object.freeze({
	/** The file is one well-formed <svg> and nothing else. */
	markup: "markup",
	/** 1. viewBox is exactly 0 0 320 180; no width/height; only the svg namespace. Glyph: 0 0 48 32, 0 0 96 32 or 0 0 96 64. */
	root: "root",
	/** 2. Only the drawing elements; text, images, gradients, filters, animation fail on sight. Glyph: no clipPath/defs/use either. */
	element: "element",
	/** 3. No style=, no on*, no xlink:, class only art-line / art-line--2. Glyph: no class at all. */
	attribute: "attribute",
	/** 4. fill/stroke are none, currentColor or an --art-* token; no literals, no opacity. Glyph: --glyph-dim for the ink's dimming, no --art-ink*. Scene: a fill may also be a WASH, color-mix(in oklab, var(--art-<colour>) N%, transparent), N ≤ 25. */
	paint: "paint",
	/** 5. A stroked shape has vector-effect="non-scaling-stroke" and a weight of 1 or 1.5; dashes 4 4 or 2 6. Glyph: the weight is always a stroke-width. Scene: the dot-dash 6 3 1 3 too. */
	stroke: "stroke",
	/** 6. One data-motion per file (a scene: two), on a <g>, spin|drift|slide|blink|dash; data-speed 0.5|1|2; a dash group is dashed with a period that divides 8, and sets no offset. */
	motion: "motion",
	/** 7. ≤ 120 elements, ≤ 12 KB, ≤ 3 clipPaths, groups ≤ 4 deep. Glyph: 40 / 3 KB (80 / 6 KB wide), groups ≤ 3 deep. Scene: 400 / 64 KB. */
	budget: "budget",
	/** 8. ids only on a clipPath or defs content, prefixed <slug>-; use/clip-path point inside the file. Glyph: no ids. */
	ids: "ids",
	/** 9. At least one --art-* token, at most three of the four fill colours. Glyph: at least one paint, at most two colours. */
	palette: "palette",
});

// --- The art constants (the art profile is built from these; they stay
// exported under their old names for the spec and the motif check) ---------

export const VIEWBOX = "0 0 320 180";
export const SVG_NS = "http://www.w3.org/2000/svg";
export const ALLOWED_ELEMENTS = Object.freeze([
	"svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline",
	"polygon", "clipPath", "defs", "use",
]);
export const FORBIDDEN_ELEMENTS = Object.freeze([
	"text", "tspan", "image", "foreignObject", "style", "script", "filter",
	"linearGradient", "radialGradient", "pattern", "mask", "animate",
	"animateTransform", "animateMotion", "set", "a", "title", "desc",
]);
export const SHAPES = Object.freeze([
	"path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
]);
export const PAINTS = Object.freeze([
	"none", "currentColor", "var(--art-ink)", "var(--art-ink-2)",
	"var(--art-lavender)", "var(--art-coral)", "var(--art-cyan)", "var(--art-green)",
]);
/** The four fills: a file uses at most three. */
export const COLOURS = Object.freeze(["lavender", "coral", "cyan", "green"]);
/** The frame's tokens: never in a file. */
export const FRAME_TOKENS = Object.freeze(["--art-plate", "--art-edge", "--art-radius"]);
export const CLASSES = Object.freeze(["art-line", "art-line--2"]);
export const WEIGHTS = Object.freeze({ "art-line": "1", "art-line--2": "1.5" });
export const STROKE_WIDTHS = Object.freeze(["1", "1.5"]);
export const DASHES = Object.freeze(["4 4", "2 6"]);
export const MOTIONS = Object.freeze(["spin", "drift", "slide", "blink", "dash"]);
export const SPEEDS = Object.freeze(["0.5", "1", "2"]);
export const BUDGET = Object.freeze({
	elements: 120,
	bytes: 12 * 1024,
	clipPaths: 3,
	depth: 4,
});

// --- Profiles ------------------------------------------------------------

/**
 * Everything that differs between two kinds of drawing. The rules read only
 * this; a new kind is a new profile, not a new branch in the rules.
 *
 * @typedef {object} Profile
 * @property {string} name        "art" | "glyph" | "scene"; names the kind in a message
 * @property {string} host        what sizes and paints the file, for the prose ("the frame")
 * @property {Readonly<Record<string, Budget>>} viewBoxes
 *           the root viewBoxes allowed, each with its budget; the first is the
 *           default (and the budget a file with a wrong viewBox is held to)
 * @property {readonly string[]} elements   the element whitelist (FORBIDDEN_ELEMENTS always fail)
 * @property {readonly string[]} paints     every fill/stroke value allowed
 * @property {number} wash                  the most a WASH fill may mix a colour to, in percent
 *           (`color-mix(in oklab, var(--art-<colour>) N%, transparent)`, fill only); 0 for no wash
 * @property {string} dimming               the one paint that dims, named when an opacity is refused
 * @property {readonly { token: string, why: string }[]} forbiddenTokens
 *           tokens that may not appear in any attribute value, and why
 * @property {{ max: number, require: "token" | "paint", why: string }} palette
 *           at most `max` of COLOURS; "token": at least one --art-* token,
 *           "paint": at least one fill/stroke other than none
 * @property {readonly string[]} classes    the allowed classes; empty means no class attribute at all
 * @property {Readonly<Record<string, string>>} weights  class → the stroke-width it sets
 * @property {readonly string[]} strokeWidths
 * @property {boolean} requireStrokeWidth   a stroked shape states its own-or-inherited stroke-width
 * @property {readonly string[]} dashes     stroke-dasharray values, space-separated
 * @property {readonly string[]} motions    data-motion kinds; empty means no motion
 * @property {number} motionGroups          how many data-motion groups a file may carry
 * @property {readonly string[]} speeds
 * @property {boolean} ids                  false: no id anywhere (so no clipPath/use can point at one)
 *
 * @typedef {object} Budget
 * @property {number} elements  every element but the root
 * @property {number} bytes     the file's size, comments included
 * @property {number} depth     how many <g>s deep
 * @property {number} [clipPaths]  absent when the kind has no clipPath
 */

/** @type {Profile} */
const ART = Object.freeze({
	name: "art",
	host: "the frame",
	viewBoxes: Object.freeze({ [VIEWBOX]: BUDGET }),
	elements: ALLOWED_ELEMENTS,
	paints: PAINTS,
	wash: 0,
	dimming: "var(--art-ink-2)",
	forbiddenTokens: Object.freeze(FRAME_TOKENS.map((token) => ({ token, why: "belongs to the frame, not a file" }))),
	palette: Object.freeze({ max: 3, require: "token", why: "the ink plus at most three, one dominant" }),
	classes: CLASSES,
	weights: WEIGHTS,
	strokeWidths: STROKE_WIDTHS,
	requireStrokeWidth: false,
	dashes: DASHES,
	motions: MOTIONS,
	motionGroups: 1,
	speeds: SPEEDS,
	ids: true,
});

/**
 * The glyph dashes. Measured in Chromium (a 48×32 glyph at 96px and 192px
 * wide, at DPR 1 and 2): under vector-effect="non-scaling-stroke" a
 * stroke-dasharray is in SCREEN px, not viewBox units — "4 4" drew 4px on,
 * 4px off at both sizes, and 8/16px without the vector-effect. (Art's dashes
 * are screen px too, for the same reason.) So a glyph's dashes are chosen as
 * pixels, the same at every size a glyph is drawn:
 *
 *   "0.01 3.99"  the dotted guide: with stroke-linecap="round", a 1px dot every
 *                4px. The 0.01 is load-bearing — a "0 4" dash drew nothing at
 *                DPR 1. The period is exactly 4 so the frame's dash motion
 *                (an 8-unit offset) loops seamlessly over it.
 *   "2 2"        a fine dash, period 4.
 *   "4 4"        art's dash, period 8.
 *
 * Every period divides 8, for the same seamless loop ("3 3", period 6, would
 * jump at the end of each cycle).
 */
const GLYPH_DASHES = Object.freeze(["0.01 3.99", "2 2", "4 4"]);

/** @type {Profile} */
const GLYPH = Object.freeze({
	name: "glyph",
	host: "the Glyph component",
	viewBoxes: Object.freeze({
		"0 0 48 32": Object.freeze({ elements: 40, bytes: 3 * 1024, depth: 3 }),
		"0 0 96 32": Object.freeze({ elements: 80, bytes: 6 * 1024, depth: 3 }),
		"0 0 96 64": Object.freeze({ elements: 80, bytes: 6 * 1024, depth: 3 }),
	}),
	elements: Object.freeze(["svg", "g", ...SHAPES]),
	paints: Object.freeze([
		"none", "currentColor", "var(--glyph-dim)",
		"var(--art-lavender)", "var(--art-coral)", "var(--art-cyan)", "var(--art-green)",
	]),
	wash: 0,
	dimming: "var(--glyph-dim)",
	forbiddenTokens: Object.freeze([
		...FRAME_TOKENS.map((token) => ({ token, why: "belongs to the art frame; a glyph has none" })),
		{ token: "--art-ink", why: "is the plate's ink; a glyph's line work is currentColor (dimmed: var(--glyph-dim)) so it follows the text it sits in" },
	]),
	palette: Object.freeze({ max: 2, require: "paint", why: "currentColor plus at most two" }),
	classes: Object.freeze([]),
	weights: Object.freeze({}),
	strokeWidths: STROKE_WIDTHS,
	requireStrokeWidth: true,
	dashes: GLYPH_DASHES,
	motions: MOTIONS,
	motionGroups: 1,
	speeds: SPEEDS,
	ids: false,
});

/**
 * The scene budget, on either root. ELEMENTS are what the DOM pays for —
 * every one is a node the page lays out, hit-tests and (in a motion group)
 * composites — so the cap is on them, not on bytes: 400 is a small page
 * section's worth, and a scene that needs more is drawing many marks where
 * one path with many points would do. BYTES are the wire cost of a file
 * inlined into the HTML: a projected coastline is one long `d` (the globe's
 * land is most of its 40 KB), so the cap is set where a scene stays cheaper
 * than the image it replaces; 64 KB is about a well-compressed hero photo.
 * The ART profile's dashes are screen px under non-scaling-stroke, so they
 * hold on the panel as on the plate; the scene adds the dot-dash `6 3 1 3`
 * (an orbit, a track), whose period 13 does not divide the dash motion's 8 —
 * it is a still dash, or a spinning one, never in a dash group.
 */
const SCENE_BUDGET = Object.freeze({ elements: 400, bytes: 64 * 1024, clipPaths: 3, depth: 4 });
export const SCENE_VIEWBOXES = Object.freeze([VIEWBOX, "0 0 400 400"]);
const SCENE_DASHES = Object.freeze([...DASHES, "6 3 1 3"]);

/** @type {Profile} */
const SCENE = Object.freeze({
	name: "scene",
	host: "the Scene component",
	viewBoxes: Object.freeze(Object.fromEntries(SCENE_VIEWBOXES.map((vb) => [vb, SCENE_BUDGET]))),
	elements: ALLOWED_ELEMENTS,
	paints: PAINTS,
	wash: 25,
	dimming: "var(--art-ink-2)",
	forbiddenTokens: Object.freeze(FRAME_TOKENS.map((token) => ({ token, why: "belongs to the frame, not a file" }))),
	palette: Object.freeze({ max: 3, require: "token", why: "the ink plus at most three, one dominant (a wash counts as its colour)" }),
	classes: CLASSES,
	weights: WEIGHTS,
	strokeWidths: STROKE_WIDTHS,
	requireStrokeWidth: false,
	dashes: SCENE_DASHES,
	motions: MOTIONS,
	motionGroups: 2,
	speeds: SPEEDS,
	ids: true,
});

/** Every kind the validator knows, by name (the CLI's --profile). */
export const PROFILES = Object.freeze({ art: ART, glyph: GLYPH, scene: SCENE });

/**
 * The one wash form a scene's fill may take: a colour token mixed down over
 * transparent, in oklab, at a whole percent. The kit writes it (`k.wash()`);
 * the rule reads the colour and the percent back out of it.
 */
const WASH = /^color-mix\(in oklab, var\(--art-(lavender|coral|cyan|green)\) (\d{1,3})%, transparent\)$/;

const FORBIDDEN = new Set(FORBIDDEN_ELEMENTS);
const SHAPE = new Set(SHAPES);

/** `"a" or "b"`, `"a", "b" or "c"`: a list in a message. */
const either = (xs, quote = true) => {
	const q = xs.map((x) => (quote ? `"${x}"` : x));
	return q.length < 2 ? q.join("") : `${q.slice(0, -1).join(", ")} or ${q[q.length - 1]}`;
};

const COUNTS = ["no", "one", "two", "three", "all four"];

/**
 * @typedef {object} Element
 * @property {string} name
 * @property {Map<string, string>} attrs
 * @property {number} line   1-based, of the opening tag
 * @property {Element | null} parent
 * @property {Element[]} children
 */

/**
 * Validate one art file: validateSvg with the art profile.
 * @param {string} source  the file's text
 * @param {{ slug?: string }} [options]  the file's basename without .svg; clipPath ids must start with `<slug>-`
 * @returns {string[]}  violations, one line each; empty when the file is clean
 */
export function validateArt(source, { slug } = {}) {
	return validateSvg(source, { profile: ART, slug });
}

/**
 * Validate one drawing against a profile.
 * @param {string} source  the file's text
 * @param {{ profile?: Profile, slug?: string }} [options]  profile defaults to art; slug as validateArt
 * @returns {string[]}  violations, one line each; empty when the file is clean
 */
export function validateSvg(source, { profile = ART, slug } = {}) {
	const P = profile;
	const ALLOWED = new Set(P.elements);
	const PAINT = new Set(P.paints);
	const CLASS = new Set(P.classes);
	const WIDTH = new Set(P.strokeWidths);
	const DASH = new Set(P.dashes);
	const MOTION = new Set(P.motions);
	const SPEED = new Set(P.speeds);
	const VIEWBOXES = Object.keys(P.viewBoxes);

	const out = [];
	const fail = (rule, el, detail) => {
		const where = el ? `<${el.name}> line ${el.line}` : "file";
		out.push(`${rule}: ${where}: ${detail}`);
	};

	const { roots, problems } = parse(source);
	for (const p of problems) fail(RULES.markup, p.el, p.detail);
	if (roots.length !== 1 || roots[0].name !== "svg") {
		const names = roots.map((r) => `<${r.name}>`).join(", ") || "nothing";
		fail(RULES.root, roots[0] ?? null, `the file must be exactly one <svg> at the top level (found ${names})`);
		return out;
	}
	const root = roots[0];
	const all = flatten(root);

	// 1. The root. Its viewBox also picks the budget (a wrong one, the first).
	const vb = root.attrs.get("viewBox");
	const vbNorm = vb?.trim().split(/\s+/).join(" ");
	const budget = P.viewBoxes[vbNorm] ?? P.viewBoxes[VIEWBOXES[0]];
	if (vb === undefined) {
		fail(RULES.root, root, VIEWBOXES.length === 1
			? `viewBox="${VIEWBOXES[0]}" is required`
			: `a viewBox is required: ${either(VIEWBOXES)}`);
	} else if (!VIEWBOXES.includes(vbNorm)) {
		fail(RULES.root, root, VIEWBOXES.length === 1
			? `viewBox must be exactly "${VIEWBOXES[0]}" (got "${vb}"); ${P.host} sets the size`
			: `viewBox must be one of ${either(VIEWBOXES)} (got "${vb}"); ${P.host} sets the size`);
	}
	for (const a of ["width", "height"]) {
		if (root.attrs.has(a)) fail(RULES.root, root, `no ${a} on the root; ${P.host} sets the size`);
	}
	const xmlns = root.attrs.get("xmlns");
	if (xmlns !== undefined && xmlns !== SVG_NS) {
		fail(RULES.root, root, `xmlns must be "${SVG_NS}" (got "${xmlns}")`);
	}

	// 2 + 3. Elements and attributes, on sight.
	for (const el of all) {
		if (FORBIDDEN.has(el.name)) {
			fail(RULES.element, el, `<${el.name}> is not part of the language (no text, images, gradients, filters, masks, animation, style)`);
		} else if (!ALLOWED.has(el.name)) {
			fail(RULES.element, el, `<${el.name}> is not an allowed element (${P.elements.join(" ")})`);
		} else if (el.name === "svg" && el !== root) {
			fail(RULES.element, el, `<svg> only as the root`);
		}
		for (const [name, value] of el.attrs) {
			if (name === "style") {
				fail(RULES.attribute, el, `no style attribute; colours are fill/stroke tokens and motion is ${P.host}'s CSS`);
			} else if (/^on/i.test(name)) {
				fail(RULES.attribute, el, `no event attribute (${name})`);
			} else if (/^xlink:/i.test(name) || name === "xmlns:xlink") {
				fail(RULES.attribute, el, `no xlink (${name}); a <use> takes href="#…"`);
			} else if (/^xmlns:/i.test(name)) {
				fail(RULES.attribute, el, `only the svg namespace (${name})`);
			} else if (name === "class") {
				if (P.classes.length === 0) {
					fail(RULES.attribute, el, `no class attribute in a ${P.name}; the weight is stroke-width="${P.strokeWidths.join("|")}"`);
					continue;
				}
				for (const c of value.trim().split(/\s+/).filter(Boolean)) {
					if (!CLASS.has(c)) fail(RULES.attribute, el, `class "${c}" is not one of ${P.classes.join(", ")}`);
				}
			}
			for (const { token, why } of P.forbiddenTokens) {
				if (value.includes(token)) {
					fail(RULES.paint, el, `${token} ${why} (${name}="${value}")`);
				}
			}
		}
	}

	// 4. Paint.
	const used = new Set(); // every token a fill/stroke names
	let painted = false; // some fill/stroke is not none
	for (const el of all) {
		for (const a of ["fill", "stroke"]) {
			const v = el.attrs.get(a);
			if (v === undefined) continue;
			const wash = WASH.exec(v);
			if (PAINT.has(v)) {
				if (v.startsWith("var(")) used.add(v);
				if (v !== "none") painted = true;
			} else if (wash && P.wash > 0 && a === "fill") {
				const pct = Number(wash[2]);
				if (pct < 1 || pct > P.wash) {
					fail(RULES.paint, el, `a wash is a colour at 1–${P.wash}% over transparent (got ${pct}%); past that it is a fill, so use the token`);
				}
				used.add(`var(--art-${wash[1]})`);
				painted = true;
			} else if (wash && P.wash > 0) {
				fail(RULES.paint, el, `a wash is a fill, never a stroke (${a}="${v}"); a line takes a token, dimmed with ${P.dimming}`);
			} else {
				const tokens = P.paints.filter((p) => p.startsWith("var("));
				const or = P.wash > 0 ? `, or a wash fill color-mix(in oklab, var(--art-<colour>) N%, transparent) with N ≤ ${P.wash}` : "";
				fail(RULES.paint, el, `${a}="${v}" is not a paint the language has: none, currentColor, or ${tokens.join(" ")}${or}`);
			}
		}
		for (const a of ["opacity", "fill-opacity", "stroke-opacity"]) {
			if (el.attrs.has(a)) fail(RULES.paint, el, `no ${a}; ${P.dimming} is the one dimming`);
		}
		if (el.attrs.has("color")) {
			fail(RULES.paint, el, P.name === "art"
				? `no color attribute; currentColor is the ink, set by the frame`
				: `no color attribute; currentColor is the colour of the text the ${P.name} sits in`);
		}
		// A shape with no fill (its own or a group's) paints SVG's default:
		// black — invisible on the plate, and never what was meant. That holds for
		// a STROKED outline too: it renders as a black-filled shape under its line,
		// the easiest trap in the language to miss by eye. <line> cannot fill.
		if (SHAPE.has(el.name) && el.name !== "line" && !inside(el, "clipPath")) {
			if (inherited(el, "fill") === undefined) {
				fail(RULES.paint, el, `a shape must say its fill (fill="none" for an outline, or a token): SVG's default is black`);
			}
		}
	}

	// 5. Strokes.
	const widths = either(P.strokeWidths, false);
	for (const el of all) {
		const ve = el.attrs.get("vector-effect");
		if (ve !== undefined && ve !== "non-scaling-stroke") {
			fail(RULES.stroke, el, `vector-effect must be "non-scaling-stroke" (got "${ve}")`);
		}
		const sw = el.attrs.get("stroke-width");
		if (sw !== undefined && !WIDTH.has(sw)) {
			fail(RULES.stroke, el, P.classes.length
				? `stroke-width must be ${widths} (got "${sw}"); prefer class="${P.classes.join('" / "')}"`
				: `stroke-width must be ${widths} (got "${sw}")`);
		}
		const cls = (el.attrs.get("class") ?? "").trim().split(/\s+/).find((c) => c in P.weights);
		if (sw !== undefined && cls && P.weights[cls] !== sw) {
			fail(RULES.stroke, el, `class="${cls}" says ${P.weights[cls]} but stroke-width says ${sw}; keep one`);
		}
		const da = el.attrs.get("stroke-dasharray");
		if (da !== undefined) {
			const norm = da.trim().replace(/[\s,]+/g, " ");
			if (!DASH.has(norm)) fail(RULES.stroke, el, `stroke-dasharray must be ${either(P.dashes)} (got "${da}")`);
		}
		if (SHAPE.has(el.name) && !inside(el, "clipPath")) {
			const s = inherited(el, "stroke");
			if (s !== undefined && s !== "none") {
				if (ve === undefined) {
					fail(RULES.stroke, el, `a stroked shape needs vector-effect="non-scaling-stroke" on itself (it is not inherited from a <g>)`);
				}
				if (P.requireStrokeWidth && inherited(el, "stroke-width") === undefined) {
					fail(RULES.stroke, el, `a stroked shape needs a stroke-width, ${widths} (its own or a group's)`);
				}
			}
		}
	}

	// 6. Motion.
	const moving = all.filter((el) => el.attrs.has("data-motion"));
	moving.forEach((el, i) => {
		const kind = el.attrs.get("data-motion");
		if (P.motions.length === 0) {
			fail(RULES.motion, el, `no motion in a ${P.name}`);
			return;
		}
		if (i >= P.motionGroups) {
			fail(RULES.motion, el, P.motionGroups === 1
				? `a second data-motion (the first is at line ${moving[0].line}); one moving idea per file`
				: `data-motion group ${i + 1} (the first is at line ${moving[0].line}); a ${P.name} moves at most ${P.motionGroups} ideas`);
		}
		if (!MOTION.has(kind)) fail(RULES.motion, el, `data-motion="${kind}" is not one of ${P.motions.join(" | ")}`);
		if (el.name !== "g") fail(RULES.motion, el, `data-motion belongs on a <g> that holds what moves`);
		if (el.children.length === 0) fail(RULES.motion, el, `the data-motion group is empty; nothing would move`);
		// The host's keyframes set the group's CSS transform, which replaces a
		// transform attribute outright: the group would jump when motion starts.
		if (el.attrs.has("transform")) {
			fail(RULES.motion, el, `no transform on the data-motion group (its animation replaces it); wrap it in an outer <g transform>`);
		}
		if (kind === "dash") {
			for (const d of [el, ...flatten(el).slice(1)]) {
				if (d.attrs.has("stroke-dashoffset")) {
					fail(RULES.motion, d, `a dash group must not set stroke-dashoffset; ${P.host} animates it`);
				}
				if (SHAPE.has(d.name)) {
					const s = inherited(d, "stroke");
					const da = inherited(d, "stroke-dasharray");
					if (s !== undefined && s !== "none" && da === undefined) {
						fail(RULES.motion, d, `a stroked shape in a dash group needs stroke-dasharray (${either(P.dashes)})`);
					}
					// The host advances the offset by 8 screen px a loop; a period
					// that does not divide 8 jumps at the end of every cycle.
					const period = da?.trim().split(/[\s,]+/).reduce((sum, n) => sum + Number(n), 0);
					if (period && !Number.isNaN(period) && Math.abs(8 / period - Math.round(8 / period)) > 1e-9) {
						fail(RULES.motion, d, `stroke-dasharray="${da}" has a period of ${period}, which does not divide the dash motion's 8 (the loop would jump); keep it still, or spin it`);
					}
				}
			}
		}
	});
	for (const el of all) {
		const speed = el.attrs.get("data-speed");
		if (speed === undefined) continue;
		if (!SPEED.has(speed)) fail(RULES.motion, el, `data-speed="${speed}" is not one of ${P.speeds.join(" | ")}`);
		if (!el.attrs.has("data-motion")) fail(RULES.motion, el, `data-speed goes on the data-motion group`);
	}

	// 7. Budgets.
	const count = all.length - 1;
	if (count > budget.elements) fail(RULES.budget, root, `${count} elements; the budget is ${budget.elements}`);
	const bytes = Buffer.byteLength(source, "utf8");
	if (bytes > budget.bytes) {
		fail(RULES.budget, root, `${bytes} bytes; the budget is ${budget.bytes} (${budget.bytes / 1024} KB), comments included`);
	}
	if (budget.clipPaths !== undefined) {
		const clips = all.filter((el) => el.name === "clipPath");
		if (clips.length > budget.clipPaths) fail(RULES.budget, root, `${clips.length} clipPaths; the budget is ${budget.clipPaths}`);
	}
	const deep = all.find((el) => el.name === "g" && groupDepth(el) > budget.depth);
	if (deep) fail(RULES.budget, deep, `groups ${groupDepth(deep)} deep; the budget is ${budget.depth}`);

	// 8. Ids and references.
	const ids = new Map();
	for (const el of all) {
		const id = el.attrs.get("id");
		if (id === undefined) continue;
		if (!P.ids) {
			fail(RULES.ids, el, `no ids in a ${P.name}: many are inlined on one page, and an id would collide`);
			continue;
		}
		if (ids.has(id)) fail(RULES.ids, el, `duplicate id "${id}" (first at line ${ids.get(id).line})`);
		else ids.set(id, el);
		if (el.name !== "clipPath" && !inside(el, "defs")) {
			fail(RULES.ids, el, `no id on a <${el.name}>; ids only on a <clipPath> or inside <defs> (what a <use> points at)`);
		}
		if (slug !== undefined && !id.startsWith(`${slug}-`)) {
			fail(RULES.ids, el, `id "${id}" must start with the file's slug, "${slug}-", so two artworks on one page cannot collide`);
		}
	}
	for (const el of all) {
		// A clipPath or use the profile refuses has had its say under the element rule.
		if (el.name === "clipPath" && ALLOWED.has("clipPath") && !el.attrs.has("id")) fail(RULES.ids, el, `a <clipPath> needs an id (prefixed <slug>-)`);
		if (el.name === "use" && ALLOWED.has("use")) {
			const href = el.attrs.get("href");
			const target = href?.startsWith("#") ? ids.get(href.slice(1)) : undefined;
			if (href === undefined) fail(RULES.ids, el, `a <use> needs href="#<id>"`);
			else if (!target) fail(RULES.ids, el, `href="${href}" points at nothing in this file`);
			else if (target.name === "clipPath") fail(RULES.ids, el, `href="${href}" points at a clipPath; a <use> takes a shape or group`);
		}
		const clip = el.attrs.get("clip-path");
		if (clip !== undefined) {
			const m = /^url\(#([^)]+)\)$/.exec(clip.trim());
			const target = m ? ids.get(m[1]) : undefined;
			if (!m) fail(RULES.ids, el, `clip-path must be url(#<id>) (got "${clip}")`);
			else if (!target) fail(RULES.ids, el, `clip-path="${clip}" points at nothing in this file`);
			else if (target.name !== "clipPath") fail(RULES.ids, el, `clip-path="${clip}" points at a <${target.name}>, not a <clipPath>`);
		}
	}

	// 9. Palette.
	if (P.palette.require === "token" && used.size === 0) {
		fail(RULES.palette, root, `no --art-* token used; the drawing is ink and colour from the tokens`);
	}
	if (P.palette.require === "paint" && !painted) {
		fail(RULES.palette, root, `every fill and stroke is none; nothing would draw`);
	}
	const colours = COLOURS.filter((c) => used.has(`var(--art-${c})`));
	if (colours.length > P.palette.max) {
		fail(RULES.palette, root, `${COUNTS[colours.length]} colours (${colours.join(", ")}); ${P.palette.why}`);
	}

	return out;
}

// --- The scanner ---------------------------------------------------------

const TAG = /<(\/?)([A-Za-z_][\w.:-]*)((?:\s+[^\s=>\/"']+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>/g;
const ATTR = /([^\s=>\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

/**
 * Read the file into a tree of elements. Comments, the XML prolog and a
 * doctype are blanked to newlines first (the frame strips them too), so
 * line numbers survive and prose in a comment cannot trip a rule.
 * @param {string} source
 * @returns {{ roots: Element[], problems: { el: Element | null, detail: string }[] }}
 */
function parse(source) {
	const blank = (s) => s.replace(/[^\n]/g, "");
	const text = source
		.replace(/<!--[\s\S]*?-->/g, blank)
		.replace(/<\?xml[\s\S]*?\?>/g, blank)
		.replace(/<!DOCTYPE[^>]*>/gi, blank);

	const problems = [];
	const roots = [];
	const stack = [];
	let pos = 0;
	let line = 1;
	const lineAt = (index) => {
		for (let i = pos; i < index; i++) if (text.charCodeAt(i) === 10) line++;
		pos = index;
		return line;
	};
	const between = (from, to) => {
		const gap = text.slice(from, to);
		if (!gap.trim()) return;
		const at = lineAt(from + gap.search(/\S/));
		const el = stack[stack.length - 1] ?? null;
		// Words inside a <text> or a <style>: the element rule says it once.
		if (el && FORBIDDEN.has(el.name) && !gap.includes("<")) return;
		const detail = gap.includes("<")
			? `unreadable markup: ${gap.trim().slice(0, 40)}`
			: `character data "${gap.trim().slice(0, 40)}"; the language has no text`;
		problems.push({ el: el ? { ...el, line: at } : { name: "file", line: at }, detail });
	};

	let last = 0;
	for (const m of text.matchAll(TAG)) {
		between(last, m.index);
		last = m.index + m[0].length;
		const [, closing, name, rawAttrs, selfClosing] = m;
		const at = lineAt(m.index);
		if (closing) {
			const open = stack.pop();
			if (!open) {
				problems.push({ el: { name, line: at }, detail: `</${name}> closes nothing` });
			} else if (open.name !== name) {
				problems.push({ el: { name, line: at }, detail: `</${name}> closes <${open.name}> opened at line ${open.line}` });
				stack.push(open);
			}
			continue;
		}
		const attrs = new Map();
		for (const a of rawAttrs.matchAll(ATTR)) {
			const key = a[1];
			const value = a[2] ?? a[3] ?? a[4] ?? "";
			if (attrs.has(key)) problems.push({ el: { name, line: at }, detail: `duplicate attribute ${key}` });
			attrs.set(key, value);
		}
		const parent = stack[stack.length - 1] ?? null;
		const el = { name, attrs, line: at, parent, children: [] };
		(parent ? parent.children : roots).push(el);
		if (!selfClosing) stack.push(el);
	}
	between(last, text.length);
	for (const open of stack) {
		problems.push({ el: open, detail: `<${open.name}> is never closed` });
	}
	return { roots, problems };
}

/** The element and every descendant, document order. */
function flatten(el, into = []) {
	into.push(el);
	for (const c of el.children) flatten(c, into);
	return into;
}

/** The nearest own-or-ancestor value of an inherited presentation attribute. */
function inherited(el, name) {
	for (let e = el; e; e = e.parent) {
		const v = e.attrs.get(name);
		if (v !== undefined) return v;
	}
	return undefined;
}

/** Whether an ancestor (not the element itself) is `name`. */
function inside(el, name) {
	for (let e = el.parent; e; e = e.parent) if (e.name === name) return true;
	return false;
}

/** How many <g>s deep this <g> sits, itself included. */
function groupDepth(el) {
	let n = 0;
	for (let e = el; e; e = e.parent) if (e.name === "g") n++;
	return n;
}

// --- The CLI -------------------------------------------------------------

/** The slug an art file's ids are prefixed with: its basename without .svg. */
export function slugOf(file) {
	return basename(file, extname(file));
}

/**
 * Validate files from a shell: `[--profile art|glyph|scene] <file…>`, art by default.
 * @param {string[]} args
 * @returns {number} the exit code: 0 clean, 1 a violation, 2 usage
 */
export function main(args) {
	const files = [...args];
	let profile = PROFILES.art;
	const flag = files.findIndex((a) => a === "--profile" || a.startsWith("--profile="));
	if (flag !== -1) {
		const [arg] = files.splice(flag, 1);
		const name = arg.includes("=") ? arg.slice(arg.indexOf("=") + 1) : files.splice(flag, 1)[0];
		if (!Object.hasOwn(PROFILES, name ?? "")) {
			console.error(`unknown profile "${name ?? ""}"; one of ${Object.keys(PROFILES).join(", ")}`);
			return 2;
		}
		profile = PROFILES[name];
	}
	if (files.length === 0) {
		console.error(`usage: bun packages/design-system/scripts/validate-art.mjs [--profile ${Object.keys(PROFILES).join("|")}] <file.svg…>`);
		return 2;
	}
	let code = 0;
	for (const file of files) {
		let source;
		try {
			source = readFileSync(file, "utf8");
		} catch (e) {
			console.error(`FAIL  ${file}\n  ${e.message}`);
			code = code || 2;
			continue;
		}
		const violations = validateSvg(source, { profile, slug: slugOf(file) });
		if (violations.length === 0) {
			console.log(`ok    ${file}`);
		} else {
			console.log(`FAIL  ${file}\n${violations.map((v) => `  ${v}`).join("\n")}`);
			code = 1;
		}
	}
	return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	process.exitCode = main(process.argv.slice(2));
}
