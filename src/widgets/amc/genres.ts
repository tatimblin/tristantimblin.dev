// The A-List's eight genre buckets, and how a film's genre labels (IMDb's
// "Animation", Wikidata's "animated feature film", …) fall into one.
//
// Shared by the widget (types, colours) and tools/amc/enrich.mjs (bucketing a
// newly seen film), so it imports nothing.

export const GENRES = ["Animation", "Action", "Comedy", "Sci-Fi", "Biopic", "Thriller", "Drama", "Other"] as const;

export type Genre = (typeof GENRES)[number];

/** Priority order: the first bucket any label matches wins. Animation first,
 *  since an animated film is also a comedy or an adventure; a biopic before
 *  the drama it always is; sci-fi before the action it usually is. Musicals
 *  and family films have no bucket of their own (too few to colour) and land
 *  in Other with everything unmatched. */
const RULES: [Exclude<Genre, "Other">, RegExp][] = [
	["Animation", /\banimat|\banime\b/i],
	["Biopic", /\bbiograph|\bbiopic/i],
	["Sci-Fi", /science[ -]fiction|\bsci-?fi\b|space (?:opera|western)|cyberpunk/i],
	["Action", /\baction\b|martial arts|superhero|war film/i],
	["Thriller", /thriller|\bhorror\b|suspense|\bcrime\b|mystery/i],
	["Comedy", /comed|\bhumou?r\b|satir|parody/i],
	["Drama", /\bdrama\b|western/i],
];

export function genreBucket(labels: readonly string[]): Genre {
	for (const [genre, re] of RULES) if (labels.some((l) => re.test(l))) return genre;
	return "Other";
}

/** A bucket name read back from the cache, tolerating a hand edit's case;
 *  anything unknown (an old "Musical") is Other. */
export function asGenre(value: unknown): Genre {
	const s = String(value ?? "").toLowerCase();
	return GENRES.find((g) => g.toLowerCase() === s) ?? "Other";
}

/** The cache key for a film: its name, lowercased, accents and punctuation
 *  dropped, so "Let's Start A Cult" and "Lets Start a Cult" are one film. */
export function filmKey(name: string): string {
	return name
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/&/g, " and ")
		.replace(/[^a-z0-9]+/g, " ")
		.trim()
		.replace(/ /g, "-");
}
