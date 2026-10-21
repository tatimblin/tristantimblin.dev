/**
 * The L2 generators — parametric marks, each a pure function over the
 * glyph kit: `(params) => Drawing`. Re-exported from lib/micro's index,
 * so `import { wave, envelope, filter, curve } from "@whois/design-system/lib/micro"`;
 * their components (`<Wave>`, `<Envelope>`, `<Filter>`, `<Curve>`) render a
 * Drawing through `<GlyphSvg>`. See base.ts for the contract and how to
 * add one.
 */

export { wave, WAVE_SHAPES } from "./wave";
export type { WaveOpts, WaveShape } from "./wave";
export { envelope, ENVELOPE_DEFAULTS } from "./envelope";
export type { EnvelopeOpts } from "./envelope";
export { filter, FILTER_TYPES } from "./filter";
export type { FilterOpts, FilterType } from "./filter";
export { curve, CURVE_DEFAULT_POINTS, CURVE_MAX_POINTS } from "./curve";
export type { CurveOpts } from "./curve";
// family D/E: routing and fields
export { fan, FAN_DIRS } from "./fan";
export type { FanDir, FanOpts } from "./fan";
export { rings, RINGS_MODES } from "./rings";
export type { RingsMode, RingsOpts } from "./rings";
export { matrix, MATRIX_MARKS, MATRIX_WIDE_AFTER } from "./matrix";
export type { Cell, MatrixMark, MatrixOpts } from "./matrix";
export { ACCENT_PAINTS, GEN_PAINTS, clamp, clampInt, drawing, lineD, paintOf, rng, simplify, smoothD, toSvg } from "./base";
export type { AccentPaint, Drawing, GenPaint } from "./base";
// family C — the instruments (meters and readouts)
export { gauge, arcMiddle } from "./gauge";
export type { GaugeOpts } from "./gauge";
export { dial } from "./dial";
export type { DialOpts } from "./dial";
export { ladder, ladderLevel, LADDER_AXES } from "./ladder";
export type { LadderAxis, LadderOpts } from "./ladder";
export { segments, segmentsText, SEGMENTS_MAX } from "./segments";
export type { SegmentsOpts } from "./segments";
export { selector } from "./selector";
export type { SelectorOpts } from "./selector";
export { meterAria } from "./meter";
export type { MeterAria } from "./meter";
// family C — the progress bar
export { progress, PROGRESS } from "./progress";
export type { ProgressOpts } from "./progress";
