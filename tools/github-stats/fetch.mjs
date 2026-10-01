#!/usr/bin/env bun
/**
 * Fetches the data behind the GitHub widget (src/widgets/github/) and writes it
 * to github.json, which the widget imports at build time (Vite inlines it — no
 * runtime fetch, no token shipped to the client). This mirrors the baywheels
 * pipeline: a scheduled Action runs this and commits the JSON, and each commit
 * triggers a rebuild that picks up the fresh data (see
 * .github/workflows/github-stats.yml).
 *
 * Two things come out of a single GraphQL call against the *viewer* (the token
 * owner):
 *   1. The contribution calendar for the past year — total + per-day
 *      count/level. Querying `viewer` (rather than a named user) means private
 *      contributions are included regardless of profile visibility.
 *   2. Top languages aggregated by byte size across owned repos. `ownerAffiliations:
 *      [OWNER]` + a repo-scoped PAT includes PRIVATE repos, so the breakdown
 *      reflects all work, not just public. GitHub hands us each language's
 *      official `color`, so no color map is bundled.
 *
 * Auth: a PAT in $GH_PAT (same secret the baywheels workflow already uses). A
 * fine-grained/classic token needs read access to repositories (for private
 * language stats) and to the user's contributions.
 *
 * Usage: GH_PAT=<token> bun tools/github-stats/fetch.mjs
 * Output is committed, so neither the build nor CI depends on running it live.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// How many trailing weeks of the calendar to keep in github.json — the whole
// year. The widget's grid sizes its squares off the height and clips the oldest
// weeks off the left, so it needs at least as many weeks as the widest tile has
// room for; too few leaves a gap on the left.
const WEEKS_TO_KEEP = 53;
// Languages shown in the breakdown (top N by aggregated byte size).
const TOP_LANGUAGES = 6;
// Languages excluded from the breakdown. Linguist counts vendored/generated
// HTML (build output, minified pages) by byte size, which balloons it into a
// misleading "top language"; drop it so the shares reflect authored code.
const EXCLUDED_LANGUAGES = new Set(["HTML"]);

const OUT_PATH = fileURLToPath(
	new URL("../../src/widgets/github/github.json", import.meta.url),
);

// GitHub's contributionLevel enum → 0–4 intensity buckets the widget tints by.
const LEVEL = {
	NONE: 0,
	FIRST_QUARTILE: 1,
	SECOND_QUARTILE: 2,
	THIRD_QUARTILE: 3,
	FOURTH_QUARTILE: 4,
};

const QUERY = `
query {
  viewer {
    login
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays {
            date
            contributionCount
            contributionLevel
          }
        }
      }
    }
    repositories(
      first: 100
      ownerAffiliations: [OWNER]
      isFork: false
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      nodes {
        languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
          edges {
            size
            node { name color }
          }
        }
      }
    }
  }
}`;

async function main() {
	const token = process.env.GH_PAT;
	if (!token) {
		console.error("::error::GH_PAT is not set — cannot query the GitHub API.");
		process.exit(1);
	}

	const res = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `bearer ${token}`,
			"Content-Type": "application/json",
			// GitHub requires a User-Agent on API requests.
			"User-Agent": "whois.timblin.io-github-widget",
		},
		body: JSON.stringify({ query: QUERY }),
	});

	if (!res.ok) {
		console.error(`::error::GitHub API HTTP ${res.status} ${res.statusText}`);
		process.exit(1);
	}

	const payload = await res.json();
	if (payload.errors?.length) {
		console.error(`::error::GraphQL errors: ${JSON.stringify(payload.errors)}`);
		process.exit(1);
	}

	const viewer = payload.data?.viewer;
	const calendar =
		viewer?.contributionsCollection?.contributionCalendar ?? null;

	// Stale-auth guard (matches the baywheels workflow): never commit an empty
	// calendar — a broken token would otherwise wipe the widget.
	const rawWeeks = calendar?.weeks ?? [];
	const hasContribs = rawWeeks.some((w) =>
		w.contributionDays?.some((d) => d.contributionCount > 0),
	);
	if (!hasContribs) {
		console.error(
			"::error::Contribution calendar is empty — auth likely broken. Not writing.",
		);
		process.exit(1);
	}

	// Keep only the trailing weeks, normalized to {date,count,level}.
	const weeks = rawWeeks.slice(-WEEKS_TO_KEEP).map((w) => ({
		days: (w.contributionDays ?? []).map((d) => ({
			date: d.date,
			count: d.contributionCount,
			level: LEVEL[d.contributionLevel] ?? 0,
		})),
	}));

	// Aggregate language bytes across every repo, then take the top N by size and
	// convert to whole-percent shares (of the shown languages).
	const bytesByLang = new Map();
	const colorByLang = new Map();
	for (const repo of viewer?.repositories?.nodes ?? []) {
		for (const edge of repo?.languages?.edges ?? []) {
			const name = edge.node?.name;
			if (!name || EXCLUDED_LANGUAGES.has(name)) continue;
			bytesByLang.set(name, (bytesByLang.get(name) ?? 0) + (edge.size ?? 0));
			if (edge.node?.color) colorByLang.set(name, edge.node.color);
		}
	}
	const ranked = [...bytesByLang.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, TOP_LANGUAGES);
	const shownTotal = ranked.reduce((sum, [, bytes]) => sum + bytes, 0) || 1;
	const languages = ranked.map(([name, bytes]) => ({
		name,
		percent: Math.round((bytes / shownTotal) * 1000) / 10, // one decimal
		color: colorByLang.get(name) ?? "#888888",
	}));

	// UTC date stamp (the workflow runs on a UTC cron). No Math.random / locale.
	const updated = new Date().toISOString().slice(0, 10);

	const out = {
		updated,
		username: viewer?.login ?? "tatimblin",
		totalContributions: calendar?.totalContributions ?? 0,
		weeks,
		languages,
	};

	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	console.log(
		`Wrote ${OUT_PATH}: ${out.totalContributions} contributions, ` +
			`${weeks.length} weeks, ${languages.length} languages.`,
	);
}

main().catch((err) => {
	console.error(`::error::${err?.stack ?? err}`);
	process.exit(1);
});
