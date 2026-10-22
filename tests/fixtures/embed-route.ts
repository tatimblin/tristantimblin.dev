import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "@playwright/test";
import registry from "../../src/data/embeds.json" with { type: "json" };

/**
 * Embed bundles live on other hosts (src/data/embeds.json: an R2 bucket, or
 * GitHub Pages), which CI must not depend on, so the embed specs route an embed's
 * asset base:
 *   - by default to tests/fixtures/embed-stub.js, a module with the same
 *     mount()/destroy() shape that draws a 2D canvas and counts its calls;
 *   - with PAINTERLY_DIST=<painterly-scene>/dist, painterly-scene's to the
 *     real built bundle and its textures, so the scene itself can be checked
 *     locally.
 */

type Entry = { version: string; base?: string; url?: string; entry?: string };
const EMBEDS: Record<string, Entry> = registry;

/** The URLs src/lib/embeds.ts builds from the registry (its unit test pins the
 *  shape; that module can't be loaded here). PUBLIC_EMBED_BASE is not applied. */
export function embedUrls(name: string): { assetBase: string; src: string } {
	const e = EMBEDS[name];
	if (!e) throw new Error(`embed-route: "${name}" is not in src/data/embeds.json`);
	const assetBase = e.url ?? `${e.base}/v${e.version}/`;
	return { assetBase, src: `${assetBase}${e.entry ?? "index.js"}` };
}

// painterly-scene's, which the existing specs use.
export const { assetBase, src } = embedUrls("painterly-scene");
export const realDist = process.env.PAINTERLY_DIST;

/** Serve an embed's URLs from a stub in this folder (embed-stub.js draws a
 *  canvas, embed-stub-dom.js DOM), or painterly's from a local dist; returns
 *  the URLs asked for. */
export async function serveEmbed(
	page: Page,
	name = "painterly-scene",
	stub: "embed-stub.js" | "embed-stub-dom.js" = "embed-stub.js",
): Promise<string[]> {
	const urls = embedUrls(name);
	const dist = name === "painterly-scene" ? realDist : undefined;
	const requests: string[] = [];
	await page.route(`${urls.assetBase}**`, async (route) => {
		const url = route.request().url();
		requests.push(url);
		const path = url.slice(urls.assetBase.length);
		const headers = { "access-control-allow-origin": "*" };
		if (dist) {
			try {
				const body = await readFile(join(dist, path));
				const contentType = path.endsWith(".js") ? "text/javascript" : "image/png";
				return route.fulfill({ body, contentType, headers });
			} catch {
				return route.fulfill({ status: 404, headers });
			}
		}
		if (url !== urls.src) return route.fulfill({ status: 404, headers });
		return route.fulfill({
			path: join(import.meta.dirname, stub),
			contentType: "text/javascript",
			headers,
		});
	});
	return requests;
}
