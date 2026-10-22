/**
 * The committed-ledger helpers for the nightly fetchers: a fetcher re-reads a
 * trailing window from its API every night and folds it into the JSON already
 * in git, so the file outlives the API's own retention.
 *
 * The rules (carried over from the retired Cloudflare RUM readers fetch):
 *   - rows inside the fresh window come from the fresh read only, so a day can
 *     go back DOWN;
 *   - rows before it are whatever is on disk, because the API is no longer
 *     asked about them;
 *   - an unreadable file is refused, never treated as empty.
 */
import { readFile } from "node:fs/promises";

export const isoDay = (date) => date.toISOString().slice(0, 10);

/** The UTC date `n` days before `from` (default now), as YYYY-MM-DD. */
export function daysAgo(n, from = new Date()) {
	const date = new Date(from);
	date.setUTCDate(date.getUTCDate() - n);
	return isoDay(date);
}

/** `day` (YYYY-MM-DD) shifted by `n` days. */
export function addDays(day, n) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + n);
	return isoDay(date);
}

/** Every date from `from` to `to` inclusive, so a series has no holes. */
export function dateRange(from, to) {
	const out = [];
	for (let day = from; day <= to; day = addDays(day, 1)) out.push(day);
	return out;
}

/**
 * Folds a freshly read window into the rows already on disk.
 *
 * `key` names a row (the date for a daily series; date + path for a per-path
 * one — keying those on the date alone would keep one path per day). Rows
 * dated `since` or later come from `fresh` only; older ones from `existing`.
 * Sorted by `key`.
 */
export function mergeWindow(existing, fresh, since, key = (row) => row.date) {
	const byKey = new Map();
	for (const row of existing) {
		if (row?.date && row.date < since) byKey.set(key(row), row);
	}
	for (const row of fresh) byKey.set(key(row), row);
	return [...byKey.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
}

/**
 * Reads a committed ledger. A MISSING file is the first run (null). A file
 * that is there but does not parse is an error: merging into "nothing" would
 * write a window-long file over the history this pipeline exists to keep.
 */
export async function readLedger(path) {
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch (err) {
		if (err?.code === "ENOENT") return null;
		throw err;
	}
	try {
		return JSON.parse(text);
	} catch (err) {
		throw new Error(
			`${path} exists but is not valid JSON (${err.message}). Refusing to overwrite it — ` +
				"the committed ledger is the only copy of its history.",
		);
	}
}
