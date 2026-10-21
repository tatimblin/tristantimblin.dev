/**
 * THE TYPE SPECIMEN — six modules of a HUD module sheet on one 320×180
 * plate, in the art language: the proof that a plate can now carry type
 * (the four voices), rules, sections, bracketed states, readouts, a line
 * glyph and the bold shapes, on a strict grid with air. Built at render
 * time on `kit("art")` (the kit's type and module helpers, `grid`, `ids`)
 * and the glyph recipes through `part()`, and held to the ART profile by
 * its test (specimen.test.ts), so what the catalogue shows is a file the
 * validator would pass. Shown on /design-system/glyphs#type-modules.
 *
 *   import { typeSpecimen } from "@whois/design-system/art/specimen.ts";
 *   <ArtFrame svg={typeSpecimen()} label="…" />
 */

import { grid, ids, kit } from "../lib/micro";
import { part } from "../scenes/parts";
import burst from "../glyphs/recipes/burst";
import checkerWarp from "../glyphs/recipes/checker-warp";
import isoStripes from "../glyphs/recipes/iso-stripes";
import joystick from "../glyphs/recipes/joystick";
import petals from "../glyphs/recipes/petals";
import stripeDisc from "../glyphs/recipes/stripe-disc";
import swirl from "../glyphs/recipes/swirl";

