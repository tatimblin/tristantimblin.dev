import { test, expect } from "@playwright/test";
import {
	tokenize,
	search,
	highlight,
	chooseBlock,
	unavoidableCells,
	inBlock,
	scatter,
	layout,
	mode,
	resolve,
	toCell,
	toColRow,
	tagLabel,
	SCATTER_MAX_DELAY,
	MIN_ROWS,
	FILLER_COUNT,
	type IndexedPost,
	type QuiltState,
} from "../src/lib/quilt/engine";

/**
 * THE QUILT ENGINE, RULE BY RULE.
 *
 * The /txt quilt is driven by pure functions (src/lib/quilt/engine.ts):
 * search scoring, the panel's block choice, the seeded scatter and the seeded
 * layout. Each decided rule is a case here, so a change to a weight, a seed or
 * a tie-break fails a named test rather than quietly moving tiles around.
 *
 * Static, browserless: no page is opened. Runs under the chromium project
 * like the other source checks.
 */

// The five real posts, newest first (DOM order), at hand-placed slots on the
// desktop 5×3 grid. None sits on (3, 2), the one cell a 3×2 block can never
// dodge in that grid — `layout()` keeps it for last.
const posts: IndexedPost[] = [
	{
		id: "asserting-on-agent-behavior",
		no: 5,
		title: "Asserting on Agent Behavior",
		excerpt:
			"I built Aptitude — a test harness that lets you run cognitive tests against agent behavior by asserting on tool calls, parameters, and ordering.",
		category: "programming",
		tags: ["ai", "testing", "agents", "developer-tools"],
		year: "2026",
		month: "feb",
		monthLong: "february",
		minutes: 3,
		href: "/txt/asserting-on-agent-behavior",
		col: 3,
		row: 1,
	},
	{
		id: "tahoe-mountain-hair",
		no: 4,
		title: "Tahoe Mountain Hair",
		excerpt:
			"A hair care routine to reproduce Tahoe's mineral-rich water and dry air in San Francisco's soft water and humidity.",
		category: "personal",
		tags: ["personal", "hair-care", "routine"],
		year: "2025",
		month: "jun",
		monthLong: "june",
		minutes: 2,
		href: "/txt/tahoe-mountain-hair",
		col: 5,
		row: 2,
	},
	{
		id: "mega-desk",
		no: 3,
		title: "The Mega Desk",
		excerpt:
			"Building an 8-foot hardwood standing desk for a shared home office — from sourcing burnt ash in Berkeley to finding an extension cable on Etsy.",
		category: "projects",
		tags: ["diy", "standing-desk", "woodworking", "home-office"],
		year: "2025",
		month: "apr",
		monthLong: "april",
		minutes: 4,
		href: "/txt/mega-desk",
		col: 2,
		row: 3,
	},
	{
		id: "why-i-joined-fisker",
		no: 2,
		title: "Your Car Knows You're Getting Sick",
		excerpt:
			"I joined Fisker to build a health product from vehicle signal data — steering patterns, braking behavior, and acceleration habits can detect cognitive decline.",
		category: "thoughts",
		tags: ["career", "machine-learning", "automotive", "health"],
		year: "2024",
		month: "jul",
		monthLong: "july",
		minutes: 3,
		href: "/txt/why-i-joined-fisker",
		col: 1,
		row: 1,
	},
	{
		id: "no-honey-we-have-a-dashboard-at-home",
		no: 1,
		title: "No Honey, We Have a Dashboard at Home",
		excerpt:
			"Internal tools teams spend months building dashboards that are worse versions of things VS Code already provides out of the box.",
		category: "programming",
		tags: ["vscode", "developer-tools", "internal-tools"],
		year: "2023",
		month: "may",
		monthLong: "may",
		minutes: 3,
		href: "/txt/no-honey-we-have-a-dashboard-at-home",
		col: 4,
		row: 3,
	},
];

const APTITUDE = 0;
const TAHOE = 1;
const DESK = 2;
const FISKER = 3;
const DASHBOARD = 4;

const GRID = { cols: 5, rows: 3 };
const rest: QuiltState = { query: "", focused: false, hovered: null, active: 0 };

// --- Tokenising ---------------------------------------------------------------

