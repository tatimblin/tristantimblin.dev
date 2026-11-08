// The <dotted-grid> controls, as data: which settings exist and what range each
// is tuned over. Shared by the /dotgrid playground and the homepage's dev-only
// tuner (src/components/HalftoneTuner.astro). `value` is the playground's
// starting point (the fabric-cream preset's); the tuner starts from
// src/styles/halftone.css instead.

/** Attribute knobs: one attribute each. `zeroOff` marks the "absent = off"
 *  attributes (0 removes the attribute rather than setting it). */
export const attrKnobs = [
	{ attr: "cell-size", min: 2, max: 24, step: 1, value: 6 },
	{ attr: "color-reveal", min: 0, max: 300, step: 10, value: 0, zeroOff: true },
	{ attr: "shimmer", label: "shimmer %", min: 0, max: 100, step: 1, value: 0, zeroOff: true },
	{ attr: "reveal-boost", min: 0, max: 1, step: 0.05, value: 0.3 },
];

/** Tone knobs: one --dg-* variable each. */
export const toneKnobs = [
	{ name: "dot-scale", min: 0.2, max: 1.5, step: 0.05, value: 1.1 },
	{ name: "levels", min: 1, max: 12, step: 1, value: 6 },
	{ name: "cutoff", min: 0, max: 1, step: 0.02, value: 0.06 },
	{ name: "feather", min: 0, max: 1, step: 0.05, value: 0.2 },
	{ name: "denoise", min: 0, max: 1, step: 0.05, value: 0.3 },
	{ name: "gamma", min: 0.2, max: 3, step: 0.05, value: 0.4 },
	{ name: "contrast", min: 0.2, max: 3, step: 0.05, value: 1.05 },
	{ name: "dot-shape", label: "dot-shape (0 sq / 1 circle / 2 morph)", min: 0, max: 2, step: 1, value: 1 },
	{ name: "bloom", min: 0, max: 1, step: 0.05, value: 0 },
	{ name: "crosshatch", min: 0, max: 1, step: 0.05, value: 0 },
];

/** Colour knobs: a picker plus an "auto" box. Auto removes the variable, so the
 *  grid falls back to its theme (or, for glow, the paper's contrast pole). */
export const colourKnobs = [
	{ name: "ink", value: "#191918" },
	{ name: "ink-hi", value: "#191918" },
	{ name: "paper", value: "#fff8eb" },
	{ name: "glow", value: "#000000" },
];

/** The dot-shape knob's 0/1/2, as the keywords the element and the CSS use. */
export const DOT_SHAPES = ["square", "circle", "morph"];

export const POLARITIES = ["positive", "negative"];
