import { activity, prefs, type Activity } from "@whois/design-system/lib/activity";
import { onFrame } from "@whois/design-system/lib/frame";

const SVG_NS = "http://www.w3.org/2000/svg";
const CONTAINER_ID = "wobble-text-filters";

/** How long the displacement takes to grow from 0 to its configured `scale` when
 *  an element first connects. The filter can only attach once its bundle has
 *  landed, so the text is already on screen, crisp, by the time this element
 *  upgrades — snapping the displacement on made the copy visibly lurch. Growing it
 *  in over a beat reads as the effect arriving rather than the text breaking. */
const RAMP_MS = 420;

/** Smoothstep, so the ramp eases at both ends instead of starting abruptly.
 *  Matches the easing idiom used by the sibling packages. */
function smoothstep(t: number): number {
	const c = Math.max(0, Math.min(1, t));
	return c * c * (3 - 2 * c);
}

/** The turbulence filter is the single most expensive thing here: every frame it
 *  animates, the browser regenerates fractal noise and re-displaces the text raster
 *  — costly on mobile GPUs. The churn (seed / baseFrequency drift) is imperceptible
 *  above ~30fps, so it is capped there and spares half the filter recomputes. The
 *  displacement ramp is driven off the same cadence and 30fps is still smooth over
 *  its 420ms entrance. */
const CHURN_FPS = 30;

/** An instance starts a little before it scrolls in, so its entrance ramp is
 *  already underway. */
const ACTIVE_MARGIN = "200px 0px";

let filterContainer: SVGSVGElement | null = null;
let instanceCount = 0;
const instances = new Set<WobbleTextElement>();

/** ONE frame callback for every instance, on the page's shared scheduler
 *  (@whois/design-system/lib/frame) at CHURN_FPS. Each instance's activity
 *  (the design system's shared observer, lib/activity) says whether it animates:
 *  on or near the screen, the tab visible, motion allowed. Inactive instances are
 *  skipped, and the callback is unregistered whenever none is active, so an
 *  idle page asks for no frames on its behalf. */
let stopLoop: (() => void) | null = null;

function tick(ts: number) {
	for (const instance of instances) {
		if (instance._animate) instance._update(ts);
	}
}

/** Run the loop only while at least one instance animates; otherwise idle. */
function syncLoop() {
	let any = false;
	for (const instance of instances) any ||= instance._animate;
	if (any && !stopLoop) {
		stopLoop = onFrame(tick, { fps: CHURN_FPS, phase: "write", label: "wobble-text" });
	} else if (!any && stopLoop) {
		stopLoop();
		stopLoop = null;
	}
}

function ensureContainer(): SVGSVGElement {
	if (filterContainer && document.body.contains(filterContainer)) return filterContainer;

	filterContainer = document.createElementNS(SVG_NS, "svg");
	filterContainer.setAttribute("id", CONTAINER_ID);
	filterContainer.style.position = "absolute";
	filterContainer.style.width = "0";
	filterContainer.style.height = "0";
	filterContainer.style.overflow = "hidden";
	document.body.appendChild(filterContainer);
	return filterContainer;
}

export class WobbleTextElement extends HTMLElement {
	private _filterId = "";
	private _filterEl: SVGFilterElement | null = null;
	private _turbulence: SVGFETurbulenceElement | null = null;
	private _displace: SVGFEDisplacementMapElement | null = null;
	/** Timestamp of the first animated frame, for the displacement ramp. Set on the
	 *  first _update rather than at connect: the rAF clock and connect time can be a
	 *  frame or more apart, and starting the ramp mid-flight would clip its head. */
	private _rampStart: number | null = null;
	/** Animating? Its activity's `animate`: within ACTIVE_MARGIN of the screen, the
	 *  tab visible, motion allowed. The loop skips instances that are false and
	 *  stops entirely when none are true. Starts false so an element connected off
	 *  screen costs nothing until it scrolls in — at which point its entrance ramp
	 *  plays, matching the develop-in-on-arrival feel. */
	_animate = false;
	private _activity: Activity | null = null;

	static get observedAttributes() {
		return ["scale", "speed", "frequency"];
	}

	get scale(): number {
		return parseFloat(this.getAttribute("scale") || "2");
	}

	get speed(): number {
		return parseFloat(this.getAttribute("speed") || "1");
	}

	get frequency(): number {
		return parseFloat(this.getAttribute("frequency") || "0.025");
	}

	/** Under reduced motion the loop never runs, so nothing would drive the ramp:
	 *  the effect must be applied at full strength up front. */
	private get prefersReducedMotion(): boolean {
		return prefs().reducedMotion;
	}

