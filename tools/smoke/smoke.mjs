// Smoke test for a built site: serves dist/ with `astro preview` and checks that
// a handful of pages answer. CI runs it before every deploy, and it is the ONLY
// check a content or data push gets (the full Playwright suite runs for code
// changes; see .github/workflows/deploy.yml). It needs no browser.
//
//   bun run build && bun tools/smoke/smoke.mjs
//
// SMOKE_PORT picks the port (default 4450; 4321 is the dev server's).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = Number(process.env.SMOKE_PORT ?? 4450);
const BASE = `http://127.0.0.1:${PORT}`;

if (!existsSync("dist/index.html")) {
	console.error("smoke: dist/index.html is missing. Run `bun run build` first.");
	process.exit(1);
}

const server = spawn("bunx", ["--bun", "astro", "preview", "--port", String(PORT), "--host", "127.0.0.1"], {
	stdio: ["ignore", "ignore", "inherit"],
});

const failures = [];

async function waitForServer() {
	const deadline = Date.now() + 60_000;
	while (Date.now() < deadline) {
		if (server.exitCode !== null) throw new Error(`astro preview exited with ${server.exitCode}`);
		try {
			await fetch(BASE + "/");
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 250));
		}
	}
	throw new Error(`astro preview did not answer on ${BASE} within 60s`);
}

async function check(path, expectStatus, mustContain) {
	const res = await fetch(BASE + path);
	const body = await res.text();
	const ok = res.status === expectStatus && (!mustContain || body.includes(mustContain));
	console.log(`${ok ? "ok  " : "FAIL"} ${res.status} ${path}`);
	if (!ok) failures.push(`${path}: got ${res.status}, expected ${expectStatus}${mustContain ? ` containing ${JSON.stringify(mustContain)}` : ""}`);
	return body;
}

try {
	await waitForServer();
	await check("/", 200, "</html>");
	const txt = await check("/txt/", 200, "</html>");

	// Take a post from the /txt listing rather than hardcoding a slug, so a renamed
	// or unpublished post never fails the smoke test, and the listing's links get
	// checked on the way.
	const post = txt.match(/href="(\/txt\/(?!tag\/)[^"/]+\/)"/)?.[1];
	if (post) await check(post, 200, "</html>");
	else failures.push("/txt/: no post link found in the listing");

	await check("/this-page-does-not-exist-smoke/", 404);
} catch (err) {
	failures.push(String(err?.message ?? err));
} finally {
	server.kill();
}

if (failures.length) {
	console.error(`\nsmoke: ${failures.length} failure(s)\n  ${failures.join("\n  ")}`);
	process.exit(1);
}
console.log("\nsmoke: all checks passed");
process.exit(0);
