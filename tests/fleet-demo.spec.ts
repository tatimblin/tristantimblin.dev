import { test, expect, type FrameLocator, type Page } from "./fixtures/test";

/**
 * THE VS CODE EMBED IN THE POST. A workbench that failed to boot still leaves a
 * right-sized, theme-coloured <iframe>, so no test asserts on the frame: each
 * asserts on DOM only a real boot produces (.monaco-workbench, tree rows, xterm
 * output, a toast). The other silent failures:
 *
 *  1. EAGER LOADING. The poster exists so readers who never launch don't fetch a
 *     15 MB bundle; only the request log can tell.
 *  2. A DEAD TERMINAL shows a plausible first screenful, so the text must CHANGE.
 *     (Readable because workbench.ts sets gpuAcceleration "off".)
 *  3. A COMMAND THAT DISPATCHES NOWHERE. Palette → extension host → simulator →
 *     notification crosses workers; a break leaves a palette that does nothing.
 *
 * Chromium only (playwright.config.ts's firefox project is an include list); don't
 * add this to it. The embed and its bundle-size guard live in tatimblin/vscode-fleet;
 * this checks that the site serves and boots it.
 */

const POST = "/txt/no-honey-we-have-a-dashboard-at-home/";

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
	// A desktop launches it on view (src/lib/demo-launch.ts); a phone taps.
	if (page.viewportSize()!.width < 1024) await demo.locator("[data-launch]").click();
	await expect(demo).toHaveAttribute("data-state", "ready", { timeout: 90_000 });

	const frame = page.frameLocator("iframe[data-fleet-demo-frame]");
	await expect(frame.locator(".monaco-workbench")).toHaveCount(1);
	return frame;
}

/**
 * Run a Fleet command the way a reader would. The frame needs focus before F1
 * reaches the workbench: click the STATUS BAR, because the editor body is a
 * webview iframe that swallows pointer events forever. Opening the picker
 * retries as a unit: that webview finishes loading after boot and its focus
 * steal dismisses an open picker. And F1 opens with ">" in the box, so append
 * the query; fill() would drop the picker into file search, matching nothing.
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

test("a desktop launches the demo as it comes into view, no click", async ({ page }) => {
	await page.goto(POST);
	const demo = page.locator("fleet-demo");
	// Below the fold it has not launched (the element may not have set a state yet).
	await expect(demo).not.toHaveAttribute("data-state", /launching|ready/);
	await demo.scrollIntoViewIfNeeded();
	await expect(demo).toHaveAttribute("data-state", /launching|ready/);
});

test("on a phone the demo stays out of the page until summoned", async ({ page }) => {
	// A phone waits for the button (src/lib/demo-launch.ts); a desktop would
	// launch on view, the test above.
	await page.setViewportSize({ width: 393, height: 659 });
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
	// A disabled button reads as broken software, tap and nothing. This covers the
	// entry only; the narrow boot is "a phone boots with the sidebar out of the way".
	await page.setViewportSize({ width: 393, height: 659 });
	await page.goto(POST);

	const demo = page.locator("fleet-demo");
	await demo.scrollIntoViewIfNeeded();

	const launch = demo.locator("[data-launch]");
	await expect(launch).toBeEnabled();
	await expect(demo).not.toHaveAttribute("data-state", "unsupported");

	// Not the desktop 16/10 letterbox, ~245px here and less than the panel claims:
	// taller-than-wide is the cheap proxy for a shape a workbench can live in.
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
	// VS Code holds a ~300px minimum editor width, so an open sidebar pushes the
	// terminal past the edge of an iframe that can't scroll sideways. workbench.ts
	// collapses it after the tree renders (narrow viewports only).
	await page.setViewportSize({ width: 393, height: 659 });
	const frame = await boot(page);

	await expect(frame.locator(".part.sidebar")).toBeHidden();

	// The rows must sit inside the viewport, not merely exist. boundingBox()
	// reports page coordinates even through the iframe.
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

	// The staged scene, not the README: the moving vehicle's controls editor.
	// The prefix, not a VIN, so it survives a re-seeded fleet.
	await expect(frame.locator(".tabs-container .tab").filter({ hasText: "Vehicle ·" })).toBeVisible({
		timeout: 15_000,
	});
});

test("the tree renders the whole seeded fleet", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// Nine rows: three cohort directories (seeded Expanded) above six vehicles,
	// and VS Code gives a group row role="treeitem" too. No rows means an extension
	// host that never activated.
	const rows = frame.locator('[role="treeitem"]');
	await expect(rows).toHaveCount(9);

	// Rows carry the full VIN, and every seeded Fisker has the WMI "VCF": a match
	// that survives a reshuffled seed and fails on callsigns.
	await expect(rows.filter({ hasText: "VCF" })).toHaveCount(6);
	await expect(rows.first()).toContainText("Stage");
});

test("the can terminal streams on arrival, unprompted", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// No palette: workbench.ts stages the stream before ready, so frames are
	// already flowing when the iframe is revealed.
	//
	// .xterm-rows is the DOM renderer's output, which exists only because
	// gpuAcceleration is off; a canvas renderer leaves no text to read.
	const rows = frame.locator(".part.panel .xterm-rows").first();
	await expect(rows).toBeVisible({ timeout: 30_000 });
	await expect(rows).toContainText("can0", { timeout: 15_000 });

	// Is the bus live? A terminal that printed a header and died reads the same.
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

	// Some vehicles refuse (the post's point), so the count isn't pinned. A regex
	// because "unlocked" contains "locked": a backwards command would pass contains().
	const toast = frame.locator(".notification-toast");
	await expect(toast).toBeVisible({ timeout: 15_000 });
	await expect(toast).toContainText(/Fleet: locked \d+ of \d+ vehicles/, { timeout: 15_000 });
});

test("the reset chip puts a taken-apart workbench back together", async ({ page }) => {
	test.slow();
	const frame = await boot(page);

	// Wreck the layout through the workbench's own command: the palette has its own
	// test, and a detour through it adds two async hops to flake on.
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

	// In the HOST page, so the workbench can't close, hide or scroll it away.
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
