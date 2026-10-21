// Post embeds: experiments built in their own repos (often private) and served
// from their own R2 bucket, `<project>-media.tristantimblin.dev`, under an
// immutable `v<version>/` prefix: the bundle at `v<version>/index.js`, its
// assets beside it. Nothing is installed here, and the site's CI needs no
// secrets. src/data/embeds.json pins each embed's version and host in one
// place, so an old post keeps rendering the version it was written against.
// <Embed> (src/components/Embed.astro) imports the bundle and calls its
// `mount(el, { assetBase }) => { destroy() }`.
import registry from "../data/embeds.json";

export interface EmbedEntry {
	/** The release, without the `v`: `0.1.0`. */
	version: string;
	/** The bucket's public origin, no trailing slash. */
	base: string;
	/** The module renders a still frame under prefers-reduced-motion. Without
	 *  one, a reader who asks for less motion keeps the poster. */
	stillFrame?: boolean;
}

export const EMBEDS: Record<string, EmbedEntry> = registry;

/** PUBLIC_EMBED_BASE points every embed at another origin laid out the same
 *  way (`<base>/v<version>/index.js`): a local stand-in for a preview build
 *  before a bucket's domain is attached. */
const OVERRIDE: string | undefined = import.meta.env?.PUBLIC_EMBED_BASE;

export interface ResolvedEmbed {
	/** The module URL to import(). */
	src: string;
	/** What mount() resolves the embed's assets against (trailing slash). */
	assetBase: string;
	stillFrame: boolean;
}

/** The module URL and asset base for a named embed. Throws on an unknown name, so a typo fails the build. */
export function embed(name: string): ResolvedEmbed {
	const entry = EMBEDS[name];
	if (!entry) throw new Error(`embed: "${name}" is not in src/data/embeds.json`);
	const base = (OVERRIDE ?? entry.base).replace(/\/+$/, "");
	const assetBase = `${base}/v${entry.version}/`;
	return { src: `${assetBase}index.js`, assetBase, stillFrame: entry.stillFrame ?? false };
}
