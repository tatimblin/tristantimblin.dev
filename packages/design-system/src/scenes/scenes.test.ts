/**
 * The scene registry against the directory: SCENE_NAMES is exactly the set
 * of files, every file passes the scene profile (with its name as the id
 * prefix), every file is baked (it has the header, and names itself), the
 * header's hash is the hash of `tools/scenes/<name>/` today, and every
 * source has been baked. `bun run test:unit`.
 *
 * Freshness is the HASH, not a re-bake: a scene's source pulls the heavy
 * root devDependencies (d3-geo, a mesh reader) and its data, which this
 * suite should neither load nor wait for. So a changed source or data
 * file fails here at once, and `bun run scenes:check` — which does re-bake
 * — is the gate for the case the hash cannot see, a dependency's version.
 * The directory is read with fs — the registry's `import.meta.glob` is
 * Vite's, and this runs under plain bun.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROFILES, validateSvg } from "../../scripts/validate-art.mjs";
import { bakedFrom, SCENES_SOURCE, sourceHash } from "./recipe";
import { SCENE_NAMES } from "./names";

const DIR = import.meta.dir;
const SOURCES = resolve(DIR, "../../../..", SCENES_SOURCE);
const files = readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort();
const nameOf = (f: string) => f.replace(/\.svg$/, "");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const sources = existsSync(SOURCES)
	? readdirSync(SOURCES).filter((d) => existsSync(join(SOURCES, d, "scene.ts"))).sort()
	: [];

describe("the registry", () => {
	test("SCENE_NAMES is exactly the set of .svg files", () => {
		expect([...SCENE_NAMES].sort()).toEqual(files.map(nameOf).sort());
	});

	test("no name repeats", () => {
		expect(new Set(SCENE_NAMES).size).toBe(SCENE_NAMES.length);
	});

	test("there are scenes to check", () => {
		expect(files.length).toBeGreaterThan(0);
	});
});

describe("every file passes the scene profile", () => {
	for (const f of files) {
		test(f, () => {
			const violations = validateSvg(read(f), { profile: PROFILES.scene, slug: nameOf(f) });
			expect(violations, violations.join("\n")).toEqual([]);
		});
	}
});

describe("every file is baked, and fresh", () => {
	for (const f of files) {
		const source = read(f);
		const from = bakedFrom(source);
		test(`${f} carries the baked header and names itself`, () => {
			expect(from, `${f} has no baked header; a scene is always baked from ${SCENES_SOURCE}/<name>/scene.ts`).not.toBeNull();
			expect(from!.name).toBe(nameOf(f));
		});
		test(`${f} is baked from ${SCENES_SOURCE}/${nameOf(f)}/ as it is today`, () => {
			const dir = join(SOURCES, nameOf(f));
			expect(existsSync(join(dir, "scene.ts")), `${f} says it was baked from ${SCENES_SOURCE}/${nameOf(f)}/scene.ts, which does not exist (orphaned; \`bun run scenes:bake\`)`).toBe(true);
			expect(from?.hash, `${f} is stale: ${SCENES_SOURCE}/${nameOf(f)}/ changed since it was baked (\`bun run scenes:bake\`)`).toBe(sourceHash(dir));
		});
	}

	test("every source has been baked", () => {
		for (const name of sources) {
			expect(files, `${SCENES_SOURCE}/${name}/scene.ts has no ${name}.svg (\`bun run scenes:bake\`)`).toContain(`${name}.svg`);
		}
	});

	test("a credit in the header reads back", () => {
		const globe = read("globe.svg");
		expect(bakedFrom(globe)?.credit).toBe("Natural Earth (public domain), via world-atlas 110m");
	});
});
