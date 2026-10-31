// AMC A-List films — read at build time from amc.json (the tickets, written by
// tools/amc/cinemoo.mjs) joined with amc-films.json (each film's IMDb id and
// genre bucket, written by tools/amc/enrich.mjs and hand-editable). Amc.astro
// hands the result to the client as JSON; ./arc.ts lays it out.
import amc from "../../data/amc.json";
import cache from "../../data/amc-films.json";
import { asGenre, filmKey, type Genre } from "./genres";

/** One film as the client sees it: short keys, since all of them ship in the
 *  page. */
export interface Film {
	/** The film's name. */
	n: string;
	/** The showing's local date, YYYY-MM-DD. */
	d: string;
	/** The genre bucket. */
	g: Genre;
	/** IMDb: the title page, or a search when the id is unknown. */
	h: string;
	/** The poster: TMDB's, else AMC's cropped to 2:3; null when neither has
	 *  one (the card shows the title on its genre's tint). */
	p: string | null;
	/** Booked, not yet seen (as of the fetch; the client re-checks the date). */
	u?: true;
}

export interface Movie {
	id?: string | null;
	name?: string | null;
	poster?: string | null;
	date?: string | null;
	iso?: string | null;
	upcoming?: boolean;
}

export interface CacheEntry {
	title?: string;
	imdb_id?: string | null;
	primary_genre?: string;
	amc_id?: string | null;
	poster?: string | null;
	/** TMDB's movie id and poster path ("/abc.jpg"), from tools/amc/posters.mjs. */
	tmdb_id?: number | null;
	tmdb_poster?: string | null;
	/** When TMDB last had no poster for it (YYYY-MM-DD). */
	tmdb_checked?: string;
}

/** TMDB's image CDN; a poster is `<base><size><path>`. Hotlinked, as TMDB
 *  asks: nothing is downloaded or committed. */
export const TMDB_IMAGES = "https://image.tmdb.org/t/p/";
/** TMDB's poster widths are w92, w154, w185, w342, w500, w780. The poster's
 *  CSS width (--amc-pw, measured across 320–2560px viewports) is 51px on
 *  desktop and peaks at 98px around an 880px window; on a phone it is
 *  25–35px. w185 covers 2× DPR up to 92px (every desktop, phone and
 *  portrait tablet; 3× on a phone) at a third to a half the bytes of w342
 *  (17–19 KB against 38–67 KB, sampled), which
 *  matters when the prefetch warms every poster on a slow connection. Only
 *  a 2× screen in an 840–900px window upscales it, by at most 5%. */
export const TMDB_SIZE = "w185";

/** The poster on TMDB's CDN for a cached path, or null for none (or one that
 *  isn't a bare path). */
export function tmdbPosterUrl(path: string | null | undefined, size = TMDB_SIZE): string | null {
	return path && /^\/[\w.-]+$/.test(path) ? `${TMDB_IMAGES}${size}${path}` : null;
}

/** The poster's CSS width tops out near 120px (a quarter of the largest
 *  cell), so 240 covers it at 2× DPR. */
export const POSTER_WIDTH = 240;

const CLOUDINARY = "https://amc-theatres-res.cloudinary.com/";

/**
 * AMC's poster through its own Cloudinary, cropped to exactly 2:3 at `width`:
 * `<host>/image/upload/c_fill,ar_2:3,w_<width>/<the rest>`. AMC's URLs are
 * either bare (`<host>/v123/amc-cdn/…`) or already `image/upload/…` with or
 * without a transform; any other host is returned as it is.
 */
export function posterUrl(url: string | null | undefined, width = POSTER_WIDTH): string | null {
	if (!url) return null;
	if (!url.startsWith(CLOUDINARY)) return url;
	let rest = url.slice(CLOUDINARY.length).replace(/^image\/upload\//, "");
	// Drop a transform already there: the segment before the version.
	const segs = rest.split("/");
	if (segs.length > 1 && /(^|,)[a-z]{1,3}_/.test(segs[0]) && !/^v\d+$/.test(segs[0])) rest = segs.slice(1).join("/");
	return `${CLOUDINARY}image/upload/c_fill,ar_2:3,w_${width}/${rest}`;
}

export function imdbHref(imdbId: string | null | undefined, name: string): string {
	return imdbId && /^tt\d+$/.test(imdbId)
		? `https://www.imdb.com/title/${imdbId}/`
		: `https://www.imdb.com/find/?q=${encodeURIComponent(name)}`;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The showing's date as YYYY-MM-DD: the fetch's `iso`, or parsed from its
 *  display string ("January 10, 2024") for tickets fetched before it had one. */
export function isoDate(movie: Movie): string | null {
	if (movie.iso && /^\d{4}-\d{2}-\d{2}$/.test(movie.iso)) return movie.iso;
	const m = String(movie.date ?? "").match(/^\s*([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/);
	const month = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
	if (!m || month < 0) return null;
	return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

/**
 * The tickets as films, in watch order (by date; a stable sort, so two
 * showings on one day keep the fetch's order), joined with the metadata
 * cache by AMC movie id, then by name. A film the cache doesn't know yet is
 * Other with an IMDb search link. Tickets with no name or no readable date
 * are dropped.
 */
export function buildFilms(movies: Movie[], films: Record<string, CacheEntry>): Film[] {
	const byAmcId = new Map<string, CacheEntry>();
	for (const e of Object.values(films)) if (e?.amc_id) byAmcId.set(String(e.amc_id), e);

	const out: Film[] = [];
	for (const m of movies) {
		const d = isoDate(m);
		if (!m.name || !d) continue;
		const meta = (m.id != null ? byAmcId.get(String(m.id)) : undefined) ?? films[filmKey(m.name)] ?? {};
		out.push({
			n: m.name,
			d,
			g: asGenre(meta.primary_genre),
			h: imdbHref(meta.imdb_id, m.name),
			// A poster set by hand on the cache entry, then TMDB's, then AMC's.
			p: (meta.poster ? posterUrl(meta.poster) : tmdbPosterUrl(meta.tmdb_poster)) ?? posterUrl(m.poster),
			...(m.upcoming ? { u: true as const } : {}),
		});
	}
	return out.map((f, i) => [f, i] as const).sort(([a, i], [b, j]) => a.d.localeCompare(b.d) || i - j).map(([f]) => f);
}

export function getFilms(): Film[] {
	return buildFilms(amc.movies as Movie[], cache as Record<string, CacheEntry>);
}
