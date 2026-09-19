#!/usr/bin/env bun
/**
 * Volo league seasons — every season the account has played, with the schedule
 * and the score of each game that has one.
 *
 * Mirrors tools/github-stats/fetch.mjs: a scheduled Action runs this, it writes
 * src/widgets/volo/volo.json, and the workflow commits the file if it changed.
 * Astro imports that JSON in frontmatter, so nothing is fetched at render time
 * and no credential reaches the browser.
 *
 * Volo publishes no API. The player dashboard runs on an ordinary Hasura
 * endpoint with introspection left on, which is what this queries. That is the
 * risk: it is undocumented and unversioned, so a field can vanish between runs.
 * When it does, the fix is to re-introspect rather than to guess — the
 * volo-sports skill's `volo.py introspect --refresh --type games` does it.
 *
 * ONLY THIS ACCOUNT'S OWN DATA, AND NONE OF THE ROSTER. The query below reaches
 * for leagues, teams, scores and fixtures. It deliberately does not touch
 * registrant names, emails, phone numbers or RSVPs: those belong to teammates
 * who did not ask to be published on someone else's home page. Opponent TEAM
 * names are league-public and are the only other-party data stored here.
 * Read-only: the schema exposes mutations that RSVP, register and pay, and this
 * script fires none of them.
 *
 * AN EMPTY SCORE IS NOT A TIE. A game with no game_scores rows has no recorded
 * result — not yet played, not yet scored, or postponed. Those are written with
 * null scores and render as upcoming fixtures. Reporting them as 0–0 would be
 * inventing a result, which is the one thing this must never do.
 *
 * Manual run (macOS, where the volo-sports skill keeps the credential):
 *   VOLO_REFRESH_TOKEN="$(security find-generic-password \
 *     -s volo-sports -a refresh-token -w)" bun tools/volo/fetch.mjs
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(
	new URL("../../src/widgets/volo/volo.json", import.meta.url),
);

const ENDPOINT = "https://www.volosports.com/hapi/v1/graphql";

// volosports.com sits behind Cloudflare, which rejects a non-browser client with
// a 403 BEFORE the request reaches Hasura — so a 403 here means the User-Agent
// was refused, not that the token is bad. Real auth failures arrive as HTTP 200
// with a GraphQL `errors` array. (Same trap as api.nasdaq.com in ../ticker.)
const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

// Leagues that are not league play. The account has one "Free Beer Party" event
// registration, which has a fixture and no opponent and no score.
const EXCLUDED_SPORTS = new Set(["Event"]);

/**
 * Hide a secret from the Action log before it can be echoed anywhere.
 *
 * Only under Actions. The directive is a line of stdout that the runner
 * intercepts; anywhere else it is just the secret printed to a terminal, which
 * is the exact opposite of what it is for — and a local run is precisely where
 * that output gets pasted into a chat window or a scrollback buffer.
 */
