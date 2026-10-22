import { test, expect } from "./fixtures/test";

/**
 * THE TWO SELF-HOSTED FACES, AND THE ROLES THEY FILL.
 *
 * DM Sans (400 / 500 / 700) is the interface, the headings and the hero; Roboto
 * Mono (300 / 400 / 500) is reading text and code. Each cut ships as a latin and
 * a latin-ext woff2, @font-face'd in src/styles/fonts.css with its real weight
 * (not the 100–900 axis), so a request for a weight lands on exactly one file.
 *
 * A broken font stack is SILENT. getComputedStyle still reports the family you
 * asked for even when the woff2 404s, when the @font-face never parsed, or when a
 * role's token points somewhere it shouldn't — the page simply renders in the
 * metric-matched fallback (built to hold the web font's box, so the layout does
 * not even move) and nothing anywhere says so. That is the whole reason this file
 * exists: it is the class of failure that survives a visual check on a warm cache
 * and only shows up for someone else.
 *
 * So each role is asserted TWICE, and both halves are needed:
 *   1. the element resolves to the intended family and cut (the token wiring), and
 *   2. that family is actually LOADED (the file shipped and parsed).
 * Either alone passes while the page renders in the fallback.
 *
 * ONE TRAP in that second check. document.fonts.check() answers "can this be
 * rendered?", not "did a web font load" — so for a family with NO @font-face rule at
 * all it returns TRUE (the system will happily render the text in something). It
 * discriminates only for families the CSS actually declares, and even then not
 * between the CUTS of one family (font matching falls back within it). So the cut
 * checks below go to the FontFace objects themselves and read their status.
 */

