import { describe, expect, test } from "bun:test";
import {
	capArcs,
	capsules,
	countdownWords,
	dateWords,
	daysUntil,
	fanPose,
	FAN,
	GAUGE,
	genreAngle,
	genreGroups,
	genreWords,
	groupAt,
	isUpcoming,
	orders,
	placeAtAngle,
	poolSize,
	wideArc,
	yearStarts,
	type FilmLike,
} from "./arc";

const film = (d: string, g: FilmLike["g"], u?: boolean): FilmLike => ({ d, g, ...(u ? { u } : {}) });

const FILMS: FilmLike[] = [
	film("2024-01-10", "Biopic"),
	film("2024-03-13", "Sci-Fi"),
	film("2024-06-20", "Animation"),
	film("2024-12-08", "Animation"),
	film("2025-02-08", "Animation"),
	film("2025-03-17", "Sci-Fi"),
	film("2026-05-26", "Other"),
	film("2026-11-21", "Action", true),
];

describe("fanPose", () => {
	test("the centre poster is upright, full size, in colour, on top", () => {
		const p = fanPose(0, 239);
		expect(p).toMatchObject({ x: 0, y: 0, rotate: 0, scale: 1, gray: 0, opacity: 1, z: 100, hidden: false });
	});

	test("neighbours swing round the pivot, symmetric, smaller and greyer", () => {
		const l = fanPose(-1, 239);
		const r = fanPose(1, 239);
		expect(r.x).toBeCloseTo(-l.x);
		expect(r.y).toBeCloseTo(l.y);
		expect(r.x).toBeCloseTo(239 * Math.sin((FAN.step * Math.PI) / 180));
		expect(r.rotate).toBe(FAN.step);
		expect(r.scale).toBeCloseTo(0.86);
		expect(r.gray).toBeCloseTo(0.6);
		expect(r.z).toBeLessThan(100);
	});

	test("never smaller than minScale; fades past two steps; hidden past the edge", () => {
		expect(fanPose(2.7, 239).scale).toBeGreaterThanOrEqual(FAN.minScale);
		expect(fanPose(2, 239).opacity).toBe(1);
		expect(fanPose(2.35, 239).opacity).toBeCloseTo(0.5);
		expect(fanPose(2.9, 239).hidden).toBe(false);
		expect(fanPose(3.1, 239).hidden).toBe(true);
	});
});

describe("wideArc", () => {
	const deg = Math.PI / 180;
	const edgeDrop = (a: { rad: number; step: number; visible: number }) =>
		a.rad * (1 - Math.cos(a.visible * a.step * deg));

	test("no extra width is the 1×1's arc", () => {
		const a = wideArc(0);
		expect(a.rad).toBe(FAN.R + FAN.posterW * 0.75);
		expect(a.step).toBeCloseTo(FAN.step);
		expect(a.visible).toBe(FAN.visible);
		expect(a.R).toBeCloseTo(GAUGE.R);
		expect(a.capR).toBeCloseTo(GAUGE.capR);
		expect(a.pitch).toBeCloseTo(GAUGE.pitch);
		expect(a.span).toBeCloseTo(GAUGE.span);
		expect(a.capSpan).toBeCloseTo(GAUGE.capSpan);
		expect(wideArc(-20)).toEqual(a);
	});

	test("a wider card: more posters on a flatter arc, spaced and dropping as on the 1×1", () => {
		const one = wideArc(0);
		const two = wideArc(117); // a 2×1 on the homepage's desktop grid
		expect(two.visible).toBeGreaterThan(5);
		expect(two.rad).toBeGreaterThan(one.rad);
		expect(two.step).toBeLessThan(one.step);
		// Neighbours as far apart along the arc, the outermost no lower.
		expect(two.rad * two.step).toBeCloseTo(one.rad * one.step);
		expect(edgeDrop(two)).toBeCloseTo(edgeDrop(one));
		// The gauge on the same pivot, its ticks as far apart, reaching further.
		expect(two.rad - two.R).toBeCloseTo(one.rad - one.R);
		expect(two.R * two.pitch).toBeCloseTo(one.R * one.pitch);
		expect(two.R * two.span).toBeGreaterThan(one.R * one.span);
		// Wider still, more again.
		expect(wideArc(200).visible).toBeGreaterThan(two.visible);
	});

	test("the pool covers the window at rest and both windows mid-shuffle", () => {
		expect(poolSize(FAN.visible)).toBe(16);
		const v = wideArc(117).visible;
		const atRest = 2 * Math.floor(v + 0.3) + 1;
		expect(poolSize(v)).toBe(2 * atRest + 2);
	});

	test("fanPose on a wide arc fades over the last 0.7 of a step", () => {
		const { rad, step, visible } = wideArc(117);
		expect(fanPose(visible - 0.7, rad, step, visible).opacity).toBe(1);
		expect(fanPose(visible - 0.35, rad, step, visible).opacity).toBeCloseTo(0.5);
		expect(fanPose(visible + 0.4, rad, step, visible).hidden).toBe(true);
	});
});

