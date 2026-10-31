#!/usr/bin/env bun
/**
 * AMC A-List tickets — every movie seen at AMC, and every one booked, with
 * poster, theatre and showtime.
 *
 * Mirrors tools/volo/fetch.mjs: the nightly Action runs this, it writes
 * src/data/amc.json, and the workflow commits the file if it changed.
 * tools/amc/enrich.mjs runs after it and fills in each film's genre and IMDb
 * id (src/data/amc-films.json).
 *
 * AMC's mobile app talks to a GraphQL endpoint (graph.amctheatres.com) using a
 * cookie-based session. There is no refresh token or OAuth grant: the session
 * cookie was captured once via mitmproxy (see the amc-stats repo) and is stored
 * as the AMC_SESSION GitHub secret. The authToken inside the cookie can rotate
 * on ANY response; every request here sends the latest cookie, and the latest
 * is written to AMC_ROTATED_COOKIE_FILE as soon as it changes, so the workflow
 * persists it back to the secret whatever happens after.
 *
 * NEVER RUN THIS LOCALLY against AMC: the rotated cookie would only land on
 * your disk and the secret's token would be dead for the next nightly run.
 *
 * At most two requests a run:
 *   1. pastMovies — the watch history (`events(type: Previous …)`). Required:
 *      no results means a dead session, and the run fails.
 *   2. upcomingMovies — the booked tickets, `events(type: Upcoming)` with no
 *      other argument, exactly as the app sends it (seen in a mitmproxy
 *      capture, 2026-10). Best effort: any failure is a ::warning:: and the
 *      past films are written regardless.
 *
 * ONLY THIS ACCOUNT'S OWN DATA. The query returns movies, theatres and
 * showtimes — no personal details beyond what the widget displays.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(new URL("../../src/data/amc.json", import.meta.url));

const ENDPOINT = "https://graph.amctheatres.com";

export const PAST_MOVIES = `
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

/** The booked tickets, with pastMovies' own `ticket` fragment. */
export const UPCOMING_MOVIES = `
query upcomingMovies {
  __typename
  viewer {
    __typename
    user {
      __typename
      id
      account {
        __typename
        id
        upcoming: events(type: Upcoming) {
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

${PAST_MOVIES.slice(PAST_MOVIES.indexOf("fragment ticket"))}`;

