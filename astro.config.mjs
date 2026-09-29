// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { unified } from '@astrojs/markdown-remark';
import { rehypePostSections, remarkPostCode, shikiPostCode } from './src/lib/mdx/post-sections.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://tristantimblin.dev',
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
		// Keep noindex pages out of the sitemap: the scratch /vc-experiments page,
		// and the /txt category and tag lists (thin archive — the quilt and the
		// posts carry the content).
		sitemap({
			filter: (page) =>
				!page.includes('/vc-experiments') &&
				!page.includes('/txt/category/') &&
				!page.includes('/txt/tag/'),
		}),
	],
});
