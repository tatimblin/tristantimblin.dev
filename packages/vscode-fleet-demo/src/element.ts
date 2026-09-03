const IFRAME_SRC = "/fleet-demo/index.html";
const READY_TIMEOUT_MS = 60_000;
const MIN_VIEWPORT = "(min-width: 768px)";

type DemoState = "poster" | "priming" | "launching" | "ready" | "error" | "unsupported";

/**
 * <fleet-demo> — click-to-run VS Code embed.
 *
 * The consumer authors the poster in light DOM (a picture plus a
 * `[data-launch]` button, optionally `[data-poster]` wrapping the visual and
 * `[data-caption]` for the small-viewport note). The element enhances that
 * markup: it prefetches the workbench page when scrolled near, swaps in an
 * iframe on click, tracks boot progress messages from the iframe, and only
 * reveals the workbench once the extension's vehicle tree has really
 * rendered. Without JavaScript the poster is just a poster — nothing breaks.
 *
 * State machine (reflected as `data-state` for CSS):
 *   poster → priming → launching → ready
 *                          ↘ error (timeout or iframe-reported) → retry → launching
 *   unsupported (viewport < 768px) at any pre-launch point, re-evaluated live.
 *
 * The workbench needs real horizontal room; below 768px the poster stays,
 * the launch button is disabled, and the caption explains why.
 */
export class FleetDemoElement extends HTMLElement {
	private launchButton: HTMLButtonElement | null = null;
	private iframe: HTMLIFrameElement | null = null;
	private progressBar: HTMLElement | null = null;
	private progressFill: HTMLElement | null = null;
	private errorNote: HTMLElement | null = null;
	private prefetchLink: HTMLLinkElement | null = null;
	private observer: IntersectionObserver | null = null;
	private viewportQuery: MediaQueryList | null = null;
	private abortController: AbortController | null = null;
	private readyTimeout: ReturnType<typeof setTimeout> | null = null;
	private listeners: Array<() => void> = [];
	private launched = false;

