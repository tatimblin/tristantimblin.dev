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
// Every row is a LIFETIME total as of that day, not the day's riding: the
// difference between two rows is what was ridden between them.
// Vite inlines the CSV contents as a string at build time, so the data is
// bundled with the page — no filesystem read at render time.
import csv from "../../data/bike-stats.csv?raw";

interface Row {
	date: string;
	distance: number;
	duration: number;
}

/** The distances the card's ring measures the lifetime miles against. */
const COAST_TO_COAST_MILES = 2900; // San Francisco to New York by road
const EARTH_MILES = 24901; // the equator

/** The ring's two readings: lifetime miles as a share of each distance, at
 *  most the whole way. */
export const ringShares = (miles: number) => ({
	us: Math.min(1, miles / COAST_TO_COAST_MILES),
	earth: Math.min(1, miles / EARTH_MILES),
});

/** "57%", "6.6%": a decimal only where a whole percent would round it away. */
export const percent = (share: number) => `${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%`;

export interface BikeStats {
	/** Lifetime miles, whole. */
	miles: number;
	/** Average speed over the latest month with riding in it (mph). */
	mph: number;
}

// Minimal CSV parse — the file is a flat numeric table with a header row, so a
// hand-rolled split avoids pulling in a parser dependency.
function parse(text: string): Row[] {
	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
	return lines
		.slice(1) // drop header
		.map((line) => {
			const [date, , distance, duration] = line.split(","); // rides: not shown
			return {
				date: date?.trim() ?? "",
				distance: Number(distance),
				duration: Number(duration),
			};
		})
		.filter((r) => r.date !== "" && Number.isFinite(r.distance) && Number.isFinite(r.duration));
}

/** Average speed over the newest month with riding in it: the miles and time
 *  between consecutive rows, each gap credited to the LATER row's month, summed
 *  for that month. Null when no two rows differ (one row, or no riding yet). */
function latestMonthMph(rows: Row[]): number | null {
	let month: string | null = null;
	let miles = 0;
	let secs = 0;
	for (let i = rows.length - 1; i > 0; i--) {
		const dm = rows[i].distance - rows[i - 1].distance;
		const ds = rows[i].duration - rows[i - 1].duration;
		if (dm <= 0 || ds <= 0) continue;
		const m = rows[i].date.slice(0, 7);
		if (month === null) month = m;
		else if (m !== month) break;
		miles += dm;
		secs += ds;
	}
	return secs > 0 ? miles / (secs / 3600) : null;
}

/** The newest reading, or null when the CSV has no rows (a fresh or
 *  truncated file must not fail the build; the widget is left out). */
export function getBikeStats(text: string = csv): BikeStats | null {
	// Sorted by date (YYYY-MM-DD compares as a string). The writer upserts one
	// sorted row per date; the sort is a cheap guard against a stray reorder.
	const rows = parse(text).sort((a, b) => a.date.localeCompare(b.date));
	if (rows.length === 0) return null;
	const latest = rows[rows.length - 1];

	// Falls back to the lifetime average when there's no month to measure.
	const lifetime = latest.duration > 0 ? latest.distance / (latest.duration / 3600) : 0;

	return {
		miles: Math.floor(latest.distance),
		mph: latestMonthMph(rows) ?? lifetime,
	};
}
