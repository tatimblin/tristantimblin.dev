/**
 * A slug, shorter and shorter, for a breadcrumb that has to fit a phone's
 * header. `slugForms` lists the forms longest first; the header shows the
 * first one that fits (SiteHeader's script), so it needs no width here.
 *
 *   tristans-very-first-slug       the slug
 *   trstns-vry-frst-slg            vowels out, each word's first letter kept
 *   trstns-v…frst-slg              then a middle ellipsis, a character at a
 *   …                              time off alternate ends
 *   trs…slg                        down to three a side
 */

const VOWELS = /[aeiou]/gi;
const ELLIPSIS = "…";
/** The shortest form keeps this many characters each side of the ellipsis. */
const MIN_SIDE = 3;

/** Every vowel out but a word's first letter: "asserting-on" → "assrtng-on". */
export function devowel(slug: string): string {
	return slug
		.split("-")
		.map((word) => word.slice(0, 1) + word.slice(1).replace(VOWELS, ""))
		.join("-");
}

/** `text` at `length` characters, the ellipsis in the middle (the head gets
 *  the odd one). */
export function middleTruncate(text: string, length: number): string {
	if (text.length <= length) return text;
	const keep = Math.max(length - ELLIPSIS.length, 2 * MIN_SIDE);
	const head = Math.ceil(keep / 2);
	const tail = keep - head;
	return text.slice(0, head) + ELLIPSIS + text.slice(text.length - tail);
}

/** The slug's forms, longest first, no repeats: the slug, without its vowels,
 *  then middle-truncated a character at a time to three a side. */
export function slugForms(slug: string): string[] {
	const forms = [slug];
	const bare = devowel(slug);
	if (bare !== slug) forms.push(bare);
	for (let length = bare.length - 1; length >= 2 * MIN_SIDE + ELLIPSIS.length; length--) {
		const form = middleTruncate(bare, length);
		if (form !== forms[forms.length - 1]) forms.push(form);
	}
	return forms;
}