	connectedCallback() {
		this.abortController = new AbortController();
		this.launchButton = this.querySelector<HTMLButtonElement>("[data-launch]");

		this.viewportQuery = window.matchMedia(MIN_VIEWPORT);
		const onViewportChange = () => this.applyViewportGate();
		this.viewportQuery.addEventListener("change", onViewportChange);
		this.listeners.push(() => this.viewportQuery?.removeEventListener("change", onViewportChange));

		if (this.launchButton) {
			const onLaunch = () => this.launch();
			this.launchButton.addEventListener("click", onLaunch);
			this.listeners.push(() => this.launchButton?.removeEventListener("click", onLaunch));
		}

		// Prefetch the workbench page once the element scrolls near the viewport;
		// the browser pipelines the rest of the chunk graph on actual launch.
		this.observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) this.prime();
			},
			{ rootMargin: "200px" }
		);
		this.observer.observe(this);

		this.applyViewportGate();
	}

	disconnectedCallback() {
		this.abortController?.abort();
		this.abortController = null;
		this.observer?.disconnect();
		this.observer = null;
		if (this.readyTimeout !== null) clearTimeout(this.readyTimeout);
		this.readyTimeout = null;
		this.listeners.forEach((off) => off());
		this.listeners = [];
		this.iframe?.remove();
		this.iframe = null;
		this.progressBar?.remove();
		this.progressBar = null;
		this.progressFill = null;
		this.errorNote?.remove();
		this.errorNote = null;
		this.prefetchLink?.remove();
		this.prefetchLink = null;
		this.launched = false;
		this.removeAttribute("data-state");
	}

	private get state(): DemoState {
		return (this.getAttribute("data-state") as DemoState) ?? "poster";
	}

	private setState(state: DemoState) {
		this.setAttribute("data-state", state);
	}

	/** Viewport gate: too narrow → unsupported (unless already running). */
	private applyViewportGate() {
		if (this.launched) return;
		if (this.viewportQuery?.matches) {
			if (this.state === "unsupported") this.setState("poster");
			this.launchButton?.removeAttribute("disabled");
		} else {
			this.setState("unsupported");
			this.launchButton?.setAttribute("disabled", "");
		}
	}

	/** Near-viewport warmup: prefetch the iframe document, once. */
	private prime() {
		this.observer?.disconnect();
		this.observer = null;
		if (this.prefetchLink != null || this.launched) return;
		if (this.state === "poster") this.setState("priming");
		const link = document.createElement("link");
		link.rel = "prefetch";
		link.href = IFRAME_SRC;
		document.head.appendChild(link);
		this.prefetchLink = link;
	}

	private launch() {
		if (this.launched || !this.viewportQuery?.matches) return;
		this.launched = true;
		this.errorNote?.remove();
		this.errorNote = null;
		this.setState("launching");
		this.launchButton?.setAttribute("disabled", "");

		const iframe = document.createElement("iframe");
		iframe.src = IFRAME_SRC;
		iframe.title = "Fleet demo — VS Code";
		iframe.loading = "eager";
		iframe.allow = "clipboard-write";
		iframe.setAttribute("data-fleet-demo-frame", "");
		this.appendChild(iframe);
		this.iframe = iframe;

		this.mountProgressBar();

		window.addEventListener(
			"message",
			(event: MessageEvent) => {
				if (this.iframe == null || event.source !== this.iframe.contentWindow) return;
				const data = event.data as { type?: string; pct?: number; message?: string } | null;
				switch (data?.type) {
					case "fleet-demo:progress":
						this.setProgress(typeof data.pct === "number" ? data.pct : null);
						break;
					case "fleet-demo:ready":
						this.onReady();
						break;
					case "fleet-demo:error":
						this.onError();
						break;
				}
			},
			{ signal: this.abortController?.signal }
		);

		this.readyTimeout = setTimeout(() => this.onError(), READY_TIMEOUT_MS);
	}

	private mountProgressBar() {
		const bar = document.createElement("div");
		bar.className = "fleet-demo-progress";
		bar.setAttribute("role", "progressbar");
		bar.setAttribute("aria-label", "Starting VS Code");
		bar.setAttribute("aria-valuemin", "0");
		bar.setAttribute("aria-valuemax", "100");
		const fill = document.createElement("div");
		fill.className = "fleet-demo-progress-fill";
		bar.appendChild(fill);
		this.appendChild(bar);
		this.progressBar = bar;
		this.progressFill = fill;
		this.setProgress(5);
	}

	private setProgress(pct: number | null) {
		if (pct == null || this.progressFill == null || this.progressBar == null) return;
		const clamped = Math.max(0, Math.min(100, pct));
		this.progressFill.style.width = `${clamped}%`;
		this.progressBar.setAttribute("aria-valuenow", String(clamped));
	}

	private onReady() {
		if (this.readyTimeout !== null) clearTimeout(this.readyTimeout);
		this.readyTimeout = null;
		this.progressBar?.remove();
		this.progressBar = null;
		this.progressFill = null;
		this.setState("ready");
	}

	private onError() {
		if (this.readyTimeout !== null) clearTimeout(this.readyTimeout);
		this.readyTimeout = null;
		this.launched = false;
		this.iframe?.remove();
		this.iframe = null;
		this.progressBar?.remove();
		this.progressBar = null;
		this.progressFill = null;
		this.setState("error");
		this.launchButton?.removeAttribute("disabled");

		if (this.errorNote == null) {
			const note = document.createElement("div");
			note.className = "fleet-demo-error";
			note.setAttribute("role", "alert");
			const text = document.createElement("span");
			text.textContent = "The demo didn’t start.";
			const retry = document.createElement("button");
			retry.type = "button";
			retry.textContent = "Try again";
			retry.setAttribute("data-retry", "");
			retry.addEventListener("click", () => this.launch(), {
				signal: this.abortController?.signal
			});
			note.append(text, retry);
			this.appendChild(note);
			this.errorNote = note;
		}
	}
}

if (!customElements.get("fleet-demo")) {
	customElements.define("fleet-demo", FleetDemoElement);
}
