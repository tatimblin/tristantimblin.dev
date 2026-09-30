/**
 * The HAND-VECTOR route's importer: an illustrator's SVG export (Figma,
 * Illustrator, Inkscape), drawn with the placeholder swatches (swatches.ts,
 * ../SWATCHES.md), turned into the scene kit's element strings for a bake.
 *
 *   // tools/scenes/<name>/scene.ts
 *   import { readFileSync } from "node:fs";
 *   import { join } from "node:path";
 *   import { scene } from "@whois/design-system/scenes/recipe";
 *   import { importVector } from "../lib/import-vector";
 *   export default scene({
 *     viewBox: "0 0 320 180",
 *     draw: (k, ctx) => importVector(readFileSync(join(ctx.dir, "source.svg"), "utf8"), { viewBox: "0 0 320 180" }),
 *   });
 *
 * What it does, in order (CONVENTIONS, "L4 — scenes", the hand-vector
 * route, is the prose):
 *
 *   PARSE    a small XML scanner — tags, attributes, comments, CDATA, the
 *            prolog and a DOCTYPE with an internal subset (Illustrator's);
 *            no dependency, for the reason the validator gives: an export
 *            is tags and attributes and nothing else we keep.
 *   STRIP    comments, the prolog, <title>, <desc>, <metadata>, every
 *            namespaced element and attribute (sodipodi:, inkscape:,
 *            figma:, xml:space, xmlns:*), ids, data-*, classes (after
 *            their <style> rules are applied), stroke-miterlimit,
 *            clip-rule, shape-rendering, a normal mix-blend-mode, and
 *            every def nothing renders (unused gradients, symbols).
 *   FLATTEN  groups: their paint, opacity and transform are pushed down to
 *            the leaves, which are written complete, and the groups go.
 *            `style=` and Illustrator's `.st0{…}` class rules become
 *            attributes first (a style beats a rule beats an attribute).
 *            A hidden layer (display:none, visibility:hidden) is dropped.
 *   FRAME    Figma's artboard wrapper — a `<g clip-path>` whose clipPath is
 *            one rect covering the viewBox, a `<g mask>` whose mask is the
 *            same, and the background rect in the plate swatch — is the
 *            frame's job (the Scene clips and paints the plate), so it is
 *            dropped. Any other clip-path or mask FAILS: flatten it in the
 *            editor (Outline Stroke, Flatten, Boolean → Intersect).
 *   PAINT    each swatch hex becomes its `var(--art-*)` token (#abc,
 *            #aabbcc, rgb(), a few names; case-free). A colour swatch at a
 *            fill opacity ≤ 25% (fill-opacity × opacity × the colour's own
 *            alpha) becomes the WASH form, `color-mix(in oklab,
 *            var(--art-<c>) N%, transparent)`; between 25% and 100% FAILS.
 *            Any colour that is not a swatch FAILS, every one listed with
 *            its count and the nearest swatch. A translucent stroke, a
 *            translucent ink, a gradient or pattern paint, currentColor,
 *            and a shape with no fill at all (SVG's black) fail too.
 *   STROKE   the width is normalised — times the element's own transform
 *            scale and `strokeScale` (the refit's scale unless said, so
 *            a 2 at a 2× export is a 1) — and snapped to the language's 1
 *            or 1.5 (within ±0.25; anything else FAILS), with its class
 *            (art-line / art-line--2) and vector-effect="non-scaling-stroke".
 *            A dasharray is normalised the same way and snapped to one of
 *            the scene's (4 4, 2 6, 6 3 1 3; each value within ±0.75) or
 *            FAILS; a dashoffset fails. Caps and joins are kept.
 *   REFIT    the export's viewBox is fitted into the target's (320×180 or
 *            400×400) preserving the aspect: `contain` (default) centres
 *            it whole, letterboxed; `cover` fills and lets the frame crop.
 *            A 640×360 Figma frame onto the plate is an exact 0.5.
 *   GEOMETRY transforms are baked into coordinates wherever the shape
 *            survives it (paths and lines always, but for an arc under a
 *            skew or a reflection; rects, circles and ellipses under an
 *            axis-aligned scale or a similarity); where it does not, the
 *            leaf keeps a `transform="matrix(…)"` and the refit's
 *            coordinates. A rect under a rotation becomes a path. Every
 *            coordinate is rounded (`precision`, a tenth by default),
 *            relative path commands become absolute, a flat L becomes H/V.
 *   FAIL     text, images, <use>, foreignObject, nested <svg>, links,
 *            filters (shadows, blurs), markers, an unknown element or
 *            attribute: never guessed at. Every problem in the file is
 *            collected and thrown at once as an ImportVectorError.
 *
 * It returns element strings in paint order for `draw` to return (or to
 * compose with the kit's — a motion group round some of them, chrome over
 * them); the bake validates the whole file with the scene profile.
 * Deterministic: the same source gives the same strings.
 *
 * FRESHNESS: a scene's baked header hashes its own directory, not this
 * file — an importer change that moves a coordinate is caught by
 * `bun run scenes:check` (which re-bakes), not by the registry test.
 */

