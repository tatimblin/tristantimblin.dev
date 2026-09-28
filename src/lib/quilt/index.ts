/**
 * THE QUILT'S WIRING — the DOM side of /txt.
 *
 * The page renders the design system's contract (Quilt, QuiltCell,
 * QuiltPanel, SearchBar) and embeds its index as JSON; this module reads
 * both, keeps the one piece of state — `{ query, focused, hovered, active }`
 * — and on every change asks the engine (./engine.ts, pure) what the grid
 * should look like, then PAINTS the answer:
 *
 *   a cell       data-state="lit | faint | gone", --scatter-delay, data-active
 *   the panel    data-mode, --panel-col / --panel-row, the faces' text
 *   the input    aria-expanded, aria-activedescendant, the live count
 *
 * Nothing here decides anything: which cells scatter, where the block goes
 * and what the search found are the engine's, and are tested there.
 *
 * INPUTS. Hover and focus on a tile are the same path (a keyboard user gets
 * the card too); the search input's focus is the browse state; typing wins
 * over both. `/` and ⌘K focus the bar from anywhere that is not editable.
 * In the bar: ↑↓ move the active result (its tile takes the accent ring),
 * Enter opens it, Escape clears the query and, when it is already empty,
 * blurs. Links to `?q=` inside the panel (the browse pills, the nothing
 * face's suggestions) set the query in place instead of reloading. `?q=` on
 * the URL is read on load and kept in step with the input, debounced,
 * through replaceState — so a search is a link.
 *
 * VIEWPORTS. The engine runs on the desktop grid (5 columns) at ≥ 1024 and
 * the tablet one (3 columns, the posts' `colMd`/`rowMd`) below that. On a
 * phone (< 640) the same machine runs but nothing is hovered: the panel is
 * in flow, a tap navigates, and a cell that would be `gone` is painted
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
}
interface QuiltIndex {
	posts: QuiltPost[];
	grid: { lg: Grid; md: Grid };
}
type View = "lg" | "md" | "phone";

/** The results face shows this many rows; ↑↓ wrap within them. */
const RESULT_ROWS = 4;
const URL_DEBOUNCE_MS = 150;
const POST_CELL = '[data-cell="post"]';

const pad = (no: number) => String(no).padStart(3, "0");
const isEditable = (el: Element | null) =>
	!!el &&
	((el as HTMLElement).isContentEditable || /^(input|textarea|select)$/i.test(el.tagName));

