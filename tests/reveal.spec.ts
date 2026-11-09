import { test, expect, type Page } from "./fixtures/test";

/**
 * THE REVEAL SAFETY INVARIANTS. src/lib/reveal.ts hides content and eases it in,
 * which is only defensible if every failure path ends with it visible. Three
 * independent escape hatches (the armed class never added; an inline timeout
 * removes it; the state attribute set), none of which fire in normal operation,
 * so each is exercised here. Against the built site, so minification is in scope
 * (the longhands note in src/styles/reveal.css).
 */

interface RevealState {
	armed: boolean;
	/** Targets not yet flipped to the revealed state. */
	pending: number;
	/** Targets whose computed opacity is still below 1. */
	faded: number;
	total: number;
	/** Resolved on :root, to prove the token layer shipped. */
	easeToken: string;
	durationToken: string;
}

async function readReveal(page: Page): Promise<RevealState> {
	return page.evaluate(() => {
		const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
		const root = getComputedStyle(document.documentElement);
		return {
			armed: document.documentElement.classList.contains("reveal-armed"),
			pending: all.filter((el) => el.dataset.revealState !== "in").length,
			faded: all.filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
			total: all.length,
			easeToken: root.getPropertyValue("--ease-reveal").trim(),
			durationToken: root.getPropertyValue("--duration-reveal").trim(),
		};
	});
}

/**
 * Wait until nothing is hidden any more: computed opacity, not the armed class.
 * Disarming only stops the hidden rule matching; each element still has its ~900ms
 * transition to run, and the 3s backstop can drop the class mid-fade. The ceiling
 * is above backstop + transition.
 */
async function settleReveal(page: Page) {
	await page.waitForFunction(
		() =>
			Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]")).every(
				(el) => Number(getComputedStyle(el).opacity) === 1
			),
		undefined,
		{ timeout: 8000 }
	);
	await page.evaluate(
		() => new Promise<void>((r) => requestAnimationFrame(() => r()))
	);
}

/** Scroll the whole page, so every card reaches its in-view line. */
async function walkPage(page: Page) {
	const height = await page.evaluate(() => document.documentElement.scrollHeight);
	for (let y = 0; y <= height; y += 300) {
		await page.evaluate((v) => window.scrollTo(0, v), y);
		await page.waitForTimeout(40);
	}
}