import { BY_HEX, nearestSwatch, WASH_MAX, type Swatch } from "./swatches";

// --- options and errors ----------------------------------------------------

export interface ImportOptions {
	/** the scene's root: the plate or the square panel */
	viewBox: "0 0 320 180" | "0 0 400 400";
	/** contain (default): the whole export, centred, letterboxed if the aspect differs; cover: fills, cropped by the frame */
	fit?: "contain" | "cover";
	/** source stroke px → output px; the refit's scale unless said (a 2× export's 2 is a 1) */
	strokeScale?: number;
	/** decimals a coordinate keeps; 1 (a tenth) unless said */
	precision?: number;
	/**
	 * Layers to keep as a MOTION group, by the export's id (Figma writes a
	 * layer's name as its id): `{ "road/centre": { motion: "dash" } }`. The
	 * layer's leaves are wrapped in `<g data-motion data-speed>` under the
	 * shared contract; an id the export does not have fails. The scene
	 * profile allows two.
	 */
	motion?: Readonly<Record<string, { motion: "spin" | "drift" | "slide" | "blink" | "dash"; speed?: 0.5 | 1 | 2 }>>;
}

/** Every problem the importer found in one export, thrown together. */
export class ImportVectorError extends Error {
	readonly problems: readonly string[];
	constructor(problems: readonly string[]) {
		super(`import-vector: ${problems.length} problem${problems.length === 1 ? "" : "s"} in the export\n${problems.map((p) => `  ${p}`).join("\n")}`);
		this.name = "ImportVectorError";
		this.problems = problems;
	}
}

// --- the XML scanner ---------------------------------------------------------

interface XNode {
	name: string;
	attrs: Map<string, string>;
	children: XNode[];
	/** character data (for a <style>, or to fail a <text> on) */
	text: string;
	line: number;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
	s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
		e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITIES[e] ?? m),
	);

const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;

/** Parse an export into its root element; a file that is not one tree throws. */
export function parseXml(src: string): XNode {
	const doc: XNode = { name: "#document", attrs: new Map(), children: [], text: "", line: 1 };
	const stack: XNode[] = [doc];
	let i = 0;
	const lineAt = (at: number) => src.slice(0, at).split("\n").length;
	const skip = (open: string, close: string) => {
		const end = src.indexOf(close, i + open.length);
		if (end < 0) throw new ImportVectorError([`line ${lineAt(i)}: unterminated ${open}`]);
		const body = src.slice(i + open.length, end);
		i = end + close.length;
		return body;
	};
	while (i < src.length) {
		const lt = src.indexOf("<", i);
		const top = stack[stack.length - 1];
		if (lt < 0 || lt > i) {
			top.text += decode(src.slice(i, lt < 0 ? src.length : lt));
			if (lt < 0) break;
			i = lt;
		}
		if (src.startsWith("<!--", i)) skip("<!--", "-->");
		else if (src.startsWith("<![CDATA[", i)) top.text += skip("<![CDATA[", "]]>");
		else if (src.startsWith("<?", i)) skip("<?", "?>");
		else if (src.startsWith("<!", i)) {
			// A DOCTYPE, maybe with an internal subset in brackets (Illustrator's entities).
			const bracket = src.indexOf("[", i);
			const gt = src.indexOf(">", i);
			if (bracket >= 0 && bracket < gt) {
				i = src.indexOf("]", bracket);
				i = src.indexOf(">", i) + 1;
			} else i = gt + 1;
			if (i <= 0) throw new ImportVectorError([`line ${lineAt(lt)}: unterminated <!…>`]);
		} else if (src.startsWith("</", i)) {
			const gt = src.indexOf(">", i);
			const name = src.slice(i + 2, gt).trim();
			const open = stack.pop();
			if (!open || open.name !== name) throw new ImportVectorError([`line ${lineAt(i)}: </${name}> does not close <${open?.name}>`]);
			i = gt + 1;
		} else {
			// A start tag: find its end outside quotes.
			let j = i + 1;
			let q = "";
			for (; j < src.length; j++) {
				const c = src[j];
				if (q) {
					if (c === q) q = "";
				} else if (c === '"' || c === "'") q = c;
				else if (c === ">") break;
			}
			if (j >= src.length) throw new ImportVectorError([`line ${lineAt(i)}: unterminated tag`]);
			const raw = src.slice(i + 1, j);
			const self = raw.endsWith("/");
			const body = self ? raw.slice(0, -1) : raw;
			const name = body.match(/^[^\s/>]+/)?.[0] ?? "";
			const attrs = new Map<string, string>();
			for (const a of body.slice(name.length).matchAll(ATTR)) attrs.set(a[1], decode(a[2] ?? a[3] ?? ""));
			const el: XNode = { name, attrs, children: [], text: "", line: lineAt(i) };
			top.children.push(el);
			if (!self) stack.push(el);
			i = j + 1;
		}
	}
	if (stack.length !== 1) throw new ImportVectorError([`<${stack[stack.length - 1].name}> line ${stack[stack.length - 1].line} is never closed`]);
	const roots = doc.children;
	if (roots.length !== 1 || roots[0].name !== "svg") {
		throw new ImportVectorError([`the export must be one <svg> (found ${roots.map((r) => `<${r.name}>`).join(", ") || "nothing"})`]);
	}
	return roots[0];
}

