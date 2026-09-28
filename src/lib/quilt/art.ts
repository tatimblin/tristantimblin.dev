/**
 * The quilt's art, read at build: a post's SVG beside its source
 * (src/content/txt/<slug>.svg — the collection's glob is `*.{md,mdx}`, so
 * the files are invisible to it) and the package's fillers, as raw text for
 * ArtFrame to inline. Its own module rather than blog.ts because
 * content.config.ts imports blog.ts, and an eager glob of every artwork has
 * no business in the content layer's config.
 */

const postArt = import.meta.glob<string>("../../content/txt/*.svg", {
	query: "?raw",
	import: "default",
	eager: true,
});

const fillerArt = import.meta.glob<string>(
	"../../../packages/design-system/src/art/filler-*.svg",
	{ query: "?raw", import: "default", eager: true },
);

/** The raw SVG for a post, or null when it has none yet. */
export const artFor = (slug: string): string | null =>
	postArt[`../../content/txt/${slug}.svg`] ?? null;

/** The raw SVG of filler `n` (1-based, `filler-01.svg`). */
export function fillerArtFor(n: number): string {
	const key = `../../../packages/design-system/src/art/filler-${String(n).padStart(2, "0")}.svg`;
	const svg = fillerArt[key];
	if (!svg) throw new Error(`quilt: no filler art at ${key}`);
	return svg;
}
