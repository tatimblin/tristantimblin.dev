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

/** The preview server's port: PW_PORT, else 4460 — never 4321, the dev server's
    (with reuseExistingServer, a suite on 4321 would quietly test the dev server). */
const PORT = Number(process.env.PW_PORT ?? 4460);

export default defineConfig({
	testDir: "./tests",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",

	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "on-first-retry",
	},

	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
			testIgnore: /\/perf\//,
		},
		{
			// THE PERFORMANCE BUDGETS (tests/perf, numbers in tests/perf/budgets.ts;
			// theme/design-system/src/lib/WIDGETS.md explains each). Counts and
			// structure, not milliseconds, measured one page at a time: ONE worker,
			// so no other test's page competes for the CPU or the GPU process while
			// a budget is read. CI runs it as its own step after the layout suite.
			name: "perf",
			testDir: "./tests/perf",
			workers: 1,
			fullyParallel: false,
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
		command: `bun run build && bunx --bun astro preview --port ${PORT}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000,
	},
});