// --- numbers, matrices ------------------------------------------------------

/** A 2D affine, SVG's order: x' = a x + c y + e, y' = b x + d y + f. */
type M = readonly [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (m: M, n: M): M => [
	m[0] * n[0] + m[2] * n[1],
	m[1] * n[0] + m[3] * n[1],
	m[0] * n[2] + m[2] * n[3],
	m[1] * n[2] + m[3] * n[3],
	m[0] * n[4] + m[2] * n[5] + m[4],
	m[1] * n[4] + m[3] * n[5] + m[5],
];
const inv = (m: M): M => {
	const det = m[0] * m[3] - m[1] * m[2];
	return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
};
const ap = (m: M, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const EPS = 1e-9;
const near = (a: number, b: number, e = 1e-6) => Math.abs(a - b) <= e;
/** the uniform scale a matrix applies to lengths: √|det| */
const scaleOf = (m: M) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
/** no rotation, no skew: x scales by a, y by d */
const axisAligned = (m: M) => near(m[1], 0) && near(m[2], 0) && m[0] > 0 && m[3] > 0;
/** rotation + uniform scale, no reflection or skew */
const similarity = (m: M) => near(m[0], m[3]) && near(m[1], -m[2]) && m[0] * m[3] - m[1] * m[2] > 0;
const angleOf = (m: M) => (Math.atan2(m[1], m[0]) * 180) / Math.PI;

const NUM = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
const nums = (s: string) => (s.match(NUM) ?? []).map(Number);
const STICKY = new RegExp(NUM.source, "y");

/** A `transform` attribute as one matrix; null when it cannot be read. */
function parseTransform(s: string): M | null {
	let m: M = I;
	const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
	let rest = s;
	for (const [all, fn, args] of s.matchAll(re)) {
		rest = rest.replace(all, "");
		const v = nums(args);
		let t: M;
		switch (fn) {
			case "matrix":
				if (v.length !== 6) return null;
				t = v as unknown as M;
				break;
			case "translate":
				t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
				break;
			case "scale":
				t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
				break;
			case "rotate": {
				const r = ((v[0] ?? 0) * Math.PI) / 180;
				const [cos, sin] = [Math.cos(r), Math.sin(r)];
				const [cx, cy] = [v[1] ?? 0, v[2] ?? 0];
				t = mul(mul([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]), [1, 0, 0, 1, -cx, -cy]);
				break;
			}
			case "skewX":
				t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0];
				break;
			default:
				t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0];
		}
		m = mul(m, t);
	}
	return rest.replace(/[\s,]/g, "") ? null : m;
}

// --- paths --------------------------------------------------------------------

/** An absolute segment: M L C S Q T A Z (H/V become L; the writer folds them back). */
interface Seg {
	c: string;
	a: number[];
}

const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

/** A path's `d` as absolute segments; throws on a malformed one. */
export function parsePath(d: string): Seg[] {
	const out: Seg[] = [];
	let i = 0;
	const ws = () => {
		while (i < d.length && /[\s,]/.test(d[i])) i++;
	};
	const num = () => {
		ws();
		STICKY.lastIndex = i;
		const m = STICKY.exec(d);
		if (!m) throw new Error(`path: a number expected at ${i} in "${d.slice(i, i + 12)}"`);
		i += m[0].length;
		return Number(m[0]);
	};
	const flag = () => {
		ws();
		const c = d[i++];
		if (c !== "0" && c !== "1") throw new Error(`path: an arc flag expected at ${i - 1}`);
		return c === "1" ? 1 : 0;
	};
	let [x, y, sx, sy] = [0, 0, 0, 0];
	let cmd = "";
	for (;;) {
		ws();
		if (i >= d.length) break;
		if (/[a-z]/i.test(d[i])) cmd = d[i++];
		else if (!cmd) throw new Error(`path: a command expected at ${i}`);
		else if (cmd === "M") cmd = "L";
		else if (cmd === "m") cmd = "l";
		const up = cmd.toUpperCase();
		if (!(up in ARITY)) throw new Error(`path: unknown command "${cmd}"`);
		const rel = cmd !== up;
		if (up === "Z") {
			out.push({ c: "Z", a: [] });
			[x, y] = [sx, sy];
			cmd = "";
			continue;
		}
		const a = up === "A" ? [num(), num(), num(), flag(), flag(), num(), num()] : Array.from({ length: ARITY[up] }, num);
		if (rel) {
			if (up === "H") a[0] += x;
			else if (up === "V") a[0] += y;
			else if (up === "A") [a[5], a[6]] = [a[5] + x, a[6] + y];
			else for (let k = 0; k < a.length; k += 2) [a[k], a[k + 1]] = [a[k] + x, a[k + 1] + y];
		}
		if (up === "H") out.push({ c: "L", a: [a[0], y] });
		else if (up === "V") out.push({ c: "L", a: [x, a[0]] });
		else out.push({ c: up, a });
		const last = out[out.length - 1].a;
		[x, y] = [last[last.length - 2], last[last.length - 1]];
		if (up === "M") [sx, sy] = [x, y];
	}
	return out;
}

