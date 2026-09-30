/**
 * The paint tables: everything about a primitive's output that differs
 * between the two drawing languages the validator knows (scripts/
 * validate-art.mjs, PROFILES). A recipe names a paint, a weight and a dash
 * by their meaning; the kit's target picks the strings the profile allows.
 */

/** Which language the kit emits: a glyph (48×32, currentColor line work) or an art plate (320×180, the --art-ink tokens). */
export type Target = "glyph" | "art";

/**
 * A paint by its meaning. `ink` is the line's colour — the text's on a
 * glyph, the plate's on art — and `dim` is its one dimming; the four
 * colours are the art tokens (blue is `--art-cyan`, red `--art-coral`).
 */
export type Paint = "ink" | "dim" | "blue" | "red" | "green" | "lavender" | "none";

/** A stroke's weight: `hair` is 1, `line` 1.5. A glyph's default is `line`; art's is `hair`, its 1.5 being the one emphasis outline (CONVENTIONS, "Art"). */
export type Weight = "hair" | "line";

/**
 * A dash by its meaning. `dotted` is the round-capped dotted guide, `dash`
 * the fine dash, `long` the coarse one. Art has only two arrays, so its
 * `dash` and `long` are both `4 4`.
 */
export type Dash = "dotted" | "dash" | "long";

/** The motion kinds of the shared data-motion contract (CONVENTIONS, "Motion contract"). */
export type Motion = "spin" | "drift" | "slide" | "blink" | "dash";

/** The speeds the contract allows on a motion group. */
export type Speed = 0.5 | 1 | 2;

export interface TargetTable {
	/** the default root viewBox */
	readonly viewBox: string;
	readonly paints: Readonly<Record<Paint, string>>;
	/** the weight a stroke takes unless said */
	readonly weight: Weight;
	/** the stroke-width, and for art the class that must agree with it */
	readonly weights: Readonly<Record<Weight, { readonly width: string; readonly class?: string }>>;
	readonly dashes: Readonly<Record<Dash, string>>;
	/** a wire's end marks: the terminal dot's radius and the square terminal's side */
	readonly ends: { readonly dot: number; readonly terminal: number };
}

const COLOURS = {
	blue: "var(--art-cyan)",
	red: "var(--art-coral)",
	green: "var(--art-green)",
	lavender: "var(--art-lavender)",
	none: "none",
} as const;

export const TARGETS: Readonly<Record<Target, TargetTable>> = Object.freeze({
	glyph: Object.freeze({
		viewBox: "0 0 48 32",
		paints: Object.freeze({ ink: "currentColor", dim: "var(--glyph-dim)", ...COLOURS }),
		weight: "line",
		weights: Object.freeze({ hair: { width: "1" }, line: { width: "1.5" } }),
		dashes: Object.freeze({ dotted: "0.01 3.99", dash: "2 2", long: "4 4" }),
		ends: Object.freeze({ dot: 1.5, terminal: 4 }),
	}),
	art: Object.freeze({
		viewBox: "0 0 320 180",
		paints: Object.freeze({ ink: "var(--art-ink)", dim: "var(--art-ink-2)", ...COLOURS }),
		weight: "hair",
		weights: Object.freeze({ hair: { width: "1", class: "art-line" }, line: { width: "1.5", class: "art-line--2" } }),
		dashes: Object.freeze({ dotted: "2 6", dash: "4 4", long: "4 4" }),
		ends: Object.freeze({ dot: 2.5, terminal: 6 }),
	}),
});
