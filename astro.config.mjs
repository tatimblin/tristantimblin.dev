// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import { rehypePostSections, remarkPostCode, shikiPostCode } from './src/lib/mdx/post-sections.ts';
import { contentDates } from './src/lib/content-dates.ts';

// Each post's and demo's last change, for its sitemap entry's lastmod.
const lastmod = contentDates();

// Each homepage widget's script (src/widgets/<name>/client.ts, a lazy entry
// of src/widgets/index.ts) is a chunk named after its widget,
// _astro/widget-<name>.<hash>.js, rather than one of eight "client" chunks:
// so a network panel, a budget or a test can tell which card loaded what.
// It renames the chunk and leaves the file name to Astro's own function.
const WIDGET_CLIENT = /\/src\/widgets\/([^/]+)\/client\.ts$/;
/** @type {import('vite').Plugin} */
const widgetChunkNames = {
	name: 'widget-chunk-names',
	apply: 'build',
	applyToEnvironment: (environment) => environment.name === 'client',
	outputOptions(options) {
		const base = options.chunkFileNames;
		if (typeof base !== 'function') return options;
		return {
			...options,
			chunkFileNames(chunk) {
				const widget = chunk.facadeModuleId?.match(WIDGET_CLIENT)?.[1];
				return base(widget ? { ...chunk, name: `widget-${widget}` } : chunk);
			},
		};
	},
};

// https://astro.build/config
export default defineConfig({
	site: 'https://tristantimblin.dev',
	// Every page is a directory (dist/<page>/index.html), which Cloudflare Pages
	// serves at the slashed URL and 308s the bare one to. So the site links,
	// canonicalises and serves one form: with the slash. The hrefs come from
	// src/lib/blog.ts (postHref, tagHref, TXT_HREF).
	trailingSlash: 'always',
	vite: { plugins: [widgetChunkNames] },
	markdown: {
		// Emit CSS-variable-driven token colors instead of a hardcoded theme, so
		// code blocks track the light/dark toggle and the design-system tokens.
		// The --astro-code-* variables are mapped to DS --token-* / surface tokens
		// in the design system's prose styles.
		// The transformer stamps each fence's `title="…"` meta on its <pre> as
		// data-title before Shiki drops the meta, for the sections plugin below
		// to read back (src/lib/mdx/post-sections.ts).
		shikiConfig: { theme: 'css-variables', transformers: [shikiPostCode] },
		// The unified processor, which MDX inherits, carrying the two plugins
		// that cut a /txt post into sections at each h2 for the ruled page
		// (src/lib/mdx/post-sections.ts). Both do nothing outside
		// src/content/txt. The remark half only moves a title written without
		// a language back into the fence's meta; the rehype half runs after
		// Shiki and before the tag → component mapping, and makes the cut. (Astro 7's
		// `markdown.remarkPlugins` / `rehypePlugins` and the same options on
		// `mdx({...})` are deprecated in favour of this.)
		processor: unified({
			remarkPlugins: [remarkPostCode],
			rehypePlugins: [rehypePostSections],
		}),
	},
	integrations: [
		// MDX for the /txt posts: lets each post map markdown elements (p, h2,
		// a, …) onto @whois/design-system components via <Content components={…}/>.
		mdx(),
		// Keep noindex pages out of the sitemap: the /txt tag lists (thin
		// archive — /txt and the posts carry the content), and the
		// workbenches, /dotgrid and /design-system.
		sitemap({
			filter: (page) => {
				const { pathname } = new URL(page);
				return (
					!pathname.startsWith('/txt/tag/') &&
					!pathname.startsWith('/dotgrid/') &&
					!pathname.startsWith('/design-system/')
				);
			},
			// A post or demo carries its `modified` (else `date`) as lastmod;
			// the other pages have no content date and go without.
			serialize: (item) => {
				const date = lastmod.get(new URL(item.url).pathname);
				return date ? { ...item, lastmod: date.toISOString() } : item;
			},
		}),
	],
});
