#!/usr/bin/env node
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
 * The GraphQL endpoint is behind Cloudflare bot protection, so plain fetch()
 * gets 403'd. This script uses Puppeteer with a persistent browser profile to
 * solve the Cloudflare JS challenge, then makes GraphQL requests via
 * page.evaluate(fetch(…)) so the browser attaches all cookies (including
 * httpOnly cf_clearance) automatically.
 *
 * NEVER RUN THIS LOCALLY against AMC: the rotated cookie would only land on
 * your disk and the secret's token would be dead for the next nightly run.
 * This script is designed to run ONLY in CI on the self-hosted runner.
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
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import puppeteer from "puppeteer";

const OUT_PATH = fileURLToPath(new URL("../../src/data/amc.json", import.meta.url));

const ENDPOINT = "https://graph.amctheatres.com";
const AMC_ORIGIN = "https://www.amctheatres.com";

/** Persistent browser profile, so Cloudflare sees a returning session. */
const BROWSER_PROFILE_DIR = process.env.AMC_BROWSER_PROFILE_DIR
	? resolve(process.env.AMC_BROWSER_PROFILE_DIR)
	: resolve(dirname(fileURLToPath(import.meta.url)), ".browser-profile");

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
				throw new Error(`${response.status} ${response.statusText} from AMC API (${operationName})`);
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

// ─── Puppeteer-based main flow ───────────────────────────────────────────────

/**
 * Parse the AMC_SESSION cookie string ("authToken=xxx; session=yyy") into
 * individual Puppeteer cookie objects for injection.
 */
function parseCookiesToPuppeteerFormat(cookieString) {
	return cookieString
		.split(/;\s*/)
		.filter(Boolean)
		.map((pair) => {
			const i = pair.indexOf("=");
			const name = pair.slice(0, i);
			const value = pair.slice(i + 1);
			return {
				name,
				value,
				domain: ".amctheatres.com",
				path: "/",
				httpOnly: true,
				secure: true,
				sameSite: "None",
			};
		});
}

/**
 * Reconstruct the flat cookie string from the browser's current cookies for
 * the AMC domain — only the names present in the original AMC_SESSION jar.
 * Returns null when nothing changed vs `currentCookie`.
 */
function reconstructCookie(browserCookies, originalNames, currentCookie) {
	const pairs = currentCookie
		.split(/;\s*/)
		.filter(Boolean)
		.map((p) => {
			const i = p.indexOf("=");
			return [p.slice(0, i), p.slice(i + 1)];
		});

	let changed = false;
	for (const bc of browserCookies) {
		if (!originalNames.has(bc.name)) continue;
		const pair = pairs.find(([n]) => n === bc.name);
		if (!pair) continue;
		if (pair[1] !== bc.value && bc.value) {
			pair[1] = bc.value;
			changed = true;
		}
	}
	return changed ? pairs.map(([n, v]) => `${n}=${v}`).join("; ") : null;
}

/**
 * Get all cookies from the browser via CDP (catches httpOnly cookies that
 * page.cookies() on specific URLs might miss).
 */
async function getAllCookies(page) {
	const client = await page.createCDPSession();
	try {
		const { cookies } = await client.send("Network.getAllCookies");
		return cookies;
	} finally {
		await client.detach();
	}
}

/**
 * Make a GraphQL request from inside the page via page.evaluate(fetch(…)).
 * The browser attaches all cookies (httpOnly, cf_clearance, etc.) since it's
 * a same-origin request from the AMC origin. Returns the parsed JSON body.
 */
async function browserGraphQL(page, operationName, query, variables) {
	const result = await page.evaluate(
		async (endpoint, opName, q, vars) => {
			const res = await fetch(endpoint, {
				method: "POST",
				credentials: "include",
				headers: {
					"content-type": "application/json",
					accept: "*/*",
					"x-amc-device-os-type": "ios",
					"x-amc-device-app-version": "7.0.142+152",
					"x-amc-device-os-version": "27.2",
				},
				body: JSON.stringify({ operationName: opName, query: q, variables: vars }),
			});
			const text = await res.text();
			return {
				status: res.status,
				statusText: res.statusText,
				body: text,
				// Tells a Cloudflare block (server: cloudflare, cf-mitigated) from
				// an AMC auth refusal (a GraphQL/JSON body).
				server: res.headers.get("server"),
				mitigated: res.headers.get("cf-mitigated"),
				contentType: res.headers.get("content-type"),
			};
		},
		ENDPOINT,
		operationName,
		query,
		variables,
	);

	if (!result || result.status >= 400) {
		const snippet = (result?.body ?? "").replace(/\s+/g, " ").slice(0, 300);
		throw new Error(
			`${result?.status ?? "?"} ${result?.statusText ?? ""} from AMC API (${operationName}); ` +
				`server=${result?.server} cf-mitigated=${result?.mitigated} type=${result?.contentType}; body: ${snippet}`,
		);
	}

	let body;
	try {
		body = JSON.parse(result.body);
	} catch {
		throw new Error(`Non-JSON response from AMC API (${operationName}): ${result.body.slice(0, 200)}`);
	}

	if (body.errors?.length) {
		throw new Error(`${operationName}: ${body.errors.map((e) => e.message).join("; ")}`);
	}

	return body.data;
}

