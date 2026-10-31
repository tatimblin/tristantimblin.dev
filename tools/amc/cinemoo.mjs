/**
 * The A-List widget's watch history, from Cinemoo (cinemoo.app).
 *
 * AMC's own API sits behind a Cloudflare WAF that refuses every client but
 * the AMC app, so the history comes from Cinemoo instead: it reads the AMC
 * ticket emails Gmail forwards to tatimblin@cinemoo.party, and exports them as
 * CSV at /api/export?format=csv for the signed-in account.
 *
 * Auth is the Auth.js session cookie (__Secure-authjs.session-token), stored
 * as the CINEMOO_SESSION secret (the bare value, or a full "name=value; …"
 * cookie header). Auth.js slides the session forward on use and may answer
 * with a refreshed token; a refreshed token is written to
 * CINEMOO_ROTATED_COOKIE_FILE for the workflow to persist, so the session
 * never lapses while this keeps running.
 *
 * Writes src/data/amc.json in the shape tools/amc/fetch.mjs did, keeping the
 * AMC poster and id already on file for a film (matched by name).
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const OUT_PATH = fileURLToPath(new URL("../../src/data/amc.json", import.meta.url));
const EXPORT_URL = "https://www.cinemoo.app/api/export?format=csv";
const COOKIE_NAME = "__Secure-authjs.session-token";

function mask(secret) {
	if (secret && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${secret}`);
}

/** The Cookie header for a stored secret: a bare token, or a whole header. */
export function cookieHeader(secret) {
	const s = String(secret ?? "").trim();
	return s.includes("=") ? s : `${COOKIE_NAME}=${s}`;
}

/** The refreshed session cookie(s) from Set-Cookie headers, as a Cookie
 *  header, or null when the session was not reissued. Chunked tokens
 *  (`…session-token.0`, `.1`) are kept together. */
export function rotatedCookie(setCookies, current) {
	const pairs = new Map(
		cookieHeader(current)
			.split(/;\s*/)
			.filter(Boolean)
			.map((p) => [p.slice(0, p.indexOf("=")), p.slice(p.indexOf("=") + 1)]),
	);
	let changed = false;
	for (const sc of setCookies) {
		const m = sc.match(/^\s*([^=;\s]+)=([^;]*)/);
		if (!m || !m[1].startsWith(COOKIE_NAME)) continue;
		// An empty value is Auth.js clearing the cookie (signed out); keeping
		// the old one at least leaves something to re-capture from.
		if (!m[2] || pairs.get(m[1]) === m[2]) continue;
		pairs.set(m[1], m[2]);
		changed = true;
	}
	return changed ? [...pairs].map(([n, v]) => `${n}=${v}`).join("; ") : null;
}

/** RFC 4180 CSV → array of rows (quoted fields, "" escapes, CRLF). */
export function parseCsv(text) {
	const rows = [];
	let row = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') quoted = false;
			else field += c;
		} else if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else field += c;
	}
	if (field || row.length) {
		row.push(field);
		rows.push(row);
	}
	return rows.filter((r) => r.some((f) => f.trim()));
}

const norm = (h) => h.toLowerCase().replace(/[^a-z]/g, "");

