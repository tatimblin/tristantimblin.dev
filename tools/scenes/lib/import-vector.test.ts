/**
 * The hand-vector importer, a fixture per transformation and per failure
 * (`bun run test:unit`). Each fixture is a small export in the shape an
 * editor writes it; the hud's source.svg is the whole-file case, validated
 * with the scene profile. The swatch table, SWATCHES.md and swatches.svg
 * are held together here too.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PROFILES, validateSvg } from "../../../packages/design-system/scripts/validate-art.mjs";
import { importVector, ImportVectorError, parsePath } from "./import-vector";
import { SWATCHES } from "./swatches";

const INK = "#F6F5EB";
const DIM = "#8B8A86";
const GREEN = "#5DE17E";
const CORAL = "#EE5B2E";
const CYAN = "#5A8CEE";
const PLATE = "#17161C";

/** A Figma-shaped export on a 640×360 frame (2× the plate) unless said. */
const svg = (body: string, root = 'width="640" height="360" viewBox="0 0 640 360" fill="none" xmlns="http://www.w3.org/2000/svg"') => `<svg ${root}>\n${body}\n</svg>`;
const plate = { viewBox: "0 0 320 180" } as const;
const one = (body: string, opts: Parameters<typeof importVector>[1] = plate) => {
	const out = importVector(svg(body), opts);
	expect(out.length).toBe(1);
	return out[0];
};
/** The problems an export fails with. */
const problems = (body: string, opts: Parameters<typeof importVector>[1] = plate, root?: string): string[] => {
	try {
		importVector(svg(body, root), opts);
	} catch (e) {
		expect(e).toBeInstanceOf(ImportVectorError);
		return [...(e as ImportVectorError).problems];
	}
	throw new Error("expected the import to fail");
};

