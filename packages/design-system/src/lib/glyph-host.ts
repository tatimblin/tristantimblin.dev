/**
 * The props every micrographic host shares — Glyph's, and every generator
 * component's (Wave, Envelope, Filter, Curve, …), all of which render
 * through GlyphSvg.astro. A .ts so a component's Props can extend it
 * (Astro's frontmatter exports no types).
 */

/** The mark's height on the space scale, numbered as Icon's size is: 6 is 32px (the 48×32 viewBox at 1×), 10 is 2×, 12 is 3×. */
export type GlyphSize = 6 | 8 | 10 | 12;

export interface GlyphHostProps {
	/** The mark's height, a step on the space scale; 1em (in text) unless said. */
	size?: GlyphSize;
	/** Accessible name: renders role="img" aria-label (or the role passed in the rest, for a meter). Without one the mark is aria-hidden. */
	label?: string;
	/** Motion running from the start, not only under the pointer (data-art-play, the art's attribute). */
	play?: boolean;
	class?: string;
	[key: string]: unknown;
}
