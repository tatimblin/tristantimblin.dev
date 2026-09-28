// The art validator: the rules of the post-art language, enforceable from a
// shell and from the test suite (tests/post-art.spec.ts). An art file is a
// drawing only — the frame (ArtFrame) supplies the plate, the tokens supply
// every colour, the frame's CSS supplies the motion — so what is left to
// check is that a file carries nothing else. The rules are the CONVENTIONS
// "Art" section and the comment in src/art/_template.svg, made mechanical.
//
//   import { validateArt } from ".../validate-art.mjs";
//   validateArt(source, { slug: "mega-desk" }) → string[]   // [] when clean
//
//   bun packages/design-system/scripts/validate-art.mjs <file…>
//   bun run validate:art src/content/txt/mega-desk.svg      // exit 1 on a violation
//
// Every violation is one line, `<rule>: <element> line N: <what>`, where
// <rule> is one of RULES below, so a reader (or the spec) knows which rule
// fired without reading the prose. The slug is the file's basename: clipPath
// ids must be prefixed with it so two artworks inlined on one page cannot
// collide.
//
// No XML dependency: the format is constrained enough (tags, attributes,
// comments, nothing else) that a tag/attribute scanner reads it whole, and a
// file it cannot read is itself a violation.

import { readFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The rule names, as they prefix a violation. */
export const RULES = Object.freeze({
	/** The file is one well-formed <svg> and nothing else. */
	markup: "markup",
	/** 1. viewBox is exactly 0 0 320 180; no width/height; only the svg namespace. */
	root: "root",
	/** 2. Only the drawing elements; text, images, gradients, filters, animation fail on sight. */
	element: "element",
	/** 3. No style=, no on*, no xlink:, class only art-line / art-line--2. */
	attribute: "attribute",
	/** 4. fill/stroke are none, currentColor or an --art-* token; no literals, no opacity. */
	paint: "paint",
	/** 5. A stroked shape has vector-effect="non-scaling-stroke" and a weight of 1 or 1.5; dashes 4 4 or 2 6. */
	stroke: "stroke",
	/** 6. One data-motion per file, on a <g>, spin|drift|slide|blink|dash; data-speed 0.5|1|2; a dash group is dashed and sets no offset. */
	motion: "motion",
	/** 7. ≤ 120 elements, ≤ 12 KB, ≤ 3 clipPaths, groups ≤ 4 deep. */
	budget: "budget",
	/** 8. ids only on a clipPath or defs content, prefixed <slug>-; use/clip-path point inside the file. */
	ids: "ids",
	/** 9. At least one --art-* token, at most three of the four fill colours. */
	palette: "palette",
});

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

const ALLOWED = new Set(ALLOWED_ELEMENTS);
const FORBIDDEN = new Set(FORBIDDEN_ELEMENTS);
const SHAPE = new Set(SHAPES);
const PAINT = new Set(PAINTS);
const CLASS = new Set(CLASSES);
const WIDTH = new Set(STROKE_WIDTHS);
const DASH = new Set(DASHES);
const MOTION = new Set(MOTIONS);
const SPEED = new Set(SPEEDS);

/**
 * @typedef {object} Element
 * @property {string} name
 * @property {Map<string, string>} attrs
 * @property {number} line   1-based, of the opening tag
 * @property {Element | null} parent
 * @property {Element[]} children
 */

/**
 * Validate one art file.
 * @param {string} source  the file's text
 * @param {{ slug?: string }} [options]  the file's basename without .svg; clipPath ids must start with `<slug>-`
 * @returns {string[]}  violations, one line each; empty when the file is clean
 */
export function validateArt(source, { slug } = {}) {
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

	// 1. The root.
	const vb = root.attrs.get("viewBox");
	if (vb === undefined) fail(RULES.root, root, `viewBox="${VIEWBOX}" is required`);
	else if (vb.trim().split(/\s+/).join(" ") !== VIEWBOX) {
		fail(RULES.root, root, `viewBox must be exactly "${VIEWBOX}" (got "${vb}"); the frame sets the size`);
	}
	for (const a of ["width", "height"]) {
		if (root.attrs.has(a)) fail(RULES.root, root, `no ${a} on the root; the frame sets the size`);
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
			fail(RULES.element, el, `<${el.name}> is not an allowed element (${ALLOWED_ELEMENTS.join(" ")})`);
		} else if (el.name === "svg" && el !== root) {
			fail(RULES.element, el, `<svg> only as the root`);
		}
		for (const [name, value] of el.attrs) {
			if (name === "style") {
				fail(RULES.attribute, el, `no style attribute; colours are fill/stroke tokens and motion is the frame's CSS`);
			} else if (/^on/i.test(name)) {
				fail(RULES.attribute, el, `no event attribute (${name})`);
			} else if (/^xlink:/i.test(name) || name === "xmlns:xlink") {
				fail(RULES.attribute, el, `no xlink (${name}); a <use> takes href="#…"`);
			} else if (/^xmlns:/i.test(name)) {
				fail(RULES.attribute, el, `only the svg namespace (${name})`);
			} else if (name === "class") {
				for (const c of value.trim().split(/\s+/).filter(Boolean)) {
					if (!CLASS.has(c)) fail(RULES.attribute, el, `class "${c}" is not one of ${CLASSES.join(", ")}`);
				}
			}
			for (const t of FRAME_TOKENS) {
				if (value.includes(t)) fail(RULES.paint, el, `${t} belongs to the frame, not a file (${name}="${value}")`);
			}
		}
	}

	// 4. Paint.
	const used = new Set(); // every --art-* token a fill/stroke names
	for (const el of all) {
		for (const a of ["fill", "stroke"]) {
			const v = el.attrs.get(a);
			if (v === undefined) continue;
			if (!PAINT.has(v)) {
				fail(RULES.paint, el, `${a}="${v}" is not a paint the language has: none, currentColor, or ${PAINTS.slice(2).join(" ")}`);
			} else if (v.startsWith("var(")) used.add(v);
		}
		for (const a of ["opacity", "fill-opacity", "stroke-opacity"]) {
			if (el.attrs.has(a)) fail(RULES.paint, el, `no ${a}; var(--art-ink-2) is the one dimming`);
		}
		if (el.attrs.has("color")) fail(RULES.paint, el, `no color attribute; currentColor is the ink, set by the frame`);
		// A shape that says neither fill nor stroke paints SVG's default: black,
		// invisible on the plate and never what was meant.
		if (SHAPE.has(el.name) && !inside(el, "clipPath")) {
			const f = inherited(el, "fill");
			const s = inherited(el, "stroke");
			if (f === undefined && (s === undefined || s === "none")) {
				fail(RULES.paint, el, `a shape must say its fill (none or a token): SVG's default is black`);
			}
		}
	}

	// 5. Strokes.
	for (const el of all) {
		const ve = el.attrs.get("vector-effect");
		if (ve !== undefined && ve !== "non-scaling-stroke") {
			fail(RULES.stroke, el, `vector-effect must be "non-scaling-stroke" (got "${ve}")`);
		}
		const sw = el.attrs.get("stroke-width");
		if (sw !== undefined && !WIDTH.has(sw)) {
			fail(RULES.stroke, el, `stroke-width must be 1 or 1.5 (got "${sw}"); prefer class="art-line" / "art-line--2"`);
		}
		const cls = (el.attrs.get("class") ?? "").trim().split(/\s+/).find((c) => c in WEIGHTS);
		if (sw !== undefined && cls && WEIGHTS[cls] !== sw) {
			fail(RULES.stroke, el, `class="${cls}" says ${WEIGHTS[cls]} but stroke-width says ${sw}; keep one`);
		}
		const da = el.attrs.get("stroke-dasharray");
		if (da !== undefined) {
			const norm = da.trim().replace(/[\s,]+/g, " ");
			if (!DASH.has(norm)) fail(RULES.stroke, el, `stroke-dasharray must be "4 4" or "2 6" (got "${da}")`);
		}
		if (SHAPE.has(el.name) && !inside(el, "clipPath")) {
			const s = inherited(el, "stroke");
			if (s !== undefined && s !== "none" && ve === undefined) {
				fail(RULES.stroke, el, `a stroked shape needs vector-effect="non-scaling-stroke" on itself (it is not inherited from a <g>)`);
			}
		}
	}

	// 6. Motion.
	const moving = all.filter((el) => el.attrs.has("data-motion"));
	moving.forEach((el, i) => {
		const kind = el.attrs.get("data-motion");
		if (i > 0) fail(RULES.motion, el, `a second data-motion (the first is at line ${moving[0].line}); one moving idea per file`);
		if (!MOTION.has(kind)) fail(RULES.motion, el, `data-motion="${kind}" is not one of ${MOTIONS.join(" | ")}`);
		if (el.name !== "g") fail(RULES.motion, el, `data-motion belongs on a <g> that holds what moves`);
		if (el.children.length === 0) fail(RULES.motion, el, `the data-motion group is empty; nothing would move`);
		if (kind === "dash") {
			for (const d of [el, ...flatten(el).slice(1)]) {
				if (d.attrs.has("stroke-dashoffset")) {
					fail(RULES.motion, d, `a dash group must not set stroke-dashoffset; the frame animates it`);
				}
				if (SHAPE.has(d.name)) {
					const s = inherited(d, "stroke");
					if (s !== undefined && s !== "none" && inherited(d, "stroke-dasharray") === undefined) {
						fail(RULES.motion, d, `a stroked shape in a dash group needs stroke-dasharray ("4 4" or "2 6")`);
					}
				}
			}
		}
	});
	for (const el of all) {
		const speed = el.attrs.get("data-speed");
		if (speed === undefined) continue;
		if (!SPEED.has(speed)) fail(RULES.motion, el, `data-speed="${speed}" is not one of ${SPEEDS.join(" | ")}`);
		if (!el.attrs.has("data-motion")) fail(RULES.motion, el, `data-speed goes on the data-motion group`);
	}

	// 7. Budgets.
	const count = all.length - 1;
	if (count > BUDGET.elements) fail(RULES.budget, root, `${count} elements; the budget is ${BUDGET.elements}`);
	const bytes = Buffer.byteLength(source, "utf8");
	if (bytes > BUDGET.bytes) fail(RULES.budget, root, `${bytes} bytes; the budget is ${BUDGET.bytes} (12 KB), comments included`);
	const clips = all.filter((el) => el.name === "clipPath");
	if (clips.length > BUDGET.clipPaths) fail(RULES.budget, root, `${clips.length} clipPaths; the budget is ${BUDGET.clipPaths}`);
	const deep = all.find((el) => el.name === "g" && groupDepth(el) > BUDGET.depth);
	if (deep) fail(RULES.budget, deep, `groups ${groupDepth(deep)} deep; the budget is ${BUDGET.depth}`);

	// 8. Ids and references.
	const ids = new Map();
	for (const el of all) {
		const id = el.attrs.get("id");
		if (id === undefined) continue;
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
		if (el.name === "clipPath" && !el.attrs.has("id")) fail(RULES.ids, el, `a <clipPath> needs an id (prefixed <slug>-)`);
		if (el.name === "use") {
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
	if (used.size === 0) fail(RULES.palette, root, `no --art-* token used; the drawing is ink and colour from the tokens`);
	const colours = COLOURS.filter((c) => used.has(`var(--art-${c})`));
	if (colours.length > 3) {
		fail(RULES.palette, root, `all four colours (${colours.join(", ")}); the ink plus at most three, one dominant`);
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
 * Validate files from a shell.
 * @param {string[]} files
 * @returns {number} the exit code: 0 clean, 1 a violation, 2 usage
 */
export function main(files) {
	if (files.length === 0) {
		console.error("usage: bun packages/design-system/scripts/validate-art.mjs <file.svg…>");
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
		const violations = validateArt(source, { slug: slugOf(file) });
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
