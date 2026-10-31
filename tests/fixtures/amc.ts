/**
 * Booked AMC tickets for tests and local dev: the real data has none yet, and
 * none is ever faked into src/data. Dated from `today`, so a booking is
 * always 22 and 28 days out. Shaped as tools/amc/cinemoo.mjs writes amc.json,
 * with the cache entries tools/amc/enrich.mjs would add.
 *
 * Used by src/widgets/amc/amc.test.ts, tests/amc.spec.ts (which swaps it into
 * the built page's film list) and the dev-only page /dev/amc/
 * (src/pages/dev/[fixture].astro, never built).
 */
import type { CacheEntry, Movie } from "../../src/widgets/amc/amc";

const iso = (today: Date, days: number) => {
	const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function upcomingMovies(today = new Date()): Movie[] {
	return [
		{
			id: "fixture-hunger-games",
			name: "The Hunger Games: Sunrise on the Reaping",
			poster: "https://upload.wikimedia.org/wikipedia/en/d/da/The_Hunger_Games_-_Sunrise_on_the_Reaping_poster.jpg",
			iso: iso(today, 22),
			upcoming: true,
		},
		{
			id: "fixture-hexed",
			name: "Hexed",
			poster: "https://upload.wikimedia.org/wikipedia/en/7/72/Hexed_poster.jpg",
			iso: iso(today, 28),
			upcoming: true,
		},
	];
}

export const upcomingCache: Record<string, CacheEntry> = {
	"the-hunger-games-sunrise-on-the-reaping": {
		title: "The Hunger Games: Sunrise on the Reaping",
		imdb_id: null,
		primary_genre: "Action",
		amc_id: "fixture-hunger-games",
	},
	hexed: { title: "Hexed", imdb_id: null, primary_genre: "Animation", amc_id: "fixture-hexed" },
};