function mask(secret) {
	if (secret && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${secret}`);
}

async function graphql(query, variables, accessToken) {
	const response = await fetch(ENDPOINT, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"user-agent": UA,
			// Hasura filters both rows AND columns by role, and game_scores is
			// visible only to PLAYER. Without this header the scores come back
			// as a schema error rather than as empty.
			...(accessToken
				? { authorization: `Bearer ${accessToken}`, "x-hasura-role": "PLAYER" }
				: {}),
		},
		body: JSON.stringify({ query, variables }),
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		throw new Error(
			`${response.status} ${response.statusText} from the Volo API` +
				(response.status === 403 ? " (Cloudflare rejected the client, not the token)" : ""),
		);
	}
	const body = await response.json();
	if (body.errors?.length) {
		throw new Error(body.errors.map((e) => e.message).join("; "));
	}
	return body.data;
}

const REFRESH = `
mutation WebRefresh($t: String!) {
	webRefresh(actionsAuthWebRefreshInput: {webAuthRefreshToken: $t}) {
		_id
		username
		token
		web_auth_refresh_token
	}
}`;

/**
 * Trade the long-lived refresh token for a ~12h access token.
 *
 * TREAT THE REFRESH TOKEN AS ROTATING. The response carries one back; when it
 * differs from the one sent, the old one may stop working, so it is written to
 * VOLO_ROTATED_TOKEN_FILE for the workflow to push back into the repo secret.
 * Dropping a rotated token strands the account until someone re-authenticates
 * by hand.
 */
async function authenticate() {
	// VOLO_TOKEN short-circuits the refresh entirely — the same escape hatch the
	// volo-sports skill documents for CI and cron. It matters for LOCAL runs: the
	// refresh token rotates on every webRefresh, and the same value is stored as
	// the VOLO_REFRESH_TOKEN GitHub secret, so an ordinary `bun tools/volo/fetch.mjs`
	// while iterating would silently invalidate the secret and break the workflow.
	// With a ~12h access token from the skill's session there is nothing to rotate.
	const accessOnly = process.env.VOLO_TOKEN;
	if (accessOnly) {
		mask(accessOnly);
		const claims = JSON.parse(
			Buffer.from(accessOnly.split(".")[1], "base64url").toString("utf8"),
		);
		const hasura = claims["https://hasura.io/jwt/claims"] ?? {};
		return {
			userId: hasura["x-hasura-user-id"],
			username: null,
			accessToken: accessOnly,
		};
	}

	const refreshToken = process.env.VOLO_REFRESH_TOKEN;
	if (!refreshToken) {
		console.error(
			"::error::Neither VOLO_REFRESH_TOKEN nor VOLO_TOKEN is set — cannot query the Volo API.",
		);
		process.exit(1);
	}
	mask(refreshToken);

	let auth;
	try {
		({ webRefresh: auth } = await graphql(REFRESH, { t: refreshToken }, null));
	} catch (error) {
		// Volo's answer to a revoked or expired refresh token. It is not worth a
		// retry; it needs a human with a browser.
		if (String(error.message).includes("Session not found")) {
			console.error(
				"::error::Volo rejected the refresh token (Session not found). " +
					"Re-authenticate with the volo-sports skill " +
					"(`volo.py auth login --email …`) and update VOLO_REFRESH_TOKEN.",
			);
			process.exit(1);
		}
		throw error;
	}

	mask(auth.token);
	mask(auth.web_auth_refresh_token);

	const rotatedPath = process.env.VOLO_ROTATED_TOKEN_FILE;
	if (rotatedPath && auth.web_auth_refresh_token && auth.web_auth_refresh_token !== refreshToken) {
		await writeFile(rotatedPath, auth.web_auth_refresh_token, { encoding: "utf8", mode: 0o600 });
		console.log("Refresh token rotated — written for the workflow to persist.");
	}

	return { userId: auth._id, username: auth.username, accessToken: auth.token };
}

/**
 * Every registration, its league, its team, the standings table, and every
 * fixture that team has — in one call.
 *
 * Hasura names foreign keys `<field>By<Field>`: `league` is a uuid column and
 * `leagueByLeague` is the joined row. Mixing them up is the commonest way to
 * get a confusing validation error out of this endpoint.
 */
const SEASONS = `
query Seasons($userId: uuid!) {
	registrants(where: {userByUser: {_id: {_eq: $userId}}}) {
		leagueByLeague {
			_id
			display_name
			name
			status
			start_date
			timezone
			deep_link
			seasonBySeason { name order }
			sportBySport { name }
			venueByVenue { shorthand_name city }
			standings {
				team
				wins
				losses
				ties
				points_for
				points_against
				points_differential
				# Presence of ANY game is how a real team is told from a standings
				# placeholder — see realStandings() below.
				teamByTeam { game_teams(limit: 1) { _id } }
			}
			tournaments {
				# Both are LIST relationships, despite reading like single objects.
				winner { _id }
				participants { seed team { _id } }
			}
		}
		teams {
			_id
			name
			color_hex
			game_teams {
				gameByGame {
					_id
					start_time
					is_tournament
					winner
					forfeitter
					# Populated for every REGULAR-season game and null for every
					# playoff game, which makes it a reliable split as well as a
					# week index. Every season runs exactly 6 weeks.
					weekByWeek { week_num }
					tournament_match { round { name order } }
					teams { teamByTeam { _id name color_hex } }
					scores { team score forfeit }
				}
			}
		}
	}
}`;

/**
 * Standings rows that are actually teams.
 *
 * Volo's standings include roster placeholders — a row literally called
 * "PlaceHolder" in Fall 2023 and "Bye Week" in Spring 2024 — which inflate the
 * league size and make a finish read as "1st of 10" when it was 1st of 9.
 * Filter on HAVING PLAYED A GAME, never on the name: Fall 2025 contains a real
 * team genuinely called "Team: No Game Today" with a 3–3 record.
 */
function realStandings(standings) {
	return (standings ?? []).filter((row) => row.teamByTeam?.game_teams?.length);
}

/** Rank within the league: wins first, point differential as the tiebreak. */
function rankOf(standings, teamId) {
	const table = [...standings].sort(
		(a, b) =>
			(b.wins ?? 0) - (a.wins ?? 0) ||
			(b.points_differential ?? 0) - (a.points_differential ?? 0),
	);
	const index = table.findIndex((row) => row.team === teamId);
	return { rank: index < 0 ? null : index + 1, teams: table.length };
}

function toGame(game, teamId, rankByTeam, seedByTeam) {
	const opponent = (game.teams ?? [])
		.map((t) => t.teamByTeam)
		.find((t) => t && t._id !== teamId);

	const mine = (game.scores ?? []).find((s) => s.team === teamId);
	const theirs = (game.scores ?? []).find((s) => s.team !== teamId);
	const scored = mine && theirs;

	// games.winner is the outcome Volo itself recorded, so it is preferred over
	// comparing the two numbers — it is also the only thing that decides a
	// forfeit, where the scores can be equal or absent.
	let result = null;
	if (scored) {
		result =
			game.winner === teamId ? "W"
			: game.winner ? "L"
			: mine.score > theirs.score ? "W"
			: mine.score < theirs.score ? "L"
			: "T";
	}

	return {
		startTime: game.start_time,
		opponent: opponent?.name?.trim() || "TBD",
		opponentColor: opponent?.color_hex ?? null,
		// Where the opponent FINISHED, which is not where they stood on the night
		// — the widget labels it as a final placing rather than a live one.
		opponentRank: (opponent && rankByTeam.get(opponent._id)) ?? null,
		// The playoff seed, which IS accurate at the moment a bracket game was
		// played. Only qualifiers have one.
		opponentSeed: (opponent && seedByTeam.get(opponent._id)) ?? null,
		playoff: Boolean(game.is_tournament),
		// "Semifinals" / "Finals" / "Round 1" — the widget shows this in place of
		// the margin bar, so a playoff game stops rendering like a week-3 fixture.
		round: game.tournament_match?.round?.name ?? null,
		roundOrder: game.tournament_match?.round?.order ?? null,
		week: game.weekByWeek?.week_num ?? null,
		result,
		for: scored ? mine.score : null,
		against: scored ? theirs.score : null,
		forfeit: Boolean(game.forfeitter) || Boolean(mine?.forfeit) || Boolean(theirs?.forfeit),
	};
}

function toSeason(registrant) {
	const league = registrant.leagueByLeague;
	const team = (registrant.teams ?? []).find((t) => t?._id);
	if (!league || !team) return null;
	if (EXCLUDED_SPORTS.has(league.sportBySport?.name)) return null;

	const standings = realStandings(league.standings);

	// Everyone's final placing, and everyone's seed, keyed by team — so each game
	// can name the opponent's standing without a second pass over the league.
	const ordered = [...standings].sort(
		(a, b) =>
			(b.wins ?? 0) - (a.wins ?? 0) ||
			(b.points_differential ?? 0) - (a.points_differential ?? 0),
	);
	const rankByTeam = new Map(ordered.map((row, i) => [row.team, i + 1]));
	const seedByTeam = new Map();
	for (const tournament of league.tournaments ?? []) {
		for (const entry of tournament.participants ?? []) {
			if (entry.team?._id) seedByTeam.set(entry.team._id, entry.seed);
		}
	}

	const games = (team.game_teams ?? [])
		.map((gt) => gt.gameByGame)
		.filter(Boolean)
		.sort((a, b) => a.start_time.localeCompare(b.start_time))
		.map((game) => toGame(game, team._id, rankByTeam, seedByTeam));
	if (!games.length) return null;

	const standing = standings.find((row) => row.team === team._id);
	const { rank, teams } = rankOf(standings, team._id);
	const seed = seedByTeam.get(team._id) ?? null;

	// `winner` is a LIST relationship even though it reads like a single object.
	let champion = false;
	for (const tournament of league.tournaments ?? []) {
		for (const winner of tournament.winner ?? []) {
			if (winner._id === team._id) champion = true;
		}
	}

	return {
		id: league._id,
		sport: league.sportBySport?.name ?? "",
		league: league.display_name || league.name || "",
		// "Summer 2026" — Volo's own label, rather than one inferred from the
		// start date. `order` sorts correctly across years.
		seasonLabel: league.seasonBySeason?.name ?? null,
		seasonOrder: league.seasonBySeason?.order ?? null,
		venue: league.venueByVenue?.shorthand_name ?? "",
		city: league.venueByVenue?.city ?? "",
		startDate: league.start_date,
		timezone: league.timezone || "America/Los_Angeles",
		status: league.status ?? "",
		deepLink: league.deep_link ?? null,
		team: { name: team.name?.trim() || "", color: team.color_hex ?? null },
		record: {
			wins: standing?.wins ?? 0,
			losses: standing?.losses ?? 0,
			ties: standing?.ties ?? 0,
			pointsFor: standing?.points_for ?? null,
			pointsAgainst: standing?.points_against ?? null,
			differential: standing?.points_differential ?? null,
			rank,
			teams,
		},
		// NOT interchangeable with `rank`. The seed ranks only the teams that
		// QUALIFIED (4 of 8 in recent seasons), so "seed 4" and "4th of 8" are
		// different measurements and the header must keep using rank.
		seed,
		champion,
		games,
	};
}

async function main() {
	const { userId, username, accessToken } = await authenticate();
	const { registrants } = await graphql(SEASONS, { userId }, accessToken);

	if (!registrants?.length) {
		console.error(
			"::error::No registrations came back for this account — auth or permissions " +
				"likely broken. Not writing.",
		);
		process.exit(1);
	}

	const seasons = registrants
		.map(toSeason)
		.filter(Boolean)
		.sort((a, b) => a.startDate.localeCompare(b.startDate));

	// STALE-AUTH GUARD. Scores are PLAYER-only: a token that authenticates but
	// resolves to the wrong role returns the fixtures with every score empty,
	// which would quietly commit a widget of blank seasons. A real account with
	// years of history always has at least one recorded result.
	const anyResult = seasons.some((s) => s.games.some((g) => g.result));
	if (!anyResult) {
		console.error(
			"::error::No season has a single recorded result — the PLAYER role is " +
				"probably not being applied. Not writing.",
		);
		process.exit(1);
	}

	const out = {
		updated: new Date().toISOString(),
		username,
		seasons,
	};

	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	console.log(
		`Wrote ${seasons.length} seasons ` +
			`(${seasons.reduce((n, s) => n + s.games.length, 0)} games) to ${OUT_PATH}`,
	);
}

main().catch((err) => {
	console.error(`::error::${err?.stack ?? err}`);
	process.exit(1);
});
