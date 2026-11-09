/**
 * Page-view counts for the pages, from the committed ledger the nightly
 * GoatCounter fetch writes (src/data/pageviews.json, tools/pageviews). Read at
 * build time only: no page fetches analytics at runtime.
 *
 * Every figure is GoatCounter visitors summed by day (see tools/pageviews/lib.mjs):
 * `reads` is all time, `recent` the last 30 days.
 */
import data from "../data/pageviews.json";
import { normalisePath } from "./analytics/path";

export interface PathStats {
	reads: number;
	recent: number;
}

export interface PageviewsLedger {
	updated: string | null;
	paths: Record<string, PathStats>;
}

const ledger = data as unknown as PageviewsLedger;

/** Below this a count is noise, and a "3 reads" reads worse than none. */
export const MIN_SHOWN = 10;

/** One page's counts, by its path in any form (normalised first); null if it has none. */
export function getPathStats(path: string, source: PageviewsLedger = ledger): PathStats | null {
	const key = normalisePath(path);
	return (key && source.paths?.[key]) || null;
}

/**
 * The `count` items with the most all-time reads. Ties keep the order given,
 * and an item with no count ranks as zero, so a thin ledger still fills a row.
 */
export function topByReads<T>(
	items: T[],
	pathOf: (item: T) => string,
	count: number,
	source: PageviewsLedger = ledger,
): T[] {
	const reads = (item: T) => getPathStats(pathOf(item), source)?.reads ?? 0;
	return [...items].sort((a, b) => reads(b) - reads(a)).slice(0, count);
}

/**
 * "212 reads" ("1,204 reads", "212 views"), or null under MIN_SHOWN or for no
 * count at all, so a caller can drop the whole cell. Lowercase: the strip's
 * caps are the Mono's, not the text's.
 */
export function formatReads(
	count: number | null | undefined,
	unit: "reads" | "views" = "reads",
): string | null {
	if (typeof count !== "number" || !Number.isFinite(count) || count < MIN_SHOWN) return null;
	return `${Math.floor(count).toLocaleString("en-US")} ${unit}`;
}

/** A page's all-time count as formatReads prints it, by its path. */
export function reads(path: string, unit: "reads" | "views" = "reads"): string | null {
	return formatReads(getPathStats(path)?.reads, unit);
}
