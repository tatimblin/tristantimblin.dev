/**
 * The glyph registry against the directory: GLYPH_NAMES is exactly the set
 * of files, every file passes the glyph profile, every baked file is what
 * its recipe bakes today (re-baked in memory), and every recipe has been
 * baked. `bun run test:unit`. The directory is read with fs — the registry's
 * `import.meta.glob` is Vite's, and this runs under plain bun.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROFILES, validateSvg } from "../../scripts/validate-art.mjs";
import { GLYPH_NAMES } from "./names";
import { bake, bakedFrom, loadRecipes } from "./recipe";

const DIR = import.meta.dir;
const files = readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort();
const nameOf = (f: string) => f.replace(/\.svg$/, "");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const recipes = await loadRecipes(join(DIR, "recipes"));

describe("the registry", () => {
	test("GLYPH_NAMES is exactly the set of .svg files", () => {
		expect([...GLYPH_NAMES].sort()).toEqual(files.map(nameOf).sort());
	});

	test("no name repeats", () => {
		expect(new Set(GLYPH_NAMES).size).toBe(GLYPH_NAMES.length);
	});

	test("there are glyphs to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});
});

describe("every file passes the glyph profile", () => {
	for (const f of files) {
		test(f, () => {
			const violations = validateSvg(read(f), { profile: PROFILES.glyph });
			expect(violations, violations.join("\n")).toEqual([]);
		});
	}
});

describe("baked files are fresh", () => {
	for (const f of files) {
		const source = read(f);
		const from = bakedFrom(source);
		if (from === null) continue;
		test(`${f} is what recipes/${from}.ts bakes`, () => {
			const r = recipes.get(from);
			expect(r, `${f} says it was baked from recipes/${from}.ts, which does not exist (orphaned; \`bun run glyphs:bake\`)`).toBeDefined();
			expect(source).toBe(bake(from, r!));
		});
	}

	test("a baked file names its own recipe", () => {
		for (const f of files) {
			const from = bakedFrom(read(f));
			if (from !== null) expect(from).toBe(nameOf(f));
		}
	});

	test("every recipe has been baked", () => {
		for (const name of recipes.keys()) {
			expect(files, `recipes/${name}.ts has no ${name}.svg (\`bun run glyphs:bake\`)`).toContain(`${name}.svg`);
		}
	});
});
