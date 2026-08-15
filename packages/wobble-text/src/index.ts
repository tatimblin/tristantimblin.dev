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

let filterContainer: SVGSVGElement | null = null;
let instanceCount = 0;
let rafId: number | null = null;
let time = 0;
const instances = new Set<WobbleTextElement>();

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

function startLoop() {
	if (rafId !== null) return;

	const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	if (prefersReduced) return;

	const tick = (ts: number) => {
		time = ts;
		for (const instance of instances) {
			instance._update(ts);
		}
		rafId = requestAnimationFrame(tick);
	};
	rafId = requestAnimationFrame(tick);
}

function stopLoop() {
	if (rafId !== null) {
		cancelAnimationFrame(rafId);
		rafId = null;
	}
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

	/** Mirrors the guard in startLoop(): with no loop running there is nothing to
	 *  drive the ramp, so the effect must be applied at full strength up front. */
	private get prefersReducedMotion(): boolean {
		return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
		startLoop();

		// Announce for symmetry with the sibling elements' *:ready events. Nothing
		// consumes this yet — the text is never hidden waiting for it, since the ramp
		// makes the effect's arrival unobtrusive on its own.
		this.dataset.ready = "true";
		this.dispatchEvent(new CustomEvent("wobble-text:ready", { bubbles: true }));
	}

	disconnectedCallback() {
		instances.delete(this);
		this._filterEl?.remove();
		this._filterEl = null;
		this._turbulence = null;
		this._displace = null;
		this._rampStart = null;
		this.style.filter = "";
		delete this.dataset.ready;

		if (instances.size === 0) {
			stopLoop();
		}
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
