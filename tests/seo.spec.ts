import { test, expect, type Page } from "./fixtures/test";

/**
 * THE SOCIAL AND ARTICLE META (src/components/Seo.astro). A post is an
 * article: its dates and tags as article:* meta, its <title> suffixed with
 * the site name and its og:title bare. A post with a picture — a custom card
 * or its hero — gets the large card, described by imageAlt or the hero's
 * alt; everything else gets the square card at full size. Indexable pages
 * ask for large image previews; noindex ones stay noindex.
 *
 * THE JSON-LD: one @graph per page. The Person on every page (stable @id),
 * the WebSite and ProfilePage on the home page alone, a BlogPosting on a
 * post and a CreativeWork on a demo, each pointing back by @id.
 *
 * THE FEED AND THE SITEMAP: the feed names itself and its last change; the
 * sitemap dates each post and demo.
 */
const meta = (page: Page, key: string) =>
	page.locator(`meta[property="${key}"], meta[name="${key}"]`);

type Node = Record<string, unknown> & { "@type": string; "@id"?: string };

const graph = async (page: Page): Promise<Node[]> => {
	const scripts = page.locator('script[type="application/ld+json"]');
	await expect(scripts).toHaveCount(1);
	const json = JSON.parse((await scripts.textContent()) ?? "{}");
	expect(json["@context"]).toBe("https://schema.org");
	return json["@graph"];
};
const node = (nodes: Node[], type: string) => nodes.find((n) => n["@type"] === type);

const PERSON = "https://tristantimblin.dev/#person";
const WEBSITE = "https://tristantimblin.dev/#website";

test("a post with a hero: article meta, the large card, the hero's alt", async ({ page }) => {
	await page.goto("/txt/asserting-on-agent-behavior/");
	await expect(meta(page, "og:type")).toHaveAttribute("content", "article");
	await expect(meta(page, "article:published_time")).toHaveAttribute(
		"content",
		"2026-02-02T00:00:00.000Z",
	);
	await expect(meta(page, "article:tag")).toHaveCount(4);
	await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary_large_image");
	// The hero, built as one JPEG (the format every crawler reads), absolute.
	await expect(meta(page, "og:image")).toHaveAttribute(
		"content",
		/^https:\/\/tristantimblin\.dev\/_astro\/aptitude-pass\..*\.jpg$/,
	);
	await expect(meta(page, "og:image:alt")).toHaveAttribute("content", /^Aptitude in the terminal/);
	await expect(meta(page, "twitter:image:alt")).toHaveAttribute("content", /^Aptitude in the terminal/);
	// The canonical is the URL the site links to.
	await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
		"href",
		"https://tristantimblin.dev/txt/asserting-on-agent-behavior/",
	);
});

test("a post's title carries the site name; its og:title does not", async ({ page }) => {
	await page.goto("/txt/asserting-on-agent-behavior/");
	await expect(page).toHaveTitle(/^.+ — Tristan Timblin$/);
	const og = await meta(page, "og:title").getAttribute("content");
	expect(og).not.toContain("Tristan Timblin");
	expect(await page.title()).toBe(`${og} — Tristan Timblin`);
});

test("a post without a picture, and a page: the square card, no article meta", async ({ page }) => {
	await page.goto("/txt/why-i-joined-fisker/");
	await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary");
	await expect(meta(page, "og:image")).toHaveAttribute("content", "https://tristantimblin.dev/og.jpg");

	await page.goto("/");
	await expect(meta(page, "og:type")).toHaveAttribute("content", "website");
	await expect(meta(page, "article:published_time")).toHaveCount(0);
	await expect(meta(page, "twitter:card")).toHaveAttribute("content", "summary");
	await expect(meta(page, "og:image")).toHaveAttribute("content", "https://tristantimblin.dev/og.jpg");
	await expect(meta(page, "og:image:width")).toHaveAttribute("content", "1200");
	await expect(meta(page, "og:image:height")).toHaveAttribute("content", "1200");
});

