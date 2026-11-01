// Flip the gauge between the US crossing and the lap of the Earth. The ring
// (./ring.ts) lays itself out now and on every resize; its observer goes with
// the card (tests/reveal.spec.ts test 7 guards the bike across a
// view-transition round trip).
import type { WidgetContext } from "@whois/design-system/lib/widgets";
import { mountRing } from "./ring";

export function mount(widget: HTMLElement, { signal }: WidgetContext) {
	const flip = widget.querySelector<HTMLButtonElement>("[data-bw-flip]");
	const glyph = widget.querySelector<HTMLButtonElement>(".wx-bw-glyph");
	if (!flip || !glyph) return;

	const shares = { us: Number(widget.dataset.shareUs), earth: Number(widget.dataset.shareEarth) };
	const ring = mountRing(widget, shares.us);
	if (!ring) return;

	flip.addEventListener(
		"click",
		() => {
			const earth = widget.dataset.mode !== "earth";
			widget.dataset.mode = earth ? "earth" : "us";
			flip.setAttribute("aria-pressed", String(earth));
			ring.setShare(earth ? shares.earth : shares.us);
		},
		{ signal },
	);
	// The glyph is a pointer target only: it presses the HitArea.
	glyph.addEventListener("click", () => flip.click(), { signal });
	return () => ring.destroy();
}
