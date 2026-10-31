// The A-List card's geometry and words, pure (no DOM), for ./fan.ts and the
// tests: the two orders the fan can take, the fan's poses, the gauge's ticks
// and genre capsules on one arc, and the readout's text.
//
// Every length here is in the mock's units: the design was drawn on a 210px
// 1×1 (/tmp/amc-mock v5 B1), and ./fan.ts scales them all by the card's own
// size (`u`), so the card is the same drawing at any cell size.
import { GENRES, type Genre } from "./genres";

export interface FilmLike {
	d: string; // YYYY-MM-DD
	g: Genre;
	u?: boolean;
}

/* ── the fan ─────────────────────────────────────────────────────────── */

/** The fan's posters, in mock units. */
export const FAN = {
	posterW: 52,
	/** The radius the posters' centres ride on, from the arc's pivot, less
	 *  half a poster's height: the pivot is R + posterH/2 under a centre. */
	R: 200,
	/** Degrees between neighbours. */
	step: 11,
	minScale: 0.74,
	/** Greyscale per step away from the centre. */
	gray: 0.6,
	/** Cards drawn either side of the centre (the last one fading). */
	visible: 2.7,
} as const;

export interface Pose {
	x: number;
	y: number;
	rotate: number; // degrees
	scale: number;
	gray: number; // 0..1
	opacity: number;
	z: number;
	hidden: boolean;
}

/** A poster `d` steps off the centre (fractional while it moves): swung
 *  round the pivot, shrunk, greyed and faded with distance. `rad` is the
 *  pivot-to-centre radius in px; `step` (degrees between neighbours) and
 *  `visible` (steps drawn either side, the last fading) are the 1×1's unless
 *  a wider card's arc (`wideArc`) says otherwise. */
export function fanPose(d: number, rad: number, step: number = FAN.step, visible: number = FAN.visible): Pose {
	const a = Math.abs(d);
	const th = (d * step * Math.PI) / 180;
	// The fade: over the last 0.7 of a step before the edge, as on the 1×1.
	const fade = visible - (FAN.visible - 2);
	return {
		x: rad * Math.sin(th),
		y: rad * (1 - Math.cos(th)),
		rotate: d * step,
		scale: Math.max(FAN.minScale, 1 - 0.14 * Math.min(a, 1) - 0.06 * Math.max(0, a - 1)),
		gray: Math.min(1, a * FAN.gray),
		opacity: a <= fade ? 1 : Math.max(0, 1 - (a - fade) / (visible - fade)),
		z: 100 - Math.round(a * 10),
		hidden: a > visible + 0.3,
	};
}

/** The most cards the fan holds, with `visible` posters either side of the
 *  centre. At rest it draws the window, the centre ±⌊visible + 0.3⌋ (±3 on a
 *  1×1: seven); a shuffle draws the posters leaving the fan and those
 *  arriving (at most a window each) plus one per stack of posters riding an
 *  identical path across it. Past this the posters nearest the edges are
 *  left out. 16 on a 1×1. */
export const poolSize = (visible: number) => 2 * (2 * Math.floor(visible + 0.3) + 1) + 2;

/** The fan and the gauge on a card wider than the mock, in mock units and
 *  degrees. `extra` is how far each half of the card reaches past the mock's
 *  105 units. */
export interface Arc {
	/** Pivot to a poster's centre. */
	rad: number;
	/** Degrees between neighbouring posters. */
	step: number;
	/** Posters drawn either side of the centre (the last one fading). */
	visible: number;
	/** The ticks' outer radius and the capsules' centre line. */
	R: number;
	capR: number;
	/** Degrees between DATE ticks, the ticks' fade-out and the capsules' spread. */
	pitch: number;
	span: number;
	capSpan: number;
}

/**
 * The 1×1's arc, widened by `extra` units a side: the fan reaches `extra`
 * further out at each end but its outermost posters drop no lower than the
 * 1×1's do, so the arc flattens (a longer radius, a pivot further down) and
 * more posters fit along it, spaced as on the 1×1. The gauge shares the new
 * pivot, keeps its ticks' spacing and reaches as far out as the fan. At
 * `extra` 0 it is the 1×1's arc exactly.
 */
