/**
 * TYPE and the MODULE SHEET — words on a plate, and the small compositions
 * of a HUD's module sheet built from them: a section head over a dotted
 * rule, a bracketed state, a big thin numeral with its caption.
 *
 * A word on a plate is a `<text>` in one of four VOICES (the validator's
 * type rule, scripts/validate-art.mjs; the CSS, art-frame.css):
 *
 *   label    the label voice — the UI face, tracked caps; IDs, codes, file names
 *   caption  the same face a size down, the dimmed ink unless said; the line under a readout
 *   numeral  the display numeral (--font-display, DM Sans Medium): 007, 45, 0079
 *   title    a module's heading (--font-heading, DM Sans Medium): EPOCH, CONFIG, NODE
 *
 * The file says only where, how big — a step of one SCALE in viewBox units,
 * each voice its own steps — and which token fills it; the face, weight and
 * tracking are the class's, so no font is named here either. Art and scene
 * only: a glyph's words are HTML beside it, and the glyph kit throws.
 *
 * The builders take the kit first, as iso.ts's do, and are methods on it
 * (`k.text`, `k.rule`, `k.section`, `k.bracketLabel`, `k.readout`). Widths
 * are ESTIMATED from the faces' measured advances (`advance`), since a bake
 * has no font: good to a few percent for caps and figures, which is what
 * the voices set — leave a margin, never butt a mark against a word's end.
 */

import { round } from "./geometry";
import type { Kit } from "./kit";
import type { Paint } from "./paint";

/** A voice: the class `art-<voice>` whose CSS sets the face. */
export type Voice = "label" | "caption" | "numeral" | "title";

/** The type scale, in viewBox units: 3.5 is ~8px on a 720px hero, 32 a 72px numeral. */
export const TYPE_SCALE = Object.freeze([3.5, 4.5, 6, 9, 14, 22, 32] as const);
export type TypeSize = (typeof TYPE_SCALE)[number];

/** Each voice's steps of the scale — the validator's TYPE_SIZES, as numbers. */
export const VOICE_SIZES: Readonly<Record<Voice, readonly TypeSize[]>> = Object.freeze({
	label: Object.freeze([3.5, 4.5, 6] as const),
	caption: Object.freeze([3.5, 4.5] as const),
	title: Object.freeze([6, 9, 14] as const),
	numeral: Object.freeze([9, 14, 22, 32] as const),
});

/** A voice's size unless said. */
export const VOICE_DEFAULT: Readonly<Record<Voice, TypeSize>> = Object.freeze({ label: 4.5, caption: 3.5, title: 9, numeral: 22 });

/** A voice's paint unless said: the caption is the dimmed ink. */
const VOICE_PAINT: Readonly<Record<Voice, Paint>> = Object.freeze({ label: "ink", caption: "dim", title: "ink", numeral: "ink" });

export type Anchor = "start" | "middle" | "end";

export interface TextOpts {
	/** the voice; `label` unless said */
	role?: Voice;
	/** a step of the voice's scale; its default unless said (a size off the voice's steps throws) */
	size?: TypeSize;
	/** which end of the words `x` is; `start` unless said */
	anchor?: Anchor;
	/** a token; the voice's (ink, or dim for a caption) unless said. Never `none`. */
	paint?: Exclude<Paint, "none">;
	/** a quarter turn about `(x, y)`: -90 reads up the page, 90 down it */
	turn?: -90 | 90;
}

/**
 * The faces' advances, in em, measured in Chromium off the self-hosted DM
 * Sans cuts (span widths at font-size 100, tabular figures, tracking
 * removed). Taken at the Medium (500), the numeral's and title's cut and
 * the wider of the two the voices use, so the Regular (400) label lands a
 * percent or two inside the estimate: figures 0.577 (400: 0.571), capitals
 * 0.644 (0.633), lower case 0.532 (0.519), space and punctuation about 0.4.
 * The voice's tracking is added per character, as the browser does (after
 * every one, the last included).
 */
const ADVANCE = { figure: 0.58, capital: 0.645, lower: 0.535, narrow: 0.4 } as const;
/** Each voice's tracking in em — art-frame.css's letter-spacing: --tracking-caps, --tracking-mono, --tracking-heading. */
const TRACKING: Readonly<Record<Voice, number>> = Object.freeze({ label: 0.0625, caption: 0.02, numeral: 0, title: 0 });

/** The estimated width of `words` set in `voice` at `size`, in viewBox units. */
export function advance(words: string, voice: Voice = "label", size: number = VOICE_DEFAULT[voice]): number {
	let em = 0;
	for (const ch of words) {
		if (/[0-9]/.test(ch)) em += ADVANCE.figure;
		else if (/[A-Z]/.test(ch)) em += ADVANCE.capital;
		else if (/[a-z]/.test(ch)) em += ADVANCE.lower;
		else em += ADVANCE.narrow;
		em += TRACKING[voice];
	}
	return round(em * size);
}

/**
 * The voice's case: upper, but a hex prefix keeps its `x` (`0x7B8A`). The
 * module helpers set their words through it; `text()` sets what it is given.
 */
export function caps(words: string): string {
	return words.toUpperCase().replace(/\b0X(?=[0-9A-F])/g, "0x");
}

