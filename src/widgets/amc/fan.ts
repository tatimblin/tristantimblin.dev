// The A-List card's client: the poster fan, the arc gauge under it and the
// readout, laid out against the card as drawn (sizes from ./arc.ts, in the
// mock's units, scaled by the card's own size) and driven by drag, tap,
// wheel and the keyboard. Amc.astro renders the shell and the films as JSON;
// this builds the gauge from them, and draws the posters on a few recycled
// cards (only those on the fan, however many films there are).
//
// DATE: the fan in watch order over a scale of evenly spaced ticks (taller at
// a year's start) that slides under a fixed needle. GENRE: the films grouped
// by genre; the ticks merge into one capsule per genre, each in its genre's
// colour (full while current, muted otherwise), and a notch cut into the
// current capsule marks the film. The mode glyph in the header toggles; the
// posters shuffle to their new places and the ticks morph, the current film
// staying current. Under prefers-reduced-motion every change is a cut.
import { stepFromKey } from "@whois/design-system/lib/keys";
import {
	FAN,
	GAUGE,
	capArcs,
	countdownWords,
	dateWords,
	daysUntil,
	easeOut,
	fanPose,
	genreAngle,
	genreWords,
	groupAt,
	isUpcoming,
	lerp,
	MONTHS,
	orders,
	placeAtAngle,
	smoothstep,
	yearStarts,
	type CapArc,
} from "./arc";
import type { Film } from "./amc";

type Mode = "date" | "genre";

/** One of the fan's recycled cards and the film it is showing. */
interface Slot {
	el: HTMLDivElement;
	img: HTMLImageElement;
	/** The placeholder: the film's title on its genre's tint, for a film with
	 *  no poster (or one that failed to load). */
	ph: HTMLSpanElement;
	badge: HTMLSpanElement | null;
	/** The film it was last handed, -1 before any. */
	film: number;
	/** Drawn this frame. */
	on: boolean;
}

/** The most cards the fan ever holds. At rest it draws seven (the centre
 *  ±3); a shuffle draws the posters leaving the fan and those arriving (at
 *  most seven each) plus one per stack of posters riding an identical path
 *  across it. Past this the posters nearest the edges are left out. */
export const POOL = 16;

/** Posters warmed at once once the visitor shows intent (hover, focus,
 *  touch). */
export const PREFETCH_CONCURRENCY = 6;

const NS = "http://www.w3.org/2000/svg";
const DEG = Math.PI / 180;
/** In GENRE, the readout settles back to the date after this long still. */
const IDLE_MS = 2500;
const MOVE_MS = 420;
const MORPH_MS = 560;

const genreVar = (g: string) => `var(--genre-${g.toLowerCase().replace(/[^a-z]+/g, "-")})`;

const esc = (s: string) =>
	s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

/** The readout's markup: tiny caps, the bold figure, tiny caps. */
const words = ([pre, num, post]: [string, string, string], preClass = "") =>
	(pre ? `<span class="ds-mono ds-caps wx-amc-small ${preClass}">${esc(pre)}</span>` : "") +
	`<b class="wx-amc-num">${esc(num)}</b>` +
	(post ? `<span class="ds-mono ds-caps wx-amc-small">${esc(post)}</span>` : "");

