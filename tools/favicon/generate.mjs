#!/usr/bin/env bun
/**
 * Generates the halftone "T" favicon — a miniature of the <dotted-grid> effect
 * (@tristimb/dotted-grid, github.com/tatimblin/dotgrid), where texture comes through in DOT SIZE
 * rather than opacity or color.
 *
 * A tab favicon renders at 16 CSS px = 32 device px on a 2x display, so that is
 * the canvas this is designed against: a 7x7 grid of ~4.6px cells. Dots below
 * ~1px turn into low-alpha pixels via the rasterizer's own antialiasing, which is
 * where the tonal range comes from for free — we only ever encode size. The
 * monogram is a size contrast: the T's cells swell above the field around them,
 * tuned to be noticed on a second look rather than read as a logo on first
 * glance.
 *
 * The field reads as cloth draped over a surface: two out-of-phase low-frequency
 * waves make dot sizes swell and ebb in soft diagonal folds. It is deliberately
 * NOT the shader's per-cell hash — random sizes at this scale look like speckle
 * or dead pixels, not fabric. Every cell inside the disc keeps a dot (hence
 * FIELD_MIN as a floor rather than a drop threshold), because cloth is
 * continuous; interior dropouts would read as holes.
 *
 * The whole swatch is bounded by a circle rather than the grid's square: dots
 * taper to nothing across a band at the rim, so the silhouette is drawn by the
 * halftone itself.
 *
 * Usage: bun tools/favicon/generate.mjs
 * Output is committed, so neither the build nor CI depends on this script.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

// --- Geometry ---------------------------------------------------------------
const SIZE = 32; // viewBox units = device px at a 16px tab on a 2x display
const GRID = 7; // cells per axis; coarser than the cell count keeps dots big
const CELL = SIZE / GRID; // ~4.57 units

// --- Drape tuning -----------------------------------------------------------
const DOT_SCALE = 0.74; // shader's uDotScale: dot width as a fraction of the cell
const FIELD_MIN = 0.2; // trough of a fold — a floor, so no cell ever goes empty
const FIELD_MAX = 0.68; // crest of a fold; stays clear of the T's near-full cell
const FOLD_AMP = 0.4; // primary fold depth
const CROSS_AMP = 0.2; // secondary cross-fold, breaks up the primary's regularity
const FOLD_FREQ = 0.85; // wavelength; low enough that folds span several cells
const HALO = 0.85; // slight damping for cells edge-adjacent to the T. Near 1 on
//                    purpose: a strong halo cleared a visible moat around the
//                    monogram, which read as an outline and gave the T away.

// --- Circular silhouette ----------------------------------------------------
// The swatch is a disc, not a square block: dot sizes taper to nothing across a
// soft band at the rim, so the icon's outline is a circle drawn by the halftone
// itself rather than a clipped edge. Cells that taper to zero are omitted.
const DISC_R = 17.5; // rim radius in units, from the center. Larger than SIZE/2,
//                      so the taper bites the corners while sparing mid-edges.
const RIM_FEATHER = 6.0; // width of the taper band; wide enough to read as a
//                          gradual falloff rather than a hard crop.

// --- Monogram ---------------------------------------------------------------
// The T is a swell in the same cloth, not a shape laid on top: its cells take a
// guaranteed floor plus a share of their own drape value, so the letter stays
// coherent while still rising and falling with the folds around it. Multiplying
// by the drape alone (no floor) breaks the letter — T cells landing in a trough
// shrink below their neighbours and the stem comes apart.
const T_FLOOR = 0.86; // guaranteed minimum, before DOT_SCALE
const T_RIDE = 0.22; // share of the cell's own drape that still shows through
const T_SQUARE = 0.45; // 0 = circle like the field, 1 = sharp square. Partial
//                        rounding lets the T read as a family member, not an
//                        intruder; a full square was the loudest of the three
//                        cues that made it pop.
const CROSSBAR_ROW = 1;
const CROSSBAR_COLS = [1, 5]; // inclusive
const STEM_ROWS = [2, 5]; // inclusive
const STEM_COLS = [3, 3]; // inclusive; centered under the crossbar

// --- Color ------------------------------------------------------------------
// Approximations of --text-primary in each theme, converted from the design
// system's OKLCH tokens (theme/design-system/src/tokens/tokens.generated.css:
// light --gray-1200, dark --blue-400). The SVG can't read CSS vars, and the site
// theme is a localStorage class toggle, so prefers-color-scheme is the only
// lever available here — same approach as the file this replaces.
const FILL_LIGHT = "#13161a";
const FILL_DARK = "#e2eafd";
// The PNG fallback can't carry a media query, so it uses the exact mid-grey the
// hero and carousel already pass as color="#7f7f7f" — legible on either chrome.
const FILL_PNG = "#7f7f7f";

const inRange = (v, [lo, hi]) => v >= lo && v <= hi;
const isT = (i, j) =>
	(j === CROSSBAR_ROW && inRange(i, CROSSBAR_COLS)) ||
	(inRange(j, STEM_ROWS) && inRange(i, STEM_COLS));

/**
 * The drape at a cell, in 0..1 — two sine waves at different angles and
 * wavelengths, summed: the primary runs down-right, the secondary cuts across it,
 * so crests meet at soft irregular intervals instead of forming stripes. The
 * phase offsets (0.6, 1.9) just place the folds pleasantly relative to the T.
 */