/** Words as a file writes them: `&`, `<` and `>` escaped. */
export function escapeText(words: string): string {
	return words.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const noType = (k: Kit): never => {
	throw new Error(`the ${k.target} kit has no type: a glyph's words are HTML beside it (a GlyphTile's label or readout)`);
};

/**
 * One line of words at `(x, y)` — `y` is the BASELINE — in a voice:
 * `<text class="art-label" x y font-size [text-anchor] fill [transform]>`.
 * A size off the voice's steps throws, as does the glyph kit.
 */
export function text(k: Kit, x: number, y: number, words: string, o: TextOpts = {}): string {
	if (k.target === "glyph") noType(k);
	const { role = "label", anchor = "start", turn } = o;
	const size = o.size ?? VOICE_DEFAULT[role];
	if (!VOICE_SIZES[role].includes(size)) {
		throw new Error(`a ${role} is set at ${VOICE_SIZES[role].join(", ")} (got ${size})`);
	}
	const paint = o.paint ?? VOICE_PAINT[role];
	const attrs = [`class="art-${role}"`, `x="${round(x)}"`, `y="${round(y)}"`, `font-size="${size}"`];
	if (anchor !== "start") attrs.push(`text-anchor="${anchor}"`);
	attrs.push(`fill="${k.paint(paint)}"`);
	if (turn) attrs.push(`transform="rotate(${turn} ${round(x)} ${round(y)})"`);
	return `<text ${attrs.join(" ")}>${escapeText(words)}</text>`;
}

export interface RuleOpts {
	/** the dotted rule (dim, round-capped dots) rather than a solid hair */
	dotted?: boolean;
	/** ink for a solid rule, dim for a dotted one, unless said */
	paint?: Paint;
}

/** A horizontal rule from `x0` to `x1` at `y`: a solid hair in the ink, or `dotted` in the dim ink. */
export function rule(k: Kit, x0: number, x1: number, y: number, o: RuleOpts = {}): string {
	const { dotted = false } = o;
	const paint = o.paint ?? (dotted ? "dim" : "ink");
	return k.line(x0, y, x1, y, dotted ? { paint, weight: "hair", dash: "dotted" } : { paint, weight: "hair", cap: "butt" });
}

export interface SectionOpts {
	/** the label's paint; the ink unless said */
	paint?: Exclude<Paint, "none">;
	/** the label's size, a label step; 4.5 unless said */
	size?: TypeSize;
}

/** How far under a section's rule its label's cap line sits, in viewBox units. */
const SECTION_GAP = 2.5;

/**
 * A SECTION HEAD, as the infographic sets one: a dotted rule `w` long from
 * `(x, y)`, and the title in caps hanging under it at the rule's start.
 * The head is `sectionDepth(size)` deep, so the section's content starts
 * there under `y`.
 */
export function section(k: Kit, x: number, y: number, w: number, title: string, o: SectionOpts = {}): string {
	const size = o.size ?? 4.5;
	return [rule(k, x, x + w, y, { dotted: true }), text(k, x, y + SECTION_GAP + size * CAP, caps(title), { role: "label", size, paint: o.paint })].join("\n");
}

/** A caps line's cap height, in em (DM Sans, every cut: OS/2 sCapHeight 700/1000): where a baseline sits under a top edge. */
const CAP = 0.7;

/** How deep a section head is: the rule, the gap, the label's cap height. */
export const sectionDepth = (size: TypeSize = 4.5): number => round(SECTION_GAP + size * CAP);

export interface BracketOpts extends Omit<TextOpts, "role"> {}

/** A bracketed state, `[ ACTIVE ]`, in the label voice. */
export function bracketLabel(k: Kit, x: number, y: number, words: string, o: BracketOpts = {}): string {
	return text(k, x, y, `[ ${caps(words)} ]`, { ...o, role: "label" });
}

export interface ReadoutOpts {
	/** the big figure: a numeral's words (`45`, `007`, `14`) */
	value: string;
	/** a caps label above the numeral (the synth panel's FDBACK over 45) */
	label?: string;
	/** a caps caption: beside the numeral's top (the infographic's 14 SPEAKERS), or under it */
	caption?: string;
	/** where the caption sits: `right` of the numeral, level with its top (the default), or `below` it */
	captionAt?: "right" | "below";
	/** the numeral's size; 22 unless said */
	size?: TypeSize;
	/** the numeral's paint; the label and caption keep theirs */
	paint?: Exclude<Paint, "none">;
}

/**
 * A READOUT: the big thin numeral with its baseline at `(x, y)` (its start
 * at x), a caps label over it, a caption beside its top or under it. The
 * words the helpers set are cased by `caps`.
 */
export function readout(k: Kit, x: number, y: number, o: ReadoutOpts): string {
	const { value, label, caption, captionAt = "right", size = 22, paint } = o;
	const top = y - size * CAP;
	const out = [text(k, x, y, value, { role: "numeral", size, paint })];
	if (label) out.unshift(text(k, x, round(top - 3), caps(label), { role: "label", size: size >= 22 ? 4.5 : 3.5 }));
	if (caption) {
		const at = captionAt === "right"
			? { x: x + advance(value, "numeral", size) + size * 0.12, y: top + 4.5 * CAP }
			: { x, y: y + 3 + 3.5 * CAP };
		out.push(text(k, at.x, at.y, caps(caption), { role: "caption", size: captionAt === "right" ? 4.5 : 3.5, paint: "ink" }));
	}
	return out.join("\n");
}
