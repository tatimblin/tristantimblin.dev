/**
 * THE INSTRUMENT'S WIRING — the DOM side of /txt.
 *
 * The page renders the design system's contract (Quilt, QuiltCell,
 * QuiltPanel, SearchBar with its chips and the stepper, TimeRuler) and
 * embeds its index as JSON; this module reads both, keeps the one piece of
 * state — `{ query, focused, hovered, active, stepped }` — and on every
 * change asks the engine (./engine.ts, pure) what the grid should look
 * like, then PAINTS the answer:
 *
 *   a cell       data-state="lit | faint | gone", --scatter-delay, data-active
 *   the panel    data-mode, --panel-col / --panel-row, the card's fields
 *   the input    aria-expanded, aria-activedescendant
 *   the chips    aria-current on the chip whose query is the query
 *   the count    the live region a reader hears (`5 posts`, `2 of 5 posts`)
 *   the stepper  disabled when nothing matches
 *   the ruler    --at (the playhead on the focused post's month, at rest on
 *                the newest matching post), data-dim on a mark out of the
 *                filter, the readout
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
 * instead of reloading — a chip is a search shortcut, and ALL clears it. `?q=` on the URL is read on load and kept in step
 * with the input, debounced, through replaceState — so a search is a link.
 *
 * STEPPING. − and + PIN a post (`stepped`): the older / newer one among the
 * posts that match (chronological, newest first), from the one in focus, or
 * from rest the newest (−) or the oldest (+), wrapping. A click on a
 * timeline tick pins that post. A step holds until Escape, typing, focusing
 * the bar or a chip; a hover on another tile only previews over it and the
 * step is back when the pointer leaves — the pointer being elsewhere never
 * clears it, which is what makes it the touch-friendly way through the
 * quilt.
 *
 * VIEWPORTS. The engine runs on the desktop grid (5 columns) at ≥ 1024 and
 * the tablet one (3 columns, the posts' `colMd`/`rowMd`) below that. On a
 * phone (< 640) the same machine runs but nothing is hovered: the panel is
 * in flow, a tap navigates, a step shows the card above the list, and a
 * cell that would be `gone` is painted `faint` so the list never shows holes.
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
	const steppers = [...document.querySelectorAll<HTMLButtonElement>("[data-step]")];
	const ruler = document.querySelector<HTMLElement>("[data-quilt-ruler]");
	const readout = ruler?.querySelector<HTMLElement>('[data-time-ruler="readout"]') ?? null;
	const months = ruler ? [...ruler.querySelectorAll<HTMLElement>("[data-month]")] : [];
	const monthAt = new Map(months.map((m, k) => [m.dataset.month!, k]));
	const marks = ruler ? [...ruler.querySelectorAll<HTMLElement>("[data-mark]")] : [];
	const postByNo = new Map(posts.map((p, i) => [p.no, i]));

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
					resolved = resolved.map((c) =>
						inBlock(at, PANEL_BLOCK, c.col, c.row)
							? { ...c, state: "gone", delay: scatter({ cellIndex: c.index, seed: res.seed }).delay }
							: c,
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
		const byPost = new Map<number, CellResolution>();
		for (const c of resolved) if (c.post !== null) byPost.set(c.post, c);
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

		// The count, for a reader.
		if (count) {
			count.textContent = res.result
				? `${res.result.hits.length} of ${posts.length} posts`
				: `${posts.length} posts`;
		}

		// The stepper: nothing to step through when nothing matches.
		const order = orderOf(res);
		for (const b of steppers) b.disabled = order.length === 0;

		// The ruler: the playhead on the focused post's month, at rest on the
		// newest matching post (the newest of all when nothing matches); marks
		// outside the filter dim; the readout names the post in focus.
		if (ruler) {
			const at = res.focus ?? order[0] ?? 0;
			const p = posts[at];
			if (p) {
				const k = monthAt.get(p.ym);
				if (k !== undefined && months.length) {
					ruler.style.setProperty("--at", `${(((k + 0.5) / months.length) * 100).toFixed(3)}%`);
				}
				if (readout) {
					readout.textContent =
						res.focus !== null ? `${p.month} ${p.year} · no. ${pad(p.no)}` : `latest · ${p.month} ${p.year}`;
				}
			}
			const keep = new Set(res.matched);
			for (const mark of marks) {
				const i = postByNo.get(Number(mark.dataset.no));
				const dim = !!res.result && (i === undefined || !keep.has(i));
				mark.toggleAttribute("data-dim", dim);
				if (dim) mark.setAttribute("aria-disabled", "true");
				else mark.removeAttribute("aria-disabled");
			}
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

	const onStepClick = (e: MouseEvent) => {
		const b = (e.currentTarget as HTMLButtonElement) ?? null;
		if (!b || b.disabled) return;
		step(b.dataset.step === "newer" ? -1 : 1);
	};

	// A lit tick pins its post; a dim one is not a control, and with the
	// script off every tick is simply a link to its post.
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
