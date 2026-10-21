/**
 * The scene registry: every `src/scenes/<name>.svg` as raw text, read at
 * build (`import { sceneSvg } from "@whois/design-system/scenes"`). The
 * files are the whole contract — each is baked from
 * `tools/scenes/<name>/scene.ts` by `bun run scenes:bake` and carries the
 * header that says so (header.ts) — and `SCENE_NAMES` (names.ts) is the
 * same set as a type, which scenes.test.ts holds against the directory.
 * Scene.astro reads it; nothing here ships JS.
 */
import { bakedFrom } from "./header";
import { SCENE_NAMES, type SceneName } from "./names";

export { SCENE_NAMES, type SceneName };

const files = import.meta.glob<string>("./*.svg", {
	query: "?raw",
	import: "default",
	eager: true,
});

/** The raw SVG of a scene, for Scene to inline. */
export function sceneSvg(name: SceneName): string {
	const svg = files[`./${name}.svg`];
	if (!svg) throw new Error(`scenes: no file at src/scenes/${name}.svg`);
	return svg;
}

/** The credit a scene's header carries ("Natural Earth (public domain), via world-atlas 110m"), or undefined. */
export function sceneCredit(name: SceneName): string | undefined {
	return bakedFrom(sceneSvg(name))?.credit;
}
