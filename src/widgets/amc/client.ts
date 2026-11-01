// The fan, the gauge and the readout (./fan.ts), on the films the card
// carries as JSON. Its glides and shuffles run on the card's frame callback,
// so they go with the card.
import type { WidgetContext } from "@whois/design-system/lib/widgets";
import type { Film } from "./amc";
import { mountFan } from "./fan";

export function mount(widget: HTMLElement, ctx: WidgetContext) {
	const data = widget.querySelector<HTMLScriptElement>("[data-amc-films]");
	if (!data) return;
	let films: Film[];
	try {
		films = JSON.parse(data.textContent ?? "[]");
	} catch {
		return;
	}
	const fan = mountFan(widget, films, new Date(), (step) => ctx.frame(step));
	return () => fan?.destroy();
}