export function wideArc(extra: number): Arc {
	const r = Math.PI / 180;
	const rad0 = FAN.R + FAN.posterW * 0.75;
	const th0 = FAN.visible * FAN.step * r;
	const x = rad0 * Math.sin(th0) + Math.max(0, extra);
	const drop = rad0 * (1 - Math.cos(th0));
	const th = 2 * Math.atan(drop / x);
	const rad = extra > 0 ? x / Math.sin(th) : rad0;
	const step = (FAN.step * rad0) / rad;
	const dR = rad - rad0;
	const R = GAUGE.R + dR;
	const capR = GAUGE.capR + dR;
	const e = Math.max(0, extra);
	return {
		rad,
		step,
		visible: extra > 0 ? th / r / step : FAN.visible,
		R,
		capR,
		pitch: (GAUGE.pitch * GAUGE.R) / R,
		span: (GAUGE.span * r * GAUGE.R + e) / R / r,
		capSpan: (GAUGE.capSpan * r * GAUGE.capR + e) / capR / r,
	};
}

/* ── the two orders ──────────────────────────────────────────────────── */

export interface Group {
	g: Genre;
	/** Films in it. */
	n: number;
	/** Its first film's place in the GENRE order. */
	start: number;
	/** Its place among the groups. */
	k: number;
}

/** The genres present, biggest first, ties in the buckets' own order, Other
 *  always last. */
export function genreGroups(films: readonly FilmLike[]): Group[] {
	const count = new Map<Genre, number>();
	for (const f of films) count.set(f.g, (count.get(f.g) ?? 0) + 1);
	let start = 0;
	return [...count.entries()]
		.sort(
			([a, n], [b, m]) =>
				Number(a === "Other") - Number(b === "Other") || m - n || GENRES.indexOf(a) - GENRES.indexOf(b),
		)
		.map(([g, n], k) => {
			const group = { g, n, start, k };
			start += n;
			return group;
		});
}

export interface Orders {
	/** Film indices in watch order (the data's order, which is by date). */
	date: number[];
	/** Film indices grouped by genre, watch order within a group. */
	genre: number[];
	groups: Group[];
}

export function orders(films: readonly FilmLike[]): Orders {
	const groups = genreGroups(films);
	return {
		date: films.map((_, i) => i),
		genre: groups.flatMap(({ g }) => films.flatMap((f, i) => (f.g === g ? [i] : []))),
		groups,
	};
}

/** The group a place in the GENRE order falls in. */
export function groupAt(groups: readonly Group[], at: number): Group {
	let hit = groups[0];
	for (const G of groups) if (at >= G.start) hit = G;
	return hit;
}

/** Places in the DATE order where a new year starts (not the first film):
 *  the tall ticks. */
export function yearStarts(films: readonly FilmLike[]): Set<number> {
	const out = new Set<number>();
	films.forEach((f, i) => {
		if (i > 0 && f.d.slice(0, 4) !== films[i - 1].d.slice(0, 4)) out.add(i);
	});
	return out;
}

/* ── the gauge ───────────────────────────────────────────────────────── */

/** The gauge, in mock units and degrees. It shares the fan's pivot. */
export const GAUGE = {
	/** The ticks' outer radius: just under the posters' feet. */
	R: FAN.R - 9,
	minor: 8, // a tick's length
	major: 13, // a year's
	/** Degrees between DATE ticks: evenly spaced, one per film. */
	pitch: 1.9,
	/** DATE ticks fade out towards ± this. */
	span: 26,
	/** The GENRE capsules spread over ± this. */
	capSpan: 30,
	/** A capsule's thickness (its stroke, round-capped). */
	capW: 10,
	/** The gap between two capsules. */
	capGap: 3,
	/** The shortest capsule, caps included: a pill, never a dot. */
	capMin: 17,
	/** The capsules' centre line, under the ticks. */
	capR: FAN.R - 9 - 5,
} as const;

export interface Block {
	x: number;
	w: number;
}

/**
 * `counts` laid along a length `total` in blocks ∝ count, `gap` apart, none
 * shorter than `min`: the short ones are raised to it and the rest share
 * what is left, in proportion (repeated until no block is under). If even
 * `min` each won't fit, every block is an equal share.
 */
