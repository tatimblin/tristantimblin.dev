/**
 * The paint tables: everything about a primitive's output that differs
 * between the two drawing languages the validator knows (scripts/
 * validate-art.mjs, PROFILES). A recipe names a paint, a weight and a dash
 * by their meaning; the kit's target picks the strings the profile allows.
 */

/**
 * Which language the kit emits: a glyph (48×32, currentColor line work),
 * an art plate (320×180, the --art-ink tokens), or a scene (the plate or a
 * 400×400 panel; art's table with the dot-dash, and the one target whose
 * profile takes a wash). One target per validator profile.
 */
export type Target = "glyph" | "art" | "scene";

/**
 * A paint by its meaning. `ink` is the line's colour — the text's on a
 * glyph, the plate's on art — and `dim` is its one dimming; the four
 * colours are the art tokens (blue is `--art-cyan`, red `--art-coral`).
 */
export type Paint = "ink" | "dim" | "blue" | "red" | "green" | "lavender" | "none";

/** The four colours: a paint that is a fill token, so it can be washed. */
export type Colour = "blue" | "red" | "green" | "lavender";

/**
 * A WASH: a colour mixed down over transparent — an ocean, a ruler's band,
 * a ground haze. A scene's fill (the scene profile allows it at 1–25%; art
 * and glyph refuse it), never a stroke. Made with `k.wash(colour, pct)`.
 */
export interface Wash {
	readonly wash: Colour;
	/** a whole percent, 1–25 */
	readonly pct: number;
}

/** What a shape may be filled with: a paint, or a wash. */
export type Fill = Paint | Wash;

/** The most a wash may mix a colour to (the scene profile's limit). */
export const WASH_MAX = 25;

/** A stroke's weight: `hair` is 1, `line` 1.5. A glyph's default is `line`; art's is `hair`, its 1.5 being the one emphasis outline (CONVENTIONS, "Art"). */
export type Weight = "hair" | "line";

/**
 * A dash by its meaning. `dotted` is the round-capped dotted guide, `dash`
 * the fine dash, `long` the coarse one. Art has only two arrays, so its
 * `dash` and `long` are both `4 4`. `dotdash` is the scene's `6 3 1 3` —
 * an orbit, a track — and the scene target's alone: its period, 13, does
 * not divide the dash motion's 8, so it is a still or a spinning dash,
 * never a `dash` group's, and a glyph or art kit asked for it throws.
 */
export type Dash = "dotted" | "dash" | "long" | "dotdash";

/** The motion kinds of the shared data-motion contract (CONVENTIONS, "Motion contract"). `steps` is built with `k.steps()`, not `group()`. */
export type Motion = "spin" | "drift" | "slide" | "blink" | "dash" | "steps";

/**
 * A mark inside a `steps` beat: a `ripple` is a shape that scales out
 * and fades as its beat lands; a `now` shows only while its beat is the
 * current one (a pointer, one copy per beat). Written as `data-ripple` /
 * `data-now`; the host's motion.css plays them off the beat's clock.
 */
export type Mark = "ripple" | "now";

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
	/** the dash arrays the target's profile allows, by name; a name missing here throws in `dash()` */
	readonly dashes: Readonly<Partial<Record<Dash, string>>>;
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
	scene: Object.freeze({
		viewBox: "0 0 400 400",
		paints: Object.freeze({ ink: "var(--art-ink)", dim: "var(--art-ink-2)", ...COLOURS }),
		weight: "hair",
		weights: Object.freeze({ hair: { width: "1", class: "art-line" }, line: { width: "1.5", class: "art-line--2" } }),
		dashes: Object.freeze({ dotted: "2 6", dash: "4 4", long: "4 4", dotdash: "6 3 1 3" }),
		ends: Object.freeze({ dot: 2.5, terminal: 6 }),
	}),
});
