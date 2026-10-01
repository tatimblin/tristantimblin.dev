import { test, expect, type Page } from "@playwright/test";

/**
 * THE STEPS MOTION, ON A REAL PAGE.
 *
 * The post art for "Asserting on Agent Behavior" is a baked scene — the
 * black box and its trace, the graphic alone — whose run is a `steps`
 * group (motion.css): three beats, one per assertion of the read-order
 * test, landing one slot apart off one clock — a tick and a ripple in the
 * assertion's node (no now-mark: the ticks are the count). The unit
 * fixtures hold the validator; this spec pins what only a browser can —
 * that the host's clock runs and the beats read it:
 *
 *   rest        paused, the clock at 0: the FINISHED run (every tick lit,
 *               no ripple) — the poster
 *   hover       the quilt tile plays inside its hovered link: the clock
 *               advances, the run resets and ticks beat by beat, an
 *               unlanded tick faint
 *   the post    the mark carries data-art-play and runs from the start
 *   reduced     the loop is 0s and the finished run is all that shows
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

/** The finished sequence: every beat lit, no ripple, and — when the file has now-marks (`nows`, one a beat unless said) — only the last beat's. */
const finished = (s: State, beats: number, nows = beats) => {
	expect(s.beats, "every beat lit").toEqual(Array(beats).fill(1));
	expect(s.now, "only the last beat's now-mark").toEqual(nows ? [...Array(nows - 1).fill(0), 1] : []);
	expect(s.ripples.every((o) => o === 0), "no ripple").toBe(true);
};

test.describe("steps — the assertion sheet", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/${SLUG}/"])`;

	test("the quilt tile: finished and paused at rest, ticking beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "3");
		expect(await group.locator(":scope > [data-beat]").count()).toBe(3);
		// A ripple on every tick, and no now-mark: the ticks are the count.
		expect(await group.locator("[data-now]").count()).toBe(0);
		expect(await group.locator("[data-ripple]").count()).toBe(3);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Three beats plus two slots of hold, a sixth of the 6s loop each: 5s.
		expect(parseFloat(rest.duration)).toBeCloseTo(5, 1);
		finished(rest, 3, 0);

		await page.locator(`${cell} a`).first().hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Past the hold and the reset, mid-run (the second tick landed, the
		// third not yet): the first ticks stay, the last is faint.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000, intervals: [50] }).toBeGreaterThan(2.1 / 5);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(3 / 5);
		expect(mid.beats[0]).toBe(1);
		expect(mid.beats[2]).toBeLessThan(1);

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

	test("reduced motion: the loop is 0s and the finished run is all that shows", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		await page.locator(`${cell} a`).first().hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		expect(s.clock).toBe(0);
		finished(s, 3, 0);
	});
});

/**
 * The Mega Desk: the desk alone, rising sitting to standing in four
 * beats — each beat's now-mark is the whole desk at that height with its
 * height line, so exactly one desk shows at a time, and the still is the
 * standing one.
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

/**
 * Tahoe Mountain Hair: the room as a reverb module, its three sliders turned
 * from San Francisco's settings to Tahoe's in four beats — SF, then
 * ELEVATION, HUMIDITY, HARDNESS one a beat, a ripple at the handle that
 * moved. Each beat's now-mark is all three handles at that moment, so one
 * set shows at a time; the still is Tahoe, dialled in.
 */