describe("strip", () => {
	test("comments, the prolog, a DOCTYPE with a subset, <title>, <desc>, <metadata> and namespaced elements go", () => {
		const src = `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 28.0.0 -->
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd" [<!ENTITY ns_flows "http://ns.adobe.com/Flows/1.0/">]>
<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xml:space="preserve">
<title>hud</title><desc>made in Figma</desc><metadata><rdf:RDF /></metadata>
<sodipodi:namedview id="nv" inkscape:zoom="1" />
<line x1="0" y1="0" x2="640" y2="0" stroke="${INK}" stroke-width="2" inkscape:label="rule" />
</svg>`;
		expect(importVector(src, plate)).toEqual([
			'<line x1="0" y1="0" x2="320" y2="0" fill="none" stroke="var(--art-ink)" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke" />',
		]);
	});

	test("ids, data-*, classes and editor attributes go; the drawing stays", () => {
		const out = one(`<path id="Vector 12" data-name="rule" class="st0" d="M0 0H640" stroke="${INK}" stroke-width="2" stroke-miterlimit="10" shape-rendering="crispEdges" />`);
		expect(out).not.toMatch(/id=|data-|miterlimit|shape-rendering/);
		expect(out).toContain('class="art-line"');
	});

	test("an unused def (a gradient, a symbol) is dropped", () => {
		const out = importVector(
			svg(`<line x2="640" stroke="${INK}" stroke-width="2" />
<defs><linearGradient id="paint0_linear"><stop stop-color="${INK}" /></linearGradient><symbol id="s"><rect width="1" height="1" /></symbol></defs>`),
			plate,
		);
		expect(out).toHaveLength(1);
		expect(out.join("")).not.toMatch(/gradient|symbol|stop/i);
	});

	test("a hidden layer (display:none, visibility:hidden) is dropped", () => {
		const out = importVector(
			svg(`<g style="display:none"><line x2="640" stroke="${INK}" stroke-width="2" /></g>
<line x2="640" stroke="${INK}" stroke-width="2" visibility="hidden" />
<line y1="10" x2="640" y2="10" stroke="${INK}" stroke-width="2" />`),
			plate,
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toContain('y1="5"');
	});
});

describe("flatten", () => {
	test("a group's paint flows to its leaves, and the group goes", () => {
		const out = importVector(svg(`<g id="grid" stroke="${GREEN}" stroke-width="2"><line x2="640" /><line y1="20" x2="640" y2="20" /></g>`), plate);
		expect(out).toHaveLength(2);
		for (const l of out) expect(l).toMatch(/^<line .*stroke="var\(--art-green\)" stroke-width="1"/);
		expect(out.join("")).not.toContain("<g");
	});

	test("style= becomes attributes, beating the attribute it repeats", () => {
		expect(one(`<rect width="20" height="20" fill="${INK}" style="fill:${GREEN};stroke:${INK};stroke-width:2px" />`)).toBe(
			'<rect x="0" y="0" width="10" height="10" fill="var(--art-green)" stroke="var(--art-ink)" stroke-width="1" class="art-line" vector-effect="non-scaling-stroke" />',
		);
	});

	test("Illustrator's <style> class rules are applied under the inline style", () => {
		const out = importVector(
			svg(`<style type="text/css"><![CDATA[ .st0{fill:${CORAL};} .st1,.st2{stroke:${INK};stroke-width:2;fill:none} ]]></style>
<circle class="st0" cx="20" cy="20" r="10" /><line class="st1" x2="640" />`),
			plate,
		);
		expect(out[0]).toContain('fill="var(--art-coral)"');
		expect(out[1]).toContain('stroke="var(--art-ink)"');
	});

	test("a group's translate is baked into its leaves' coordinates", () => {
		expect(one(`<g transform="translate(100 40)"><circle r="20" fill="${CORAL}" /></g>`)).toBe('<circle cx="50" cy="20" r="10" fill="var(--art-coral)" />');
	});
});

describe("frame", () => {
	const clip = `<defs><clipPath id="clip0_1_2"><rect width="640" height="360" fill="white" /></clipPath></defs>`;
	test("Figma's frame clip, frame mask and background rect are dropped", () => {
		const out = importVector(
			svg(`<g clip-path="url(#clip0_1_2)"><rect width="640" height="360" fill="${PLATE}" />
<mask id="mask0_1_2" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="360"><rect width="640" height="360" fill="#D9D9D9" /></mask>
<g mask="url(#mask0_1_2)"><line x2="640" stroke="${INK}" stroke-width="2" /></g></g>${clip}`),
			plate,
		);
		expect(out).toHaveLength(1);
		expect(out[0]).toStartWith("<line ");
	});

	test("any other clip-path fails", () => {
		const p = problems(`<g clip-path="url(#c)"><line x2="640" stroke="${INK}" stroke-width="2" /></g><defs><clipPath id="c"><circle r="10" /></clipPath></defs>`);
		expect(p.join("\n")).toMatch(/clip-path="url\(#c\)" is not the artboard's own clip/);
	});

	test("any other mask fails", () => {
		const p = problems(`<mask id="m"><rect width="100" height="100" fill="white" /></mask><g mask="url(#m)"><line x2="640" stroke="${INK}" stroke-width="2" /></g>`);
		expect(p.join("\n")).toMatch(/mask="url\(#m\)" is not the artboard's own mask/);
	});

	test("the plate swatch anywhere but the background fails", () => {
		expect(problems(`<rect width="40" height="40" fill="${PLATE}" />`).join("\n")).toMatch(/plate swatch .* artboard's background only/);
	});
});

describe("paint", () => {
	test("every swatch maps to its token, in any notation", () => {
		const cases: [string, string][] = [
			[INK, "var(--art-ink)"],
			[DIM.toLowerCase(), "var(--art-ink-2)"],
			["#bca2e9", "var(--art-lavender)"],
			["rgb(238, 91, 46)", "var(--art-coral)"],
			[CYAN, "var(--art-cyan)"],
			[GREEN, "var(--art-green)"],
		];
		for (const [hex, token] of cases) expect(one(`<rect width="10" height="10" fill="${hex}" />`)).toContain(`fill="${token}"`);
	});

	test("a colour at a fill opacity ≤ 25% is the wash", () => {
		expect(one(`<rect width="10" height="10" fill="${GREEN}" fill-opacity="0.14" />`)).toContain('fill="color-mix(in oklab, var(--art-green) 14%, transparent)"');
		// opacity multiplies down from a group, and with the colour's own alpha
		expect(one(`<g opacity="0.5"><rect width="10" height="10" fill="${CYAN}" fill-opacity="0.4" /></g>`)).toContain("var(--art-cyan) 20%");
		expect(one(`<rect width="10" height="10" fill="${CORAL}33" />`)).toContain("var(--art-coral) 20%");
	});

	test("a colour between 25% and 100% fails", () => {
		expect(problems(`<rect width="10" height="10" fill="${GREEN}" fill-opacity="0.5" />`).join("\n")).toMatch(/green at 50%: a wash is a colour at 1–25%/);
	});

	test("a translucent ink fails (the dimming is ink-2)", () => {
		expect(problems(`<rect width="10" height="10" fill="${INK}" fill-opacity="0.2" />`).join("\n")).toMatch(/ink at 20%: only a colour washes/);
	});

	test("a translucent stroke fails", () => {
		expect(problems(`<line x2="10" stroke="${INK}" stroke-width="2" stroke-opacity="0.45" />`).join("\n")).toMatch(/translucent stroke/);
	});

	test("unmapped colours fail, every one listed with its count and the nearest swatch", () => {
		const p = problems(`<rect width="10" height="10" fill="#FFFFFF" /><rect width="10" height="10" fill="white" /><line x2="10" stroke="#3B5BDB" stroke-width="2" />`);
		expect(p[0]).toMatch(/^2 colours are not a swatch/);
		expect(p[0]).toContain("#ffffff ×2 (fill; first line 2; nearest swatch: ink #f6f5eb)");
		expect(p[0]).toContain("#3b5bdb ×1 (stroke; first line 2; nearest swatch: cyan #5a8cee)");
	});

	test("a shape with no fill anywhere is SVG's black, and fails", () => {
		const p = problems(`<rect width="10" height="10" />`, plate, 'viewBox="0 0 640 360"');
		expect(p[0]).toContain("#000000 ×1 (fill (none given: SVG's default black)");
	});

	test("gradients and currentColor fail", () => {
		expect(problems(`<rect width="10" height="10" fill="url(#g)" />`).join("\n")).toMatch(/gradient or pattern paint/);
		expect(problems(`<rect width="10" height="10" fill="currentColor" />`).join("\n")).toMatch(/currentColor/);
	});
});

describe("stroke", () => {
	test("a 2 and a 3 at a 2× export are the 1 and the 1.5, with their classes and the vector-effect", () => {
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="2" />`)).toContain('stroke-width="1" class="art-line" vector-effect="non-scaling-stroke"');
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="3" />`)).toContain('stroke-width="1.5" class="art-line--2" vector-effect="non-scaling-stroke"');
	});

	test("strokeScale overrides the refit's scale", () => {
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="1" />`, { ...plate, strokeScale: 1 })).toContain('stroke-width="1"');
	});

	test("a weight that snaps to neither fails, saying what to draw", () => {
		expect(problems(`<line x2="640" stroke="${INK}" stroke-width="5" />`).join("\n")).toMatch(/stroke-width 5 is 2.5 at this scale \(×0.5\); the language has 1 and 1.5 — draw 2 or 3/);
	});

	test("caps and joins are kept, the defaults dropped", () => {
		const out = one(`<path d="M0 0L10 10" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="miter" />`);
		expect(out).toContain('stroke-linecap="round"');
		expect(out).not.toContain("linejoin");
	});

	test("a dasharray snaps to the scene's (8 8 at 2× is 4 4; 4,12 is 2 6; 12 6 2 6 is the dot-dash)", () => {
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="2" stroke-dasharray="8 8" />`)).toContain('stroke-dasharray="4 4"');
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="2" stroke-dasharray="4,12" />`)).toContain('stroke-dasharray="2 6"');
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="2" stroke-dasharray="12 6 2 6" />`)).toContain('stroke-dasharray="6 3 1 3"');
		expect(one(`<line x2="640" stroke="${INK}" stroke-width="2" stroke-dasharray="9" />`)).toContain('stroke-dasharray="4 4"');
	});

	test("a dasharray off the set fails, and so does an offset", () => {
		expect(problems(`<line x2="640" stroke="${INK}" stroke-width="2" stroke-dasharray="20 4" />`).join("\n")).toMatch(/stroke-dasharray "20 4" is 10 2 at this scale/);
		expect(problems(`<line x2="640" stroke="${INK}" stroke-width="2" stroke-dasharray="8 8" stroke-dashoffset="3" />`).join("\n")).toMatch(/dashoffset/);
	});
});

