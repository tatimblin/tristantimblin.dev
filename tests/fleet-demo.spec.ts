import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * THE VS CODE EMBED IN THE POST: IT IS EITHER RUNNING, OR IT IS A PICTURE OF
 * ITSELF — AND FROM THE OUTSIDE THOSE LOOK IDENTICAL.
 *
 * A workbench whose initialize() threw still leaves an <iframe> in the page, at
 * the right size, in the right place, painted the theme's background. So does one
 * whose extension host never came up, or whose fleet extension activated against
 * an empty simulator. Nothing in the host page turns red; the reader just sees a
 * dark rectangle and scrolls past. That is the SILENT failure this file exists to
 * catch, and it dictates the one rule every test below follows: never assert on
 * the frame, always assert on DOM the workbench can only have produced by really
 * booting — .monaco-workbench, tree rows, xterm output, a notification toast.
 *
 * Three further failure modes get their own tests, because each is invisible in
 * the same way — plus a fourth that is the opposite problem: a demo that looks
 * broken while working exactly as written (see the phone test).
 *
 *  1. EAGER LOADING. The whole point of the poster is that a 15 MB bundle does
 *     not download for readers who never press the button. If the element ever
 *     starts fetching on load, the post still looks and behaves exactly the same
 *     — it just costs everyone a workbench. Only the request log can tell.
 *  2. A DEAD TERMINAL. The CAN stream renders to the DOM rather than a canvas
 *     (terminal.integrated.gpuAcceleration is "off" in workbench.ts precisely so
 *     it is readable here). A terminal that opened but never streamed shows a
 *     plausible first screenful and then simply stops, so the assertion has to be
 *     that the text CHANGES, not that text exists.
 *  3. A COMMAND THAT DISPATCHES NOWHERE. Palette → extension host → simulator →
 *     notification is the demo's entire argument. Every hop is async and across a
 *     worker boundary; a break anywhere leaves a palette that accepts the command
 *     and does nothing visible.
 *
 * CHROMIUM ONLY, by inheritance rather than by declaration: the firefox project
 * in playwright.config.ts carries `testMatch: /scroll-fallback\.spec\.ts/`, which
 * is an INCLUDE list, so every other spec — this one included — runs in chromium
 * alone. Nothing here should be added to firefox's list; the workbench is a
 * 15 MB single-engine boot and this suite is not where its portability is argued.
 */

const POST = "/txt/no-honey-we-have-a-dashboard-at-home";

/** The embed's own bundle directory, as the browser asks for it. */
const isEmbedRequest = (url: string) => new URL(url).pathname.startsWith("/fleet-demo/");

/**
 * Press the button and wait for the element's OWN ready signal.
 *
 * data-state="ready" is not "the iframe loaded": the element only sets it on a
 * `fleet-demo:ready` post, which workbench.ts sends only after it has polled the
 * sidebar and seen real tree rows. So waiting on it is already most of an
 * assertion — but a booting workbench compiles three workers from an 11 MB chunk,
 * so it gets a lot more room than Playwright's default.
 */
async function boot(page: Page): Promise<FrameLocator> {
	await page.goto(POST);
	const demo = page.locator("fleet-demo");
	await demo.scrollIntoViewIfNeeded();
	await demo.locator("[data-launch]").click();
	await expect(demo).toHaveAttribute("data-state", "ready", { timeout: 90_000 });

	const frame = page.frameLocator("iframe[data-fleet-demo-frame]");
	await expect(frame.locator(".monaco-workbench")).toHaveCount(1);
	return frame;
}

