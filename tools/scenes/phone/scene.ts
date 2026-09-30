/**
 * The exploded phone — the L4 constructed route's proof: the family-H iso
 * part recipes (src/glyphs/recipes/) run again with the scene kit and
 * stacked along one z axis on the 320×180 plate, a synth panel's screen.
 * The handset, the two shell halves, the rotary disc and the board ride
 * the explosion axis centre-right; the joystick and the cell sit to its
 * left, the driver, the spring and two screws to its right. A dim dashed
 * axis threads the stack (its dashes march), and a few wires run from the
 * parts to the plate's edges into square terminals. The left and right
 * thirds carry little but those wires: they are the HTML readouts' (TONE,
 * PHONIC, BAUD), which the page places with SceneLabel; nothing here is
 * text.
 *
 * Every part is `part(k, recipe, { at, scale })` (src/scenes/parts.ts):
 * the recipe's own geometry in a translate/scale group, drawn in the
 * scene's paints. The shells and the handset are recoloured from lavender
 * to the ink — the H parts use all four colours between them, a scene
 * three — so the case reads as the drawing's white line work and the
 * internals carry the colour.
 *
 *   bun run scenes:bake      → packages/design-system/src/scenes/phone.svg
 *
 * Drawn from nothing but the kit and the recipes: no credit (README.md).
 */

import battery from "@whois/design-system/glyphs/recipes/battery";
import cone from "@whois/design-system/glyphs/recipes/cone";
import handset from "@whois/design-system/glyphs/recipes/handset";
import shell from "@whois/design-system/glyphs/recipes/iso-shell";
import joystick from "@whois/design-system/glyphs/recipes/joystick";
import pcb from "@whois/design-system/glyphs/recipes/pcb";
import rotary from "@whois/design-system/glyphs/recipes/rotary";
import screw from "@whois/design-system/glyphs/recipes/screw";
import spring from "@whois/design-system/glyphs/recipes/spring";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

/** The explosion axis: the stack's centre line. */
const AX = 160;
/** The stack's scale, and the side parts'. */
const S = 0.62;
/** The wires, each from the part it leaves (the dial's rim, the cell, the driver's frame) to the edge. */
const WIRES: [number, number][][] = [
	[[139, 73], [92, 73], [92, 86], [8, 86]],
	[[117, 131], [56, 131], [56, 152], [8, 152]],
	[[226.5, 103], [248, 103], [248, 94], [312, 94]],
];
/** The case in the ink, the internals in the colours: the scene's three are green, red and blue. */
const CASE = { recolour: { lavender: "ink" } } as const;

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const wire = { paint: "dim", weight: "hair", end: "terminal" } as const;
		return [
			// The axis first, under everything: dim, dashed, marching.
			k.group([k.line(AX, 0, AX, 180, { paint: "dim", weight: "hair", dash: "dash" })], { motion: "dash", speed: 0.5 }),
			// The wires: from a small dot on a part out to a square terminal at the plate's edge.
			...WIRES.flatMap((pts) => [k.wire(pts, wire), k.dot(...pts[0], 1.25, { paint: "dim" })]),
			// The stack, top to bottom.
			part(k, handset, { at: [AX + 4, 16], scale: S, ...CASE }),
			part(k, shell, { at: [AX, 42], scale: S, ...CASE }),
			part(k, rotary, { at: [AX, 70], scale: S }),
			part(k, pcb, { at: [AX, 100], scale: S }),
			part(k, shell, { at: [AX, 136], scale: S, ...CASE }),
			// The side parts: the joystick and the cell to the left, the driver, the spring and the screws to the right.
			part(k, joystick, { at: [118, 44], scale: 0.8 }),
			part(k, battery, { at: [120, 126], scale: 0.5 }),
			part(k, cone, { at: [208, 100], scale: 0.52 }),
			part(k, spring, { at: [198, 140], scale: 0.42 }),
			part(k, screw, { at: [218, 150], scale: 0.62 }),
			part(k, screw, { at: [228, 162], scale: 0.62 }),
		];
	},
});
