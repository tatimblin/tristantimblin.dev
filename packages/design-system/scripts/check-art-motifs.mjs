// Keeps the post-art skill honest: every ```svg block in its motif vocabulary
// (.claude/skills/post-art/references/motifs.md) is wrapped in the root an art
// file has and run through the validator, so a snippet an artist copies is a
// snippet that passes. Also holds each to the 15-line limit the skill promises.
//
//   bun packages/design-system/scripts/check-art-motifs.mjs [motifs.md]   // exit 1 on a violation

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateArt } from "./validate-art.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const file = process.argv[2] ?? resolve(here, "../../../.claude/skills/post-art/references/motifs.md");
const md = readFileSync(file, "utf8");
const OPEN = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">';
const MAX_LINES = 15;

let code = 0;
let count = 0;
for (const m of md.matchAll(/^### (.+)\n[\s\S]*?^```svg\n([\s\S]*?)^```/gm)) {
	const [, name, body] = m;
	count++;
	const problems = validateArt(`${OPEN}\n${body}</svg>\n`, { slug: "motif" });
	const lines = body.trimEnd().split("\n").length;
	if (lines > MAX_LINES) problems.push(`length: ${lines} lines; a motif is at most ${MAX_LINES}`);
	if (problems.length === 0) {
		console.log(`ok    ${name}`);
	} else {
		console.log(`FAIL  ${name}\n${problems.map((p) => `  ${p}`).join("\n")}`);
		code = 1;
	}
}
if (count === 0) {
	console.error(`no motifs found in ${file}`);
	code = 2;
}
process.exitCode = code;
