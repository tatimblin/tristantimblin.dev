import { test, expect } from "@playwright/test";

/**
 * THE THREE SELF-HOSTED FACES, AND THE ROLES THEY FILL.
 *
 * A broken font stack is SILENT. getComputedStyle still reports the family you
 * asked for even when the woff2 404s, when the @font-face never parsed, or when a
 * role's token points somewhere it shouldn't — the page simply renders in the
 * system fallback and nothing anywhere says so. That is the whole reason this file
 * exists: it is the class of failure that survives a visual check on a warm cache
 * and only shows up for someone else.
 *
 * So each role is asserted TWICE, and both halves are needed:
 *   1. the element resolves to the intended family (the token wiring is right), and
 *   2. that family is actually LOADED (the file shipped and parsed).
 * Either alone passes while the page renders in Arial. Verified against a run with
 * neue-montreal-light.woff2 blocked at the network: getComputedStyle still reported
 * "Neue Montreal", and only document.fonts.check() returned false.
 *
 * ONE TRAP in that second check. document.fonts.check() answers "can this be
 * rendered?", not "did a web font load" — so for a family with NO @font-face rule at
 * all it returns TRUE (the system will happily render the text in something). It
 * discriminates only for families the CSS actually declares. Every family below is
 * declared in src/styles/fonts.css; a role added here for an undeclared family would
 * pass this file while proving nothing.
 */

/** role → [selector, expected first family in the stack, weight it is used at] */
const ROLES: Array<[string, string, string, number]> = [
	["wordmark (hero)", ".sh__wordmark-text", "Migra", 500],
	["heading (other stories)", ".sh__outline", "Migra", 700],
	["hero lede", ".hero-intro__lede p", "Mondwest", 700],
	["body copy", ".home__copy p", "Neue Montreal", 400],
	["widget UI", ".home__widgets .ds-widget", "Mondwest", 400],
	["widget figure", ".ds-figure__num", "Mondwest", 400],
	["label voice", ".home__widgets .ds-mono", "Mondwest", 400],
];

const FILES = [
	"migra-medium.woff2",
	"migra-bold.woff2",
	"fs-mondwest-bold.woff2",
	"ppmondwest-regular.woff2",
	"ppmondwest-thin.woff2",
	"ppmondwest-light.woff2",
	"neue-montreal-regular.woff2",
	"neue-montreal-semibold.woff2",
];

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
			return {
				name,
				found: !!el,
				// First entry of the resolved stack, unquoted.
				first: el
					? getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "")
					: null,
				expected: family,
				// Did the real file land? A 404'd face reports false here while the
				// computed family above still reads correct.
				loaded: document.fonts.check(`${weight} 16px "${family}"`),
			};
		});
	}, ROLES);

	for (const r of result) {
		expect(r.found, `${r.name}: selector matched nothing — has the markup moved?`).toBe(true);
		expect(r.first, `${r.name}: wrong face`).toBe(r.expected);
		expect(r.loaded, `${r.name}: "${r.expected}" is not loaded — the page is rendering in a fallback`).toBe(true);
	}
});

test("each built woff2 is served", async ({ request }) => {
	// Catches the half of the failure the page cannot see: a face declared in CSS
	// whose file was never built or never committed.
	for (const file of FILES) {
		const res = await request.get(`/fonts/${file}`);
		expect(res.status(), `/fonts/${file}`).toBe(200);
		const body = await res.body();
		expect(body.byteLength, `/fonts/${file} is suspiciously small`).toBeGreaterThan(1000);
	}
});

test("body copy gets Neue Montreal's Regular, and every Mondwest cut is declared and loads", async ({
	page,
}) => {
	// The failure this exists for is invisible. font-synthesis-weight is none, so
	// if a cut fails to build, ship or parse, a request for it resolves to the
	// nearest cut that did — with the computed font-weight still reporting what
	// was asked and every other assertion in this file still passing.
	//
	// AND document.fonts.check() DOES NOT CATCH IT: check() asks "can this weight
	// be rendered?", and with a cut missing the answer is still yes, because CSS
	// font matching falls back within the family. What separates the cuts is which
	// FILE a face loaded from, so the assertion goes to the FontFace objects
	// themselves: find each declared Mondwest face and require that it reached
	// status "loaded" rather than "error" or "unloaded". The 200 and 300 hold no
	// role, which is exactly why nothing else would notice them going missing.
	await page.goto("/");
	await page.waitForFunction(() => document.fonts.status === "loaded", undefined, {
		timeout: 15_000,
	});
	const state = await page.evaluate(async () => {
		const el = document.querySelector<HTMLElement>(".home__copy p");
		const cuts: Record<string, string> = {};
		for (const f of Array.from(document.fonts as unknown as Set<FontFace>)) {
			if (f.family.replace(/^["']|["']$/g, "") !== "Mondwest") continue;
			// A face is only fetched when something on the page uses it, so ask for the
			// ones no element happens to exercise before reading status.
			if (f.status === "unloaded") await f.load().catch(() => {});
			cuts[f.weight] = f.status;
		}
		return { weight: el ? getComputedStyle(el).fontWeight : null, cuts };
	});
	expect(state.weight, "body copy is not asking for the Regular").toBe("400");
	// Each cut is declared exactly once, so a missing key means the @font-face rule
	// itself went away — a different bug from the file failing to load, and worth
	// telling apart in the failure message.
	expect(Object.keys(state.cuts).sort(), "the four Mondwest cuts are not all declared").toEqual([
		"200",
		"300",
		"400",
		"700",
	]);
	for (const w of ["200", "300", "400", "700"]) {
		expect(state.cuts[w], `the ${w} cut did not load`).toBe("loaded");
	}
});

test("a section heading gets the REAL Bold, not a synthesised one", async ({ page }) => {
	// Two things, and the second is why this test is not just the one above.
	//
	// font-synthesis-weight: none is a site-wide guard (see global.css): Mondwest
	// is a bitmap face and faux-bolding smears its pixel grid. Losing it would
	// degrade type across the site without any other test noticing.
	//
	// But that guard also means a weight request with no matching cut renders at
	// whatever DID ship — silently, and looking merely "a bit light". So also assert
	// the 700 cut is really loaded where it is asked for: together, the two say the
	// emphasis is drawn, not faked, and not quietly absent. A post's section
	// headings are the heading role at its Bold, so that is the page to ask on.
	await page.goto("/txt/asserting-on-agent-behavior/");
	await page.waitForFunction(() => document.fonts.status === "loaded", undefined, {
		timeout: 15_000,
	});
	const state = await page.evaluate(() => {
		const el = document.querySelector<HTMLElement>(".ds-prose h2");
		return {
			found: !!el,
			family: el
				? getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/^["']|["']$/g, "")
				: null,
			weight: el ? Number(getComputedStyle(el).fontWeight) : null,
			synthesis: getComputedStyle(document.body).fontSynthesisWeight,
			boldLoaded: document.fonts.check('700 16px "Mondwest"'),
			regularLoaded: document.fonts.check('400 16px "Mondwest"'),
		};
	});
	expect(state.found, "no section heading found — has the Prose markup changed?").toBe(true);
	expect(state.family).toBe("Mondwest");
	expect(state.weight).toBe(700);
	expect(state.synthesis).toBe("none");
	expect(state.regularLoaded).toBe(true);
	expect(state.boldLoaded).toBe(true);
});