/** Which column holds what, from the header row. Exported for the tests. */
export function mapColumns(header) {
	const find = (...res) => {
		for (const re of res) {
			const i = header.findIndex((h) => re.test(norm(h)));
			if (i >= 0) return i;
		}
		return -1;
	};
	return {
		name: find(/^(film|movie|title)(name|title)?$/, /film|movie|title/),
		theatre: find(/^(theat(er|re)|cinema|venue|location)(name)?$/, /theat(er|re)|cinema/),
		// One combined showtime column, or a date and a time column.
		showtime: find(/^(showtime|showtimeat|startsat|start|datetime|showdatetime)$/),
		date: find(/^(date|showdate|visitdate|showtimedate)$/, /date/),
		time: find(/^(time|showtimetime|starttime)$/),
		status: find(/^(status|state)$/, /refund|cancel/),
	};
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const p2 = (n) => String(n).padStart(2, "0");

/** Wall-clock parts of a showtime: "2024-01-10T19:45", "2024-01-10 7:45 PM",
 *  "1/10/2024" + "7:45 PM", …  Parsed as local theatre time, never shifted
 *  through a timezone (a trailing Z/offset is ignored on purpose: the widget
 *  shows the time printed on the ticket). */
export function parseShowtime(dateStr, timeStr = "") {
	const s = `${dateStr ?? ""} ${timeStr ?? ""}`.trim();
	let y, mo, d;
	let m = s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
	if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
	else if ((m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) {
		[mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
		if (y < 100) y += 2000;
	} else if ((m = s.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/))) {
		mo = MONTHS.findIndex((n) => n.toLowerCase().startsWith(m[1].slice(0, 3).toLowerCase())) + 1;
		[d, y] = [Number(m[2]), Number(m[3])];
	}
	if (!(y > 1900 && mo >= 1 && mo <= 12 && d >= 1)) return null;
	const iso = `${y}-${p2(mo)}-${p2(d)}`;
	const out = {
		iso,
		date: `${MONTHS[mo - 1]} ${d}, ${y}`,
		day: DAYS[new Date(Date.UTC(y, mo - 1, d)).getUTCDay()],
		time: null,
		start: null,
	};
	// The time: after the date in an ISO stamp, or anywhere in the rest.
	const rest = s.replace(m[0], " ");
	const t = rest.match(/(?:T|\s|^)(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([AaPp])?\.?[Mm]?\.?/);
	if (t) {
		let h = Number(t[1]);
		const ap = t[3]?.toLowerCase();
		if (ap === "p" && h < 12) h += 12;
		if (ap === "a" && h === 12) h = 0;
		out.start = `${iso}T${p2(h)}:${t[2]}`;
		out.time = `${h % 12 || 12}:${t[2]}${h < 12 ? "am" : "pm"}`;
	}
	return out;
}

/** The widget's movies from CSV rows, oldest first. Exported for the tests. */
export function toMovies(rows, known = new Map(), now = new Date()) {
	const [header, ...body] = rows;
	const col = mapColumns(header);
	if (col.name < 0 || (col.showtime < 0 && col.date < 0)) {
		throw new Error(`Cinemoo CSV: no film and/or date column in header [${header.join(" | ")}]`);
	}
	const today = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
	const movies = [];
	for (const r of body) {
		const name = r[col.name]?.trim();
		if (!name) continue;
		if (col.status >= 0 && /refund|cancel/i.test(r[col.status] ?? "")) continue;
		const when =
			col.showtime >= 0 ? parseShowtime(r[col.showtime]) : parseShowtime(r[col.date], col.time >= 0 ? r[col.time] : "");
		if (!when) continue;
		const prior = known.get(name.toLowerCase());
		movies.push({
			id: prior?.id ?? null,
			name,
			poster: prior?.poster ?? null,
			theatre: col.theatre >= 0 ? r[col.theatre]?.trim() || null : null,
			date: when.date,
			time: when.time,
			day: when.day,
			iso: when.iso,
			start: when.start,
			...(when.iso > today ? { upcoming: true } : {}),
		});
	}
	return movies.sort((a, b) => String(a.start ?? a.iso).localeCompare(String(b.start ?? b.iso)));
}

async function main() {
	const secret = process.env.CINEMOO_SESSION;
	if (!secret) {
		console.error("::error::CINEMOO_SESSION is not set. Copy __Secure-authjs.session-token from a signed-in cinemoo.app tab.");
		process.exit(1);
	}
	const cookie = cookieHeader(secret);
	mask(secret);
	mask(cookie);

	const res = await fetch(EXPORT_URL, {
		headers: { cookie, accept: "text/csv,*/*" },
		redirect: "manual",
		signal: AbortSignal.timeout(30_000),
	});

	// Persist a refreshed session before anything can fail.
	const next = rotatedCookie(res.headers.getSetCookie?.() ?? [], secret);
	if (next) {
		mask(next);
		if (process.env.CINEMOO_ROTATED_COOKIE_FILE) {
			await writeFile(process.env.CINEMOO_ROTATED_COOKIE_FILE, next, { encoding: "utf8", mode: 0o600 });
		}
		console.log("Cinemoo session refreshed — written for the workflow to persist.");
	}

	const text = await res.text();
	if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
		console.error(
			`::error::Cinemoo refused the session (${res.status}). Sign in at cinemoo.app and re-set CINEMOO_SESSION ` +
				"from the __Secure-authjs.session-token cookie.",
		);
		process.exit(1);
	}
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} from Cinemoo export: ${text.slice(0, 200)}`);

	const rows = parseCsv(text);
	console.log(`Cinemoo CSV: ${Math.max(rows.length - 1, 0)} rows; columns: ${(rows[0] ?? []).join(" | ")}`);

	let known = new Map();
	try {
		const prev = JSON.parse(await readFile(OUT_PATH, "utf8"));
		const list = Array.isArray(prev) ? prev : prev.movies ?? [];
		known = new Map(list.filter((m) => m?.name).map((m) => [m.name.toLowerCase(), m]));
	} catch {}

	const movies = toMovies(rows, known);
	if (!movies.length) {
		console.error("::error::Cinemoo export parsed to no movies — not overwriting amc.json.");
		process.exit(1);
	}
	const upcoming = movies.filter((m) => m.upcoming).length;
	await writeFile(OUT_PATH, `${JSON.stringify({ updated: new Date().toISOString(), movies }, null, "\t")}\n`, "utf8");
	console.log(`Wrote ${movies.length - upcoming} seen and ${upcoming} booked movies to ${OUT_PATH}`);
}

if (import.meta.main ?? process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(`::error::${err?.stack ?? err}`);
		process.exit(1);
	});
}
