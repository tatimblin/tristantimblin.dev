import { markBar } from "@whois/design-system/lib/bar-graph";
import { showFace } from "@whois/design-system/lib/faces";
import { stepFromKey } from "@whois/design-system/lib/keys";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

// Each face's bar graph becomes a slider over its readings (pointer, touch
// and keys), and the range pill cycles the faces (./Readers.astro renders
// both; this only wires them). Nothing here runs unprompted; every listener
// (and a touch's pending settle) goes with the card's signal.
export function mount(widget: HTMLElement, { signal }: WidgetContext) {
	bindRange(widget, signal);
	for (const face of widget.querySelectorAll<HTMLElement>(".wx-rd-face")) bindGraph(face, signal);
}

interface Reading {
	v: number;
	s: string;
}

function bindGraph(face: HTMLElement, signal: AbortSignal): void {
	const graph = face.querySelector<HTMLElement>(".wx-rd-bars");
	const tag = face.querySelector<HTMLElement>(".wx-rd-read-tag");
	const value = face.querySelector<HTMLElement>(".wx-rd-read-value");
	const span = face.querySelector<HTMLElement>(".wx-rd-read-span");
	let readings: Reading[] = [];
	try {
		readings = JSON.parse(face.dataset.readings ?? "[]");
	} catch {}
	if (!graph || readings.length === 0) return;

	const peak = Number(face.dataset.peak);
	const last = readings.length - 1;
	let at = peak;
	let settle = 0;

	// Light bar i and say what it is, to the eye and to assistive tech. A graph
	// whose bar count disagrees with the readings stays a picture.
	const show = (i: number) => {
		const lit = markBar(graph, i);
		if (lit < 0 || lit > last) return;
		at = lit;
		const r = readings[at];
		if (tag) tag.hidden = at !== peak;
		if (value) value.textContent = String(r.v);
		if (span) span.textContent = r.s;
		graph.setAttribute("aria-valuenow", String(at));
		graph.setAttribute(
			"aria-valuetext",
			`${r.v} visitors, ${r.s}${at === peak ? ", the busiest" : ""}`,
		);
	};

	// Upgrade the hidden picture into a slider over the readings.
	graph.removeAttribute("aria-hidden");
	graph.setAttribute("role", "slider");
	graph.tabIndex = 0;
	graph.setAttribute(
		"aria-label",
		`Visitors per ${face.dataset.window ?? "7"} days, ${(face.dataset.label ?? "").toLowerCase()}`,
	);
	graph.setAttribute("aria-valuemin", "0");
	graph.setAttribute("aria-valuemax", String(last));
	show(peak);

	// Bars are spread edge to edge, so bar i sits at i / last of the width.
	const fromPointer = (event: PointerEvent) => {
		const rect = graph.getBoundingClientRect();
		const x = (event.clientX - rect.left) / Math.max(1, rect.width);
		window.clearTimeout(settle);
		show(Math.round(x * last));
	};
	const onLeave = (event: PointerEvent) => {
		if (document.activeElement === graph) return;
		// A touch lifts as it leaves; hold its reading a moment so it can be
		// read, then hand the accent back to the peak.
		window.clearTimeout(settle);
		if (event.pointerType === "mouse") show(peak);
		else settle = window.setTimeout(() => show(peak), 2000);
	};
	const onKey = (event: KeyboardEvent) => {
		const step = stepFromKey(event, at, last);
		if (step === null) return;
		event.preventDefault();
		show(step);
	};
	const onBlur = () => show(peak);

	graph.addEventListener("pointermove", fromPointer, { signal });
	graph.addEventListener("pointerdown", fromPointer, { signal });
	graph.addEventListener("pointerleave", onLeave, { signal });
	graph.addEventListener("keydown", onKey, { signal });
	graph.addEventListener("blur", onBlur, { signal });
	signal.addEventListener("abort", () => window.clearTimeout(settle), { once: true });
}

function bindRange(widget: HTMLElement, signal: AbortSignal): void {
	const button = widget.querySelector<HTMLButtonElement>(".wx-rd-cycle");
	const staticPill = widget.querySelector<HTMLElement>(".wx-rd-range--static");
	if (!button) return;

	// Hand over from the inert pill only now, so a live-looking control never
	// does nothing.
	staticPill?.setAttribute("hidden", "");
	button.hidden = false;

	const stack = widget.querySelector<HTMLElement>("[data-rd-faces]");
	const labels = [...button.querySelectorAll<HTMLElement>("[data-face]")];
	const keys = labels.map((el) => el.dataset.face ?? "");
	if (!stack || keys.length === 0) return;
	let at = 0;

	const apply = (index: number) => {
		at = index;
		const key = keys[at];
		const face = showFace(stack, key);
		for (const label of labels) label.hidden = label.dataset.face !== key;
		// The pill's own text is the current range, so the accessible name has
		// to say what pressing it DOES rather than repeating that text.
		button.setAttribute(
			"aria-label",
			`Showing ${(face?.dataset.label ?? key).toLowerCase()}. Change range.`,
		);
	};

	apply(at);
	button.addEventListener("click", () => apply((at + 1) % keys.length), { signal });
}
