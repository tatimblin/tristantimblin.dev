// Readers — read at build time (frontmatter runs in Node) from readers.json,
// which the readers GitHub Action regenerates daily (the Action's fetch script
// writes to this file's path — keep them in sync). Readers.astro consumes the
// normalized shape and the plot geometry returned from here.
//
// Vite inlines the JSON at build time, so the data is bundled with the page — no
// filesystem read or API call at render time, and no token shipped to the
// client. See tools/readers/fetch.mjs for the shape and
// .github/workflows/readers.yml for the pipeline (mirrors the github/volo
// setup).
//
// WHAT THE NUMBERS ARE. Cloudflare Web Analytics counts pageloads that actually
// executed its JavaScript beacon, so everything here is a real browser — the
// zone's own request counts for this site are ~98% crawlers and scanners and are
// deliberately not used. The figures are SAMPLED and pre-scaled by Cloudflare,
// which is why they always arrive as multiples of ten: one person is reported
// as "10". They are estimates, and the widget labels them so.
import data from "./readers.json";

export interface ReaderDay {
	date: string; // YYYY-MM-DD, UTC
	pageloads: number;
	visits: number; // pageloads that entered the site cold, rather than clicked through
}

export interface ReaderStats {
	updated: string;
	sampled: boolean;
	days: ReaderDay[];
}

// Defensive normalization: readers.json is generated, but tolerate missing or
// partial fields so a bad data file renders an empty widget rather than
// throwing the build (same contract as getGithubStats()).
export function getReaderStats(): ReaderStats {
	const raw = (data ?? {}) as Record<string, unknown>;

	const days: ReaderDay[] = Array.isArray(raw.days)
		? (raw.days as Array<Record<string, unknown>>)
				.map((day) => ({
					date: typeof day.date === "string" ? day.date : "",
					pageloads: Number(day.pageloads) || 0,
					visits: Number(day.visits) || 0,
				}))
				.filter((day) => day.date !== "")
				.sort((a, b) => a.date.localeCompare(b.date))
		: [];

	return {
		updated: typeof raw.updated === "string" ? raw.updated : "",
		sampled: raw.sampled !== false,
		days,
	};
}

/**
 * WHICH FIGURE THE TILE COUNTS.
 *
 * `visits` is Cloudflare's count of pageloads that arrived from off-site, so it
 * is one per person per visit rather than one per page they then clicked
 * through to — which is what "visitors" means, and what `pageloads` does not.
 * The two diverge sharply here: 370 pageloads over the last 30 days against 130
 * visits, because a reader who lands on the home page and opens two posts is
 * one visitor and three pageloads.
 *
 * Named once, and read by everything below, so the tile cannot end up showing a
 * total in one unit and a curve in another.
 */
export const METRIC = "visits" as const;

/** Points on every curve, whatever span it covers. */
export const POINTS = 30;

/**
 * The smallest trailing window any curve smooths over.
 *
 * The raw daily series cannot be plotted: at this site's volume roughly half of
 * all days are zero and the non-zero ones are quantized to multiples of ten, so
 * a direct line is a row of spikes between gaps rather than a shape. Summing
 * over a trailing week is what turns it into a curve — and it is also the more
 * honest reading, since a single day's figure is one or two sampled events.
 */
export const MIN_WINDOW = 7;

export interface RangeSpec {
	key: string;
	/** What the pill reads while this range is showing. */
	label: string;
	/** Days back, or Infinity for the whole ledger. */
	span: number;
}

/**
 * The ranges the pill cycles through, in order.
 *
 * Until the committed ledger is older than a year, "1 year" and "All time"
 * necessarily draw the same thing — the file is the only history there is (see
 * the merge note in tools/readers/fetch.mjs). That resolves itself by keeping
 * the Action running; it is not a case to special-case away, because the two
 * ARE the same answer today and the tile should not pretend otherwise.
 */
export const RANGES: RangeSpec[] = [
	{ key: "30d", label: "30 days", span: 30 },
	{ key: "1y", label: "1 year", span: 365 },
	{ key: "all", label: "All time", span: Number.POSITIVE_INFINITY },
];

export interface SeriesPoint {
	date: string; // the day the window ENDS on
	from: string; // the day it STARTS on — carried, not derived, see buildView
	value: number;
	x: number; // 0–100, left to right
	y: number; // 0–100, top to bottom (SVG convention)
}

export interface RangeView extends RangeSpec {
	/** Visitors across the whole range — the headline figure. */
	total: number;
	/** Days each plotted point sums. */
	window: number;
	/** Days the range actually covers, which is capped by how much history exists. */
	covered: number;
	points: SeriesPoint[];
	peak: SeriesPoint | null;
}