/** A path's segments under a matrix; an arc needs a similarity (radii scale, the axis turns). */
function transformPath(segs: Seg[], m: M): Seg[] {
	const s = scaleOf(m);
	const turn = angleOf(m);
	return segs.map(({ c, a }) => {
		if (c === "A") {
			const [px, py] = ap(m, a[5], a[6]);
			return { c, a: [a[0] * s, a[1] * s, a[2] + turn, a[3], a[4], px, py] };
		}
		const b: number[] = [];
		for (let k = 0; k < a.length; k += 2) b.push(...ap(m, a[k], a[k + 1]));
		return { c, a: b };
	});
}

// --- colours ------------------------------------------------------------------

const NAMED: Record<string, string> = { white: "#ffffff", black: "#000000", red: "#ff0000", lime: "#00ff00", blue: "#0000ff" };

type Colour = { kind: "none" } | { kind: "hex"; hex: string; alpha: number } | { kind: "bad"; why: string };

function parseColour(v: string): Colour {
	const s = v.trim().toLowerCase();
	if (s === "none" || s === "transparent") return { kind: "none" };
	if (s.startsWith("url(")) return { kind: "bad", why: `a gradient or pattern paint (${v}); the language has flat fills and washes` };
	if (s === "currentcolor") return { kind: "bad", why: "currentColor; draw with the swatches" };
	const h2 = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
	let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
	if (m) {
		let h = m[1];
		if (h.length <= 4) h = [...h].map((c) => c + c).join("");
		return { kind: "hex", hex: `#${h.slice(0, 6)}`, alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
	}
	m = /^rgba?\(([^)]*)\)$/.exec(s);
	if (m) {
		const p = m[1].split(/[\s,/]+/).filter(Boolean);
		const ch = (t: string) => (t.endsWith("%") ? (parseFloat(t) * 255) / 100 : parseFloat(t));
		const alpha = p[3] === undefined ? 1 : p[3].endsWith("%") ? parseFloat(p[3]) / 100 : parseFloat(p[3]);
		return { kind: "hex", hex: `#${h2(ch(p[0]))}${h2(ch(p[1]))}${h2(ch(p[2]))}`, alpha };
	}
	if (s in NAMED) return { kind: "hex", hex: NAMED[s], alpha: 1 };
	return { kind: "bad", why: `an unreadable colour "${v}"` };
}

// --- presentation -------------------------------------------------------------

