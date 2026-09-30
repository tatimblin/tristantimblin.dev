/**
 * Tahoe Mountain Hair — the post's art, as a baked scene: A MODULE SHEET.
 * The post chases the hair a trip to Tahoe gave — mineral water off
 * granite, dry mountain air — and rebuilds it at home, so the plate is the
 * water cycle that makes Tahoe's water, drawn as the one strong element,
 * with the routine that fakes it set beside it in a few tight modules.
 *
 * LEFT, THE CYCLE: five stage rings on a dotted orbit about an H2O hub,
 * like the car infographic's drive-mode circles — CLOUD, SNOW (on
 * granite), MELT, LAKE, VAPOUR — each a fine line icon at the joystick
 * glyph's weight, numbered under its ring, joined round the orbit by
 * arrowed arcs.
 *
 * RIGHT, THE MODULES: a title over a rule (MOUNTAIN_HAIR, the post's
 * aim); the route SAN FRANCISCO → TAHOE with the two waters and airs as
 * fields (soft / hard, humid / dry); the big thin 30 of the bond mask's
 * minutes in coral beside the ACV ratio; and the weekly wash's five steps
 * as a numbered index under a dotted section head, ending in the bracketed
 * state the routine is for.
 *
 * The motion is `steps`, five beats round the cycle: beat i lights stage
 * i's arc of the orbit and its icon in cyan and rings the stage while it
 * is current. The still is the whole cycle lit, VAPOUR ringed — the water
 * on its way back to the cloud.
 *
 *   bun run scenes:bake      → src/content/txt/tahoe-mountain-hair.svg
 *
 * Drawn from nothing but the kit: no credit.
 */

import { grid, type Point, polar } from "@whois/design-system/lib/micro";
import { scene } from "@whois/design-system/scenes/recipe";

/** A number as a path writes it: a hundredth. */
const r2 = (n: number): number => Math.round(n * 100) / 100;

// --- The cycle's geometry --------------------------------------------------------

/** The orbit's centre and radius, a stage ring's radius, the hub's. */
const C: Point = [80, 100];
const ORBIT = 44;
const STAGE = 12;
const HUB = 9;
/** The five stages clockwise from the top, on the dial (0 up). */
const STAGES = ["Cloud", "Snow", "Melt", "Lake", "Vapour"] as const;
const ANGLE = STAGES.map((_, i) => i * 72);
const AT: Point[] = ANGLE.map((a) => polar(C[0], C[1], ORBIT, a) as Point);
/** The gap an arc leaves each side of a ring, in degrees of the orbit. */
const GAP = 22;

// --- The icons: fine line drawings about (0, 0), a ring's inside -------------------

/** Each stage's icon as one path's `d` in its own coordinates, placed by a translate. */
const ICON: Record<(typeof STAGES)[number], string> = {
	// A cloud: three bumps on a flat base.
	Cloud: "M -7 3 H 7 A 3 3 0 0 0 5.2 -2.4 A 4.4 4.4 0 0 0 -2.6 -3.4 A 3.6 3.6 0 0 0 -7 3 Z",
	// Snow on granite: two peaks on a baseline, a flake over them.
	Snow: "M -8 5.5 L -3 -1 L -0.5 2 L 3 -4 L 8 5.5 M -8 5.5 H 8 M -5 -6 v 4 M -6.7 -5 l 3.4 2 M -6.7 -3 l 3.4 -2",
	// Melt: a drop, a highlight inside it.
	Melt: "M 0 -7 C 2.5 -3.5 5 -1 5 2 A 5 5 0 0 1 -5 2 C -5 -1 -2.5 -3.5 0 -7 Z M -2.4 2 A 2.4 2.4 0 0 0 0 4.4",
	// Lake: a 2:1 shore, two ripples on it.
	Lake: "M -8 1 A 8 4 0 1 0 8 1 A 8 4 0 1 0 -8 1 Z M -4 0 q 2 -1.2 4 0 t 4 0 M -2.5 3 q 1.5 -1 3 0",
	// Vapour: three wisps rising off a surface.
	Vapour: "M -7 6 H 7 M -4 4 c -2 -2 2 -3.5 0 -5.5 c -2 -2 2 -3.5 0 -5.5 M 0 4 c -2 -2 2 -3.5 0 -5.5 c -2 -2 2 -3.5 0 -5.5 M 4 4 c -2 -2 2 -3.5 0 -5.5 c -2 -2 2 -3.5 0 -5.5",
};

/** The Snow stage's cap: the tall peak's snow, filled. */
const CAP = "M 3 -4 L 5 -0.2 L 3.6 -1 L 2.6 0.2 L 1.4 -1.2 Z";

