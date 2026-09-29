// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';
import { rehypePostSections, remarkPostCode } from './src/lib/mdx/post-sections.ts';

// https://astro.build/config
export default defineConfig({
	site: 'https://tristantimblin.dev',
	markdown: {
		// Emit CSS-variable-driven token colors instead of a hardcoded theme, so
		// code blocks track the light/dark toggle and the design-system tokens.
		// The --astro-code-* variables are mapped to DS --token-* / surface tokens
		// in the design system's prose styles.
		shikiConfig: { theme: 'css-variables' },
		// The /txt posts are read on a ruled grid, cut into sections at each h2
		// (src/lib/mdx/post-sections.ts). Both halves run on every markdown file
		// and do nothing outside src/content/txt; the remark half only records
		// each fence's title before Shiki drops it, the rehype half (after Shiki,
		// before the tag → component mapping) makes the cut.
		remarkPlugins: [remarkPostCode],
		rehypePlugins: [rehypePostSections],
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