async function main() {
	// ── NEVER RUN THIS LOCALLY ──────────────────────────────────────────
	// This script is designed for CI on the self-hosted runner only.
	// Running locally would consume the rotated cookie and break the next
	// nightly run. The residential IP on the runner is what clears Cloudflare.

	const session = process.env.AMC_SESSION;
	if (!session) {
		console.error(
			"::error::AMC_SESSION is not set — cannot query the AMC API. " +
				"Re-capture the session cookie with the amc-stats mitmproxy setup.",
		);
		process.exit(1);
	}
	mask(session);

	const rotatedPath = process.env.AMC_ROTATED_COOKIE_FILE;

	// The names in the original jar — only these are tracked for rotation.
	const originalNames = new Set(
		session
			.split(/;\s*/)
			.filter(Boolean)
			.map((p) => p.slice(0, p.indexOf("="))),
	);

	let currentCookie = session;
	let rotated = false;

	// ── Launch Puppeteer with a persistent profile ──────────────────────
	if (!existsSync(BROWSER_PROFILE_DIR)) {
		mkdirSync(BROWSER_PROFILE_DIR, { recursive: true });
	}

	console.log(`Launching browser (profile: ${BROWSER_PROFILE_DIR})…`);
	const browser = await puppeteer.launch({
		headless: true,
		args: [
			"--no-sandbox",
			"--disable-setuid-sandbox",
			"--disable-dev-shm-usage",
			"--disable-accelerated-2d-canvas",
			"--disable-gpu",
			"--disable-extensions",
			"--disable-sync",
			"--disable-background-networking",
			"--no-first-run",
			"--disable-component-update",
		],
		userDataDir: BROWSER_PROFILE_DIR,
	});

	let page;
	let checkRotation;
	try {
		page = await browser.newPage();
		await page.setViewport({ width: 1280, height: 800 });

		// ── Inject AMC session cookies ──────────────────────────────────
		const puppeteerCookies = parseCookiesToPuppeteerFormat(session);
		for (const cookie of puppeteerCookies) {
			await page.setCookie(cookie);
		}
		console.log(`Injected ${puppeteerCookies.length} session cookies.`);

		// ── Navigate to AMC to clear the Cloudflare JS challenge ────────
		// The first load on a fresh profile may show the Cloudflare
		// interstitial. networkidle0 waits until the page is fully settled
		// (no open connections for 500ms), which is enough for the JS
		// challenge to complete and set cf_clearance.
		console.log("Navigating to AMC to clear Cloudflare challenge…");
		await page.goto(AMC_ORIGIN, {
			waitUntil: "networkidle0",
			timeout: 60_000,
		});

		// Give a little extra time for Cloudflare's challenge script to
		// finish and set its cookies, in case networkidle0 fired early.
		await new Promise((resolve) => setTimeout(resolve, 3_000));

		const landedUrl = page.url();
		console.log(`Landed on: ${landedUrl}`);

		// ── Move to the API's own origin ────────────────────────────────
		// The API is on graph.amctheatres.com, a DIFFERENT origin from www.
		// A fetch from www with the x-amc-* headers is a CORS preflight that
		// the API refuses ("TypeError: Failed to fetch"). Loading any page on
		// the API origin makes the fetch below same-origin, and clears a
		// Cloudflare challenge on that host too. The status of this GET is
		// irrelevant — only the page's origin matters.
		console.log("Navigating to the API origin…");
		await page.goto(`${ENDPOINT}/`, { waitUntil: "networkidle0", timeout: 60_000 });
		await new Promise((resolve) => setTimeout(resolve, 2_000));
		console.log(`On API origin: ${new URL(page.url()).origin}`);

		// ── Helper: check cookie rotation after each request ────────────
		checkRotation = async (operationName) => {
			const allCookies = await getAllCookies(page);
			const amcCookies = allCookies.filter(
				(c) => c.domain === ".amctheatres.com" || c.domain === "amctheatres.com" || c.domain === "graph.amctheatres.com",
			);
			const next = reconstructCookie(amcCookies, originalNames, currentCookie);
			if (next) {
				currentCookie = next;
				rotated = true;
				mask(next);
				if (rotatedPath) {
					await writeFile(rotatedPath, next, { encoding: "utf8", mode: 0o600 });
				}
				console.log(`Session cookie rotated (${operationName}) — written for the workflow to persist.`);
			}
		};

		// ── pastMovies (required) ───────────────────────────────────────
		const now = new Date();
		const startDate = fmtDate(new Date(2023, 3, 1));
		const endDate = fmtDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));

		const data = await browserGraphQL(page, "pastMovies", PAST_MOVIES, { startDate, endDate });
		await checkRotation("pastMovies");

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

		// ── upcomingMovies (best effort) ────────────────────────────────
		let upcoming = [];
		try {
			const booked = await browserGraphQL(page, "upcomingMovies", UPCOMING_MOVIES, {});
			await checkRotation("upcomingMovies");
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
		if (!rotated) console.log("Cookie did not rotate.");
	} finally {
		// A request that failed after reaching AMC may still have rotated the
		// session. Persist it anyway, or the only copy dies with this profile.
		if (checkRotation) {
			try {
				await checkRotation("final");
			} catch (err) {
				console.log(`::warning::AMC: final rotation check failed — ${err?.message ?? err}`);
			}
		}
		await browser.close();
	}
}

// Only as a script, so the tests can import the pure parts without a request.
// import.meta.main is Bun-specific; the argv check covers Node.
const isMain = import.meta.main ?? (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]));
if (isMain) {
	main().catch((err) => {
		console.error(`::error::${err?.stack ?? err}`);
		process.exit(1);
	});
}
