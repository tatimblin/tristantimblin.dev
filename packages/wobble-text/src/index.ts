const SVG_NS = "http://www.w3.org/2000/svg";
const CONTAINER_ID = "wobble-text-filters";

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
		displace.setAttribute("scale", String(this.scale));
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
	}

	disconnectedCallback() {
		instances.delete(this);
		this._filterEl?.remove();
		this._filterEl = null;
		this._turbulence = null;
		this._displace = null;
		this.style.filter = "";

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

		this._turbulence.setAttribute("baseFrequency", `${freq + drift} ${freq - drift * 0.5}`);
		this._turbulence.setAttribute("seed", String(seed));
		this._displace.setAttribute("scale", String(this.scale));
	}
}

if (typeof customElements !== "undefined" && !customElements.get("wobble-text")) {
	customElements.define("wobble-text", WobbleTextElement);
}
