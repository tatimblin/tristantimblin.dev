/**
 * `fan` — a split or a merge (family D): one input line in the accent
 * meeting a node, and `n` cubic branches in the paint fanning from it to
 * the far edge (split, 1 → n) or gathering into it from the near edge
 * (merge, n → 1, the split mirrored). The branches are ONE path, a
 * subpath each, so any `n` is three elements.
 *
 *   fan()                                   a red line splitting into four blue branches
 *   fan(3, { dir: "merge" })                three branches gathering into one
 *   fan(6, { dotted: true })                the dotted spread: dim dotted guides from a red node
 *
 * Ranges: `n` 2–8 (an integer). `dotted` draws the branches as hair-weight
 * dotted guides, and their default paint is then `dim`; solid, `blue`.
 * `accent` paints the input line and the node, `red` unless said; `none`
 * leaves both out (the branches alone). Every `n` stays on the 48 × 32
 * viewBox: eight branches still read apart (3 units between their ends),
 * and a wide fan was mostly empty input line.
 */

import { round } from "../geometry";
import { ACCENT_PAINTS, type AccentPaint, type Drawing, GEN_PAINTS, type GenPaint, K, SAFE, clampInt, drawing, paintOf } from "./base";

export type FanDir = "split" | "merge";

export const FAN_DIRS: readonly FanDir[] = Object.freeze(["split", "merge"]);

export interface FanOpts {
	/** split (1 → n, the default) or merge (n → 1) */
	dir?: FanDir;
	/** the branches as dim dotted guides — the dotted spread */
	dotted?: boolean;
	/** the branches: `dim` when dotted, `blue` when solid, unless said */
	paint?: GenPaint;
	/** the input line and its node; red unless said */
	accent?: AccentPaint;
}

/** The node's radius, and where it sits along the width (a split's; a merge's is mirrored). */
const NODE_R = 1.5;
const NODE_AT = 0.35;

export function fan(n = 4, o: FanOpts = {}): Drawing {
	const count = clampInt(n, 2, 8, 4);
	const dir: FanDir = FAN_DIRS.includes(o.dir as FanDir) ? (o.dir as FanDir) : "split";
	const dotted = o.dotted === true;
	const paint = paintOf(o.paint, GEN_PAINTS, dotted ? "dim" : "blue");
	const accent = paintOf(o.accent, ACCENT_PAINTS, "red");
	const { x0, x1, cy } = SAFE;
	const [top, bottom] = [SAFE.y0 + 2, SAFE.y1 - 2];
	const span = x1 - x0;
	// a split: in at x0, the node, branches out to x1; a merge mirrors every x
	const X = (x: number) => round(dir === "split" ? x : x0 + x1 - x);
	const node = x0 + span * NODE_AT;
	const reach = x1 - node;
	const d = Array.from({ length: count }, (_, i) => {
		const y = round(top + ((bottom - top) * i) / (count - 1));
		return `M ${X(node)} ${cy} C ${X(node + reach * 0.4)} ${cy} ${X(node + reach * 0.45)} ${y} ${X(x1)} ${y}`;
	}).join(" ");
	const children = [K.path(d, dotted ? { paint, weight: "hair", dash: "dotted" } : { paint })];
	if (accent !== "none") {
		children.unshift(K.line(X(x0), cy, X(node), cy, { paint: accent }));
		children.push(K.dot(X(node), cy, NODE_R, { paint: accent }));
	}
	return drawing(children);
}
