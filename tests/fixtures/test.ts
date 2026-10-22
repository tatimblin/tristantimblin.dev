import { join } from "node:path";
import { test as base, chromium, expect, type BrowserContext } from "@playwright/test";

/** src/lib/media.ts's MEDIA_BASE (that module imports JSON in a form the runner can't load). */
export const MEDIA_BASE = "https://media.tristantimblin.dev";

/**
 * The suite's `test`: Playwright's, with the media bucket routed to a local
 * clip in every context. Every spec imports `test` from here, never from
 * @playwright/test directly.
 *
 * The pages stream their videos from the live R2 host
 * (https://media.tristantimblin.dev, src/lib/media.ts). Fetched for real, every
 * run of the suite would download the clips and land in the site's Cloudflare
 * stats. So each request for it is answered here: a `.webm` with
 * media-stub.webm, an `.mp4` with media-stub.mp4 (13 KB and 25 KB): the
 * fabric clip's real frames at its own 480×270, so the halftone specs that
 * measure pixels (dotgrid-theme, halftone-dpr) still see a believable picture,
 * slowed to ten seconds at 3 fps, so the carousel does not advance to its next
 * clip (and rewrite the caption) in the middle of a test. Every response
 * carries `x-media-stub: 1`, which tests/media-stub.spec.ts checks.
 *
 *   ffmpeg -i fabric.webm -an -vf "setpts=2*PTS,fps=3" -t 10 \
 *     -c:v libvpx-vp9 -b:v 0 -crf 45 media-stub.webm      (libx264 -crf 32 for the .mp4)
 */

const STUBS = {
	webm: { path: join(import.meta.dirname, "media-stub.webm"), contentType: "video/webm" },
	mp4: { path: join(import.meta.dirname, "media-stub.mp4"), contentType: "video/mp4" },
} as const;

export const MEDIA_PATTERN = `${MEDIA_BASE}/**`;

/** jsDelivr, where public embeds are served from (src/lib/embeds.ts). No spec
 *  reaches it: whatever a spec hasn't routed on its page itself (serveEmbed in
 *  tests/fixtures/embed-route.ts, which wins over this) gets a 404. */
export const JSDELIVR_PATTERN = "https://cdn.jsdelivr.net/**";

const routed = new WeakSet<BrowserContext>();

export async function routeMedia(context: BrowserContext): Promise<void> {
	if (routed.has(context)) return;
	routed.add(context);
	await context.route(MEDIA_PATTERN, (route) => {
		const { pathname } = new URL(route.request().url());
		const ext = pathname.slice(pathname.lastIndexOf(".") + 1) as keyof typeof STUBS;
		const headers = { "access-control-allow-origin": "*", "x-media-stub": "1" };
		const stub = STUBS[ext];
		if (!stub) return route.fulfill({ status: 404, headers });
		return route.fulfill({ path: stub.path, contentType: stub.contentType, headers });
	});
	await context.route(JSDELIVR_PATTERN, (route) =>
		route.fulfill({ status: 404, headers: { "access-control-allow-origin": "*", "x-media-stub": "1" } }),
	);
}

export const test = base.extend<{ mediaStub: void }, { mediaStubBrowser: void }>({
	// The contexts a spec makes itself (browser.newContext / newPage, for
	// reduced motion or no JavaScript) are routed too.
	mediaStubBrowser: [
		async ({ browser }, use) => {
			const newContext = browser.newContext.bind(browser);
			browser.newContext = async (options) => {
				const context = await newContext(options);
				await routeMedia(context);
				return context;
			};
			await use();
			browser.newContext = newContext;
		},
		{ scope: "worker", auto: true },
	],
	// The default context, for every test.
	mediaStub: [
		async ({ context }, use) => {
			await routeMedia(context);
			await use();
		},
		{ auto: true },
	],
});

export { chromium, expect };
export type * from "@playwright/test";