test("robots: large image previews when indexable, noindex kept when not", async ({ page }) => {
	await page.goto("/");
	await expect(meta(page, "robots")).toHaveCount(1);
	await expect(meta(page, "robots")).toHaveAttribute("content", /^index, .*max-image-preview:large/);

	await page.goto("/no-such-page-here/");
	await expect(meta(page, "robots")).toHaveCount(1);
	await expect(meta(page, "robots")).toHaveAttribute("content", /noindex/);
	await expect(meta(page, "robots")).not.toHaveAttribute("content", /max-image-preview/);
});

test("the home page's graph: the Person, the WebSite and the ProfilePage", async ({ page }) => {
	await page.goto("/");
	const nodes = await graph(page);
	const person = node(nodes, "Person");
	expect(person?.["@id"]).toBe(PERSON);
	expect(person?.sameAs).toEqual(
		expect.arrayContaining([
			"https://github.com/tatimblin",
			"https://www.linkedin.com/in/tristan-timblin/",
			"https://bsky.app/profile/tristantimblin.dev",
		]),
	);
	const website = node(nodes, "WebSite");
	expect(website).toMatchObject({
		"@id": WEBSITE,
		name: "Tristan Timblin",
		alternateName: "tristantimblin.dev",
		url: "https://tristantimblin.dev/",
		publisher: { "@id": PERSON },
	});
	expect(node(nodes, "ProfilePage")).toMatchObject({ mainEntity: { "@id": PERSON } });
});

test("a post's graph: the Person and a BlogPosting by them", async ({ page }) => {
	await page.goto("/txt/asserting-on-agent-behavior/");
	const nodes = await graph(page);
	expect(node(nodes, "Person")?.["@id"]).toBe(PERSON);
	// The WebSite and ProfilePage live on the home page only.
	expect(node(nodes, "WebSite")).toBeUndefined();
	expect(node(nodes, "ProfilePage")).toBeUndefined();
	const post = node(nodes, "BlogPosting");
	expect(post).toMatchObject({
		author: { "@id": PERSON, name: "Tristan Timblin" },
		publisher: { "@id": PERSON },
		isPartOf: { "@id": WEBSITE },
		inLanguage: "en",
		datePublished: "2026-02-02T00:00:00.000Z",
		// No `modified` in the frontmatter: the publish date stands in.
		dateModified: "2026-02-02T00:00:00.000Z",
	});
	expect(post?.headline).not.toContain("Tristan Timblin");
	expect(post?.wordCount).toBeGreaterThan(0);
});

test("a demo's graph: a CreativeWork with its notes and credits, no suffix", async ({ page }) => {
	await page.goto("/demo/sutro/");
	const nodes = await graph(page);
	expect(node(nodes, "BlogPosting")).toBeUndefined();
	expect(node(nodes, "CreativeWork")).toMatchObject({
		headline: "Sutro",
		name: "Sutro",
		author: { "@id": PERSON },
		isPartOf: { "@id": WEBSITE },
		text: expect.stringContaining("The grass sways"),
		creditText: expect.stringContaining("three.js"),
	});
	await expect(page).toHaveTitle("Sutro — Tristan Timblin");
	await expect(meta(page, "og:title")).toHaveAttribute("content", "Sutro");
});

test("the feed names itself and its last change, and credits the author", async ({ request }) => {
	const rss = await (await request.get("/rss.xml")).text();
	expect(rss).toContain(
		'<atom:link href="https://tristantimblin.dev/rss.xml" rel="self" type="application/rss+xml"/>',
	);
	expect(rss).toMatch(/<lastBuildDate>[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} [\d:]{8} GMT<\/lastBuildDate>/);
	expect(rss).toContain("<dc:creator>Tristan Timblin</dc:creator>");
});

test("the sitemap dates the posts and the demos", async ({ request }) => {
	const sitemap = await (await request.get("/sitemap-0.xml")).text();
	expect(sitemap).toContain(
		"<loc>https://tristantimblin.dev/txt/asserting-on-agent-behavior/</loc><lastmod>2026-02-02T00:00:00.000Z</lastmod>",
	);
	expect(sitemap).toContain(
		"<loc>https://tristantimblin.dev/demo/sutro/</loc><lastmod>2026-09-26T00:00:00.000Z</lastmod>",
	);
});
