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

	// Pick the newest row by date — the file appends but has historically held
	// duplicate and slightly out-of-order rows, so "max date" beats "last line".
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
	};
}
