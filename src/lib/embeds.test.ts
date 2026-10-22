import { afterEach, describe, expect, test } from "bun:test";
import { embed, EMBEDS, JSDELIVR } from "./embeds";

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

	test("resolves a jsDelivr name to the repo at its tag, with its entry and opt-outs", () => {
		const { version } = EMBEDS["meet-lolla"];
		const assetBase = `https://cdn.jsdelivr.net/gh/tatimblin/meetLolla@v${version}/`;
		expect(embed("meet-lolla")).toEqual({
			src: `${assetBase}dist/index.js`,
			assetBase,
			stillFrame: false,
			reducedMotion: "mount",
			webgl: false,
		});
	});

	test("a jsDelivr entry without `entry` loads index.js", () => {
		EMBEDS["test-entry"] = { version: "1.2.3", jsdelivr: "o/r" };
		expect(embed("test-entry").src).toBe(`${JSDELIVR}/o/r@v1.2.3/index.js`);
	});

	test("throws on an unknown name", () => {
		expect(() => embed("nope")).toThrow(/not in src\/data\/embeds\.json/);
	});

	test("throws on an entry with both hosts, or neither", () => {
		EMBEDS["test-entry"] = { version: "1.0.0", base: "https://x.dev", jsdelivr: "o/r" };
		expect(() => embed("test-entry")).toThrow(/exactly one/);
		EMBEDS["test-entry"] = { version: "1.0.0" };
		expect(() => embed("test-entry")).toThrow(/exactly one/);
	});

	test("every entry pins a semver and exactly one well-formed host", () => {
		for (const [name, entry] of Object.entries(EMBEDS)) {
			expect(entry.version, name).toMatch(/^\d+\.\d+\.\d+$/);
			if (entry.base) {
				expect(entry.base, name).toMatch(/^https:\/\/[^/]+$/);
				expect(entry.jsdelivr, name).toBeUndefined();
			} else {
				expect(entry.jsdelivr, name).toMatch(/^[\w.-]+\/[\w.-]+$/);
			}
			if (entry.entry) expect(entry.entry, name).toMatch(/^[^/].*\.js$/);
		}
	});
});
