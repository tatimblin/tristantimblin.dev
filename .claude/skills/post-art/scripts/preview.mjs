// Preview art files the way ArtFrame renders them, without the site: the real
// token cascade and art-frame.css inlined into one page, each file at tile
// size (230px) and hero size (720px), on the dark page and the light page,
// with a play toggle for the motion. For when /design-system/art does not
// exist yet, or you want to look at a file before it has a post.
//
//   bun .claude/skills/post-art/scripts/preview.mjs <file.svg…>            // writes the page, prints its path
//   bun .claude/skills/post-art/scripts/preview.mjs --serve <file.svg…>    // and serves it on http://localhost:4399/
//
// Re-run after an edit (the page is a snapshot). With --serve it re-reads the
// files on every request, so a reload is enough.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ds = resolve(root, "packages/design-system/src");
const args = process.argv.slice(2);
const serve = args.includes("--serve");
const files = args.filter((a) => a !== "--serve");
if (files.length === 0) {
	console.error("usage: bun .claude/skills/post-art/scripts/preview.mjs [--serve] <file.svg…>");
	process.exit(2);
}

const read = (p) => readFileSync(p, "utf8");
// tokens/index.css is three @imports; inline them in order.
const tokens = ["tokens.generated.css", "tokens.overrides.css", "bridge.css"]
	.map((f) => read(resolve(ds, "tokens", f)))
	.join("\n");
const frame = read(resolve(ds, "styles/art-frame.css"));

const clean = (svg) =>
	svg
		.replace(/<\?xml[\s\S]*?\?>/g, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.replace(/<svg\b/, '<svg aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice"')
		.trim();

function page() {
	const rows = files
		.map((f) => {
			const svg = clean(read(f));
			const cell = (w) => `<div class="ds-art" style="inline-size:${w}px">${svg}</div>`;
			const theme = (t) =>
				`<div class="${t} side"><p>${t.replace("maximeheckel-", "")}</p>${cell(230)}${cell(720)}</div>`;
			return `<section id="${basename(f, ".svg")}"><h2>${f}</h2><div class="themes">${theme("maximeheckel-dark")}${theme("maximeheckel-light")}</div></section>`;
		})
		.join("\n");
	return `<!doctype html><html class="maximeheckel-dark"><head><meta charset="utf-8"><title>Art preview</title>
<style>${tokens}\n${frame}
body{margin:0;padding:24px;font:14px/1.4 ui-monospace,monospace;background:#101010;color:#ccc}
.themes{display:flex;flex-wrap:wrap;gap:24px}.side{background:var(--background);color:var(--text-primary);padding:16px;display:flex;flex-direction:column;gap:16px;align-items:start}
h2{font-size:14px;font-weight:400}p{margin:0}button{position:fixed;top:12px;right:12px;font:inherit}
</style></head><body>
<button onclick="document.querySelectorAll('.ds-art').forEach(e=>e.toggleAttribute('data-art-play'))">play / pause</button>
${rows}</body></html>`;
}

if (serve) {
	Bun.serve({ port: 4399, fetch: () => new Response(page(), { headers: { "content-type": "text/html" } }) });
	console.log("http://localhost:4399/");
} else {
	const out = "/tmp/post-art-preview/index.html";
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, page());
	console.log(out);
}
