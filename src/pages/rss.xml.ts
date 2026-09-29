import rss from "@astrojs/rss";
import type { APIRoute } from "astro";
import { BLOG_DESCRIPTION, BLOG_TITLE, postHref } from "../lib/blog";
import { getPosts } from "../lib/posts";

export const GET: APIRoute = async (context) => {
	const posts = await getPosts();

	return rss({
		title: `${BLOG_TITLE} — Tristan Timblin`,
		description: BLOG_DESCRIPTION,
		site: context.site!,
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.date,
			description: post.data.excerpt,
			link: postHref(post.id),
		})),
	});
};
