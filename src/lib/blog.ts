/**
 * The blog's vocabulary: its name, its categories, and the helpers the /txt
 * pages share (ordering, numbering, neighbours, reading time, dates).
 *
 * CATEGORIES, NOT FIRST TAGS. A post carries several free-form `tags` — good
 * for search and for `article:tag` meta, useless as a taxonomy: the first tag
 * of the five posts is "ai", "diy", "vscode", "personal" and "career", which is
 * five labels for five posts and nothing an icon could be drawn for. So a post
 * names ONE `category` from the closed set below, and that is what the index
 * shows beside its title. Tags stay in the frontmatter and keep their pages
 * (/txt/tag/<tag>); they are just no longer the thing the list is organised by.
 *
 * Each category owns an icon from the DS set (theme/design-system/src/icons)
 * — never an emoji, which the old `icon` frontmatter field used to carry.
 */
import type { IconName } from "@whois/design-system/icons";

/** Where the /txt posts live, relative to the project root: the content
 *  collection's glob base, and the folder the markdown plugins
 *  (src/lib/mdx/post-sections.ts) scope themselves to. */
export const TXT_BASE = "./src/content/txt";

/** The blog's index. Every internal URL on the site ends in a slash
 *  (`trailingSlash: "always"` in astro.config), so the hrefs here do too:
 *  the link, the canonical and the served URL are then one string. */
export const TXT_HREF = "/txt/";

export const BLOG_TITLE = "Writing";
export const BLOG_DESCRIPTION = "Writing by Tristan Timblin.";

export const categories = {
	programming: { label: "Programming", icon: "code" },
	projects: { label: "Projects", icon: "stack" },
	thoughts: { label: "Thoughts", icon: "coffee" },
	personal: { label: "Personal", icon: "map" },
} as const satisfies Record<string, { label: string; icon: IconName }>;

export type CategoryId = keyof typeof categories;
export const categoryIds = Object.keys(categories) as [CategoryId, ...CategoryId[]];

export const tagHref = (tag: string) => `/txt/tag/${tag}/`;
export const postHref = (id: string) => `/txt/${id}/`;

/** The demos (src/content/demos): full-screen experiments, listed among the
 *  posts but numbered on their own (`demo / 001`, postNumbers over the demos
 *  alone) and served at /demo/<id>/. */
export const DEMOS_BASE = "./src/content/demos";
export const demoHref = (id: string) => `/demo/${id}/`;

/** Whether an entry is built and listed: always on a dev server (a draft is
 *  read in place there), and in a production build only when it is not a
 *  draft. The one filter getPosts and getDemos share. */
export const isPublished = (entry: { data: { draft: boolean } }, dev: boolean): boolean =>
	dev || !entry.data.draft;

/** The shape this needs off a collection entry, spelled structurally so the
 *  module does not have to import astro:content. */
interface Dated {
	data: { date: Date };
}

/** Newest first. */
export function byDateDesc<T extends Dated>(posts: T[]): T[] {
	return [...posts].sort(
		(a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime()
	);
}

/** Posts bucketed by year, newest year first, each bucket newest first. */
export function groupByYear<T extends Dated>(posts: T[]): Array<{ year: number; posts: T[] }> {
	const groups = new Map<number, T[]>();
	for (const post of byDateDesc(posts)) {
		const year = new Date(post.data.date).getUTCFullYear();
		const bucket = groups.get(year);
		if (bucket) bucket.push(post);
		else groups.set(year, [post]);
	}
	return [...groups.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([year, posts]) => ({ year, posts }));
}

export const isoDate = (d: Date) => new Date(d).toISOString().split("T")[0];

/** The month: `{ short: "feb", long: "february" }`. UTC, not the build
 *  machine's zone, like every date here: frontmatter dates are bare
 *  YYYY-MM-DD, which parse as UTC midnight, and formatting those locally
 *  prints the day BEFORE anywhere west of UTC while the datetime attribute
 *  still says the right one. */
function monthOf(d: Date): { short: string; long: string } {
	const date = new Date(d);
	const of = (month: "short" | "long") =>
		date.toLocaleDateString("en-US", { month, timeZone: "UTC" }).toLowerCase();
	return { short: of("short"), long: of("long") };
}

/**
 * Every post's chronological number, 1-based: the first post ever is 1, so a
 * new post takes the next number and the old ones keep theirs. Keyed by id,
 * over whatever list is given (the rendered one — in PROD the non-draft
 * posts). `padNo` prints it the way the post page does (`005`).
 */
export function postNumbers<T extends Dated & { id: string }>(posts: T[]): Map<string, number> {
	const asc = byDateDesc(posts).reverse();
	return new Map(asc.map((post, i) => [post.id, i + 1]));
}

export const padNo = (no: number) => String(no).padStart(3, "0");

/** Words and minutes at 200 words a minute, off the raw body (markdown and
 *  all — close enough for a reading-time line, and it never goes under 1). */
export function readingStats(body: string | undefined): { words: number; minutes: number } {
	const words = (body ?? "")
		.replace(/^---[\s\S]*?---/, "")
		.replace(/<[^>]+>/g, " ")
		.split(/\s+/)
		.filter(Boolean).length;
	return { words, minutes: Math.max(1, Math.ceil(words / 200)) };
}

/** The post's chronological neighbours: `prev` is the one published before
 *  it (older), `next` the one after (newer); null at either end. */
export function neighbours<T extends Dated & { id: string }>(
	posts: T[],
	id: string,
): { prev: T | null; next: T | null } {
	const asc = byDateDesc(posts).reverse();
	const i = asc.findIndex((post) => post.id === id);
	if (i === -1) return { prev: null, next: null };
	return { prev: asc[i - 1] ?? null, next: asc[i + 1] ?? null };
}

/** The ruled post page's status-strip date: `02.02.2026` — day, month, year,
 *  each padded, dotted; UTC like the rest. */
export const dottedDate = (d: Date) => {
	const date = new Date(d);
	const day = String(date.getUTCDate()).padStart(2, "0");
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	return `${day}.${month}.${date.getUTCFullYear()}`;
};

/** The /txt stack's date column: `02 / 26` — zero-padded month, two-digit
 *  year; UTC like the rest. */
export const monthYear = (d: Date) => {
	const date = new Date(d);
	const month = String(date.getUTCMonth() + 1).padStart(2, "0");
	const year = String(date.getUTCFullYear() % 100).padStart(2, "0");
	return `${month} / ${year}`;
};

/** The index table's FILED column: `jun 2025` (the caps voice uppercases it). */
export const filedDate = (d: Date) =>
	`${monthOf(d).short} ${new Date(d).getUTCFullYear()}`;