/**
 * Run a Fleet command the way a reader would.
 *
 * Three details that are easy to get wrong and fail confusingly. The frame
 * needs focus before F1 reaches the workbench rather than the host page —
 * hence the click, aimed at the STATUS BAR and not the editor body: the
 * staged scene makes the controls editor (a webview iframe) the active
 * editor, and a click into the editor body lands on an iframe that swallows
 * pointer events forever — Playwright retries until the test times out. The
 * status bar is plain workbench DOM that belongs to no editor. Opening the
 * picker retries as a unit, because that same webview finishes loading
 * asynchronously after boot and steals focus when it does — which silently
 * DISMISSES a picker opened a beat earlier; a second F1 after the steal
 * sticks. And F1 opens the picker with ">" ALREADY in the box: typing the
 * query with fill() would replace that prefix and silently drop the picker
 * into file-search mode, where "Fleet: Lock All Doors" matches nothing and
 * Enter is a no-op. Append instead.
 */
async function runCommand(page: Page, frame: FrameLocator, title: string) {
	const input = frame.locator(".quick-input-box input");
	await expect(async () => {
		await frame.locator(".part.statusbar").click();
		await page.keyboard.press("F1");
		await expect(input).toBeVisible({ timeout: 2_000 });
	}).toPass({ timeout: 30_000 });
	await expect(input).toHaveValue(">");
	await input.pressSequentially(title, { delay: 15 });

	// The list filters asynchronously; Enter before the match lands runs whatever
	// was highlighted a moment ago.
	await expect(frame.locator(".quick-input-list .monaco-list-row").first()).toContainText(title, {
		timeout: 15_000,
	});
	await page.keyboard.press("Enter");
}

test("the demo stays out of the page until summoned", async ({ page }) => {
	const asked: string[] = [];
	page.on("request", (request) => {
		if (isEmbedRequest(request.url())) asked.push(new URL(request.url()).pathname);
	});

	await page.goto(POST);
	await page.waitForLoadState("load");
	expect(asked, "the embed loaded before anyone asked for it").toEqual([]);

	// Approach it. The element's IntersectionObserver (200px rootMargin) primes at
	// this point — a <link rel=prefetch> for the workbench PAGE and nothing else.
	const demo = page.locator("fleet-demo");
	await demo.scrollIntoViewIfNeeded();
	await expect(demo).toHaveAttribute("data-state", "priming");
	await page.waitForTimeout(1000);

	// Deliberately "at most": whether Chromium honours the prefetch hint is its
	// business. What must not appear is a single byte of the bundle — the chunk,
	// the workers, the wasm all live under /fleet-demo/assets/.
	expect(
		asked.filter((path) => path !== "/fleet-demo/index.html"),
		"priming pulled bundle assets, not just the page"
	).toEqual([]);
});

test("a phone gets a live button, not a disabled one", async ({ page }) => {
	// The embed used to gate itself at 768px: below that the poster stayed and the
	// launch button rendered DISABLED while still reading "Launch the demo". From
	// the reader's side that is indistinguishable from broken software — tap,
	// nothing. The gate is gone, and this is the test that keeps it gone.
	//
	// Deliberately NOT a full narrow boot — that lives in "a phone boots with
	// the sidebar out of the way" below. What is specific to THIS test is the
	// ENTRY: an enabled control that moves the state machine off the poster.
	await page.setViewportSize({ width: 393, height: 659 });
	await page.goto(POST);

	const demo = page.locator("fleet-demo");
	await demo.scrollIntoViewIfNeeded();

	const launch = demo.locator("[data-launch]");
	await expect(launch).toBeEnabled();
	await expect(demo).not.toHaveAttribute("data-state", "unsupported");

	// The narrow box has to be a shape a workbench can live in, not the desktop
	// 16/10 letterbox, which is ~245px tall here — less than the panel alone
	// claims. Asserting taller-than-wide is the cheap proxy for that.
	const box = await demo.boundingBox();
	expect(box, "the embed did not lay out").toBeTruthy();
	expect(box!.height, `the embed is ${box!.width}x${box!.height} on a phone`).toBeGreaterThan(
		box!.width
	);

	await launch.click();
	await expect(demo).toHaveAttribute("data-state", "launching");
});

