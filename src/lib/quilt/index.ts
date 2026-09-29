/**
 * THE INSTRUMENT'S WIRING — the DOM side of /txt.
 *
 * The page renders the design system's contract (Quilt, QuiltCell,
 * QuiltPanel, SearchBar with its chips, the foot's Legend, TimeRuler and
 * Stat, the stepper twice — the foot's and the phone dock's, one drawn per
 * viewport) and embeds its index as JSON; this module reads both, keeps the one piece of
 * state — `{ query, focused, hovered, active, stepped }` — and on every
 * change asks the engine (./engine.ts, pure) what the grid should look
 * like, then PAINTS the answer:
 *
 *   a cell       data-state="lit | faint | gone", --scatter-delay, data-active
 *   the panel    data-mode, --panel-col / --panel-row, the card's fields
 *   the input    aria-expanded, aria-activedescendant
 *   the chips    aria-current on the chip whose query is the query
 *   the count    the live region a reader hears (`5 posts`, `2 of 5 posts`)
 *                and the readout drawn beside the input (`05`, `2 / 5`)
 *   the stepper  disabled when nothing matches (both copies)
 *   the ruler    data-focus on the focused post's bar (at rest the newest
 *                matching post's), --at on its month, data-dim on a mark
 *                out of the filter
 *   the focus    the readout beside the timeline and the dock's line —
 *                the two-digit number, the title, `feb 2026 · 554 w`, the
 *                post's place among the posts (`5 / 5`) and the progress
 *                bar's --progress, every copy of each hook
 *
 * Nothing here decides anything: which cells scatter, where the block goes
 * and what the search found are the engine's, and are tested there.
 *
 * INPUTS. Hover and focus on a tile are the same path (a keyboard user gets
 * the card too); the search input's focus is the browse state; typing wins
 * over both. The hover HOLDS while the pointer (or focus) is on a post tile
 * or on the panel — so the card's READ link stays reachable — and leaving
 * both returns to rest after LEAVE_MS, which an arrival on another tile or
 * the panel cancels: moving tile to tile crosses the grid gap without the
 * quilt flashing back to rest in between. `/` and ⌘K focus the bar from
 * anywhere that is not editable. In the bar: ↑↓ move the active result (its
 * tile takes the accent ring), Enter opens it, Escape clears the step, then
 * the query, then blurs. Links to `?q=` inside the panel (the browse chips,
 * the nothing face's suggestions) and the bar's CHIPS set the query in place
 * instead of reloading — a chip is a search shortcut, and ALL clears it —
 * and so do the topic key's rows at the foot. `?q=` on the URL is read on
 * load and kept in step with the input, debounced, through replaceState —
 * so a search is a link.
 *
 * STEPPING. − and + PIN a post (`stepped`): the older / newer one among the
 * posts that match (chronological, newest first), from the one in focus, or
 * from rest the newest (−) or the oldest (+), wrapping. A click on a
 * timeline bar pins that post. A step holds until Escape, typing, focusing
 * the bar or a chip; a hover on another tile only previews over it and the
 * step is back when the pointer leaves — the pointer being elsewhere never
 * clears it, which is what makes it the touch-friendly way through the
 * quilt.
 *
 * VIEWPORTS. The engine runs on the desktop grid (5 columns) at ≥ 1024 and
 * the tablet one (3 columns, the posts' `colMd`/`rowMd`) below that; the
 * newest post's `span` (its 2×2 lead block) travels with it, so the block
 * dodges the whole of it. On a phone (< 640) the same machine runs but
 * nothing is hovered: the panel is in flow, a tap navigates, a step shows
 * the card above the list, and a cell that would be `gone` is painted
 * `faint` so the list never shows holes.
 *
 * LIFECYCLE. Wired on astro:page-load, guarded by data-quilt-wired on the
 * grid; the document-level listeners are removed on astro:before-swap.
 */
import { navigate } from "astro:transitions/client";
import {
	PANEL_BLOCK,
	chooseBlock,
	highlight,
	inBlock,
	overlaps,
	resolve,
	scatter,
	type CellResolution,
	type Grid,
	type IndexedPost,
	type QuiltState,
	type Resolution,
} from "./engine";