function mask(secret) {
	if (secret && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${secret}`);
}

/**
 * The cookie after a response: the jar's own cookies (authToken, session)
 * with any value a Set-Cookie header replaced. Null when nothing changed.
 * Exported for the tests.
 */
export function rotateCookie(setCookies, cookie) {
	const pairs = cookie
		.split(/;\s*/)
		.filter(Boolean)
		.map((p) => {
			const i = p.indexOf("=");
			return [p.slice(0, i), p.slice(i + 1)];
		});
	let changed = false;
	for (const sc of setCookies) {
		const m = sc.match(/^\s*([^=;\s]+)=([^;]*)/);
		if (!m) continue;
		const [, name, value] = m;
		const pair = pairs.find(([n]) => n === name);
		// Only the cookies the session is made of; an empty value is a
		// deletion, which would lose the session, so it is ignored.
		if (!pair || !value || pair[1] === value) continue;
		pair[1] = value;
		changed = true;
	}
	return changed ? pairs.map(([n, v]) => `${n}=${v}`).join("; ") : null;
}

/**
 * A GraphQL client holding the cookie jar: each request sends the latest
 * cookie, and a response that rotates it (an error response included) has
 * the new cookie written to `rotatedPath` before anything else happens.
 * `fetchImpl` is for the tests. Exported for the tests.
 */
export function createClient({ cookie, rotatedPath, fetchImpl = fetch }) {
	const client = {
		cookie,
		rotated: false,
		async request(operationName, query, variables) {
			const response = await fetchImpl(ENDPOINT, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept: "*/*",
					"user-agent": "Dart/3.12 (dart:io)",
					"x-amc-device-os-type": "ios",
					"x-amc-device-app-version": "7.0.142+152",
					"x-amc-device-os-version": "27.2",
					// The app sends its device id too (see amc-stats' README);
					// optional so a missing secret changes nothing.
					...(process.env.AMC_DEVICE_ID ? { "x-amc-device-id": process.env.AMC_DEVICE_ID } : {}),
					...(process.env.AMC_ACCOUNT_ID ? { "x-amc-account-id": process.env.AMC_ACCOUNT_ID } : {}),
					cookie: client.cookie,
				},
				body: JSON.stringify({ operationName, query, variables }),
				signal: AbortSignal.timeout(30_000),
			});

			const next = rotateCookie(response.headers.getSetCookie?.() ?? [], client.cookie);
			if (next) {
				client.cookie = next;
				client.rotated = true;
				mask(next);
				if (rotatedPath) await writeFile(rotatedPath, next, { encoding: "utf8", mode: 0o600 });
				console.log(`Session cookie rotated (${operationName}) — written for the workflow to persist.`);
			}

			if (!response.ok) {
				// server=cloudflare with an HTML body is the WAF; JSON is AMC itself
				// (an expired session, say).
				const text = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 300);
				throw new Error(
					`${response.status} ${response.statusText} from AMC API (${operationName}); ` +
						`server=${response.headers.get("server")} cf-mitigated=${response.headers.get("cf-mitigated")} ` +
						`type=${response.headers.get("content-type")}; body: ${text}`,
				);
			}
			const body = await response.json();
			if (body.errors?.length) {
				throw new Error(`${operationName}: ${body.errors.map((e) => e.message).join("; ")}`);
			}
			return body.data;
		},
	};
	return client;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * The showtime as local ISO strings, from AMC's display fields ("January 10",
 * 2024, "7:45", "pm"): `iso` "2024-01-10" and `start` "2024-01-10T19:45".
 * The theatre's own wall clock, no zone. Nulls when a field won't parse.
 * Exported for the tests.
 */
export function isoShowtime(display) {
	const md = String(display?.monthDate ?? "").match(/^\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2})\b/);
	const year = Number(display?.year);
	const month = md ? MONTHS.indexOf(md[1].toLowerCase()) : -1;
	if (!md || month < 0 || !(year > 1900)) return { iso: null, start: null };
	const p2 = (n) => String(n).padStart(2, "0");
	const iso = `${year}-${p2(month + 1)}-${p2(Number(md[2]))}`;
	const tm = String(display?.time ?? "").match(/(\d{1,2}):(\d{2})/);
	if (!tm) return { iso, start: null };
	let h = Number(tm[1]) % 12;
	if (/p/i.test(String(display?.amPm ?? ""))) h += 12;
	return { iso, start: `${iso}T${p2(h)}:${tm[2]}` };
}

/** One ticket as the widget's movie, or null for a refund. Exported for the
 *  tests. */
export function toMovie(node, upcoming = false) {
	const { movie, theatre, showtime, order } = node ?? {};
	if (order?.isRefunded || !movie?.name) return null;

	const display = showtime?.display;
	const { iso, start } = isoShowtime(display);
	return {
		id: movie.id ?? null,
		name: movie.name,
		poster: movie.preferredPoster?.url ?? null,
		theatre: theatre?.name,
		date: display ? `${display.monthDate}, ${display.year}` : null,
		time: display ? `${display.time}${display.amPm}` : null,
		day: display?.prefix ?? null,
		iso,
		start,
		...(upcoming ? { upcoming: true } : {}),
	};
}

const fmtDate = (d) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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
	const client = createClient({ cookie: session, rotatedPath: process.env.AMC_ROTATED_COOKIE_FILE });

	const now = new Date();
	const startDate = fmtDate(new Date(2023, 3, 1));
	const endDate = fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

	const data = await client.request("pastMovies", PAST_MOVIES, { startDate, endDate });
	const edges = data?.viewer?.user?.account?.past?.edges ?? [];

	if (!edges.length) {
		console.error(
			"::error::pastMovies returned no results — session may be expired. " +
				"Re-capture with the amc-stats mitmproxy setup.",
		);
		process.exit(1);
	}

	const past = edges
		.map((e) => toMovie(e.node))
		.filter(Boolean)
		.reverse();

	let upcoming = [];
	try {
		const booked = await client.request("upcomingMovies", UPCOMING_MOVIES, {});
		upcoming = (booked?.viewer?.user?.account?.upcoming?.edges ?? [])
			.map((e) => toMovie(e.node, true))
			.filter(Boolean);
	} catch (err) {
		console.log(`::warning::AMC: could not read booked tickets — ${err?.message ?? err}`);
	}
	// A booked ticket for a showing already in the history is that showing.
	const seen = new Set(past.map((m) => `${m.name}|${m.start ?? m.date}`));
	upcoming = upcoming
		.filter((m) => !seen.has(`${m.name}|${m.start ?? m.date}`))
		.sort((a, b) => String(a.start ?? a.iso).localeCompare(String(b.start ?? b.iso)));

	const movies = [...past, ...upcoming];
	const out = { updated: now.toISOString(), movies };

	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	console.log(`Wrote ${past.length} seen and ${upcoming.length} booked movies to ${OUT_PATH}`);
	if (!client.rotated) console.log("Cookie did not rotate.");
}

// Only as a script, so the tests can import the pure parts without a request.
if (import.meta.main) {
	main().catch((err) => {
		console.error(`::error::${err?.stack ?? err}`);
		process.exit(1);
	});
}
