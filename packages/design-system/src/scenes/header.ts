/**
 * The header a baked scene starts with, read and written. Two comment
 * lines, both stripped on render (lib/inline-svg drops comments):
 *
 *   <!-- baked from tools/scenes/globe/scene.ts (sources 1a2b3c4d5e6f7a8b) — edit the source -->
 *   <!-- credit: Natural Earth (public domain), via world-atlas 110m -->
 *
 * The first names the source and carries a hash of everything in its
 * directory, which is how the registry test knows a baked file is fresh
 * without re-running the bake (recipe.ts, `sourceHash`); the second is the
 * credit the page shows beside the scene (Scene.astro reads it through the
 * registry). Pure string functions, no node imports, so the registry that
 * ships can use them.
 */

export interface BakedHeader {
	/** the source's path under `tools/scenes`, without `/scene.ts`: the scene's name */
	source: string;
	/** the file's name — the last segment of `source` */
	name: string;
	/** the hex hash of the source directory the file was baked from */
	hash: string;
	/** the credit line, when the recipe gave one */
	credit?: string;
}

/** Where the sources live, relative to the repo root. */
export const SCENES_SOURCE = "tools/scenes";

const FROM = /^\s*<!-- baked from tools\/scenes\/([\w-]+)\/scene\.ts \(sources ([0-9a-f]+)\) — edit the source -->/;
const CREDIT = /^\s*<!-- credit: (.+?) -->/m;

/** The header lines for a bake. */
export function bakedHeader({ source, hash, credit }: Omit<BakedHeader, "name">): string {
	const lines = [`<!-- baked from ${SCENES_SOURCE}/${source}/scene.ts (sources ${hash}) — edit the source -->`];
	if (credit) lines.push(`<!-- credit: ${credit.replace(/--/g, "—")} -->`);
	return lines.join("\n");
}

/** What a baked file's header says, or null for a file with no header. */
export function bakedFrom(source: string): BakedHeader | null {
	const m = FROM.exec(source);
	if (!m) return null;
	const credit = CREDIT.exec(source.slice(m[0].length, m[0].length + 1024))?.[1];
	const from = m[1];
	const name = from.slice(from.lastIndexOf("/") + 1);
	return credit ? { source: from, name, hash: m[2], credit } : { source: from, name, hash: m[2] };
}
