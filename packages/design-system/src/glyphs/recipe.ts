/**
 * A glyph RECIPE and how it bakes. The second rung of the micrographics
 * ladder: a recipe is a few lines composing the L0 kit (lib/micro), baked
 * into the committed `src/glyphs/<name>.svg` by `bun run glyphs:bake`
 * (scripts/bake-glyphs.ts). The registry (glyphs.ts) reads only the baked
 * file, so a baked glyph and a hand-drawn one sit side by side and nothing
 * downstream knows which is which; the bake tells them apart by the HEADER
 * comment it writes, and never touches a file without one.
 *
 *   // src/glyphs/recipes/dial.ts
 *   import { recipe } from "../recipe";
 *   export default recipe((k) => [
 *     k.ticksRadial(24, 18, 10, 13, 5, -120, 120, { weight: "hair", dash: "dash" }),
 *     k.needle(24, 18, 11, -35, { paint: "blue" }),
 *   ]);
 *
 * `bake(name, recipe)` is the whole transform — the script writes its
 * result and the registry test re-bakes in memory and compares, so a stale
 * file fails the suite. Node-only: the loader reads the recipes directory,
 * so nothing that ships imports this module.
 */

import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { type Kit, kit } from "../lib/micro";

/** The wide viewBoxes the glyph profile allows beside the 48×32 default. */
export type WideViewBox = "0 0 96 32" | "0 0 96 64";

export interface Recipe {
	/** A wide root (the profile's `0 0 96 32` / `0 0 96 64`); the kit's 48×32 unless said. */
	viewBox?: WideViewBox;
	/** The drawing: element strings from the glyph kit, in paint order. */
	draw(k: Kit): string | readonly string[];
}

/** A recipe from its draw function, or the whole object; typed so an editor completes the kit. */
export function recipe(r: Recipe | Recipe["draw"]): Recipe {
	return typeof r === "function" ? { draw: r } : r;
}

/** The header comment a baked file starts with; the bake identifies its own output by it. */
export const bakedHeader = (name: string): string => `baked from recipes/${name}.ts — edit the recipe`;

const HEADER = /^\s*<!-- baked from recipes\/([\w-]+)\.ts — edit the recipe -->/;

/** The recipe a baked file names in its header, or null for a hand-drawn file. */
export function bakedFrom(source: string): string | null {
	return HEADER.exec(source)?.[1] ?? null;
}

/** The file a recipe bakes to: the glyph kit's `svg()` under the header. */
export function bake(name: string, r: Recipe): string {
	const k = kit("glyph");
	return k.svg({ viewBox: r.viewBox, header: bakedHeader(name), children: r.draw(k) });
}

/** A recipe's name is its file's: `recipes/ring-in.ts` → `ring-in`. */
const nameOf = (file: string): string => basename(file, ".ts");

/** Every recipe in `dir` (`src/glyphs/recipes`), by name, sorted. */
export async function loadRecipes(dir: string): Promise<Map<string, Recipe>> {
	const files = readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).sort();
	const out = new Map<string, Recipe>();
	for (const file of files) {
		const mod = await import(pathToFileURL(join(dir, file)).href);
		const r = mod.default;
		if (!r || typeof r.draw !== "function") {
			throw new Error(`recipes/${file}: the default export must be a recipe (\`recipe((k) => …)\`)`);
		}
		out.set(nameOf(file), r as Recipe);
	}
	return out;
}
