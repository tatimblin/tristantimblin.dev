// The chart's season bands pick the linescore under it (by click or arrow
// key), and the header's pill flips the chart between the run and the win
// differential. The bands are rendered disabled and the pill hidden, and only
// made live here, so neither is a control that does nothing.
import { showFace } from "@whois/design-system/lib/faces";
import { stepFromKey } from "@whois/design-system/lib/keys";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

const MODES = { run: "run differential", win: "win differential" } as const;
type Mode = keyof typeof MODES;

export function mount(widget: HTMLElement, { signal }: WidgetContext) {
	const stack = widget.querySelector<HTMLElement>("[data-volo-panels]");
	if (!stack) return;
	const bands = Array.from(widget.querySelectorAll<HTMLButtonElement>("[data-volo-season]"));
	const pill = widget.querySelector<HTMLButtonElement>("[data-volo-mode]");
	const fixed = widget.querySelector<HTMLElement>(".wx-vl-mode--static");
	const medals = Array.from(widget.querySelectorAll<HTMLElement>("[data-volo-medal]"));

	let index = Math.max(0, bands.findIndex((band) => band.hasAttribute("aria-current")));

	// The picked band is current and the one tab stop; its panel shows.
	const select = (to: number) => {
		index = Math.min(bands.length - 1, Math.max(0, to));
		bands.forEach((band, i) => {
			if (i === index) band.setAttribute("aria-current", "true");
			else band.removeAttribute("aria-current");
			band.tabIndex = i === index ? 0 : -1;
		});
		showFace(stack, index);
		for (const medal of medals) medal.hidden = Number(medal.dataset.voloMedal) !== index;
	};

	// The pill names the mode showing; its accessible name says both.
	const setMode = (mode: Mode) => {
		widget.dataset.mode = mode;
		const other: Mode = mode === "run" ? "win" : "run";
		pill?.setAttribute("aria-label", `Showing the ${MODES[mode]}. Show the ${MODES[other]}`);
	};

	const on = { signal };
	for (const band of bands) {
		band.addEventListener("click", () => select(Number(band.dataset.voloSeason)), on);
		band.disabled = false;
	}
	pill?.addEventListener("click", () => setMode(widget.dataset.mode === "win" ? "run" : "win"), on);
	widget.addEventListener(
		"keydown",
		(event) => {
			if (!(event.target as HTMLElement).closest("[data-volo-season]")) return;
			const step = stepFromKey(event, index, bands.length - 1);
			if (step === null) return;
			event.preventDefault();
			select(step);
			bands[index].focus();
		},
		on,
	);

	setMode(widget.dataset.mode === "win" ? "win" : "run");
	if (pill) {
		pill.hidden = false;
		if (fixed) fixed.hidden = true;
	}

	return () => {
		for (const band of bands) band.disabled = true;
	};
}
