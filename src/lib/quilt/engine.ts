/**
 * THE QUILT ENGINE — every decision the /txt quilt makes, as pure functions.
 *
 * Nothing here touches the DOM. `src/lib/quilt/index.ts` reads the page's
 * embedded index, keeps `{ query, focused, hovered, active }`, and asks this
 * module what the grid should look like; the answer is data (a mode, a block,
 * one state + delay per cell) that the wiring paints onto the design-system
 * contract (`data-state`, `--scatter-delay`, `--panel-col/--panel-row`). That
 * split is what lets the rules below be tested in Node without a browser
 * (tests/quilt-engine.spec.ts).
 *
 * The rules are ported from the approved prototype
 * (.playwright-mcp/blog-canvas/project/QuiltSearch.dc.html) and the plan's
 * "Quilt geometry" section:
 *
 * SEARCH. A query is tokenised (lowercase, split on anything that is not a
 * letter or digit). EVERY token must prefix-match a word in SOME field of the
 * post, or the post drops out. Each token scores the best field it hits —
 * title 3, category 2.5, a tag 2, month+year 2, the summary 1 — and the
 * post's score is the sum. The "why" shown beside a result is the
 * highest-weighted NON-title hit (a title hit shows as highlighting instead).
 * Ties order newest first.
 *
 * THE BLOCK. The panel takes a 3×2 block of cells: over every placement, skip
 * blocks containing the focused post, then take the lowest `cost × 100 −
 * distance` — cost = matching posts the block would hide, distance = Manhattan
 * distance from the block's centre to the focused post (or to the search
 * bar's left end, column 1 row 0, when nothing is focused). So it hides the
 * fewest matches, never the post in focus, and sits as far from it as it can.
 *
 * THE SCATTER. Every cell that is not lit either vanishes or goes faint, on a
 * stagger of 0..240 ms. Both come from a mulberry32 stream seeded by
 * (seed, cellIndex), where the seed names the focus — the hovered post's
 * number, or the query — so the same hover scatters the same way on every
 * load, and a test can pin it.
 *
 * THE LAYOUT. DOM order is newest first; a post's grid SLOT is a seeded
 * permutation of the cells keyed by the grid size, indexed by the post's
 * chronological number, so a new post takes a fresh slot and the old ones
 * stay put until the row count changes. Cells the panel can never avoid (in a
 * 5×3 grid, the centre cell) go to the END of the permutation, so they are
 * only used when the grid is full.
 */

// --- Types ------------------------------------------------------------------

export interface IndexedPost {
	id: string;
	/** 1-based chronological number: the first post ever is 1. */
	no: number;
	title: string;
	excerpt: string;
	category?: string;
	tags: string[];
	/** "2026" */
	year: string;
	/** "feb" */
	month: string;
	/** "february" */
	monthLong: string;
	minutes: number;
	href: string;
	/** 1-based grid position, from `layout()`. */
	col: number;
	row: number;
}

/** [width, height] in cells. */
export type Block = [width: number, height: number];

export interface BlockAt {
	col: number;
	row: number;
}

export interface Hit {
	/** Index into the `posts` array given to `search`. */
	i: number;
	score: number;
	/** `TAG · HOME OFFICE`, `CATEGORY · PROJECTS`, `FEB 2026`, `IN THE SUMMARY`,
	 *  or null when every token hit the title. */
	why: string | null;
}

export interface SearchResult {
	tokens: string[];
	/** Best first; ties newest first. */
	hits: Hit[];
}

export interface Segment {
	text: string;
	hl: boolean;
}

export type Mode = "rest" | "hover" | "browse" | "results" | "single" | "none";

export type CellState = "lit" | "faint" | "gone";

export interface QuiltState {
	query: string;
	/** The search input has focus. */
	focused: boolean;
	/** Index (into `posts`) of the hovered/focused tile, or null. */
	hovered: number | null;
	/** Position in the result list the arrow keys have moved to. */
	active: number;
}

export interface CellResolution {
	/** 0-based, row-major. */
	index: number;
	col: number;
	row: number;
	/** Index into `posts`, or null for a filler. */
	post: number | null;
	state: CellState;
	/** ms, 0..SCATTER_MAX_DELAY; 0 for a lit cell and at rest. */
	delay: number;
}

export interface Resolution {
	mode: Mode;
	result: SearchResult | null;
	/** Post indices that match, best first (empty when not searching). */
	matched: number[];
	/** The post the arrow keys sit on (results/single), else null. */
	active: number | null;
	/** The post the panel must not cover: hovered, or the active result. */
	focus: number | null;
	/** Where the panel sits; null at rest, or when no block can avoid the focus. */
	block: BlockAt | null;
	/** The scatter seed used (exposed so a test can replay it). */
	seed: string;
	cells: CellResolution[];
}

