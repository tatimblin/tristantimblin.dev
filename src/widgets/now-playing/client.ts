// The player, the state pill, and the clock's off-screen pause.
// The element's module is part of this chunk, so <spotify-player> upgrades
// (and opens its stream) when the runtime mounts the card: `idle`, once the
// page has loaded, since the stream is worth having before the card is near.
// The player reflects whether a track is playing (its `playing` property,
// null until the first message) and fires `playstatechange` on each change:
// LIVE while one plays, PAUSED once it stops, ends or the stream closes.
// Its 4Hz progress clock is the card's only continuous work, so it is
// `paused` whenever the card is inactive (off screen or the tab hidden; the
// stream stays open, and the clock catches up the moment it resumes).
import "@tristimb/spotify-stream-player";
import type { WidgetContext } from "@whois/design-system/lib/widgets";

type Player = HTMLElement & { playing: boolean | null; paused: boolean };

export function mount(widget: HTMLElement, ctx: WidgetContext) {
	const player = widget.querySelector<Player>("spotify-player");
	const pill = widget.querySelector<HTMLElement>(".wx-np-state");
	if (!player || !pill) return;

	const set = (live: boolean) => {
		widget.classList.toggle("is-live", live);
		widget.classList.add("is-known");
		const text = live ? "live" : "paused";
		if (pill.textContent !== text) pill.textContent = text;
	};
	const onState = () => {
		// Null = the skeleton; say nothing until there's data.
		if (player.playing !== null) set(player.playing);
	};

	// The import above defined the element, so it is upgraded by now; the
	// properties exist.
	player.addEventListener("playstatechange", onState, { signal: ctx.signal });
	onState();

	// Paused until the card is seen, then whenever it stops being active.
	player.paused = true;
	ctx.whileActive(() => {
		player.paused = false;
		return () => {
			player.paused = true;
		};
	});
}
