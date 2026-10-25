import { describe, expect, test } from "bun:test";
import {
	careerSummary,
	isOver,
	nextGameIndex,
	peekStart,
	placeMark,
	seasonOutcome,
	PEEK_ROWS,
	PENDING_BRACKET,
	seasonStack,
	stackHeight,
	type GameResult,
	type VoloGame,
	type VoloSeason,
} from "./volo";

const ROUND_ORDER: Record<string, number> = { Semifinals: 1, Finals: 2 };

const game = (result: GameResult | null, round: string | null = null): VoloGame => ({
	startTime: "2026-10-14T03:00:00+00:00",
	opponent: "CPK",
	opponentRank: null,
	opponentSeed: null,
	playoff: round !== null,
	round,
	roundOrder: round ? (ROUND_ORDER[round] ?? null) : null,
	week: null,
	result,
	for: result ? 10 : null,
	against: result ? 8 : null,
	forfeit: false,
});

const season = (games: VoloGame[], champion = false): VoloSeason => ({
	id: "s",
	sport: "Softball",
	startDate: "2026-10-01T00:00:00+00:00",
	timezone: "America/Los_Angeles",
	status: "completed",
	seasonLabel: "Fall 2026",
	team: { name: "Team", color: null },
	record: { wins: 0, losses: 0, ties: 0, pointsFor: null, pointsAgainst: null, differential: null, rank: null, teams: 8 },
	seed: null,
	champion,
	games,
});

describe("seasonStack", () => {
	test("splits the regular season by outcome and keeps the playoffs in order", () => {
		const stack = seasonStack(
			season([game("W"), game("L"), game("T"), game("W"), game("W", "Semifinals"), game("L", "Finals")]),
		);
		expect(stack).toEqual({ wins: 2, ties: 1, losses: 1, unplayed: 0, playoffs: ["W", "L"], bracketPending: false });
	});

	test("a season still running holds room for its bracket", () => {
		const stack = seasonStack(season([game("W"), game(null), game(null)]));
		expect(stack.unplayed).toBe(2);
		expect(stack.bracketPending).toBe(true);
		expect(stackHeight(stack)).toBe(3 + PENDING_BRACKET);
	});

	test("a finished season that missed the playoffs has no bracket", () => {
		const stack = seasonStack(season([game("L"), game("L")]));
		expect(stack.bracketPending).toBe(false);
		expect(stackHeight(stack)).toBe(2);
	});
});

describe("careerSummary", () => {
	test("counts every game, the finals reached and the titles won", () => {
		const summary = careerSummary([
			season([game("W"), game("W", "Finals")], true),
			season([game("L"), game("T"), game("L", "Finals")]),
			season([game("W"), game("L", "Semifinals")]),
		]);
		expect(summary).toEqual({ wins: 3, losses: 3, ties: 1, finals: 2, titles: 1 });
	});
});

describe("peekStart", () => {
	test("running: opens on the last result, then what is next", () => {
		const games = [game("W"), game("L"), game(null), game(null), game(null), game(null)];
		expect(peekStart(season(games))).toBe(1);
	});

	test("nothing played yet: opens on the first game", () => {
		expect(peekStart(season([game(null), game(null), game(null), game(null)]))).toBe(0);
	});

	test("over: opens on the last games, how it ended", () => {
		const games = Array.from({ length: 8 }, () => game("W"));
		expect(peekStart(season(games))).toBe(8 - PEEK_ROWS);
	});

	test("near the end of a season the window stays full", () => {
		const games = [game("W"), game("W"), game("W"), game("W"), game(null)];
		expect(peekStart(season(games))).toBe(5 - PEEK_ROWS);
	});

	test("shorter than the window: from the top", () => {
		expect(peekStart(season([game("W")]))).toBe(0);
	});
});

describe("nextGameIndex / isOver", () => {
	test("the first game without a result, until there is none", () => {
		expect(nextGameIndex(season([game("W"), game(null), game(null)]))).toBe(1);
		expect(isOver(season([game("W"), game(null)]))).toBe(false);
		expect(nextGameIndex(season([game("W"), game("L")]))).toBe(-1);
		expect(isOver(season([game("W"), game("L")]))).toBe(true);
	});
});

describe("placeMark", () => {
	const ranked = (s: VoloSeason, rank: number) => ({ ...s, record: { ...s.record, rank } });

	test("a title: the trophy", () => {
		expect(placeMark(season([game("W"), game("W", "Semifinals"), game("W", "Finals")], true))).toEqual({ text: "🏆", medal: true });
	});

	test("lost the final: silver; lost a semifinal: bronze", () => {
		expect(placeMark(season([game("W"), game("W", "Semifinals"), game("L", "Finals")]))).toEqual({ text: "🥈", medal: true });
		expect(placeMark(season([game("W"), game("L", "Semifinals")]))).toEqual({ text: "🥉", medal: true });
	});

	test("missed the bracket: the table's ordinal", () => {
		expect(placeMark(ranked(season([game("L"), game("L")]), 5))).toEqual({ text: "5th", medal: false });
	});

	test("still running: the live position, never a medal", () => {
		expect(placeMark(ranked(season([game("W"), game(null)]), 3))).toEqual({ text: "3rd", medal: false });
	});
});

describe("seasonOutcome", () => {
	test("says how each season ended", () => {
		expect(seasonOutcome(season([game("W", "Finals")], true))).toBe("won the league");
		expect(seasonOutcome(season([game("W"), game(null)]))).toBe("still playing");
		expect(seasonOutcome(season([game("W"), game("L", "Finals")]))).toBe("lost in the Finals");
		expect(seasonOutcome(season([game("L")]))).toBe("missed the playoffs");
	});
});
