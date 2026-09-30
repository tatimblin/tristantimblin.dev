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
export { ACCENT_PAINTS, GEN_PAINTS, clamp, clampInt, drawing, lineD, paintOf, rng, simplify, smoothD, toSvg } from "./base";
export type { AccentPaint, Drawing, GenPaint } from "./base";
