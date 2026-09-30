/**
 * The placeholder palette of the hand-vector route: one hex per scene
 * paint, for an illustrator to draw with in Figma or Illustrator, which
 * the importer (import-vector.ts) swaps for the `var(--art-*)` token. The
 * designer never sees a token; the file never ships a hex.
 *
 * Each hex is the token's dark-theme colour moved one step off in every
 * channel, so the artboard LOOKS like the scene will while the values
 * stay ones nobody types by accident (and a pasted real token hex, one
 * step away, is refused with this swatch named as the nearest). The
 * wash is not a swatch: it is a colour swatch at a fill opacity of 25% or
 * less. The PLATE is a swatch only so the artboard's background rect can
 * be recognised and dropped — the frame paints the plate, a file never
 * does.
 *
 * Documented for the designer in ../SWATCHES.md; the importable sheet is
 * ../swatches.svg. import-vector.test.ts holds all three together.
 */

export interface Swatch {
	/** the name the designer sees in the swatch sheet */
	readonly name: string;
	/** the placeholder, `#rrggbb`, lower case */
	readonly hex: string;
	/** what the importer writes: the paint, or null for the plate (dropped) */
	readonly paint: string | null;
	/** a colour that may be washed (a fill at ≤ 25% opacity) */
	readonly washable: boolean;
	/** what it is for, in the sheet and the docs */
	readonly role: string;
}

export const SWATCHES: readonly Swatch[] = Object.freeze([
	{ name: "ink", hex: "#f6f5eb", paint: "var(--art-ink)", washable: false, role: "the line work, the white faces" },
	{ name: "ink-2", hex: "#8b8a86", paint: "var(--art-ink-2)", washable: false, role: "the dimmed ink: guides, back edges (the one dimming)" },
	{ name: "lavender", hex: "#bca2e9", paint: "var(--art-lavender)", washable: true, role: "a fill colour" },
	{ name: "coral", hex: "#ee5b2e", paint: "var(--art-coral)", washable: true, role: "a fill colour (the accent)" },
	{ name: "cyan", hex: "#5a8cee", paint: "var(--art-cyan)", washable: true, role: "a fill colour (the kit's blue)" },
	{ name: "green", hex: "#5de17e", paint: "var(--art-green)", washable: true, role: "a fill colour (the console's phosphor)" },
	{ name: "plate", hex: "#17161c", paint: null, role: "the artboard's background only: dropped", washable: false },
]);

/** A swatch by its hex (`#rrggbb`, lower case). */
export const BY_HEX: ReadonlyMap<string, Swatch> = new Map(SWATCHES.map((s) => [s.hex, s]));

/** The most a wash may mix a colour to, in percent — the scene profile's limit. */
export const WASH_MAX = 25;

/** The drawable swatch nearest a colour, by RGB distance — named in an unmapped-colour error. */
export function nearestSwatch(hex: string): Swatch {
	const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
	const [r, g, b] = rgb(hex);
	let best = SWATCHES[0];
	let bestD = Infinity;
	for (const s of SWATCHES) {
		if (s.paint === null) continue; // never suggest the plate
		const [sr, sg, sb] = rgb(s.hex);
		const d = (r - sr) ** 2 + (g - sg) ** 2 + (b - sb) ** 2;
		if (d < bestD) {
			bestD = d;
			best = s;
		}
	}
	return best;
}