describe("orders", () => {
	test("groups biggest first, ties in bucket order, Other last", () => {
		expect(genreGroups(FILMS).map((G) => [G.g, G.n, G.start])).toEqual([
			["Animation", 3, 0],
			["Sci-Fi", 2, 3],
			["Action", 1, 5],
			["Biopic", 1, 6],
			["Other", 1, 7],
		]);
	});

	test("DATE is the data's order; GENRE groups it, watch order within", () => {
		const o = orders(FILMS);
		expect(o.date).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(o.genre).toEqual([2, 3, 4, 1, 5, 7, 0, 6]);
	});

	test("groupAt finds the group a GENRE place falls in", () => {
		const groups = genreGroups(FILMS);
		expect(groupAt(groups, 0).g).toBe("Animation");
		expect(groupAt(groups, 2).g).toBe("Animation");
		expect(groupAt(groups, 3).g).toBe("Sci-Fi");
		expect(groupAt(groups, 7).g).toBe("Other");
	});

	test("year starts are the tall ticks, never the first film", () => {
		expect([...yearStarts(FILMS)]).toEqual([4, 6]);
		expect([...yearStarts([film("2024-01-01", "Other")])]).toEqual([]);
	});
});

describe("capsules", () => {
	test("in proportion to count, gaps between, filling the length", () => {
		const b = capsules(100, 2, [3, 1], 0);
		expect(b[0]).toEqual({ x: 0, w: 73.5 });
		expect(b[1].x).toBeCloseTo(75.5);
		expect(b[1].x + b[1].w).toBeCloseTo(100);
	});

	test("no capsule is shorter than the minimum: a pill, never a dot", () => {
		const counts = [10, 7, 7, 5, 4, 3, 3, 3]; // the real 42
		const b = capsules(173.8 + 21, 3, counts, 17);
		for (const x of b) expect(x.w).toBeGreaterThanOrEqual(17 - 1e-9);
		expect(b.at(-1)!.x + b.at(-1)!.w).toBeCloseTo(194.8);
		// The big ones keep their order of size.
		expect(b[0].w).toBeGreaterThan(b[1].w);
		expect(b[1].w).toBeCloseTo(b[2].w);
		expect(b[2].w).toBeGreaterThan(b[3].w);
	});

	test("raising one short block can push another under; both end at the minimum", () => {
		const b = capsules(60, 0, [20, 2, 3], 15);
		expect(b[1].w).toBeCloseTo(15);
		expect(b[2].w).toBeCloseTo(15);
		expect(b[0].w).toBeCloseTo(30);
	});

	test("when even the minimum won't fit, equal shares", () => {
		const b = capsules(30, 0, [5, 1, 1], 15);
		expect(b.map((x) => x.w)).toEqual([10, 10, 10]);
	});
});

describe("capsule angles", () => {
	const groups = genreGroups(FILMS);
	const r = GAUGE.capR;
	const arcs = capArcs(groups, r, 1);

	test("the capsules run left to right inside ±capSpan, apart", () => {
		const span = (GAUGE.capSpan * Math.PI) / 180;
		const half = GAUGE.capW / 2 / r;
		expect(arcs[0].a0 - half).toBeCloseTo(-span);
		expect(arcs.at(-1)!.a1 + half).toBeCloseTo(span);
		for (let k = 1; k < arcs.length; k++) expect(arcs[k].a0).toBeGreaterThan(arcs[k - 1].a1 + 2 * half);
	});

	test("a film sits inside its own capsule; a lone film at its middle", () => {
		for (let at = 0; at < FILMS.length; at++) {
			const c = arcs[groupAt(groups, at).k];
			const th = genreAngle(groups, arcs, at);
			expect(th).toBeGreaterThanOrEqual(c.a0);
			expect(th).toBeLessThanOrEqual(c.a1);
		}
		const biopic = groups.find((G) => G.g === "Biopic")!;
		const c = arcs[biopic.k];
		expect(genreAngle(groups, arcs, biopic.start)).toBeCloseTo((c.a0 + c.a1) / 2);
	});

	test("placeAtAngle inverts genreAngle, clamped at the ends", () => {
		for (let at = 0; at < FILMS.length; at++) {
			expect(placeAtAngle(groups, arcs, genreAngle(groups, arcs, at), FILMS.length)).toBeCloseTo(at);
		}
		expect(placeAtAngle(groups, arcs, -Math.PI, FILMS.length)).toBe(0);
		expect(placeAtAngle(groups, arcs, Math.PI, FILMS.length)).toBe(FILMS.length - 1);
	});
});

describe("dates and words", () => {
	const today = new Date(2026, 9, 30); // Fri Oct 30 2026, local

	test("days until a showing, by calendar day", () => {
		expect(daysUntil("2026-11-21", today)).toBe(22);
		expect(daysUntil("2026-10-30", today)).toBe(0);
		expect(daysUntil("2026-10-29", today)).toBe(-1);
		// Across the clocks going back (Nov 1, US).
		expect(daysUntil("2026-11-02", today)).toBe(3);
	});

	test("a booking is upcoming until its day has passed", () => {
		expect(isUpcoming(film("2026-11-21", "Other", true), today)).toBe(true);
		expect(isUpcoming(film("2026-10-30", "Other", true), today)).toBe(true);
		expect(isUpcoming(film("2026-10-29", "Other", true), today)).toBe(false);
		expect(isUpcoming(film("2026-11-21", "Other"), today)).toBe(false);
	});

	test("the readouts", () => {
		expect(dateWords("2026-05-26")).toEqual(["Tue", "May 26", "’26"]);
		expect(dateWords("2024-03-13")).toEqual(["Wed", "Mar 13", "’24"]);
		expect(countdownWords(22)).toEqual(["In", "22", "days"]);
		expect(countdownWords(1)).toEqual(["In", "1", "day"]);
		expect(countdownWords(0)).toEqual(["", "Today", ""]);
		const groups = genreGroups(FILMS);
		expect(genreWords(groups[1], 4)).toEqual(["Sci-Fi", "2", "of 2"]);
	});
});