test("a phone boots with the sidebar out of the way", async ({ page }) => {
	test.slow();
	// VS Code holds a ~300px minimum editor width, so at this width an open
	// sidebar shoves the editor and panel past the right edge of an iframe
	// that cannot scroll horizontally: the workbench "works", but the terminal
	// — the thing the poster advertises — renders where the reader cannot see
	// or reach it. workbench.ts collapses the sidebar after the tree has
	// rendered (narrow viewports only); this is the test that keeps that
	// collapse honest, because from outside the iframe a clipped workbench
	// and a usable one are both just a dark rectangle.
	await page.setViewportSize({ width: 393, height: 659 });
	const frame = await boot(page);

	await expect(frame.locator(".part.sidebar")).toBeHidden();

	// And the width the collapse freed up actually reached the terminal: its
	// rendered rows must sit entirely inside the visible viewport, not merely
	// exist. boundingBox() reports page coordinates even through the iframe,
	// so "right edge <= viewport width" is exactly the reader's experience.
	const rows = frame.locator(".part.panel .xterm-rows").first();
	await expect(rows).toBeVisible({ timeout: 30_000 });
	await expect(rows).toContainText("can0", { timeout: 15_000 });
	const box = await rows.boundingBox();
	expect(box, "the terminal did not lay out").toBeTruthy();
	expect(
		box!.x + box!.width,
		`the terminal spans ${box!.x}..${box!.x + box!.width} in a 393px viewport`
	).toBeLessThanOrEqual(393);
});

test("launch boots a real workbench, not an iframe-shaped shell", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// The parts a failed initialize() never gets to build. An <iframe> that merely
	// exists has none of them.
	await expect(frame.locator(".monaco-workbench")).toHaveCount(1);
	await expect(frame.locator(".part.editor")).toBeVisible();
	await expect(frame.locator(".part.sidebar")).toBeVisible();

	// And the staged scene, not the README: boot opens the moving vehicle's
	// controls editor, whose tab is titled "Vehicle · …<VIN tail>". Matching
	// the prefix rather than a VIN keeps this alive across a re-seeded fleet.
	// This is the assertion that would have caught the original complaint —
	// the workbench booted fine and landed the reader somewhere the poster
	// never pictured.
	await expect(frame.locator(".tabs-container .tab").filter({ hasText: "Vehicle ·" })).toBeVisible({
		timeout: 15_000,
	});
});

test("the tree renders the whole seeded fleet", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// Nine rows, not six: the tree is two-level, so three cohort directories
	// (Stage / North America / EMEA, each seeded Expanded) sit above the six
	// vehicles they hold, and VS Code gives a group row role="treeitem" too. A
	// tree that rendered its container but no rows is the shape of an extension
	// host that never activated — and it looks like an empty sidebar, which
	// looks like a design choice.
	const rows = frame.locator('[role="treeitem"]');
	await expect(rows).toHaveCount(9);

	// Vehicle rows are labelled with the full VIN, and every seeded vehicle is a
	// Fisker, so every one of them carries the WMI "VCF". Matching on that
	// fragment rather than on a row's position survives a reshuffle of the seed
	// — and it is the assertion that would have caught the sidebar rendering
	// callsigns again.
	await expect(rows.filter({ hasText: "VCF" })).toHaveCount(6);
	await expect(rows.first()).toContainText("Stage");
});

test("the can terminal streams on arrival, unprompted", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// NO palette interaction, deliberately. The stream used to exist only
	// behind "Fleet: Open CAN Stream", and a real reader — with the poster
	// advertising a streaming terminal — landed on an empty panel and reported
	// "I don't see any signals running in the terminal". workbench.ts now
	// stages the stream before ready, so the assertion is the stronger one:
	// frames are ALREADY flowing when the iframe is first revealed. (This also
	// removes the palette round-trip this test used to flake on; the palette
	// keeps its own dedicated test below.)
	//
	// .xterm-rows is the DOM renderer's output, which exists only because
	// gpuAcceleration is off; with the default canvas renderer there would be no
	// text here to read at all.
	const rows = frame.locator(".part.panel .xterm-rows").first();
	await expect(rows).toBeVisible({ timeout: 30_000 });
	await expect(rows).toContainText("can0", { timeout: 15_000 });

	// The real question: is the bus LIVE? A terminal that opened, printed a header
	// and died reads identically in a screenshot.
	const before = await rows.innerText();
	await page.waitForTimeout(1500);
	await expect
		.poll(async () => (await rows.innerText()) !== before, {
			message: "the CAN stream stopped after its first frames",
			timeout: 15_000,
		})
		.toBe(true);
});

