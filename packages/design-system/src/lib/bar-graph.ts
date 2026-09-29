/**
 * BarGraph, driven. The graph's one state is which bar carries the mark
 * (`data-mark`, the accent — bar-graph.css); a script that reads the bars
 * back moves it with this, so the bar class stays the package's own.
 */

/** The bars of a graph, in value order. */
export function barsOf(graph: Element): HTMLElement[] {
	return Array.from(graph.querySelectorAll<HTMLElement>(":scope > .ds-bar-graph__bar"));
}

/**
 * Mark bar `index` — and only it, so the graph keeps its one accent.
 * Returns the index actually marked (clamped to the bars there are), or -1
 * for a graph with no bars.
 */
export function markBar(graph: Element, index: number): number {
	const bars = barsOf(graph);
	if (bars.length === 0) return -1;
	const at = Math.min(Math.max(index, 0), bars.length - 1);
	bars.forEach((bar, i) => bar.toggleAttribute("data-mark", i === at));
	return at;
}
