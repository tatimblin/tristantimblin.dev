import { describe, expect, test } from "bun:test";
import { embed, EMBEDS } from "./embeds";

describe("embeds", () => {
	test("resolves a name to its versioned module and asset base", () => {
		const { version, base } = EMBEDS["painterly-scene"];
		expect(embed("painterly-scene")).toEqual({
			src: `${base}/v${version}/index.js`,
			assetBase: `${base}/v${version}/`,
			stillFrame: true,
		});
	});

	test("throws on an unknown name", () => {
		expect(() => embed("nope")).toThrow(/not in src\/data\/embeds\.json/);
	});

	test("every entry pins a semver and an https origin with no trailing slash", () => {
		for (const [name, entry] of Object.entries(EMBEDS)) {
			expect(entry.version, name).toMatch(/^\d+\.\d+\.\d+$/);
			expect(entry.base, name).toMatch(/^https:\/\/[^/]+$/);
		}
	});
});
