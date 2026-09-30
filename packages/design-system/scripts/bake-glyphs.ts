// Bake the glyph recipes: every src/glyphs/recipes/<name>.ts becomes
// src/glyphs/<name>.svg through the glyph kit (src/glyphs/recipe.ts), under
// a header comment that marks the file as baked. Each result is validated
// with the glyph profile before anything is written, and a violation is
// exit 1 with nothing changed. Hand-drawn glyphs — a .svg with no header —
// are never touched.
//
//   bun run glyphs:bake            write what is stale; remove a baked file whose recipe is gone
//   bun run glyphs:check           exit 1 if any baked file is stale or orphaned, writing nothing
//
// The registry test (src/glyphs/glyphs.test.ts) makes the same comparison
// under `bun run test:unit`, so a stale bake cannot pass the suite.

import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bake, bakedFrom, loadRecipes } from "../src/glyphs/recipe";
import { PROFILES, validateSvg } from "./validate-art.mjs";

const GLYPHS = resolve(fileURLToPath(import.meta.url), "../../src/glyphs");
const RECIPES = join(GLYPHS, "recipes");
const rel = (file: string) => relative(process.cwd(), file);

export async function main(args: string[]): Promise<number> {
	const check = args.includes("--check");
	const recipes = await loadRecipes(RECIPES);

	// Bake every recipe in memory and validate before touching the disk.
	const baked = new Map<string, string>();
	let bad = 0;
	for (const [name, r] of recipes) {
		const svg = bake(name, r);
		const violations = validateSvg(svg, { profile: PROFILES.glyph, slug: name });
		if (violations.length) {
			bad++;
			console.log(`FAIL  recipes/${name}.ts\n${violations.map((v) => `  ${v}`).join("\n")}`);
			continue;
		}
		baked.set(name, svg);
	}
	if (bad) {
		console.error(`${bad} recipe${bad === 1 ? "" : "s"} failed the glyph profile; nothing written`);
		return 1;
	}

	// The files on disk, split by their header: baked (ours) or hand-drawn (not).
	const onDisk = new Map<string, string>();
	for (const f of readdirSync(GLYPHS).filter((f) => f.endsWith(".svg")).sort()) {
		onDisk.set(f.replace(/\.svg$/, ""), readFileSync(join(GLYPHS, f), "utf8"));
	}

	let stale = 0;
	for (const [name, svg] of baked) {
		const file = join(GLYPHS, `${name}.svg`);
		const current = onDisk.get(name);
		if (current !== undefined && bakedFrom(current) === null) {
			console.error(`FAIL  ${rel(file)} is hand-drawn (no baked header) but recipes/${name}.ts exists; keep one`);
			return 1;
		}
		if (current === svg) {
			console.log(`ok    ${rel(file)}`);
			continue;
		}
		stale++;
		if (check) {
			console.log(`STALE ${rel(file)} (${current === undefined ? "not baked yet" : "differs from its recipe"})`);
		} else {
			writeFileSync(file, svg);
			console.log(`baked ${rel(file)}`);
		}
	}

	// A baked file whose recipe is gone is derived output with no source.
	let orphaned = 0;
	for (const [name, source] of onDisk) {
		const from = bakedFrom(source);
		if (from === null || baked.has(name)) continue;
		orphaned++;
		const file = join(GLYPHS, `${name}.svg`);
		if (check) {
			console.log(`ORPHAN ${rel(file)} (baked from recipes/${from}.ts, which is gone)`);
		} else {
			unlinkSync(file);
			console.log(`removed ${rel(file)} (baked from recipes/${from}.ts, which is gone)`);
		}
	}

	if (check && (stale || orphaned)) {
		console.error(`${stale} stale, ${orphaned} orphaned; run \`bun run glyphs:bake\``);
		return 1;
	}
	return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
	process.exitCode = await main(process.argv.slice(2));
}
