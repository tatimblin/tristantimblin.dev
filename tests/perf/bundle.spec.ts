import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { WIDGET_GZIP, WIDGET_GZIP_DEFAULT } from "./budgets";
import { expect, observed, test } from "./fixtures";

/**
 * EACH WIDGET'S SCRIPT STAYS SMALL. A card's client is its own chunk,
 * dist/_astro/widget-<name>.<hash>.js (astro.config.mjs names them), and is
 * held to a gzipped size: what a visitor downloads for that card. Reads the
 * build the project's web server just made.
 */

const ASTRO = join(import.meta.dirname, "..", "..", "dist", "_astro");

test("every widget chunk is within its gzip budget", () => {
	const chunks = readdirSync(ASTRO)
		.map((file) => ({ file, name: file.match(/^widget-([a-z0-9-]+)\.[^.]+\.js$/)?.[1] }))
		.filter((c): c is { file: string; name: string } => !!c.name);
	expect(chunks.length, "widget chunks in dist/_astro").toBeGreaterThan(0);
	const sizes: Record<string, number> = {};
	for (const { file, name } of chunks) {
		sizes[name] = gzipSync(readFileSync(join(ASTRO, file)), { level: 9 }).length;
	}
	observed("gzip bytes per widget chunk", sizes, WIDGET_GZIP);
	for (const [name, bytes] of Object.entries(sizes)) {
		expect(bytes, `widget-${name}, gzipped`).toBeLessThanOrEqual(WIDGET_GZIP[name] ?? WIDGET_GZIP_DEFAULT);
	}
});