test.describe("tokenize", () => {
	test("lowercases and splits on anything that is not a letter or digit", () => {
		expect(tokenize("  Home-Office, 2025 / VS Code! ")).toEqual(["home", "office", "2025", "vs", "code"]);
	});

	test("an empty or punctuation-only query has no tokens", () => {
		expect(tokenize("")).toEqual([]);
		expect(tokenize("  · — ")).toEqual([]);
	});

	test("folds diacritics so a plain keyboard finds an accented word", () => {
		expect(tokenize("Café")).toEqual(["cafe"]);
	});

	test("tag labels read as words", () => {
		expect(tagLabel("home-office")).toBe("HOME OFFICE");
		expect(tagLabel("ai")).toBe("AI");
	});
});

// --- Search -------------------------------------------------------------------

test.describe("search", () => {
	test("no tokens → null (the quilt is not searching)", () => {
		expect(search(posts, "")).toBeNull();
		expect(search(posts, " — ")).toBeNull();
	});

	test("a title hit scores 3 and carries no why (the title is highlighted instead)", () => {
		const res = search(posts, "desk")!;
		expect(res.tokens).toEqual(["desk"]);
		expect(res.hits).toEqual([{ i: DESK, score: 3, why: null }]);
	});

	test("a title hit outranks a tag hit: 'home' lists the dashboard before the desk", () => {
		const res = search(posts, "home")!;
		expect(res.hits.map((h) => h.i)).toEqual([DASHBOARD, DESK]);
		expect(res.hits[0]).toEqual({ i: DASHBOARD, score: 3, why: null });
	});

	test("'home' matches the desk post by tag home-office with why TAG · HOME OFFICE", () => {
		const res = search(posts, "home")!;
		const desk = res.hits.find((h) => h.i === DESK)!;
		expect(desk.score).toBe(2);
		expect(desk.why).toBe("TAG · HOME OFFICE");
	});

	test("'feb 2026' hits the Aptitude post by month + year", () => {
		const res = search(posts, "feb 2026")!;
		expect(res.hits).toEqual([{ i: APTITUDE, score: 4, why: "FEB 2026" }]);
	});

	test("the long month name works too", () => {
		expect(search(posts, "february")!.hits.map((h) => h.i)).toEqual([APTITUDE]);
	});

	test("a category hit scores 2.5 with why CATEGORY · …", () => {
		const res = search(posts, "projects")!;
		expect(res.hits).toEqual([{ i: DESK, score: 2.5, why: "CATEGORY · PROJECTS" }]);
	});

	test("a summary-only hit scores 1 with why IN THE SUMMARY", () => {
		const res = search(posts, "berkeley")!;
		expect(res.hits).toEqual([{ i: DESK, score: 1, why: "IN THE SUMMARY" }]);
	});

	test("every token must match: a token with no hit anywhere drops the post", () => {
		expect(search(posts, "desk zebra")!.hits).toEqual([]);
		// 'desk home' keeps the desk (title + tag) and drops the dashboard (no 'desk').
		expect(search(posts, "desk home")!.hits.map((h) => h.i)).toEqual([DESK]);
	});

	test("matching is by word prefix, not substring", () => {
		expect(search(posts, "dash")!.hits.map((h) => h.i)).toEqual([DASHBOARD]);
		expect(search(posts, "ashboard")!.hits).toEqual([]);
	});

	test("ties order newest first", () => {
		// Both programming posts hit only the category: same score, Aptitude (no 5) first.
		const res = search(posts, "programming")!;
		expect(res.hits.map((h) => h.i)).toEqual([APTITUDE, DASHBOARD]);
		expect(res.hits[0].score).toBe(res.hits[1].score);
	});

	test("the why is the highest-weighted non-title hit, whatever the token order", () => {
		// 'tools' hits a tag (2), 'programming' the category (2.5): the category wins.
		const res = search(posts, "tools programming")!;
		const dash = res.hits.find((h) => h.i === DASHBOARD)!;
		expect(dash.why).toBe("CATEGORY · PROGRAMMING");
		expect(dash.score).toBe(4.5);
	});

	test("a post with no category still searches", () => {
		const bare = posts.map((p) => ({ ...p, category: undefined }));
		expect(search(bare, "programming")!.hits).toEqual([]);
		expect(search(bare, "desk")!.hits.map((h) => h.i)).toEqual([DESK]);
	});
});

// --- Highlight ------------------------------------------------------------------

