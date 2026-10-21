/**
 * The type specimen (specimen.ts) is a file the art profile accepts: it passes
 * the ART profile — type, a line glyph and the bold shapes on one plate —
 * within the art budget, and bakes the same every time. `bun run test:unit`.
 */
import { expect, test } from "bun:test";
import { BUDGET, validateArt } from "../../scripts/validate-art.mjs";
import { typeSpecimen } from "./specimen";

test("the specimen passes the art profile, in budget, deterministic", () => {
	const svg = typeSpecimen();
	expect(validateArt(svg, { slug: "specimen" })).toEqual([]);
	expect(Buffer.byteLength(svg)).toBeLessThanOrEqual(BUDGET.bytes);
	expect(typeSpecimen()).toBe(svg);
});

test("it sets words in all four voices", () => {
	const svg = typeSpecimen();
	for (const voice of ["label", "caption", "numeral", "title"]) expect(svg).toContain(`class="art-${voice}"`);
});