describe("refit", () => {
	test("a 640×360 frame onto the plate is an exact half", () => {
		expect(one(`<rect x="20" y="40" width="100" height="60" rx="8" fill="${CORAL}" />`)).toBe('<rect x="10" y="20" width="50" height="30" rx="4" fill="var(--art-coral)" />');
	});

	test("a different aspect is contained and centred (letterboxed)", () => {
		// 400×400 onto 320×180: scale 0.45, centred horizontally at 70.
		const out = importVector(svg(`<circle cx="200" cy="200" r="100" fill="${CORAL}" />`, 'viewBox="0 0 400 400"'), plate);
		expect(out[0]).toBe('<circle cx="160" cy="90" r="45" fill="var(--art-coral)" />');
	});

	test("cover fills and lets the frame crop", () => {
		const out = importVector(svg(`<circle cx="200" cy="200" r="100" fill="${CORAL}" />`, 'viewBox="0 0 400 400"'), { ...plate, fit: "cover" });
		expect(out[0]).toBe('<circle cx="160" cy="90" r="80" fill="var(--art-coral)" />');
	});

	test("a viewBox origin is honoured; width and height stand in for a missing viewBox", () => {
		expect(importVector(svg(`<circle cx="120" cy="60" r="10" fill="${CORAL}" />`, 'viewBox="100 50 640 360"'), plate)[0]).toContain('cx="10" cy="5"');
		expect(importVector(svg(`<circle cx="20" cy="20" r="10" fill="${CORAL}" />`, 'width="640" height="360"'), plate)[0]).toContain('cx="10" cy="10"');
	});

	test("an export with no size at all fails", () => {
		expect(problems(`<circle r="1" fill="${CORAL}" />`, plate, 'xmlns="http://www.w3.org/2000/svg"').join("\n")).toMatch(/needs a viewBox/);
	});

	test("onto the square panel", () => {
		expect(importVector(svg(`<circle cx="400" cy="400" r="100" fill="${CORAL}" />`, 'viewBox="0 0 800 800"'), { viewBox: "0 0 400 400" })[0]).toBe('<circle cx="200" cy="200" r="50" fill="var(--art-coral)" />');
	});
});

