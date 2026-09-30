/**
 * The glyph registry: every `src/glyphs/<name>.svg` as raw text, read at
 * build (`import { glyphSvg } from "@whois/design-system/glyphs"`). The
 * files are the whole contract — a baked one (from `recipes/<name>.ts`,
 * `bun run glyphs:bake`) and a hand-drawn one are the same here — and
 * `GLYPH_NAMES` (names.ts) is the same set as a type, which glyphs.test.ts
 * holds against the directory. Glyph.astro reads it; nothing here ships JS.
 */
import { GLYPH_NAMES, type GlyphName } from "./names";

export { GLYPH_NAMES, type GlyphName };

const files = import.meta.glob<string>("./*.svg", {
	query: "?raw",
	import: "default",
	eager: true,
});

/** The raw SVG of a glyph, for Glyph to inline. */
export function glyphSvg(name: GlyphName): string {
	const svg = files[`./${name}.svg`];
	if (!svg) throw new Error(`glyphs: no file at src/glyphs/${name}.svg`);
	return svg;
}
