/**
 * The /txt posts and the demos every page lists: each collection without its
 * drafts in a production build (a dev server shows them, so a draft can be
 * read in place), newest first. One query each, so the index, the pages, the
 * tag pages and the feed can never disagree about which exist.
 */
import { getCollection, type CollectionEntry } from "astro:content";
import { byDateDesc, isPublished } from "./blog";

export type Post = CollectionEntry<"txt">;
export type Demo = CollectionEntry<"demos">;

export async function getPosts(): Promise<Post[]> {
	return byDateDesc(await getCollection("txt", (post) => isPublished(post, import.meta.env.DEV)));
}

export async function getDemos(): Promise<Demo[]> {
	return byDateDesc(await getCollection("demos", (demo) => isPublished(demo, import.meta.env.DEV)));
}