const unquote = (s: string) => s.split(",")[0].trim().replace(/^["']|["']$/g, "");

/** role → [selector, expected first family in the stack, weight it is used at] */
const ROLES: Array<[string, string, string, number]> = [
	["wordmark (hero)", ".sh__wordmark-text", "DM Sans", 500],
	["heading (other stories)", ".sh__outline", "DM Sans", 500],
	["hero lede", ".hero-intro__lede p", "DM Sans", 500],
	["body copy", ".home__copy p", "Roboto Mono", 400],
	["widget UI", ".home__widgets .ds-widget", "DM Sans", 400],
	["widget figure", ".ds-figure__num", "DM Sans", 400],
	["label voice", ".home__widgets .ds-mono", "DM Sans", 400],
];

/** Every cut, by family: the weights fonts.css declares, each in two subsets. */
const CUTS: Record<string, string[]> = {
	"DM Sans": ["400", "500", "700"],
	"Roboto Mono": ["300", "400", "500"],
};
const FILES = Object.entries(CUTS).flatMap(([family, weights]) =>
	weights.flatMap((w) =>
		["latin", "latin-ext"].map((subset) => `${family.replace(" ", "")}-${w}-${subset}.woff2`)
	)
);

test("every role resolves to its face, and that face is loaded", async ({ page }) => {
	await page.goto("/");
	// The widget row is below the fold and the footer carousel builds its ruler on
	// hydration, so bring them in before asking what they are set in.
	await page.evaluate(() =>
		document.querySelector(".home__widgets")?.scrollIntoView({ block: "center" })
	);
	await page.waitForFunction(() => document.fonts.status === "loaded", undefined, {
		timeout: 15_000,
	});

	const result = await page.evaluate((roles) => {
		return roles.map(([name, sel, family, weight]) => {
			const el = document.querySelector<HTMLElement>(sel as string);
			const cs = el ? getComputedStyle(el) : null;
			return {
				name,
				found: !!el,
				family: cs?.fontFamily ?? "",
				weight: cs ? Number(cs.fontWeight) : null,
				expected: family,
				expectedWeight: weight,
				// Did the real file land? A 404'd face reports false here while the
				// computed family above still reads correct.
				loaded: document.fonts.check(`${weight} 16px "${family}"`),
			};
		});
	}, ROLES);

	for (const r of result) {
		expect(r.found, `${r.name}: selector matched nothing — has the markup moved?`).toBe(true);
		expect(unquote(r.family), `${r.name}: wrong face`).toBe(r.expected);
		expect(r.weight, `${r.name}: wrong cut`).toBe(r.expectedWeight);
		expect(r.loaded, `${r.name}: "${r.expected}" is not loaded — the page is rendering in a fallback`).toBe(true);
	}
});

test("each built woff2 is served", async ({ request }) => {
	// Catches the half of the failure the page cannot see: a face declared in CSS
	// whose file was never built or never committed.
	expect(FILES).toHaveLength(12);
	for (const file of FILES) {
		const res = await request.get(`/fonts/${file}`);
		expect(res.status(), `/fonts/${file}`).toBe(200);
		const body = await res.body();
		expect(body.byteLength, `/fonts/${file} is suspiciously small`).toBeGreaterThan(1000);
	}
});

test("every cut is declared at its real weight, and loads", async ({ page }) => {
	// The failure this exists for is invisible. font-synthesis-weight is none, so
	// if a cut fails to build, ship or parse, a request for it resolves to the
	// nearest cut that did — with the computed font-weight still reporting what
	// was asked and every other assertion in this file still passing.
	//
	// So find each declared face and require that it reached status "loaded"
	// rather than "error". A face is only fetched when something on the page uses
	// it, so the ones nothing exercises (Roboto Mono 300 and 500 hold no role) are
	// loaded by hand — which is exactly why nothing else would notice them going
	// missing. The weight is the declared one, not a range: a 100–900 face would
	// answer every request with one file.
	await page.goto("/");
	await page.waitForFunction(() => document.fonts.status === "loaded", undefined, {
		timeout: 15_000,
	});
	const faces = await page.evaluate(async () => {
		const out: Array<{ family: string; weight: string; status: string }> = [];
		for (const f of Array.from(document.fonts as unknown as Set<FontFace>)) {
			const family = f.family.replace(/^["']|["']$/g, "");
			if (family !== "DM Sans" && family !== "Roboto Mono") continue;
			if (f.status === "unloaded") await f.load().catch(() => {});
			out.push({ family, weight: f.weight, status: f.status });
		}
		return out;
	});
	for (const [family, weights] of Object.entries(CUTS)) {
		const declared = faces.filter((f) => f.family === family);
		// A missing weight means the @font-face rule itself went away — a different
		// bug from the file failing to load, and worth telling apart.
		expect(
			[...new Set(declared.map((f) => f.weight))].sort(),
			`the ${family} cuts are not all declared, each at one weight`
		).toEqual(weights);
		expect(declared, `${family}: expected a latin and a latin-ext face per cut`).toHaveLength(
			weights.length * 2
		);
		for (const f of declared) {
			expect(f.status, `${family} ${f.weight} did not load`).toBe("loaded");
		}
	}
});

test("the emphasis gets the REAL Bold, not a synthesised one", async ({ page }) => {
	// Two things, and the second is why this test is not just the one above.
	//
	// font-synthesis-weight: none is a site-wide guard (see global.css): emphasis is
	// a cut the family ships, never a smeared faux-bold. Losing it would degrade
	// type across the site without any other test noticing.
	//
	// But that guard also means a weight request with no matching cut renders at
	// whatever DID ship — silently, and looking merely "a bit light". So also assert
	// the 700 file really loaded where it is asked for. A post row's title is the
	// UI face at its Bold — the one Bold the site sets outside a prose table — and
	// the catalogue renders a PostRow, so that is the page to ask on; a post's
	// section heading is the heading role at its Medium, which the second half pins.
	await page.goto("/design-system/");
	await page.waitForFunction(() => document.fonts.status === "loaded", undefined, {
		timeout: 15_000,
	});
	const title = await page.evaluate(() => {
		const el = document.querySelector<HTMLElement>(".ds-post-row__title");
		return {
			found: !!el,
			family: el ? getComputedStyle(el).fontFamily : "",
			weight: el ? Number(getComputedStyle(el).fontWeight) : null,
			synthesis: getComputedStyle(document.body).fontSynthesisWeight,
			bold: Array.from(document.fonts as unknown as Set<FontFace>).some(
				(f) =>
					f.family.replace(/^["']|["']$/g, "") === "DM Sans" &&
					f.weight === "700" &&
					f.status === "loaded"
			),
		};
	});
	expect(title.found, "no post row title in the catalogue — has the PostRow specimen moved?").toBe(true);
	expect(unquote(title.family)).toBe("DM Sans");
	expect(title.weight).toBe(700);
	expect(title.synthesis).toBe("none");
	expect(title.bold, "the DM Sans Bold file never loaded where the title asks for it").toBe(true);

	await page.goto("/txt/asserting-on-agent-behavior/");
	await page.waitForFunction(() => document.fonts.status === "loaded", undefined, {
		timeout: 15_000,
	});
	const h2 = await page.evaluate(() => {
		const el = document.querySelector<HTMLElement>(".ds-prose h2");
		return {
			found: !!el,
			family: el ? getComputedStyle(el).fontFamily : "",
			weight: el ? Number(getComputedStyle(el).fontWeight) : null,
			medium: document.fonts.check('500 16px "DM Sans"'),
		};
	});
	expect(h2.found, "no section heading found — has the Prose markup changed?").toBe(true);
	expect(unquote(h2.family)).toBe("DM Sans");
	expect(h2.weight).toBe(500);
	expect(h2.medium).toBe(true);
});
