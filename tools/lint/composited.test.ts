/**
 * ANIMATE ONLY WHAT THE COMPOSITOR CAN. A transition or keyframe animation of
 * `transform`, `opacity`, `translate`, `filter`... runs on the compositor; one
 * of a GEOMETRY property (width, height, top, left, margin, block-size and the
 * like) re-lays out the page on every frame it runs, and on the main thread,
 * where a long task stalls it. theme/design-system/src/lib/WIDGETS.md's rule
 * ("animate transform and opacity only"), enforced:
 *
 * every `transition` / `transition-property` and every `@keyframes` block in
 * the widgets' and the theme's CSS (stylesheets, and the <style> blocks of
 * .astro components) is read, and a geometry property in one fails the test —
 * unless it is in ALLOWED below, each entry with the reason it has to be.
 * `transition: all` counts as geometry (it is, the moment one is set).
 *
 * External packages (node_modules: the video carousel's ruler tick `width`, the
 * Spotify player's skeleton) are out of reach here and out of scope.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..", "..");

/** Where widget and theme CSS lives. */
export const SCANNED = ["src/widgets", "src/styles", "src/components", "src/layouts", "theme"];

/** Properties whose animation re-lays out the page. */
export const GEOMETRY = new Set([
	"all",
	"width",
	"height",
	"min-width",
	"max-width",
	"min-height",
	"max-height",
	"inline-size",
	"block-size",
	"min-inline-size",
	"max-inline-size",
	"min-block-size",
	"max-block-size",
	"top",
	"right",
	"bottom",
	"left",
	"inset",
	"inset-block",
	"inset-inline",
	"inset-block-start",
	"inset-block-end",
	"inset-inline-start",
	"inset-inline-end",
	"margin",
	"margin-top",
	"margin-right",
	"margin-bottom",
	"margin-left",
	"margin-block",
	"margin-inline",
	"margin-block-start",
	"margin-block-end",
	"margin-inline-start",
	"margin-inline-end",
	"padding",
	"padding-top",
	"padding-right",
	"padding-bottom",
	"padding-left",
	"padding-block",
	"padding-inline",
	"padding-block-start",
	"padding-block-end",
	"padding-inline-start",
	"padding-inline-end",
	"border-width",
	"border-top-width",
	"border-right-width",
	"border-bottom-width",
	"border-left-width",
	"font-size",
	"line-height",
	"letter-spacing",
	"word-spacing",
	"gap",
	"row-gap",
	"column-gap",
	"flex",
	"flex-basis",
	"flex-grow",
	"flex-shrink",
	"grid-template-columns",
	"grid-template-rows",
	"aspect-ratio",
]);

/**
 * The geometry animations that have to be, by file (relative to the repo) and
 * property. Each says why; one that is no longer found fails the test too, so
 * the list can only shrink with the code.
 */
export const ALLOWED: Array<{ file: string; property: string; why: string }> = [
	{
		file: "src/widgets/volo/volo.css",
		property: "block-size",
		why:
			"The schedule tray opens by growing up over the chart, a box with a dashed top rule and a " +
			"list inside; a scaleY would stretch both, a translate would slide the list out of the card. " +
			"It runs once per press, and the tray is absolutely positioned inside a card the grid sizes, " +
			"so each frame's relayout is the tray's own subtree.",
	},
];

interface Finding {
	file: string;
	property: string;
	where: "transition" | "keyframes";
	line: number;
}

function* files(dir: string): Generator<string> {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue;
		const path = join(dir, name);
		if (statSync(path).isDirectory()) yield* files(path);
		else if (/\.(css|astro)$/.test(name)) yield path;
	}
}

/** The CSS in a file: all of a stylesheet, the <style> blocks of a component.
 *  Everything else is blanked (kept as newlines, so line numbers hold). */
export function cssOf(path: string, text: string): string {
	if (path.endsWith(".css")) return text;
	let out = "";
	let at = 0;
	for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)) {
		const start = m.index! + m[0].indexOf(">") + 1;
		out += text.slice(at, start).replace(/[^\n]/g, " ");
		out += m[1];
		at = start + m[1].length;
	}
	return out + text.slice(at).replace(/[^\n]/g, " ");
}

/** Split on top-level commas (not those inside a cubic-bezier(), var()...). */
function splitTop(value: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let cur = "";
	for (const ch of value) {
		if (ch === "(") depth++;
		else if (ch === ")") depth--;
		if (ch === "," && depth === 0) {
			parts.push(cur);
			cur = "";
		} else cur += ch;
	}
	parts.push(cur);
	return parts.map((p) => p.trim()).filter(Boolean);
}

