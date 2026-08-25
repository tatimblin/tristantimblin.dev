import { test, expect } from "@playwright/test";

/**
 * THE FIVE SELF-HOSTED FACES, AND THE ROLES THEY FILL.
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
	["hero lede", ".hero-intro__lede p", "FS Mondwest", 400],
	["body copy", ".home__copy p", "PP Mondwest", 400],
	["widget UI", ".home__widgets .ds-widget", "Neue Montreal", 300],
	["widget figure", ".wx-stat-num", "Neue Montreal", 300],
	["ruler year mark", ".vc__tick-year", "Neue Montreal", 300],
];

const FILES = [
	"migra-medium.woff2",
	"migra-bold.woff2",
	"fs-mondwest-bold.woff2",
	"ppmondwest-regular.woff2",
	"neue-montreal-light.woff2",
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

test("the UI face is not asked for a weight it does not ship", async ({ page }) => {
	// Neue Montreal ships ONE cut (Light/300). global.css sets
	// font-synthesis-weight: none precisely so a heavier request renders at the real
	// weight instead of a faux bold — this pins that guard, since losing it would
	// smear every widget figure without any test failing.
	await page.goto("/");
	const synthesis = await page.evaluate(
		() => getComputedStyle(document.body).fontSynthesisWeight
	);
	expect(synthesis).toBe("none");
});