test.describe("reveal — safety", () => {
	test("1. NO-JS: nothing is hidden when scripting is off", async ({ browser }) => {
		// The hidden rule is scoped to a class only script can add.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto("/");

		const state = await page.evaluate(() => {
			const all = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
			return {
				total: all.length,
				faded: all.filter((el) => Number(getComputedStyle(el).opacity) < 1).length,
				armed: document.documentElement.classList.contains("reveal-armed"),
			};
		});

		// The page must actually HAVE targets, or this passes vacuously.
		expect(state.total).toBeGreaterThan(0);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);

		await context.close();
	});

	test("2. TERMINAL: content appears even with every asset blocked", async ({ page }) => {
		// With the images the coordinator waits on dead, readiness never resolves
		// normally, which exercises the deadline + inline backstop.
		await page.route("**/*.{webp,avif,png,jpg,jpeg,gif,mp4,webm}", (route) => route.abort());
		await page.goto("/");

		// A card is held until it is reached, so walk them all into view.
		await walkPage(page);
		await settleReveal(page);
		const state = await readReveal(page);

		expect(state.total).toBeGreaterThan(0);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);
		// `pending` is deliberately not asserted: the backstop un-hides by removing
		// the class without walking the elements, so groups below the fold keep it.
	});

	test("3. HERO-FREE: no reveal gates the hero", async ({ page }) => {
		await page.goto("/");

		// The homepage's LCP element is the wordmark inside the lockup, so gating
		// anything here would delay a real metric.
		expect(await page.locator("stories-heading [data-reveal]").count()).toBe(0);
		expect(await page.locator("stories-heading[data-reveal]").count()).toBe(0);

		// And the lockup itself is fully opaque from the start.
		const heroOpacity = await page.evaluate(() => {
			const sh = document.querySelector("stories-heading");
			return sh ? Number(getComputedStyle(sh).opacity) : null;
		});
		expect(heroOpacity).toBe(1);
	});

	test("4. REDUCED MOTION: never armed, nothing hidden", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");

		const state = await readReveal(page);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);

		// No transition either — the end state is simply present.
		const duration = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>("[data-reveal]");
			return el ? getComputedStyle(el).transitionDuration : null;
		});
		expect(duration === "0s" || duration === null).toBe(true);
	});

	test("5. TOKENS: the motion layer survives the production build", async ({ page }) => {
		await page.goto("/");

		// A declaration silently dropped in prod (a folded shorthand, an unresolved
		// custom property, a token file that didn't ship) looks fine in dev.
		const state = await readReveal(page);
		expect(state.easeToken).toContain("cubic-bezier");
		expect(state.durationToken).not.toBe("");

		// The token has to actually reach a target's resolved transition, not merely
		// exist on :root.
		const ms = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>("[data-reveal]");
			if (!el) return null;
			return parseFloat(getComputedStyle(el).transitionDuration) * 1000;
		});
		expect(ms).toBeGreaterThan(0);
	});

	test("6. IDEMPOTENT: survives a view-transition round trip", async ({ page }) => {
		await page.goto("/");
		await walkPage(page);
		await settleReveal(page);

		// ClientRouter swaps the document; the coordinator must rebuild without
		// double-binding or stranding anything hidden. The click is dispatched, not
		// locator.click(): the navigation matters here, not the hit-testing.
		await page.evaluate(() => {
			const link = Array.from(document.querySelectorAll<HTMLAnchorElement>("a")).find(
				(a) => a.textContent?.trim() === "Writing"
			);
			link?.click();
		});
		await page.waitForURL("**/txt/");
		await settleReveal(page);
		expect((await readReveal(page)).faded).toBe(0);

		await page.goBack();
		await settleReveal(page);
		const state = await readReveal(page);
		expect(state.faded).toBe(0);
		expect(state.pending).toBe(0);
	});
	test("7. LIFECYCLE: widget-owned reveals re-arm after a round trip", async ({
		page,
	}) => {
		// Astro runs a component's bundled script once, but ClientRouter replaces the
		// DOM on every navigation: anything that marks the card from module scope ends
		// up on a detached node, and the bike (BikeStats.astro) rests at `opacity: 0`.
		const bikeOpacity = () =>
			page
				.locator(".wx-baywheels .wx-bw-bike")
				.evaluate((el: Element) => parseFloat(getComputedStyle(el).opacity));

		// Poll, don't sample: the bike has its own ~1s transition, which settleReveal()
		// doesn't cover (it reads [data-reveal], a different element), so a single read
		// can catch 0 mid-fade. A detached observer still fails, on the timeout.
		const expectWatermarkShown = async (when: string) =>
			expect
				.poll(bikeOpacity, {
					timeout: 8000,
					message: `the bike drawing never faded in (${when})`,
				})
				.toBeGreaterThan(0);

		// Plain scroll, not scrollIntoViewIfNeeded(): the grid never fully settles (its
		// reveal and the dock lift animate it), so waiting for a still box times out on
		// a slow runner.
		const show = async () => {
			// Wait for the element first: ClientRouter swaps the DOM after the URL changes,
			// so the optional chain below can no-op on the previous page's body.
			await page.locator(".wx-baywheels").waitFor({ state: "attached" });
			await page.evaluate(() =>
				document.querySelector(".wx-baywheels")?.scrollIntoView({ block: "center" })
			);
		};

		await page.goto("/");
		await show();
		await walkPage(page);
		await settleReveal(page);
		await expectWatermarkShown("first load");

		// Dispatch the click rather than hit-test it, per test 6.
		await page.evaluate(() => {
			const link = Array.from(
				document.querySelectorAll<HTMLAnchorElement>("a")
			).find((a) => a.textContent?.trim() === "Writing");
			link?.click();
		});
		await page.waitForURL("**/txt/");
		await page.goBack();
		await page.waitForURL((u) => u.pathname === "/");

		await show();
		await settleReveal(page);
		await expectWatermarkShown("after a round trip");
	});
});

