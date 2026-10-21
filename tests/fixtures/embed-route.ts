import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import registry from "../../src/data/embeds.json" with { type: "json" };

/**
 * The Sutro bundle lives in its own R2 bucket (src/data/embeds.json), which CI
 * must not depend on, so the embed specs route the bucket's URL:
 *   - by default to tests/fixtures/embed-stub.js, a module with the same
 *     mount()/destroy() shape that draws a 2D canvas and counts its calls;
 *   - with PAINTERLY_DIST=<painterly-scene>/dist, to the real built bundle and
 *     its textures, so the scene itself can be checked locally.
 */

// The URLs src/lib/embeds.ts builds from the registry (its unit test pins the shape).
const { base, version } = registry["painterly-scene"];
export const assetBase = `${base}/v${version}/`;
export const src = `${assetBase}index.js`;
export const realDist = process.env.PAINTERLY_DIST;

/** Serve the bucket's URLs from the stub, or from a local painterly dist; returns the URLs asked for. */
export async function serveEmbed(page: Page): Promise<string[]> {
	const requests: string[] = [];
	await page.route(`${assetBase}**`, async (route) => {
		const url = route.request().url();
		requests.push(url);
		const path = url.slice(assetBase.length);
		const headers = { "access-control-allow-origin": "*" };
		if (realDist) {
			try {
				const body = await readFile(join(realDist, path));
				const contentType = path.endsWith(".js") ? "text/javascript" : "image/png";
				return route.fulfill({ body, contentType, headers });
			} catch {
				return route.fulfill({ status: 404, headers });
			}
		}
		if (url !== src) return route.fulfill({ status: 404, headers });
		return route.fulfill({
			path: join(import.meta.dirname, "embed-stub.js"),
			contentType: "text/javascript",
			headers,
		});
	});
	return requests;
}
