/**
 * Asserting on Agent Behavior — the post's art, as a baked scene: a MODULE
 * SHEET. The agent is a black box you cannot open, so the one strong
 * element is a closed box — the bold `iso-stripes` cube, opaque, read from
 * its bars alone — and everything else is what Aptitude reads off it: the
 * trace of its tool calls out of the session log, the three assertions of
 * the read-order test ticking, and the verdict, 3/3 PASSED.
 *
 *   left     AGENT // CLAUDE over the cube; the session log's file under it
 *   middle   ASSERTIONS: three rows, a node on a dotted spine each — the
 *            real lines from the post's hero (READ_FILE *AGENTS.MD CALLED,
 *            READ_FILE CALLED, READ CALL #2 PARAMS)
 *   right    READ_ORDER, the run's fields, the big thin 3/3, PASSED, and [ EVALUATED ]
 *
 * The motion is `steps`, three beats, one per assertion: the node ticks
 * green with a ripple and the counter reads 1/3, 2/3, 3/3 (a now-mark per
 * beat). The still frame is the finished run — every tick, 3/3.
 *
 *   bun run scenes:bake      → src/content/txt/asserting-on-agent-behavior.svg
 *
 * Drawn from the kit and the iso-stripes recipe: no credit.
 */

import isoStripes from "@whois/design-system/glyphs/recipes/iso-stripes";
import { grid, span } from "@whois/design-system/lib/micro";
import { part } from "@whois/design-system/scenes/parts";
import { scene } from "@whois/design-system/scenes/recipe";

/** The three assertions of the read-order test, as the terminal printed them. */
const ASSERTIONS = [
	{ tool: "READ_FILE", param: "*AGENTS.MD", verb: "CALLED" },
	{ tool: "READ_FILE", param: "ANY", verb: "CALLED" },
	{ tool: "READ", param: "CALL #2", verb: "PARAMS" },
] as const;

export default scene({
	viewBox: "0 0 320 180",
	draw(k) {
		const cells = grid(3, 2, 12, 16);
		const left = span(cells[0], cells[3]);
		const mid = span(cells[1], cells[4]);
		const right = span(cells[2], cells[5]);
		const out: string[] = [];


		// LEFT — the black box.
		{
			const { x, y, w } = left;
			const cx = x + w / 2;
			out.push(
				k.section(x, y, w, "Agent // Claude"),
				part(k, isoStripes, { at: [cx - 2, 92], scale: 3.4 }),
				// The trace out of it, into the assertions: all you can see of what it did.
				k.guide([[cx + 38, 90], [mid.x - 1, 90]]),
				k.arrowhead(mid.x - 1, 90, 90, 2.5, { paint: "dim" }),
				k.text(cx + 38, 86, "TRACE", { role: "caption" }),
				k.rule(x, x + w, 136, { dotted: true }),
				k.text(x, 143, "SESSION LOG", { role: "caption" }),
				k.text(x, 148.5, "5709812E.JSONL", { role: "caption", paint: "ink" }),
				k.text(x + w, 143, "BLACK BOX", { role: "caption", anchor: "end" }),
			);
		}

		// MIDDLE — the assertions, a node each on a dotted spine.
		const rows = ASSERTIONS.map((_, i) => 60 + i * 30);
		const node = (i: number) => [mid.x + 5, rows[i]] as const;
		{
			const { x, y, w } = mid;
			out.push(k.section(x, y, w, "Assertions"), k.guide([[x + 5, rows[0] - 14], [x + 5, rows[2] + 14]]));
			ASSERTIONS.forEach((a, i) => {
				const [nx, ny] = node(i);
				out.push(
					k.ring(nx, ny, 4, { fill: "none" }),
					k.text(x + 14, ny - 1, a.tool, { size: 4.5 }),
					k.text(x + 14, ny + 5, `${a.param} // ${a.verb}`, { role: "caption" }),
					k.text(x + w, ny - 1, String(i + 1).padStart(2, "0"), { role: "caption", anchor: "end" }),
				);
			});
		}

		// RIGHT — the run and its verdict.
		{
			const { x, y, w } = right;
			out.push(
				k.text(x, y + 7, "READ_ORDER", { role: "title" }),
				k.rule(x, x + w, y + 11),
				k.text(x, y + 19, "AGENT:", { size: 3.5 }),
				k.text(x, y + 24, "CLAUDE", { size: 3.5 }),
				k.text(x + w, y + 19, "TIME:", { size: 3.5, anchor: "end" }),
				k.text(x + w, y + 24, "16S", { size: 3.5, anchor: "end" }),
				k.rule(x, x + w, 128, { dotted: true }),
				k.bracketLabel(x, 138, "evaluated", { paint: "green" }),
				k.dot(x + w - 3, 136.4, 1.6, { paint: "green" }),
				k.text(x, 148.5, "PROMPT: AGENTS.MD", { role: "caption" }),
			);
		}

		// The run: one beat per assertion — a green tick in its node, a ripple, the counter.
		const beats = ASSERTIONS.map((_, i) => {
			const [nx, ny] = node(i);
			return [
				k.ring(nx, ny, 4, { paint: "green", mark: "ripple" }),
				k.check(nx, ny, 4, { paint: "green", weight: "line" }),
				k.group(k.readout(right.x, 118, { value: `${i + 1}/3`, size: 32, label: "results", caption: "passed" }), { mark: "now" }),
			];
		});
		out.push(k.steps(beats));

		return out;
	},
});
