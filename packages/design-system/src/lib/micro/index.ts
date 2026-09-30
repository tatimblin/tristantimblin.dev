/**
 * Micrographics — the L0 kit. `import { kit } from "@whois/design-system/lib/micro"`.
 *
 *   const k = kit("glyph");
 *   k.svg({ header: "baked from recipes/dial.ts — edit the recipe", children: [
 *     k.ticksRadial(24, 18, 10, 13, 5, -120, 120, { dash: "dash", weight: "hair" }),
 *     k.needle(24, 18, 11, -35, { paint: "blue" }),
 *   ] });
 */

export { kit, Kit } from "./kit";
export type { AngleOpts, BandOpts, Cap, Corner, End, FillOpts, GroupOpts, NeedleOpts, ShapeOpts, StrokeOpts, SvgOpts, TicksOpts, WireOpts } from "./kit";
export { TARGETS } from "./paint";
export type { Dash, Motion, Paint, Speed, Target, TargetTable, Weight } from "./paint";
export { onArc, polar, round, snap, spread } from "./geometry";
export type { Point } from "./geometry";
export { ISO_X, ISO_Y, ISO_Z, iso, isoBox, isoCoil, isoCylinder, isoEllipse, isoPlane, isoRoundBox, isoRoundRect, vanishingGrid } from "./iso";
export type { Axis, IsoBoxOpts, IsoCylinderOpts, IsoEllipseOpts, IsoPlaneOpts, IsoRoundBoxOpts, VanishingGridOpts } from "./iso";

// The L2 generators (gen/): parametric marks, `(params) => Drawing`, rendered by <GlyphSvg> and the <Wave>, <Envelope>, <Filter>, <Curve> components.
export { wave, WAVE_SHAPES, envelope, ENVELOPE_DEFAULTS, filter, FILTER_TYPES, curve, CURVE_DEFAULT_POINTS, CURVE_MAX_POINTS, toSvg, drawing, simplify, smoothD, lineD, rng, GEN_PAINTS, ACCENT_PAINTS } from "./gen";
export type { Drawing, GenPaint, AccentPaint, WaveOpts, WaveShape, EnvelopeOpts, FilterOpts, FilterType, CurveOpts } from "./gen";
// The routing and field generators (families D/E): <Fan>, <Rings>, <Matrix>.
export { fan, FAN_DIRS, rings, RINGS_MODES, matrix, MATRIX_MARKS, MATRIX_WIDE_AFTER } from "./gen";
export type { FanDir, FanOpts, RingsMode, RingsOpts, Cell, MatrixMark, MatrixOpts } from "./gen";

// The instrument generators (gen/, family C): <Gauge>, <Dial>, <Ladder>, <Segments>, <Selector>; meterAria is a labelled meter's ARIA.
export { gauge, dial, ladder, ladderLevel, LADDER_AXES, segments, segmentsText, SEGMENTS_MAX, selector, meterAria } from "./gen";
export type { GaugeOpts, DialOpts, LadderAxis, LadderOpts, SegmentsOpts, SelectorOpts, MeterAria } from "./gen";

// The progress generator (gen/, family C): <Progress>, a labelled meter like <Gauge>.
export { progress, PROGRESS } from "./gen";
export type { ProgressOpts } from "./gen";
