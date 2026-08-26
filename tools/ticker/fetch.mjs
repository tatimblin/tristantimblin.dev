/**
 * Ticker data for /txt — weather and market quotes, refreshed daily.
 *
 * Mirrors tools/github-stats/fetch.mjs: a scheduled Action runs this, it writes
 * src/data/ticker.json, and the workflow commits the file if it changed. Astro
 * imports that JSON in frontmatter, so nothing is fetched at render time and no
 * request leaves the visitor's browser.
 *
 * Both sources are keyless, so this needs no secret:
 *   - Open-Meteo for current conditions (documented, CORS-open, free).
 *   - api.nasdaq.com for quotes. Undocumented, and that is the risk here: it can
 *     change shape or start refusing a datacentre IP without notice. Hence the
 *     partial-failure rule below.
 *
 * PARTIAL FAILURE IS NOT AN ERROR, BUT INVENTING DATA IS. If a source fails, its
 * key is written as null and the page simply drops that segment. What must never
 * happen is a stale or made-up number rendered as if it were current — a ticker
 * quoting a price that is not the price is worse than a ticker with no price on
 * it. The whole run only exits non-zero if EVERY source failed, which is the
 * signal that the pipeline itself is broken rather than one endpoint being down.
 */
import { writeFile } from "node:fs/promises";

const OUT_PATH = "src/data/ticker.json";

// The paper's home. Coordinates are only used for the forecast lookup.
const PLACE = {
	city: "San Francisco",
	region: "California",
	timeZone: "America/Los_Angeles",
	latitude: 37.7749,
	longitude: -122.4194,
};

const SYMBOLS = ["AMZN", "YEXT"];

// api.nasdaq.com refuses a bare client.
const UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
	"(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** WMO weather codes → the short label a ticker has room for. */
const WMO = new Map([
	[0, "Clear"], [1, "Mainly clear"], [2, "Partly cloudy"], [3, "Overcast"],
	[45, "Fog"], [48, "Rime fog"],
	[51, "Light drizzle"], [53, "Drizzle"], [55, "Heavy drizzle"],
	[56, "Freezing drizzle"], [57, "Freezing drizzle"],
	[61, "Light rain"], [63, "Rain"], [65, "Heavy rain"],
	[66, "Freezing rain"], [67, "Freezing rain"],
	[71, "Light snow"], [73, "Snow"], [75, "Heavy snow"], [77, "Snow grains"],
	[80, "Showers"], [81, "Showers"], [82, "Violent showers"],
	[85, "Snow showers"], [86, "Snow showers"],
	[95, "Thunderstorm"], [96, "Thunderstorm, hail"], [99, "Thunderstorm, hail"],
]);

async function getJSON(url, headers = {}) {
	const response = await fetch(url, {
		headers: { accept: "application/json", ...headers },
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
	return response.json();
}

async function fetchWeather() {
	const url =
		`https://api.open-meteo.com/v1/forecast?latitude=${PLACE.latitude}` +
		`&longitude=${PLACE.longitude}&current=temperature_2m,weather_code` +
		`&temperature_unit=fahrenheit&timezone=${encodeURIComponent(PLACE.timeZone)}`;
	const data = await getJSON(url);
	const current = data?.current;
	if (!current || typeof current.temperature_2m !== "number") {
		throw new Error("Open-Meteo returned no current temperature");
	}
	return {
		tempF: Math.round(current.temperature_2m),
		code: current.weather_code ?? null,
		label: WMO.get(current.weather_code) ?? "—",
		observed: current.time ?? null,
	};
}

/** "$261.06" / "+0.05" / "-0.39%" → a number. Returns null if unparseable, so a
 *  format change surfaces as a missing segment rather than as NaN on the page. */
function toNumber(raw) {
	if (typeof raw !== "string") return typeof raw === "number" ? raw : null;
	const cleaned = raw.replace(/[$,%\s]/g, "");
	if (cleaned === "" || cleaned === "N/A") return null;
	const value = Number(cleaned);
	return Number.isFinite(value) ? value : null;
}

async function fetchQuote(symbol) {
	// assetclass is required and differs by listing venue; NYSE names 404 under
	// "stocks" on some paths, so fall back rather than dropping the symbol.
	for (const assetclass of ["stocks", "etf"]) {
		try {
			const data = await getJSON(
				`https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${assetclass}`,
				{ "user-agent": UA },
			);
			const primary = data?.data?.primaryData;
			const price = toNumber(primary?.lastSalePrice);
			if (price === null) continue;
			return {
				symbol,
				name: data?.data?.companyName ?? symbol,
				price,
				change: toNumber(primary?.netChange),
				changePct: toNumber(primary?.percentageChange),
				// NASDAQ marks after-hours/closed sessions here; keep it so the page
				// can say "at close" rather than implying a live tick.
				session: primary?.lastTradeTimestamp ?? null,
			};
		} catch {
			// try the next assetclass
		}
	}
	throw new Error(`no quote for ${symbol}`);
}

async function settle(label, promise) {
	try {
		return { label, value: await promise };
	} catch (error) {
		console.warn(`::warning::${label} failed: ${error?.message ?? error}`);
		return { label, value: null };
	}
}

async function main() {
	const [weather, ...quotes] = await Promise.all([
		settle("weather", fetchWeather()),
		...SYMBOLS.map((s) => settle(s, fetchQuote(s))),
	]);

	const gotQuotes = quotes.map((q) => q.value).filter(Boolean);
	if (!weather.value && gotQuotes.length === 0) {
		throw new Error("every source failed — not overwriting the last good data");
	}

	const out = {
		// UTC, matching the github-stats file. The cron runs in UTC.
		updated: new Date().toISOString(),
		location: {
			city: PLACE.city,
			region: PLACE.region,
			timeZone: PLACE.timeZone,
		},
		weather: weather.value,
		quotes: gotQuotes,
	};

	await writeFile(OUT_PATH, `${JSON.stringify(out, null, "\t")}\n`, "utf8");
	console.log(
		`Wrote ${OUT_PATH}: weather ${weather.value ? `${weather.value.tempF}F` : "MISSING"}, ` +
			`quotes ${gotQuotes.map((q) => `${q.symbol} ${q.price}`).join(", ") || "MISSING"}.`,
	);
}

main().catch((err) => {
	console.error(`::error::${err?.stack ?? err}`);
	process.exit(1);
});