test("a palette command round-trips into visible state", async ({ page }) => {
	test.slow();
	const frame = await boot(page);
	await runCommand(page, frame, "Fleet: Lock All Doors");

	// commands.ts dispatches to all six vehicles and summarises the outcome in one
	// toast — some vehicles refuse (in motion, asleep, door ajar), which is the
	// post's point, so the count is not pinned. The regex rather than a substring
	// because "unlocked" contains "locked": a wired-up-backwards command would
	// pass a naive contains().
	const toast = frame.locator(".notification-toast");
	await expect(toast).toBeVisible({ timeout: 15_000 });
	await expect(toast).toContainText(/Fleet: locked \d+ of \d+ vehicles/, { timeout: 15_000 });
});

test("the reset chip puts a taken-apart workbench back together", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// Wreck the layout the way a reader can in one keystroke. Driven through the
	// workbench's own command rather than the palette because this test is about
	// the reset path, not about the palette (which has its own test above) — and
	// because a palette detour would add two more async hops to flake on.
	const workbench = page.frames().find((candidate) => candidate.url().includes("/fleet-demo/"));
	expect(workbench, "the workbench frame went missing").toBeTruthy();
	await workbench!.evaluate(async () => {
		const probe = (
			window as unknown as {
				__fleetDemo?: { api: { commands: { executeCommand(id: string): PromiseLike<unknown> } } };
			}
		).__fleetDemo;
		await probe?.api.commands.executeCommand("workbench.action.togglePanel");
	});
	await expect(frame.locator(".part.panel")).toBeHidden();

	// The chip lives in the HOST page, not the iframe — that is the whole point
	// of it: it cannot be closed, hidden or scrolled away by the workbench.
	await page.locator("fleet-demo [data-reset]").click();

	// Both halves of the reset: the extension re-seeded (its own toast, the same
	// one "Fleet: Reset Demo" produces) and the layout restored.
	await expect(frame.locator(".notification-toast")).toContainText(/demo reset/i, {
		timeout: 15_000,
	});
	await expect(frame.locator(".part.panel")).toBeVisible();
	// Nine again: three cohort directories plus the six re-seeded vehicles.
	await expect(frame.locator('[role="treeitem"]')).toHaveCount(9);
});

test("the built embed has not quietly doubled in size", async () => {
	// Needs no browser and no server: it reads what build:fleet-demo just wrote.
	//
	// The guard is not about page weight in the abstract — it is about a specific,
	// easy mistake. workbench.ts leaves several monaco-vscode-api service overrides
	// OUT on purpose (views-service-override corrupts the grid; see its comment).
	// Adding one back pulls in a large slice of VS Code, and the only symptom is
	// that the demo takes longer to start on a connection nobody testing it has.
	const root = fileURLToPath(new URL("../public/fleet-demo", import.meta.url));

	let total = 0;
	let largestJs = 0;
	let largestJsName = "";
	const walk = (dir: string) => {
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				walk(path);
				continue;
			}
			const { size } = statSync(path);
			total += size;
			if (entry.name.endsWith(".js") && size > largestJs) {
				largestJs = size;
				largestJsName = entry.name;
			}
		}
	};
	walk(root);

	const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

	// Headroom over today's ~15 MB total / ~11.1 MB main chunk: enough that honest
	// growth does not trip it, tight enough that a re-added override does.
	expect(total, `public/fleet-demo is ${mb(total)} MB`).toBeLessThanOrEqual(25 * 1024 * 1024);
	expect(
		largestJs,
		`${largestJsName} is ${mb(largestJs)} MB — did a service override come back?`
	).toBeLessThanOrEqual(13 * 1024 * 1024);
});
