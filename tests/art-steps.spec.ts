import { test, expect, type Page } from "@playwright/test";

/**
 * THE STEPS MOTION, ON A REAL PAGE.
 *
 * The post art for "Asserting on Agent Behavior" is a baked scene whose
 * walk is a `steps` group (motion.css): six beats landing one slot apart
 * off one clock, a ripple on each landing, a pointer copy per beat. The
 * unit fixtures hold the validator; this spec pins what only a browser
 * can — that the host's clock runs and the beats read it:
 *
 *   rest        paused, the clock at 0: the FINISHED walk (every beat lit,
 *               only the last beat's now-mark shown, no ripple) — the poster
 *   hover       the quilt tile plays inside its hovered link: the clock
 *               advances, the walk resets and lands beat by beat, an
 *               unlanded beat faint, the current beat's now-mark alone
 *   the post    the mark carries data-art-play and runs from the start
 *   reduced     the loop is 0s and the finished walk is all that shows
 */

const SLUG = "asserting-on-agent-behavior";
const STEPS = '[data-motion="steps"]';

interface State {
	play: string;
	duration: string;
	clock: number;
	beats: number[];
	now: number[];
	ripples: number[];
}

/** The steps group's state, read off computed style: the clock, each beat's opacity, each now-mark's, each ripple's. */
const stateOf = (page: Page, scope: string): Promise<State> =>
	page.locator(`${scope} ${STEPS}`).evaluate((g) => {
		const s = getComputedStyle(g);
		const op = (el: Element) => Number(getComputedStyle(el).opacity);
		return {
			play: s.animationPlayState,
			duration: s.animationDuration,
			clock: Number(s.getPropertyValue("--art-clock")),
			beats: [...g.children].map(op),
			now: [...g.querySelectorAll("[data-now]")].map(op),
			ripples: [...g.querySelectorAll("[data-ripple]")].map(op),
		};
	});

const finished = (s: State, beats: number) => {
	expect(s.beats, "every beat lit").toEqual(Array(beats).fill(1));
	expect(s.now, "only the last beat's now-mark").toEqual([...Array(beats - 1).fill(0), 1]);
	expect(s.ripples.every((o) => o === 0), "no ripple").toBe(true);
};

test.describe("steps — the assertion board", () => {
	test("the quilt tile: finished and paused at rest, walking beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const cell = `[data-cell="post"][data-no="005"]`;
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "6");
		expect(await group.locator(":scope > [data-beat]").count()).toBe(6);
		// One pointer copy per beat, a ripple on every landing but the start.
		expect(await group.locator("[data-now]").count()).toBe(6);
		expect(await group.locator("[data-ripple]").count()).toBe(5);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Six beats plus two slots of hold, a sixth of the 6s loop each: 8s.
		expect(parseFloat(rest.duration)).toBeCloseTo(8, 1);
		finished(rest, 6);

		await page.locator(`${cell} a`).hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Past the hold and the reset, mid-walk: the clock has advanced, the
		// first beats have landed and stay, later ones are faint, and the
		// current beat's now-mark is the only one shown.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000 }).toBeGreaterThan(3.2 / 8);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(5 / 8);
		expect(mid.beats[0]).toBe(1);
		expect(mid.beats[5]).toBeCloseTo(0.09, 2);
		expect(mid.now.filter((o) => o === 1)).toHaveLength(1);
		expect(mid.now[5]).toBe(0);

		// Leaving pauses it in place, as every motion does.
		await page.mouse.move(0, 0);
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("paused");
	});

	test("the post: the mark plays from the start", async ({ page }) => {
		await page.goto(`/txt/${SLUG}/`);
		const mark = ".post__mark";
		await expect(page.locator(mark)).toHaveAttribute("data-art-play", "");
		const s = await stateOf(page, mark);
		expect(s.play).toBe("running");
		await expect.poll(async () => (await stateOf(page, mark)).clock).toBeGreaterThan(0);
	});

	test("reduced motion: the loop is 0s and the finished walk is all that shows", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		const cell = `[data-cell="post"][data-no="005"]`;
		await page.locator(`${cell} a`).hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		expect(s.clock).toBe(0);
		finished(s, 6);
	});
});

/**
 * The Mega Desk: the drafting sheet, the desk rising sitting to standing
 * in four beats — each beat's now-mark is the whole desk at that height,
 * so exactly one desk shows at a time, and the still is the standing one.
 */
test.describe("steps — the mega desk", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/mega-desk/"])`;

	test("the quilt tile: standing and paused at rest, rising beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "4");
		// A desk per beat, and no ripple: the rise is the height, not a landing.
		expect(await group.locator(":scope > [data-beat] > [data-now]").count()).toBe(4);
		expect(await group.locator("[data-ripple]").count()).toBe(0);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Four beats plus two slots of hold, a sixth of the 6s loop each: 6s.
		expect(parseFloat(rest.duration)).toBeCloseTo(6, 1);
		finished(rest, 4);

		await page.locator(`${cell} a`).hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Mid-rise: one desk only, and it is not yet the standing one.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000 }).toBeGreaterThan(2.2 / 6);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(4 / 6);
		expect(mid.beats[0]).toBe(1);
		expect(mid.now.filter((o) => o === 1)).toHaveLength(1);
		expect(mid.now[3]).toBe(0);
	});

	test("reduced motion: the loop is 0s and the standing desk is all that shows", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		await page.locator(`${cell} a`).first().hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		finished(s, 4);
	});
});
