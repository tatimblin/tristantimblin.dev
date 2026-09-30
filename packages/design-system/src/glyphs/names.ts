/**
 * The glyph names — every `src/glyphs/<name>.svg`, baked or hand-drawn,
 * as a type. Its own module (no `import.meta.glob`, which only Vite
 * provides) so the registry test can hold it against the directory under
 * plain bun. glyphs.ts re-exports it; import from there.
 */
export const GLYPH_NAMES = ["plus", "ring-in", "toggle"] as const;

export type GlyphName = (typeof GLYPH_NAMES)[number];
