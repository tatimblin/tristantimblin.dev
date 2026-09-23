// Volo league seasons — read at build time (frontmatter runs in Node) from
// volo.json, which the volo-seasons GitHub Action regenerates daily (the
// Action's fetch script writes to this file's path — keep them in sync).
// Volo.astro consumes the normalized shape returned by getVoloSeasons().
//
// Vite inlines the JSON at build time, so the data is bundled with the page — no
// filesystem read or API call at render time, and no credential shipped to the
// client. See tools/volo/fetch.mjs for the shape and
// .github/workflows/volo-seasons.yml for the pipeline (mirrors the github-stats
// setup).
import data from "./volo.json";

export type GameResult = "W" | "L" | "T";

export interface VoloGame {
	startTime: string; // ISO instant, UTC
	opponent: string;
	opponentColor: string | null;
	opponentRank: number | null; // where they FINISHED the league
	opponentSeed: number | null; // their playoff seed, if they qualified
	playoff: boolean;
	round: string | null; // "Semifinals" / "Finals" / "Round 1"; null outside playoffs
	roundOrder: number | null; // position of that round within the bracket
	week: number | null; // 1–7 for regular season, null for playoff games
	result: GameResult | null; // null = no result recorded (see below)
	for: number | null;
	against: number | null;
	forfeit: boolean;
}

export interface VoloRecord {
	wins: number;
	losses: number;
	ties: number;
	pointsFor: number | null;
	pointsAgainst: number | null;
	differential: number | null;
	rank: number | null;
	teams: number;
}

export interface VoloSeason {
	id: string;
	sport: string;
	// No venue, city, league name or deep link — see tools/volo/fetch.mjs. The
	// data file is public and ships to every visitor alongside kick-off times,
	// so it carries no place.
	startDate: string; // ISO instant, UTC
	timezone: string; // IANA name; the VENUE's zone, not the build machine's
	status: string;
	seasonLabel: string | null; // Volo's own "Summer 2026"
	team: { name: string; color: string | null };
	record: VoloRecord;
	seed: number | null; // playoff seed — ranks QUALIFIERS only, not the league
	champion: boolean;
	games: VoloGame[];
}

const RESULTS = new Set<GameResult>(["W", "L", "T"]);

const str = (v: unknown, fallback = ""): string =>
	typeof v === "string" ? v : fallback;

const int = (v: unknown): number | null => {
	// The null check is load-bearing: Number(null) is 0, and 0 is finite — so
	// without it every absent number in the JSON normalises to zero rather than
	// to nothing. That is how a season with no playoff seed ended up seeded 0th.
	if (v === null || v === undefined || v === "") return null;
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
};

// Defensive normalization: volo.json is generated, but tolerate missing/partial
// fields so a bad data file renders an empty widget rather than throwing the
// build. A season with no games is dropped rather than rendered blank.
function toGame(raw: Record<string, unknown>): VoloGame {
	const result = RESULTS.has(raw.result as GameResult)
		? (raw.result as GameResult)
		: null;
	return {
		startTime: str(raw.startTime),
		opponent: str(raw.opponent, "TBD"),
		opponentColor: typeof raw.opponentColor === "string" ? raw.opponentColor : null,
		opponentRank: int(raw.opponentRank),
		opponentSeed: int(raw.opponentSeed),
		playoff: Boolean(raw.playoff),
		round: typeof raw.round === "string" ? raw.round : null,
		roundOrder: int(raw.roundOrder),
		week: int(raw.week),
		// AN ABSENT SCORE IS NOT A TIE. `result` stays null when Volo recorded no
		// result — not yet played, not yet scored, or postponed — and the row
		// renders as an upcoming fixture rather than as 0–0.
		result,
		for: result ? int(raw.for) : null,
		against: result ? int(raw.against) : null,
		forfeit: Boolean(raw.forfeit),
	};
}

function toSeason(raw: Record<string, unknown>): VoloSeason | null {
	const games = Array.isArray(raw.games)
		? (raw.games as Array<Record<string, unknown>>).map(toGame)
		: [];
	if (!games.length) return null;

	const team = (raw.team ?? {}) as Record<string, unknown>;
	const record = (raw.record ?? {}) as Record<string, unknown>;

	return {
		id: str(raw.id),
		sport: str(raw.sport),
		startDate: str(raw.startDate),
		seasonLabel: typeof raw.seasonLabel === "string" ? raw.seasonLabel : null,
		// Volo runs leagues in several cities and this one's history spans two, so
		// the machine's zone is the wrong assumption — an 03:00Z game is the
		// PREVIOUS evening in Pacific, and formatting it naively shows the wrong day.
		timezone: str(raw.timezone, "America/Los_Angeles"),
		status: str(raw.status),
		team: {
			name: str(team.name),
			color: typeof team.color === "string" ? team.color : null,
		},
		record: {
			wins: int(record.wins) ?? 0,
			losses: int(record.losses) ?? 0,
			ties: int(record.ties) ?? 0,
			pointsFor: int(record.pointsFor),
			pointsAgainst: int(record.pointsAgainst),
			differential: int(record.differential),
			rank: int(record.rank),
			teams: int(record.teams) ?? 0,
		},
		seed: int(raw.seed),
		champion: Boolean(raw.champion),
		games,
	};
}

