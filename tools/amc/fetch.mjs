#!/usr/bin/env bun
/**
 * AMC A-List watch history — every movie seen at AMC this year, with poster,
 * theatre and showtime.
 *
 * Mirrors tools/volo/fetch.mjs: the nightly Action runs this, it writes
 * src/data/amc.json, and the workflow commits the file if it changed.
 *
 * AMC's mobile app talks to a GraphQL endpoint (graph.amctheatres.com) using a
 * cookie-based session. There is no refresh token or OAuth grant: the session
 * cookie was captured once via mitmproxy (see the amc-stats repo) and is stored
 * as the AMC_SESSION GitHub secret. When it expires the capture must be re-run.
 *
 * The pastMovies query returns the account's watch history for a date range,
 * including poster URLs from AMC's Cloudinary CDN. No TMDB lookup needed.
 *
 * ONLY THIS ACCOUNT'S OWN DATA. The query returns movies, theatres and
 * showtimes — no personal details beyond what the widget displays.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(
	new URL("../../src/data/amc.json", import.meta.url),
);

const ENDPOINT = "https://graph.amctheatres.com";

const PAST_MOVIES = `
query pastMovies($startDate: Date!, $endDate: Date!) {
  __typename
  viewer {
    __typename
    user {
      __typename
      id
      account {
        __typename
        id
        past: events(type: Previous, startDate: $startDate, endDate: $endDate, first: 300) {
          __typename
          edges {
            __typename
            node {
              __typename
              ...ticket
            }
          }
        }
      }
    }
  }
}

fragment ticket on AccountEvent {
  __typename
  id
  token
  movie {
    __typename
    id
    name
    preferredPoster {
      __typename
      id
      url
    }
  }
  theatre {
    __typename
    id
    name
  }
  showtime {
    __typename
    id
    display {
      __typename
      id
      prefix
      date
      dateShort
      monthDate
      monthDateShort
      year
      time
      amPm
    }
  }
  order {
    __typename
    id
    token
    isRefunded
    orderGroup {
      __typename
      attendees {
        __typename
        id
        isOrganizer
        name
      }
    }
  }
}`;

function mask(secret) {
	if (secret && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${secret}`);
}

async function graphql(query, variables, session) {
	const response = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "*/*",
			"user-agent": "Dart/3.12 (dart:io)",
			"x-amc-device-os-type": "ios",
			"x-amc-device-app-version": "7.0.142+152",
			"x-amc-device-os-version": "27.2",
			cookie: session,
		},
		body: JSON.stringify({ operationName: "pastMovies", query, variables }),
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} from AMC API`);
	}
	const body = await response.json();
	if (body.errors?.length) {
		throw new Error(body.errors.map((e) => e.message).join("; "));
	}
	return body.data;
}

function toMovie(node) {
	const { movie, theatre, showtime, order } = node;
	if (order?.isRefunded) return null;

	const display = showtime?.display;
	return {
		name: movie?.name,
		poster: movie?.preferredPoster?.url ?? null,
		theatre: theatre?.name,
		date: display ? `${display.monthDate}, ${display.year}` : null,
		time: display ? `${display.time}${display.amPm}` : null,
		day: display?.prefix ?? null,
	};
}

async function main() {
	const session = process.env.AMC_SESSION;
	if (!session) {
		console.error(
			"::error::AMC_SESSION is not set — cannot query the AMC API. " +
				"Re-capture the session cookie with the amc-stats mitmproxy setup.",
		);
		process.exit(1);
	}
	mask(session);

	const now = new Date();
	const fmt = (d) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
	const start = new Date(2023, 3, 1);
	const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
	const startDate = fmt(start);
	const endDate = fmt(end);

	const data = await graphql(PAST_MOVIES, { startDate, endDate }, session);
	const edges = data?.viewer?.user?.account?.past?.edges ?? [];

	if (!edges.length) {
		console.error(
			"::error::pastMovies returned no results — session may be expired. " +
				"Re-capture with the amc-stats mitmproxy setup.",
		);
		process.exit(1);
	}

	const movies = edges
		.map((e) => toMovie(e.node))
		.filter(Boolean)
		.reverse();

	const out = {
		updated: now.toISOString(),
		movies,
	};

	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	console.log(`Wrote ${movies.length} movies to ${OUT_PATH}`);
}

main().catch((err) => {
	console.error(`::error::${err?.stack ?? err}`);
	process.exit(1);
});
