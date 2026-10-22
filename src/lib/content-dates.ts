/**
 * The sitemap's lastmod for each post and demo, read straight off the
 * frontmatter: astro.config runs before the content layer, so it cannot ask
 * getCollection. A file's id is its name without the extension (the glob
 * loader's id for these slug-named files), and its date is `modified` when it
 * has one, else `date`. Pages without a content date get no lastmod.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DEMOS_BASE, TXT_BASE, demoHref, postHref } from "./blog";

/** One frontmatter scalar (`date: 2026-02-02`), quoted or not. */
const field = (frontmatter: string, key: string): Date | null => {
	const value = frontmatter.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+?)["']?\\s*$`, "m"))?.[1];
	const date = value && value !== "null" ? new Date(value) : null;
	return date && !Number.isNaN(date.getTime()) ? date : null;
};

const dates = (base: string, href: (id: string) => string): [string, Date][] =>
	readdirSync(base)
		.filter((file) => /\.mdx?$/.test(file))
		.flatMap((file) => {
			const frontmatter = readFileSync(join(base, file), "utf8").match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
			const date = field(frontmatter, "modified") ?? field(frontmatter, "date");
			return date ? [[href(file.replace(/\.mdx?$/, "")), date] as [string, Date]] : [];
		});

/** Pathname (`/txt/<id>/`, `/demo/<id>/`) → the date it last changed. */
export const contentDates = (): Map<string, Date> =>
	new Map([...dates(TXT_BASE, postHref), ...dates(DEMOS_BASE, demoHref)]);
