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
// The bike's box and its fade are handed to CSS as custom properties
// (BikeStats.astro owns the drawing itself).

const NS = "http://www.w3.org/2000/svg";
const TICKS = 64; // around the whole perimeter, before the gap is cut
const MARGIN = 9; // the ring's outer edge from the body's edge (clear of the dashed border)
const MINOR = 6; // tick lengths, measured inward
const MAJOR = 10; // every 5th tick of the gauge
const FADE = 27; // the bike's tail fade, in px

/** Radius along the ray at angle θ of a superellipse with exponent n and
 *  half-axes a × b. */
const superellipse = (n: number, a: number, b: number) => (th: number) =>
	1 / ((Math.abs(Math.cos(th)) / a) ** n + (Math.abs(Math.sin(th)) / b) ** n) ** (1 / n);

interface Box {
	left: number;
	right: number;
	top: number;
}

/** Where the Figure's ink sits in the body: number and unit, not the Figure's
 *  full-width box. */
function inkBox(body: HTMLElement, parts: Element[]): Box {
	const b = body.getBoundingClientRect();
	const rects = parts.map((p) => p.getBoundingClientRect());
	return {
		left: Math.min(...rects.map((r) => r.left)) - b.left,
		right: Math.max(...rects.map((r) => r.right)) - b.left,
		top: Math.min(...rects.map((r) => r.top)) - b.top,
	};
}

/** Draws the ticks into `svg`, leaving out those inside `gap`, and returns
 *  them in gauge order: from just after the gap, clockwise. */
function drawTicks(svg: SVGSVGElement, w: number, h: number, gap: Box): SVGLineElement[] {
	svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
	svg.replaceChildren();
	const cx = w / 2;
	const cy = h / 2;
	const a = cx - MARGIN;
	const b = cy - MARGIN;
	const outer = superellipse(14, a, b);
	const minor = superellipse(8, a - MINOR, b - MINOR);
	const major = superellipse(8, a - MAJOR, b - MAJOR);

	// Sample the outer curve clockwise from bottom-centre (θ = π/2, y down) and
	// place the ticks at equal arc lengths along it.
	const samples: { th: number; x: number; y: number; s: number }[] = [];
	const S = 2000;
	let len = 0;
	for (let i = 0; i <= S; i++) {
		const th = Math.PI / 2 + (i / S) * 2 * Math.PI;
		const r = outer(th);
		const p = { th, x: cx + r * Math.cos(th), y: cy + r * Math.sin(th), s: 0 };
		if (i > 0) len += Math.hypot(p.x - samples[i - 1].x, p.y - samples[i - 1].y);
		p.s = len;
		samples.push(p);
	}
	const at: typeof samples = [];
	for (let i = 0, j = 0; i < TICKS; i++) {
		while (samples[j].s < (len * i) / TICKS) j++;
		at.push(samples[j]);
	}

	const inGap = (p: { x: number; y: number }) =>
		p.x >= gap.left && p.x <= gap.right && p.y >= gap.top;
	const start = Math.max(0, at.findIndex((p, i) => !inGap(p) && inGap(at[(i + TICKS - 1) % TICKS])));
	const order = at.map((_, k) => at[(start + k) % TICKS]).filter((p) => !inGap(p));

	return order.map((p, i) => {
		const inner = (i % 5 === 0 ? major : minor)(p.th);
		const r = outer(p.th);
		const line = document.createElementNS(NS, "line");
		line.setAttribute("x1", String(cx + r * Math.cos(p.th)));
		line.setAttribute("y1", String(cy + r * Math.sin(p.th)));
		line.setAttribute("x2", String(cx + inner * Math.cos(p.th)));
		line.setAttribute("y2", String(cy + inner * Math.sin(p.th)));
		svg.append(line);
		return line;
	});
}

/** Lights the gauge's first `share` of ticks. */
function light(ticks: SVGLineElement[], share: number) {
	const lit = share * (ticks.length - 1);
	ticks.forEach((t, i) => t.classList.toggle("is-lit", i <= lit));
}

/** The bike's box: nearly the body's height, its front wheel standing just
 *  above the unit's caps and clear of the right-hand ticks; the tail fades out
 *  before the left-hand ticks. Measured in the drawing's own (unflipped) space,
 *  where the front is at x = 0. */
function placeBike(body: HTMLElement, unit: Element, w: number) {
	const b = body.getBoundingClientRect();
	const u = unit.getBoundingClientRect();
	const size = parseFloat(getComputedStyle(unit).fontSize);
	const capTop = u.top - b.top + (u.height - size * 0.72) / 2;
	const top = MARGIN + 18;
	const height = Math.round(capTop - 3 - top);
	const width = Math.round((height * 1000) / 610); // the drawing's aspect
	const right = Math.round(w - MARGIN - 18);
	const fadeTo = right - (MARGIN + 16);
	const s = body.style;
	s.setProperty("--bw-bike-top", `${top}px`);
	s.setProperty("--bw-bike-left", `${right - width}px`);
	s.setProperty("--bw-bike-width", `${width}px`);
	s.setProperty("--bw-bike-height", `${height}px`);
	s.setProperty("--bw-fade-from", `${fadeTo - FADE}px`);
	s.setProperty("--bw-fade-to", `${fadeTo}px`);
}

/** Lays the ring and bike out in `widget` and keeps them fitted; returns a
 *  function that sets the gauge's share, and a teardown. */
export function mountRing(widget: HTMLElement, share: number) {
	const body = widget.querySelector<HTMLElement>(".wx-bw-body");
	const svg = widget.querySelector<SVGSVGElement>(".wx-bw-ring");
	const num = widget.querySelector(".ds-figure__num");
	const unit = widget.querySelector(".ds-figure__unit");
	if (!body || !svg || !num || !unit) return null;

	let ticks: SVGLineElement[] = [];
	let current = share;
	const layout = () => {
		const { width, height } = body.getBoundingClientRect();
		if (width === 0 || height === 0) return;
		const ink = inkBox(body, [num, unit]);
		ticks = drawTicks(svg, width, height, { left: ink.left - 8, right: ink.right + 8, top: ink.top - 8 });
		light(ticks, current);
		placeBike(body, unit, width);
	};

	layout();
	const resize = new ResizeObserver(layout);
	resize.observe(body);
	// The figure's face loads after first layout and shifts the ink.
	document.fonts?.ready.then(layout);

	return {
		setShare(next: number) {
			current = next;
			light(ticks, current);
		},
		destroy: () => resize.disconnect(),
	};
}
