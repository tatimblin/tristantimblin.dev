// Baywheels stats — read at build time (frontmatter runs in Node) from the CSV
// that the baywheels-stats GitHub Action appends to daily (the Action writes to
// this file's path — keep them in sync). BikeStats.astro consumes the normalized
// shape returned by getBikeStats().
//
// CSV schema: `date,rides,distance,duration`
//   date     — YYYY-MM-DD
//   rides    — integer count
//   distance — miles (float; the API's totalDistance.value)
//   duration — seconds (float/int)
// Vite inlines the CSV contents as a string at build time, so the data is
// bundled with the page — no filesystem read at render time.
import csv from "./bike-stats.csv?raw";

interface Row {
	date: string;
	rides: number;
	distance: number;
	duration: number;
}

export interface BikeStats {
	rides: number;
	miles: number;
	hours: number;
	date: string;
	relativeDate: string; // "Today" | "Yesterday" | "N days ago"
	freshness: "green" | "yellow" | "red" | "gray";
	/** Running ride total at HISTORY_SAMPLES evenly spaced moments from the
	 *  first snapshot to the latest, oldest first — the widget's hairline graph. */
	history: number[];
	/** The first snapshot's date (YYYY-MM-DD): where `history` starts. */
	since: string;
}

// Enough bars to read as a rising line, few enough that the graph's 1px bars
// and their gaps still fit a ~160px phone tile.
const HISTORY_SAMPLES = 24;

// The CSV holds running TOTALS on the days the Action happened to run, with
// gaps of up to a few months. So the graph plots the total itself, sampled on an
// even clock and linearly interpolated between the snapshots either side: a gap
// becomes a straight ramp, which claims nothing the data doesn't. Per-period
// ride counts would have to invent how a gap's rides were spread.
function sampleHistory(rows: Row[], samples: number): number[] {
	const pts = rows
		.map((r) => ({ t: new Date(r.date).getTime(), v: r.rides }))
		.filter((p) => Number.isFinite(p.t))
		.sort((a, b) => a.t - b.t);
	if (pts.length === 0) return [];
	const t0 = pts[0].t;
	const t1 = pts[pts.length - 1].t;
	if (pts.length === 1 || t1 === t0) return [pts[0].v];
	const out: number[] = [];
	let j = 0;
	for (let i = 0; i < samples; i++) {
		const t = t0 + ((t1 - t0) * i) / (samples - 1);
		while (j < pts.length - 2 && pts[j + 1].t < t) j++;
		const a = pts[j];
		const b = pts[j + 1];
		const f = Math.min(Math.max((t - a.t) / (b.t - a.t), 0), 1);
		out.push(Math.round(a.v + (b.v - a.v) * f));
	}
	return out;
}

// Minimal CSV parse — the file is a flat numeric table with a header row, so a
// hand-rolled split avoids pulling in a parser dependency.
function parse(csv: string): Row[] {
	const lines = csv.split(/\r?\n/).filter((l) => l.trim() !== "");
	return lines
		.slice(1) // drop header
		.map((line) => {
			const [date, rides, distance, duration] = line.split(",");
			return {
				date: date?.trim() ?? "",
				rides: Number(rides),
				distance: Number(distance),
				duration: Number(duration),
			};
		})
		.filter((r) => r.date !== "" && Number.isFinite(r.rides));
}

// Whole days between the ride date and today, both floored to local midnight.
function dayDiff(dateStr: string): number | null {
	if (!dateStr) return null;
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const rideDate = new Date(dateStr);
	if (Number.isNaN(rideDate.getTime())) return null;
	rideDate.setHours(0, 0, 0, 0);
	return Math.floor((today.getTime() - rideDate.getTime()) / 86_400_000);
}

function relativeDate(diff: number | null): string {
	if (diff === null) return "";
	if (diff <= 0) return "Today";
	if (diff === 1) return "Yesterday";
	return `${diff} days ago`;
}

function freshness(diff: number | null): BikeStats["freshness"] {
	if (diff === null) return "gray";
	if (diff <= 1) return "green";
	if (diff <= 7) return "yellow";
	return "red";
}

export function getBikeStats(): BikeStats {
	const rows = parse(csv);

	// Pick the newest row by date. The writer now upserts one sorted row per
	// date, so the last line is already the newest — but max-date is kept as a
	// cheap safeguard against any stray ordering regression in the write path.
	const latest = rows.reduce((max, r) =>
		new Date(r.date) > new Date(max.date) ? r : max,
	);

	const diff = dayDiff(latest.date);
	return {
		rides: latest.rides,
		miles: Math.floor(latest.distance),
		hours: Math.floor(latest.duration / 3600),
		date: latest.date,
		relativeDate: relativeDate(diff),
		freshness: freshness(diff),
		history: sampleHistory(rows, HISTORY_SAMPLES),
		since: rows.reduce((min, r) =>
			new Date(r.date) < new Date(min.date) ? r : min,
		).date,
	};
}
