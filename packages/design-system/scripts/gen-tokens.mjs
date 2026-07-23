// Generate packages/design-system/src/tokens/tokens.generated.css from the
// published @maximeheckel/design-system package.
//
// The package's globalStyles() is a Stitches globalCss() call that registers
// the :root token vars + .maximeheckel-light / .maximeheckel-dark theme blocks.
// getCssText() then serializes every registered rule — but in Stitches' own
// format: a "--sxs" marker, an outer condition-less @media{} wrapper, component
// keyframes, and a box-sizing reset. We parse that with a brace scanner and
// re-emit ONLY the token/theme rules (:root, the two theme classes, and their
// @supports fallbacks), pretty-printed one declaration per line.
//
// The box-sizing reset is dropped (global.css already owns it) as are any
// keyframes (component-scoped, not tokens).
//
// This is a DEV-TIME step. The committed tokens.generated.css is what ships;
// re-run after `bun update @maximeheckel/design-system` to refresh it:
//
//   bun packages/design-system/scripts/gen-tokens.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { globalStyles, getCssText } from "@maximeheckel/design-system";

// Register the global token rules, then dump the sheet and strip the <style> tags.
globalStyles();
const raw = getCssText().replace(/<\/?style[^>]*>/g, "");

/**
 * Walk `css` and return top-level `{ selector, body }` rule blocks (body is the
 * raw text between the braces). At-rules whose body is itself a block of rules
 * (@media, @supports) are returned with their full inner text as body.
 */
function topLevelRules(css) {
	const rules = [];
	let i = 0;
	const n = css.length;
	while (i < n) {
		// Read a selector/prelude up to the next '{'.
		let brace = css.indexOf("{", i);
		if (brace === -1) break;
		const selector = css.slice(i, brace).trim();
		// Match the balanced body.
		let depth = 1;
		let j = brace + 1;
		for (; j < n && depth > 0; j++) {
			if (css[j] === "{") depth++;
			else if (css[j] === "}") depth--;
		}
		const body = css.slice(brace + 1, j - 1);
		rules.push({ selector, body });
		i = j;
	}
	return rules;
}

/** Format a flat declaration body ("--a:1;--b:2") as indented lines. */
function formatDecls(body, indent = "\t") {
	return body
		.split(";")
		.map((d) => d.trim())
		.filter(Boolean)
		.map((d) => `${indent}${d};`)
		.join("\n");
}

// The whole sheet is wrapped in one condition-less `@media{...}`. Unwrap it.
let rules = topLevelRules(raw);
const mediaWrapper = rules.find((r) => r.selector === "@media");
if (mediaWrapper) rules = topLevelRules(mediaWrapper.body);

const KEEP = new Set([":root", ".maximeheckel-light", ".maximeheckel-dark"]);
const out = [];

for (const { selector, body } of rules) {
	if (KEEP.has(selector)) {
		out.push(`${selector} {\n${formatDecls(body)}\n}`);
	} else if (selector.startsWith("@supports")) {
		// @supports { .theme { ...decls } } — keep, reformatting the inner rule.
		const inner = topLevelRules(body)
			.map((r) => `\t${r.selector} {\n${formatDecls(r.body, "\t\t")}\n\t}`)
			.join("\n");
		out.push(`${selector} {\n${inner}\n}`);
	}
	// Everything else (keyframes, `*{box-sizing}`, the --sxs marker) is dropped.
}

const header = `/* GENERATED from @maximeheckel/design-system via scripts/gen-tokens.mjs.
   Do NOT edit by hand — re-run the script after upgrading the package.
   Site-level overrides belong in tokens.overrides.css (which wins over this). */`;

const dir = dirname(fileURLToPath(import.meta.url));
const dest = join(dir, "..", "src", "tokens", "tokens.generated.css");
writeFileSync(dest, `${header}\n\n${out.join("\n\n")}\n`);
console.log(`Wrote ${dest} — ${out.length} rule blocks`);
