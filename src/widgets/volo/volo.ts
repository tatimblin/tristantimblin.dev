// Volo league seasons — read at build time (frontmatter runs in Node) from
// volo.json, which the nightly workflow regenerates on Volo days (its fetch
// script writes to this file's path — keep them in sync).
// Volo.astro consumes the normalized shape returned by getVoloSeasons().
//
// Vite inlines the JSON at build time, so the data is bundled with the page — no
// filesystem read or API call at render time, and no credential shipped to the
// client. See tools/volo/fetch.mjs for the shape and
// .github/workflows/nightly.yml for the pipeline.
import data from "../../data/volo.json";

export type GameResult = "W" | "L" | "T";

export interface VoloGame {
	startTime: string; // ISO instant, UTC
	opponent: string;
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
function ordinal(n: number): string {
	const rem100 = n % 100;
	const rem10 = n % 10;
	const suffix = rem100 >= 11 && rem100 <= 13 ? "th" : (ORDINALS[rem10] ?? "th");
	return `${n}${suffix}`;
}

/** "5–0", or "3–3–1" when the season has a tie. */
export function formatTally(season: VoloSeason): string {
	const { record } = season;
	const tally = [record.wins, record.losses, ...(record.ties ? [record.ties] : [])];
	// EN DASHES. A record is a span between figures, not a hyphenated compound.
	return tally.join("–");
}

/* ── Derived views ──────────────────────────────────────────────────────────
   Everything below turns the flat season list into the shapes the tile draws.
   Kept here rather than in Volo.astro so the component stays a renderer. */

/**
 * The seasons the tile draws: softball only. The chart is a running RUN
 * differential and volleyball is scored in sets (2–0), which cannot share that
 * scale, so this is the softball card, career record included.
 */
export function softballSeasons(seasons: VoloSeason[]): VoloSeason[] {
	return seasons.filter((season) => season.sport === "Softball");
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
function finalPlacement(season: VoloSeason): number | null {
	if (!isOver(season)) return null;
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

/**
 * "2nd of 8", or null when the season has no placing at all.
 *
 * The placing is where the season ENDED, after the playoffs — not the table
 * position it went into them with. Topping the table and losing the Final is a
 * 2nd-place season, and saying "1st" there claims something that did not
 * happen. A season still running has no final placing, so it falls back to the
 * live table position.
 */
export function formatFinish(season: VoloSeason): string | null {
	const { record } = season;
	const place = finalPlacement(season) ?? record.rank;
	return place && record.teams ? `${ordinal(place)} of ${record.teams}` : null;
}

const MEDALS: Record<number, string> = { 1: "🏆", 2: "🥈", 3: "🥉" };

/** A finished season's podium: a trophy for the title, a medal for 2nd or 3rd. */
export function seasonMedal(season: VoloSeason): string | null {
	const place = finalPlacement(season);
	return place ? (MEDALS[place] ?? null) : null;
}

/** The first game with no result yet, or -1 once the season is over. */
export function nextGameIndex(season: VoloSeason): number {
	return season.games.findIndex((game) => !game.result);
}

/** Every game has a result: the finish is a fact. */
export function isOver(season: VoloSeason): boolean {
	return nextGameIndex(season) < 0;
}

/** "Fall 2026" — Volo's own label, or "Aug 2026" when it has none. */
function seasonName(season: VoloSeason): string {
	return season.seasonLabel ?? fmt(season.startDate, season.timezone, { month: "short", year: "numeric" });
}

const SPLITS: Record<number, string[]> = { 2: ["Early", "Late"], 3: ["Early", "Mid", "Late"] };

/**
 * Every season's name, told apart where Volo gives two the same label: two
 * leagues in one summer are "Early Summer 2025" and "Late Summer 2025" (by
 * start date; the list is sorted), a third adds "Mid", and past that they are
 * numbered.
 */
export function seasonNames(seasons: VoloSeason[]): string[] {
	const names = seasons.map(seasonName);
	return names.map((name, i) => {
		const same = names.flatMap((other, j) => (other === name ? [j] : []));
		if (same.length < 2) return name;
		const at = same.indexOf(i);
		const split = SPLITS[same.length];
		return split ? `${split[at]} ${name}` : `${name} ${at + 1}`;
	});
}

/** "26" — the season's two-digit year, for the chart's axis. */
export function seasonYear(season: VoloSeason): string {
	return season.startDate.slice(2, 4);
}

/** "Tue 11/17 · 8:00 PM" — when a game is, in the venue's zone. */
export function formatGameWhen(startTime: string, timeZone: string): string {
	const day = fmt(startTime, timeZone, { weekday: "short" });
	return `${day} ${formatGameDate(startTime, timeZone)} · ${formatGameTime(startTime, timeZone)}`;
}

/** The headline: every game played across the given seasons. */
export function careerSummary(seasons: VoloSeason[]) {
	const games = seasons.flatMap((season) => season.games);
	return {
		wins: games.filter((g) => g.result === "W").length,
		losses: games.filter((g) => g.result === "L").length,
		ties: games.filter((g) => g.result === "T").length,
	};
}

/* ── Linescore ──────────────────────────────────────────────────────────── */

/** "Semifinals" → "SF", "Finals" → "F", "Round 2" → "R2": a column's head. */
export function roundShort(round: string | null): string {
	if (round === "Finals") return "F";
	if (round === "Semifinals") return "SF";
	if (round === "Quarterfinals") return "QF";
	const n = round?.match(/\d+/);
	return n ? `R${n[0]}` : "P";
}

export interface LinescoreColumn {
	/** "1"… for the regular season's weeks, the round for a playoff game. */
	label: string;
	/** Null for a bracket the season has not reached yet. */
	game: VoloGame | null;
}

/**
 * A season's linescore columns: every game in order, and while the season is
 * running and has no playoff game yet, a column held for each of the bracket's
 * last two rounds, so the table already shows how far it can go.
 */
export function linescoreColumns(season: VoloSeason): LinescoreColumn[] {
	let week = 0;
	const columns: LinescoreColumn[] = season.games.map((game) => ({
		label: game.playoff ? roundShort(game.round) : String(++week),
		game,
	}));
	if (!isOver(season) && !season.games.some((game) => game.playoff)) {
		columns.push({ label: "SF", game: null }, { label: "F", game: null });
	}
	return columns;
}

/* ── The differential chart ─────────────────────────────────────────────── */

export type DiffMode = "run" | "win";

export interface DiffPoint {
	/** Index into the seasons the chart was drawn from. */
	season: number;
	/** Where the game falls, in seasons (see diffChart()). */
	x: number;
	run: number;
	win: number;
	/** The league's Final: the one game the chart marks. */
	final: boolean;
	result: GameResult;
}

/**
 * The running differential, game by game across every season, in two modes:
 * RUNS (scored minus allowed) and WINS (won minus lost; a tie is level).
 *
 * x is in seasons: every season's band is one unit wide, so a nine-game
 * season with a playoff run and a six-game one are the same size to pick. Its
 * games share the band evenly — each takes a slot and lands at the slot's
 * end — and a season with games still to play keeps one more slot, so the
 * line stops short of the band's edge, where what is next will go.
 */
export function diffChart(seasons: VoloSeason[]): DiffPoint[] {
	const points: DiffPoint[] = [];
	let run = 0;
	let win = 0;
	seasons.forEach((season, i) => {
		const played = season.games.filter((game) => game.result);
		const slots = played.length + (isOver(season) ? 0 : 1);
		played.forEach((game, k) => {
			run += (game.for ?? 0) - (game.against ?? 0);
			win += game.result === "W" ? 1 : game.result === "L" ? -1 : 0;
			points.push({
				season: i,
				x: i + (k + 1) / slots,
				run,
				win,
				final: game.round === "Finals",
				result: game.result as GameResult,
			});
		});
	});
	return points;
}

// The axis steps: runs pile up by the hundred, wins by the ten.
const DIFF_STEP: Record<DiffMode, number> = { run: 100, win: 10 };

/**
 * A mode's axis: from zero (or a round floor, if the line ever dips below it)
 * to a round top, with three labelled rules.
 */
export function diffScale(points: DiffPoint[], mode: DiffMode): { min: number; max: number; ticks: number[] } {
	const step = DIFF_STEP[mode];
	const values = points.map((point) => point[mode]);
	const max = Math.max(step, Math.ceil(Math.max(0, ...values) / step) * step);
	const min = Math.min(0, Math.floor(Math.min(0, ...values) / step) * step);
	const ticks = min < 0 ? [min, 0, max] : [0, max / 2, max];
	return { min, max, ticks };
}

/** "+250", "0", "−20" — an axis label. */
export function formatDiff(value: number): string {
	return value > 0 ? `+${value}` : value < 0 ? `−${-value}` : "0";
}
