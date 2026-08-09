import { defineConfig, devices } from "@playwright/test";

/**
 * Layout-invariant tests (see tests/hero-fold.spec.ts). The hero's fold arithmetic is
 * geometric and spans a viewport × content × preference matrix, so it can only be
 * confirmed by measuring real boxes in a real engine.
 *
 * Serves the BUILT site via `astro preview` rather than the dev server, for two
 * reasons: `astro dev` daemonizes itself in Astro 7 (it returns immediately, which
 * Playwright reads as "the web server exited early"), and testing the build is what
 * catches minification hazards — e.g. the scroll-timeline longhands in
 * stories-heading, which a minifier silently folds into an invalid shorthand.
 */
export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",

	use: {
		baseURL: "http://localhost:4321",
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],

	webServer: {
		command: "bunx --bun astro build && bunx --bun astro preview --port 4321",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
