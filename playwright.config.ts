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
		{
			// FIREFOX RUNS ONE SPEC, deliberately. The lockup's scroll effects are CSS
			// scroll-progress timelines with a JS fallback for engines that lack them, and
			// Firefox IS that engine (153 reports the feature unsupported) — so the
			// fallback has no coverage at all from a Chromium-only suite. That is how it
			// shipped broken: the CSS gate correctly excluded Firefox and nothing was left
			// to drive the effect there.
			// Scoped to that one file rather than the whole suite because the rest measures
			// geometry against Chromium's exact layout and font rasterisation; running it
			// all in a second engine would be a much larger job for no extra safety here.
			name: "firefox",
			use: { ...devices["Desktop Firefox"] },
			testMatch: /scroll-fallback\.spec\.ts/,
		},
	],

	webServer: {
		// The root build: it copies the prebuilt fleet demo into public/ first.
		command: "bun run build && bunx --bun astro preview --port 4321",
		url: "http://localhost:4321",
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
