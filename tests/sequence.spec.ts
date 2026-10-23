import { test, expect } from "./fixtures/test";

/**
 * THE SEQUENCE DIAGRAM, IN THE BROWSER.
 *
 * Sequence (theme/design-system) is pure HTML and CSS, so what can go wrong
 * is the markup a reader gets and the width a phone gets. Against the
 * catalogue's two examples: the figure renders with its caption, its steps
 * are an <ol> in reading order (one <li> per step, items sharing a row in
 * one), each message opens with hidden words naming its lanes, and at 360px
 * the four-lane diagram fits inside the viewport without scrolling itself.
 * (The catalogue page as a whole is wider than a phone in other sections,
 * so the width check is the figure's own.)
 */

const PAGE = "/design-system/";

test.describe("sequence diagram", () => {
	test("renders the steps as an ordered list", async ({ page }) => {
		await page.goto(PAGE);
		const figs = page.locator("#sequence figure.ds-sequence");
		await expect(figs).toHaveCount(2);

		const four = figs.first();
		await expect(four.locator("figcaption")).toHaveText(/no messages pasted between chats/i);
		await expect(four.locator(".ds-sequence__actor")).toHaveCount(4);
		await expect(four.locator("ol.ds-sequence__steps > li")).toHaveCount(7);
		await expect(four.locator(".ds-sequence__message").first()).toContainText(
			"Jess to Jess’s Claude: Paginate by cursor instead",
		);
		await expect(four.locator(".ds-sequence__line").first()).toHaveAttribute("aria-hidden", "true");

		await expect(figs.nth(1).locator("ol.ds-sequence__steps > li")).toHaveCount(4);
	});

	test("fits a 360px phone", async ({ page }) => {
		await page.setViewportSize({ width: 360, height: 800 });
		await page.goto(PAGE);
		const boxes = await page.locator("#sequence figure.ds-sequence").evaluateAll((figs) =>
			figs.map((f) => {
				const stage = f.querySelector(".ds-sequence__stage") as HTMLElement;
				return {
					right: f.getBoundingClientRect().right,
					scroll: stage.scrollWidth,
					client: stage.clientWidth,
				};
			}),
		);
		for (const b of boxes) {
			expect(b.right).toBeLessThanOrEqual(360);
			expect(b.scroll).toBeLessThanOrEqual(b.client);
		}
	});
});