// The plot is drawn in an abstract 100-unit box and stretched to whatever width
// the tile gives it (preserveAspectRatio="none"), so everything below is pure
// arithmetic with no layout in it. Strokes opt out of that stretch — see the
// vector-effect in readers.css — or they would smear horizontally.
//
// PAD_TOP keeps the peak clear of the tile's top edge. The marker and its value
// chip are HTML positioned over the SVG in percentages (they cannot live INSIDE
// it: preserveAspectRatio="none" scales the two axes differently, which would
// stretch any text drawn in the same coordinate space), and the chip hangs below
// its point, so the headroom is for the dot alone.
const PAD_TOP = 16;
const BASELINE = 100;

/**
 * One range's curve: a trailing sum, sampled to POINTS evenly-spaced readings.
 *
 * The window scales with the span rather than staying at a week. Thirty points
 * across a year sit about twelve days apart, and a 7-day window at that spacing
 * would sample twelve days and draw seven of them — a curve made of the gaps
 * between its own readings. At 2.5× the spacing each window overlaps its
 * neighbours by more than half, which is what makes the line continuous instead
 * of a dot-to-dot. The floor holds the short ranges at a week.
 */
export function buildView(days: ReaderDay[], spec: RangeSpec): RangeView {
	const covered = Math.min(spec.span, days.length);
	const step = covered / POINTS;
	const window = Math.max(MIN_WINDOW, Math.round(step * 2.5));

	// The total is the range as named, and nothing else.
	const slice = days.slice(-covered);
	const total = slice.reduce((sum, day) => sum + day[METRIC], 0);

	// The CURVE reads further back than the range does — `window - 1` days
	// further — so that its first plotted point already has a full window behind
	// it. Summing only within the range instead would mean the earliest points
	// were partial sums, and the old remedy for that was to drop them: a face
	// labelled "30 days" then drew 24 of them. The lead-in buys the same
	// correctness without shortening what is shown.
	const lead = Math.min(days.length, covered + window - 1);
	const withLead = days.slice(-lead);

	const trailing = withLead.map((day, i) => {
		const start = Math.max(0, i - window + 1);
		let sum = 0;
		for (let j = start; j <= i; j++) sum += withLead[j][METRIC];
		// The start date is TAKEN FROM THE RECORD rather than computed by
		// subtracting the window from the end date. The two agree wherever a full
		// window exists; where one does not — the very start of the ledger — only
		// this one names a day the site actually has data for.
		return { date: day.date, from: withLead[start].date, value: sum };
	});

	const inRange = trailing.slice(-covered);

	// When the ledger is too young to have supplied the lead-in, the earliest
	// points are still partial and ramp up from nothing — a rise that never
	// happened. Drop them, but only while enough is left to be worth plotting.
	const hasLead = lead === covered + window - 1;
	const usable =
		hasLead || inRange.length < window * 2 ? inRange : inRange.slice(window - 1);

	// Evenly-spaced readings, always including both ends. Fewer than POINTS when
	// the ledger is younger than the curve is wide.
	const count = Math.min(POINTS, usable.length);
	const sampled = Array.from({ length: count }, (_, i) => {
		const at = count === 1 ? 0 : Math.round((i * (usable.length - 1)) / (count - 1));
		return usable[at];
	});

	const max = Math.max(...sampled.map((point) => point.value), 0);
	const spread = Math.max(1, sampled.length - 1);

	const points: SeriesPoint[] = sampled.map((point, i) => ({
		date: point.date,
		from: point.from,
		value: point.value,
		x: (i / spread) * 100,
		// A flat all-zero series sits on the baseline rather than dividing by zero.
		y: max === 0 ? BASELINE : PAD_TOP + (1 - point.value / max) * (BASELINE - PAD_TOP),
	}));

	// The LAST of the tied maxima, not the first: when the curve plateaus, the
	// interesting end of the plateau is the recent one, and a marker on the left
	// edge of a flat top reads as though the peak has already passed.
	let peak: SeriesPoint | null = null;
	for (const point of points) {
		if (max > 0 && point.value === max) peak = point;
	}

	return { ...spec, total, window, covered, points, peak };
}

export function buildViews(days: ReaderDay[]): RangeView[] {
	return RANGES.map((spec) => buildView(days, spec));
}

/** Whether a view has enough of a curve to draw. */
export const isDrawable = (view: RangeView): boolean =>
	view.points.length > 1 && view.peak !== null;

