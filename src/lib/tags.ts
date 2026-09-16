/**
 * The category rail's tag list, and the editorial rule behind it.
 *
 * A tag carried by ONE story is not a category, it is a label. It gets its own
 * chip in the rail, its own front page, and its own line in the reader's mental
 * model of the publication — and all three promise a section that turns out to be
 * a single article. So the rail surfaces a tag only once a second story has joined
 * it (RAIL_MIN_POSTS), and the rest stay as descriptive metadata on the stories
 * that carry them.
 *
 * The threshold bites hard on a small collection and that is worth knowing rather
 * than discovering: at five stories and seventeen tags, exactly one ("developer-
 * tools") clears it. The rail is therefore nearly empty by design until the
 * writing catches up with the taxonomy, which is the honest state of it — a rail
 * of sixteen one-story chips was advertising sections that did not exist.
 *
 * WHY THIS IS A MODULE. The rail renders on /txt and on every /txt/tag/<tag>
 * page, from two separate files that each built the same counted-and-sorted list
 * by hand. Two copies of a rule is how the two pages drift apart; one of them
 * would have kept the old behaviour the first time the threshold moved.
 *
 * NOT APPLIED to a story's own "filed under" list, or to the kicker above a
 * headline. Those name what a piece IS about, which is true regardless of how
 * many other pieces share it, and they are plain text rather than links to a
 * section — they promise nothing. This rule is about what the rail offers as a
 * place to GO.
 */

/** A tag needs this many stories before the rail will surface it. */
export const RAIL_MIN_POSTS = 2;

/** The shape this needs off a collection entry, spelled structurally so the
 *  module does not have to import astro:content to count strings. */
interface TaggedEntry {
	data: { tags: string[] };
}

interface RailOptions {
	/**
	 * A tag to include even if it falls short — the one whose page is being read.
	 *
	 * Without it the rail on /txt/tag/diy would list the categories that qualify
	 * and silently omit the one the reader is actually in, leaving no chip marked
	 * current and no visible answer to "where am I?". Keeping it is not a back
	 * door onto the rail: it shows up only for someone already on that page, never
	 * to a reader browsing /txt.
	 */
	keep?: string;
}

/**
 * Tags fit to be offered as sections, most-used first, ties broken alphabetically
 * so the order is stable across builds rather than dependent on file iteration.
 *
 * `keep` is appended through the same sort, so a below-threshold active tag sorts
 * to the end on its count — predictable, and it reads as the outlier it is.
 */
export function railTags(posts: TaggedEntry[], { keep }: RailOptions = {}): string[] {
	const counts = new Map<string, number>();
	for (const post of posts) {
		for (const tag of post.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
	}

	return [...counts.entries()]
		.filter(([tag, n]) => n >= RAIL_MIN_POSTS || tag === keep)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([tag]) => tag);
}