test.describe("steps — the climate dialled in", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/tahoe-mountain-hair/"])`;

	test("the quilt tile: Tahoe's settings, paused at rest, turned beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "4");
		expect(await group.locator(":scope > [data-beat] > [data-now]").count()).toBe(4);
		// A ripple for each control turned; none on San Francisco's beat.
		expect(await group.locator("[data-ripple]").count()).toBe(3);
		expect(await group.locator(':scope > [data-beat="0"] [data-ripple]').count()).toBe(0);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Four beats plus two slots of hold, a sixth of the 6s loop each: 6s.
		expect(parseFloat(rest.duration)).toBeCloseTo(6, 1);
		finished(rest, 4);

		await page.locator(`${cell} a`).first().hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Mid-turn: the first beat has landed, one set of handles alone, and not yet Tahoe's.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000 }).toBeGreaterThan(2.2 / 6);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(4 / 6);
		expect(mid.beats[0]).toBe(1);
		expect(mid.now.filter((o) => o === 1)).toHaveLength(1);
		expect(mid.now[3]).toBe(0);
	});

	test("the post: the mark plays from the start", async ({ page }) => {
		await page.goto("/txt/tahoe-mountain-hair/");
		const mark = ".post__mark";
		await expect(page.locator(mark)).toHaveAttribute("data-art-play", "");
		expect((await stateOf(page, mark)).play).toBe("running");
		await expect.poll(async () => (await stateOf(page, mark)).clock).toBeGreaterThan(0);
	});

	test("reduced motion: the loop is 0s and Tahoe's settings are all that show", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		await page.locator(`${cell} a`).first().hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		finished(s, 4);
	});
});

/**
 * Your Car Knows You're Getting Sick: the driving HUD reads its signals,
 * three beats — steering, braking, acceleration — each lighting its bar on
 * the dash and holding the road's rows, the two dials' needles and the
 * wheel's turn (its spokes and coral mark at −8°, 6°, 0°) at that moment —
 * one now-mark a beat, no ripple. The still is all three read, the wheel
 * straight.
 */
test.describe("steps — the driver's signals", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/why-i-joined-fisker/"])`;

	test("the quilt tile: all three read and paused at rest, reading beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "3");
		expect(await group.locator(":scope > [data-beat] > [data-now]").count()).toBe(3);
		expect(await group.locator("[data-ripple]").count()).toBe(0);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Three beats plus two slots of hold, a sixth of the 6s loop each: 5s.
		expect(parseFloat(rest.duration)).toBeCloseTo(5, 1);
		finished(rest, 3);

		await page.locator(`${cell} a`).first().hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Mid-read: the first bar has lit, one road-needles-and-wheel alone, and not yet the last.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000 }).toBeGreaterThan(1.2 / 5);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(2.4 / 5);
		expect(mid.beats[0]).toBe(1);
		expect(mid.now.filter((o) => o === 1)).toHaveLength(1);
		expect(mid.now[2]).toBe(0);
	});

	test("reduced motion: the loop is 0s and the finished read is all that shows", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		await page.locator(`${cell} a`).first().hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		finished(s, 3);
	});
});

/**
 * No Honey, We Have a Dashboard at Home: a tiling of plain app windows, the
 * FOCUS moving across it in three beats — the list, the signals, the twin —
 * each beat's now-mark the focused window's title bar filled solid with its
 * first dot lit coral. No ripple. The still is the twin's window focused.
 */
test.describe("steps — the focus", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/no-honey-we-have-a-dashboard-at-home/"])`;

	test("the quilt tile: the twin focused and paused at rest, the focus moving beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "3");
		expect(await group.locator(":scope > [data-beat] > [data-now]").count()).toBe(3);
		expect(await group.locator("[data-ripple]").count()).toBe(0);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Three beats plus two slots of hold, a sixth of the 6s loop each: 5s.
		expect(parseFloat(rest.duration)).toBeCloseTo(5, 1);
		finished(rest, 3);

		await page.locator(`${cell} a`).first().hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Mid-walk: the first beat has landed, one window focused alone, and not yet the twin.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000, intervals: [50] }).toBeGreaterThan(1.2 / 5);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(2.4 / 5);
		expect(mid.beats[0]).toBe(1);
		expect(mid.now.filter((o) => o === 1)).toHaveLength(1);
		expect(mid.now[2]).toBe(0);
	});

	test("the post: the mark plays from the start", async ({ page }) => {
		await page.goto("/txt/no-honey-we-have-a-dashboard-at-home/");
		const mark = ".post__mark";
		await expect(page.locator(mark)).toHaveAttribute("data-art-play", "");
		expect((await stateOf(page, mark)).play).toBe("running");
		await expect.poll(async () => (await stateOf(page, mark)).clock).toBeGreaterThan(0);
	});

	test("reduced motion: the loop is 0s and the twin focused is all that shows", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		await page.locator(`${cell} a`).first().hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		finished(s, 3);
	});
});
