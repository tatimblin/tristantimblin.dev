/**
 * The blog's vocabulary: its name, its nav, its categories, and the two small
 * helpers every /txt page needs (grouping by year, the date line).
 *
 * CATEGORIES, NOT FIRST TAGS. A post carries several free-form `tags` — good
 * for search and for `article:tag` meta, useless as a taxonomy: the first tag
 * of the five posts is "ai", "diy", "vscode", "personal" and "career", which is
 * five labels for five posts and nothing an icon could be drawn for. So a post
 * names ONE `category` from the closed set below, and that is what the index
 * shows beside its title and what the Categories page lists. Tags stay in the
 * frontmatter and keep their pages (/txt/tag/<tag>); they are just no longer the
 * thing the list is organised by.
 *
 * Each category owns an icon from the DS set (packages/design-system/src/icons)
 * — never an emoji, which the old `icon` frontmatter field used to carry.
 */
import type { IconName } from "@whois/design-system/icons";

export const BLOG_TITLE = "Writing";
export const BLOG_DESCRIPTION = "Writing by Tristan Timblin.";

/** The quiet nav in the blog's header. */
export const blogNav = [
	{ label: "Writing", href: "/txt" },
	{ label: "Categories", href: "/txt/categories" },
];

export const categories = {
	programming: { label: "Programming", icon: "code" },
	projects: { label: "Projects", icon: "stack" },
	thoughts: { label: "Thoughts", icon: "coffee" },
	personal: { label: "Personal", icon: "map" },
} as const satisfies Record<string, { label: string; icon: IconName }>;

export type CategoryId = keyof typeof categories;
export const categoryIds = Object.keys(categories) as [CategoryId, ...CategoryId[]];

export const categoryHref = (id: CategoryId) => `/txt/category/${id}`;
export const tagHref = (tag: string) => `/txt/tag/${tag}`;
export const postHref = (id: string) => `/txt/${id}`;

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

/** "Sep 5, 2023". UTC, not the build machine's zone: frontmatter dates are bare
 *  YYYY-MM-DD, which parse as UTC midnight, and formatting those locally prints
 *  the day BEFORE anywhere west of UTC while the datetime attribute still says
 *  the right one. Pinning to UTC keeps the visible date and the machine-readable
 *  one in step. */
export const formatDate = (d: Date) =>
	new Date(d).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

export const isoDate = (d: Date) => new Date(d).toISOString().split("T")[0];
