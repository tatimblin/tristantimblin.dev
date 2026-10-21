#!/usr/bin/env bun
// bun run media:push [--dry-run]
//
// Uploads the site's media to R2 and rewrites src/data/media.json. The sources
// live in media/ (gitignored); a file's path under media/ is its logical name
// (media/videos/fabric.mp4 -> "videos/fabric.mp4"), and its R2 key adds the
// first 8 hex of its SHA-256 before the extension ("videos/fabric.1a2b3c4d.mp4").
// A changed file is a new key, so every object can be cached forever. Keys that
// already answer on the public domain are skipped; old keys are never deleted.
// See tools/media/README.md.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname, extname, basename } from "node:path";

export const BUCKET = "tristantimblin-dev-media";
export const BASE = "https://media.tristantimblin.dev";
export const CACHE_CONTROL = "public, max-age=31536000, immutable";
const ROOT = join(import.meta.dir, "..", "..");
const SRC = join(ROOT, "media");
const MANIFEST = join(ROOT, "src", "data", "media.json");

const TYPES = {
	".mp4": "video/mp4",
	".webm": "video/webm",
	".ogg": "audio/ogg",
	".mp3": "audio/mpeg",
	".jpg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".avif": "image/avif",
};

/** "videos/fabric.mp4" + bytes -> "videos/fabric.<hash8>.mp4" */
export function keyFor(name, bytes) {
	const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 8);
	const ext = extname(name);
	const dir = dirname(name);
	const stem = basename(name, ext);
	return `${dir === "." ? "" : `${dir}/`}${stem}.${hash}${ext}`;
}

function* walk(dir) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else yield path;
	}
}

async function exists(key) {
	try {
		const res = await fetch(`${BASE}/${key}`, { method: "HEAD" });
		return res.ok;
	} catch {
		return false; // domain unreachable: upload, which is idempotent anyway
	}
}

async function main() {
	const dryRun = process.argv.includes("--dry-run");
	if (!existsSync(SRC)) throw new Error(`No ${relative(ROOT, SRC)}/ directory; see tools/media/README.md`);

	// Merge, so a checkout holding only some sources keeps the other entries.
	const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : {};
	let uploaded = 0;
	for (const path of walk(SRC)) {
		const name = relative(SRC, path).split("\\").join("/");
		const type = TYPES[extname(name).toLowerCase()];
		if (!type) throw new Error(`No content type for ${name}; add its extension to TYPES`);
		const key = keyFor(name, readFileSync(path));
		manifest[name] = key;
		if (await exists(key)) continue;
		console.log(`${dryRun ? "would upload" : "upload"} ${key}`);
		uploaded++;
		if (dryRun) continue;
		const proc = Bun.spawnSync(
			["bunx", "wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--remote",
				"--file", path, "--content-type", type, "--cache-control", CACHE_CONTROL],
			{ cwd: ROOT, stdout: "ignore", stderr: "inherit" },
		);
		if (proc.exitCode !== 0) throw new Error(`wrangler failed for ${key}`);
	}

	const sorted = Object.fromEntries(Object.entries(manifest).sort(([a], [b]) => a.localeCompare(b)));
	if (!dryRun) writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, "\t")}\n`);
	console.log(`${uploaded} new, ${Object.keys(sorted).length} in the manifest`);
}

if (import.meta.main) await main();
