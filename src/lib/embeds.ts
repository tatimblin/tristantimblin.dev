// Post embeds: experiments built in their own repos, `import()`ed at runtime
// from one of two kinds of host. Nothing is installed here, and the site's CI
// needs no secrets. src/data/embeds.json pins each embed's host (and, on R2,
// its version) in one place.
//
//   - R2 (`base`): the project's own bucket, `<project>-media.tristantimblin.dev`
//     (for a private repo), under an immutable `v<version>/` prefix: the bundle
//     at `v<version>/index.js`, its assets beside it. An old post keeps
//     rendering the version it was written against.
//   - A fixed URL (`url`): a public repo published as it is, e.g. by GitHub
//     Pages from its release tag (meetLolla's pages.yml): the bundle at
//     `<url><entry>`, its media at its usual repo paths. Pages serves only the
//     latest deployed tag at an unversioned URL, so `version` is informational
//     there: the release this site was last checked against.
//
// <Embed> (src/components/Embed.astro) imports the bundle and calls its
// `mount(el, { assetBase }) => { destroy() }`.
import registry from "../data/embeds.json";

export interface EmbedEntry {
	/** The release, without the `v`: `0.1.0`. */
	version: string;
	/** R2: the bucket's public origin, no trailing slash. */
	base?: string;
	/** A fixed published URL, with a trailing slash: the asset base as it is. */
	url?: string;
	/** The module's path under the asset base; `index.js` by default. */
	entry?: string;
	/** The module renders a still frame under prefers-reduced-motion. Without
	 *  one (or `reducedMotion`), a reader who asks for less motion keeps the poster. */
	stillFrame?: boolean;
	/** `mount`: the module honours prefers-reduced-motion itself (it runs with
	 *  its motion off), so it mounts as usual instead of keeping the poster. */
	reducedMotion?: "mount";
	/** The module needs WebGL (the default); `false` lets it mount without. */
	webgl?: boolean;
	/** The touch-action a demo page (/demo/<slug>) passes to mount(): `none` by
	 *  default, so a finger drags in the scene; `auto` for a module that
	 *  scrolls inside its own root. */
	touchAction?: string;
}

export const EMBEDS = registry as Record<string, EmbedEntry>;

/** PUBLIC_EMBED_BASE points every R2 embed at another origin laid out the same
 *  way (`<base>/v<version>/index.js`): a local stand-in for a preview build
 *  before a bucket's domain is attached. `url` embeds ignore it. */
const OVERRIDE: string | undefined = import.meta.env?.PUBLIC_EMBED_BASE;

export interface ResolvedEmbed {
	/** The module URL to import(). */
	src: string;
	/** What mount() resolves the embed's assets against (trailing slash). */
	assetBase: string;
	stillFrame: boolean;
	reducedMotion?: "mount";
	webgl: boolean;
	touchAction?: string;
}

/** The module URL and asset base for a named embed. Throws on an unknown name, so a typo fails the build. */
export function embed(name: string): ResolvedEmbed {
	const entry = EMBEDS[name];
	if (!entry) throw new Error(`embed: "${name}" is not in src/data/embeds.json`);
	if (Boolean(entry.base) === Boolean(entry.url)) {
		throw new Error(`embed: "${name}" needs exactly one of \`base\` (R2) or \`url\``);
	}
	const assetBase = entry.url ?? `${(OVERRIDE ?? entry.base!).replace(/\/+$/, "")}/v${entry.version}/`;
	return {
		src: `${assetBase}${entry.entry ?? "index.js"}`,
		assetBase,
		stillFrame: entry.stillFrame ?? false,
		reducedMotion: entry.reducedMotion,
		webgl: entry.webgl ?? true,
		touchAction: entry.touchAction,
	};
}
