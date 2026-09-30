// Bake the scenes: every tools/scenes/<name>/scene.ts at the repo root
// becomes src/scenes/<name>.svg through the scene kit (src/scenes/recipe.ts),
// under a header that names the source and hashes its directory. Each
// result is validated with the scene profile before anything is written,
// and a violation is exit 1 with nothing changed. A file in src/scenes/
// with no header is not the bake's and is never touched.
//
// The POSTS collection bakes the same way to the site's post art: every
// tools/scenes/posts/<slug>/scene.ts becomes src/content/txt/<slug>.svg —
// the file the quilt and the post page load — on the plate (a post's art
// is 320×180), under the same header. A hand-drawn post art there has no
// header and is never touched; a baked one whose source is gone is removed
// like any orphan (and the post-art spec then says the post has no art).
//
//   bun run scenes:bake            write what is stale; remove a baked file whose source is gone
//   bun run scenes:check           exit 1 if any baked file is stale or orphaned, writing nothing
//
// It lives here, beside bake-glyphs.ts and the validator, because what it
// writes and what it validates are the package's: the sources are the
// site's (tools/scenes/, with the heavy root devDependencies they need),
// the output is the design system's registry. The check re-runs every
// source, so it catches what the registry test's hash cannot — a
// dependency whose new version draws differently. The scenes are committed;
// the site's build does not bake.

import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bake, bakedFrom, loadScenes, POST_SCENES, SCENES_SOURCE, type SceneSource } from "../src/scenes/recipe";
import { PROFILES, VIEWBOX, validateSvg } from "./validate-art.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../../../..");
const SCENES = resolve(fileURLToPath(import.meta.url), "../../src/scenes");
const SOURCES = resolve(ROOT, SCENES_SOURCE);
/** Where a post's art lives: the collection's own directory, beside the post. */
export const POST_ART = "src/content/txt";
const rel = (file: string) => relative(process.cwd(), file);

/** One bake: a set of sources and the directory their files go to. */
interface Collection {
	sources: Map<string, SceneSource>;
	out: string;
	/** a post's art is the plate; a package scene is the plate or the panel */
	plateOnly: boolean;
}

export async function main(args: string[]): Promise<number> {
	const check = args.includes("--check");
	const collections: Collection[] = [
		{ sources: await loadScenes(SOURCES), out: SCENES, plateOnly: false },
		{ sources: await loadScenes(SOURCES, POST_SCENES), out: resolve(ROOT, POST_ART), plateOnly: true },
	];
	let code = 0;
	for (const c of collections) code = Math.max(code, await bakeCollection(c, check));
	return code;
}

async function bakeCollection({ sources, out, plateOnly }: Collection, check: boolean): Promise<number> {
	// Bake every source in memory and validate before touching the disk.
	const baked = new Map<string, string>();
	let bad = 0;
	for (const [name, source] of sources) {
		const svg = await bake(source);
		const violations = validateSvg(svg, { profile: PROFILES.scene, slug: name });
		if (plateOnly && source.recipe.viewBox !== VIEWBOX) {
			violations.push(`root: <svg> line 1: a post's art is the plate, viewBox "${VIEWBOX}" (got "${source.recipe.viewBox}"); the frame and the quilt's cells are 16:9`);
		}
		if (violations.length) {
			bad++;
			console.log(`FAIL  ${SCENES_SOURCE}/${source.source}/scene.ts\n${violations.map((v) => `  ${v}`).join("\n")}`);
			continue;
		}
		baked.set(name, svg);
	}
	if (bad) {
		console.error(`${bad} scene${bad === 1 ? "" : "s"} failed the scene profile; nothing written`);
		return 1;
	}

	// The files on disk, split by their header: baked (ours) or not.
	const onDisk = new Map<string, string>();
	for (const f of readdirSync(out).filter((f) => f.endsWith(".svg")).sort()) {
		onDisk.set(f.replace(/\.svg$/, ""), readFileSync(resolve(out, f), "utf8"));
	}

	let stale = 0;
	for (const [name, svg] of baked) {
		const file = resolve(out, `${name}.svg`);
		const current = onDisk.get(name);
		if (current !== undefined && bakedFrom(current) === null) {
			console.error(`FAIL  ${rel(file)} has no baked header but ${SCENES_SOURCE}/${sources.get(name)!.source}/scene.ts exists; keep one`);
			return 1;
		}
		if (current === svg) {
			console.log(`ok    ${rel(file)} (${Buffer.byteLength(svg)} bytes)`);
			continue;
		}
		stale++;
		if (check) {
			console.log(`STALE ${rel(file)} (${current === undefined ? "not baked yet" : "differs from its source"})`);
		} else {
			writeFileSync(file, svg);
			console.log(`baked ${rel(file)} (${Buffer.byteLength(svg)} bytes)`);
		}
	}

	// A baked file whose source is gone is derived output with no source.
	let orphaned = 0;
	for (const [name, source] of onDisk) {
		const from = bakedFrom(source);
		if (from === null || baked.has(name)) continue;
		orphaned++;
		const file = resolve(out, `${name}.svg`);
		const why = `baked from ${SCENES_SOURCE}/${from.source}/scene.ts, which is gone`;
		if (check) {
			console.log(`ORPHAN ${rel(file)} (${why})`);
		} else {
			unlinkSync(file);
			console.log(`removed ${rel(file)} (${why})`);
		}
	}

	if (check && (stale || orphaned)) {
		console.error(`${stale} stale, ${orphaned} orphaned; run \`bun run scenes:bake\``);
		return 1;
	}
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	process.exitCode = await main(process.argv.slice(2));
}
