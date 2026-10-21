import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { BLOG_DESCRIPTION, BLOG_TITLE, demoHref, postHref } from "../lib/blog";
import { getDemos, getPosts } from "../lib/posts";

export const GET: APIRoute = async (context) => {
	const posts = (await getPosts()).map((post) => ({
		title: post.data.title,
		pubDate: post.data.date,
		description: post.data.excerpt,
		link: postHref(post.id),
	}));
	// Demos ride in the same feed, by date among the posts, in a "demo" category.
	const demos = (await getDemos()).map((demo) => ({
		title: demo.data.title,
		pubDate: demo.data.date,
		description: demo.data.description,
		link: demoHref(demo.id),
		categories: ["demo"],
	}));

	return rss({
		title: `${BLOG_TITLE} — Tristan Timblin`,
		description: BLOG_DESCRIPTION,
		site: context.site!,
		items: [...posts, ...demos].sort((a, b) => b.pubDate.getTime() - a.pubDate.getTime()),
	});
};
