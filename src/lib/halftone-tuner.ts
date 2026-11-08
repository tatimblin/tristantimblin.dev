// The homepage halftone tuner's logic, with no DOM: what ships per theme (read
// from src/styles/halftone.css itself, so it cannot drift), what the tuning
// changes, and the CSS that keeps it. The panel is
// src/components/HalftoneTuner.astro. Development only.
import { DOT_SHAPES, colourKnobs, toneKnobs } from "./halftone-controls";

export type Theme = "light" | "dark";
export const THEMES: Theme[] = ["light", "dark"];

/** A setting (`gamma`, `ink-hi`) to its CSS value. */
export type Values = Record<string, string>;
export type PerTheme = Record<Theme, Values>;

/** The two layouts of the videos card; `cellSize` is a prop on each. */
export type Variant = "wide" | "compact";
export type CellSizes = Partial<Record<Variant, number>>;
export const VARIANTS: Record<Variant, { label: string; className: string }> = {
	wide: { label: "desktop", className: "wx-videos__wide" },
	compact: { label: "compact", className: "wx-videos__compact" },
};

/** A colour left to the grid's theme: no variable at all. */
export const AUTO = "auto";

/** The carousel's selector in halftone.css. */
export const SELECTOR = ".wx-videos dotted-grid";

/** What the panel injects: the same rule, a notch more specific, so it wins
 *  wherever Vite happens to put the stylesheet. */
export const LIVE_SELECTOR = ".wx-videos.wx-videos dotted-grid";

const COLOURS = colourKnobs.map((c) => c.name);
const SETTINGS = [...COLOURS, "polarity", ...toneKnobs.map((k) => k.name)];

const themed = (theme: Theme, selector: string) => `[data-theme="${theme}"] ${selector}`;

/** The element's own defaults, as settings: what an unset variable falls to. */
export function defaultsFromTone(d: {
	gamma: number;
	contrast: number;
	cutoff: number;
	feather: number;
	dotScale: number;
	levels: number;
	bloom: number;
	crosshatch: number;
	denoise: number;
	dotShape: number;
}): Values {
	return {
		polarity: "positive",
		gamma: String(d.gamma),
		contrast: String(d.contrast),
		cutoff: String(d.cutoff),
		feather: String(d.feather),
		"dot-scale": String(d.dotScale),
		levels: String(d.levels),
		bloom: String(d.bloom),
		crosshatch: String(d.crosshatch),
		denoise: String(d.denoise),
		"dot-shape": DOT_SHAPES[d.dotShape],
	};
}

/** One spelling per value: the shape as its keyword. */
function canonical(name: string, value: string): string {
	const v = value.trim();
	if (name === "dot-shape" && /^\d+$/.test(v)) return DOT_SHAPES[Number(v)] ?? v;
	return v;
}

/** Each theme's shipped values: the element's defaults, under the card's shared
 *  rule, under that theme's. A colour nothing sets is simply absent (auto). */
export function parseShipped(css: string, defaults: Values): PerTheme {
	const base: Values = {};
	const own: PerTheme = { light: {}, dark: {} };
	const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g);
	for (const [, rawSelector, body] of rules) {
		const selector = rawSelector.trim();
		const target =
			selector === SELECTOR ? base : THEMES.find((t) => selector === themed(t, SELECTOR));
		if (!target) continue;
		const into = typeof target === "string" ? own[target] : target;
		for (const [, name, value] of body.matchAll(/--dg-([\w-]+)\s*:\s*([^;]+);/g)) {
			into[name] = canonical(name, value);
		}
	}
	return {
		light: { ...defaults, ...base, ...own.light },
		dark: { ...defaults, ...base, ...own.dark },
	};
}

/** The shipped value of a setting, AUTO for a colour nothing sets. */
export const shippedValue = (shipped: Values, name: string) => shipped[name] ?? AUTO;

/** Whether two values are the same setting, however they're spelled. */
export function sameValue(name: string, a: string, b: string): boolean {
	const [x, y] = [canonical(name, a), canonical(name, b)];
	const [nx, ny] = [Number(x), Number(y)];
	if (x !== "" && y !== "" && Number.isFinite(nx) && Number.isFinite(ny)) return nx === ny;
	return x.toLowerCase() === y.toLowerCase();
}

/** Records a change, or clears it when the value is back to what ships. */
export function setOverride(overrides: Values, shipped: Values, name: string, value: string) {
	if (sameValue(name, value, shippedValue(shipped, name))) delete overrides[name];
	else overrides[name] = canonical(name, value);
}

/** One theme's rule, only for what differs. "" when nothing does. */
export function themeRule(theme: Theme, overrides: Values, selector = SELECTOR): string {
	const lines = SETTINGS.filter((name) => overrides[name] !== undefined).map(
		// A colour set to auto has to out-argue a shared rule that names one:
		// `initial` empties the variable, and an empty one is what auto reads.
		(name) => `\t--dg-${name}: ${overrides[name] === AUTO ? "initial" : overrides[name]};`,
	);
	return lines.length ? `${themed(theme, selector)} {\n${lines.join("\n")}\n}` : "";
}

/** Everything the panel's Copy hands back: a rule per changed theme for
 *  halftone.css, the cell sizes for Videos.astro as a comment so the lot pastes
 *  anywhere in a stylesheet. */
export function tuningOutput(overrides: PerTheme, cell: CellSizes): string {
	const rules = THEMES.map((t) => themeRule(t, overrides[t])).filter(Boolean);
	const cells = (Object.keys(VARIANTS) as Variant[])
		.filter((v) => cell[v] !== undefined)
		.map((v) => `   ${VARIANTS[v].label} (.${VARIANTS[v].className}): cellSize={${cell[v]}}`);
	const parts: string[] = [];
	if (rules.length) parts.push(`/* src/styles/halftone.css */\n${rules.join("\n\n")}`);
	if (cells.length) parts.push(`/* src/widgets/videos/Videos.astro\n${cells.join("\n")}\n*/`);
	return parts.join("\n\n") || "/* no changes from what ships */";
}
