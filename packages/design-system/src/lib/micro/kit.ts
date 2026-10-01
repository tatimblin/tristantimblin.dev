/**
 * The L0 kit: geometry functions that emit SVG element strings with the
 * drawing language's discipline baked in — every stroke non-scaling and of
 * a legal weight, every fill stated, every colour a token the target's
 * validator profile allows. A glyph recipe, a generator and a scene all
 * draw with these, so the file they bake is valid by construction; the
 * validator (scripts/validate-art.mjs) remains the gate.
 *
 *   const k = kit("glyph");
 *   k.svg({ children: [k.ring(24, 16, 10, { paint: "blue" }), k.dot(24, 16, 2, { paint: "red" })] })
 *
 * Signatures read position, then size, then an options object. Angles are
 * degrees on a dial (0 up, clockwise). Every primitive returns a string —
 * one element, or several joined by newlines — and `svg()` indents them
 * into a file.
 */

import { type Point, pointsAttr, polar, round, same, spread, xy } from "./geometry";
import { type Colour, type Dash, type Fill, type Motion, type Paint, type Speed, type Target, type TargetTable, TARGETS, type Wash, WASH_MAX, type Weight } from "./paint";
import { isoBox, isoCoil, isoCylinder, isoEllipse, isoPlane, isoRoundBox, isoRoundRect, vanishingGrid } from "./iso";
import type { IsoBoxOpts, IsoCylinderOpts, IsoEllipseOpts, IsoPlaneOpts, IsoRoundBoxOpts, VanishingGridOpts } from "./iso";
import { bracketLabel, readout, rule, section, text } from "./type";
import type { BracketOpts, ReadoutOpts, RuleOpts, SectionOpts, TextOpts } from "./type";

/** How a stroke ends. `round` (the default) also rounds the joins; a circuit trace takes `butt`. */
export type Cap = "round" | "butt" | "square";

/** The options of anything stroked. */
export interface StrokeOpts {
	/** the line's paint; `ink` unless said */
	paint?: Paint;
	/** `hair` (1) or `line` (1.5); the target's default unless said — `line` on a glyph, `hair` on art, whose 1.5 is the one emphasis outline */
	weight?: Weight;
	dash?: Dash;
	cap?: Cap;
}

/** The options of a closed shape: its outline (`paint`) and its fill, `none` unless said. `paint: "none"` with a fill is a flat shape; a scene's fill may be a `wash()`. */
export interface ShapeOpts extends StrokeOpts {
	fill?: Fill;
	/** fill by the even-odd rule: a path whose second subpath cuts a hole in its first (a band, a frame, a window) */
	evenodd?: boolean;
}

/** The options of a filled mark. */
export interface FillOpts {
	/** `ink` unless said */
	paint?: Paint;
}

/** What a wire ends in. */
export type End = "none" | "dot" | "terminal";

export interface WireOpts extends StrokeOpts {
	/** the elbows' radius (3 unless said), clamped to half the shorter leg */
	radius?: number;
	start?: End;
	end?: End;
}

export interface TicksOpts extends StrokeOpts {
	/** a linear tick astride its baseline rather than on one side of it */
	centred?: boolean;
}

export interface NeedleOpts extends StrokeOpts {
	/** the pivot dot's radius; 0 for none */
	hub?: number;
}

export interface BandOpts extends FillOpts {
	/** `round` (the default) caps each end with a half-disc; `butt` cuts it square */
	cap?: "round" | "butt";
}

export interface AngleOpts extends ShapeOpts {
	/** where the first vertex points, degrees on the dial; 0 (up) unless said */
	angle?: number;
}

export interface GroupOpts {
	/** the group's one motion, per the shared data-motion contract */
	motion?: Motion;
	speed?: Speed;
	/** a transform; with a motion it goes on an outer group, as the contract requires */
	transform?: string;
}

export interface SvgOpts {
	/** the target's default unless said (a glyph may also be `0 0 96 32` / `0 0 96 64`) */
	viewBox?: string;
	children: string | readonly string[];
	/** a comment on the first line — `baked from recipes/x.ts — edit the recipe` */
	header?: string;
}

/** A corner of a frame, for a bracket. */
export type Corner = "tl" | "tr" | "bl" | "br";