function drape(i, j) {
	const fold = Math.sin(FOLD_FREQ * (i * 0.85 + j * 0.45) + 0.6);
	const cross = Math.sin(FOLD_FREQ * 0.62 * (i * 0.35 - j * 0.95) + 1.9);
	const a = Math.max(0, Math.min(1, 0.5 + fold * FOLD_AMP + cross * CROSS_AMP));
	return FIELD_MIN + a * (FIELD_MAX - FIELD_MIN);
}

/** Field dot width in units. */
function fieldWidth(i, j) {
	let a = drape(i, j);

	// Damp the cells orthogonally touching the T so its silhouette stays legible.
	// Edge-adjacency only, not all 8 neighbours: suppressing the diagonals too
	// carved a visible void around the monogram and thinned the field noticeably.
	const touchesT = [
		[1, 0],
		[-1, 0],
		[0, 1],
		[0, -1],
	].some(([di, dj]) => isT(i + di, j + dj));
	if (touchesT) a *= HALO;

	return a * DOT_SCALE * CELL;
}

/** Monogram dot width in units: a floor, plus a share of the local drape. */
function monogramWidth(i, j) {
	const a = Math.min(1, T_FLOOR + drape(i, j) * T_RIDE);
	return a * DOT_SCALE * CELL;
}

/**
 * Size multiplier for the circular silhouette: 1 well inside the disc, easing to
 * 0 at the rim. Smoothstep rather than a linear ramp — a linear taper left a
 * visible size discontinuity where the band begins.
 */
function rimTaper(i, j) {
	const cx = (i + 0.5) * CELL;
	const cy = (j + 0.5) * CELL;
	const d = Math.hypot(cx - SIZE / 2, cy - SIZE / 2);
	const t = Math.max(0, Math.min(1, (DISC_R - d) / RIM_FEATHER));
	return t * t * (3 - 2 * t);
}

const round = (n) => Number(n.toFixed(2));

/** One <rect>, centered in its cell. */
function rect(i, j, w, r) {
	const x = round(i * CELL + (CELL - w) / 2);
	const y = round(j * CELL + (CELL - w) / 2);
	const d = round(w);
	return `<rect x="${x}" y="${y}" width="${d}" height="${d}" rx="${round(r)}"/>`;
}

/**
 * @param {{ fill: string, darkFill?: string }} opts  darkFill omitted = single
 *   flat fill (for the PNG fallback); present = prefers-color-scheme flip.
 */
function buildSvg({ fill, darkFill }) {
	const field = [];
	const mono = [];
	for (let j = 0; j < GRID; j++) {
		for (let i = 0; i < GRID; i++) {
			const taper = rimTaper(i, j);
			if (taper <= 0) continue; // outside the disc

			if (isT(i, j)) {
				const w = monogramWidth(i, j) * taper;
				mono.push(rect(i, j, w, (w / 2) * (1 - T_SQUARE)));
			} else {
				const w = fieldWidth(i, j) * taper;
				field.push(rect(i, j, w, w / 2)); // rx = w/2 -> circle
			}
		}
	}

	const style = darkFill
		? `rect{fill:${fill}}@media(prefers-color-scheme:dark){rect{fill:${darkFill}}}`
		: `rect{fill:${fill}}`;

	return [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">`,
		`<style>${style}</style>`,
		"<!-- drape: dot size swells and ebbs along two crossing folds -->",
		...field,
		"<!-- T monogram: a swell in the same cloth, by dot size alone -->",
		...mono,
		"</svg>",
		"",
	].join("\n");
}

const out = (name) => fileURLToPath(new URL(`../../public/${name}`, import.meta.url));

const svg = buildSvg({ fill: FILL_LIGHT, darkFill: FILL_DARK });
await writeFile(out("favicon.svg"), svg);

// favicon.ico has always actually been a 32x32 PNG here; keep that as-is so the
// existing <link rel="icon" href="/favicon.ico"> needs no change.
const png = await sharp(Buffer.from(buildSvg({ fill: FILL_PNG })), { density: 96 })
	.resize(SIZE, SIZE)
	.png()
	.toBuffer();
await writeFile(out("favicon.ico"), png);

const dots = (svg.match(/<rect/g) ?? []).length;
console.log(`favicon.svg  ${svg.length} B, ${dots} dots`);
console.log(`favicon.ico  ${png.length} B, ${SIZE}x${SIZE} PNG`);
