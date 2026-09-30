/**
 * An SVG file as an inline fragment — what ArtFrame, Glyph and every
 * generator do with the raw text of a drawing before `set:html`. The
 * drawing has to be inlined rather than put in an <img>: its colours are
 * the tokens and its motion is the host's CSS, and neither reaches an
 * image. Build-time only (an .astro frontmatter), no DOM.
 *
 *   inlineSvg(raw, { attrs: { "aria-hidden": "true", focusable: "false" } })
 *
 * Drops the XML prolog and any doctype (an editor's, not the language's)
 * and the comments (a template's grid notes, a baked file's header — for the
 * author, not the page), then puts `attrs` on the root. An attribute the
 * root already carries is left as the file wrote it, so a file that says its
 * own preserveAspectRatio keeps it. `viewBoxOf` reads the root's viewBox for
 * a host that sizes by it.
 */

/** The file, made a fragment: prolog, doctype and comments gone, and `attrs` on the root. */
export function inlineSvg(
	source: string,
	{ attrs = {}, host = "inlineSvg" }: { attrs?: Record<string, unknown>; host?: string } = {},
): string {
	const body = source
		.replace(/^\s*<\?xml[^>]*\?>/i, "")
		.replace(/^\s*<!DOCTYPE[^>]*>/i, "")
		.replace(/<!--[\s\S]*?-->/g, "")
		.trim();
	if (!/^<svg[\s>]/i.test(body)) {
		throw new Error(`${host}: \`svg\` must be the raw text of an SVG file (import it with \`?raw\`).`);
	}
	const root = body.match(/^<svg[^>]*>/i)![0];
	const add = Object.entries(attrs)
		.filter(([k, v]) => v !== undefined && v !== null && v !== false && !hasAttr(root, k))
		.map(([k, v]) => (v === true ? k : `${k}="${escapeAttr(v)}"`))
		.join(" ");
	return add ? body.replace(/^<svg/i, `<svg ${add}`) : body;
}

/** The root's viewBox as numbers, `[minX, minY, width, height]`, or null when it has none. */
export function viewBoxOf(source: string): [number, number, number, number] | null {
	const root = source.match(/<svg[^>]*>/i)?.[0];
	const vb = root?.match(/\sviewBox\s*=\s*"([^"]*)"/i)?.[1]?.trim().split(/\s+/).map(Number);
	return vb && vb.length === 4 && vb.every((n) => Number.isFinite(n)) ? (vb as [number, number, number, number]) : null;
}

/** Whether the root tag already names the attribute. */
function hasAttr(root: string, name: string): boolean {
	return new RegExp(`\\s${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=`, "i").test(root);
}

/** A value as an attribute string: & and " escaped (the same as Icon's). */
export function escapeAttr(v: unknown): string {
	return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
