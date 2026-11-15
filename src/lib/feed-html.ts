/**
 * A /txt post's rendered body, made portable for the JSON Feed
 * (src/pages/feed.json.ts): the HTML another site gets to show as the post,
 * with none of this site's CSS or JS behind it.
 *
 *   - THE SECTIONS come apart. The ruled page's `<section>` / `<header>` /
 *     body wrappers (src/lib/mdx/post-sections.ts) are dropped; a section's
 *     h2 stays, its number and the intro's "Intro" label go.
 *   - THE STYLING goes: class, style, data-* and tabindex, every div and
 *     span unwrapped to its contents. A fence's header becomes the figure's
 *     figcaption (its title), and its Copy button goes with the other buttons.
 *   - WHAT ONLY WORKS HERE goes: scripts, styles, buttons, anything hidden or
 *     aria-hidden (the Sequence diagram's lifelines and arrowheads, whose
 *     words stay as a list of "A to B: …" steps).
 *   - A CUSTOM ELEMENT (an interactive embed, `<fleet-demo>`) cannot run
 *     off-site, so it becomes its poster image linked to the post, captioned
 *     with a line pointing there.
 *   - EVERY URL is absolute: href, src, srcset, poster and cite resolve
 *     against the post's own URL, so `#frag` lands on the original post.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";
import { fromHtml } from "hast-util-from-html";
import { toHtml } from "hast-util-to-html";

/** Elements dropped with everything inside them. */
const DROP = new Set(["script", "style", "link", "template", "button", "noscript"]);

/** Attributes that are this site's styling or behaviour, not the content's. */
const STYLING = /^(class|className|style|tabIndex|data[A-Z].*|ariaHidden|hidden)$/;

/** URL-valued attributes (hast property names). */
const URL_PROPS = ["href", "src", "poster", "cite"] as const;

const classes = (el: Element): string[] => {
	const c = el.properties?.className;
	return Array.isArray(c) ? c.map(String) : [];
};
const hasClass = (el: Element, name: string) => classes(el).includes(name);

const isHidden = (el: Element) => {
	const aria = el.properties?.ariaHidden;
	return aria === "true" || aria === true || el.properties?.hidden === true;
};

const textOf = (node: ElementContent | Root): string =>
	node.type === "text"
		? node.value
		: "children" in node
			? (node.children as ElementContent[]).map(textOf).join("")
			: "";

const find = (node: Element | Root, test: (el: Element) => boolean): Element | undefined => {
	for (const child of node.children) {
		if (child.type !== "element") continue;
		if (test(child)) return child;
		const hit = find(child, test);
		if (hit) return hit;
	}
	return undefined;
};

const h = (tagName: string, properties: Element["properties"], children: ElementContent[]): Element => ({
	type: "element",
	tagName,
	properties,
	children,
});
const text = (value: string): ElementContent => ({ type: "text", value });

/** A custom element's stand-in: its poster, linked to the post, and a caption. */
function embedFallback(el: Element, postUrl: string): Element {
	const poster = find(el, (e) => e.tagName === "picture") ?? find(el, (e) => e.tagName === "img");
	const caption = h("figcaption", {}, [
		h("a", { href: postUrl }, [text("This is interactive: open the original post to try it.")]),
	]);
	return h("figure", {}, poster ? [h("a", { href: postUrl }, [poster]), caption] : [caption]);
}

const absolute = (value: string, base: string) => {
	try {
		return new URL(value, base).href;
	} catch {
		return value;
	}
};
const absoluteSrcset = (value: string, base: string) =>
	value
		.split(",")
		.map((candidate) => {
			const [url, ...descriptor] = candidate.trim().split(/\s+/);
			return [absolute(url!, base), ...descriptor].join(" ");
		})
		.join(", ");

/** One node, cleaned: zero or more nodes in its place. */
function clean(node: RootContent, postUrl: string): RootContent[] {
	if (node.type === "comment" || node.type === "doctype") return [];
	if (node.type !== "element") return [node];
	const el = node;
	if (DROP.has(el.tagName) || isHidden(el)) return [];
	if (el.tagName.includes("-")) return clean(embedFallback(el, postUrl), postUrl);

	// A section's header: keep its h2, lose the number (and the intro's label).
	if (el.tagName === "header" && hasClass(el, "ds-prose-section__head")) {
		const heading = find(el, (e) => /^h[1-6]$/.test(e.tagName));
		return heading ? clean(heading, postUrl) : [];
	}
	// A fence's header: its title, as the figure's caption.
	if (hasClass(el, "ds-prose-code__head")) {
		const title = find(el, (e) => hasClass(e, "ds-card-header__title"));
		return title ? [h("figcaption", {}, [text(textOf(title))])] : [];
	}

	const children = el.children.flatMap((child) => clean(child, postUrl)) as ElementContent[];
	if (el.tagName === "section" || el.tagName === "div" || el.tagName === "span") return children;

	const properties: Element["properties"] = {};
	for (const [key, value] of Object.entries(el.properties ?? {})) {
		if (STYLING.test(key)) continue;
		properties[key] = value;
	}
	for (const key of URL_PROPS) {
		const value = properties[key];
		if (typeof value === "string") properties[key] = absolute(value, postUrl);
	}
	const srcset = properties.srcSet;
	if (Array.isArray(srcset)) properties.srcSet = absoluteSrcset(srcset.join(","), postUrl);
	else if (typeof srcset === "string") properties.srcSet = absoluteSrcset(srcset, postUrl);
	return [{ ...el, properties, children }];
}

/** A post's rendered body as portable HTML, every URL absolute against `postUrl`. */
export function portableHtml(html: string, postUrl: string): string {
	const tree = fromHtml(html, { fragment: true });
	tree.children = tree.children.flatMap((child) => clean(child, postUrl));
	return toHtml(tree).trim();
}
