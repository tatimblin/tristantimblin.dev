import { readdirSync, readFileSync } from "node:fs";
import { test, expect } from "./fixtures/test";

/**
 * THE JSON FEED (src/pages/feed.json.ts): every published /txt post in full,
 * for another site to syndicate. Invariants:
 *
 *  1. THE SHAPE is JSON Feed 1.1: the top-level fields, one item per
 *     published post (no demos), each with an absolute id/url that is the
 *     post's canonical, slashed URL.
 *  2. THE BODY IS THE WHOLE POST, portable: real paragraphs, no scripts,
 *     classes, inline styles or custom elements, and every URL absolute.
 *  3. AN EMBED DEGRADES to its poster linked to the post.
 *  4. EVERY PAGE ADVERTISES IT beside the RSS feed.
 */
const SITE = "https://tristantimblin.dev";

/** The published posts' slugs, straight from the files. */
const published = readdirSync("src/content/txt")
	.filter((f) => /\.mdx?$/.test(f))
	.filter((f) => !/^draft:\s*true\s*$/m.test(readFileSync(`src/content/txt/${f}`, "utf8")))
	.map((f) => f.replace(/\.mdx?$/, ""));

interface Item {
	id: string;
	url: string;
	title: string;
	summary: string;
	content_html: string;
	image?: string;
	date_published: string;
	date_modified?: string;
	tags: string[];
}

test("the feed is JSON Feed 1.1 with every published post, in full", async ({ request }) => {
	const res = await request.get("/feed.json");
	expect(res.ok()).toBe(true);
	const feed = await res.json();

	expect(feed).toMatchObject({
		version: "https://jsonfeed.org/version/1.1",
		title: "Writing — Tristan Timblin",
		home_page_url: `${SITE}/txt/`,
		feed_url: `${SITE}/feed.json`,
		description: expect.any(String),
		authors: [{ name: "Tristan Timblin", url: `${SITE}/` }],
		language: "en",
	});

	const items: Item[] = feed.items;
	expect(items.map((i) => i.url).sort()).toEqual(published.map((slug) => `${SITE}/txt/${slug}/`).sort());
	for (const item of items) {
		expect(item.id).toBe(item.url);
		expect(item.title).toBeTruthy();
		expect(item.summary).toBeTruthy();
		expect(new Date(item.date_published).toISOString()).toBe(item.date_published);
		expect(Array.isArray(item.tags)).toBe(true);
		if (item.image) expect(item.image).toMatch(/^https:\/\/tristantimblin\.dev\/_astro\//);

		const html = item.content_html;
		expect(html.length, item.url).toBeGreaterThan(1000);
		expect(html).toContain("<p>");
		expect(html).not.toMatch(/<script|<style|<button|\sclass=|\sstyle=|\sdata-/);
		expect(html, "no custom element survives").not.toMatch(/<[a-z]+-[a-z-]*[\s>]/);
		for (const [, attr, value] of html.matchAll(/\s(href|src|poster|cite)="([^"]*)"/g)) {
			expect(value, `${attr} in ${item.url}`).toMatch(/^(https?:|mailto:)/);
		}
		for (const [, value] of html.matchAll(/\ssrcset="([^"]*)"/g)) {
			for (const candidate of value!.split(",")) expect(candidate.trim()).toMatch(/^https:\/\//);
		}
	}

	const desk = items.find((i) => i.url.endsWith("/txt/mega-desk/"))!;
	expect(desk.content_html).toContain("My girlfriend and I share a loft as our home office.");
	expect(desk.image).toBeTruthy();

	const fisker = items.find((i) => i.url.endsWith("/txt/why-i-joined-fisker/"))!;
	expect(fisker.date_modified).toBe("2026-10-25T00:00:00.000Z");
	// The section numbers and the intro's label are the ruled page's, not the post's.
	expect(fisker.content_html).toContain('<h2 id="why-fisker">Why Fisker</h2>');
	expect(fisker.content_html).not.toMatch(/>(00|01|Intro)</);
});

test("the fleet demo degrades to its poster, linked to the post", async ({ request }) => {
	const feed = await (await request.get("/feed.json")).json();
	const post: Item = feed.items.find((i: Item) => i.url.endsWith("/txt/no-honey-we-have-a-dashboard-at-home/"));
	expect(post.content_html).not.toContain("fleet-demo>");
	expect(post.content_html).toContain(`<a href="${post.url}"><picture>`);
	expect(post.content_html).toContain("open the original post to try it");
});

test("every page advertises the feed beside the RSS", async ({ page }) => {
	await page.goto("/");
	await expect(page.locator('link[rel="alternate"][type="application/rss+xml"]')).toHaveAttribute("href", "/rss.xml");
	await expect(page.locator('link[rel="alternate"][type="application/feed+json"]')).toHaveAttribute(
		"href",
		"/feed.json",
	);
});