const NL = "\n";
const join = (parts: readonly string[]): string => parts.filter(Boolean).join(NL);
const indent = (s: string): string => s.split(NL).map((l) => (l ? `  ${l}` : l)).join(NL);
const dist = (p: Point, q: Point): number => Math.hypot(q[0] - p[0], q[1] - p[1]);
/** The `d` of an arc from `a` to `b` on an `rx`×`ry` ellipse. */
const arcTo = (rx: number, ry: number, large: 0 | 1, sweep: 0 | 1, to: Point): string =>
	`A ${round(rx)} ${round(ry)} 0 ${large} ${sweep} ${xy(to)}`;

/** The kit for one target. Make one with `kit()`. */
export class Kit {
	readonly target: Target;
	private readonly t: TargetTable;

	constructor(target: Target) {
		this.target = target;
		this.t = TARGETS[target];
	}

	/** The string the target writes for a paint name. */
	paint(p: Paint): string {
		return this.t.paints[p];
	}

	/**
	 * A wash: `colour` mixed down to `pct` percent over transparent, for a
	 * shape's `fill` — an ocean, a band, a haze. The scene profile's one
	 * translucency (1–25%, fill only; the scene kit's to use — art and
	 * glyph's profiles refuse it, whichever kit wrote it), written as
	 * the one form the validator reads: `color-mix(in oklab, var(--art-cyan)
	 * 22%, transparent)`. The percent is held to a whole number in range.
	 */
	wash(colour: Colour, pct: number): Wash {
		return { wash: colour, pct: Math.min(WASH_MAX, Math.max(1, Math.round(pct))) };
	}

	/** The string the target writes for a fill: a paint, or a wash. */
	fill(f: Fill): string {
		return typeof f === "string" ? this.paint(f) : `color-mix(in oklab, ${this.paint(f.wash)} ${f.pct}%, transparent)`;
	}

	/** The stroke-dasharray the target writes for a dash name; a name the target's profile has no array for throws. */
	dash(d: Dash): string {
		const array = this.t.dashes[d];
		if (array === undefined) throw new Error(`the ${this.target} kit has no "${d}" dash (${Object.keys(this.t.dashes).join(", ")})`);
		return array;
	}

	/** The target's default viewBox. */
	get viewBox(): string {
		return this.t.viewBox;
	}

	/**
	 * The presentation attributes of a shape: the fill, and when `paint`
	 * is not `none`, a complete stroke — colour, weight (and art's class),
	 * vector-effect, caps and dash — so the element is valid on its own.
	 */
	attrs(o: StrokeOpts & { evenodd?: boolean } = {}, fill: Fill = "none"): string {
		const { paint = "ink", weight = this.t.weight, dash, cap = "round", evenodd } = o;
		const out = [`fill="${this.fill(fill)}"`];
		if (evenodd) out.push('fill-rule="evenodd"');
		if (paint !== "none") {
			const w = this.t.weights[weight];
			out.push(`stroke="${this.paint(paint)}"`, `stroke-width="${w.width}"`);
			if (w.class) out.push(`class="${w.class}"`);
			out.push('vector-effect="non-scaling-stroke"');
			if (cap === "round") out.push('stroke-linecap="round"', 'stroke-linejoin="round"');
			else if (cap === "square") out.push('stroke-linecap="square"');
			if (dash) out.push(`stroke-dasharray="${this.dash(dash)}"`);
		}
		return out.join(" ");
	}

	// --- points -----------------------------------------------------------

