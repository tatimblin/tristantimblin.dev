/**
 * PARTS — the constructed route's adapter: a glyph recipe (src/glyphs/
 * recipes/) drawn as one part of a scene. The iso parts (family H: the
 * shells, the handset, the rotary disc, the board, the cell, the spring,
 * the screws, the joystick) are recipes on a 96×64 or 48×32 tile, all in
 * the kit's one true-30° projection, so an exploded assembly is those
 * recipes run again, each in a `<g transform="translate scale">` on the
 * scene — the geometry stays in the recipe, never copied.
 *
 *   import rotary from "@whois/design-system/glyphs/recipes/rotary";
 *   import { part } from "@whois/design-system/scenes/parts";
 *   part(k, rotary, { at: [160, 74], scale: 0.6, recolour: { lavender: "ink" } })
 *
 * A recipe takes whatever kit it is handed, so running it with the scene
 * kit already writes the scene's paints (the --art-* tokens, --art-ink-2
 * for dim, art's dashes and classes) — nothing glyph-shaped reaches the
 * file. Two things differ, and the adapter carries them:
 *
 * - WEIGHT. A glyph's unmarked stroke is `line` (1.5) and its detail
 *   `hair`; the scene kit's unmarked stroke is `hair`. Handed over as is,
 *   a part's outline would drop to its detail's weight and the hierarchy
 *   would flatten, so the part's kit defaults to `line` (`weight` to say
 *   otherwise); a stroke the recipe weighted keeps its weight.
 * - PALETTE. The H parts use all four colours between them; a scene may
 *   use three. `recolour` maps a paint to another for this part — its
 *   strokes, fills and washes — so a scene chooses its three without
 *   touching the recipe.
 *
 * `at` is where the TILE's centre lands; `scale` (1 unless said) sizes the
 * tile about it. Strokes are non-scaling, so a scaled part keeps the
 * scene's weights. Node-only, like recipe.ts: nothing that ships imports it.
 */

import type { Recipe } from "../glyphs/recipe";
import { type Point, round } from "../lib/micro/geometry";
import { Kit, type StrokeOpts } from "../lib/micro/kit";
import type { Fill, Paint, Weight } from "../lib/micro/paint";

export interface PartOpts {
	/** where the tile's centre lands on the scene */
	at: Point;
	/** the tile's scale about its centre; 1 unless said */
	scale?: number;
	/** paints swapped for this part: `{ lavender: "ink" }` */
	recolour?: Partial<Record<Paint, Paint>>;
	/** the weight of a stroke the recipe left unmarked; `line`, a glyph's own default, unless said */
	weight?: Weight;
}

/** The scene kit as a part sees it: its paints recoloured, its unmarked weight the glyph's. */
class PartKit extends Kit {
	constructor(
		target: Kit["target"],
		private readonly recolour: Partial<Record<Paint, Paint>>,
		private readonly defaultWeight: Weight,
	) {
		super(target);
	}

	override paint(p: Paint): string {
		return super.paint(this.recolour[p] ?? p);
	}

	override attrs(o: StrokeOpts = {}, fill: Fill = "none"): string {
		return super.attrs({ ...o, weight: o.weight ?? this.defaultWeight }, fill);
	}
}

/** A tile's size from a recipe's viewBox: 48×32 unless it says a wide one. */
const tileOf = (r: Recipe): [number, number] => {
	const [, , w, h] = (r.viewBox ?? "0 0 48 32").split(/\s+/).map(Number);
	return [w, h];
};

/** One recipe as a part of the scene `k` draws: its elements in a group placed by the tile's centre. */
export function part(k: Kit, r: Recipe, o: PartOpts): string {
	const { at, scale = 1, recolour = {}, weight = "line" } = o;
	const [w, h] = tileOf(r);
	const pk = new PartKit(k.target, recolour, weight);
	const drawn = r.draw(pk);
	const tx = round(at[0] - (w / 2) * scale);
	const ty = round(at[1] - (h / 2) * scale);
	const transform = scale === 1 ? `translate(${tx} ${ty})` : `translate(${tx} ${ty}) scale(${round(scale)})`;
	return k.group(typeof drawn === "string" ? [drawn] : drawn, { transform });
}
