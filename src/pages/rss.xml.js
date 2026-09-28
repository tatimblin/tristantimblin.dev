import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import { BLOG_DESCRIPTION, BLOG_TITLE } from "../lib/blog";

export async function GET(context) {
	const posts = (await getCollection("txt"))
		.filter((post) => !post.data.draft)
		.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());

	return rss({
		title: `${BLOG_TITLE} — Tristan Timblin`,
		description: BLOG_DESCRIPTION,
		site: context.site,
		items: posts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.date,
			description: post.data.excerpt,
			link: `/txt/${post.id}`,
		})),
	});
}