test.describe("highlight", () => {
	test("marks the query at word starts only, case-insensitively", () => {
		const segs = highlight("No Honey, We Have a Dashboard at Home", ["home"]);
		expect(segs).toEqual([
			{ text: "No Honey, We Have a Dashboard at ", hl: false },
			{ text: "Home", hl: true },
		]);
	});

	test("a mid-word occurrence is not a match", () => {
		const segs = highlight("Dashboard", ["ash"]);
		expect(segs).toEqual([{ text: "Dashboard", hl: false }]);
	});

	test("a prefix lights only the prefix", () => {
		expect(highlight("The Mega Desk", ["me"])).toEqual([
			{ text: "The ", hl: false },
			{ text: "Me", hl: true },
			{ text: "ga Desk", hl: false },
		]);
	});

	test("several tokens, adjacent runs merge", () => {
		expect(highlight("Tahoe Mountain Hair", ["tahoe", "hair"])).toEqual([
			{ text: "Tahoe", hl: true },
			{ text: " Mountain ", hl: false },
			{ text: "Hair", hl: true },
		]);
	});

	test("no tokens → one dark run; empty title → nothing", () => {
		expect(highlight("The Mega Desk", [])).toEqual([{ text: "The Mega Desk", hl: false }]);
		expect(highlight("", ["x"])).toEqual([]);
	});

	test("offsets stay aligned on an accented title", () => {
		expect(highlight("Café Society", ["cafe"])).toEqual([
			{ text: "Café", hl: true },
			{ text: " Society", hl: false },
		]);
	});
});

// --- The block -----------------------------------------------------------------

test.describe("chooseBlock", () => {
	test("never returns a block containing the focused post", () => {
		for (const focus of posts.keys()) {
			for (const keep of [new Set<number>(), new Set(posts.keys())]) {
				const at = chooseBlock({ ...GRID, posts, keep, focus });
				expect(at, `focus ${posts[focus].id}`).not.toBeNull();
				expect(inBlock(at!, [3, 2], posts[focus].col, posts[focus].row)).toBe(false);
			}
		}
	});

	test("with nothing to keep it sits farthest from the focus", () => {
		// Fisker is at (1, 1): the far corner block is (3, 2).
		expect(chooseBlock({ ...GRID, posts, keep: new Set(), focus: FISKER })).toEqual({ col: 3, row: 2 });
		// The dashboard is at (4, 3): the far corner block is (1, 1).
		expect(chooseBlock({ ...GRID, posts, keep: new Set(), focus: DASHBOARD })).toEqual({ col: 1, row: 1 });
	});

	test("a zero-cost block beats a nearer block that would hide a kept post", () => {
		// Focus Fisker (1, 1) and keep the dashboard (4, 3). The far corner (3, 2)
		// and its neighbour (2, 2) both cover (4, 3); the best zero-cost block is
		// (3, 1) at distance 3.5, ahead of (1, 2) at 2.5.
		expect(chooseBlock({ ...GRID, posts, keep: new Set([DASHBOARD]), focus: FISKER })).toEqual({
			col: 3,
			row: 1,
		});
	});

	test("with no focus it sits farthest from the search bar's left end", () => {
		expect(chooseBlock({ ...GRID, posts, keep: new Set(), focus: null })).toEqual({ col: 3, row: 2 });
	});

	test("with no focus, kept posts still push it away", () => {
		// Keep Tahoe (5, 2) and the dashboard (4, 3): the far corner (3, 2) hides
		// both and (3, 1) / (2, 2) hide one each. Of the zero-cost blocks, (2, 1)
		// is farthest from (1, 0) at 4.5, ahead of (1, 2) at 3.5 and (1, 1) at 2.5.
		expect(chooseBlock({ ...GRID, posts, keep: new Set([TAHOE, DASHBOARD]), focus: null })).toEqual({
			col: 2,
			row: 1,
		});
	});

	test("cost is counted, not just detected: two hidden matches lose to one", () => {
		const keep = new Set(posts.keys());
		const at = chooseBlock({ ...GRID, posts, keep, focus: null })!;
		const hidden = [...keep].filter((i) => inBlock(at, [3, 2], posts[i].col, posts[i].row)).length;
		// Every 3×2 placement on this fixture hides at least one post; none
		// with fewer than `hidden` exists.
		for (let rs = 1; rs <= 2; rs++) {
			for (let cs = 1; cs <= 3; cs++) {
				const n = [...keep].filter((i) => inBlock({ col: cs, row: rs }, [3, 2], posts[i].col, posts[i].row)).length;
				expect(n).toBeGreaterThanOrEqual(hidden);
			}
		}
	});

	test("a focus on the one cell no block can dodge → null", () => {
		const centred = posts.map((p, i) => (i === DESK ? { ...p, col: 3, row: 2 } : p));
		expect(chooseBlock({ ...GRID, posts: centred, keep: new Set(), focus: DESK })).toBeNull();
	});

	test("a grid smaller than the block → null", () => {
		expect(chooseBlock({ cols: 2, rows: 3, posts, keep: new Set(), focus: null })).toBeNull();
	});

	test("takes the block size as a parameter", () => {
		expect(chooseBlock({ cols: 4, rows: 3, block: [2, 2], posts, keep: new Set(), focus: FISKER })).toEqual({
			col: 3,
			row: 2,
		});
	});
});

