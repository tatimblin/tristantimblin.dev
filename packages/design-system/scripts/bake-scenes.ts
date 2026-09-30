// Bake the scenes: every tools/scenes/<name>/scene.ts at the repo root
// becomes src/scenes/<name>.svg through the scene kit (src/scenes/recipe.ts),
// under a header that names the source and hashes its directory. Each
// result is validated with the scene profile before anything is written,
// and a violation is exit 1 with nothing changed. A file in src/scenes/
// with no header is not the bake's and is never touched.
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
import { bake, bakedFrom, loadScenes, SCENES_SOURCE } from "../src/scenes/recipe";
import { PROFILES, validateSvg } from "./validate-art.mjs";

const SCENES = resolve(fileURLToPath(import.meta.url), "../../src/scenes");
const SOURCES = resolve(fileURLToPath(import.meta.url), "../../../..", SCENES_SOURCE);
const rel = (file: string) => relative(process.cwd(), file);

export async function main(args: string[]): Promise<number> {
	const check = args.includes("--check");
	const sources = await loadScenes(SOURCES);

	// Bake every source in memory and validate before touching the disk.
	const baked = new Map<string, string>();
	let bad = 0;
	for (const [name, source] of sources) {
		const svg = await bake(name, source);
		const violations = validateSvg(svg, { profile: PROFILES.scene, slug: name });
		if (violations.length) {
			bad++;
			console.log(`FAIL  ${SCENES_SOURCE}/${name}/scene.ts\n${violations.map((v) => `  ${v}`).join("\n")}`);
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
	for (const f of readdirSync(SCENES).filter((f) => f.endsWith(".svg")).sort()) {
		onDisk.set(f.replace(/\.svg$/, ""), readFileSync(resolve(SCENES, f), "utf8"));
	}

	let stale = 0;
	for (const [name, svg] of baked) {
		const file = resolve(SCENES, `${name}.svg`);
		const current = onDisk.get(name);
		if (current !== undefined && bakedFrom(current) === null) {
			console.error(`FAIL  ${rel(file)} has no baked header but ${SCENES_SOURCE}/${name}/scene.ts exists; keep one`);
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
		const file = resolve(SCENES, `${name}.svg`);
		const why = `baked from ${SCENES_SOURCE}/${from.name}/scene.ts, which is gone`;
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