describe("geometry", () => {
	test("relative commands become absolute, rounded to a tenth, a flat L folded to H/V", () => {
		expect(parsePath("m10 10 l5 0 0 5 h-5 z")).toEqual([
			{ c: "M", a: [10, 10] },
			{ c: "L", a: [15, 10] },
			{ c: "L", a: [15, 15] },
			{ c: "L", a: [10, 15] },
			{ c: "Z", a: [] },
		]);
		expect(one(`<path d="m20.333 20 l10 0 0 10 h-10 z" fill="${CORAL}" />`)).toBe('<path d="M 10.2 10 H 15.2 V 15 H 10.2 Z" fill="var(--art-coral)" />');
	});

	test("compact arc flags parse, and an arc scales with the refit", () => {
		expect(parsePath("M0 0a10 10 0 01 20 0")).toEqual([
			{ c: "M", a: [0, 0] },
			{ c: "A", a: [10, 10, 0, 0, 1, 20, 0] },
		]);
		expect(one(`<path d="M0 0A20 20 0 0 1 40 0" stroke="${INK}" stroke-width="2" />`)).toContain('d="M 0 0 A 10 10 0 0 1 20 0"');
	});

	test("a rotated rect becomes a path, baked", () => {
		expect(one(`<rect x="-10" y="-10" width="20" height="20" transform="translate(100 100) rotate(45)" fill="${CORAL}" />`)).toBe(
			'<path d="M 50 42.9 L 57.1 50 L 50 57.1 L 42.9 50 Z" fill="var(--art-coral)" />',
		);
	});

	test("a skewed ellipse keeps a matrix; a path with no arcs bakes any transform", () => {
		expect(one(`<ellipse rx="20" ry="10" transform="skewX(30)" fill="${CORAL}" />`)).toMatch(/^<ellipse cx="0" cy="0" rx="10" ry="5" transform="matrix\(1 0 0.5774 1 0 0\)"/);
		expect(one(`<path d="M0 0L20 0" transform="skewX(45)" stroke="${INK}" stroke-width="2" />`)).toContain('d="M 0 0 H 10"');
	});

	test("polylines, polygons and circles under a similarity bake", () => {
		expect(one(`<polygon points="0,0 20,0 20,20" fill="${CORAL}" />`)).toBe('<polygon points="0,0 10,0 10,10" fill="var(--art-coral)" />');
		expect(one(`<circle r="10" transform="rotate(30) scale(2)" fill="${CORAL}" />`)).toBe('<circle cx="0" cy="0" r="10" fill="var(--art-coral)" />');
	});

	test("the output is deterministic", () => {
		const src = readFileSync(join(import.meta.dir, "../hud/source.svg"), "utf8");
		expect(importVector(src, plate)).toEqual(importVector(src, plate));
	});
});

