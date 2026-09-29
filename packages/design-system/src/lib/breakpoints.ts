/**
 * The breakpoints, for a script that must agree with the stylesheet.
 *
 * The site's CSS steps at the DS breakpoints — sm 640 / md 768 / lg 1024 /
 * xl 1280 — and at ONE more, the widget grid's COMPACT step: at and below
 * 900px the grid drops from four columns to two (widget-grid.css), and a
 * widget's own script follows it (a band that is a touch target only when a
 * column is wide enough; the carousel promoted into the hero). Written once
 * here and once in widget-grid.css, and nowhere else: a widget reads these.
 *
 * The convention for the direction: a rule that TAKES SOMETHING AWAY as the
 * viewport narrows is written `max-width` (compact and below); a rule that
 * ADDS as it widens is `min-width`. The two forms below are the same step
 * from either side.
 */
export const WIDGET_COMPACT = 900;
/** At and below the compact step: the two-column grid. */
export const WIDGET_COMPACT_MQ = `(max-width: ${WIDGET_COMPACT}px)`;
/** Above it: the four-column grid. */
export const WIDGET_WIDE_MQ = `(min-width: ${WIDGET_COMPACT + 1}px)`;