test.describe("unavoidableCells", () => {
	test("5×3 with a 3×2 block: only the centre cell", () => {
		expect(unavoidableCells(5, 3)).toEqual([toCell(3, 2, 5)]);
	});

	test("3×3 with a 3×2 block: the whole middle row", () => {
		expect(unavoidableCells(3, 3)).toEqual([3, 4, 5]);
	});

	test("5×4: none", () => {
		expect(unavoidableCells(5, 4)).toEqual([]);
	});
});

// --- Scatter --------------------------------------------------------------------

test.describe("scatter", () => {
	test("is deterministic in (seed, cellIndex)", () => {
		for (let i = 0; i < 15; i++) {
			expect(scatter({ cellIndex: i, seed: "post:3" })).toEqual(scatter({ cellIndex: i, seed: "post:3" }));
			expect(scatter({ cellIndex: i, seed: 42 })).toEqual(scatter({ cellIndex: i, seed: 42 }));
		}
	});

	test(`delay is an integer in 0..${SCATTER_MAX_DELAY}`, () => {
		for (const seed of ["post:1", "post:5", "q:home", "browse", 7]) {
			for (let i = 0; i < 40; i++) {
				const { delay } = scatter({ cellIndex: i, seed });
				expect(Number.isInteger(delay)).toBe(true);
				expect(delay).toBeGreaterThanOrEqual(0);
				expect(delay).toBeLessThanOrEqual(SCATTER_MAX_DELAY);
			}
		}
	});

	test("a different focus scatters differently", () => {
		const a = Array.from({ length: 15 }, (_, i) => scatter({ cellIndex: i, seed: "post:3" }));
		const b = Array.from({ length: 15 }, (_, i) => scatter({ cellIndex: i, seed: "post:4" }));
		expect(a).not.toEqual(b);
	});

	test("over a grid some cells vanish and some go faint", () => {
		const rolls = Array.from({ length: 15 }, (_, i) => scatter({ cellIndex: i, seed: "post:3" }));
		expect(rolls.some((r) => r.gone)).toBe(true);
		expect(rolls.some((r) => !r.gone)).toBe(true);
	});
});

// --- Layout --------------------------------------------------------------------