describe("motion", () => {
	test("a named layer becomes a motion group round its leaves", () => {
		const out = importVector(svg(`<path id="road/centre" d="M0 0V100" stroke="${DIM}" stroke-width="2" stroke-dasharray="8 8" />`), { ...plate, motion: { "road/centre": { motion: "dash", speed: 0.5 } } });
		expect(out[0]).toStartWith('<g data-motion="dash" data-speed="0.5">\n  <path ');
		expect(out[0]).toEndWith("\n</g>");
	});

	test("a motion id the export does not have fails", () => {
		expect(problems(`<line x2="10" stroke="${INK}" stroke-width="2" />`, { ...plate, motion: { wheel: { motion: "spin" } } }).join("\n")).toMatch(/no drawn layer with id "wheel"/);
	});
});

describe("refused", () => {
	const cases: [string, RegExp][] = [
		[`<text x="0" y="10" fill="${INK}">FREQ</text>`, /text is HTML over the scene/],
		[`<image href="data:image/png;base64,AA" width="10" height="10" />`, /embedded image/],
		[`<use href="#a" />`, /a <use>/],
		[`<foreignObject width="10" height="10" />`, /foreignObject/],
		[`<svg viewBox="0 0 1 1" />`, /nested <svg>/],
		[`<rect width="10" height="10" fill="${CORAL}" filter="url(#f)" />`, /a filter .* shadows and blurs/],
		[`<path d="M0 0L1 1" stroke="${INK}" stroke-width="2" marker-end="url(#m)" />`, /markers/],
		[`<rect width="10" height="10" fill="${CORAL}" style="mix-blend-mode:multiply" />`, /mix-blend-mode "multiply"/],
		[`<rect width="10" height="10" fill="${CORAL}" pathLength="4" />`, /does not know, pathLength/],
		[`<rect width="50%" height="10" fill="${CORAL}" />`, /width="50%" is not a number/],
		[`<blink />`, /<blink> is not an element the importer knows/],
	];
	for (const [body, why] of cases) {
		test(why.source, () => {
			expect(problems(body).join("\n")).toMatch(why);
		});
	}

	test("every problem is reported at once", () => {
		const p = problems(`<text>A</text><image width="1" height="1" /><rect width="1" height="1" fill="#123456" />`);
		expect(p).toHaveLength(3);
	});

	test("a file that is not one well-formed <svg> fails", () => {
		expect(() => importVector("<svg viewBox='0 0 1 1'><g></svg>", plate)).toThrow(ImportVectorError);
		expect(() => importVector("<g />", plate)).toThrow(/must be one <svg>/);
	});
});

describe("the hud, whole", () => {
	test("its export imports to a file the scene profile passes", () => {
		const src = readFileSync(join(import.meta.dir, "../hud/source.svg"), "utf8");
		const children = importVector(src, { ...plate, motion: { "road/centre": { motion: "dash", speed: 0.5 } } });
		const file = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">\n${children.join("\n")}\n</svg>\n`;
		expect(validateSvg(file, { profile: PROFILES.scene, slug: "hud" })).toEqual([]);
	});
});

describe("the swatches", () => {
	const dir = join(import.meta.dir, "..");
	const md = readFileSync(join(dir, "SWATCHES.md"), "utf8").toLowerCase();
	const sheet = readFileSync(join(dir, "swatches.svg"), "utf8").toLowerCase();
	test("every hex is distinct, lower-case #rrggbb", () => {
		expect(new Set(SWATCHES.map((s) => s.hex)).size).toBe(SWATCHES.length);
		for (const s of SWATCHES) expect(s.hex).toMatch(/^#[0-9a-f]{6}$/);
	});
	for (const s of SWATCHES) {
		test(`${s.name} ${s.hex} is in SWATCHES.md and swatches.svg`, () => {
			expect(md).toContain(s.hex);
			expect(sheet).toContain(s.hex);
		});
	}
	test("the sheet itself imports: every paint on it is a swatch", () => {
		// Its labels are <text>, which the importer refuses; strip them and the rest must map.
		const drawn = readFileSync(join(dir, "swatches.svg"), "utf8").replace(/<text[\s\S]*?<\/text>/g, "");
		expect(() => importVector(drawn, plate)).not.toThrow();
	});
});
