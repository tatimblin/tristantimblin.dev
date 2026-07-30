// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
	site: 'https://tristantimblin.dev',
	integrations: [
		// Keep the scratch /vc-experiments page out of the sitemap; it's also
		// noindex'd in its Layout usage so crawlers skip it entirely.
		sitemap({ filter: (page) => !page.includes('/vc-experiments') }),
	],
});
