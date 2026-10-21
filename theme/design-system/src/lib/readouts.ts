// The readouts' pure parts (Formula, NumberStream, ReadoutStack): no DOM,
// deterministic, so a component renders the same markup for the same props
// and a test can hold the parsing and the digits.
import { clampInt, rng } from "./micro/gen/base";

/** One run of a formula: plain text, or a superscript / subscript. */
export interface FormulaPart {
	kind: "text" | "sup" | "sub";
	text: string;
}

/** The typographic minus, where the source says a hyphen. */
const MINUS = "−";

/**
 * A formula in a tiny syntax, cut into runs: `^` raises and `_` lowers the
 * next run — a `{…}` group, or else an optional sign and a run of letters,
 * digits and dots (`z^-1`, `x^3`, `f_c`, `x^{n+1}`). A `^` or `_` with
 * nothing after it is kept as text. Every hyphen becomes a minus sign.
 *
 *   parseFormula("z^-1")  → [z] [sup −1]
 *   parseFormula("x_n^2") → [x] [sub n] [sup 2]
 */
export function parseFormula(value: string): FormulaPart[] {
	const src = String(value ?? "");
	const parts: FormulaPart[] = [];
	const push = (kind: FormulaPart["kind"], text: string) => {
		if (!text) return;
		const t = text.replace(/-/g, MINUS);
		const last = parts[parts.length - 1];
		if (kind === "text" && last?.kind === "text") last.text += t;
		else parts.push({ kind, text: t });
	};
	let i = 0;
	while (i < src.length) {
		const ch = src[i];
		if (ch === "^" || ch === "_") {
			const kind = ch === "^" ? "sup" : "sub";
			let j = i + 1;
			let run = "";
			if (src[j] === "{") {
				const end = src.indexOf("}", j + 1);
				if (end > j) {
					run = src.slice(j + 1, end);
					j = end + 1;
				}
			} else {
				const m = /^[-+]?[\p{L}\p{N}.]+/u.exec(src.slice(j));
				if (m) {
					run = m[0];
					j += run.length;
				}
			}
			if (run) {
				push(kind, run);
				i = j;
				continue;
			}
		}
		push("text", ch);
		i += 1;
	}
	return parts;
}

/**
 * What a reader hears for a formula: `z^-1` → "z to the minus 1", `f_c` →
 * "f sub c". Used when the Formula is given no `label` of its own.
 */
export function spokenFormula(parts: readonly FormulaPart[]): string {
	return parts
		.map((p) => {
			const t = p.text.replace(new RegExp(MINUS, "g"), " minus ").replace(/\s+/g, " ").trim();
			if (p.kind === "sup") return ` to the ${t}`;
			if (p.kind === "sub") return ` sub ${t}`;
			return t;
		})
		.join("")
		.replace(/\s+/g, " ")
		.trim();
}

/** NumberStream's ranges (rows 1–8, digits 1–16) and defaults. */
export const NUMBER_STREAM = Object.freeze({ rows: 2, digits: 10, seed: 7, maxRows: 8, maxDigits: 16 });

/**
 * Rows of digits from a seed: `rows` (1–8) strings of `digits` (1–16)
 * digits each, the same for the same arguments. A value that is not a
 * number falls back to the default; one out of range is clamped.
 */
export function numberStream(
	seed: unknown = NUMBER_STREAM.seed,
	rows: unknown = NUMBER_STREAM.rows,
	digits: unknown = NUMBER_STREAM.digits,
): string[] {
	const r = clampInt(rows, 1, NUMBER_STREAM.maxRows, NUMBER_STREAM.rows);
	const d = clampInt(digits, 1, NUMBER_STREAM.maxDigits, NUMBER_STREAM.digits);
	const next = rng(typeof seed === "number" && Number.isFinite(seed) ? seed : NUMBER_STREAM.seed);
	return Array.from({ length: r }, () => Array.from({ length: d }, () => Math.floor(next() * 10)).join(""));
}

/** The emphasised index of a ReadoutStack: an integer in 0…n−1 (0 when not a number). */
export function activeIndex(active: unknown, n: number): number {
	if (n <= 0) return -1;
	return clampInt(active, 0, n - 1, 0);
}