/** The routine's five steps, as the post numbers them. */
const ROUTINE = ["Clarify", "ACV rinse", "Bond mask", "Define", "Dry"] as const;

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const hair = { weight: "hair" } as const;
		const out: string[] = [];
		const place = (i: number, children: readonly string[]): string => k.group(children, { transform: `translate(${r2(AT[i][0])} ${r2(AT[i][1])})` });
		const icon = (i: number, paint: "ink" | "blue"): string => {
			const s = STAGES[i];
			const parts = [k.path(ICON[s], { paint, ...hair })];
			if (s === "Snow") parts.push(k.path(CAP, { paint: "none", fill: paint }));
			return place(i, parts);
		};
		/** The arc from stage i to the next, and its arrowhead at the next ring. */
		const leg = (i: number, paint: "dim" | "blue", dash?: "dotted"): string[] => {
			const a0 = ANGLE[i] + GAP;
			const a1 = ANGLE[i] + 72 - GAP;
			const [hx, hy] = polar(C[0], C[1], ORBIT, a1);
			return [k.arc(C[0], C[1], ORBIT, a0, a1, { paint, ...hair, ...(dash ? { dash } : {}) }), k.arrowhead(hx, hy, a1 + 90, 2.2, { paint, ...hair })];
		};

		// --- Layout: the cycle in the left two fifths, the modules in the right. ---
		const [, right] = grid(2, 1, 16, 16, { inset: [16, 16] }).map((c, i) => (i === 0 ? c : { ...c, x: 170, w: 304 - 170 }));
		const { x, w } = right;

		// --- The cycle -------------------------------------------------------------
		out.push(
			k.section(16, 16, 128, "Water cycle // Tahoe"),
			k.ring(C[0], C[1], HUB, { paint: "dim", ...hair, dash: "dotted" }),
			k.text(C[0], C[1] + 1.3, "H2O", { role: "label", size: 3.5, anchor: "middle" }),
		);
		/**
		 * A stage's name where the orbit leaves room: under the top ring (inside the
		 * orbit), level with a side ring on its inner side, under a bottom ring.
		 */
		const label = (i: number, words: string): string => {
			const [sx, sy] = AT[i];
			if (i === 1) return k.text(sx - STAGE - 5, sy + 1.3, words, { role: "caption", anchor: "end" });
			if (i === 4) return k.text(sx + STAGE + 5, sy + 1.3, words, { role: "caption" });
			return k.text(sx, sy + STAGE + 7.5, words, { role: "caption", anchor: "middle" });
		};
		STAGES.forEach((s, i) => {
			const [sx, sy] = AT[i];
			out.push(
				k.ring(sx, sy, STAGE, { paint: "ink", ...hair }),
				icon(i, "ink"),
				label(i, `${String(i + 1).padStart(2, "0")} ${s.toUpperCase()}`),
				...leg(i, "dim", "dotted"),
			);
		});

		// --- The modules -----------------------------------------------------------
		// Registration: a dim + in the gutter, the sheet's grid made visible.
		out.push(k.plus(154, 100, 4, { paint: "dim", ...hair }));
		// 1 — the title over its rule, the aim.
		out.push(
			k.text(x, 23.5, "MOUNTAIN_HAIR", { role: "title" }),
			k.ring(x + w - 3.5, 20, 3, { paint: "dim", ...hair, dash: "dotted" }),
			k.rule(x, x + w, 29),
		);
		// 2 — the route: San Francisco to Tahoe, their water and their air.
		{
			const y = 38;
			out.push(
				k.text(x, y, "SAN FRANCISCO", { size: 3.5 }),
				k.line(x + 40, y - 1.2, x + w - 26, y - 1.2, { paint: "dim", ...hair }),
				k.arrowhead(x + w - 26, y - 1.2, 90, 2, { paint: "dim", ...hair }),
				k.text(x + w, y, "TAHOE", { size: 3.5, anchor: "end" }),
				k.text(x, y + 6, "WATER: SOFT", { role: "caption" }),
				k.text(x, y + 11, "AIR: HUMID", { role: "caption" }),
				k.text(x + w, y + 6, "WATER: HARD", { role: "caption", anchor: "end", paint: "ink" }),
				k.text(x + w, y + 11, "AIR: DRY", { role: "caption", anchor: "end", paint: "ink" }),
			);
		}
		// 3 — the big numeral: the bond mask's thirty minutes, the ACV ratio beside it.
		{
			const y = 90;
			out.push(
				k.readout(x, y, { value: "30", label: "Bond mask", caption: "min", size: 32, paint: "red" }),
				k.text(x + 62, y - 17, "ACV 1 TBSP : 1 CUP", { size: 3.5 }),
				k.text(x + 62, y - 12, "RINSE 60-90 S", { size: 3.5 }),
				k.text(x + 62, y - 7, "PROTEIN // BOND", { size: 3.5 }),
			);
		}
		// 4 — the weekly wash: five steps, numbered, and what they are for.
		{
			const y = 104;
			out.push(k.section(x, y, w, "Weekly wash // 05", { size: 3.5 }));
			ROUTINE.forEach((step, i) => {
				const col = i < 3 ? 0 : 1;
				const row = i < 3 ? i : i - 3;
				const sx = x + col * 70;
				const sy = y + 12 + row * 6;
				out.push(k.text(sx, sy, String(i + 1).padStart(2, "0"), { role: "caption" }), k.text(sx + 9, sy, step.toUpperCase(), { size: 3.5 }));
			});
			out.push(k.bracketLabel(x, 150, "cuticle sealed", { size: 3.5 }), k.text(x + w, 150, "HANDS OFF TILL DRY", { role: "caption", anchor: "end" }));
			out.push(k.text(x, 164, "DAILY: KEEP DRY", { role: "caption" }), k.text(x + w, 164, "JOJOBA MIST", { role: "caption", anchor: "end" }));
		}

		// --- The motion: the cycle going round, a stage a beat -------------------------
		const beats = STAGES.map((_, i) => [
			...leg(i, "blue"),
			k.group([icon(i, "blue"), k.ring(AT[i][0], AT[i][1], STAGE + 2.5, { paint: "blue", ...hair, dash: "dotted" })], { mark: "now" }),
		]);

		return [...out, k.steps(beats)];
	},
});
