/**
 * /feed.json — the /txt posts as a full-content JSON Feed 1.1
 * (https://www.jsonfeed.org/version/1.1/), for another site to syndicate
 * them with a link back. Unlike /rss.xml it carries the whole post: each
 * body is rendered at build time through Astro's Container API and made
 * portable (src/lib/feed-html.ts: no site CSS or JS, every URL absolute).
 * Demos are left out: they are interactive, and there is nothing to copy.
 *
 * The body is rendered without the post page's component map
 * (src/components/mdx-components.ts), so it comes out as plain tags rather
 * than DS components; the components a post imports itself still render, and
 * feed-html.ts degrades the ones that need this site (an embed becomes its
 * poster, linked to the post).
 */
import type { APIRoute } from "astro";
import { getImage } from "astro:assets";
import { loadRenderers } from "astro:container";
import { render } from "astro:content";
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getContainerRenderer } from "@astrojs/mdx/container-renderer";
import { BLOG_DESCRIPTION, BLOG_TITLE, postHref, TXT_HREF } from "../lib/blog";
import { portableHtml } from "../lib/feed-html";
import { getPosts } from "../lib/posts";

const AUTHOR = "Tristan Timblin";

export const GET: APIRoute = async (context) => {
	const site = context.site!;
	const abs = (path: string) => new URL(path, site).href;
	const container = await AstroContainer.create({
		renderers: await loadRenderers([getContainerRenderer()]),
	});

	const items = [];
	for (const post of await getPosts()) {
		const { title, excerpt, hero, date, modified, tags, category, canonical, syndicate } = post.data;
		const url = abs(postHref(post.id));
		const { Content } = await render(post);
		// The hero as a JPEG, the format Seo.astro asks for its social card, so
		// the two share one file when the post has no separate card.
		const image = hero ? abs((await getImage({ src: hero.src, format: "jpg" })).src) : undefined;
		items.push({
			id: url,
			url,
			// A syndicated post's origin, when it was first published elsewhere.
			...(canonical && { external_url: canonical }),
			title,
			summary: excerpt,
			content_html: portableHtml(await container.renderToString(Content), url),
			...(image && { image }),
			date_published: date.toISOString(),
			...(modified && { date_modified: modified.toISOString() }),
			tags,
			// `syndicate`: the post's frontmatter opts it into being copied
			// elsewhere (The Ergonomist reads only these). Every post is in the feed.
			_tristantimblin: { ...(category && { category }), syndicate },
		});
	}

	const feed = {
		version: "https://jsonfeed.org/version/1.1",
		title: `${BLOG_TITLE} — ${AUTHOR}`,
		home_page_url: abs(TXT_HREF),
		feed_url: abs("/feed.json"),
		description: BLOG_DESCRIPTION,
		authors: [{ name: AUTHOR, url: abs("/") }],
		language: "en",
		items,
	};
	return new Response(JSON.stringify(feed, null, "\t"), {
		headers: { "Content-Type": "application/feed+json; charset=utf-8" },
	});
};