/**
 * A smooth curve through every point (Catmull-Rom converted to cubic Béziers).
 *
 * Catmull-Rom is the spline that passes THROUGH its control points rather than
 * near them, which is what a data line has to do — a plain Bézier smoothing
 * would round off the peak and the marker would no longer sit on the curve it
 * annotates. Each segment's two control points are derived from the neighbours
 * on either side at the standard 1/6 tension.
 *
 * Control points are clamped to the box. Catmull-Rom overshoots on either side
 * of a sharp spike, and an unclamped overshoot sends the area fill below its own
 * baseline, which paints a bulge under the chart.
 */
export function smoothPath(points: SeriesPoint[]): string {
	if (points.length === 0) return "";
	if (points.length === 1) return `M${round(points[0].x)},${round(points[0].y)}`;

	const clamp = (value: number) => Math.min(BASELINE, Math.max(0, value));
	let d = `M${round(points[0].x)},${round(points[0].y)}`;

	for (let i = 0; i < points.length - 1; i++) {
		const p0 = points[i - 1] ?? points[i];
		const p1 = points[i];
		const p2 = points[i + 1];
		const p3 = points[i + 2] ?? p2;

		const c1x = p1.x + (p2.x - p0.x) / 6;
		const c1y = clamp(p1.y + (p2.y - p0.y) / 6);
		const c2x = p2.x - (p3.x - p1.x) / 6;
		const c2y = clamp(p2.y - (p3.y - p1.y) / 6);

		d += `C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(p2.x)},${round(p2.y)}`;
	}

	return d;
}

/** The same curve, closed down to the baseline so it can be filled. */
export function areaPath(points: SeriesPoint[]): string {
	if (points.length === 0) return "";
	const line = smoothPath(points);
	const first = points[0];
	const last = points[points.length - 1];
	return `${line}L${round(last.x)},${BASELINE}L${round(first.x)},${BASELINE}Z`;
}

const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Where the peak chip pins itself.
 *
 * Centred under its dot normally; near a card edge the chip is pinned by that
 * edge instead, because .ds-card clips its overflow and a centred chip would
 * simply be cut in half. The chip's width is not known at build time, so
 * changing which edge is pinned is the only reliable way to keep it inside.
 */
export const chipAnchor = (peak: SeriesPoint | null): "start" | "center" | "end" =>
	peak == null ? "center" : peak.x > 70 ? "end" : peak.x < 30 ? "start" : "center";

/**
 * 1,204 from 1204.
 *
 * Hand-grouped rather than toLocaleString: the build runs on a CI box whose
 * locale is not the reader's, and half of Europe would get 1.204 — which reads
 * as a decimal to everyone else. Same reason MONTHS below is a literal.
 */
export function formatCount(value: number): string {
	return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * Month names, hand-held rather than reached for through Date +
 * toLocaleDateString: the build runs on a CI box whose locale and timezone are
 * not the reader's, and parsing a bare date as local time moves it a day in
 * half the world. Every date in this module stays a string for the same
 * reason. Same discipline as formatCount().
 */
const MONTHS = [
	"Jan", "Feb", "Mar", "Apr", "May", "Jun",
	"Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "Aug 13 - 19" from a window's first and last day.
 *
 * The month is named once. A window that crosses one reads "Aug 30 - 6", which
 * is unambiguous at this length — nobody reads a seven-day span as running
 * backwards through the month — and it keeps the chip narrow, which is the
 * whole reason the peak marker can sit near an edge without being clipped.
 *
 * Past a fortnight that stops being true: the year range widens its window to
 * about a month once there is a year of ledger to draw, and "Aug 20 - 19" says
 * nothing at all. So the long form names both months. That branch is
 * unreachable today — every range still smooths over a week — and it is here so
 * the label does not quietly start lying the month this file turns one.
 */
export function formatSpan(from: string, to: string): string {
	const [, fromMonth, fromDay] = from.split("-");
	const [, toMonth, toDay] = to.split("-");
	const fromName = MONTHS[Number(fromMonth) - 1];
	const toName = MONTHS[Number(toMonth) - 1];
	if (!fromName || !toName) return `${from} - ${to}`;

	const head = `${fromName} ${Number(fromDay)}`;
	const sameMonth = fromMonth === toMonth;
	const shortSpan = daysBetween(from, to) <= 14;

	return sameMonth || shortSpan
		? `${head} - ${Number(toDay)}`
		: `${head} - ${toName} ${Number(toDay)}`;
}

/** Whole days from one ISO date to another. Both are UTC, so no zone maths. */
function daysBetween(from: string, to: string): number {
	const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
	return Math.round(ms / 86_400_000);
}
