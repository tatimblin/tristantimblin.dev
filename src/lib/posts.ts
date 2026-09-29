/**
 * The /txt posts every page lists: the collection without its drafts in a
 * production build (a dev server shows them, so a draft can be read in
 * place), newest first. One query, so the index, the post pages, the tag
 * pages and the feed can never disagree about which posts exist.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { byDateDesc } from "./blog";

export type Post = CollectionEntry<"txt">;

export async function getPosts(): Promise<Post[]> {
	const posts = await getCollection("txt", (post) => import.meta.env.DEV || !post.data.draft);
	return byDateDesc(posts);
}
