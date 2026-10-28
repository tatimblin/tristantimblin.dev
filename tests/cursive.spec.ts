import { test, expect, type Page } from "./fixtures/test";
import { CURSIVE_TERMINAL, realCursive } from "./fixtures/cursive-route";

/**
 * THE CURSIVE CARD: <cursive-terminal> from the agent's host, imported the
 * first time the card nears the viewport. Every context answers the agent's
 * hosts with a stub element (tests/fixtures/cursive-route.ts); CURSIVE_REAL=1
 * runs the same specs against the real bundle and the production agent.
 *
 * What a visitor would never notice going wrong, and so what is asserted:
 *  1. The bundle loading while the card is screens away.
 *  2. The build talking to the wrong agent (a production build must render
 *     the production endpoint, server-side).
 *  3. Focus trapped inside the terminal: Tab must leave the card.
 *  4. A failed or hung import leaving a blank card, rather than the DS empty
 *     state.
 */

const card = (page: Page) => page.locator(".wx-cursive");

// Plain scroll, as volo.spec.ts does: the widget row never settles.
const reach = (page: Page) =>
	page.evaluate(() => document.querySelector(".wx-cursive")?.scrollIntoView({ block: "center" }));

test("loads nothing until the card nears the viewport", async ({ page }) => {
	const bundle: string[] = [];
	page.on("request", (r) => r.url().startsWith(CURSIVE_TERMINAL) && bundle.push(r.url()));
	await page.goto("/");
	await expect(card(page)).toHaveAttribute("data-state", "idle");
	await page.waitForTimeout(500);
	expect(bundle, "the bundle loaded with the card screens away").toEqual([]);
});

test("renders the terminal, on the production agent, with today's budget", async ({ page }) => {
	await page.goto("/");
	await reach(page);
	await expect(card(page)).toHaveAttribute("data-state", "ready", { timeout: 15_000 });

	const terminal = card(page).locator("cursive-terminal");
	await expect(terminal).toHaveAttribute("endpoint", "https://agent.cursive.info");
	await expect(terminal.locator(".ct-input")).toBeVisible();
	await expect(card(page).getByRole("link", { name: "cursive.info" })).toHaveAttribute("href", "https://cursive.info");
	await expect(card(page).locator(".wx-cs-empty")).toBeHidden();

	// The meter shows only once the terminal has reported.
	const usage = card(page).locator("[data-cursive-usage]");
	await expect(card(page)).toHaveAttribute("data-usage", /ok|high|exhausted|paused/, { timeout: 15_000 });
	await expect(usage).toBeVisible();
	await expect(usage.locator(".ds-stat__label")).toHaveText(/used today|used up for today|not answering/);
	if (!realCursive) await expect(usage.locator(".ds-stat__value")).toHaveText("42%");
});

test("Tab moves into the terminal and on out of the card", async ({ page }) => {
	await page.goto("/");
	await reach(page);
	await expect(card(page)).toHaveAttribute("data-state", "ready", { timeout: 15_000 });
	const input = card(page).locator(".ct-input");
	await expect(input).toBeVisible();
	// Let the real element finish booting xterm (it adds its own focusables).
	if (realCursive) await expect(card(page).locator(".xterm")).toBeAttached({ timeout: 15_000 });

	await card(page).getByRole("link", { name: "cursive.info" }).focus();
	await page.keyboard.press("Tab");
	await expect(input).toBeFocused();

	// On out: within a few presses (the element may offer a stop button),
	// focus lands outside the card.
	let outside = false;
	for (let i = 0; i < 4 && !outside; i++) {
		await page.keyboard.press("Tab");
		outside = await page.evaluate(() => !document.activeElement?.closest(".wx-cursive"));
	}
	expect(outside, "Tab stayed inside the cursive card").toBe(true);
});

test("shows the empty state when the bundle is blocked", async ({ page }) => {
	await page.route(`${CURSIVE_TERMINAL}.js`, (route) => route.abort());
	await page.goto("/");
	await reach(page);
	await expect(card(page)).toHaveAttribute("data-state", "failed");
	await expect(card(page).locator(".wx-cs-empty")).toHaveText("The agent is offline right now.");
	await expect(card(page).locator(".wx-cs-empty")).toBeVisible();
	await expect(card(page).locator("cursive-terminal")).toBeHidden();
	await expect(card(page).locator("[data-cursive-usage]")).toBeHidden();
});

test("gives up on a bundle that never arrives", async ({ page }) => {
	await page.clock.install();
	await page.route(`${CURSIVE_TERMINAL}.js`, () => {
		/* never answered */
	});
	await page.goto("/");
	await reach(page);
	await expect(card(page)).toHaveAttribute("data-state", "loading");
	await page.clock.runFor(8_100);
	await expect(card(page)).toHaveAttribute("data-state", "failed");
	await expect(card(page).locator(".wx-cs-empty")).toBeVisible();
});