	connectedCallback() {
		this._filterId = `wobble-text-${instanceCount++}`;
		const container = ensureContainer();
		const defs = container.querySelector("defs") || container.appendChild(document.createElementNS(SVG_NS, "defs"));

		const filter = document.createElementNS(SVG_NS, "filter");
		filter.setAttribute("id", this._filterId);
		// Generous padding around the box so displaced glyphs at the edges (e.g. the
		// trailing letter at a high `scale`) aren't clipped by the filter region.
		filter.setAttribute("x", "-20%");
		filter.setAttribute("y", "-20%");
		filter.setAttribute("width", "140%");
		filter.setAttribute("height", "140%");
		filter.setAttribute("color-interpolation-filters", "linearRGB");

		const turbulence = document.createElementNS(SVG_NS, "feTurbulence");
		turbulence.setAttribute("type", "fractalNoise");
		turbulence.setAttribute("baseFrequency", `${this.frequency} ${this.frequency}`);
		turbulence.setAttribute("numOctaves", "3");
		turbulence.setAttribute("seed", "2");
		turbulence.setAttribute("result", "noise");

		const displace = document.createElementNS(SVG_NS, "feDisplacementMap");
		displace.setAttribute("in", "SourceGraphic");
		displace.setAttribute("in2", "noise");
		// Start UNDISPLACED so attaching the filter is a visual no-op; _update ramps
		// this to `scale`. Under reduced motion the loop never runs, so the value set
		// here is final — hence the conditional rather than a flat 0.
		displace.setAttribute("scale", this.prefersReducedMotion ? String(this.scale) : "0");
		displace.setAttribute("xChannelSelector", "R");
		displace.setAttribute("yChannelSelector", "G");

		filter.appendChild(turbulence);
		filter.appendChild(displace);
		defs.appendChild(filter);

		this._filterEl = filter;
		this._turbulence = turbulence;
		this._displace = displace;

		this.style.filter = `url(#${this._filterId})`;

		instances.add(this);
		// Watch rather than start the loop unconditionally: the activity flips
		// _animate and calls syncLoop(), so the loop runs only while this (or another
		// instance) is actually on screen. Under reduced motion `animate` stays false,
		// so watching is harmless there too.
		this._activity = activity(this, { margin: ACTIVE_MARGIN });
		this._activity.subscribe(({ animate }) => {
			this._animate = animate;
			syncLoop();
		});

		// Announce for symmetry with the sibling elements' *:ready events. Nothing
		// consumes this yet — the text is never hidden waiting for it, since the ramp
		// makes the effect's arrival unobtrusive on its own.
		this.dataset.ready = "true";
		this.dispatchEvent(new CustomEvent("wobble-text:ready", { bubbles: true }));
	}

	disconnectedCallback() {
		instances.delete(this);
		this._activity?.destroy();
		this._activity = null;
		this._filterEl?.remove();
		this._filterEl = null;
		this._turbulence = null;
		this._displace = null;
		this._rampStart = null;
		this._animate = false;
		this.style.filter = "";
		delete this.dataset.ready;

		// A remaining instance might be the only animating one — or none may be
		// left, in which case the loop idles.
		syncLoop();
	}

	attributeChangedCallback() {
		if (this._displace) {
			this._displace.setAttribute("scale", String(this.scale));
		}
		if (this._turbulence) {
			this._turbulence.setAttribute("baseFrequency", `${this.frequency} ${this.frequency}`);
		}
	}

	_update(ts: number) {
		if (!this._turbulence || !this._displace) return;

		// Called at CHURN_FPS (the loop's cap). The ramp is anchored to real time
		// (ts - _rampStart), so the cap changes only how often it's SAMPLED, not how
		// long it takes — its entrance stays smooth.
		const drift = Math.sin(ts * 0.0003 * this.speed) * 0.004;
		const seed = Math.floor(ts * 0.02 * this.speed) % 100;
		const freq = this.frequency;

		// Grow the displacement in on first run (see RAMP_MS). Once complete this is
		// a plain multiply by 1, so the steady state is exactly as before.
		if (this._rampStart === null) this._rampStart = ts;
		const ramp = smoothstep((ts - this._rampStart) / RAMP_MS);

		this._turbulence.setAttribute("baseFrequency", `${freq + drift} ${freq - drift * 0.5}`);
		this._turbulence.setAttribute("seed", String(seed));
		this._displace.setAttribute("scale", String(this.scale * ramp));
	}
}

if (typeof customElements !== "undefined" && !customElements.get("wobble-text")) {
	customElements.define("wobble-text", WobbleTextElement);
}