/** Presentation properties the importer reads; the inheritable ones flow down a flattened group. */
const INHERITED = ["fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "fill-opacity", "stroke-opacity", "fill-rule", "visibility"];
const READ = new Set([...INHERITED, "opacity", "display", "transform", "clip-path", "mask", "filter", "mix-blend-mode"]);
/** Editor cruft and properties with no meaning here: dropped without a word. */
const DROPPED = new Set([
	"id", "class", "style", "version", "baseProfile", "x", "y", "width", "height", "viewBox", "xmlns", "preserveAspectRatio",
	"stroke-miterlimit", "clip-rule", "shape-rendering", "vector-effect", "isolation", "mask-type", "color-interpolation-filters",
	"enable-background", "overflow", "fill-rule-default", "paint-order-default",
]);
/** The geometry each drawn element reads. */
const GEOMETRY: Record<string, readonly string[]> = {
	path: ["d"],
	rect: ["x", "y", "width", "height", "rx", "ry"],
	circle: ["cx", "cy", "r"],
	ellipse: ["cx", "cy", "rx", "ry"],
	line: ["x1", "y1", "x2", "y2"],
	polyline: ["points"],
	polygon: ["points"],
};
/** Elements that are never drawn directly, only referenced (or never): kept by id, else dropped. */
const REFERENCED = new Set(["defs", "clipPath", "mask", "linearGradient", "radialGradient", "pattern", "filter", "symbol", "marker"]);
const SILENT = new Set(["title", "desc", "metadata", "style"]);
const REFUSED: Record<string, string> = {
	text: "text is HTML over the scene (SceneLabel), never in the drawing: outline it in the editor or delete it",
	tspan: "text is HTML over the scene (SceneLabel), never in the drawing",
	image: "an embedded image; the language is vector line work",
	use: "a <use> (a component instance or an image); detach the instance and flatten it in the editor",
	foreignObject: "a foreignObject",
	svg: "a nested <svg>; flatten it into the artboard",
	a: "a link",
	switch: "a <switch>",
};

const CSS_DECL = (s: string) => {
	const out = new Map<string, string>();
	for (const d of s.split(";")) {
		const k = d.indexOf(":");
		if (k > 0) out.set(d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim().replace(/\s*!important$/, ""));
	}
	return out;
};

// --- the import ---------------------------------------------------------------

const SCENE_DASHES = [
	[4, 4],
	[2, 6],
	[6, 3, 1, 3],
];

/**
 * An export as the scene kit's element strings, in paint order: parsed,
 * stripped, flattened, painted with the tokens, weighted, dashed, refitted
 * and rounded. Every problem found is thrown at once (ImportVectorError).
 */
export function importVector(source: string, opts: ImportOptions): string[] {
	const root = parseXml(source);
	const problems: string[] = [];
	const at = (el: XNode, detail: string) => problems.push(`<${el.name}> line ${el.line}: ${detail}`);
	const unmapped = new Map<string, { count: number; uses: Set<string>; first: number }>();

	// The target and the source boxes, and the refit between them.
	const [, , W, H] = opts.viewBox.split(" ").map(Number);
	const vbAttr = root.attrs.get("viewBox");
	let vb = vbAttr ? nums(vbAttr) : [0, 0, parseFloat(root.attrs.get("width") ?? ""), parseFloat(root.attrs.get("height") ?? "")];
	if (vb.length !== 4 || !vb.every(Number.isFinite) || vb[2] <= 0 || vb[3] <= 0) {
		throw new ImportVectorError([`<svg> line ${root.line}: the export needs a viewBox (or a width and height) to refit from`]);
	}
	const [vx, vy, vw, vh] = vb;
	const s = (opts.fit === "cover" ? Math.max : Math.min)(W / vw, H / vh);
	const R: M = [s, 0, 0, s, (W - vw * s) / 2 - vx * s, (H - vh * s) / 2 - vy * s];
	const strokeScale = opts.strokeScale ?? s;
	const places = opts.precision ?? 1;
	const fmt = (v: number) => {
		const r = Number(v.toFixed(places));
		return String(r === 0 ? 0 : r);
	};

	// Illustrator's <style>: class rules, applied under the inline style.
	const rules = new Map<string, Map<string, string>>();
	const harvest = (el: XNode) => {
		if (el.name === "style") {
			const css = el.text.replace(/\/\*[\s\S]*?\*\//g, "");
			for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
				for (const one of sel.split(",").map((x) => x.trim())) {
					const m = /^\.([\w-]+)$/.exec(one);
					if (!m) {
						at(el, `a <style> selector "${one}" the importer cannot apply (class rules only); export with presentation attributes`);
						continue;
					}
					const into = rules.get(m[1]) ?? new Map();
					for (const [k, v] of CSS_DECL(body)) into.set(k, v);
					rules.set(m[1], into);
				}
			}
		}
		el.children.forEach(harvest);
	};
	harvest(root);

	// Every element with an id, anywhere (Figma puts a <mask> outside <defs>).
	const byId = new Map<string, XNode>();
	const index = (el: XNode) => {
		const id = el.attrs.get("id");
		if (id) byId.set(id, el);
		el.children.forEach(index);
	};
	index(root);

	/** An element's own properties: attribute < class rule < inline style. */
	const own = (el: XNode): Map<string, string> => {
		const p = new Map<string, string>();
		for (const [k, v] of el.attrs) p.set(k, v);
		for (const c of (el.attrs.get("class") ?? "").split(/\s+/).filter(Boolean)) for (const [k, v] of rules.get(c) ?? []) p.set(k, v);
		for (const [k, v] of CSS_DECL(el.attrs.get("style") ?? "")) p.set(k, v);
		return p;
	};

	/** A rect (no transform of its own) covering the export's whole viewBox. */
	const coversFrame = (el: XNode) => {
		if (el.name !== "rect" || el.attrs.has("transform")) return false;
		const n = (k: string) => parseFloat(el.attrs.get(k) ?? "0");
		return n("x") <= vx + EPS && n("y") <= vy + EPS && n("x") + n("width") >= vx + vw - EPS && n("y") + n("height") >= vy + vh - EPS;
	};
	/** The frame's own clip or mask: one rect covering the export's viewBox. */
	const isFrame = (ref: XNode | undefined) => {
		const kids = ref?.children.filter((c) => !SILENT.has(c.name)) ?? [];
		return kids.length === 1 && coversFrame(kids[0]);
	};
	const refOf = (v: string) => /^url\(\s*['"]?#([^'")]+)['"]?\s*\)$/.exec(v.trim())?.[1];

	const out: string[] = [];

	const moved = new Set<string>();
	/** A layer named in `opts.motion` becomes a motion group round its leaves. */
	const walk = (el: XNode, inherited: Map<string, string>, m: M, opacity: number) => {
		const id = el.attrs.get("id");
		const mo = id !== undefined ? opts.motion?.[id] : undefined;
		const start = out.length;
		visit(el, inherited, m, opacity);
		if (!mo || id === undefined) return;
		moved.add(id);
		const leaves = out.splice(start);
		if (!leaves.length) return void at(el, `the motion layer "${id}" draws nothing`);
		const speed = mo.speed !== undefined ? ` data-speed="${mo.speed}"` : "";
		out.push([`<g data-motion="${mo.motion}"${speed}>`, ...leaves.flatMap((l) => l.split("\n").map((x) => `  ${x}`)), "</g>"].join("\n"));
	};

	const visit = (el: XNode, inherited: Map<string, string>, m: M, opacity: number) => {
		const name = el.name;
		if (SILENT.has(name) || REFERENCED.has(name)) return;
		if (name.includes(":")) return; // sodipodi:namedview, inkscape:*, figma:*
		if (name in REFUSED && !(name === "svg" && el === root)) return void at(el, REFUSED[name]);
		if (name !== "svg" && name !== "g" && !(name in GEOMETRY)) return void at(el, `<${name}> is not an element the importer knows`);

		const p = own(el);
		// Unknown attributes fail: nothing is guessed at.
		const geometry = GEOMETRY[name] ?? [];
		for (const k of p.keys()) {
			if (READ.has(k) || DROPPED.has(k) || geometry.includes(k) || k.startsWith("data-") || k.includes(":")) continue;
			if (k.startsWith("marker")) at(el, `markers (${k}); draw the arrowhead as a shape`);
			else at(el, `an attribute the importer does not know, ${k}="${p.get(k)}"`);
		}
		if (p.get("display") === "none") return;
		const blend = p.get("mix-blend-mode");
		if (blend && blend !== "normal") at(el, `mix-blend-mode "${blend}"; the language has none — use a wash or a flat fill`);
		if (p.has("filter") && p.get("filter") !== "none") at(el, `a filter (${p.get("filter")}): shadows and blurs are not in the language; remove the effect`);
		for (const k of ["clip-path", "mask"] as const) {
			const v = p.get(k);
			if (!v || v === "none") continue;
			const ref = byId.get(refOf(v) ?? "");
			if (!isFrame(ref)) {
				at(el, `${k}="${v}" is not the artboard's own ${k === "mask" ? "mask" : "clip"} (one rect over the whole frame); flatten it in the editor — ${k === "mask" ? "Outline, Flatten" : "Boolean → Intersect"} — the importer strips only the frame's`);
			}
		}

		let mm = m;
		const t = p.get("transform");
		if (t) {
			const parsed = parseTransform(t);
			if (!parsed) at(el, `an unreadable transform "${t}"`);
			else mm = mul(m, parsed);
		}
		const op = opacity * (p.has("opacity") ? parseFloat(p.get("opacity")!) : 1);
		const inh = new Map(inherited);
		for (const k of INHERITED) if (p.has(k)) inh.set(k, p.get(k)!);

		if (name === "svg" || name === "g") {
			for (const c of el.children) walk(c, inh, mm, op);
			return;
		}
		if (inh.get("visibility") === "hidden" || inh.get("visibility") === "collapse") return;
		emit(el, p, inh, mm, op);
	};

	const paintOf = (el: XNode, which: "fill" | "stroke", v: string | undefined, alpha: number): string | null => {
		const c = parseColour(v ?? (which === "fill" ? "black" : "none"));
		if (c.kind === "none") return "none";
		if (c.kind === "bad") return void at(el, `${which}: ${c.why}`), null;
		const sw: Swatch | undefined = BY_HEX.get(c.hex);
		if (!sw) {
			const u = unmapped.get(c.hex) ?? { count: 0, uses: new Set<string>(), first: el.line };
			u.count++;
			u.uses.add(v === undefined ? "fill (none given: SVG's default black)" : which);
			unmapped.set(c.hex, u);
			return null;
		}
		const a = alpha * c.alpha;
		if (a <= 0.005) return "none";
		if (sw.paint === null) return void at(el, `the plate swatch ${sw.hex} is the artboard's background only; the frame paints the plate`), null;
		if (a >= 0.995) return sw.paint;
		if (which === "stroke") return void at(el, `a translucent stroke (${sw.name} at ${Math.round(a * 100)}%); a line takes a token at full strength — dim it with the ink-2 swatch`), null;
		if (!sw.washable) return void at(el, `${sw.name} at ${Math.round(a * 100)}%: only a colour washes; dim the ink with the ink-2 swatch`), null;
		if (a > WASH_MAX / 100 + 0.005) return void at(el, `${sw.name} at ${Math.round(a * 100)}%: a wash is a colour at 1–${WASH_MAX}%, past that it is a flat fill (100%)`), null;
		return `color-mix(in oklab, ${sw.paint} ${Math.max(1, Math.round(a * 100))}%, transparent)`;
	};

	const emit = (el: XNode, p: Map<string, string>, inh: Map<string, string>, m: M, opacity: number) => {
		const num = (k: string, d = 0) => {
			const v = p.get(k);
			const n = v === undefined ? d : /^\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?(?:px)?\s*$/i.test(v) ? parseFloat(v) : NaN;
			if (!Number.isFinite(n)) at(el, `${k}="${v}" is not a number (a percentage or unit cannot refit)`);
			return Number.isFinite(n) ? n : d;
		};
		// The artboard's background: a rect over the whole frame in the plate swatch, dropped.
		const fillC = parseColour(inh.get("fill") ?? "black");
		if (fillC.kind === "hex" && BY_HEX.get(fillC.hex)?.paint === null && coversFrame(el) && m.every((v, k) => near(v, I[k]))) {
			if (parseColour(inh.get("stroke") ?? "none").kind === "none") return;
		}

		const fillA = opacity * parseFloat(inh.get("fill-opacity") ?? "1");
		const strokeA = opacity * parseFloat(inh.get("stroke-opacity") ?? "1");
		const fill = el.name === "line" ? "none" : paintOf(el, "fill", inh.get("fill"), fillA); // a line cannot fill
		const stroke = paintOf(el, "stroke", inh.get("stroke"), strokeA);

		const src = m; // the source transform, before the refit
		const total = mul(R, m);
		const attrs: string[] = [];
		let tf = "";
		/** Coordinates by `total` (baked), or by R with the rest kept as a conjugated matrix. */
		const keep = () => {
			const c = mul(mul(R, src), inv(R));
			tf = `matrix(${c.map((v) => String(Number(v.toFixed(4)) || 0)).join(" ")})`;
			return R;
		};
		const pts = (mx: M, list: string) => {
			const v = nums(list);
			const o: string[] = [];
			for (let k = 0; k + 1 < v.length; k += 2) o.push(ap(mx, v[k], v[k + 1]).map(fmt).join(","));
			return o.join(" ");
		};

		switch (el.name) {
			case "path": {
				let segs: Seg[];
				try {
					segs = parsePath(p.get("d") ?? "");
				} catch (e) {
					return void at(el, (e as Error).message);
				}
				if (!segs.length) return;
				const arcs = segs.some((g) => g.c === "A");
				const mx = !arcs || similarity(src) ? total : keep();
				attrs.push(`d="${writePath(transformPath(segs, mx), fmt)}"`);
				break;
			}
			case "rect": {
				const [x, y, w, h] = [num("x"), num("y"), num("width"), num("height")];
				if (w <= 0 || h <= 0) return;
				let rx = p.has("rx") ? num("rx") : p.has("ry") ? num("ry") : 0;
				let ry = p.has("ry") ? num("ry") : rx;
				[rx, ry] = [Math.min(rx, w / 2), Math.min(ry, h / 2)];
				if (axisAligned(src)) {
					const [x0, y0] = ap(total, x, y);
					attrs.push(`x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(w * total[0])}" height="${fmt(h * total[3])}"`);
					if (rx || ry) {
						const [ox, oy] = [rx * total[0], ry * total[3]];
						attrs.push(near(ox, oy, 0.05) ? `rx="${fmt(ox)}"` : `rx="${fmt(ox)}" ry="${fmt(oy)}"`);
					}
				} else if (!rx && !ry) {
					const c = [ap(total, x, y), ap(total, x + w, y), ap(total, x + w, y + h), ap(total, x, y + h)];
					const d = `M ${c.map((q) => q.map(fmt).join(" ")).join(" L ")} Z`;
					out.push(finish("path", [`d="${d}"`], "", el, fill, stroke, inh, m));
					return;
				} else {
					const mx = keep();
					const [x0, y0] = ap(mx, x, y);
					attrs.push(`x="${fmt(x0)}" y="${fmt(y0)}" width="${fmt(w * s)}" height="${fmt(h * s)}" rx="${fmt(rx * s)}"${rx !== ry ? ` ry="${fmt(ry * s)}"` : ""}`);
				}
				break;
			}
			case "circle":
			case "ellipse": {
				const [cx, cy] = [num("cx"), num("cy")];
				const [rx, ry] = el.name === "circle" ? [num("r"), num("r")] : [num("rx"), num("ry")];
				if (rx <= 0 || ry <= 0) return;
				if ((el.name === "circle" || near(rx, ry)) && similarity(src)) {
					out.push(finish("circle", [`cx="${fmt(ap(total, cx, cy)[0])}" cy="${fmt(ap(total, cx, cy)[1])}" r="${fmt(rx * scaleOf(total))}"`], "", el, fill, stroke, inh, m));
					return;
				}
				if (axisAligned(src)) {
					const [x0, y0] = ap(total, cx, cy);
					out.push(finish("ellipse", [`cx="${fmt(x0)}" cy="${fmt(y0)}" rx="${fmt(rx * total[0])}" ry="${fmt(ry * total[3])}"`], "", el, fill, stroke, inh, m));
					return;
				}
				const mx = keep();
				const [x0, y0] = ap(mx, cx, cy);
				out.push(finish("ellipse", [`cx="${fmt(x0)}" cy="${fmt(y0)}" rx="${fmt(rx * s)}" ry="${fmt(ry * s)}"`], tf, el, fill, stroke, inh, m));
				return;
			}
			case "line": {
				const [x1, y1] = ap(total, num("x1"), num("y1")).map(fmt);
				const [x2, y2] = ap(total, num("x2"), num("y2")).map(fmt);
				attrs.push(`x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`);
				break;
			}
			default:
				attrs.push(`points="${pts(total, p.get("points") ?? "")}"`);
		}
		out.push(finish(el.name, attrs, tf, el, fill, stroke, inh, m));
	};

	/** The leaf, complete: geometry, transform, paint, and the stroke's weight, class, vector-effect, caps and dash. */
	const finish = (name: string, geo: string[], tf: string, el: XNode, fill: string | null, stroke: string | null, inh: Map<string, string>, m: M): string => {
		const a = [...geo];
		if (tf) a.push(`transform="${tf}"`);
		a.push(`fill="${fill ?? "none"}"`);
		if (inh.get("fill-rule") === "evenodd" && fill && fill !== "none") a.push('fill-rule="evenodd"');
		if (stroke && stroke !== "none") {
			const factor = scaleOf(m) * strokeScale;
			const raw = parseFloat(inh.get("stroke-width") ?? "1");
			const w = raw * factor;
			const weight = Math.abs(w - 1) <= 0.25 ? "1" : Math.abs(w - 1.5) <= 0.25 ? "1.5" : null;
			if (!weight) {
				at(el, `stroke-width ${inh.get("stroke-width") ?? "1 (the default)"} is ${+w.toFixed(2)} at this scale (×${+factor.toFixed(3)}); the language has 1 and 1.5 — draw ${+(1 / factor).toFixed(2)} or ${+(1.5 / factor).toFixed(2)}`);
			}
			a.push(`stroke="${stroke}"`, `stroke-width="${weight ?? "1"}"`, `class="${weight === "1.5" ? "art-line--2" : "art-line"}"`, 'vector-effect="non-scaling-stroke"');
			const cap = inh.get("stroke-linecap");
			const join = inh.get("stroke-linejoin");
			if (cap && cap !== "butt") a.push(`stroke-linecap="${cap}"`);
			if (join && join !== "miter") a.push(`stroke-linejoin="${join}"`);
			const da = inh.get("stroke-dasharray");
			if (da && da !== "none") {
				let v = nums(da).map((x) => x * factor);
				if (v.length % 2) v = [...v, ...v];
				const snap = SCENE_DASHES.find((d) => d.length === v.length && d.every((x, k) => Math.abs(x - v[k]) <= 0.75));
				if (snap) a.push(`stroke-dasharray="${snap.join(" ")}"`);
				else at(el, `stroke-dasharray "${da}" is ${v.map((x) => +x.toFixed(2)).join(" ")} at this scale; the scene's dashes are ${SCENE_DASHES.map((d) => d.join(" ")).join(", ")} (× ${+(1 / factor).toFixed(3)} in the editor)`);
			}
			const off = parseFloat(inh.get("stroke-dashoffset") ?? "0");
			if (off) at(el, `stroke-dashoffset ${off}; the dash starts at 0 (the dash motion owns the offset)`);
		}
		return `<${name} ${a.join(" ")} />`;
	};

	// From the root: its own paint (Figma's fill="none") is inherited like a group's.
	walk(root, new Map(), I, 1);
	for (const id of Object.keys(opts.motion ?? {})) {
		if (!moved.has(id)) problems.push(`motion: the export has no drawn layer with id "${id}" (Figma writes a layer's name as its id; tick "Include id attribute")`);
	}
	if (unmapped.size) {
		const list = [...unmapped]
			.sort((a, b) => a[1].first - b[1].first)
			.map(([hex, u]) => {
				const n = nearestSwatch(hex);
				return `${hex} ×${u.count} (${[...u.uses].join(", ")}; first line ${u.first}; nearest swatch: ${n.name} ${n.hex})`;
			});
		problems.unshift(`${unmapped.size} colour${unmapped.size === 1 ? " is" : "s are"} not a swatch (tools/scenes/SWATCHES.md): ${list.join("; ")}`);
	}
	if (problems.length) throw new ImportVectorError(problems);
	return out;
}

/** Segments as a `d`: absolute, rounded, and a flat L folded to H or V. */
function writePath(segs: Seg[], fmt: (v: number) => string): string {
	const parts: string[] = [];
	let [x, y, sx, sy] = ["", "", "", ""];
	for (const { c, a } of segs) {
		const f = a.map(fmt);
		if (c === "L" && f[1] === y && f[0] !== x) parts.push(`H ${f[0]}`);
		else if (c === "L" && f[0] === x && f[1] !== y) parts.push(`V ${f[1]}`);
		else parts.push(f.length ? `${c} ${f.join(" ")}` : c);
		if (c === "Z") [x, y] = [sx, sy];
		else [x, y] = [f[f.length - 2], f[f.length - 1]];
		if (c === "M") [sx, sy] = [x, y];
	}
	return parts.join(" ");
}