function wire(): (() => void) | null {
	const root = document.querySelector<HTMLElement>("[data-quilt]");
	const data = document.querySelector<HTMLScriptElement>("script[data-quilt-index]");
	const input = document.querySelector<HTMLInputElement>("[data-search-input]");
	const panel = root?.querySelector<HTMLElement>("[data-quilt-panel]");
	if (!root || !data || !input || !panel || root.dataset.quiltWired) return null;
	root.dataset.quiltWired = "true";

	const { posts, grid } = JSON.parse(data.textContent || "{}") as QuiltIndex;
	const postsMd = posts.map((p) => ({ ...p, col: p.colMd, row: p.rowMd }));

	// The DOM, once. Post cells are in DOM order, which is the index's order.
	const form = input.closest("form");
	const count = document.querySelector<HTMLElement>("[data-search-count]");
	const cells = [...root.querySelectorAll<HTMLElement>("[data-cell]")];
	const postCells = cells.filter((c) => c.dataset.cell === "post");
	const fillerCells = cells.filter((c) => c.dataset.cell === "filler");
	const hook = <T extends HTMLElement = HTMLElement>(sel: string) =>
		panel.querySelector<T>(sel);
	const card = {
		kicker: hook('[data-card="kicker"]'),
		title: hook('[data-card="title"]'),
		blurb: hook('[data-card="blurb"]'),
		meta: hook('[data-card="meta"]'),
		why: hook('[data-card="why"]'),
		link: hook<HTMLAnchorElement>('[data-card="link"]'),
	};
	const resultsLabel = hook('[data-results="label"]');
	const list = hook<HTMLOListElement>('[data-results="list"]');
	const rowTemplate = hook<HTMLTemplateElement>("template[data-result-template]");
	const noneQuery = hook('[data-none="query"]');

	const mqLg = matchMedia("(min-width: 1024px)");
	const mqPhone = matchMedia("(max-width: 639px)");
	const view = (): View => (mqLg.matches ? "lg" : mqPhone.matches ? "phone" : "md");

	const state: QuiltState = { query: "", focused: false, hovered: null, active: 0 };
	/** The last resolution painted — what the key handlers act on. */
	let last: Resolution | null = null;
	let activePos = -1;

	// --- Paint ------------------------------------------------------------------

	function paint() {
		const v = view();
		const ps = v === "lg" ? posts : postsMd;
		const g = v === "lg" ? grid.lg : grid.md;
		const res = resolve(ps, g, state);
		let { mode, block, cells: resolved } = res;
		let face: string = mode;

		// No block can dodge the focus (a post on the grid's one unavoidable
		// cell). Hovering it shows nothing; a search still needs its list, so
		// the block is chosen as if nothing were focused and covers the tile.
		if (mode !== "rest" && !block && v !== "phone") {
			if (mode === "hover") face = "hidden";
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
		last = { ...res, block, cells: resolved };
		activePos = res.active === null ? -1 : res.matched.indexOf(res.active);

		// Cells.
		const byPost = new Map<number, CellResolution>();
		for (const c of resolved) if (c.post !== null) byPost.set(c.post, c);
		postCells.forEach((el, i) =>
			paintCell(el, byPost.get(i), v, mode === "results" && i === res.active),
		);
		for (const el of fillerCells) {
			if (v === "phone") continue;
			const key = v === "lg" ? el.dataset.cellLg : el.dataset.cellMd;
			if (key == null) continue;
			paintCell(el, resolved[Number(key)], v, false);
		}

		// The panel.
		if (face === "rest") face = "hidden";
		else if (face === "hover" || face === "single") face = "card";
		panel.dataset.mode = face;
		if (block) {
			panel.style.setProperty("--panel-col", String(block.col));
			panel.style.setProperty("--panel-row", String(block.row));
		}
		if (face === "card" && res.focus !== null) {
			fillCard(ps[res.focus], mode === "single" ? res.result?.hits[0].why ?? null : null);
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
		if (count) {
			count.textContent = res.result
				? `${res.result.hits.length} of ${posts.length}`
				: `${posts.length} posts`;
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

	function fillCard(p: IndexedPost, why: string | null) {
		if (card.kicker) card.kicker.textContent = `NO. ${pad(p.no)} · ${p.month.toUpperCase()} ${p.year}`;
		if (card.title) card.title.textContent = p.title;
		if (card.blurb) card.blurb.textContent = p.excerpt;
		if (card.meta) card.meta.textContent = `${p.category ? `${p.category} · ` : ""}${p.minutes} min`;
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
		paint();
		syncUrl();
	}

	/** The pointer or focus has arrived on post `i`. */
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

	function leave() {
		if (state.hovered === null) return;
		state.hovered = null;
		paint();
	}

	const postIndexOf = (el: Element | null) => {
		const cell = el?.closest<HTMLElement>(POST_CELL) ?? null;
		return cell && root.contains(cell) ? postCells.indexOf(cell) : -1;
	};

	// --- Listeners --------------------------------------------------------------

	const onInput = () => setQuery(input.value);

	const onInputKey = (e: KeyboardEvent) => {
		const n = Math.min(last?.matched.length ?? 0, RESULT_ROWS);
		const pos = Math.max(activePos, 0);
		if (e.key === "ArrowDown" && n) {
			e.preventDefault();
			state.active = (pos + 1) % n;
			paint();
		} else if (e.key === "ArrowUp" && n) {
			e.preventDefault();
			state.active = (pos - 1 + n) % n;
			paint();
		} else if (e.key === "Enter") {
			e.preventDefault();
			const m = last?.mode;
			if (last && last.active !== null && (m === "results" || m === "single")) {
				navigate(posts[last.active].href);
			}
		} else if (e.key === "Escape") {
			e.preventDefault();
			if (state.query) setQuery("");
			else input.blur();
		}
	};

	const onDocKey = (e: KeyboardEvent) => {
		if (e.defaultPrevented) return;
		const slash = e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey;
		const cmdK = (e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey) && !e.altKey;
		if (!slash && !cmdK) return;
		const t = e.target as Element | null;
		if (isEditable(t) && t !== input) return;
		if (t === input && slash) return;
		e.preventDefault();
		input.focus();
		input.select();
	};

	const onOver = (e: PointerEvent) => {
		if (view() === "phone") return;
		const i = postIndexOf(e.target as Element);
		if (i >= 0) enter(i);
	};

	const onFocusIn = (e: FocusEvent) => {
		const t = e.target as HTMLElement;
		if (t === input) {
			if (!state.focused || state.hovered !== null) {
				state.focused = true;
				state.hovered = null;
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
		if (postIndexOf(from) >= 0 && postIndexOf(to) < 0 && state.hovered !== null) {
			state.hovered = null;
			changed = true;
		}
		if (changed) paint();
	};

	// A press inside the panel must not blur the input: the browse face would
	// close under the pointer before the click landed.
	const onPanelDown = (e: PointerEvent) => e.preventDefault();

	const here = location.pathname.replace(/\/$/, "");
	const onPanelClick = (e: MouseEvent) => {
		if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
		const a = (e.target as Element).closest("a");
		if (!a || !panel.contains(a)) return;
		const url = new URL(a.href, location.href);
		if (url.pathname.replace(/\/$/, "") !== here || !url.searchParams.has("q")) return;
		e.preventDefault();
		setQuery(url.searchParams.get("q") ?? "");
		input.focus();
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
	root.addEventListener("pointerleave", leave);
	panel.addEventListener("pointerdown", onPanelDown);
	panel.addEventListener("click", onPanelClick);
	list?.addEventListener("pointerover", onListOver);
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