	/** A filled dot; `r` is the target's terminal dot (1.5 on a glyph, 2.5 on art) unless said. */
	dot(x: number, y: number, r = this.t.ends.dot, o: FillOpts = {}): string {
		return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(r)}" fill="${this.paint(o.paint ?? "ink")}" />`;
	}

	/** A hollow dot: a stroked circle with no fill. */
	pip(x: number, y: number, r = 2, o: StrokeOpts = {}): string {
		return `<circle cx="${round(x)}" cy="${round(y)}" r="${round(r)}" ${this.attrs(o)} />`;
	}

	/** A square terminal of side `size` centred on `(x, y)`; hollow unless it says `fill`. */
	terminal(x: number, y: number, size = this.t.ends.terminal, o: ShapeOpts = {}): string {
		return this.rect(x - size / 2, y - size / 2, size, size, { cap: "butt", ...o });
	}

	// --- lines ------------------------------------------------------------

	line(x1: number, y1: number, x2: number, y2: number, o: StrokeOpts = {}): string {
		return `<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" ${this.attrs(o)} />`;
	}

	polyline(points: readonly Point[], o: StrokeOpts = {}): string {
		return `<polyline points="${pointsAttr(points)}" ${this.attrs(o)} />`;
	}

	/** A path from a `d` you wrote; the kit adds the paint and stroke discipline, not the rounding. */
	path(d: string, o: ShapeOpts = {}): string {
		return `<path d="${d}" ${this.attrs(o, o.fill)} />`;
	}

	/** A dotted guide: dim, hair, round-capped dots. Options override. */
	guide(points: readonly Point[], o: StrokeOpts = {}): string {
		return this.polyline(points, { paint: "dim", weight: "hair", dash: "dotted", ...o });
	}

	/**
	 * A wire through `points` with a rounded elbow at every corner, and a
	 * dot or square terminal at either end when asked. Legs are usually
	 * orthogonal; any angle rounds the same way.
	 */
	wire(points: readonly Point[], o: WireOpts = {}): string {
		const { radius = 3, start = "none", end = "none", ...stroke } = o;
		if (points.length < 2) throw new Error("a wire needs two points or more");
		let d = `M ${xy(points[0])}`;
		for (let i = 1; i < points.length - 1; i++) {
			const [prev, p, next] = [points[i - 1], points[i], points[i + 1]];
			const r = Math.min(radius, dist(prev, p) / 2, dist(p, next) / 2);
			const a = towards(p, prev, r);
			const b = towards(p, next, r);
			d += ` L ${xy(a)} Q ${xy(p)} ${xy(b)}`;
		}
		d += ` L ${xy(points[points.length - 1])}`;
		const paint = stroke.paint ?? "ink";
		return join([
			this.path(d, { cap: "butt", ...stroke }),
			this.end(points[0], start, paint),
			this.end(points[points.length - 1], end, paint),
		]);
	}

	/** A callout line from `from` to `to`, ending in a dot at `to`. */
	leader(from: Point, to: Point, o: StrokeOpts = {}): string {
		return join([this.line(from[0], from[1], to[0], to[1], o), this.dot(to[0], to[1], this.t.ends.dot, { paint: o.paint ?? "ink" })]);
	}

	private end(at: Point, kind: End, paint: Paint): string {
		if (kind === "dot") return this.dot(at[0], at[1], this.t.ends.dot, { paint });
		if (kind === "terminal") return this.terminal(at[0], at[1], this.t.ends.terminal, { paint });
		return "";
	}

	// --- curves -----------------------------------------------------------

	/** An open arc of radius `r` from `a0` to `a1`, clockwise when `a1 > a0`. A full turn or more is a ring. */
	arc(cx: number, cy: number, r: number, a0: number, a1: number, o: StrokeOpts = {}): string {
		const span = a1 - a0;
		if (Math.abs(span) >= 360) return this.ring(cx, cy, r, o);
		const large = Math.abs(span) > 180 ? 1 : 0;
		const sweep = span > 0 ? 1 : 0;
		return this.path(`M ${xy(polar(cx, cy, r, a0))} ${arcTo(r, r, large, sweep, polar(cx, cy, r, a1))}`, o);
	}

	/** A circle: an outline unless it says `fill`. */
	ring(cx: number, cy: number, r: number, o: ShapeOpts = {}): string {
		return `<circle cx="${round(cx)}" cy="${round(cy)}" r="${round(r)}" ${this.attrs(o, o.fill)} />`;
	}

	/**
	 * A filled annular sector between radii `r0 < r1` from `a0` to `a1` —
	 * a gauge's track and its fill. A thick line is a shape, never a wide
	 * stroke; one path, its ends half-discs unless `cap: "butt"`.
	 */
	band(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, o: BandOpts = {}): string {
		const { paint = "ink", cap = "round" } = o;
		const span = a1 - a0;
		const large = Math.abs(span) > 180 ? 1 : 0;
		const sweep = span > 0 ? 1 : 0;
		const back = sweep ? 0 : 1;
		const w = (r1 - r0) / 2;
		const [A, B] = [polar(cx, cy, r1, a0), polar(cx, cy, r1, a1)];
		const [C, D] = [polar(cx, cy, r0, a1), polar(cx, cy, r0, a0)];
		const capTo = (to: Point) => (cap === "round" ? arcTo(w, w, 0, sweep, to) : `L ${xy(to)}`);
		const d = `M ${xy(A)} ${arcTo(r1, r1, large, sweep, B)} ${capTo(C)} ${arcTo(r0, r0, large, back, D)} ${capTo(A)} Z`;
		return `<path d="${d}" fill="${this.paint(paint)}" />`;
	}

	// --- marks ------------------------------------------------------------

	/** An open V of two legs of `size`, its tip at `(x, y)`, pointing at `angle`; the legs `spread` degrees off the axis. */
	chevron(x: number, y: number, angle: number, size = 3, o: StrokeOpts & { spread?: number } = {}): string {
		const { spread: s = 45, ...stroke } = o;
		return this.polyline([polar(x, y, size, angle + 180 - s), [x, y], polar(x, y, size, angle + 180 + s)], stroke);
	}

	/** A narrow chevron for the end of a line: the tip at `(x, y)`, pointing at `angle`. */
	arrowhead(x: number, y: number, angle: number, size = 3, o: StrokeOpts = {}): string {
		return this.chevron(x, y, angle, size, { spread: 35, ...o });
	}

	/** A `+` of `size` across, centred: one path. */
	plus(x: number, y: number, size: number, o: StrokeOpts = {}): string {
		const h = size / 2;
		return this.path(`M ${round(x - h)} ${round(y)} H ${round(x + h)} M ${round(x)} ${round(y - h)} V ${round(y + h)}`, o);
	}

	/** An `×` of `size` across, centred: one path. */
	cross(x: number, y: number, size: number, o: StrokeOpts = {}): string {
		const h = size / 2;
		const [l, r, t, b] = [round(x - h), round(x + h), round(y - h), round(y + h)];
		return this.path(`M ${l} ${t} L ${r} ${b} M ${r} ${t} L ${l} ${b}`, o);
	}

	/** A check mark in a `size` box centred on `(x, y)`, its short leg at the left. */
	check(x: number, y: number, size: number, o: StrokeOpts = {}): string {
		const h = size / 2;
		return this.polyline([[x - h, y], [x - h * 0.3, y + h * 0.7], [x + h, y - h * 0.7]], o);
	}

	/**
	 * `n` ticks on a dial between radii `r0` and `r1`, from `a0` to `a1`
	 * inclusive (a full turn spreads them without doubling the start): one
	 * path.
	 */
	ticksRadial(cx: number, cy: number, r0: number, r1: number, n: number, a0: number, a1: number, o: StrokeOpts = {}): string {
		const d = spread(a0, a1, n).map((a) => `M ${xy(polar(cx, cy, r0, a))} L ${xy(polar(cx, cy, r1, a))}`).join(" ");
		return this.path(d, { cap: "butt", ...o });
	}

	/**
	 * `n` ticks along the line from `(x0, y0)` to `(x1, y1)`, both ends
	 * included, each `size` long to the right of travel (below a
	 * left-to-right line); a negative `size` is the other side, `centred`
	 * astride. One path.
	 */
	ticksLinear(x0: number, y0: number, x1: number, y1: number, n: number, size: number, o: TicksOpts = {}): string {
		const { centred = false, ...stroke } = o;
		const len = Math.hypot(x1 - x0, y1 - y0) || 1;
		const [nx, ny] = [-(y1 - y0) / len, (x1 - x0) / len];
		const [from, to] = centred ? [-size / 2, size / 2] : [0, size];
		const d = Array.from({ length: n }, (_, i) => {
			const t = n === 1 ? 0 : i / (n - 1);
			const [bx, by] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
			return `M ${xy([bx + nx * from, by + ny * from])} L ${xy([bx + nx * to, by + ny * to])}`;
		}).join(" ");
		return this.path(d, { cap: "butt", ...stroke });
	}

	/** A dial's needle of length `r` from the pivot at `(cx, cy)` pointing at `angle`, with a hub dot. */
	needle(cx: number, cy: number, r: number, angle: number, o: NeedleOpts = {}): string {
		const { hub = 1.5, ...stroke } = o;
		const [x, y] = polar(cx, cy, r, angle);
		return join([this.line(cx, cy, x, y, stroke), hub > 0 ? this.dot(cx, cy, hub, { paint: stroke.paint ?? "ink" }) : ""]);
	}

	// --- shapes -----------------------------------------------------------

	polygon(points: readonly Point[], o: ShapeOpts = {}): string {
		return `<polygon points="${pointsAttr(points)}" ${this.attrs(o, o.fill)} />`;
	}

	/** An equilateral triangle inscribed in radius `r`, one vertex at `angle` (0 up unless said). */
	tri(cx: number, cy: number, r: number, o: AngleOpts = {}): string {
		const { angle = 0, ...shape } = o;
		return this.polygon([0, 120, 240].map((a) => polar(cx, cy, r, angle + a)), shape);
	}

	rect(x: number, y: number, w: number, h: number, o: ShapeOpts = {}): string {
		return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" ${this.attrs(o, o.fill)} />`;
	}

	roundRect(x: number, y: number, w: number, h: number, r: number, o: ShapeOpts = {}): string {
		return `<rect x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${round(r)}" ${this.attrs(o, o.fill)} />`;
	}

	/** A pill: a rect with fully round ends. */
	pill(x: number, y: number, w: number, h: number, o: ShapeOpts = {}): string {
		return this.roundRect(x, y, w, h, Math.min(w, h) / 2, o);
	}

	/** A keycap: the tile's rounded frame, dim and hair unless said, corner radius `r` (2 unless said). */
	keycap(x: number, y: number, w: number, h: number, o: ShapeOpts & { r?: number } = {}): string {
		const { r = 2, ...shape } = o;
		return this.roundRect(x, y, w, h, r, { paint: "dim", weight: "hair", ...shape });
	}

	/** An L of two `size` arms at the `corner` of a frame whose corner point is `(x, y)`: a registration mark. */
	bracket(x: number, y: number, size: number, corner: Corner, o: StrokeOpts = {}): string {
		const dx = corner.endsWith("l") ? size : -size;
		const dy = corner.startsWith("t") ? size : -size;
		return this.path(`M ${round(x + dx)} ${round(y)} L ${round(x)} ${round(y)} L ${round(x)} ${round(y + dy)}`, { cap: "butt", ...o });
	}

	/** A hexagon of circumradius `r`, a vertex at `angle` (0 up — pointy top — unless said). */
	hex(cx: number, cy: number, r: number, o: AngleOpts = {}): string {
		const { angle = 0, ...shape } = o;
		return this.polygon(spread(angle, angle + 360, 6).map((a) => polar(cx, cy, r, a)), shape);
	}

	/** An `n`-pointed star between radii `inner` and `outer`, a point at `angle`: the spiky distortion ring. */
	star(cx: number, cy: number, n: number, inner: number, outer: number, o: AngleOpts = {}): string {
		const { angle = 0, ...shape } = o;
		const pts = spread(angle, angle + 360, n * 2).map((a, i) => polar(cx, cy, i % 2 ? inner : outer, a));
		return this.polygon(pts, shape);
	}

	/**
	 * A spring: `turns` loops of radius `r` fitted along `length` to the
	 * right of `(x, y)`, its axis. One path of cubic curves (four a turn),
	 * each loop leaning back over the last as a coil seen from the side.
	 */
	coil(x: number, y: number, length: number, turns: number, r: number, o: StrokeOpts = {}): string {
		const segs = Math.max(1, Math.round(turns * 4));
		const T = turns * 2 * Math.PI;
		const a = length / T;
		const b = 0.8 * r;
		// The loops lean past both ends of the axis; scale x so the whole coil fits `length`.
		const lean = b > a ? Math.acos(a / b) : 0;
		const over = b > a ? b * Math.sin(lean) - a * lean : 0;
		const sx = length / (length + 2 * over);
		const at = (t: number): Point => [x + sx * (over + a * t - b * Math.sin(t)), y - r * Math.cos(t)];
		const vel = (t: number): Point => [sx * (a - b * Math.cos(t)), r * Math.sin(t)];
		let d = `M ${xy(at(0))}`;
		for (let i = 0; i < segs; i++) {
			const [t0, t1] = [(T * i) / segs, (T * (i + 1)) / segs];
			const h = (t1 - t0) / 3;
			const [p0, p3, v0, v1] = [at(t0), at(t1), vel(t0), vel(t1)];
			d += ` C ${xy([p0[0] + v0[0] * h, p0[1] + v0[1] * h])} ${xy([p3[0] - v1[0] * h, p3[1] - v1[1] * h])} ${xy(p3)}`;
		}
		return this.path(d, o);
	}

	// --- iso and perspective (iso.ts) --------------------------------------

	/** An isometric box; see `isoBox` in iso.ts. */
	isoBox(x: number, y: number, w: number, d: number, h: number, o: IsoBoxOpts = {}): string {
		return isoBox(this, x, y, w, d, h, o);
	}

	/** An isometric cylinder, upright or lying along x or y; see `isoCylinder` in iso.ts. */
	isoCylinder(x: number, y: number, r: number, h: number, o: IsoCylinderOpts = {}): string {
		return isoCylinder(this, x, y, r, h, o);
	}

	/** A 2:1 disc on the ground or standing on the x or y face; see `isoEllipse` in iso.ts. */
	isoEllipse(x: number, y: number, r: number, o: IsoEllipseOpts = {}): string {
		return isoEllipse(this, x, y, r, o);
	}

	/** A rounded rectangle flat on the ground; see `isoRoundRect` in iso.ts. */
	isoRoundRect(x: number, y: number, w: number, d: number, c: number, o: ShapeOpts = {}): string {
		return isoRoundRect(this, x, y, w, d, c, o);
	}

	/** A box with rounded vertical edges; see `isoRoundBox` in iso.ts. */
	isoRoundBox(x: number, y: number, w: number, d: number, h: number, c: number, o: IsoRoundBoxOpts = {}): string {
		return isoRoundBox(this, x, y, w, d, h, c, o);
	}

	/** A spring standing on the ground; see `isoCoil` in iso.ts. */
	isoCoil(x: number, y: number, r: number, h: number, turns: number, o: StrokeOpts = {}): string {
		return isoCoil(this, x, y, r, h, turns, o);
	}

	/** An isometric ground plane; see `isoPlane` in iso.ts. */
	isoPlane(x: number, y: number, w: number, d: number, o: IsoPlaneOpts = {}): string {
		return isoPlane(this, x, y, w, d, o);
	}

	/** A one-point perspective grid; see `vanishingGrid` in iso.ts. */
	vanishingGrid(vx: number, vy: number, width: number, height: number, rows: number, cols: number, o: VanishingGridOpts = {}): string {
		return vanishingGrid(this, vx, vy, width, height, rows, cols, o);
	}

	// --- type and the module sheet (type.ts; art and scene only) -----------

	/** Words at `(x, y)`, the baseline, in a voice; see `text` in type.ts. The glyph kit throws. */
	text(x: number, y: number, words: string, o: TextOpts = {}): string {
		return text(this, x, y, words, o);
	}

	/** A horizontal rule, solid or `dotted`; see `rule` in type.ts. */
	rule(x0: number, x1: number, y: number, o: RuleOpts = {}): string {
		return rule(this, x0, x1, y, o);
	}

	/** A section head: a dotted rule with a caps title under it; see `section` in type.ts. */
	section(x: number, y: number, w: number, title: string, o: SectionOpts = {}): string {
		return section(this, x, y, w, title, o);
	}

	/** A bracketed state, `[ ACTIVE ]`; see `bracketLabel` in type.ts. */
	bracketLabel(x: number, y: number, words: string, o: BracketOpts = {}): string {
		return bracketLabel(this, x, y, words, o);
	}

	/** A big thin numeral with a label and a caption; see `readout` in type.ts. */
	readout(x: number, y: number, o: ReadoutOpts): string {
		return readout(this, x, y, o);
	}

	// --- assembly ---------------------------------------------------------

	/**
	 * A `<g>` around `children`. A `motion` marks it per the shared
	 * data-motion contract; since that group may carry no transform, a
	 * `transform` given with a motion goes on an outer group.
	 */
	group(children: string | readonly string[], o: GroupOpts = {}): string {
		const { motion, speed, transform } = o;
		const body = indent(join(typeof children === "string" ? [children] : children));
		const wrap = (attrs: string, inner: string) => `<g${attrs}>${NL}${inner}${NL}</g>`;
		const motionAttrs = motion ? ` data-motion="${motion}"${speed !== undefined ? ` data-speed="${speed}"` : ""}` : "";
		if (motion && transform) return wrap(` transform="${transform}"`, indent(wrap(motionAttrs, body)));
		return wrap(transform ? ` transform="${transform}"` : motionAttrs, body);
	}

	/** A complete file: the header comment, the root with the target's viewBox, the children indented. */
	svg(o: SvgOpts): string {
		const { viewBox = this.t.viewBox, children, header } = o;
		const body = indent(join(typeof children === "string" ? [children] : children));
		return join([
			header ? `<!-- ${header} -->` : "",
			`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">`,
			body,
			"</svg>",
		]) + NL;
	}
}

/** The point `r` from `p` towards `q` (or `p` itself when they coincide). */
function towards(p: Point, q: Point, r: number): Point {
	const d = dist(p, q);
	if (d === 0 || same(p, q)) return p;
	return [p[0] + ((q[0] - p[0]) / d) * r, p[1] + ((q[1] - p[1]) / d) * r];
}

/** The kit for a target: `kit("glyph")` for src/glyphs/, `kit("art")` for a 320×180 plate, `kit("scene")` for tools/scenes/. */
export function kit(target: Target): Kit {
	return new Kit(target);
}