export function getVoloSeasons(): VoloSeason[] {
	const raw = (data ?? {}) as Record<string, unknown>;
	const seasons = Array.isArray(raw.seasons)
		? (raw.seasons as Array<Record<string, unknown>>)
				.map(toSeason)
				.filter((s): s is VoloSeason => s !== null)
		: [];
	return seasons.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/**
 * Which season the widget opens on: the most recent one that has started.
 *
 * Deliberately NOT `status === "active"` — two seasons are routinely active at
 * once here (overlapping Tuesday sessions), so "active" does not identify one
 * season. Falls back to the last entry, which is right both for a history that
 * has not begun its newest season and for an empty list.
 */
export function currentSeasonIndex(seasons: VoloSeason[]): number {
	if (!seasons.length) return 0;
	const now = new Date().toISOString();
	const started = seasons.findLastIndex((s) => s.startDate <= now);
	return started >= 0 ? started : seasons.length - 1;
}

/** "AUG 2026" — the season's own label, in the venue's zone. */
export function formatSeasonLabel(season: VoloSeason): string {
	return fmt(season.startDate, season.timezone, {
		month: "short",
		year: "numeric",
	}).toUpperCase();
}

/**
 * "08/18" — a game's date in the venue's zone.
 *
 * Both parts are 2-digit so every date is the same width: the column is set in
 * tabular figures, and "9/1" against "10/22" would leave the dates ragged where
 * every other column down this tile lines up.
 */
export function formatGameDate(startTime: string, timeZone: string): string {
	return fmt(startTime, timeZone, { month: "2-digit", day: "2-digit" });
}

/** "8:00 PM" — a game's start in the venue's zone. */
export function formatGameTime(startTime: string, timeZone: string): string {
	return fmt(startTime, timeZone, { hour: "numeric", minute: "2-digit" });
}

function fmt(
	iso: string,
	timeZone: string,
	options: Intl.DateTimeFormatOptions,
): string {
	const date = new Date(iso);
	if (Number.isNaN(date.getTime())) return "";
	try {
		return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
	} catch {
		// An unknown IANA name throws rather than falling back, and a widget that
		// renders in UTC beats a build that dies over one bad timezone string.
		return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(date);
	}
}

const ORDINALS = ["th", "st", "nd", "rd"];

/** 1 → "1st", 2 → "2nd", 11 → "11th". */
export function ordinal(n: number): string {
	const rem100 = n % 100;
	const rem10 = n % 10;
	const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : (ORDINALS[rem10] ?? "th");
	return `${n}${suffix}`;
}

/**
 * "1st of 8 · 5–0", or "3rd of 8 · 3–3–1" when the season has a tie.
 *
 * The placing is where the season ENDED, after the playoffs — not the table
 * position it went into them with. Topping the table and losing the Final is a
 * 2nd-place season, and saying "1st of 8" there claims something that did not
 * happen. A season still running has no final placing, so it falls back to the
 * live table position.
 */
export function formatRecord(season: VoloSeason): string {
	const { record } = season;
	const tally = [record.wins, record.losses, ...(record.ties ? [record.ties] : [])];
	// EN DASHES. A record is a span between figures, not a hyphenated compound.
	const wl = tally.join("–");
	const placing = finalPlacement(season) ?? record.rank;
	const place = placing && record.teams ? `${ordinal(placing)} of ${record.teams}` : null;
	return place ? `${place} · ${wl}` : wl;
}

/* ── Derived views ──────────────────────────────────────────────────────────
   Everything below turns the flat season list into the shapes the tile draws.
   Kept here rather than in Volo.astro so the component stays a renderer. */

// Score domains differ by sport and cannot share a scale: softball margins run
// to 27 runs, volleyball is sets and never exceeds 2. Normalising against a
// FIXED per-sport cap (rather than each season's own maximum) keeps the bars
// comparable when the arrows step between seasons — a per-season max would
// silently rescale and make every season look equally decisive.
const MARGIN_CAP: Record<string, number> = { Volleyball: 2 };
const DEFAULT_MARGIN_CAP = 20; // softball: covers all but the two biggest routs

export function marginCap(sport: string): number {
	return MARGIN_CAP[sport] ?? DEFAULT_MARGIN_CAP;
}

/** 0–1 share of the sport's cap. Blowouts past the cap clamp to 1. */
export function marginRatio(game: VoloGame, sport: string): number {
	if (game.for === null || game.against === null) return 0;
	return Math.min(1, Math.abs(game.for - game.against) / marginCap(sport));
}

/** "Semifinals" → "SEMI FINALS". Drawn in place of the margin bar. */
export function formatRound(round: string | null): string | null {
	if (!round) return null;
	return round.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase()
		.replace("SEMIFINALS", "SEMI FINALS");
}

/**
 * The number to set after an opponent's name.
 *
 * A bracket game shows the SEED, which is what the opponent actually was on the
 * night. Everything else shows where they FINISHED, which is a fact from after
 * the game was played — so the two are labelled differently rather than merged
 * into one ambiguous number. Volo's own seeding disagrees with a
 * wins-then-differential sort in a couple of seasons, so where a seed exists it
 * is the authority.
 */
export function opponentStanding(
	game: VoloGame,
): { value: number; kind: "seed" | "rank" } | null {
	if (game.playoff && game.opponentSeed) {
		return { value: game.opponentSeed, kind: "seed" };
	}
	if (game.opponentRank) return { value: game.opponentRank, kind: "rank" };
	return null;
}

/**
 * Where a season actually ENDED, after the playoffs — not where the team
 * finished the regular season.
 *
 * The two are very different here: the table was topped four times and only one
 * of those became a title, because three ended in a bracket loss (twice in the
 * Final). A chart of regular-season rank therefore draws four peaks at "1st"
 * and claims four championships.
 *
 * Derived entirely from the games, no extra API surface. Single elimination, so
 * the round a team lost in fixes its finishing band: losing the Final is 2nd,
 * the Semifinal is joint 3rd, the round before that joint 5th — 2^depth + 1.
 * Depth needs the Final's round order, which a team knocked out early never
 * played; every playoff season in this account includes a Semifinal, and the
 * Final is always exactly one round after it, so that anchors it.
 *
 * Returns null while a season is still running — an unplayed fixture means the
 * finish is not a fact yet.
 */
export function finalPlacement(season: VoloSeason): number | null {
	if (season.games.some((game) => game.result === null)) return null;
	if (season.champion) return 1;

	const playoffs = season.games.filter((game) => game.playoff);
	// Missed the bracket: the regular-season table is the final word.
	if (!playoffs.length) return season.record.rank;

	const semi = playoffs.find((game) => game.round === "Semifinals");
	const final = playoffs.find((game) => game.round === "Finals");
	const finalOrder =
		final?.roundOrder ?? (semi?.roundOrder != null ? semi.roundOrder + 1 : null);

	const exit = playoffs[playoffs.length - 1];
	if (finalOrder === null || exit?.roundOrder == null) return season.record.rank;

	const depth = Math.max(0, finalOrder - exit.roundOrder);
	return 2 ** depth + 1;
}

export interface RankPoint {
	index: number;
	label: string; // "Summer 2026"
	year: string; // "2026"
	rank: number | null; // FINAL placement, after the playoffs
	seed: number | null; // where they went INTO the playoffs
	teams: number;
	/** 1 = won the league, 0 = finished last. See rankSeries(). */
	placing: number | null;
	/** The same scale, for the seed. */
	seedPlacing: number | null;
}

export interface RankSeries {
	points: RankPoint[];
	mean: number; // mean placing
	averageFinish: number; // mean RAW final rank
	titles: number;
	/** Every game ever played, which is the caption's headline. */
	record: { wins: number; losses: number; ties: number };
}

/**
 * Placing per season, for the rank chart.
 *
 * The rank here is the FINAL placement — see finalPlacement() — so the top of
 * the chart means winning the thing, not topping the table.
 *
 * NORMALISED, and it has to be. Leagues here run from 6 teams to 14, so the raw
 * rank is not comparable down the series: 2nd of 14 is a better season than 1st
 * of 6, and a chart of raw ranks would draw it as worse. `placing` is the share
 * of the league finished ahead of — 1 for a title, 0 for last — which is the
 * only quantity that means the same thing in every season.
 *
 * The headline stays as the mean RAW rank, because "2.6 average finish" is a
 * thing a person can picture and "0.77 mean placing" is not.
 */
export function rankSeries(seasons: VoloSeason[]): RankSeries {
	const scale = (position: number | null, teams: number) =>
		position && teams > 1
			? 1 - (position - 1) / (teams - 1)
			: position === 1
				? 1
				: null;

	const points: RankPoint[] = seasons.map((season, index) => {
		const { teams } = season.record;
		const rank = finalPlacement(season);
		// The seed ranks only the teams that QUALIFIED, but they are the top of
		// the table, so seed s sits at league position s — which puts it on the
		// same axis as the final placement. Seasons that missed the bracket have
		// no seed; their table position is where they went in.
		const seed = season.seed ?? season.record.rank;
		return {
			index,
			label: season.seasonLabel ?? formatSeasonLabel(season),
			year: season.startDate.slice(0, 4),
			rank,
			seed,
			teams,
			placing: scale(rank, teams),
			seedPlacing: scale(seed, teams),
		};
	});

	const placed = points.filter((p) => p.placing !== null);
	const ranked = points.filter((p) => p.rank !== null);
	const games = seasons.flatMap((season) => season.games);

	return {
		points,
		mean: placed.length
			? placed.reduce((sum, p) => sum + (p.placing as number), 0) / placed.length
			: 0,
		averageFinish: ranked.length
			? ranked.reduce((sum, p) => sum + (p.rank as number), 0) / ranked.length
			: 0,
		titles: seasons.filter((s) => s.champion).length,
		record: {
			wins: games.filter((g) => g.result === "W").length,
			losses: games.filter((g) => g.result === "L").length,
			ties: games.filter((g) => g.result === "T").length,
		},
	};
}
