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
 * Two steps:
 *   1. pastMovies — the watch history (`events(type: Previous …)`). Required:
 *      no results means a dead session, and the run fails.
 *   2. booked tickets — best effort. The `type` enum's value is discovered by
 *      introspection (the enum behind Account.events' `type` argument, its
 *      value matching /upcom|future/), falling back to "Upcoming" (what the
 *      app sends, per a 2026-10 mitmproxy capture) then "Future" when
 *      introspection is off. Any failure here is a ::warning:: and the past
 *      films are written regardless.
 *
 * ONLY THIS ACCOUNT'S OWN DATA. The query returns movies, theatres and
 * showtimes — no personal details beyond what the widget displays.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(new URL("../../src/data/amc.json", import.meta.url));

const ENDPOINT = "https://graph.amctheatres.com";

const TICKET = `
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
    showDateTimeUtc
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
${TICKET}`;

/** The `events` field of the account's type and its arguments, each argument's
 *  type unwrapped three levels (NON_NULL → LIST → NON_NULL → named) with the
 *  enum values at every level, so one request finds the enum and its values. */
const EVENTS_ARGS = `
query eventTypes($account: String!) {
  __type(name: $account) {
    name
    fields {
      name
      args {
        name
        type {
          kind
          name
          enumValues { name }
          ofType {
            kind
            name
            enumValues { name }
            ofType {
              kind
              name
              enumValues { name }
              ofType { kind name enumValues { name } }
            }
          }
        }
      }
    }
  }
}`;

/** The booked tickets, for an enum value found at run time. The value is an
 *  enum literal, so it is spliced into the document (checked against
 *  ENUM_LITERAL first). The app itself sends `events(type: Upcoming)` with no
 *  other argument (seen in a mitmproxy capture, 2026-10), so the date range
 *  is passed only when introspection says the field REQUIRES one. */
const upcomingQuery = (value, withDates) => `
query upcomingMovies${withDates ? "($startDate: Date!, $endDate: Date!)" : ""} {
  __typename
  viewer {
    __typename
    user {
      __typename
      id
      account {
        __typename
        id
        upcoming: events(type: ${value}${withDates ? ", startDate: $startDate, endDate: $endDate" : ""}) {
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
${TICKET}`;

const ENUM_LITERAL = /^[_A-Za-z][_0-9A-Za-z]*$/;

function mask(secret) {
	if (secret && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${secret}`);
}

/** The cookie jar: whatever AMC sent last. Every request goes through
 *  `graphql`, which sends it and folds any rotation back into it. */
const jar = { cookie: "", rotated: false };

async function persistCookie() {
	const path = process.env.AMC_ROTATED_COOKIE_FILE;
	if (!path) return;
	await writeFile(path, jar.cookie, { encoding: "utf8", mode: 0o600 });
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

async function graphql(operationName, query, variables) {
	const response = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			accept: "*/*",
			"user-agent": "Dart/3.12 (dart:io)",
			"x-amc-device-os-type": "ios",
			"x-amc-device-app-version": "7.0.142+152",
			"x-amc-device-os-version": "27.2",
			cookie: jar.cookie,
		},
		body: JSON.stringify({ operationName, query, variables }),
		signal: AbortSignal.timeout(30_000),
	});

	// Rotation first: an error response may still carry a new token.
	const next = rotateCookie(response.headers.getSetCookie?.() ?? [], jar.cookie);
	if (next) {
		jar.cookie = next;
		jar.rotated = true;
		mask(next);
		await persistCookie();
		console.log(`Session cookie rotated (${operationName}) — written for the workflow to persist.`);
	}

	if (!response.ok) {
		throw new Error(`${response.status} ${response.statusText} from AMC API (${operationName})`);
	}
	const body = await response.json();
	if (body.errors?.length) {
		throw new Error(`${operationName}: ${body.errors.map((e) => e.message).join("; ")}`);
	}
	return body.data;
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
		utc: showtime?.showDateTimeUtc ?? null,
		...(upcoming ? { upcoming: true } : {}),
	};
}

/** An introspected type unwrapped to its named type (enum values and all). */
function namedType(type) {
	let t = type;
	while (t && !t.name && t.ofType) t = t.ofType;
	return t ?? null;
}

/**
 * From the account type's introspection: the enum values of the `events`
 * field's `type` argument, the one for booked tickets (matching
 * /upcom|future/), and whether the field takes a date range. `value` is null
 * when no enum value matches; `withDates` when the field requires a range.
 * Exported for the tests.
 */
export function pickUpcoming(accountType) {
	const events = accountType?.fields?.find((f) => f.name === "events");
	const typeArg = events?.args?.find((a) => a.name === "type");
	const values = (namedType(typeArg?.type)?.enumValues ?? []).map((v) => v.name);
	const value = values.find((v) => /upcom|future/i.test(v) && ENUM_LITERAL.test(v)) ?? null;
	const required = (name) => events?.args?.find((a) => a.name === name)?.type?.kind === "NON_NULL";
	return { value, values, withDates: required("startDate") || required("endDate") };
}

/** Step 2: the booked tickets, or [] (with a ::warning::) on any failure. */
async function fetchUpcoming(accountTypeName, range) {
	let candidates;
	try {
		const data = await graphql("eventTypes", EVENTS_ARGS, { account: accountTypeName });
		const found = pickUpcoming(data?.__type);
		if (!found.value) {
			console.log(
				`::warning::AMC: no upcoming value on ${accountTypeName}.events(type:) — ` +
					`enum values: ${found.values.join(", ") || "none found"}.`,
			);
			return [];
		}
		console.log(`AMC: booked tickets are events(type: ${found.value}).`);
		candidates = [found];
	} catch (err) {
		// Introspection is often off in production. "Upcoming" is what the
		// app sends (the 2026-10 capture); "Future" is a last guess.
		console.log(`AMC: introspection failed (${err?.message ?? err}); trying the known enum values.`);
		candidates = [
			{ value: "Upcoming", withDates: false },
			{ value: "Future", withDates: false },
		];
	}

	const errors = [];
	for (const { value, withDates } of candidates) {
		try {
			const data = await graphql("upcomingMovies", upcomingQuery(value, withDates), withDates ? range : {});
			const edges = data?.viewer?.user?.account?.upcoming?.edges ?? [];
			return edges.map((e) => toMovie(e.node, true)).filter(Boolean);
		} catch (err) {
			errors.push(`${value}: ${err?.message ?? err}`);
		}
	}
	console.log(`::warning::AMC: could not read booked tickets — ${errors.join(" | ")}`);
	return [];
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
	jar.cookie = session;

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const startDate = fmtDate(new Date(2023, 3, 1));
	const endDate = fmtDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1));

	const data = await graphql("pastMovies", PAST_MOVIES, { startDate, endDate });
	const account = data?.viewer?.user?.account;
	const edges = account?.past?.edges ?? [];

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
		upcoming = await fetchUpcoming(account.__typename || "Account", {
			startDate: fmtDate(today),
			endDate: fmtDate(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())),
		});
	} catch (err) {
		console.log(`::warning::AMC: booked tickets skipped — ${err?.message ?? err}`);
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
	if (!jar.rotated) console.log("Cookie did not rotate.");
}

// Only as a script, so the tests can import the pure parts without a request.
if (import.meta.main) {
	main().catch((err) => {
		console.error(`::error::${err?.stack ?? err}`);
		process.exit(1);
	});
}
