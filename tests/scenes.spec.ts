import { test, expect } from "@playwright/test";
import { SCENE_NAMES } from "../packages/design-system/src/scenes/names";

/**
 * THE SCENES SECTION OF THE CATALOGUE, IN THE BROWSER.
 *
 * /design-system#scenes shows the globe — the L4 data route — the head
 * — 3D → line — the hud — hand vector — and the phone — constructed —
 * through Scene on both themes' pages, with their
 * HTML readouts over them. This spec
 * pins what the unit tests cannot: that the baked file renders inline
 * through the frame (its viewBox, its two motion groups), that a labelled
 * scene is an image whose readouts are still real text OUTSIDE the
 * role="img" element, that the motion contract holds on a scene — paused
 * at rest, running under the pointer anywhere on the scene (the readouts
 * sit over the frame), still under reduced motion — that the glow is the
 * dark page's alone, resolved by the nearest theme (a light ThemePage on
 * the dark page has none), and that the credit is on the page — for the
 * head, the CC BY attribution the licence requires, and its reticle over
 * the eye, a mark the source placed by a model point.
 */

const PAGE = "/design-system/";

test.describe("scenes", () => {
	test("renders the globe on both pages, no console errors", async ({ page }) => {
		const errors: string[] = [];
		page.on("console", (m) => {
			if (m.type() === "error") errors.push(m.text());
		});
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto(PAGE);
		const section = page.locator("#scenes");
		await expect(section).toHaveCount(1);
		for (const theme of ["light", "dark"]) {
			const scene = page.locator(`[data-scene-demo="${theme}"]`);
			await expect(scene, theme).toHaveCount(1);
			await expect(scene, theme).toHaveAttribute("data-scene", "globe");
			const svg = scene.locator(".ds-scene__frame > svg");
			await expect(svg, theme).toHaveAttribute("viewBox", "0 0 400 400");
			await expect(svg.locator('[data-motion="spin"]'), theme).toHaveCount(1);
			await expect(svg.locator('[data-motion="blink"]'), theme).toHaveCount(1);
			// No text inside the drawing; the readouts are HTML beside it.
			await expect(svg.locator("text"), theme).toHaveCount(0);
			await expect(scene.locator(".ds-scene__readouts .ds-scene-label").first(), theme).toContainText("300.733 MHz");
			await expect(scene.locator(".ds-scene__credit"), theme).toHaveText("Natural Earth (public domain), via world-atlas 110m");
		}
		expect(errors, errors.join("\n")).toEqual([]);
	});

	test("renders the hud — the hand-vector route — on both pages: the plate, its dash motion, no text", async ({ page }) => {
		await page.goto(PAGE);
		for (const theme of ["light", "dark"]) {
			const scene = page.locator(`[data-scene-demo="hud-${theme}"]`);
			await expect(scene, theme).toHaveAttribute("data-scene", "hud");
			const svg = scene.locator(".ds-scene__frame > svg");
			await expect(svg, theme).toHaveAttribute("viewBox", "0 0 320 180");
			await expect(svg.locator('[data-motion="dash"]'), theme).toHaveCount(1);
			await expect(svg.locator("text"), theme).toHaveCount(0);
			await expect(scene.locator(".ds-scene__readouts"), theme).toContainText("104.7");
			const f = await scene.locator(".ds-scene__frame").boundingBox();
			expect(f && Math.abs(f.width / f.height - 16 / 9) < 0.02, "a 320×180 scene is a 16:9 box").toBe(true);
		}
	});

	test("renders the head on both pages, credited, its readouts and motion in place", async ({ page }) => {
		const errors: string[] = [];
		page.on("pageerror", (e) => errors.push(e.message));
		await page.goto(PAGE);
		for (const theme of ["light", "dark"]) {
			const scene = page.locator(`[data-scene-demo="head-${theme}"]`);
			await expect(scene, theme).toHaveCount(1);
			await expect(scene, theme).toHaveAttribute("data-scene", "head");
			const svg = scene.locator(".ds-scene__frame > svg");
			await expect(svg, theme).toHaveAttribute("viewBox", "0 0 400 400");
			// The scanner's marching eye plane and the reticle's blinking centre: the scene's two motions.
			await expect(svg.locator('[data-motion="dash"]'), theme).toHaveCount(1);
			await expect(svg.locator('[data-motion="blink"]'), theme).toHaveCount(1);
			await expect(svg.locator("text"), theme).toHaveCount(0);
			// The line work: the slices and the silhouette are a handful of long paths, not thousands of marks.
			expect(await svg.locator("*").count(), theme).toBeLessThan(40);
			await expect(scene.locator(".ds-scene__readouts .ds-scene-label").first(), theme).toContainText("[SCAN]-SUBJ.07");
			await expect(scene.locator(".ds-scene__readouts [data-gen='ladder']"), theme).toHaveCount(1);
			// The scan is CC BY: the attribution is under the frame.
			await expect(scene.locator(".ds-scene__credit"), theme).toHaveText("Lee Perry-Smith head scan by Infinite-Realities, CC BY 3.0");
		}
		expect(errors, errors.join("\n")).toEqual([]);
	});

	test("the head's reticle is on the near eye, in the frame's upper middle", async ({ page }) => {
		await page.goto(PAGE);
		const scene = page.locator('[data-scene-demo="head-dark"]');
		const frame = scene.locator(".ds-scene__frame > svg");
		const reticle = frame.locator('circle[r="12"]');
		await expect(reticle).toHaveCount(1);
		const [f, r] = await Promise.all([frame.boundingBox(), reticle.boundingBox()]);
		expect(f && r).toBeTruthy();
		const cx = (r!.x + r!.width / 2 - f!.x) / f!.width;
		const cy = (r!.y + r!.height / 2 - f!.y) / f!.height;
		// The source projects the eye's model point with the same fit as the lines: panel (208.3, 146.1).
		expect(Math.abs(cx - 208.3 / 400)).toBeLessThan(0.01);
		expect(Math.abs(cy - 146.1 / 400)).toBeLessThan(0.01);
	});

	test("every registered scene is on the page", async ({ page }) => {
		await page.goto(PAGE);
		for (const name of SCENE_NAMES) {
			await expect(page.locator(`[data-scene="${name}"]`).first(), name).toBeVisible();
		}
	});

	test("a labelled scene is an image; its readouts are text outside it", async ({ page }) => {
		await page.goto(PAGE);
		const scene = page.locator('[data-scene-demo="dark"]');
		const frame = scene.locator(".ds-scene__frame");
		await expect(frame).toHaveAttribute("role", "img");
		await expect(frame).toHaveAttribute("aria-label", /The Earth over the Atlantic/);
		// The readout layer is the frame's sibling, not its child.
		expect(await frame.locator(".ds-scene-label").count()).toBe(0);
		expect(await scene.locator(":scope > .ds-scene__readouts .ds-scene-label").count()).toBeGreaterThan(5);
		// The frame's box and the layer's are the same box.
		const [f, r] = await Promise.all([frame.boundingBox(), scene.locator(".ds-scene__readouts").boundingBox()]);
		expect(f && r && Math.abs(f.width - r.width) < 1 && Math.abs(f.height - r.height) < 1 && Math.abs(f.y - r.y) < 1).toBe(true);
		expect(f && Math.abs(f.width - f.height) < 1, "a 400×400 scene is a square box").toBe(true);
	});

	test("readouts scale with the scene's width", async ({ page }) => {
		const sizeAt = async (width: number) => {
			await page.setViewportSize({ width, height: 900 });
			await page.goto(PAGE);
			const label = page.locator('[data-scene-demo="dark"] .ds-scene-label').first();
			return label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
		};
		const wide = await sizeAt(1280);
		const narrow = await sizeAt(390);
		expect(wide).toBeGreaterThan(narrow);
	});

	test("motion: paused at rest, running under the pointer over a readout, still under reduced motion", async ({ page }) => {
		await page.goto(PAGE);
		const scene = page.locator('[data-scene-demo="dark"]');
		await scene.scrollIntoViewIfNeeded();
		const state = () =>
			scene.locator("[data-motion]").evaluateAll((els) => els.map((el) => getComputedStyle(el).animationPlayState));
		expect(await state()).toEqual(["paused", "paused"]);
		// Hover a readout: it sits over the frame, and the scene is what plays.
		await scene.locator(".ds-scene-label").first().hover();
		expect(await state()).toEqual(["running", "running"]);
		await page.mouse.move(0, 0);
		expect(await state()).toEqual(["paused", "paused"]);

		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto(PAGE);
		await scene.scrollIntoViewIfNeeded();
		await scene.locator(".ds-scene-label").first().hover();
		const durations = await scene
			.locator("[data-motion]")
			.evaluateAll((els) => els.map((el) => getComputedStyle(el).animationDuration));
		expect(durations).toEqual(["0s", "0s"]);
	});

	test("the glow is the dark page's, by the nearest theme", async ({ page }) => {
		const filters = async () => ({
			light: await page.locator('[data-scene-demo="light"] .ds-scene__frame > svg').evaluate((el) => getComputedStyle(el).filter),
			dark: await page.locator('[data-scene-demo="dark"] .ds-scene__frame > svg').evaluate((el) => getComputedStyle(el).filter),
		});
		for (const theme of ["dark", "light"]) {
			await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
			await page.goto(PAGE);
			const f = await filters();
			expect(f.light, `light ThemePage on the ${theme} page`).toBe("none");
			expect(f.dark, `dark ThemePage on the ${theme} page`).toMatch(/^drop-shadow\(/);
		}
	});
});
