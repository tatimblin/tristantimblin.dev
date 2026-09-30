import { test, expect, type Page } from "@playwright/test";

/**
 * THE STEPS MOTION, ON A REAL PAGE.
 *
 * The post art for "Asserting on Agent Behavior" is a baked scene, a
 * module sheet, whose run is a `steps` group (motion.css): three beats,
 * one per assertion of the read-order test, landing one slot apart off
 * one clock — a tick and a ripple in the assertion's node, and the big
 * counter as a now-mark per beat (1/3, 2/3, 3/3). The unit fixtures hold
 * the validator; this spec pins what only a browser can — that the host's
 * clock runs and the beats read it:
 *
 *   rest        paused, the clock at 0: the FINISHED run (every tick lit,
 *               only 3/3 shown, no ripple) — the poster
 *   hover       the quilt tile plays inside its hovered link: the clock
 *               advances, the run resets and ticks beat by beat, an
 *               unlanded tick faint, the current count alone
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

const finished = (s: State, beats: number) => {
	expect(s.beats, "every beat lit").toEqual(Array(beats).fill(1));
	expect(s.now, "only the last beat's now-mark").toEqual([...Array(beats - 1).fill(0), 1]);
	expect(s.ripples.every((o) => o === 0), "no ripple").toBe(true);
};

test.describe("steps — the assertion sheet", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/${SLUG}/"])`;

	test("the quilt tile: finished and paused at rest, ticking beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "3");
		expect(await group.locator(":scope > [data-beat]").count()).toBe(3);
		// One counter per beat, a ripple on every tick.
		expect(await group.locator("[data-now]").count()).toBe(3);
		expect(await group.locator("[data-ripple]").count()).toBe(3);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Three beats plus two slots of hold, a sixth of the 6s loop each: 5s.
		expect(parseFloat(rest.duration)).toBeCloseTo(5, 1);
		finished(rest, 3);

		await page.locator(`${cell} a`).first().hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Past the hold and the reset, mid-run (the second tick landed, the
		// third not yet): the first ticks stay, the last is faint, and the
		// current count is the only one shown.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000, intervals: [50] }).toBeGreaterThan(2.1 / 5);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(3 / 5);
		expect(mid.beats[0]).toBe(1);
		expect(mid.beats[2]).toBeLessThan(1);
		expect(mid.now.filter((o) => o === 1)).toHaveLength(1);
		expect(mid.now[2]).toBe(0);

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
		finished(s, 3);
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

/**
 * Tahoe Mountain Hair: the module sheet's water cycle, five beats round
 * the orbit — cloud, snow, melt, lake, vapour — each lighting its arc and
 * ringing its stage (the icon in cyan) while current. No ripple. The still
 * is the whole cycle lit, vapour ringed.
 */
test.describe("steps — the water cycle", () => {
	const cell = `[data-cell="post"]:has(a[href="/txt/tahoe-mountain-hair/"])`;
	/** The now-marks in document order: one ring per beat. */
	const NOW_BEAT = [0, 1, 2, 3, 4];
	const cycled = (s: State) => {
		expect(s.beats, "every beat lit").toEqual(Array(5).fill(1));
		expect(s.now, "only the last beat's ring").toEqual(NOW_BEAT.map((b) => (b === 4 ? 1 : 0)));
		expect(s.ripples.every((o) => o === 0), "no ripple").toBe(true);
	};

	test("the quilt tile: the whole cycle, paused at rest, going round beat by beat under the pointer", async ({ page }) => {
		await page.goto("/txt/");
		const group = page.locator(`${cell} ${STEPS}`);
		await expect(group).toHaveAttribute("data-beats", "5");
		expect(await group.locator(":scope > [data-beat]").count()).toBe(5);
		expect(await group.locator("[data-now]").count()).toBe(NOW_BEAT.length);
		expect(await group.locator("[data-ripple]").count()).toBe(0);

		const rest = await stateOf(page, cell);
		expect(rest.play).toBe("paused");
		expect(rest.clock).toBe(0);
		// Five beats plus two slots of hold, a sixth of the 6s loop each: 7s.
		expect(parseFloat(rest.duration)).toBeCloseTo(7, 1);
		cycled(rest);

		await page.locator(`${cell} a`).first().hover();
		await expect.poll(async () => (await stateOf(page, cell)).play).toBe("running");
		// Mid-cycle: the first beat has landed and stays, the last is faint, one beat's rings alone.
		await expect.poll(async () => (await stateOf(page, cell)).clock, { timeout: 5000 }).toBeGreaterThan(3.2 / 7);
		const mid = await stateOf(page, cell);
		expect(mid.clock).toBeLessThan(5 / 7);
		expect(mid.beats[0]).toBe(1);
		expect(mid.beats[4]).toBeLessThan(1);
		const lit = new Set(NOW_BEAT.filter((_, i) => mid.now[i] === 1));
		expect(lit.size).toBe(1);
		expect(lit.has(4)).toBe(false);
	});

	test("the post: the mark plays from the start", async ({ page }) => {
		await page.goto("/txt/tahoe-mountain-hair/");
		const mark = ".post__mark";
		await expect(page.locator(mark)).toHaveAttribute("data-art-play", "");
		expect((await stateOf(page, mark)).play).toBe("running");
		await expect.poll(async () => (await stateOf(page, mark)).clock).toBeGreaterThan(0);
	});

	test("reduced motion: the loop is 0s and the whole cycle is all that shows", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/txt/");
		await page.locator(`${cell} a`).first().hover();
		const s = await stateOf(page, cell);
		expect(s.duration).toBe("0s");
		cycled(s);
	});
});

/**
 * Your Car Knows You're Getting Sick: the car reads its signals, three
 * beats — steering, braking, acceleration — each landing its trace and
 * holding the wheel's spokes at that moment's angle (one now-mark a beat,
 * no ripple). The still is all three read, the wheel straight.
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
		// Mid-read: the first trace has landed, one wheel alone, and not yet the straight one.
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