test.describe("reveal — below-the-fold behaviour", () => {
	/** The cards that take part in the stagger, as the page packed them. */
	const cards = (page: Page) =>
		page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLElement>('[data-reveal="row"]')).map((el) => {
				const r = el.getBoundingClientRect();
				// Without the entrance's own rise, which may be mid-flight.
				const t = getComputedStyle(el).translate;
				const rise = t === "none" ? 0 : parseFloat(t.split(" ")[1] ?? "0") || 0;
				return {
					name: el.dataset.widget,
					top: Math.round(r.top - rise + scrollY),
					left: r.left,
					state: el.dataset.revealState,
					delayMs: Math.round(parseFloat(getComputedStyle(el).transitionDelay) * 1000),
				};
			})
		);

	test("each card waits for its own turn: a lower one is held while an upper one is in", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await page.waitForFunction(
			() => document.querySelector('[data-reveal="row"]')?.hasAttribute("data-reveal-state") === true
		);
		// Bring only the first row into view (its top, past the in-view line).
		await page.evaluate(() => {
			const top = document.querySelector('[data-widget="now-playing"]')!.getBoundingClientRect().top;
			window.scrollTo(0, top + scrollY - 500);
		});
		await page.waitForFunction(
			() =>
				document.querySelector<HTMLElement>('[data-widget="now-playing"]')?.dataset.revealState === "in",
			undefined,
			{ timeout: 6000 }
		);
		const state = await cards(page);
		const byName = Object.fromEntries(state.map((c) => [c.name, c]));
		expect(byName["now-playing"].state).toBe("in");
		expect(byName["cursive"].state, "a card further down waits").toBe("pending");
		expect(byName["amc"].state).toBe("pending");
	});

	test("cards that arrive together start left to right, not at once", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await page.waitForFunction(
			() => document.querySelector('[data-reveal="row"]')?.hasAttribute("data-reveal-state") === true
		);
		// Walk down, so this row arrives on its own rather than with the rows above it.
		const target = await page.evaluate(
			() => document.querySelector(".wx-cursive")!.getBoundingClientRect().top + scrollY - 500
		);
		for (let y = 0; y <= target; y += 100) {
			await page.evaluate((v) => window.scrollTo(0, v), y);
			await page.waitForTimeout(100);
		}
		await page.evaluate((v) => window.scrollTo(0, v), target);
		await page.waitForFunction(
			() =>
				["cursive", "github", "readers"].every(
					(n) =>
						document.querySelector<HTMLElement>(`[data-widget="${n}"]`)?.dataset.revealState === "in"
				),
			undefined,
			{ timeout: 6000 }
		);
		const row = (await cards(page))
			.filter((c) => ["cursive", "github", "readers"].includes(c.name!))
			.sort((a, b) => a.left - b.left);
		expect(new Set(row.map((c) => c.top)).size, "these three share a row").toBe(1);
		const delays = row.map((c) => c.delayMs);
		expect(delays[0], "the leftmost leads").toBe(0);
		expect(delays[1]).toBeGreaterThan(delays[0]);
		expect(delays[2]).toBeGreaterThan(delays[1]);
	});

	test("the order is the packed grid's on a phone too", async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await page.goto("/");
		await page.waitForFunction(
			() => document.querySelector('[data-reveal="row"]')?.hasAttribute("data-reveal-state") === true
		);
		await page.evaluate(() =>
			window.scrollTo(0, document.documentElement.scrollHeight)
		);
		await settleReveal(page);
		// Everything in view at the jump's end: in packed order, delays rising.
		const inView = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLElement>('[data-reveal="row"]'))
				.map((el) => {
					const r = el.getBoundingClientRect();
					return {
						top: Math.round(r.top),
						left: r.left,
						bottom: r.bottom,
						delayMs: parseFloat(getComputedStyle(el).transitionDelay) * 1000,
					};
				})
				.filter((c) => c.bottom > 0 && c.top < innerHeight)
				.sort((a, b) => a.top - b.top || a.left - b.left)
		);
		expect(inView.length).toBeGreaterThan(1);
		for (let i = 1; i < inView.length; i++) {
			expect(inView[i].delayMs).toBeGreaterThan(inView[i - 1].delayMs);
		}
	});

	test("a jump to the bottom leaves nothing invisible and queues no long stagger", async ({
		page,
	}) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await page.waitForFunction(
			() => document.querySelector('[data-reveal="row"]')?.hasAttribute("data-reveal-state") === true
		);
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await page.waitForFunction(
			() =>
				Array.from(document.querySelectorAll<HTMLElement>('[data-reveal="row"]')).every(
					(el) => el.getBoundingClientRect().top > innerHeight * 0.9 || el.dataset.revealState === "in"
				),
			undefined,
			{ timeout: 6000 }
		);
		const state = await cards(page);
		// Everything the jump passed or landed on has come in, in no more than three steps.
		expect(Math.max(...state.map((c) => c.delayMs))).toBeLessThanOrEqual(3 * 90);
		await page.evaluate(() => window.scrollTo(0, 0));
		await settleReveal(page);
		expect((await readReveal(page)).faded).toBe(0);
	});

	/** Every IntersectionObserver a page constructs, by its options. */
	async function countObservers(page: Page) {
		await page.addInitScript(() => {
			const made: string[] = [];
			(window as unknown as { __ios: string[] }).__ios = made;
			const Real = window.IntersectionObserver;
			window.IntersectionObserver = class extends Real {
				constructor(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
					super(cb, opts);
					made.push(`${opts?.rootMargin ?? ""}|${String(opts?.threshold ?? 0)}`);
				}
			};
		});
	}
	const made = (page: Page) => page.evaluate(() => (window as unknown as { __ios: string[] }).__ios);

	test("the entrance is a subscription on the framework's observers, not an observer per card", async ({
		page,
	}) => {
		await countObservers(page);
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		await page.waitForFunction(
			() => document.querySelector('[data-reveal="row"]')?.hasAttribute("data-reveal-state") === true
		);
		const ios = await made(page);
		expect(ios.filter((k) => k === "0px 0px -10% 0px|0"), "one for all the cards").toHaveLength(1);
		expect(new Set(ios).size, "nothing made twice").toBe(ios.length);
	});

	test("a card reached after the backstop still has its entrance", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		const cursive = page.locator('[data-widget="cursive"]');
		await expect(cursive).toHaveAttribute("data-reveal-state", "pending");
		// Past the head script's 3s, which disarms the page.
		await page.waitForFunction(() => !document.documentElement.classList.contains("reveal-armed"), undefined, {
			timeout: 6000,
		});
		await page.waitForTimeout(1200);
		expect(await cursive.evaluate((el) => Number(getComputedStyle(el).opacity)), "still held").toBe(0);
		await page.evaluate(() => document.querySelector('[data-widget="cursive"]')?.scrollIntoView({ block: "center" }));
		await expect(cursive).toHaveAttribute("data-reveal-state", "in", { timeout: 6000 });
		await expect
			.poll(() => cursive.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 4000 })
			.toBe(1);
	});

	test("a card a screen ahead is built, and still waits to be shown", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		const nowPlaying = page.locator('[data-widget="now-playing"]');
		await expect(nowPlaying).toHaveAttribute("data-widget-state", "mounted", { timeout: 10_000 });
		// Mounted on its near subscription, while its entrance hasn't been reached.
		await expect(nowPlaying).toHaveAttribute("data-reveal-state", "pending");
	});

	test("a card's box doesn't move when it comes in", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");
		const read = () =>
			page.evaluate(() => {
				const el = document.querySelector<HTMLElement>('[data-widget="github"]')!;
				return { top: el.offsetTop, left: el.offsetLeft, w: el.offsetWidth, h: el.offsetHeight };
			});
		const before = await read();
		await page.evaluate(() =>
			document.querySelector(".wx-github")?.scrollIntoView({ block: "center" })
		);
		await settleReveal(page);
		expect(await read()).toEqual(before);
	});

	test("the widget row is held until scrolled to, then staggers in", async ({ page }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto("/");

		// Held: the row is below the fold on load, so it must still be invisible. If a
		// taller viewport ever includes it, change the viewport, not the assertion.
		//
		// Wait for ANY state, not "pending": the module can land late under parallel
		// load, and by then the group may already have flipped to "in".
		await page.waitForFunction(
			() =>
				document
					.querySelector('[data-reveal="row"]')
					?.hasAttribute("data-reveal-state") === true,
			undefined,
			{ timeout: 6000 }
		);
		const held = await page.evaluate(() => {
			const el = document.querySelector<HTMLElement>('[data-reveal="row"]');
			return el
				? {
						opacity: Number(getComputedStyle(el).opacity),
						state: el.dataset.revealState,
						armed: document.documentElement.classList.contains("reveal-armed"),
					}
				: null;
		});

		expect(held?.state).toBe("pending");

		// A pending card is fully invisible, armed or not.
		expect(held?.opacity).toBe(0);

		// Plain scroll, not scrollIntoViewIfNeeded(): this row never fully settles (the
		// reveal and the dock lift animate it), so waiting for a still box times out on
		// a slow runner.
		await page.evaluate(() =>
			document.querySelector('[data-widget="cursive"]')?.scrollIntoView({ block: "center" })
		);

		await page.waitForFunction(
			() =>
				document.querySelector<HTMLElement>('[data-widget="cursive"]')?.dataset.revealState === "in",
			undefined,
			{ timeout: 6000 }
		);

		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
		await settleReveal(page);
		expect((await readReveal(page)).faded).toBe(0);
	});

	test("post images carry intrinsic dimensions", async ({ page }) => {
		// Markdown can't express width/height, so the mapped <Img> takes them off the
		// image's import; without them the article reflows as each decodes.
		await page.goto("/txt/mega-desk/");
		const imgs = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLImageElement>(".ds-prose img")).map(
				(img) => ({
					src: img.getAttribute("src"),
					w: Number(img.getAttribute("width")),
					h: Number(img.getAttribute("height")),
					lazy: img.getAttribute("loading"),
					async: img.getAttribute("decoding"),
				})
			)
		);
		expect(imgs.length).toBeGreaterThan(0);

		for (const img of imgs) {
			expect(img.w).toBeGreaterThan(0);
			expect(img.h).toBeGreaterThan(0);
			expect(img.lazy).toBe("lazy");
			expect(img.async).toBe("async");
		}

		// The published aspect must match the real file. Read off a detached Image():
		// a lazy off-screen <img> reports naturalWidth 0 until it loads.
		const mismatches = await page.evaluate(async (list) => {
			const bad: string[] = [];
			await Promise.all(
				list.map(
					(item) =>
						new Promise<void>((resolve) => {
							const probe = new Image();
							probe.onload = () => {
								if (probe.naturalWidth !== item.w || probe.naturalHeight !== item.h) {
									bad.push(
										`${item.src}: declared ${item.w}x${item.h}, real ${probe.naturalWidth}x${probe.naturalHeight}`
									);
								}
								resolve();
							};
							probe.onerror = () => resolve(); // a broken src is not this test's business
							probe.src = item.src!;
						})
				)
			);
			return bad;
		}, imgs);

		expect(mismatches).toEqual([]);
	});
});

