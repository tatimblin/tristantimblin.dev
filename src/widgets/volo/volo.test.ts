import { describe, expect, test } from "bun:test";
import {
	careerSummary,
	diffChart,
	diffScale,
	formatDiff,
	formatFinish,
	isOver,
	linescoreColumns,
	nextGameIndex,
	roundShort,
	seasonMedal,
	seasonNames,
	softballSeasons,
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

const scored = (result: GameResult, ours: number, theirs: number, round: string | null = null): VoloGame => ({
	...game(result, round),
	for: ours,
	against: theirs,
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

const labelled = (label: string, sport = "Softball"): VoloSeason => ({ ...season([game("W")]), seasonLabel: label, sport });
const ranked = (s: VoloSeason, rank: number) => ({ ...s, record: { ...s.record, rank } });

describe("softballSeasons", () => {
	test("keeps the softball seasons, in order", () => {
		const seasons = [labelled("Summer 2021", "Volleyball"), labelled("Fall 2023"), labelled("Spring 2024")];
		expect(softballSeasons(seasons).map((s) => s.seasonLabel)).toEqual(["Fall 2023", "Spring 2024"]);
	});
});

describe("seasonNames", () => {
	test("two leagues with one label are early and late; a lone one keeps its label", () => {
		const names = seasonNames([labelled("Spring 2025"), labelled("Summer 2025"), labelled("Summer 2025"), labelled("Fall 2025")]);
		expect(names).toEqual(["Spring 2025", "Early Summer 2025", "Late Summer 2025", "Fall 2025"]);
	});

	test("three add a mid; past that they are numbered", () => {
		expect(seasonNames([labelled("Fall 2025"), labelled("Fall 2025"), labelled("Fall 2025")])).toEqual([
			"Early Fall 2025",
			"Mid Fall 2025",
			"Late Fall 2025",
		]);
		expect(seasonNames(Array.from({ length: 4 }, () => labelled("Fall 2025")))[3]).toBe("Fall 2025 4");
	});
});

describe("formatFinish", () => {
	test("where the season ended, out of the league: a title is 1st, a lost final 2nd, a lost semi 3rd", () => {
		expect(formatFinish(season([game("W"), game("W", "Semifinals"), game("W", "Finals")], true))).toBe("1st of 8");
		expect(formatFinish(ranked(season([game("W"), game("W", "Semifinals"), game("L", "Finals")]), 1))).toBe("2nd of 8");
		expect(formatFinish(ranked(season([game("W"), game("L", "Semifinals")]), 2))).toBe("3rd of 8");
	});

	test("missed the bracket, or still running: the table's position", () => {
		expect(formatFinish(ranked(season([game("L"), game("L")]), 5))).toBe("5th of 8");
		expect(formatFinish(ranked(season([game("W"), game(null)]), 3))).toBe("3rd of 8");
	});
});

describe("seasonMedal", () => {
	test("a trophy for the title, medals for 2nd and 3rd; nothing off the podium or still running", () => {
		expect(seasonMedal(season([game("W"), game("W", "Finals")], true))).toBe("🏆");
		expect(seasonMedal(ranked(season([game("W"), game("W", "Semifinals"), game("L", "Finals")]), 1))).toBe("🥈");
		expect(seasonMedal(ranked(season([game("W"), game("L", "Semifinals")]), 2))).toBe("🥉");
		expect(seasonMedal(ranked(season([game("L"), game("L")]), 5))).toBeNull();
		expect(seasonMedal(ranked(season([game("W"), game(null)]), 1))).toBeNull();
	});
});

describe("careerSummary", () => {
	test("counts every game played", () => {
		const summary = careerSummary([
			season([game("W"), game("W", "Finals")], true),
			season([game("L"), game("T"), game("L", "Finals")]),
			season([game("W"), game(null)]),
		]);
		expect(summary).toEqual({ wins: 3, losses: 2, ties: 1 });
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

describe("linescoreColumns", () => {
	test("the weeks numbered, the playoffs by round", () => {
		const columns = linescoreColumns(season([game("W"), game("L"), game("W", "Semifinals"), game("L", "Finals")]));
		expect(columns.map((c) => c.label)).toEqual(["1", "2", "SF", "F"]);
	});

	test("a running season holds empty columns for the bracket's last two rounds", () => {
		const columns = linescoreColumns(season([game("W"), game(null)]));
		expect(columns.map((c) => c.label)).toEqual(["1", "2", "SF", "F"]);
		expect(columns.slice(2).every((c) => c.game === null)).toBe(true);
	});

	test("roundShort", () => {
		expect([roundShort("Finals"), roundShort("Semifinals"), roundShort("Round 2"), roundShort(null)]).toEqual(["F", "SF", "R2", "P"]);
	});
});

describe("diffChart", () => {
	test("runs and wins pile up game by game; a tie is level on wins", () => {
		const points = diffChart([season([scored("W", 10, 4), scored("L", 3, 5), scored("T", 6, 6), scored("W", 9, 1, "Finals")])]);
		expect(points.map((p) => [p.x, p.run, p.win])).toEqual([[0.25, 6, 1], [0.5, 4, 0], [0.75, 4, 0], [1, 12, 1]]);
		expect(points.map((p) => p.final)).toEqual([false, false, false, true]);
	});

	test("every season is one equal band, its games spread across it; a running one keeps a slot for what is next", () => {
		const points = diffChart([season([game("W"), game("L"), game("W"), game("W")]), season([game("W"), game(null), game(null)])]);
		expect(points.map((p) => [p.season, p.x])).toEqual([[0, 0.25], [0, 0.5], [0, 0.75], [0, 1], [1, 1.5]]);
	});

	test("the axis runs from zero to a round top, below zero only if the line goes there", () => {
		const up = diffChart([season([scored("W", 300, 0), scored("W", 153, 0)])]);
		expect(diffScale(up, "run")).toEqual({ min: 0, max: 500, ticks: [0, 250, 500] });
		const down = diffChart([season([scored("L", 0, 12)])]);
		expect(diffScale(down, "run")).toEqual({ min: -100, max: 100, ticks: [-100, 0, 100] });
		expect(diffScale(down, "win")).toEqual({ min: -10, max: 10, ticks: [-10, 0, 10] });
	});

	test("formatDiff signs the labels", () => {
		expect([formatDiff(250), formatDiff(0), formatDiff(-20)]).toEqual(["+250", "0", "−20"]);
	});
});
