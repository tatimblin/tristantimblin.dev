/**
 * A SCENE recipe and how it bakes. The top rung of the micrographics
 * ladder (L4): a scene is a whole illustration — a projected globe, a
 * sliced mesh, an exploded assembly — drawn by a source in
 * `tools/scenes/<name>/scene.ts` at the repo root, with the heavy
 * dependencies it needs (d3-geo, a mesh reader) as root devDependencies
 * that run at bake time and never ship. `bun run scenes:bake`
 * (scripts/bake-scenes.ts) runs the source through the scene kit and writes
 * `src/scenes/<name>.svg` under a header (header.ts), validated with the
 * scene profile; the registry (scenes.ts) reads only the baked file.
 *
 *   // tools/scenes/globe/scene.ts
 *   import { scene } from "@whois/design-system/scenes/recipe";
 *   export default scene({
 *     viewBox: "0 0 400 400",
 *     credit: "Natural Earth (public domain), via world-atlas 110m",
 *     async draw(k, ctx) {
 *       const land = JSON.parse(readFileSync(join(ctx.dir, "land.json"), "utf8"));
 *       return [k.ring(200, 200, 120, { paint: "none", fill: k.wash("blue", 22) }), k.path(d(land))];
 *     },
 *   });
 *
 * `draw` is the scene kit (`kit("scene")`: art's table — the --art-*
 * tokens, hair by default, art's dashes — plus the dot-dash, and
 * `k.wash()` for the one translucency) and a context that says where the
 * scene's own files are.
 * It may be async, for data. DETERMINISM is the contract: the same
 * sources give the same bytes — round every coordinate (the kit rounds
 * what it draws; a path `d` you build yourself rounds itself), never
 * Math.random or the clock — because the check compares bytes.
 *
 * FRESHNESS is a hash of the source directory in the header. The bake
 * re-runs every source and compares whole files; the registry test only
 * hashes the sources again and compares with the header, so it needs
 * none of the bake's dependencies and no time — a scene whose source or
 * data changed fails the suite until it is re-baked. What the hash cannot
 * see is a dependency's version (a d3-geo update that moves a coastline
 * by a tenth), which is what `bun run scenes:check` is for.
 *
 * Node-only: the loader reads the sources directory, so nothing that
 * ships imports this module.
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { type Kit, kit } from "../lib/micro";
import { type BakedHeader, bakedHeader } from "./header";

export { bakedFrom, bakedHeader, SCENES_SOURCE } from "./header";
export type { BakedHeader } from "./header";

/** The roots the scene profile allows: the post plate, or the square panel. */
export type SceneViewBox = "0 0 320 180" | "0 0 400 400";

export interface SceneContext {
	/** the scene's name — its directory's, and its file's */
	name: string;
	/** the absolute path of `tools/scenes/<name>/`: data and assets sit beside the source */
	dir: string;
	/** the viewBox's size, for placing things */
	width: number;
	height: number;
}

export interface SceneRecipe {
	viewBox: SceneViewBox;
	/**
	 * Who the data or asset is from, and its licence — "Natural Earth
	 * (public domain), via world-atlas 110m". Written into the file's
	 * header and shown on the page beside the scene. A scene drawn from
	 * nothing but the kit needs none.
	 */
	credit?: string;
	/** The drawing: element strings from the art kit, in paint order; async for data. */
	draw(k: Kit, ctx: SceneContext): string | readonly string[] | Promise<string | readonly string[]>;
}

/** A recipe, typed so an editor completes the kit and the context. */
export function scene(r: SceneRecipe): SceneRecipe {
	return r;
}

/** A source directory's hash: every file under it, path and bytes, in order. Sixteen hex digits of sha256. */
export function sourceHash(dir: string): string {
	const h = createHash("sha256");
	const walk = (d: string) => {
		for (const f of readdirSync(d).sort()) {
			const p = join(d, f);
			if (statSync(p).isDirectory()) walk(p);
			else h.update(relative(dir, p)).update("\0").update(readFileSync(p)).update("\0");
		}
	};
	walk(dir);
	return h.digest("hex").slice(0, 16);
}

/** A loaded source: its recipe and where it lives. */
export interface SceneSource {
	recipe: SceneRecipe;
	dir: string;
}

/** The file a scene bakes to: the header, then the scene kit's `svg()` on the recipe's viewBox. */
export async function bake(name: string, { recipe, dir }: SceneSource): Promise<string> {
	const k = kit("scene");
	const [, , w, h] = recipe.viewBox.split(/\s+/).map(Number);
	const children = await recipe.draw(k, { name, dir, width: w, height: h });
	const header: BakedHeader = { name, hash: sourceHash(dir), credit: recipe.credit };
	return `${bakedHeader(header)}\n${k.svg({ viewBox: recipe.viewBox, children })}`;
}

/** Every scene under `root` (`tools/scenes`): each `<name>/scene.ts`, by name, sorted. */
export async function loadScenes(root: string): Promise<Map<string, SceneSource>> {
	const out = new Map<string, SceneSource>();
	if (!existsSync(root)) return out;
	for (const name of readdirSync(root).sort()) {
		const dir = join(root, name);
		const file = join(dir, "scene.ts");
		if (!statSync(dir).isDirectory() || !existsSync(file)) continue;
		const mod = await import(pathToFileURL(file).href);
		const r = mod.default;
		if (!r || typeof r.draw !== "function" || typeof r.viewBox !== "string") {
			throw new Error(`tools/scenes/${name}/scene.ts: the default export must be a scene (\`scene({ viewBox, draw })\`)`);
		}
		out.set(name, { recipe: r as SceneRecipe, dir });
	}
	return out;
}
