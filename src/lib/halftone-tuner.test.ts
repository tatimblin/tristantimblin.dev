import { describe, expect, test } from "bun:test";
import css from "../styles/halftone.css" with { type: "text" };
import {
	AUTO,
	defaultsFromTone,
	parseShipped,
	sameValue,
	setOverride,
	shippedValue,
	themeRule,
	tuningOutput,
} from "./halftone-tuner";

const DEFAULTS = defaultsFromTone({
	gamma: 0.8,
	contrast: 1.1,
	cutoff: 0,
	feather: 0,
	dotScale: 1,
	levels: 5,
	bloom: 0.55,
	crosshatch: 0.35,
	denoise: 0,
	dotShape: 2,
});

const SHEET = `
/* --dg-gamma: 9; a comment, not a rule */
.page-hero__grid { --dg-gamma: 7; }
.wx-videos dotted-grid { --dg-ink: var(--soft); --dg-levels: 12; }
[data-theme="light"] .wx-videos dotted-grid { --dg-gamma: 0.42; --dg-dot-shape: 1; }
[data-theme="dark"] .wx-videos dotted-grid { --dg-gamma: 0.6; }
`;

describe("parseShipped", () => {
	const shipped = parseShipped(SHEET, DEFAULTS);

	test("layers the theme's rule over the shared one over the element's defaults", () => {
		expect(shipped.light).toMatchObject({ gamma: "0.42", levels: "12", ink: "var(--soft)", bloom: "0.55" });
		expect(shipped.dark.gamma).toBe("0.6");
	});

	test("reads only the carousel's rules, and spells a shape as its keyword", () => {
		expect(shipped.light["dot-shape"]).toBe("circle");
		expect(shipped.dark["dot-shape"]).toBe("morph");
	});

	test("a colour nothing sets is auto", () => {
		expect(shippedValue(shipped.light, "paper")).toBe(AUTO);
	});

	test("reads the real stylesheet", () => {
		const real = parseShipped(css as unknown as string, DEFAULTS);
		expect(real.light.gamma).toBe("0.42");
		expect(real.dark.gamma).toBe("0.6");
		expect(real.dark.ink).toBe("var(--halftone-ink-soft)");
	});
});

describe("overrides", () => {
	const shipped = parseShipped(SHEET, DEFAULTS).light;

	test("recording a shipped value clears the change, however it is spelled", () => {
		const o: Record<string, string> = {};
		setOverride(o, shipped, "gamma", "0.5");
		expect(o).toEqual({ gamma: "0.5" });
		setOverride(o, shipped, "gamma", "0.420");
		expect(o).toEqual({});
		expect(sameValue("dot-shape", "1", "circle")).toBe(true);
	});

	test("auto on a colour that ships one empties the variable", () => {
		const o: Record<string, string> = {};
		setOverride(o, shipped, "ink", AUTO);
		expect(themeRule("light", o)).toBe('[data-theme="light"] .wx-videos dotted-grid {\n\t--dg-ink: initial;\n}');
	});
});

describe("tuningOutput", () => {
	test("gives one rule per changed theme, and the cell sizes as a comment", () => {
		const out = tuningOutput({ light: { gamma: "0.5" }, dark: {} }, { compact: 5 });
		expect(out).toContain('[data-theme="light"] .wx-videos dotted-grid {\n\t--dg-gamma: 0.5;\n}');
		expect(out).not.toContain('[data-theme="dark"]');
		expect(out).toContain("compact (.wx-videos__compact): cellSize={5}");
		expect(out).not.toContain("wide");
	});

	test("says so when nothing differs", () => {
		expect(tuningOutput({ light: {}, dark: {} }, {})).toContain("no changes");
	});
});
