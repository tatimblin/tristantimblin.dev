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
		// Keep the scratch /vc-experiments page out of the sitemap; it's also
		// noindex'd in its Layout usage so crawlers skip it entirely.
		sitemap({ filter: (page) => !page.includes('/vc-experiments') }),
	],
});