test.describe("reveal — home only", () => {
	for (const path of ["/txt/", "/txt/mega-desk/"]) {
		test(`8. ${path} has no reveal targets and nothing hidden on a hard load`, async ({ page }) => {
			// The reveal belongs to the homepage's cards (HomeLayout): a written page
			// carries no targets and is never armed.
			await page.goto(path);
			const state = await readReveal(page);
			expect(state.total, "a written page should carry no reveal targets").toBe(0);
			expect(state.armed).toBe(false);
			expect(state.faded).toBe(0);
		});
	}

	test("9. a soft navigation home does not arm the page", async ({ page }) => {
		// ClientRouter re-runs an inline head script on a swap, and the arming script
		// comes in with HomeLayout's head: it must stay to hard loads, or cached
		// cards would blink out on the way home.
		await page.goto("/txt/");
		await page.evaluate(() => {
			(window as unknown as { __noReload: boolean }).__noReload = true;
			document.querySelector<HTMLAnchorElement>('a[href="/"]')!.click();
		});
		await page.waitForURL((u) => u.pathname === "/");
		await page.waitForFunction(
			() => document.querySelector('[data-reveal="row"]')?.getAttribute("data-reveal-state") === "in"
		);
		expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
		const state = await readReveal(page);
		expect(state.armed).toBe(false);
		expect(state.faded).toBe(0);
	});
});
