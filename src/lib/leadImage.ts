/**
 * The lead image for a /txt post: the FIRST markdown image in its body.
 *
 * The front page (src/pages/txt/index.astro) wants art for each story, but the
 * collection schema has no field for it — `image` is the social-card override and
 * means something else. Every post that has art already opens with it, so the art
 * is discoverable from the body itself and no frontmatter has to be added to five
 * existing files (and remembered for every future one).
 *
 * Reads `entry.body`, which the glob loader populates with the raw markdown,
 * frontmatter already stripped. `body` is typed optional on Astro's DataEntry, so
 * there is a filesystem fallback — reading the source in frontmatter is the same
 * build-time technique src/lib/intrinsicSize.ts already relies on.
 *
 * Returns only the SRC, never the alt, and that omission is deliberate: two of the
 * three real alts in this collection are filenames ("mega-desk.jpg",
 * "vscode-extension.jpg"). On an index the art is decorative — the adjacent
 * headline is the story's accessible name — so callers want alt="", and there is
 * no call site that should be tempted to echo a filename to a screen reader. The
 * real alt still ships on the article page via src/components/mdx/Img.astro.
 */
import { readFileSync } from "node:fs";

interface SourceEntry {
	/** Raw markdown, frontmatter stripped. Optional on Astro's DataEntry. */
	body?: string;
	/** Path to the source file, relative to the project root. */
	filePath?: string;
}

/** Paired fences, removed before matching. A ``` block can legally contain image
 *  syntax, and "the first image" must mean the first RENDERED one. Today's posts
 *  happen to open with their art, so this changes nothing — it stops a future post
 *  that opens with a code sample from having its lead art picked out of the code. */
const FENCED_CODE = /```[\s\S]*?```/g;

/** Leading `---\n…\n---` block, for the filesystem fallback only (`body` arrives
 *  with it already removed). */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

/** `![alt](src)`, with an optional `"title"` after the src. */
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/;

export function leadImage(entry: SourceEntry): { src: string } | null {
	const source = readSource(entry);
	if (!source) return null;

	const match = MARKDOWN_IMAGE.exec(source.replace(FENCED_CODE, ""));
	if (!match) return null;

	// Only local `public/` paths. A remote or data URI would be handed to
	// intrinsicSize(), which returns null for it anyway — being explicit here means
	// the caller is correct by design rather than by accident.
	const src = match[2];
	return src.startsWith("/") ? { src } : null;
}

function readSource(entry: SourceEntry): string | null {
	if (entry.body) return entry.body;
	if (!entry.filePath) return null;
	try {
		return readFileSync(entry.filePath, "utf8").replace(FRONTMATTER, "");
	} catch {
		return null;
	}
}
