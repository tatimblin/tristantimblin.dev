// Flip the card between the contribution grid and the language breakdown:
// showFace moves aria-hidden from one face to the other (which is what
// Faces fades on) — no network, no persisted state.
import { showFace } from "@whois/design-system/lib/faces";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

export function mount(widget: HTMLElement, { signal }: WidgetContext) {
	const button = widget.querySelector<HTMLButtonElement>("[data-gh-flip]");
	const stack = widget.querySelector<HTMLElement>("[data-gh-faces]");
	if (!button || !stack) return;

	let flipped = false;
	button.addEventListener(
		"click",
		() => {
			flipped = !flipped;
			button.setAttribute("aria-pressed", String(flipped));
			showFace(stack, flipped ? "langs" : "grid");
		},
		{ signal },
	);
}
