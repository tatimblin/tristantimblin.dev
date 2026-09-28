// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
	site: 'https://tristantimblin.dev',
	markdown: {
		// Emit CSS-variable-driven token colors instead of a hardcoded theme, so
		// code blocks track the light/dark toggle and the design-system tokens.
		// The --astro-code-* variables are mapped to DS --token-* / surface tokens
		// in TxtPostLayout's prose styles.
		shikiConfig: { theme: 'css-variables' },
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
