// Media (videos, for now) lives in the R2 bucket tristantimblin-dev-media, not
// in the repo. src/data/media.json maps each logical name ("videos/fabric.mp4",
// its path under the gitignored media/ directory) to an immutable, hash-named
// key; `bun run media:push` uploads new files and rewrites it. See
// tools/media/README.md.
import manifest from "../data/media.json";

/** Where the bucket is served. PUBLIC_MEDIA_BASE overrides it (no trailing slash). */
export const MEDIA_BASE: string = import.meta.env?.PUBLIC_MEDIA_BASE ?? "https://media.tristantimblin.dev";

const keys: Record<string, string> = manifest;

/** The public URL for a logical media name. Throws on an unknown name, so a typo fails the build. */
export function media(name: string): string {
	const key = keys[name];
	if (!key) throw new Error(`media: "${name}" is not in src/data/media.json (run bun run media:push)`);
	return `${MEDIA_BASE}/${key}`;
}