/** The specimen plate's file: the ink, coral (the numeral), lavender (a flower) and green (a live node). */
export function typeSpecimen(): string {
	const k = kit("art");
	const id = ids(7);
	const cells = grid(3, 2, 12, 14);
	const out: string[] = [];

	// Registration: a dim + where the gutters cross, the sheet's grid made visible.
	for (const c of [cells[0], cells[1]]) out.push(k.plus(c.x + c.w + 6, cells[0].y + cells[0].h + 6, 4, { paint: "dim", weight: "hair" }));

	// 1 — A NODE LABEL: a title over a rule, two columns of fields, a file with an arrow at it.
	{
		const { x, y, w } = cells[0];
		out.push(
			k.text(x, y + 6.5, "ARCHIVE_LOG", { role: "title" }),
			k.ring(x + w - 4, y + 3, 3, { paint: "dim", dash: "dotted" }),
			k.rule(x, x + w, y + 11),
			k.text(x, y + 19, "ACCESS", { size: 3.5 }),
			k.text(x, y + 24, "CONFIRMED", { size: 3.5 }),
			k.text(x + w, y + 19, "NODE:", { size: 3.5, anchor: "end" }),
			k.text(x + w, y + 24, id.code(), { size: 3.5, anchor: "end" }),
			k.line(x, y + 34, x + 16, y + 34),
			k.arrowhead(x + 16, y + 34, 90, 2.5),
			k.text(x + 21, y + 35.3, id.file(), { size: 3.5 }),
			k.text(x, y + 46, id.coords(), { role: "caption" }),
			k.text(x + w, y + 46, id.hex(), { role: "caption", anchor: "end" }),
		);
	}

	// 2 — A BIG NUMERAL: 007 in coral, its code and state beside it, a dotted rule and the log under it.
	{
		const { x, y, w } = cells[1];
		out.push(
			k.star(x + 3, y + 3, 6, 1.2, 3.2, { paint: "none", fill: "ink" }),
			k.ring(x + 10.5, y + 3, 2.8),
			k.pill(x + w - 28, y, 28, 6.5, { paint: "dim" }),
			k.text(x + w - 14, y + 4.5, "ORIGIN.E43", { role: "caption", anchor: "middle" }),
			k.text(x, y + 34, "007", { role: "numeral", size: 32, paint: "red" }),
			k.text(x + 60, y + 16, id.num(8), { size: 3.5 }),
			k.text(x + 60, y + 21, "RESET", { size: 3.5 }),
			k.rule(x, x + w, y + 39, { dotted: true }),
			k.text(x, y + 45, "ARCHIVE // DECODING", { role: "caption" }),
			k.text(x, y + 50, id.file(), { role: "caption" }),
			k.text(x + w, y + 50, "ALLOCATED", { role: "caption", anchor: "end" }),
		);
	}

	// 3 — A BRACKET STATUS: the ONLINE pill with its route, a bracketed state over four routed rings.
	{
		const { x, y, w } = cells[2];
		out.push(
			k.text(x + 30, y + 4, "NODE", { size: 3.5 }),
			k.line(x + 43, y + 2.8, x + 58, y + 2.8, { paint: "dim" }),
			k.arrowhead(x + 58, y + 2.8, 90, 2, { paint: "dim" }),
			k.text(x + 61, y + 4, "B43", { size: 3.5 }),
			k.pill(x, y + 8, w, 14, { weight: "line" }),
			k.text(x + 6, y + 18.3, "ONLINE", { role: "title" }),
			k.line(x + 48, y + 15, x + w - 13, y + 15, { paint: "dim" }),
			k.dot(x + w - 13, y + 15, 1.5, { paint: "green" }),
			k.ring(x + w - 7, y + 15, 3, { paint: "dim" }),
			k.bracketLabel(x, y + 32, "activated"),
		);
		const turns = [45, 0, 225, 135];
		turns.forEach((a, i) => {
			const [cx, cy] = [x + 5 + i * 10.5, y + 43];
			const [dx, dy] = [Math.sin((a * Math.PI) / 180) * 2.5, -Math.cos((a * Math.PI) / 180) * 2.5];
			out.push(k.ring(cx, cy, 4.5), k.line(cx - dx, cy - dy, cx + dx, cy + dy), k.arrowhead(cx + dx, cy + dy, a, 1.6));
		});
		out.push(
			k.text(x + 46, y + 42, "ROUTE: VERIFIED", { role: "caption" }),
			k.text(x + 46, y + 47, "CHECKSUM: OK", { role: "caption" }),
			k.text(x, y + 60, "PACKET LOSS: 0.3%", { role: "caption" }),
		);
	}

	// 4 — A SECTION HEAD OVER A DOTTED RULE: the infographic's "14 SPEAKERS" beside its speaker.
	{
		const { x, y, w } = cells[3];
		out.push(
			k.section(x, y, w, "Sound systems"),
			k.rule(x, x + w * 0.62, y + 11),
			k.readout(x, y + 38, { value: "14", caption: "speakers" }),
			...[11, 9.5, 8.5].map((r) => k.ring(x + w - 12, y + 28, r)),
			k.ring(x + w - 12, y + 28, 4.5, { weight: "line" }),
			k.text(x, y + 50, "DRIVER: 7 // DUAL", { role: "caption" }),
		);
	}

	// 5 — A MODULE WITH A GLYPH: the joystick part, a leader to its title and fields.
	{
		const { x, y, w } = cells[4];
		out.push(
			part(k, joystick, { at: [x + 13, y + 22], scale: 1.25, recolour: { blue: "green" } }),
			k.guide([[x + 18, y + 9], [x + 32, y + 9]]),
			k.text(x + 34, y + 11, "VARIANT 033", { role: "title", size: 6 }),
			k.text(x + 34, y + 18, "OUTPUT: DIGITAL", { size: 3.5 }),
			k.text(x + 34, y + 23, `[INDEX] ${id.num(8)}`, { size: 3.5 }),
			k.ring(x + w - 4, y + 32, 3.5),
			k.cross(x + w - 4, y + 32, 4, { weight: "hair" }),
			k.bracketLabel(x + 34, y + 33, "stable", { size: 3.5 }),
			k.rule(x, x + w, y + 41, { dotted: true }),
			k.text(x, y + 47, `INPUT // ${id.id()}`, { role: "caption" }),
		);
	}

	// 6 — A ROW OF BOLD SHAPES under a section head, each numbered; the swirl turns.
	{
		const { x, y, w } = cells[5];
		const row = [burst, stripeDisc, checkerWarp, petals, swirl, isoStripes];
		const pitch = w / row.length;
		out.push(k.section(x, y, w, "Shapes // 120"));
		row.forEach((r, i) => {
			const cx = x + pitch * (i + 0.5);
			out.push(part(k, r, { at: [cx, y + 21], scale: 0.55 }), k.text(cx, y + 33, String(i + 1).padStart(2, "0"), { role: "caption", anchor: "middle" }));
		});
		out.push(k.readout(x, y + 54, { value: "06", size: 14, caption: "of 120", paint: "ink" }));
	}

	return k.svg({ children: out });
}