test.describe("layout", () => {
	test("5 posts at 5 cols: 3 rows, 15 cells, 10 fillers", () => {
		const l = layout({ cols: 5, postCount: 5 });
		expect(l.rows).toBe(3);
		expect(l.cells).toBe(15);
		expect(l.slots).toHaveLength(5);
		expect(l.fillerCells).toHaveLength(10);
		expect(l.fillerOrder).toHaveLength(10);
	});

	test("15 posts fill the desktop grid; the sixteenth adds a row", () => {
		const full = layout({ cols: 5, postCount: 15 });
		expect(full.rows).toBe(3);
		expect(full.fillerCells).toEqual([]);
		const more = layout({ cols: 5, postCount: 16 });
		expect(more.rows).toBe(4);
		expect(more.cells).toBe(20);
		expect(more.fillerCells).toHaveLength(4);
	});

	test("5 posts at 3 cols (tablet): 3 rows, 4 fillers", () => {
		const l = layout({ cols: 3, postCount: 5 });
		expect(l.rows).toBe(3);
		expect(l.fillerCells).toHaveLength(4);
	});

	test("the minimum is 3 rows even for one post (the block must dodge its row)", () => {
		expect(MIN_ROWS).toBe(3);
		expect(layout({ cols: 5, postCount: 1 }).rows).toBe(3);
	});

	test("slots are distinct cells inside the grid, and fillers are exactly the rest", () => {
		for (const [cols, postCount] of [
			[5, 5],
			[5, 14],
			[3, 5],
			[3, 8],
			[2, 5],
		] as const) {
			const l = layout({ cols, postCount });
			expect(new Set(l.slots).size).toBe(postCount);
			for (const s of l.slots) {
				expect(s).toBeGreaterThanOrEqual(0);
				expect(s).toBeLessThan(l.cells);
			}
			const all = [...l.slots, ...l.fillerCells].sort((a, b) => a - b);
			expect(all).toEqual(Array.from({ length: l.cells }, (_, i) => i));
		}
	});

	test("is deterministic, and a new post keeps the old ones in place", () => {
		expect(layout({ cols: 5, postCount: 5 })).toEqual(layout({ cols: 5, postCount: 5 }));
		const five = layout({ cols: 5, postCount: 5 });
		const six = layout({ cols: 5, postCount: 6 });
		expect(six.slots.slice(0, 5)).toEqual(five.slots);
	});

	test("the cell the panel can never dodge is handed out last", () => {
		const centre = toCell(3, 2, 5);
		expect(layout({ cols: 5, postCount: 14 }).slots).not.toContain(centre);
		expect(layout({ cols: 5, postCount: 15 }).slots[14]).toBe(centre);
		// Tablet: the middle row is unavoidable at 3 rows; six posts fit around it.
		const tablet = layout({ cols: 3, postCount: 6 });
		expect(tablet.rows).toBe(3);
		for (const s of tablet.slots) expect(toColRow(s, 3).row).not.toBe(2);
	});

	test("fillers cycle the files from a seeded offset with no neighbour repeated", () => {
		const l = layout({ cols: 5, postCount: 1 });
		for (const f of l.fillerOrder) {
			expect(f).toBeGreaterThanOrEqual(0);
			expect(f).toBeLessThan(FILLER_COUNT);
		}
		for (let k = 1; k < l.fillerOrder.length; k++) {
			expect(l.fillerOrder[k]).not.toBe(l.fillerOrder[k - 1]);
		}
		// Vertical neighbours differ too (cols = 5, files = 12: never congruent).
		const fileAt = new Map(l.fillerCells.map((c, k) => [c, l.fillerOrder[k]]));
		for (const [c, f] of fileAt) {
			const below = fileAt.get(c + 5);
			if (below !== undefined) expect(below).not.toBe(f);
		}
	});

	test("cell index round-trips through (col, row)", () => {
		for (let i = 0; i < 15; i++) {
			const { col, row } = toColRow(i, 5);
			expect(toCell(col, row, 5)).toBe(i);
		}
		expect(toColRow(7, 5)).toEqual({ col: 3, row: 2 });
	});
});

// --- Mode ----------------------------------------------------------------------

test.describe("mode", () => {
	test("typing wins over focus, focus over hover, hover over rest", () => {
		const two = search(posts, "home");
		const one = search(posts, "desk");
		const zero = search(posts, "zebra");
		expect(mode({ result: null, focused: false, hovered: null })).toBe("rest");
		expect(mode({ result: null, focused: false, hovered: 2 })).toBe("hover");
		expect(mode({ result: null, focused: true, hovered: 2 })).toBe("browse");
		expect(mode({ result: two, focused: true, hovered: 2 })).toBe("results");
		expect(mode({ result: one, focused: false, hovered: null })).toBe("single");
		expect(mode({ result: zero, focused: false, hovered: null })).toBe("none");
	});
});

// --- Resolution ----------------------------------------------------------------

