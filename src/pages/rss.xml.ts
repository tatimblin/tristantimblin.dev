import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { BLOG_DESCRIPTION, BLOG_TITLE, demoHref, postHref } from "../lib/blog";
import { getDemos, getPosts } from "../lib/posts";

// RSS's own <author> must be an email address; Dublin Core's creator takes a
// name, which is what readers show.
const AUTHOR = "<dc:creator>Tristan Timblin</dc:creator>";

export const GET: APIRoute = async (context) => {
	const posts = (await getPosts()).map((post) => ({
		title: post.data.title,
		pubDate: post.data.date,
		description: post.data.excerpt,
		link: postHref(post.id),
		customData: AUTHOR,
	}));
	// Demos ride in the same feed, by date among the posts, in a "demo" category.
	const demos = (await getDemos()).map((demo) => ({
		title: demo.data.title,
		pubDate: demo.data.date,
		description: demo.data.description,
		link: demoHref(demo.id),
		categories: ["demo"],
		customData: AUTHOR,
	}));
	const items = [...posts, ...demos].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime());
	// The feed's own URL (atom:link rel="self", which validators ask for) and
	// when it last changed: the newest item's date, so the value only moves
	// when the feed does, not on every build.
	const self = new URL("/rss.xml", context.site).href;
	const lastBuild = items[0]?.pubDate.toUTCString();

	return rss({
		title: `${BLOG_TITLE} — Tristan Timblin`,
		description: BLOG_DESCRIPTION,
		site: context.site!,
		xmlns: { atom: "http://www.w3.org/2005/Atom", dc: "http://purl.org/dc/elements/1.1/" },
		customData: [
			`<atom:link href="${self}" rel="self" type="application/rss+xml"/>`,
			lastBuild && `<lastBuildDate>${lastBuild}</lastBuildDate>`,
		]
			.filter(Boolean)
			.join(""),
		items,
	});
};
