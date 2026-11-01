// The agent card: imports <cursive-terminal> from the agent's host when the
// runtime mounts the card (`near`: a screen ahead of the viewport, which is
// when the bundle used to be fetched by a near-observer of this card's own),
// swaps in the DS empty state if the bundle fails or is slow or the agent
// never answers, and reads the header's meter off the element's
// `cursive-usage` event.
import type { WidgetContext } from "@whois/design-system/lib/widgets";
import { CURSIVE_TERMINAL, LOAD_TIMEOUT_MS } from "./config";
import { usageReading, type UsageDetail } from "./cursive";

// The element's module, once per document: it defines <cursive-terminal>,
// which upgrades every copy on every later page by itself. (A failed import
// stays failed in the module map, so there is nothing to retry.)
let bundle: Promise<unknown> | null = null;

// The element's stylesheet, linked inside the card rather than the head:
// the client router drops head nodes the next page doesn't declare, while
// the card's own nodes go and come back with the card.
function stylesheet(widget: HTMLElement): Promise<void> {
	return new Promise((resolve, reject) => {
		const link = Object.assign(document.createElement("link"), {
			rel: "stylesheet",
			href: `${CURSIVE_TERMINAL}.css`,
		});
		link.addEventListener("load", () => resolve(), { once: true });
		link.addEventListener("error", () => reject(new Error(`${link.href} failed`)), { once: true });
		widget.append(link);
	});
}

export function mount(widget: HTMLElement, { signal }: WidgetContext) {
	const usage = widget.querySelector<HTMLElement>("[data-cursive-usage]");
	if (!usage) return;
	const value = usage.querySelector<HTMLElement>("[data-cursive-value]");
	const label = usage.querySelector<HTMLElement>("[data-cursive-label]");
	const [used, left] = usage.querySelectorAll<HTMLElement>(".ds-tick-ruler__seg");

	const timers = new Set<ReturnType<typeof setTimeout>>();
	const after = (ms: number, fn: () => void) => {
		const t = setTimeout(() => (timers.delete(t), fn()), ms);
		timers.add(t);
		return t;
	};
	const fail = (why: unknown) => {
		if (signal.aborted || widget.dataset.state === "failed") return;
		console.warn("[cursive] showing the empty state:", why);
		widget.dataset.state = "failed";
	};

	// The agent: the element boots and asks for /session once it is within
	// 200px of the viewport (its own observer's margin), and every
	// successful /session fires `cursive-usage`. None within the timeout
	// from there means the agent is down (the element has no error event).
	const answering = new IntersectionObserver(
		(entries) => {
			if (!entries.some((e) => e.isIntersecting)) return;
			answering.disconnect();
			after(LOAD_TIMEOUT_MS, () => {
				if (!widget.dataset.usage) fail(`no reading from the agent in ${LOAD_TIMEOUT_MS}ms`);
			});
		},
		{ rootMargin: "200px" },
	);

	const load = async () => {
		widget.dataset.state = "loading";
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = after(LOAD_TIMEOUT_MS, () => reject(new Error(`timed out after ${LOAD_TIMEOUT_MS}ms`)));
		});
		bundle ??= import(/* @vite-ignore */ `${CURSIVE_TERMINAL}.js`);
		try {
			await Promise.race([Promise.all([bundle, stylesheet(widget)]), timeout]);
			if (signal.aborted || widget.dataset.state === "failed") return;
			widget.dataset.state = "ready";
			answering.observe(widget);
		} catch (err) {
			fail(err);
		} finally {
			clearTimeout(timer);
			if (timer) timers.delete(timer);
		}
	};

	// The meter, from the event the terminal fires (bubbling) after
	// /session and after every answer.
	widget.addEventListener(
		"cursive-usage",
		(event) => {
			if (widget.dataset.state === "failed") return;
			const reading = usageReading((event as CustomEvent<UsageDetail>).detail);
			if (value) value.textContent = reading.value;
			if (label) label.textContent = reading.label;
			used?.style.setProperty("--tick-share", String(reading.share));
			left?.style.setProperty("--tick-share", String(100 - reading.share));
			widget.dataset.usage = reading.state;
		},
		{ signal },
	);

	// A reading made BEFORE this mount. On a later page of the same visit the
	// element is already defined, so the card's terminal upgrades the moment
	// the page is swapped in and can reach /session (it boots within 200px of
	// the viewport) before the runtime mounts the card — a jump straight to
	// it, say. The element keeps its last /session answer as `session`;
	// replaying it through its own reportUsage() fires the event above.
	type Terminal = HTMLElement & {
		session?: { usage?: unknown } | null;
		reportUsage?: (usage: unknown) => void;
	};
	const terminal = widget.querySelector<Terminal>("cursive-terminal");
	const usageNow = terminal?.session?.usage;
	if (usageNow && typeof terminal?.reportUsage === "function") terminal.reportUsage(usageNow);

	void load();

	return () => {
		for (const t of timers) clearTimeout(t);
		timers.clear();
		answering.disconnect();
	};
}