test.describe("resolve", () => {
	test("at rest every cell is lit with no delay and there is no block", () => {
		const r = resolve(posts, GRID, rest);
		expect(r.mode).toBe("rest");
		expect(r.block).toBeNull();
		expect(r.cells).toHaveLength(15);
		for (const c of r.cells) expect([c.state, c.delay]).toEqual(["lit", 0]);
		expect(r.cells.filter((c) => c.post !== null)).toHaveLength(5);
	});

	test("hover: the post stays lit, the block dodges it, and the rest scatter on a stagger", () => {
		const r = resolve(posts, GRID, { ...rest, hovered: DESK });
		expect(r.mode).toBe("hover");
		expect(r.focus).toBe(DESK);
		expect(r.seed).toBe("post:3");
		expect(r.block).not.toBeNull();
		expect(inBlock(r.block!, [3, 2], posts[DESK].col, posts[DESK].row)).toBe(false);
		for (const c of r.cells) {
			if (c.post === DESK) {
				expect([c.state, c.delay]).toEqual(["lit", 0]);
			} else {
				expect(c.state).not.toBe("lit");
				expect(c.delay).toBeGreaterThanOrEqual(0);
				expect(c.delay).toBeLessThanOrEqual(SCATTER_MAX_DELAY);
			}
			if (inBlock(r.block!, [3, 2], c.col, c.row)) expect(c.state).toBe("gone");
		}
		expect(r.cells.some((c) => c.state === "faint")).toBe(true);
	});

	test("hover is deterministic per post", () => {
		const a = resolve(posts, GRID, { ...rest, hovered: TAHOE });
		const b = resolve(posts, GRID, { ...rest, hovered: TAHOE });
		expect(a).toEqual(b);
		const other = resolve(posts, GRID, { ...rest, hovered: DESK });
		expect(other.cells.map((c) => c.state)).not.toEqual(a.cells.map((c) => c.state));
	});

	test("browse: posts lit, fillers faint, except under the block", () => {
		const r = resolve(posts, GRID, { ...rest, focused: true });
		expect(r.mode).toBe("browse");
		expect(r.focus).toBeNull();
		expect(r.block).toEqual({ col: 3, row: 2 });
		for (const c of r.cells) {
			if (inBlock(r.block!, [3, 2], c.col, c.row)) expect(c.state).toBe("gone");
			else expect(c.state).toBe(c.post !== null ? "lit" : "faint");
		}
	});

	test("results: matches lit, the active result is the focus, the block avoids it", () => {
		const r = resolve(posts, GRID, { ...rest, query: "home" });
		expect(r.mode).toBe("results");
		expect(r.matched).toEqual([DASHBOARD, DESK]);
		expect(r.active).toBe(DASHBOARD);
		expect(r.focus).toBe(DASHBOARD);
		expect(r.seed).toBe("q:home");
		const lit = r.cells.filter((c) => c.state === "lit").map((c) => c.post);
		expect(lit.sort()).toEqual([DESK, DASHBOARD].sort());
		expect(inBlock(r.block!, [3, 2], posts[DASHBOARD].col, posts[DASHBOARD].row)).toBe(false);
	});

	test("↓ moves the active result, and the block moves off it; overshoot clamps", () => {
		const r = resolve(posts, GRID, { ...rest, query: "home", active: 1 });
		expect(r.active).toBe(DESK);
		expect(r.focus).toBe(DESK);
		expect(inBlock(r.block!, [3, 2], posts[DESK].col, posts[DESK].row)).toBe(false);
		expect(resolve(posts, GRID, { ...rest, query: "home", active: 9 }).active).toBe(DESK);
	});

	test("single: the one hit is lit and in focus", () => {
		const r = resolve(posts, GRID, { ...rest, query: "desk" });
		expect(r.mode).toBe("single");
		expect(r.focus).toBe(DESK);
		expect(r.cells.filter((c) => c.state === "lit").map((c) => c.post)).toEqual([DESK]);
	});

	test("none: nothing is lit, the block sits far from the bar", () => {
		const r = resolve(posts, GRID, { ...rest, query: "zebra" });
		expect(r.mode).toBe("none");
		expect(r.matched).toEqual([]);
		expect(r.active).toBeNull();
		expect(r.block).toEqual({ col: 3, row: 2 });
		expect(r.cells.every((c) => c.state !== "lit")).toBe(true);
	});

	test("a search beats a hover: the hovered tile is not the focus", () => {
		const r = resolve(posts, GRID, { ...rest, query: "desk", hovered: TAHOE });
		expect(r.mode).toBe("single");
		expect(r.focus).toBe(DESK);
	});

	test("with the focus on an undodgeable cell the block is null and the cells still resolve", () => {
		const centred = posts.map((p, i) => (i === DESK ? { ...p, col: 3, row: 2 } : p));
		const r = resolve(centred, GRID, { ...rest, hovered: DESK });
		expect(r.block).toBeNull();
		expect(r.cells.find((c) => c.post === DESK)!.state).toBe("lit");
	});
});
