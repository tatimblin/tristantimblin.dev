// GitHub stats — read at build time (frontmatter runs in Node) from github.json,
// which the github-stats GitHub Action regenerates daily (the Action's fetch
// script writes to this file's path — keep them in sync). Github.astro consumes
// the normalized shape returned by getGithubStats().
//
// Vite inlines the JSON at build time, so the data is bundled with the page — no
// filesystem read or API call at render time, and no token shipped to the client.
// See tools/github-stats/fetch.mjs for the shape and .github/workflows/github-stats.yml
// for the pipeline (mirrors the baywheels/bike-stats setup).
import data from "../../data/github.json";

export interface ContribDay {
	date: string;
	count: number;
	level: 0 | 1 | 2 | 3 | 4; // GitHub's contributionLevel bucketed 0–4
}

export interface Language {
	name: string;
	percent: number; // share of the shown languages, one decimal
	color: string; // GitHub's official language color (hex)
}

export interface GithubStats {
	username: string;
	profileUrl: string;
	totalContributions: number;
	weeks: ContribDay[][]; // columns; each inner array is a week's (≤7) days
	languages: Language[];
}

const clampLevel = (n: unknown): ContribDay["level"] => {
	const v = Number(n);
	return (v >= 0 && v <= 4 ? v : 0) as ContribDay["level"];
};

// Defensive normalization: github.json is generated, but tolerate missing/partial
// fields so a bad data file renders an empty widget rather than throwing the build.
export function getGithubStats(): GithubStats {
	const raw = (data ?? {}) as Record<string, unknown>;
	const username = typeof raw.username === "string" ? raw.username : "tatimblin";

	const weeks: ContribDay[][] = Array.isArray(raw.weeks)
		? (raw.weeks as Array<{ days?: unknown }>).map((w) =>
				Array.isArray(w?.days)
					? (w.days as Array<Record<string, unknown>>).map((d) => ({
							date: typeof d.date === "string" ? d.date : "",
							count: Number(d.count) || 0,
							level: clampLevel(d.level),
						}))
					: [],
			)
		: [];

	const languages: Language[] = Array.isArray(raw.languages)
		? (raw.languages as Array<Record<string, unknown>>).map((l) => ({
				name: typeof l.name === "string" ? l.name : "",
				percent: Number(l.percent) || 0,
				color: typeof l.color === "string" ? l.color : "#888888",
			}))
		: [];

	return {
		username,
		profileUrl: `https://github.com/${username}`,
		totalContributions: Number(raw.totalContributions) || 0,
		weeks,
		languages,
	};
}
