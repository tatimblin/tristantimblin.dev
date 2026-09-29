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
	/** The newest row's day, YYYY-MM-DD (a UTC calendar day). How long ago
	 *  that was is worked out in the browser, against the visitor's today —
	 *  a build-time "Today" would be wrong by the next morning. */
	date: string;
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

/** The newest reading, or null when the CSV has no rows (a fresh or
 *  truncated file must not fail the build; the widget is left out). */
export function getBikeStats(): BikeStats | null {
	const rows = parse(csv);
	if (rows.length === 0) return null;

	// Pick the newest row by date. The writer upserts one sorted row per date,
	// so the last line is already the newest — but max-date is kept as a cheap
	// safeguard against any stray ordering regression in the write path. The
	// dates are YYYY-MM-DD, so they compare as strings.
	const latest = rows.reduce((max, r) => (r.date > max.date ? r : max), rows[0]);

	return {
		rides: latest.rides,
		miles: Math.floor(latest.distance),
		hours: Math.floor(latest.duration / 3600),
		date: latest.date,
	};
}