export function capsules(total: number, gap: number, counts: readonly number[], min: number): Block[] {
	const room = Math.max(0, total - gap * (counts.length - 1));
	const pinned = new Set<number>();
	let w: number[] = counts.map(() => 0);
	if (min * counts.length >= room) {
		w = counts.map(() => room / counts.length);
	} else {
		for (;;) {
			const free = room - pinned.size * min;
			const n = counts.reduce((s, c, i) => (pinned.has(i) ? s : s + c), 0);
			w = counts.map((c, i) => (pinned.has(i) ? min : n > 0 ? (free * c) / n : 0));
			const under = w.findIndex((x, i) => !pinned.has(i) && x < min);
			if (under < 0) break;
			// Pin every block now under, at once.
			w.forEach((x, i) => {
				if (x < min) pinned.add(i);
			});
		}
	}
	let x = 0;
	return w.map((wk) => {
		const b = { x, w: wk };
		x += wk + gap;
		return b;
	});
}

export interface CapArc {
	/** The stroked run, in radians off the top (the caps reach capW/2 past it). */
	a0: number;
	a1: number;
}

/** Each group's capsule on an arc of radius `r` px, centred on the top. `u`
 *  is the px per mock unit. */
export function capArcs(groups: readonly Group[], r: number, u: number, capSpan: number = GAUGE.capSpan): CapArc[] {
	const span = (capSpan * Math.PI) / 180;
	const half = (GAUGE.capW * u) / 2;
	return capsules(2 * span * r, GAUGE.capGap * u, groups.map((G) => G.n), GAUGE.capMin * u).map((b) => {
		const a0 = (b.x + half) / r - span;
		const a1 = (b.x + b.w - half) / r - span;
		return { a0, a1: Math.max(a0 + 0.0005, a1) };
	});
}

/** The angle of the film at place `at` in the GENRE order: spread evenly
 *  over its capsule's stroked run, a lone film at its middle. */
export function genreAngle(groups: readonly Group[], arcs: readonly CapArc[], at: number): number {
	const G = groupAt(groups, at);
	const c = arcs[G.k];
	return G.n === 1 ? (c.a0 + c.a1) / 2 : c.a0 + ((c.a1 - c.a0) * (at - G.start + 0.5)) / G.n;
}

/** The inverse: the (fractional) place in the GENRE order at angle `th`,
 *  clamped to the ends. For dragging along the capsules. */
export function placeAtAngle(groups: readonly Group[], arcs: readonly CapArc[], th: number, count: number): number {
	const ts = Array.from({ length: count }, (_, i) => genreAngle(groups, arcs, i));
	if (count <= 1 || th <= ts[0]) return 0;
	if (th >= ts[count - 1]) return count - 1;
	let j = 0;
	while (ts[j + 1] < th) j++;
	return j + (th - ts[j]) / (ts[j + 1] - ts[j]);
}

/* ── dates and words ─────────────────────────────────────────────────── */

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** A YYYY-MM-DD as a calendar date (no zone: it is the theatre's day). */
export function calendar(iso: string) {
	const [y, m, d] = iso.split("-").map(Number);
	const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
	return { year: y, month: m - 1, day: d, dow };
}

/** Whole days from `today` (the visitor's local date) to the showing. */
export function daysUntil(iso: string, today: Date): number {
	const { year, month, day } = calendar(iso);
	const from = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
	return Math.round((Date.UTC(year, month, day) - from) / 864e5);
}

/** Booked and still ahead (a ticket for today counts): the fetch marks a
 *  booking, but the page may be days older than the showing. */
export const isUpcoming = (f: FilmLike, today: Date) => Boolean(f.u) && daysUntil(f.d, today) >= 0;

/** "TUE MAY 26 ’26" as its three parts: small caps, the bold date, small. */
export function dateWords(iso: string): [string, string, string] {
	const c = calendar(iso);
	return [WEEKDAYS[c.dow], `${MONTHS[c.month]} ${c.day}`, `’${String(c.year).slice(2)}`];
}

/** "IN 22 DAYS" as its three parts; "TODAY" alone on the day, "1 DAY". */
export function countdownWords(days: number): [string, string, string] {
	if (days <= 0) return ["", "Today", ""];
	return ["In", String(days), days === 1 ? "day" : "days"];
}

/** "SCI-FI 5 OF 5": the genre, the film's place in it, of how many. */
export function genreWords(G: Group, at: number): [string, string, string] {
	return [G.g, String(at - G.start + 1), `of ${G.n}`];
}

/** Interpolation helpers the fan shares with the tests. */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOut = (t: number) => 1 - (1 - t) ** 5;
export const smoothstep = (x: number, a: number, b: number) => {
	const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};
