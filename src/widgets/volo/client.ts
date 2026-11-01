// The season chart: a bar per season picks its panel (by click or arrow key),
// the arrows page the chart a window at a time, and the heading opens the
// tray of every game. The bars, arrows and tray button are rendered disabled
// and only enabled here, so none of them is a control that does nothing.
import { showFace } from "@whois/design-system/lib/faces";
import { stepFromKey } from "@whois/design-system/lib/keys";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

export function mount(widget: HTMLElement, { signal }: WidgetContext) {
	const chart = widget.querySelector<HTMLElement>("[data-volo-chart]");
	const track = widget.querySelector<HTMLElement>("[data-volo-track]");
	const stack = widget.querySelector<HTMLElement>("[data-volo-panels]");
	const expand = widget.querySelector<HTMLButtonElement>("[data-volo-expand]");
	if (!chart || !track || !stack || !expand) return;

	const bars = Array.from(track.querySelectorAll<HTMLButtonElement>("[data-volo-season]"));
	const panels = Array.from(stack.querySelectorAll<HTMLElement>("[data-volo-panel]"));
	const years = Array.from(track.querySelectorAll<HTMLElement>("[data-year]"));
	const title = widget.querySelector<HTMLElement>("[data-volo-heading]");
	const tally = widget.querySelector<HTMLElement>("[data-volo-tally]");
	const sport = widget.querySelector<HTMLElement>("[data-volo-sport]");
	const expandLabel = widget.querySelector<HTMLElement>("[data-volo-expand-label]");
	const nav = widget.querySelector<HTMLElement>(".wx-vl-nav");
	const prev = nav?.querySelector<HTMLButtonElement>("[data-volo-prev]");
	const next = nav?.querySelector<HTMLButtonElement>("[data-volo-next]");

	const page = Number(getComputedStyle(widget).getPropertyValue("--vl-page")) || bars.length;
	const lastStart = Math.max(0, bars.length - page);
	let start = lastStart;
	let index = Math.max(0, bars.findIndex((bar) => bar.hasAttribute("aria-current")));

	const onShownPage = (i: number) => i >= start && i < start + page;

	// One tab stop: the selected bar, or the page's first when the selected
	// one has been paged out of view.
	const rove = () => {
		const stop = onShownPage(index) ? index : start;
		bars.forEach((bar, i) => (bar.tabIndex = i === stop ? 0 : -1));
	};

	// A year is labelled on its first season ON THE PAGE, so a page that
	// opens mid-year still says which year it is. A title's trophy always
	// shows.
	const label = () => {
		years.forEach((el, i) => {
			const first = i === start || el.dataset.year !== years[i - 1]?.dataset.year;
			el.classList.toggle("is-shown", first || el.classList.contains("is-title"));
		});
	};

	const pageTo = (to: number) => {
		start = Math.min(lastStart, Math.max(0, to));
		track.style.setProperty("--vl-start", String(start));
		if (prev && next) {
			// A disabled arrow cannot hold focus: hand it to the sibling
			// rather than drop it to <body>.
			const focused = document.activeElement;
			prev.disabled = start === 0;
			next.disabled = start === lastStart;
			if (focused === next && next.disabled) prev.focus();
			else if (focused === prev && prev.disabled) next.focus();
		}
		label();
		rove();
	};

	const select = (to: number) => {
		index = Math.min(bars.length - 1, Math.max(0, to));
		bars.forEach((bar, i) => {
			if (i === index) bar.setAttribute("aria-current", "true");
			else bar.removeAttribute("aria-current");
		});
		showFace(stack, index);
		const { heading, sport: game, tally: wl } = panels[index].dataset;
		if (title && heading) title.textContent = heading;
		if (sport && game) sport.textContent = game;
		if (tally && wl) tally.textContent = wl;
		// Keep the selection on the page.
		if (index < start) pageTo(index);
		else if (index >= start + page) pageTo(index - page + 1);
		else rove();
	};

	// Open, the tray covers the chart: the bars go inert so focus cannot
	// land under it.
	const setExpanded = (open: boolean) => {
		widget.dataset.expanded = String(open);
		expand.setAttribute("aria-expanded", String(open));
		chart.inert = open;
		if (expandLabel) expandLabel.textContent = open ? "Show less" : "Show every game";
	};

	const on = { signal };
	for (const bar of bars) {
		bar.addEventListener("click", () => select(Number(bar.dataset.voloSeason)), on);
		bar.disabled = false;
	}
	prev?.addEventListener("click", () => pageTo(start - page), on);
	next?.addEventListener("click", () => pageTo(start + page), on);
	expand.addEventListener("click", () => setExpanded(widget.dataset.expanded !== "true"), on);
	widget.addEventListener(
		"keydown",
		(event) => {
			if (event.key === "Escape" && widget.dataset.expanded === "true") {
				setExpanded(false);
				expand.focus();
				return;
			}
			if (!(event.target as HTMLElement).closest("[data-volo-season]")) return;
			const step = stepFromKey(event, index, bars.length - 1);
			if (step === null) return;
			event.preventDefault();
			select(step);
			bars[index].focus();
		},
		on,
	);

	pageTo(start);
	if (nav) nav.hidden = false;
	expand.disabled = false;

	return () => {
		for (const bar of bars) bar.disabled = true;
		expand.disabled = true;
	};
}
