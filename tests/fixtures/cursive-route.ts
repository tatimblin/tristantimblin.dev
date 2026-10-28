import { join } from "node:path";
import type { BrowserContext, Page, Route } from "@playwright/test";

/**
 * The cursive card loads <cursive-terminal> from the agent's host
 * (src/widgets/cursive/config.ts's CURSIVE_TERMINAL), and the element then
 * talks to the agent. CI must not depend on either, so every context answers
 * both agent hosts here (tests/fixtures/test.ts):
 *   - by default the bundle is tests/fixtures/cursive-terminal-stub.js and an
 *     empty stylesheet, and everything else on the hosts is a 404;
 *   - with CURSIVE_REAL=1 the real bundle is fetched, and the agent's API is
 *     called as if from the production site (the production agent refuses any
 *     other origin): the request goes out with `Origin: https://tristantimblin.dev`
 *     and the answer comes back allowed for the page's own origin.
 */

/** config.ts's constants (that module's import.meta.env can't load here). */
export const CURSIVE_TERMINAL = "https://agent.cursive.info/terminal/v1";
export const AGENT_HOSTS = ["https://agent.cursive.info/**", "https://staging.agent.cursive.info/**"];
export const realCursive = process.env.CURSIVE_REAL === "1";

const PROD_ORIGIN = "https://tristantimblin.dev";
const STUB = join(import.meta.dirname, "cursive-terminal-stub.js");
const CORS = { "access-control-allow-origin": "*" };

async function asProdSite(route: Route): Promise<void> {
	const request = route.request();
	const pageOrigin = request.headers()["origin"];
	if (request.method() === "OPTIONS") {
		return route.fulfill({
			status: 204,
			headers: {
				"access-control-allow-origin": pageOrigin ?? "*",
				"access-control-allow-credentials": "true",
				"access-control-allow-methods": "GET, POST, OPTIONS",
				"access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "content-type",
			},
		});
	}
	const response = await route.fetch({ headers: { ...request.headers(), origin: PROD_ORIGIN } });
	const headers = { ...response.headers() };
	if (pageOrigin) {
		headers["access-control-allow-origin"] = pageOrigin;
		headers["access-control-allow-credentials"] = "true";
	}
	return route.fulfill({ response, headers });
}

async function answer(route: Route): Promise<void> {
	const url = route.request().url();
	if (realCursive) {
		if (url.startsWith(`${CURSIVE_TERMINAL}.`) || url.includes("/terminal/")) return route.continue();
		return asProdSite(route);
	}
	if (url === `${CURSIVE_TERMINAL}.js`) return route.fulfill({ path: STUB, contentType: "text/javascript", headers: CORS });
	if (url === `${CURSIVE_TERMINAL}.css`) return route.fulfill({ body: "", contentType: "text/css", headers: CORS });
	return route.fulfill({ status: 404, headers: CORS });
}

/** Every context's default (tests/fixtures/test.ts). A page's own route wins over it. */
export async function routeCursive(target: BrowserContext | Page): Promise<void> {
	for (const pattern of AGENT_HOSTS) await target.route(pattern, answer);
}