const NOT_A_PROPERTY =
	/^(none|initial|inherit|unset|revert|revert-layer|ease|ease-in|ease-out|ease-in-out|linear|step-start|step-end|normal|allow-discrete|[-+.\d].*|var\(.*|cubic-bezier\(.*|steps\(.*|linear\(.*)$/;

/** The properties a transition / transition-property value names. */
export function transitioned(value: string, shorthand: boolean): string[] {
	return splitTop(value).flatMap((item) => {
		const tokens = item.split(/\s+(?![^(]*\))/);
		if (!shorthand) return tokens.filter((t) => !NOT_A_PROPERTY.test(t));
		// `none` transitions nothing, and a CSS-wide keyword names nothing here.
		if (tokens.some((t) => /^(none|initial|inherit|unset|revert|revert-layer)$/.test(t))) return [];
		const property = tokens.find((t) => !NOT_A_PROPERTY.test(t));
		if (property) return [property];
		// No property name: `all` — unless a var() could be supplying one,
		// which can't be read from here.
		return tokens.some((t) => t.startsWith("var(")) ? [] : ["all"];
	});
}

export function lint(file: string, text: string): Finding[] {
	const css = cssOf(file, text).replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
	const lineAt = (i: number) => css.slice(0, i).split("\n").length;
	const found: Finding[] = [];

	// transition / transition-property declarations.
	for (const m of css.matchAll(/(?<![-\w])(transition(?:-property)?)\s*:\s*([^;{}]+)/g)) {
		for (const property of transitioned(m[2], m[1] === "transition")) {
			if (GEOMETRY.has(property)) found.push({ file, property, where: "transition", line: lineAt(m.index!) });
		}
	}

	// @keyframes blocks: every declaration inside one.
	for (const m of css.matchAll(/@keyframes\s+[\w-]+\s*\{/g)) {
		let depth = 1;
		let i = m.index! + m[0].length;
		const start = i;
		while (i < css.length && depth > 0) {
			if (css[i] === "{") depth++;
			else if (css[i] === "}") depth--;
			i++;
		}
		const body = css.slice(start, i - 1);
		for (const d of body.matchAll(/(?<![-\w])([a-z-]+)\s*:/g)) {
			if (GEOMETRY.has(d[1])) found.push({ file, property: d[1], where: "keyframes", line: lineAt(start + d.index!) });
		}
	}
	return found;
}

describe("widget and theme CSS animates only composited properties", () => {
	const findings: Finding[] = [];
	for (const dir of SCANNED) {
		for (const path of files(join(ROOT, dir))) {
			findings.push(...lint(relative(ROOT, path), readFileSync(path, "utf8")));
		}
	}

	test("no geometry property is transitioned or keyframed outside the allowlist", () => {
		const bad = findings.filter((f) => !ALLOWED.some((a) => a.file === f.file && a.property === f.property));
		expect(
			bad.map((f) => `${f.file}:${f.line} animates \`${f.property}\` (${f.where})`),
			"animate transform/opacity instead, or add it to ALLOWED in tools/lint/composited.test.ts with why",
		).toEqual([]);
	});

	test("every allowlist entry is still needed", () => {
		const stale = ALLOWED.filter((a) => !findings.some((f) => f.file === a.file && f.property === a.property));
		expect(stale.map((a) => `${a.file}: ${a.property}`)).toEqual([]);
	});
});

describe("the reader", () => {
	test("transition shorthands, lists and keywords", () => {
		expect(transitioned("opacity 0.2s ease, transform 0.3s cubic-bezier(0.2, 0, 0, 1)", true)).toEqual([
			"opacity",
			"transform",
		]);
		expect(transitioned("0.2s ease-out", true)).toEqual(["all"]);
		expect(transitioned("width 1s, block-size 0.2s allow-discrete", true)).toEqual(["width", "block-size"]);
		expect(transitioned("opacity, left", false)).toEqual(["opacity", "left"]);
		expect(transitioned("none", true)).toEqual([]);
		expect(transitioned("var(--fade)", true)).toEqual([]);
	});

	test("finds them in stylesheets, components and keyframes, not in comments", () => {
		const css = `
			.a { transition: opacity .2s; }
			/* .b { transition: width .2s } */
			.c { transition-property: height; }
			@keyframes grow { from { width: 0 } to { width: 10px; transform: none } }
		`;
		expect(lint("x.css", css).map((f) => `${f.property}:${f.where}:${f.line}`)).toEqual([
			"height:transition:4",
			"width:keyframes:5",
			"width:keyframes:5",
		]);
		const astro = `---\nconst x = "transition: width 1s";\n---\n<div style="x"/>\n<style>\n.d { transition: left 1s }\n</style>`;
		expect(lint("x.astro", astro).map((f) => `${f.property}:${f.line}`)).toEqual(["left:6"]);
	});
});