export function mountFan(widget: HTMLElement, films: Film[], today = new Date()) {
	const body = widget.querySelector<HTMLElement>(".wx-amc-body");
	const fan = widget.querySelector<HTMLElement>(".wx-amc-fan");
	const svg = widget.querySelector<SVGSVGElement>(".wx-amc-gauge");
	const scrub = widget.querySelector<HTMLElement>(".wx-amc-scrub");
	const cap = widget.querySelector<HTMLElement>(".wx-amc-cap");
	const readout = widget.querySelector<HTMLElement>(".wx-amc-ro");
	const title = widget.querySelector<HTMLAnchorElement>(".wx-amc-title");
	const modeBtn = widget.querySelector<HTMLButtonElement>("[data-amc-mode]");
	const N = films.length;
	if (!body || !fan || !svg || !scrub || !cap || !readout || !title || !modeBtn || N === 0) return null;

	const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
	const ac = new AbortController();
	const on = <K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		fn: (e: HTMLElementEventMap[K]) => void,
		opts: AddEventListenerOptions = {},
	) => el.addEventListener(type, fn, { ...opts, signal: ac.signal });

	const up = films.map((f) => isUpcoming(f, today));
	const seen = up.filter((x) => !x).length;
	const { date: dateOrder, genre: genreOrder, groups } = orders(films);
	const majors = yearStarts(films);
	const placeOf: Record<Mode, number[]> = { date: [], genre: [] };
	dateOrder.forEach((fi, at) => (placeOf.date[fi] = at));
	genreOrder.forEach((fi, at) => (placeOf.genre[fi] = at));
	const orderOf: Record<Mode, number[]> = { date: dateOrder, genre: genreOrder };

	/* ── the posters: a small pool of cards, recycled ──
	   Only the posters on the fan are in the DOM, never one per film: at rest
	   the centre ±3 (the outermost pair transparent, so their art is already
	   loaded when they slide in), mid-shuffle whatever is crossing the fan.
	   Each frame a film keeps the card it had; a film coming in takes a card
	   no longer needed and the card's art, class, disc and index are swapped
	   to it. Until the visitor shows intent (prefetch, below), posters off
	   the fan are never requested. */
	const slots: Slot[] = [];
	/** The card each film was last drawn on (it may since have been parked). */
	const slotOf = new Map<number, Slot>();
	/** Poster URLs already decoded (by the prefetch, or shown on a card), and
	 *  those that failed to load. */
	const decoded = new Set<string>();
	const failed = new Set<string>();
	fan.replaceChildren();

	/** The card shows the placeholder (the title on the genre's tint) in
	 *  place of art: no poster, or one that failed. */
	const showPlaceholder = (s: Slot, on: boolean) => {
		s.el.toggleAttribute("data-ph", on);
		if (on) s.img.remove();
		else if (!s.img.isConnected) s.el.prepend(s.img);
	};

	const newSlot = (): Slot => {
		const el = document.createElement("div");
		el.className = "wx-amc-card";
		el.style.display = "none";
		const img = document.createElement("img");
		img.className = "wx-amc-art";
		img.alt = "";
		img.loading = "lazy";
		img.decoding = "async";
		img.draggable = false;
		const ph = document.createElement("span");
		ph.className = "wx-amc-ph";
		el.append(ph);
		const s: Slot = { el, img, ph, badge: null, film: -1, on: false };
		// Shown once the art it was handed has loaded, so a recycled card
		// never flashes the film it held before: the wash until then, as a
		// fresh card's lazy art would. A poster that fails falls back to the
		// placeholder rather than staying hidden.
		img.addEventListener(
			"load",
			() => {
				img.style.visibility = "";
				decoded.add(img.currentSrc || img.src);
			},
			{ signal: ac.signal },
		);
		img.addEventListener(
			"error",
			() => {
				const src = img.getAttribute("src");
				if (!src) return;
				failed.add(src);
				if (s.film >= 0 && films[s.film].p === src) showPlaceholder(s, true);
			},
			{ signal: ac.signal },
		);
		fan.append(el);
		slots.push(s);
		return s;
	};

	/** Hands a card to film `i`: its art, booked state and disc. */
	const bind = (s: Slot, i: number) => {
		if (s.film >= 0 && slotOf.get(s.film) === s) slotOf.delete(s.film);
		s.film = i;
		slotOf.set(i, s);
		const f = films[i];
		s.el.className = up[i] ? "wx-amc-card wx-amc-card--up" : "wx-amc-card";
		s.el.dataset.film = String(i);
		s.el.style.setProperty("--gc", genreVar(f.g));
		s.ph.textContent = f.n;
		if (f.p && !failed.has(f.p)) {
			if (s.img.getAttribute("src") !== f.p) {
				s.img.src = f.p;
				// Already decoded (warmed, or shown before): in this frame, no
				// wait for load. Otherwise hidden until it loads.
				s.img.style.visibility = decoded.has(f.p) || (s.img.complete && s.img.naturalWidth) ? "" : "hidden";
			}
			showPlaceholder(s, false);
		} else {
			// No poster, or it failed: the title on the genre's tint.
			showPlaceholder(s, true);
		}
		if (up[i]) {
			// The booked showing's calendar disc: month over day.
			const d = f.d.split("-").map(Number);
			if (!s.badge) {
				s.badge = document.createElement("span");
				s.badge.className = "wx-amc-badge";
			}
			s.badge.innerHTML = `<span class="ds-mono ds-caps">${MONTHS[d[1] - 1]}</span><b>${d[2]}</b>`;
			if (!s.badge.isConnected) s.el.append(s.badge);
		} else {
			s.badge?.remove();
		}
	};

	/* ── the gauge ── */
	const mk = <K extends keyof SVGElementTagNameMap>(tag: K, cls: string, parent: Element) => {
		const e = document.createElementNS(NS, tag);
		e.setAttribute("class", cls);
		parent.append(e);
		return e;
	};
	svg.replaceChildren();
	const gCaps = mk("g", "wx-amc-caps", svg);
	const gTicks = mk("g", "wx-amc-ticks", svg);
	const ticks = films.map((_, i) => {
		const t = mk("line", "wx-amc-tick", gTicks);
		if (majors.has(i)) t.dataset.major = "";
		if (up[i]) t.dataset.up = "";
		return t;
	});
	const caps = groups.map((G) => {
		const p = mk("path", "wx-amc-capsule", gCaps);
		p.style.setProperty("--gc", genreVar(G.g));
		return p;
	});
	/** Whether each tick was last drawn showing (all, before the first draw). */
	const tickLit = films.map(() => true);
	let capsDrawn: Geo | null = null;
	const nowDot = mk("circle", "wx-amc-now", svg);
	const halo = mk("line", "wx-amc-halo", svg);
	const needle = mk("line", "wx-amc-needle", svg);
	const notch = mk("line", "wx-amc-notch", svg);

	/* ── state ── */
	let mode: Mode = "date";
	let pos = Math.max(0, seen - 1); // a place in the current order
	let active = -1;
	let blend = 0; // 0 DATE … 1 GENRE, tweened by a toggle
	let shuffling = false;
	/** Each poster's offset from the centre as last drawn, so a toggle starts
	 *  its shuffle from where the posters are, mid-glide or mid-shuffle. */
	const shown = films.map(() => 0);
	let raf = 0;
	let idleTimer = 0;
	let roIdle = false;

	/* ── geometry, from the card as drawn ── */
	interface Geo {
		u: number;
		w: number;
		h: number;
		cx: number;
		py: number; // the pivot, under the card
		rad: number; // pivot to a poster's centre
		pw: number;
		ph: number;
		R: number; // the ticks' outer radius
		rIn: number;
		rMaj: number;
		capR: number;
		arcs: CapArc[];
	}
	let geo: Geo | null = null;
	const measure = (): Geo | null => {
		const w = body.clientWidth;
		const h = body.clientHeight;
		const capTop = cap.offsetTop;
		if (!w || !h || capTop <= 0) return null;
		// The mock's 210 units across, unless the body is too short for the
		// fan over the caption; then the height decides.
		const u = Math.max(0.3, Math.min(w / 210, capTop / 112));
		const pw = FAN.posterW * u;
		const ph = pw * 1.5;
		const R = GAUGE.R * u;
		// The caption sits 20 units under the gauge's top at the centre.
		const py = capTop + R - 20 * u;
		const capR = GAUGE.capR * u;
		widget.style.setProperty("--amc-pw", `${pw}px`);
		widget.style.setProperty("--amc-u", `${u}px`);
		scrub.style.top = `${py - R - 6 * u}px`;
		scrub.style.height = `${34 * u}px`;
		svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
		return {
			u,
			w,
			h,
			cx: w / 2,
			py,
			rad: FAN.R * u + ph / 2,
			pw,
			ph,
			R,
			rIn: R - GAUGE.minor * u,
			rMaj: R - GAUGE.major * u,
			capR,
			arcs: capArcs(groups, capR, u),
		};
	};
	const pt = (g: Geo, th: number, r: number): [number, number] => [g.cx + r * Math.sin(th), g.py - r * Math.cos(th)];
	const arcPath = (g: Geo, a0: number, a1: number, r: number) => {
		const [x0, y0] = pt(g, a0, r);
		const [x1, y1] = pt(g, a1, r);
		return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
	};
	const line = (el: SVGLineElement, [x1, y1]: [number, number], [x2, y2]: [number, number]) => {
		el.setAttribute("x1", x1.toFixed(2));
		el.setAttribute("y1", y1.toFixed(2));
		el.setAttribute("x2", x2.toFixed(2));
		el.setAttribute("y2", y2.toFixed(2));
	};

	/* ── drawing ── */
	/** A poster to draw this frame: the film on top of its stack, how many
	 *  films share its exact pose, and where it is. */
	interface Draw {
		i: number;
		n: number;
		d: number;
		l: number;
	}
	const stacks = new Map<string, Draw>();
	const place = (offset: (i: number) => number, lift?: (i: number) => number) => {
		if (!geo) return;
		const g = geo;
		const top = g.py - g.rad - g.ph / 2;
		const edge = FAN.visible + 0.3;
		// Every film's offset (kept, so a toggle can start from it), but only
		// the posters on the fan are drawn. Mid-shuffle, films clamped to the
		// same path off the fan pile up in one pose (the later film on top, as
		// the order of the cards had it): one card draws the pile, its opacity
		// that of the pile's layers composited.
		stacks.clear();
		for (let i = 0; i < N; i++) {
			const d = offset(i);
			shown[i] = d;
			if (Math.abs(d) > edge) continue;
			const l = lift ? lift(i) : 0;
			// At rest the transparent outermost pair is drawn too: their art loads
			// before they slide in. Mid-shuffle a transparent poster is left out.
			if (shuffling && Math.abs(d) >= FAN.visible) continue;
			const key = `${d.toFixed(4)} ${l.toFixed(2)}`;
			const s = stacks.get(key);
			if (s) {
				s.i = i;
				s.n++;
			} else stacks.set(key, { i, n: 1, d, l });
		}
		let draw = [...stacks.values()];
		if (draw.length > POOL) draw = draw.sort((a, b) => Math.abs(a.d) - Math.abs(b.d)).slice(0, POOL);

		// Films already on a card keep it; the rest take cards no longer needed.
		for (const s of slots) s.on = false;
		const need: Draw[] = [];
		for (const w of draw) {
			const s = slotOf.get(w.i);
			if (s && !s.on) s.on = true;
			else need.push(w);
		}
		let free = 0;
		const cardFor = (w: Draw) => {
			while (free < slots.length && slots[free].on) free++;
			const s = free < slots.length ? slots[free] : newSlot();
			s.on = true;
			bind(s, w.i);
			return s;
		};
		for (const w of need) cardFor(w);
		const byFilm = new Map(draw.map((w) => [w.i, w]));

		for (const s of slots) {
			const c = s.el;
			if (!s.on) {
				if (c.style.display !== "none") {
					c.style.display = "none";
					c.removeAttribute("data-active");
				}
				continue;
			}
			const w = byFilm.get(s.film)!;
			const p = fanPose(w.d, g.rad);
			c.style.display = "";
			c.style.left = `${g.cx - g.pw / 2}px`;
			c.style.top = `${top}px`;
			const y = p.y - w.l;
			c.style.transform = `translate(${p.x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${p.rotate.toFixed(2)}deg) scale(${p.scale.toFixed(3)})`;
			// A booked film's art is grey whatever its place (CSS); a seen film
			// colours up in the centre.
			c.style.setProperty("--gray", p.gray.toFixed(2));
			c.style.opacity = (1 - (1 - p.opacity) ** w.n).toFixed(3);
			// Nearer the centre on top; level, the later film (the order one
			// card per film had in the DOM).
			c.style.zIndex = String(p.z * N + s.film);
			c.toggleAttribute("data-active", Math.abs(w.d) < 0.5);
		}
	};

	const drawGauge = () => {
		if (!geo) return;
		const g = geo;
		const span = GAUGE.span * DEG;
		const pitch = GAUGE.pitch * DEG;
		const film = orderOf[mode][Math.round(pos)];
		const G = groupAt(groups, placeOf.genre[film]);
		// Fractional places in both orders, for a needle that glides.
		const pd = mode === "date" ? pos : placeOf.date[film];
		const pg = mode === "genre" ? pos : placeOf.genre[film];
		const i0 = Math.floor(pg);
		const i1 = Math.min(N - 1, i0 + 1);
		const thG = lerp(genreAngle(groups, g.arcs, i0), genreAngle(groups, g.arcs, i1), pg - i0);
		const eb = easeOut(blend);
		const tickOp = 1 - smoothstep(blend, 0.35, 0.9);
		const capOp = smoothstep(blend, 0.45, 1);

		// Only the ticks in sight are moved: one faded out is set to 0 once and
		// then left alone until it comes back (about 30 of them show at a time).
		for (let i = 0; i < N; i++) {
			const thD = (placeOf.date[i] - pd) * pitch;
			const th = eb === 0 ? thD : lerp(thD, genreAngle(groups, g.arcs, placeOf.genre[i]), eb);
			const op = (1 - smoothstep(Math.abs(th), span * 0.7, span * 1.15)) * tickOp;
			if (op === 0) {
				if (tickLit[i]) {
					ticks[i].style.opacity = "0";
					tickLit[i] = false;
				}
				continue;
			}
			tickLit[i] = true;
			const inner = majors.has(i) || up[i] ? g.rMaj : g.rIn;
			line(ticks[i], pt(g, th, g.R), pt(g, th, inner));
			ticks[i].style.opacity = op.toFixed(3);
		}

		// The capsules' arcs change only with the card's size.
		if (capsDrawn !== g) {
			capsDrawn = g;
			groups.forEach((_, k) => {
				const c = g.arcs[k];
				caps[k].setAttribute("d", arcPath(g, c.a0, c.a1, g.capR));
				caps[k].setAttribute("stroke-width", String(GAUGE.capW * g.u));
			});
		}
		groups.forEach((H, k) => {
			caps[k].style.opacity = capOp.toFixed(3);
			caps[k].toggleAttribute("data-on", H === G);
		});

		// NOW: between the last film seen and the first booked, DATE only.
		const thNow = (seen - 0.5 - pd) * pitch;
		const [nx, ny] = pt(g, thNow, g.R + 4 * g.u);
		nowDot.setAttribute("cx", nx.toFixed(2));
		nowDot.setAttribute("cy", ny.toFixed(2));
		nowDot.setAttribute("r", String(2 * g.u));
		nowDot.style.opacity =
			seen < N ? ((1 - smoothstep(Math.abs(thNow), span * 0.7, span)) * (1 - blend)).toFixed(3) : "0";

		// DATE: the fixed needle across the ticks. GENRE: a notch cut into the
		// current capsule, at the film's place in it.
		const needleOp = (1 - smoothstep(blend, 0.15, 0.55)).toFixed(3);
		const thN = lerp(0, thG, eb);
		line(needle, pt(g, thN, g.R + 3 * g.u), pt(g, thN, g.rMaj - 4 * g.u));
		line(halo, pt(g, thN, g.R + 3 * g.u), pt(g, thN, g.rMaj - 4 * g.u));
		needle.style.opacity = needleOp;
		halo.style.opacity = needleOp;
		halo.setAttribute("stroke-width", String(5 * g.u));
		needle.setAttribute("stroke-width", String(2 * g.u));
		const reach = (GAUGE.capW / 2 - 2) * g.u;
		line(notch, pt(g, thG, g.capR + reach), pt(g, thG, g.capR - reach));
		notch.setAttribute("stroke-width", String(Math.max(1.5, 1.6 * g.u)));
		notch.style.opacity = smoothstep(blend, 0.5, 1).toFixed(3);
	};

	/* ── the caption ── */
	const paintReadout = (fade = false) => {
		const at = active;
		const fi = orderOf[mode][at];
		const f = films[fi];
		let html: string;
		let lit = false;
		if (mode === "genre" && !roIdle) {
			const G = groupAt(groups, at);
			readout.style.setProperty("--gc", genreVar(G.g));
			html = words(genreWords(G, at), "wx-amc-gname");
		} else if (up[fi] && !roIdle) {
			lit = true;
			html = words(countdownWords(daysUntil(f.d, today)));
		} else {
			html = words(dateWords(f.d));
		}
		const apply = () => {
			readout.toggleAttribute("data-up", lit);
			readout.dataset.mode = mode === "genre" && !roIdle ? "genre" : "date";
			readout.innerHTML = html;
		};
		if (!fade || reduce || !readout.animate) return apply();
		readout.getAnimations().forEach((a) => a.cancel());
		readout.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 110, easing: "ease-in" }).onfinish = () => {
			apply();
			readout.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: "ease-out" });
		};
	};

	const setActive = () => {
		const f = films[orderOf[mode][active]];
		scrub.setAttribute("aria-valuenow", String(active + 1));
		const [dow, md, yr] = dateWords(f.d);
		scrub.setAttribute("aria-valuetext", `${f.n}, ${dow} ${md} ${yr.replace("’", "20")}`);
		title.textContent = f.n;
		title.href = f.h;
		title.title = `${f.n} on IMDb`;
		roIdle = false;
		paintReadout();
	};

	// Any movement brings GENRE's "N OF M" back; stillness settles it on the date.
	const poke = () => {
		clearTimeout(idleTimer);
		if (roIdle) {
			roIdle = false;
			paintReadout(true);
		}
		if (mode === "genre") {
			idleTimer = window.setTimeout(() => {
				roIdle = true;
				paintReadout(true);
			}, IDLE_MS);
		}
	};

	const render = () => {
		if (shuffling || !geo) return;
		const idx = placeOf[mode];
		place((i) => idx[i] - pos);
		const r = Math.round(pos);
		if (r !== active) {
			active = r;
			setActive();
		}
		drawGauge();
		poke();
	};

	/* ── moving ── */
	/** Where a glide is headed, so keys pressed during it step on from there. */
	let goal: number | null = null;
	const here = () => goal ?? Math.round(pos);

	/** Stops whatever is animating. A shuffle cut short lands where it was
	 *  going, unless `keepBlend` (a re-toggle, which morphs on from here). */
	const stop = (keepBlend = false) => {
		cancelAnimationFrame(raf);
		goal = null;
		if (shuffling) {
			shuffling = false;
			if (!keepBlend) blend = mode === "genre" ? 1 : 0;
			if (relayoutPending) relayout();
		}
	};
	const clamp = (x: number) => Math.max(0, Math.min(N - 1, x));
	const setPos = (x: number) => {
		pos = clamp(x);
		render();
	};
	const animateTo = (target: number) => {
		stop();
		target = clamp(target);
		if (reduce) return setPos(target);
		goal = target;
		const from = pos;
		const t0 = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - t0) / MOVE_MS);
			setPos(from + (target - from) * easeOut(t));
			if (t < 1) raf = requestAnimationFrame(step);
			else goal = null;
		};
		raf = requestAnimationFrame(step);
	};
	/** To the start of this genre (going back, from inside it) or the next
	 *  one, counting from `at`. */
	const jumpGenre = (dir: number, at = here()) => {
		const G = groupAt(groups, at);
		if (dir < 0 && at > G.start) return animateTo(G.start);
		const k = G.k + dir;
		animateTo(k < 0 ? 0 : k >= groups.length ? N - 1 : groups[k].start);
	};

	/* ── the mode ── */
	const setHeader = () => {
		// A toggle, as the card flips are (CONVENTIONS → HitArea): one name,
		// "Sort by genre", and aria-pressed says whether it is. The glyph shows
		// the mode the card is in (CSS, on data-mode).
		modeBtn.setAttribute("aria-pressed", String(mode === "genre"));
		widget.dataset.mode = mode;
	};
	const setMode = (next: Mode) => {
		if (next === mode) return;
		// From wherever everything is right now: the posters' live offsets (mid
		// glide or mid shuffle), and the gauge's live blend.
		const before = shown.slice();
		stop(true);
		const film = orderOf[mode][Math.round(pos)];
		mode = next;
		pos = placeOf[mode][film];
		const after = films.map((_, i) => placeOf[mode][i] - pos);
		const b0 = blend;
		const b1 = mode === "genre" ? 1 : 0;
		setHeader();
		active = Math.round(pos);
		setActive();
		if (reduce || !geo) {
			blend = b1;
			return render();
		}
		// FLIP along the arc: every poster slides from its old place to its new
		// one (clamped to just off the fan, so far films don't sweep through),
		// those that move hopping a little; the gauge morphs alongside.
		const lim = FAN.visible + 0.3;
		const C = (x: number) => Math.max(-lim, Math.min(lim, x));
		const t0 = performance.now();
		const hop = 10 * geo.u;
		shuffling = true;
		const step = (now: number) => {
			const t = Math.min(1, (now - t0) / MORPH_MS);
			const e = easeOut(t);
			place(
				(i) => C(before[i]) + (C(after[i]) - C(before[i])) * e,
				(i) => (Math.abs(before[i] - after[i]) < 1e-3 ? 0 : Math.sin(Math.PI * Math.min(1, t * 1.4)) * hop),
			);
			blend = lerp(b0, b1, t);
			drawGauge();
			if (t < 1) raf = requestAnimationFrame(step);
			else {
				shuffling = false;
				blend = b1;
				if (relayoutPending) relayout();
				else render();
			}
		};
		raf = requestAnimationFrame(step);
	};
	on(modeBtn, "click", () => setMode(mode === "date" ? "genre" : "date"));

	/* ── the gauge as a slider. DATE: drag the scale under the needle (a tap
	   jumps to the tick under it). GENRE: absolute, along the capsules. ── */
	/** The band's left edge, read once a drag (it doesn't move during one), so
	 *  a pointermove never forces the layout the last frame's writes dirtied. */
	let scrubLeft = 0;
	const trackX = (e: PointerEvent) => e.clientX - scrubLeft;
	const fromX = (x: number, p0: number, x0: number) => {
		if (!geo) return p0;
		if (mode === "date") return p0 - (x - x0) / (geo.R * GAUGE.pitch * DEG);
		const th = Math.asin(Math.max(-1, Math.min(1, (x - geo.cx) / geo.capR)));
		return placeAtAngle(groups, geo.arcs, th, N);
	};
	on(scrub, "pointerdown", (e) => {
		if (e.button !== 0) return;
		stop();
		scrub.setPointerCapture(e.pointerId);
		scrubLeft = scrub.getBoundingClientRect().left;
		const x0 = trackX(e);
		const p0 = pos;
		let moved = false;
		if (mode === "genre") setPos(fromX(x0, p0, x0));
		const move = (ev: PointerEvent) => {
			const x = trackX(ev);
			if (Math.abs(x - x0) > 3) moved = true;
			if (moved || mode === "genre") setPos(fromX(x, p0, x0));
		};
		const end = (ev: PointerEvent) => {
			scrub.removeEventListener("pointermove", move);
			scrub.removeEventListener("pointerup", end);
			scrub.removeEventListener("pointercancel", end);
			if (mode === "date" && !moved && geo) {
				return animateTo(Math.round(p0 + (trackX(ev) - geo.cx) / (geo.R * GAUGE.pitch * DEG)));
			}
			animateTo(Math.round(pos));
		};
		scrub.addEventListener("pointermove", move);
		scrub.addEventListener("pointerup", end);
		scrub.addEventListener("pointercancel", end);
	});
	on(scrub, "keydown", (e) => {
		if (e.key === "Enter") {
			e.preventDefault();
			window.open(title.href, "_blank", "noopener");
			return;
		}
		if (mode === "genre" && (e.key === "PageUp" || e.key === "PageDown" || (e.shiftKey && e.key.startsWith("Arrow")))) {
			e.preventDefault();
			return jumpGenre(e.key === "PageUp" || e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1);
		}
		const next = stepFromKey(e, here(), N - 1);
		if (next === null) return;
		e.preventDefault();
		animateTo(next);
	});

	/* ── the fan: drag it; tap a side poster to bring it in, the centre one
	   for IMDb; in GENRE a flick jumps a genre ── */
	on(fan, "pointerdown", (e) => {
		if (e.button !== 0 || !geo) return;
		stop();
		const x0 = e.clientX;
		const p0 = pos;
		let moved = false;
		let vx = 0;
		let lx = e.clientX;
		let lt = performance.now();
		const pitch = (FAN.R * geo.u + geo.pw * 0.75) * Math.sin(FAN.step * DEG);
		fan.setPointerCapture(e.pointerId);
		const move = (ev: PointerEvent) => {
			const dx = ev.clientX - x0;
			if (Math.abs(dx) > 4) moved = true;
			const now = performance.now();
			vx = (ev.clientX - lx) / Math.max(1, now - lt);
			lx = ev.clientX;
			lt = now;
			if (moved) setPos(p0 - dx / pitch);
		};
		const end = (ev: PointerEvent) => {
			fan.removeEventListener("pointermove", move);
			fan.removeEventListener("pointerup", end);
			fan.removeEventListener("pointercancel", end);
			if (moved) {
				// A flick: the next genre on from where the drag began, glided to
				// from where the posters are now.
				if (mode === "genre" && Math.abs(vx) > 0.5) jumpGenre(vx < 0 ? 1 : -1, Math.round(p0));
				else animateTo(Math.round(pos));
				return;
			}
			if (ev.type === "pointercancel") return;
			const hit = document
				.elementsFromPoint(ev.clientX, ev.clientY)
				.find((n) => n instanceof HTMLElement && n.classList.contains("wx-amc-card"));
			if (!hit) return;
			const at = placeOf[mode][Number((hit as HTMLElement).dataset.film)];
			if (at === Math.round(pos)) window.open(films[orderOf[mode][at]].h, "_blank", "noopener");
			else animateTo(at);
		};
		fan.addEventListener("pointermove", move);
		fan.addEventListener("pointerup", end);
		fan.addEventListener("pointercancel", end);
	});
	let wheelTimer = 0;
	on(
		fan,
		"wheel",
		(e) => {
			if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
			e.preventDefault();
			stop();
			setPos(pos + e.deltaX / 60);
			clearTimeout(wheelTimer);
			wheelTimer = window.setTimeout(() => animateTo(Math.round(pos)), 120);
		},
		{ passive: false },
	);

	/* ── prefetch on intent: the first hover, focus or touch on the card warms
	   every poster, nearest the centre first, a few at a time, so a held
	   arrow key or a fast drag finds them decoded (on 4G, posters asked for
	   only as they reach the fan were blank most of the way). Never on load,
	   and never under Save-Data. Each decoded image is kept (by film), so the
	   browser holds on to it. ── */
	const warm = new Map<number, HTMLImageElement>();
	const prefetch = () => {
		if (widget.dataset.prefetch) return;
		const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
		widget.dataset.prefetch = saveData ? "off" : "on";
		if (saveData) return;
		const at = placeOf[mode];
		const centre = pos;
		const seenUrl = new Set<string>();
		const queue = films
			.map((f, i) => ({ i, url: f.p, d: Math.abs(at[i] - centre) }))
			.filter((q): q is { i: number; url: string; d: number } => {
				if (!q.url || seenUrl.has(q.url) || decoded.has(q.url) || failed.has(q.url)) return false;
				seenUrl.add(q.url);
				return true;
			})
			.sort((a, b) => a.d - b.d);
		const worker = async () => {
			for (let q = queue.shift(); q && !ac.signal.aborted; q = queue.shift()) {
				const img = new Image();
				img.decoding = "async";
				img.src = q.url;
				try {
					await img.decode();
					decoded.add(q.url);
					warm.set(q.i, img);
				} catch {
					failed.add(q.url);
				}
			}
		};
		for (let k = 0; k < PREFETCH_CONCURRENCY; k++) void worker();
	};
	for (const type of ["pointerenter", "focusin", "touchstart"] as const) {
		on(widget, type, prefetch, { once: true, passive: true });
	}

	/* ── layout, now and whenever the card resizes or the face lands ── */
	// A resize mid-shuffle waits for the shuffle to end (or be cut short).
	let relayoutPending = false;
	function relayout() {
		if (shuffling) {
			relayoutPending = true;
			return;
		}
		relayoutPending = false;
		geo = measure();
		active = -1;
		render();
	}
	scrub.setAttribute("aria-valuemin", "1");
	scrub.setAttribute("aria-valuemax", String(N));
	setHeader();
	relayout();
	const ro = new ResizeObserver(relayout);
	ro.observe(body);
	document.fonts?.ready.then(() => !ac.signal.aborted && relayout());
	widget.dataset.ready = "";

	return {
		setMode,
		setPos,
		/** The film at the centre. */
		get current() {
			return films[orderOf[mode][Math.round(pos)]];
		},
		destroy() {
			ac.abort();
			ro.disconnect();
			cancelAnimationFrame(raf);
			clearTimeout(idleTimer);
			clearTimeout(wheelTimer);
			readout.getAnimations?.().forEach((a) => a.cancel());
			delete widget.dataset.ready;
			delete widget.dataset.prefetch;
			warm.clear();
		},
	};
}