// --- Constants ---------------------------------------------------------------

export const PANEL_BLOCK: Block = [3, 2];

export const WEIGHTS = {
	title: 3,
	category: 2.5,
	tag: 2,
	date: 2,
	summary: 1,
} as const;

/** The longest scatter stagger, in ms. */
export const SCATTER_MAX_DELAY = 240;

/** How many filler files the package ships (filler-01 … filler-12). */
export const FILLER_COUNT = 12;

/** The panel is 2 rows tall and must be able to dodge any focused post's row. */
export const MIN_ROWS = PANEL_BLOCK[1] + 1;

// --- Search -------------------------------------------------------------------

/** Lowercase words, letters and digits only, diacritics folded ("Café" → "cafe"). */
export function tokenize(q: string): string[] {
	return fold(q)
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

const fold = (s: string) =>
	s
		.normalize("NFKD")
		.replace(/\p{M}+/gu, "")
		.toLowerCase();

/** `home-office` → `HOME OFFICE`. */
export const tagLabel = (tag: string) => tag.replace(/[-_]+/g, " ").trim().toUpperCase();

interface Field {
	w: number;
	why: string | null;
	words: string[];
}

function fieldsOf(p: IndexedPost): Field[] {
	const fields: Field[] = [{ w: WEIGHTS.title, why: null, words: tokenize(p.title) }];
	if (p.category) {
		fields.push({
			w: WEIGHTS.category,
			why: `CATEGORY · ${p.category.toUpperCase()}`,
			words: tokenize(p.category),
		});
	}
	for (const t of p.tags) {
		fields.push({ w: WEIGHTS.tag, why: `TAG · ${tagLabel(t)}`, words: tokenize(t) });
	}
	fields.push({
		w: WEIGHTS.date,
		why: `${p.month.toUpperCase()} ${p.year}`,
		words: [...tokenize(p.year), ...tokenize(p.month), ...tokenize(p.monthLong)],
	});
	fields.push({ w: WEIGHTS.summary, why: "IN THE SUMMARY", words: tokenize(p.excerpt) });
	return fields;
}

/**
 * Null when the query has no tokens (the quilt is at rest or browsing); else
 * every post whose fields prefix-match EVERY token, best first.
 */
export function search(posts: IndexedPost[], q: string): SearchResult | null {
	const tokens = tokenize(q);
	if (!tokens.length) return null;
	const hits: Hit[] = [];
	posts.forEach((p, i) => {
		const fields = fieldsOf(p);
		let score = 0;
		let why: Field | null = null;
		for (const t of tokens) {
			// Fields are listed by weight, descending, so the first hit is the best
			// field for this token.
			const hit = fields.find((f) => f.words.some((w) => w.startsWith(t)));
			if (!hit) return;
			score += hit.w;
			if (hit.why && (!why || hit.w > why.w)) why = hit;
		}
		hits.push({ i, score, why: why ? why.why : null });
	});
	hits.sort((a, b) => b.score - a.score || posts[b.i].no - posts[a.i].no);
	return { tokens, hits };
}

/**
 * Splits a title into runs, marking every word-start occurrence of a token.
 * "home" lights the "Home" in "Dashboard at Home" and leaves "Dashboard" dark.
 */
export function highlight(title: string, tokens: string[]): Segment[] {
	const lower = [...title].map(foldChar).join("");
	const mark = new Array<boolean>(title.length).fill(false);
	for (const t of tokens) {
		if (!t) continue;
		let from = 0;
		let at: number;
		while ((at = lower.indexOf(t, from)) !== -1) {
			const wordStart = at === 0 || !/[a-z0-9]/.test(lower[at - 1]);
			if (wordStart) for (let k = at; k < at + t.length; k++) mark[k] = true;
			from = at + 1;
		}
	}
	const segs: Segment[] = [];
	for (let k = 0; k < title.length; k++) {
		const last = segs[segs.length - 1];
		if (last && last.hl === mark[k]) last.text += title[k];
		else segs.push({ text: title[k], hl: mark[k] });
	}
	return segs;
}

/** Folds one character the way `tokenize` folds strings, but never changes its
 *  length — so highlight offsets stay aligned with the original title. */
function foldChar(c: string): string {
	const f = fold(c);
	if (f.length === 1) return f;
	const l = c.toLowerCase();
	return l.length === 1 ? l : c;
}

// --- The block ----------------------------------------------------------------

/** Is cell (c, r) inside the block placed at `at`? */
export function inBlock(at: BlockAt, block: Block, c: number, r: number): boolean {
	return c >= at.col && c < at.col + block[0] && r >= at.row && r < at.row + block[1];
}

/**
 * The cells every placement of `block` contains — the ones a focused post can
 * never be dodged from. In a 5×3 grid with a 3×2 block that is just (3, 2); in
 * a 3-column grid at 3 rows it is the whole middle row. Empty once the grid
 * is large enough (cols ≥ 2·width, rows ≥ 2·height).
 */
export function unavoidableCells(cols: number, rows: number, block: Block = PANEL_BLOCK): number[] {
	const [bw, bh] = block;
	const out: number[] = [];
	for (let r = 1; r <= rows; r++) {
		for (let c = 1; c <= cols; c++) {
			if (c >= cols - bw + 1 && c <= bw && r >= rows - bh + 1 && r <= bh) {
				out.push(toCell(c, r, cols));
			}
		}
	}
	return out;
}

export interface ChooseBlockOptions {
	cols: number;
	rows: number;
	block?: Block;
	posts: IndexedPost[];
	/** Indices of the posts that match (the ones a block should not hide). */
	keep: Set<number>;
	/** Index of the post the block must never cover, or null. */
	focus: number | null;
}

/**
 * The placement that hides the fewest kept posts, never the focus, and sits
 * farthest from it. Null when no placement can avoid the focus (see
 * `unavoidableCells`) or the grid is smaller than the block.
 */
export function chooseBlock({
	cols,
	rows,
	block = PANEL_BLOCK,
	posts,
	keep,
	focus,
}: ChooseBlockOptions): BlockAt | null {
	const [bw, bh] = block;
	const f = focus !== null ? posts[focus] : null;
	const fx = f ? f.col : 1;
	const fy = f ? f.row : 0;
	let best: { at: BlockAt; key: number } | null = null;
	for (let rs = 1; rs + bh - 1 <= rows; rs++) {
		for (let cs = 1; cs + bw - 1 <= cols; cs++) {
			const at = { col: cs, row: rs };
			if (f && inBlock(at, block, f.col, f.row)) continue;
			let cost = 0;
			for (const i of keep) {
				const p = posts[i];
				if (p && inBlock(at, block, p.col, p.row)) cost++;
			}
			const dist = Math.abs(cs + (bw - 1) / 2 - fx) + Math.abs(rs + (bh - 1) / 2 - fy);
			const key = cost * 100 - dist;
			if (!best || key < best.key) best = { at, key };
		}
	}
	return best ? best.at : null;
}

// --- Randomness ---------------------------------------------------------------

/** mulberry32: a small, fast, seedable PRNG in [0, 1). */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A 32-bit seed from a string (FNV-1a) or a number (as is). */
export function hashSeed(seed: number | string): number {
	if (typeof seed === "number") return seed >>> 0;
	let h = 0x811c9dc5;
	for (let i = 0; i < seed.length; i++) {
		h ^= seed.charCodeAt(i);
		h = Math.imul(h, 0x01000193);
	}
	return h >>> 0;
}

export interface ScatterOptions {
	cellIndex: number;
	seed: number | string;
}

/**
 * One cell's roll for one focus: vanish or go faint, after a stagger of
 * 0..SCATTER_MAX_DELAY ms. Pure in (seed, cellIndex).
 */
export function scatter({ cellIndex, seed }: ScatterOptions): { gone: boolean; delay: number } {
	const rand = mulberry32((hashSeed(seed) ^ Math.imul(cellIndex + 1, 0x9e3779b1)) >>> 0);
	const delay = Math.floor(rand() * (SCATTER_MAX_DELAY + 1));
	const gone = rand() < 0.5;
	return { gone, delay };
}

// --- Layout -------------------------------------------------------------------

/** 0-based row-major cell index from a 1-based (col, row). */
export const toCell = (col: number, row: number, cols: number) => (row - 1) * cols + (col - 1);

/** 1-based (col, row) from a 0-based row-major cell index. */
export const toColRow = (cell: number, cols: number): BlockAt => ({
	col: (cell % cols) + 1,
	row: Math.floor(cell / cols) + 1,
});

export interface LayoutOptions {
	cols: number;
	postCount: number;
	minRows?: number;
	block?: Block;
	fillerCount?: number;
}

export interface Layout {
	rows: number;
	cells: number;
	/** `slots[no - 1]` is the cell index of the post numbered `no`. */
	slots: number[];
	/** The cells left over, ascending. */
	fillerCells: number[];
	/** `fillerOrder[k]` is the 0-based filler file for `fillerCells[k]`. */
	fillerOrder: number[];
}

/**
 * Rows = max(minRows, ⌈posts / cols⌉); a seeded permutation of the cells keyed
 * by `cols×rows` gives every post its slot by chronological number; fillers
 * take the rest, cycling the filler files from a seeded offset so no two
 * neighbours repeat.
 */
export function layout({
	cols,
	postCount,
	minRows = MIN_ROWS,
	block = PANEL_BLOCK,
	fillerCount = FILLER_COUNT,
}: LayoutOptions): Layout {
	const rows = Math.max(minRows, Math.ceil(postCount / cols));
	const cells = cols * rows;
	const rand = mulberry32(hashSeed(`${cols}x${rows}`));

	// Dodge-able cells first, the ones the panel can never avoid last: they
	// are only handed out when nothing else is left.
	const unavoidable = new Set(unavoidableCells(cols, rows, block));
	const eligible: number[] = [];
	const trapped: number[] = [];
	for (let i = 0; i < cells; i++) (unavoidable.has(i) ? trapped : eligible).push(i);
	const perm = [...shuffle(eligible, rand), ...shuffle(trapped, rand)];

	const slots = perm.slice(0, postCount);
	const taken = new Set(slots);
	const fillerCells: number[] = [];
	for (let i = 0; i < cells; i++) if (!taken.has(i)) fillerCells.push(i);
	const offset = Math.floor(rand() * fillerCount);
	const fillerOrder = fillerCells.map((_, k) => (offset + k) % fillerCount);

	return { rows, cells, slots, fillerCells, fillerOrder };
}

function shuffle(list: number[], rand: () => number): number[] {
	const out = [...list];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// --- Mode and resolution ------------------------------------------------------

export interface ModeOptions {
	result: SearchResult | null;
	focused: boolean;
	hovered: number | null;
}

/** Typing wins over focus, which wins over hover, which wins over rest. */
export function mode({ result, focused, hovered }: ModeOptions): Mode {
	if (result) return result.hits.length === 0 ? "none" : result.hits.length === 1 ? "single" : "results";
	if (focused) return "browse";
	if (hovered !== null) return "hover";
	return "rest";
}

export interface Grid {
	cols: number;
	rows: number;
	block?: Block;
}

/**
 * Everything the wiring paints, for one state: the mode, the matches, the
 * post in focus, the panel's block, and each cell's state and stagger.
 */
export function resolve(posts: IndexedPost[], grid: Grid, state: QuiltState): Resolution {
	const { cols, rows, block = PANEL_BLOCK } = grid;
	const result = search(posts, state.query);
	const m = mode({ result, focused: state.focused, hovered: state.hovered });
	const matched = result ? result.hits.map((h) => h.i) : [];
	const active = matched.length ? matched[Math.min(Math.max(state.active, 0), matched.length - 1)] : null;
	const focus = m === "hover" ? state.hovered : m === "single" || m === "results" ? active : null;
	const keep = new Set(matched);
	const block_ = m === "rest" ? null : chooseBlock({ cols, rows, block, posts, keep, focus });

	const seed =
		m === "hover" && focus !== null
			? `post:${posts[focus].no}`
			: result
				? `q:${result.tokens.join(" ")}`
				: m;

	const byCell = new Map<number, number>();
	posts.forEach((p, i) => byCell.set(toCell(p.col, p.row, cols), i));

	const cells: CellResolution[] = [];
	for (let index = 0; index < cols * rows; index++) {
		const { col, row } = toColRow(index, cols);
		const post = byCell.get(index) ?? null;
		cells.push({ index, col, row, post, ...cellState(index, col, row, post) });
	}

	function cellState(index: number, col: number, row: number, post: number | null) {
		const lit = { state: "lit" as const, delay: 0 };
		if (m === "rest") return lit;
		if (block_ && inBlock(block_, block, col, row)) {
			return { state: "gone" as const, delay: scatter({ cellIndex: index, seed }).delay };
		}
		const roll = scatter({ cellIndex: index, seed });
		// Browsing: the posts stay lit and the fillers only dim — nothing vanishes.
		if (m === "browse") return post !== null ? lit : { state: "faint" as const, delay: roll.delay };
		if (m === "hover" && post === focus) return lit;
		if ((m === "results" || m === "single") && post !== null && keep.has(post)) return lit;
		return { state: roll.gone ? ("gone" as const) : ("faint" as const), delay: roll.delay };
	}

	return { mode: m, result, matched, active, focus, block: block_, seed, cells };
}
