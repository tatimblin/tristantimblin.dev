import { afterEach, describe, expect, test } from "bun:test";
import { embed, EMBEDS } from "./embeds";

describe("embeds", () => {
	afterEach(() => {
		delete EMBEDS["test-entry"];
	});

	test("resolves an R2 name to its versioned module and asset base", () => {
		const { version, base } = EMBEDS["painterly-scene"];
		expect(embed("painterly-scene")).toEqual({
			src: `${base}/v${version}/index.js`,
			assetBase: `${base}/v${version}/`,
			stillFrame: true,
			webgl: true,
		});
	});

	test("resolves a fixed-URL name to that URL, with its entry and opt-outs", () => {
		const assetBase = "https://tatimblin.github.io/meetLolla/";
		expect(embed("meet-lolla")).toEqual({
			src: `${assetBase}dist/index.js`,
			assetBase,
			stillFrame: false,
			reducedMotion: "mount",
			webgl: false,
			touchAction: "auto",
		});
	});

	test("a fixed-URL entry without `entry` loads index.js", () => {
		EMBEDS["test-entry"] = { version: "1.2.3", url: "https://o.github.io/r/" };
		expect(embed("test-entry").src).toBe("https://o.github.io/r/index.js");
	});

	test("throws on an unknown name", () => {
		expect(() => embed("nope")).toThrow(/not in src\/data\/embeds\.json/);
	});

	test("throws on an entry with both hosts, or neither", () => {
		EMBEDS["test-entry"] = { version: "1.0.0", base: "https://x.dev", url: "https://y.dev/" };
		expect(() => embed("test-entry")).toThrow(/exactly one/);
		EMBEDS["test-entry"] = { version: "1.0.0" };
		expect(() => embed("test-entry")).toThrow(/exactly one/);
	});

	test("every entry pins a semver and exactly one well-formed host", () => {
		for (const [name, entry] of Object.entries(EMBEDS)) {
			expect(entry.version, name).toMatch(/^\d+\.\d+\.\d+$/);
			if (entry.base) {
				expect(entry.base, name).toMatch(/^https:\/\/[^/]+$/);
				expect(entry.url, name).toBeUndefined();
			} else {
				expect(entry.url, name).toMatch(/^https:\/\/.+\/$/);
			}
			if (entry.entry) expect(entry.entry, name).toMatch(/^[^/].*\.js$/);
		}
	});
});