interface QuiltPost extends IndexedPost {
	colMd: number;
	rowMd: number;
	words: number;
	ym: string;
}
interface QuiltIndex {
	posts: QuiltPost[];
	grid: { lg: Grid; md: Grid };
}
type View = "lg" | "md" | "phone";

/** The results face shows this many rows; ↑↓ wrap within them. */
const RESULT_ROWS = 4;
const URL_DEBOUNCE_MS = 150;
/** The grace before a hover lets go: longer than the pointer takes to cross
 *  a gap between tiles (a frame or two), shorter than a beat anyone would
 *  read as lag. A new arrival inside it cancels the leave, and the leave
 *  itself waits for the next frame — input is dispatched before rAF, so a
 *  pointerover held up behind one long frame still gets to cancel it. */
const LEAVE_MS = 100;
const POST_CELL = '[data-cell="post"]';

const pad = (no: number) => String(no).padStart(3, "0");
/** The number as the sheet's labels draw it: `05`. */
const numeral = (no: number) => String(no).padStart(2, "0");
const isEditable = (el: Element | null) =>
	!!el &&
	((el as HTMLElement).isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));
const plainClick = (e: MouseEvent) =>
	e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;

function wire(): (() => void) | null {
	const root = document.querySelector<HTMLElement>("[data-quilt]");
	const data = document.querySelector<HTMLScriptElement>("script[data-quilt-index]");
	const inputEl = document.querySelector<HTMLInputElement>("[data-search-input]");
	const panelEl = root?.querySelector<HTMLElement>("[data-quilt-panel]");
	if (!root || !data || !inputEl || !panelEl || root.dataset.quiltWired) return null;
	// Rebound after the guard so the non-null narrowing reaches the hoisted
	// function declarations below, which TypeScript does not narrow into.
	const input = inputEl;
	const panel = panelEl;
	root.dataset.quiltWired = "true";

	const { posts, grid } = JSON.parse(data.textContent || "{}") as QuiltIndex;
	const postsMd = posts.map((p) => ({ ...p, col: p.colMd, row: p.rowMd }));

	// The DOM, once. Post cells are in DOM order, which is the index's order.
	const form = input.closest("form");
	const cells = [...root.querySelectorAll<HTMLElement>("[data-cell]")];
	const postCells = cells.filter((c) => c.dataset.cell === "post");
	const fillerCells = cells.filter((c) => c.dataset.cell === "filler");
	const hook = <T extends HTMLElement = HTMLElement>(sel: string) =>
		panel.querySelector<T>(sel);
	const card = {
		no: hook('[data-card="no"]'),
		index: hook('[data-card="index"]'),
		category: hook('[data-card="category"]'),
		node: hook('[data-card="node"]'),
		rate: hook('[data-card="rate"]'),
		minutes: hook('[data-card="minutes"]'),
		words: hook('[data-card="words"]'),
		month: hook('[data-card="month"]'),
		year: hook('[data-card="year"]'),
		title: hook('[data-card="title"]'),
		blurb: hook('[data-card="blurb"]'),
		why: hook('[data-card="why"]'),
		link: hook<HTMLAnchorElement>('[data-card="link"]'),
	};
	const resultsLabel = hook('[data-results="label"]');
	const list = hook<HTMLOListElement>('[data-results="list"]');
	const rowTemplate = hook<HTMLTemplateElement>("template[data-result-template]");
	const noneQuery = hook('[data-none="query"]');
	// The instrument around the board.
	const chips = [...document.querySelectorAll<HTMLAnchorElement>("[data-chip]")];
	const chipsNav = document.querySelector<HTMLElement>("[data-search-chips]");
	const count = document.querySelector<HTMLElement>("[data-search-count]");
	const searchReadout = document.querySelector<HTMLElement>("[data-search-readout]");
	const steppers = [...document.querySelectorAll<HTMLButtonElement>("[data-step]")];
	const key = document.querySelector<HTMLElement>("[data-quilt-key]");
	const ruler = document.querySelector<HTMLElement>("[data-quilt-ruler]");
	const months = ruler ? [...ruler.querySelectorAll<HTMLElement>("[data-month]")] : [];
	const monthAt = new Map(months.map((m, k) => [m.dataset.month!, k]));
	const marks = ruler ? [...ruler.querySelectorAll<HTMLElement>("[data-mark]")] : [];
	const postByNo = new Map(posts.map((p, i) => [p.no, i]));
	// The in-focus readout: every copy of a hook (the foot's and the dock's).
	const focusHooks = (name: string) => [...document.querySelectorAll<HTMLElement>(`[data-focus="${name}"]`)];
	const focus = {
		no: focusHooks("no"),
		title: focusHooks("title"),
		meta: focusHooks("meta"),
		position: focusHooks("position"),
		progress: focusHooks("progress"),
	};
	const write = (els: HTMLElement[], text: string) => {
		for (const el of els) if (el.textContent !== text) el.textContent = text;
	};

	const mqLg = matchMedia("(min-width: 1024px)");
	const mqPhone = matchMedia("(max-width: 639px)");
	const view = (): View => (mqLg.matches ? "lg" : mqPhone.matches ? "phone" : "md");

	const state: QuiltState = { query: "", focused: false, hovered: null, active: 0, stepped: null };
	/** The last resolution painted — what the key handlers act on. */
	let last: Resolution | null = null;
	let activePos = -1;

	/** The posts the stepper walks: the matches, newest first, or every
	 *  post when nothing is typed (DOM order is newest first). */
	const orderOf = (res: Resolution | null): number[] => {
		if (!res) return [];
		if (res.result) return [...res.matched].sort((a, b) => posts[b].no - posts[a].no);
		return posts.map((_, i) => i);
	};

	// --- Paint ------------------------------------------------------------------

	function paint() {
		const v = view();
		const ps = v === "lg" ? posts : postsMd;
		const g = v === "lg" ? grid.lg : grid.md;
		const res = resolve(ps, g, state);
		let { mode, block, cells: resolved } = res;
		let face: string = mode;

		// No block can dodge the focus (a post on the grid's one unavoidable
		// cell). Hovering or stepping to it shows nothing; a search still needs
		// its list, so the block is chosen as if nothing were focused and
		// covers the tile.
		if (mode !== "rest" && !block && v !== "phone") {
			if (mode === "hover" || mode === "step") face = "hidden";
			else {
				block = chooseBlock({ ...g, posts: ps, keep: new Set(res.matched), focus: null });
				const at = block;
				if (at) {
					const covered = (c: CellResolution) =>
						c.post !== null ? overlaps(at, PANEL_BLOCK, ps[c.post]) : inBlock(at, PANEL_BLOCK, c.col, c.row);
					resolved = resolved.map((c) =>
						covered(c) ? { ...c, state: "gone", delay: scatter({ cellIndex: c.index, seed: res.seed }).delay } : c,
					);
				}
			}
		}
		// On a phone the panel sits in flow above the list and covers nothing, but
		// the resolution is the tablet grid's, where cells under the block come
		// back `gone` — matches included. Undo that for posts the state keeps lit
		// (a match, the stepped post, or any post while browsing), or a result
		// shows as a faded tile.
		if (v === "phone" && mode !== "rest" && mode !== "hover" && mode !== "none") {
			const keep = new Set(res.matched);
			if (res.focus !== null) keep.add(res.focus);
			resolved = resolved.map((c) =>
				c.post !== null && (mode === "browse" || keep.has(c.post)) ? { ...c, state: "lit", delay: 0 } : c,
			);
		}
		last = { ...res, block, cells: resolved };
		activePos = res.active === null || mode === "step" ? -1 : res.matched.indexOf(res.active);

		// Cells. The ring: the active result while searching, the stepped post.
		// A post is painted from its top-left cell — the first of its footprint
		// in row-major order (the lead's four cells resolve alike anyway).
		const byPost = new Map<number, CellResolution>();
		for (const c of resolved) if (c.post !== null && !byPost.has(c.post)) byPost.set(c.post, c);
		postCells.forEach((el, i) =>
			paintCell(
				el,
				byPost.get(i),
				v,
				(mode === "results" && i === res.active) || (mode === "step" && i === res.focus),
			),
		);
		for (const el of fillerCells) {
			if (v === "phone") continue;
			const key = v === "lg" ? el.dataset.cellLg : el.dataset.cellMd;
			if (key == null) continue;
			paintCell(el, resolved[Number(key)], v, false);
		}

		// The panel.
		if (face === "rest") face = "hidden";
		else if (face === "hover" || face === "single" || face === "step") face = "card";
		panel.dataset.mode = face;
		if (block) {
			panel.style.setProperty("--panel-col", String(block.col));
			panel.style.setProperty("--panel-row", String(block.row));
		}
		if (face === "card" && res.focus !== null) {
			const hit = res.result?.hits.find((h) => h.i === res.focus);
			fillCard(posts[res.focus], hit?.why ?? null);
		} else if (face === "results" && res.result) {
			fillResults(ps, res);
		} else if (face === "none" && noneQuery) {
			noneQuery.textContent = state.query.trim();
		}

		// The input.
		input.setAttribute("aria-expanded", face === "hidden" ? "false" : "true");
		if (face === "results" && activePos >= 0) {
			input.setAttribute("aria-activedescendant", `${panel.id}-opt-${activePos}`);
		} else {
			input.removeAttribute("aria-activedescendant");
		}

		// The chips: current when the query IS a category (or empty, for all).
		const q = state.query.trim().toLowerCase();
		for (const chip of chips) {
			if ((chip.dataset.chip ?? "") === q) chip.setAttribute("aria-current", "page");
			else chip.removeAttribute("aria-current");
		}

		// The count: in full for a reader, short on screen.
		if (count) {
			count.textContent = res.result
				? `${res.result.hits.length} of ${posts.length} posts`
				: `${posts.length} posts`;
		}
		if (searchReadout) {
			searchReadout.textContent = res.result
				? `${res.result.hits.length} / ${posts.length}`
				: String(posts.length).padStart(2, "0");
		}

		// The stepper: nothing to step through when nothing matches.
		const order = orderOf(res);
		for (const b of steppers) b.disabled = order.length === 0;

		// THE POST IN FOCUS: the focused post, at rest the newest matching one
		// (the newest of all when nothing matches). Its bar on the ruler fills
		// (data-focus) and --at sits on its month; marks outside the filter
		// dim. The readout — the foot's and the dock's copies alike — takes its
		// number, title and meta, and its place among the posts the stepper
		// walks, oldest first (`5 / 5` is the newest of five), which is the
		// progress bar's share too.
		const at = res.focus ?? order[0] ?? 0;
		const p = posts[at];
		if (ruler && p) {
			const k = monthAt.get(p.ym);
			if (k !== undefined && months.length) {
				ruler.style.setProperty("--at", `${(((k + 0.5) / months.length) * 100).toFixed(3)}%`);
			}
		}
		if (ruler) {
			const keep = new Set(res.matched);
			for (const mark of marks) {
				const i = postByNo.get(Number(mark.dataset.no));
				const dim = !!res.result && (i === undefined || !keep.has(i));
				mark.toggleAttribute("data-dim", dim);
				if (dim) mark.setAttribute("aria-disabled", "true");
				else mark.removeAttribute("aria-disabled");
				mark.toggleAttribute("data-focus", i === at);
			}
		}
		if (p) {
			const n = order.length;
			const rank = n ? n - order.indexOf(at) : 0;
			write(focus.no, numeral(p.no));
			write(focus.title, p.title);
			write(focus.meta, `${p.month} ${p.year} · ${p.words} w`);
			write(focus.position, `${rank} / ${n}`);
			for (const bar of focus.progress) bar.style.setProperty("--progress", n ? String(rank / n) : "0");
		}
	}

	function paintCell(
		el: HTMLElement,
		c: CellResolution | undefined,
		v: View,
		active: boolean,
	) {
		let s = c?.state ?? "lit";
		if (v === "phone" && s === "gone") s = "faint";
		el.dataset.state = s;
		if (s === "lit") el.style.removeProperty("--scatter-delay");
		else el.style.setProperty("--scatter-delay", `${c?.delay ?? 0}ms`);
		el.toggleAttribute("data-active", active);
	}

	const metaOf = (p: IndexedPost) => `${p.month} ${p.year}${p.category ? ` · ${p.category}` : ""}`;

	function fillCard(p: QuiltPost, why: string | null) {
		const no = pad(p.no);
		if (card.no) card.no.textContent = no;
		if (card.index) card.index.textContent = `[index] 000${no} · log_${no}.txt`;
		if (card.category) card.category.textContent = p.category ?? "";
		if (card.node) card.node.textContent = p.category ?? "";
		if (card.rate) card.rate.textContent = String(Math.round(p.words / Math.max(1, p.minutes)));
		if (card.minutes) card.minutes.textContent = String(p.minutes);
		if (card.words) card.words.textContent = String(p.words);
		if (card.month) card.month.textContent = p.month;
		if (card.year) card.year.textContent = p.year;
		if (card.title) card.title.textContent = p.title;
		if (card.blurb) card.blurb.textContent = p.excerpt;
		if (card.why) card.why.textContent = why ? `MATCHED ${why}` : "";
		if (card.link) card.link.href = p.href;
	}

	function fillResults(ps: IndexedPost[], res: Resolution) {
		const result = res.result!;
		if (resultsLabel) {
			resultsLabel.textContent = `${result.hits.length} posts for “${state.query.trim()}”`;
		}
		if (!list || !rowTemplate) return;
		const proto = rowTemplate.content.querySelector("li");
		if (!proto) return;
		const rows = result.hits.slice(0, RESULT_ROWS).map((h, k) => {
			const p = ps[h.i];
			const li = proto.cloneNode(true) as HTMLLIElement;
			li.id = `${panel.id}-opt-${k}`;
			li.setAttribute("aria-selected", k === activePos ? "true" : "false");
			const a = li.querySelector<HTMLAnchorElement>("a");
			if (a) a.href = p.href;
			const title = li.querySelector('[data-result="title"]');
			if (title) {
				title.replaceChildren(
					...highlight(p.title, result.tokens).map((s) => {
						if (!s.hl) return document.createTextNode(s.text);
						const m = document.createElement("mark");
						m.textContent = s.text;
						return m;
					}),
				);
			}
			const meta = li.querySelector('[data-result="meta"]');
			if (meta) meta.textContent = metaOf(p);
			const why = li.querySelector('[data-result="why"]');
			if (why) why.textContent = h.why ? `MATCHED ${h.why}` : "";
			return li;
		});
		list.replaceChildren(...rows);
	}

	// --- State changes ----------------------------------------------------------

	let urlTimer: ReturnType<typeof setTimeout> | undefined;
	function syncUrl() {
		clearTimeout(urlTimer);
		urlTimer = setTimeout(() => {
			const q = state.query.trim();
			const url = new URL(location.href);
			if (q) url.searchParams.set("q", q);
			else url.searchParams.delete("q");
			history.replaceState(history.state, "", url);
		}, URL_DEBOUNCE_MS);
	}

	function setQuery(q: string) {
		if (input.value !== q) input.value = q;
		state.query = q;
		state.active = 0;
		state.hovered = null;
		state.stepped = null;
		paint();
		syncUrl();
	}

	/** Pin post `i`: the stepper's and the ruler's path. */
	function pin(i: number) {
		holdHover();
		state.hovered = null;
		state.stepped = i;
		paint();
	}

	/** − (older, dir 1) and + (newer, dir −1) through the matching posts,
	 *  newest first, from the post in focus; from rest − takes the newest
	 *  and + the oldest, and both wrap. */
	function step(dir: 1 | -1) {
		const order = orderOf(last);
		if (!order.length) return;
		const cur = last?.focus ?? null;
		const at = cur === null ? -1 : order.indexOf(cur);
		const n = order.length;
		const k = at < 0 ? (dir > 0 ? 0 : n - 1) : (at + dir + n) % n;
		pin(order[k]);
	}

	/** The pointer or focus has arrived on post `i`. A step is not in the
	 *  way: a hover previews over it and it returns on leave (the engine's
	 *  order), so nothing here needs to know about it. */
	function enter(i: number) {
		if (last?.result) {
			// Searching: a lit tile under the pointer becomes the active result.
			const k = last.matched.indexOf(i);
			if (k >= 0 && k < RESULT_ROWS && k !== activePos) {
				state.active = k;
				paint();
			}
		} else if (!state.focused && state.hovered !== i) {
			state.hovered = i;
			paint();
		}
	}

	let leaveTimer: ReturnType<typeof setTimeout> | undefined;
	let leaveFrame = 0;
	function holdHover() {
		clearTimeout(leaveTimer);
		cancelAnimationFrame(leaveFrame);
	}
	function leave() {
		holdHover();
		if (state.hovered === null) return;
		state.hovered = null;
		paint();
	}
	/** Let go of the hover after LEAVE_MS, unless something arrives first. */
	function leaveSoon() {
		holdHover();
		if (state.hovered === null) return;
		leaveTimer = setTimeout(() => (leaveFrame = requestAnimationFrame(leave)), LEAVE_MS);
	}

	const postIndexOf = (el: Element | null) => {
		const cell = el?.closest<HTMLElement>(POST_CELL) ?? null;
		return cell && root.contains(cell) ? postCells.indexOf(cell) : -1;
	};
	/** A hover holds while it is on a post tile or on the panel. */
	const holdsHover = (el: Element | null) =>
		!!el && (postIndexOf(el) >= 0 || panel.contains(el));

	// --- Listeners --------------------------------------------------------------

	const onInput = () => setQuery(input.value);

	const onInputKey = (e: KeyboardEvent) => {
		const n = Math.min(last?.matched.length ?? 0, RESULT_ROWS);
		const pos = Math.max(activePos, 0);
		if (e.key === "ArrowDown" && n) {
			e.preventDefault();
			state.stepped = null;
			state.active = (pos + 1) % n;
			paint();
		} else if (e.key === "ArrowUp" && n) {
			e.preventDefault();
			state.stepped = null;
			state.active = (pos - 1 + n) % n;
			paint();
		} else if (e.key === "Enter") {
			e.preventDefault();
			const m = last?.mode;
			if (last && last.focus !== null && (m === "results" || m === "single" || m === "step")) {
				navigate(posts[last.focus].href);
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			if (state.stepped !== null) {
				state.stepped = null;
				paint();
			} else if (state.query) setQuery("");
			else input.blur();
		}
	};

	const onDocKey = (e: KeyboardEvent) => {
		if (e.defaultPrevented) return;
		const t = e.target as Element | null;
		if (e.key === "Escape" && state.stepped !== null && !isEditable(t)) {
			state.stepped = null;
			paint();
			return;
		}
		const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
		const cmdK = (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey;
		if (!slash && !cmdK) return;
		if (isEditable(t) && t !== input) return;
		if (t === input && slash) return;
		e.preventDefault();
		input.focus();
		input.select();
	};

	const onOver = (e: PointerEvent) => {
		if (view() === "phone") return;
		const t = e.target as Element;
		if (!holdsHover(t)) return;
		holdHover();
		const i = postIndexOf(t);
		if (i >= 0) enter(i);
	};

	// Off a tile or the panel, onto anything that does not hold the hover
	// (a filler, the gap, the page): let go, after the grace.
	const onOut = (e: PointerEvent) => {
		if (view() === "phone") return;
		if (!holdsHover(e.target as Element)) return;
		if (holdsHover(e.relatedTarget as Element | null)) return;
		leaveSoon();
	};

	const onFocusIn = (e: FocusEvent) => {
		const t = e.target as HTMLElement;
		if (t === input) {
			if (!state.focused || state.hovered !== null || state.stepped !== null) {
				state.focused = true;
				state.hovered = null;
				state.stepped = null;
				paint();
			}
			return;
		}
		if (panel.contains(t)) return; // still "in the search"
		if (view() === "phone") return;
		const i = postIndexOf(t);
		if (i >= 0) enter(i);
	};

	const onFocusOut = (e: FocusEvent) => {
		const from = e.target as HTMLElement;
		const to = e.relatedTarget as HTMLElement | null;
		const inSearch = (el: HTMLElement | null) => !!el && (el === input || panel.contains(el));
		let changed = false;
		if (inSearch(from) && !inSearch(to) && state.focused) {
			state.focused = false;
			changed = true;
		}
		// Tab from a tile to the card's READ link keeps the card.
		if (holdsHover(from) && !holdsHover(to) && state.hovered !== null) {
			holdHover();
			state.hovered = null;
			changed = true;
		}
		if (changed) paint();
	};

	// A press inside the panel must not blur the input: the browse face would
	// close under the pointer before the click landed.
	const onPanelDown = (e: PointerEvent) => e.preventDefault();

	const here = location.pathname.replace(/\/$/, "");
	const isQueryLink = (a: HTMLAnchorElement) => {
		const url = new URL(a.href, location.href);
		return url.pathname.replace(/\/$/, "") === here && url.searchParams.has("q");
	};
	const onPanelClick = (e: MouseEvent) => {
		if (!plainClick(e)) return;
		const a = (e.target as Element).closest("a");
		if (!a || !panel.contains(a) || !isQueryLink(a)) return;
		e.preventDefault();
		setQuery(new URL(a.href, location.href).searchParams.get("q") ?? "");
		input.focus();
	};

	// A chip is a query, set in place; the focus stays on the chip.
	const onChipClick = (e: MouseEvent) => {
		if (!plainClick(e)) return;
		const a = (e.target as Element).closest<HTMLAnchorElement>("[data-chip]");
		if (!a) return;
		e.preventDefault();
		setQuery(a.dataset.chip ?? "");
	};

	// A row of the topic key is a chip by another name: its `?q=` set in
	// place, and the bar takes the focus so the results read.
	const onKeyClick = (e: MouseEvent) => {
		if (!plainClick(e)) return;
		const a = (e.target as Element).closest("a");
		if (!a || !key?.contains(a) || !isQueryLink(a)) return;
		e.preventDefault();
		setQuery(new URL(a.href, location.href).searchParams.get("q") ?? "");
		input.focus();
	};

	const onStepClick = (e: MouseEvent) => {
		const b = (e.currentTarget as HTMLButtonElement) ?? null;
		if (!b || b.disabled) return;
		step(b.dataset.step === "newer" ? -1 : 1);
	};

	// A lit bar pins its post; a dim one is not a control, and with the
	// script off every bar is simply a link to its post.
	const onRulerClick = (e: MouseEvent) => {
		if (!plainClick(e)) return;
		const a = (e.target as Element).closest<HTMLAnchorElement>("[data-mark]");
		if (!a) return;
		e.preventDefault();
		if (a.hasAttribute("data-dim")) return;
		const i = postByNo.get(Number(a.dataset.no));
		if (i !== undefined) pin(i);
	};

	const onListOver = (e: PointerEvent) => {
		const li = (e.target as Element).closest("li");
		if (!li || !list) return;
		const k = [...list.children].indexOf(li);
		if (k >= 0 && k !== activePos) {
			state.active = k;
			paint();
		}
	};

	const onSubmit = (e: Event) => e.preventDefault();
	const onMedia = () => paint();

	input.addEventListener("input", onInput);
	input.addEventListener("keydown", onInputKey);
	form?.addEventListener("submit", onSubmit);
	root.addEventListener("pointerover", onOver);
	root.addEventListener("pointerout", onOut);
	root.addEventListener("pointerleave", leave);
	panel.addEventListener("pointerdown", onPanelDown);
	panel.addEventListener("click", onPanelClick);
	list?.addEventListener("pointerover", onListOver);
	chipsNav?.addEventListener("click", onChipClick);
	key?.addEventListener("click", onKeyClick);
	for (const b of steppers) b.addEventListener("click", onStepClick);
	ruler?.addEventListener("click", onRulerClick);
	document.addEventListener("keydown", onDocKey);
	document.addEventListener("focusin", onFocusIn);
	document.addEventListener("focusout", onFocusOut);
	mqLg.addEventListener("change", onMedia);
	mqPhone.addEventListener("change", onMedia);

	// ?q= on the URL is the query.
	const q0 = new URL(location.href).searchParams.get("q");
	if (q0) {
		input.value = q0;
		state.query = q0;
	}
	if (document.activeElement === input) state.focused = true;
	paint();

	return () => {
		clearTimeout(urlTimer);
		holdHover();
		document.removeEventListener("keydown", onDocKey);
		document.removeEventListener("focusin", onFocusIn);
		document.removeEventListener("focusout", onFocusOut);
		mqLg.removeEventListener("change", onMedia);
		mqPhone.removeEventListener("change", onMedia);
	};
}

let teardown: (() => void) | null = null;
document.addEventListener("astro:page-load", () => {
	teardown?.();
	teardown = wire();
});
document.addEventListener("astro:before-swap", () => {
	teardown?.();
	teardown = null;
});
