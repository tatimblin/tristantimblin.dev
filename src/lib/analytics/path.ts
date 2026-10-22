/**
 * The one shape a counted path takes: what the page sends to GoatCounter
 * (Layout's `<meta name="hit-path">`), what the nightly fetch keys its ledger
 * on (tools/pageviews), and what the pages look counts up by
 * (src/lib/pageviews.ts). One function so the three can never disagree.
 *
 *   - a leading and a trailing slash (the site serves every page as a
 *     directory, astro.config `trailingSlash: "always"`);
 *   - no query and no hash;
 *   - lowercase, with runs of slashes collapsed and `index.html` dropped;
 *   - anything else — a scheme-relative `//host`, `..`, whitespace, encoded
 *     bytes, a path longer than any real page's — is junk, and comes back null.
 */

/** Longer than any real page's path; the scanner paths are not. */
const MAX_LENGTH = 200;

/** Lowercase letters, digits and the URL-safe punctuation the slugs use. */
const SAFE = /^[a-z0-9/_.~-]*$/;

export function normalisePath(input: string | null | undefined): string | null {
	if (typeof input !== "string") return null;
	let path = input.trim();
	if (!path) return null;

	// A full URL keeps only its path.
	if (/^[a-z][a-z0-9+.-]*:/i.test(path)) {
		try {
			path = new URL(path).pathname;
		} catch {
			return null;
		}
	}
	if (!path.startsWith("/") || path.startsWith("//")) return null;

	path = path.split(/[?#]/, 1)[0].toLowerCase();
	if (!SAFE.test(path)) return null;

	const segments = path.split("/").filter(Boolean);
	if (segments.some((segment) => segment === "." || segment === "..")) return null;
	if (segments.at(-1) === "index.html") segments.pop();

	const out = segments.length ? `/${segments.join("/")}/` : "/";
	return out.length > MAX_LENGTH ? null : out;
}

/** The hosts whose views count: production only, never a preview deploy. */
const COUNTED_HOSTS: readonly string[] = ["tristantimblin.dev", "www.tristantimblin.dev"];

/**
 * Whether this browser should load GoatCounter at all. The script is never
 * injected on any other host (localhost, a *.pages.dev preview, a test
 * server), and never under automation: `navigator.webdriver` is true in
 * Playwright and every other WebDriver-driven browser.
 */
export function shouldCount(env: { hostname: string; webdriver?: boolean }): boolean {
	if (env.webdriver) return false;
	return COUNTED_HOSTS.includes(env.hostname.toLowerCase());
}
