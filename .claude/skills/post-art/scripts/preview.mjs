// Preview art files the way ArtFrame renders them, without the site: the real
// token cascade and art-frame.css inlined into one page, each file at tile
// size (230px) and hero size (720px), on the dark page and the light page,
// with a play toggle for the motion. For a quick look at a file before it has
// a post, or when no dev server is running; /design-system/art#<slug> is the
// real thing.
//
//   bun .claude/skills/post-art/scripts/preview.mjs <file.svg…>                 // writes the page, prints its path
//   bun .claude/skills/post-art/scripts/preview.mjs --shot out.png <file.svg…>  // screenshots it (1440 wide, still)
//   bun .claude/skills/post-art/scripts/preview.mjs --sheet --shot out.png <files…>
//        // a contact sheet: every file at 230px, 4 across, dark page then light page
//   bun .claude/skills/post-art/scripts/preview.mjs --motion --shot out.png <file.svg>
//        // also shoots a mid-motion frame (out.motion.png) and prints the motion
//        // group's play-state, opacity and transform at rest vs playing
//   PREVIEW_PORT=4401 bun .claude/skills/post-art/scripts/preview.mjs --serve <file.svg…>   // serves it (default port 4399)
//
// --shot uses the `playwright` library already in the repo (headless
// Chromium), so it works when the Playwright MCP browser is locked by another
// session. Re-run after an edit (the page is a snapshot). With --serve it
// re-reads the files on every request, so a reload is enough.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const ds = resolve(root, "packages/design-system/src");

const args = process.argv.slice(2);
const flag = (name) => {
	const i = args.indexOf(name);
	if (i === -1) return false;
	args.splice(i, 1);
	return true;
};
const option = (name) => {
	const i = args.indexOf(name);
	if (i === -1) return null;
	const [, value] = args.splice(i, 2);
	return value;
};
const serve = flag("--serve");
const sheet = flag("--sheet");
const motion = flag("--motion");
const shot = option("--shot");
const files = args;
if (files.length === 0 || (motion && !shot)) {
	console.error(
		"usage: bun .claude/skills/post-art/scripts/preview.mjs [--serve | --shot <out.png> [--motion]] [--sheet] <file.svg…>",
	);
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

const THEMES = ["maximeheckel-dark", "maximeheckel-light"];
const cell = (svg, w) => `<div class="ds-art-frame" style="inline-size:${w}px">${svg}</div>`;
const label = (t) => `<p>${t.replace("maximeheckel-", "")}</p>`;

function rows() {
	return files
		.map((f) => {
			const svg = clean(read(f));
			const theme = (t) => `<div class="${t} side">${label(t)}${cell(svg, 230)}${cell(svg, 720)}</div>`;
			return `<section id="${basename(f, ".svg")}"><h2>${f}</h2><div class="themes">${THEMES.map(theme).join("")}</div></section>`;
		})
		.join("\n");
}

// The contact sheet: the set at quilt size, so a run of fillers can be judged
// together (colour rotation, weight, variety).
function contactSheet() {
	const svgs = files.map((f) => [basename(f, ".svg"), clean(read(f))]);
	const theme = (t) =>
		`<div class="${t} side">${label(t)}<div class="grid">${svgs
			.map(([name, svg]) => `<figure>${cell(svg, 230)}<figcaption>${name}</figcaption></figure>`)
			.join("")}</div></div>`;
	return `<div class="sheet">${THEMES.map(theme).join("")}</div>`;
}

function page() {
	return `<!doctype html><html class="maximeheckel-dark"><head><meta charset="utf-8"><title>Art preview</title>
<style>${tokens}\n${frame}
body{margin:0;padding:24px;font:14px/1.4 ui-monospace,monospace;background:#101010;color:#ccc}
.themes{display:flex;flex-wrap:wrap;gap:24px}.side{background:var(--background);color:var(--text-primary);padding:16px;display:flex;flex-direction:column;gap:16px;align-items:start}
.sheet{display:flex;flex-direction:column;gap:24px}.grid{display:grid;grid-template-columns:repeat(4,230px);gap:16px}
figure{margin:0;display:flex;flex-direction:column;gap:6px}figcaption{font-size:12px}
h2{font-size:14px;font-weight:400}p{margin:0}button{position:fixed;top:12px;right:12px;font:inherit}
</style></head><body>
<button onclick="document.querySelectorAll('.ds-art-frame').forEach(e=>e.toggleAttribute('data-art-play'))">play / pause</button>
${sheet ? contactSheet() : rows()}</body></html>`;
}

// What the motion group is doing, read from the first frame that has one.
const probe = () => {
	const g = document.querySelector(".ds-art-frame [data-motion]");
	if (!g) return null;
	const s = getComputedStyle(g);
	const dashed = g.querySelector("[stroke-dasharray]");
	return {
		kind: g.getAttribute("data-motion"),
		playState: s.animationPlayState,
		opacity: s.opacity,
		transform: s.transform,
		dashoffset: dashed ? getComputedStyle(dashed).strokeDashoffset : undefined,
	};
};

async function screenshot(out) {
	// Resolves from the repo's node_modules (this script lives in the repo).
	const { chromium } = await import("playwright");
	const browser = await chromium.launch();
	try {
		const tab = await browser.newPage({ viewport: { width: 1440, height: 900 } });
		// The button would float over the art in a full-page shot.
		await tab.setContent(page().replace(/<button[\s\S]*?<\/button>/, ""), { waitUntil: "load" });
		await tab.screenshot({ path: out, fullPage: true });
		console.log(out);
		if (!motion) return;

		const rest = await tab.evaluate(probe);
		if (!rest) {
			console.log("motion: this file has no data-motion group");
			return;
		}
		await tab.evaluate(() => document.querySelectorAll(".ds-art-frame").forEach((e) => e.setAttribute("data-art-play", "")));
		// Sample while it plays: a blink can land on lit, so look more than once.
		const samples = [];
		for (let i = 0; i < 6; i++) {
			await tab.waitForTimeout(260);
			samples.push(await tab.evaluate(probe));
		}
		const mid = out.replace(/\.png$/i, "") + ".motion.png";
		await tab.screenshot({ path: mid, fullPage: true });
		console.log(mid);

		const show = (p) =>
			`play-state ${p.playState}, opacity ${p.opacity}, transform ${p.transform}` +
			(p.dashoffset === undefined ? "" : `, dashoffset ${p.dashoffset}`);
		const key = (p) => `${p.opacity}|${p.transform}|${p.dashoffset}`;
		const moved = samples.some((p) => key(p) !== key(rest));
		console.log(`motion: ${rest.kind}`);
		console.log(`  at rest: ${show(rest)}`);
		console.log(`  playing: ${show(samples.at(-1))}`);
		console.log(`  paused at rest: ${rest.playState === "paused" ? "yes" : "NO"}`);
		console.log(`  moves when playing: ${moved ? "yes" : "NO (nothing changed across 6 samples)"}`);
	} finally {
		await browser.close();
	}
}

// Named after the files and on a settable port, so several sessions drawing
// different artworks at once never overwrite each other's preview.
if (serve) {
	const port = Number(process.env.PREVIEW_PORT) || 4399;
	Bun.serve({ port, fetch: () => new Response(page(), { headers: { "content-type": "text/html" } }) });
	console.log(`http://localhost:${port}/`);
} else if (shot) {
	await screenshot(resolve(shot));
} else {
	const name = (sheet ? "sheet-" : "") + files.map((f) => basename(f, ".svg")).join("+");
	const out = `/tmp/post-art-preview/${name}.html`;
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(out, page());
	console.log(out);
}
