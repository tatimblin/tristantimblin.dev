// The Bay Wheels card's tick ring and bike, laid out against the card as drawn.
//
// The ring is a progress gauge of radial hairline ticks on a squared rounded
// rectangle (a superellipse) just inside the card body. The outer ends follow
// a squarer curve than the inner ends, so the ticks reach into the corners and
// stretch there. The run under the miles Figure is left open, and the gauge
// starts just after that gap and runs clockwise back to it, lit up to the
// share (lifetime miles over a US crossing, or a lap of the Earth).
//
// Both need the real geometry: the body's size and where the Figure's ink sits,
// which follow the type scale and the card's width. So they're laid out here,
// after layout and again whenever the body resizes, rather than at build.
// Every length is a multiple of the body's padding (--widget-pad, which
// scales with the card), so the ring and the bike scale with it too.

const NS = "http://www.w3.org/2000/svg";
const TICKS = 64; // around the whole perimeter, before the gap is cut
const MAJOR_EVERY = 5;
const SAMPLES = 2000; // points along the outer curve, for arc length
/** A capital's height as a share of the font size (DM Sans / Roboto Mono). */
const CAP_HEIGHT = 0.72;

/** Lengths, in units of the body's padding. */
const RING_INSET = 0.55; // the ring's outer edge from the body's edge
const MINOR_LENGTH = 0.4;
const MAJOR_LENGTH = 0.65;
const GAP_PAD = 0.5; // clearance round the Figure's ink
const BIKE_INSET = 1.7; // the bike's top and right edges from the body's
const BIKE_CLEARANCE = 0.2; // between the front wheel and the unit's caps
const FADE_LENGTH = 1.7; // the tail's fade; it ends a ring inset + one pad in

interface Point {
	th: number;
	x: number;
	y: number;
}

/** Radius along the ray at angle θ of a superellipse with exponent n and
 *  half-axes a × b. */
const superellipse = (n: number, a: number, b: number) => (th: number) =>
	1 / ((Math.abs(Math.cos(th)) / a) ** n + (Math.abs(Math.sin(th)) / b) ** n) ** (1 / n);

/** The ticks in gauge order: from the first one after the gap, clockwise,
 *  without those in it. With no gap, from the first. Pure, for the tests. */
export function gaugeOrder<T>(points: T[], inGap: (p: T) => boolean): T[] {
	const n = points.length;
	const start = points.findIndex((p, i) => !inGap(p) && inGap(points[(i + n - 1) % n]));
	return points.map((_, k) => points[(Math.max(0, start) + k) % n]).filter((p) => !inGap(p));
}

/** How many of `n` ticks a share lights: none at 0, all at 1. */
export const litCount = (share: number, n: number) => Math.round(share * n);

/** `TICKS` points at equal arc lengths along `curve`, clockwise from
 *  bottom-centre (θ = π/2, with y pointing down). */
function placeTicks(curve: (th: number) => number, cx: number, cy: number): Point[] {
	const samples: (Point & { s: number })[] = [];
	let len = 0;
	for (let i = 0; i <= SAMPLES; i++) {
		const th = Math.PI / 2 + (i / SAMPLES) * 2 * Math.PI;
		const r = curve(th);
		const p = { th, x: cx + r * Math.cos(th), y: cy + r * Math.sin(th), s: 0 };
		if (i > 0) len += Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y);
		p.s = len;
		samples.push(p);
	}
	const ticks: Point[] = [];
	for (let i = 0, j = 0; i < TICKS; i++) {
		while (samples[j].s < (len * i) / TICKS) j++;
		ticks.push(samples[j]);
	}
	return ticks;
}

/** Lays the ring and bike out in `widget` and keeps them fitted. Returns the
 *  share setter and a teardown, or null when the card isn't there. */
export function mountRing(widget: HTMLElement, share: number) {
	const body = widget.querySelector<HTMLElement>(".wx-bw-body");
	const svg = widget.querySelector<SVGSVGElement>(".wx-bw-ring");
	const bike = widget.querySelector<HTMLElement>(".wx-bw-bike");
	const num = widget.querySelector(".ds-figure__num");
	const unit = widget.querySelector(".ds-figure__unit");
	if (!body || !svg || !bike || !num || !unit) return null;

	let ticks: SVGLineElement[] = [];
	let current = share;
	let live = true;

	const light = () => {
		const lit = litCount(current, ticks.length);
		ticks.forEach((t, i) => t.classList.toggle("is-lit", i < lit));
	};

	const layout = () => {
		const box = body.getBoundingClientRect();
		const { width: w, height: h } = box;
		if (!live || w === 0 || h === 0) return;
		const pad = parseFloat(getComputedStyle(body).paddingInlineStart);
		const inset = RING_INSET * pad;

		// The Figure's ink (number and unit, not its full-width box), padded.
		const rects = [num, unit].map((el) => el.getBoundingClientRect());
		const gap = {
			left: Math.min(...rects.map((r) => r.left)) - box.left - GAP_PAD * pad,
			right: Math.max(...rects.map((r) => r.right)) - box.left + GAP_PAD * pad,
			top: Math.min(...rects.map((r) => r.top)) - box.top - GAP_PAD * pad,
		};
		const inGap = (p: Point) => p.x >= gap.left && p.x <= gap.right && p.y >= gap.top;

		const cx = w / 2;
		const cy = h / 2;
		const a = cx - inset;
		const b = cy - inset;
		const outer = superellipse(14, a, b);
		const minor = superellipse(8, a - MINOR_LENGTH * pad, b - MINOR_LENGTH * pad);
		const major = superellipse(8, a - MAJOR_LENGTH * pad, b - MAJOR_LENGTH * pad);

		svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		ticks = gaugeOrder(placeTicks(outer, cx, cy), inGap).map((p, i) => {
			const r0 = outer(p.th);
			const r1 = (i % MAJOR_EVERY === 0 ? major : minor)(p.th);
			const line = document.createElementNS(NS, "line");
			line.setAttribute("x1", String(cx + r0 * Math.cos(p.th)));
			line.setAttribute("y1", String(cy + r0 * Math.sin(p.th)));
			line.setAttribute("x2", String(cx + r1 * Math.cos(p.th)));
			line.setAttribute("y2", String(cy + r1 * Math.sin(p.th)));
			return line;
		});
		svg.replaceChildren(...ticks);
		light();

		// The bike: from the left ring inset to BIKE_INSET off the right, its
		// front wheel standing just above the unit's caps. The mask is anchored
		// at the front (left, before the flip) and contained, so the drawing
		// keeps its own proportions within the box; the tail fades out a ring
		// inset and a pad in from the left, measured from the front.
		const u = unit.getBoundingClientRect();
		const capTop = u.top - box.top + (u.height - parseFloat(getComputedStyle(unit).fontSize) * CAP_HEIGHT) / 2;
		const right = BIKE_INSET * pad;
		const bottom = h - capTop + BIKE_CLEARANCE * pad;
		bike.style.inset = `${right}px ${right}px ${bottom}px ${inset}px`;
		const fadeTo = w - right - inset - pad;
		bike.style.setProperty("--bw-fade-from", `${fadeTo - FADE_LENGTH * pad}px`);
		bike.style.setProperty("--bw-fade-to", `${fadeTo}px`);
	};

	layout();
	const resize = new ResizeObserver(layout);
	resize.observe(body);
	// The Figure's face can land after first layout and move its ink.
	document.fonts?.ready.then(layout);

	return {
		setShare(next: number) {
			current = next;
			light();
		},
		destroy() {
			live = false;
			resize.disconnect();
		},
	};
}
