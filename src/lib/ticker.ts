/**
 * Ticker data, read at build time from src/data/ticker.json.
 *
 * The JSON is regenerated daily by .github/workflows/ticker.yml (which runs
 * tools/ticker/fetch.mjs — keep the paths in sync). Vite inlines it, so the data
 * is bundled with the page: no filesystem read at render time and no request from
 * the visitor's browser.
 *
 * Every field is optional on the way in. A source that failed writes null rather
 * than a placeholder, and this module's job is to turn that into "the segment is
 * absent" instead of "the segment says null".
 */
import data from "../data/ticker.json";

export interface TickerWeather {
	tempF: number;
	label: string;
}

export interface TickerQuote {
	symbol: string;
	price: number;
	change: number | null;
	changePct: number | null;
	session: string | null;
}

export interface TickerData {
	/** ISO instant the data was fetched. */
	updated: string | null;
	city: string;
	region: string;
	timeZone: string;
	weather: TickerWeather | null;
	quotes: TickerQuote[];
}

export function getTickerData(): TickerData {
	const raw = data as Record<string, any>;
	const weather = raw?.weather;

	return {
		updated: typeof raw?.updated === "string" ? raw.updated : null,
		city: raw?.location?.city ?? "San Francisco",
		region: raw?.location?.region ?? "California",
		timeZone: raw?.location?.timeZone ?? "America/Los_Angeles",
		weather:
			weather && typeof weather.tempF === "number"
				? { tempF: weather.tempF, label: weather.label || "—" }
				: null,
		quotes: Array.isArray(raw?.quotes)
			? raw.quotes
					.filter((q: any) => q && typeof q.price === "number")
					.map((q: any) => ({
						symbol: String(q.symbol),
						price: q.price,
						change: typeof q.change === "number" ? q.change : null,
						changePct: typeof q.changePct === "number" ? q.changePct : null,
						session: typeof q.session === "string" ? q.session : null,
					}))
			: [],
	};
}

/** "Aug 25" from the fetch timestamp, for the ticker's as-of stamp. */
export function asOfLabel(updated: string | null, timeZone: string): string | null {
	if (!updated) return null;
	const when = new Date(updated);
	if (Number.isNaN(when.getTime())) return null;
	return when.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone });
}
