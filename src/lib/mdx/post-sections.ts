/**
 * The post body, cut into SECTIONS for the ruled page.
 *
 * A /txt post is written as one markdown column — paragraphs, h2s, images,
 * fences, a quote — and read on a four-column grid where every h2 opens a
 * row: its number and heading in the first column, its text in the next two
 * (`Prose variant="ruled"`, packages/design-system/src/styles/prose.css,
 * which draws this markup and documents its shape). No markdown says
 * "section", so the cut happens here, on the HTML tree, after Shiki has
 * highlighted the fences and before Astro maps the tags onto components:
 *
 *   <section class="ds-prose-section" data-section="01">
 *     <header class="ds-prose-section__head">
 *       <span class="ds-mono ds-mono--variant-caps ds-caps">01</span>
 *       <h2>Old world, new world</h2>
 *     </header>
 *     <div class="ds-prose-section__body">…the blocks up to the next h2…</div>
 *   </section>
 *
 * Whatever comes before the first h2 is section 00, labelled "Intro"; a post
 * with no h2s is one such section. The label is NOT an h2 — it is set like
 * one (the classes H2 renders) but it is not a heading the author wrote, so
 * it stays out of the document outline and out of the page's heading list.
 *
 * Inside a body, three blocks are given their ruled dress: a paragraph that
 * is only an image (or only a link around one) becomes a figure with a
 * `Fig. 0N / <alt>` caption — numbered on from the hero when the frontmatter
 * has one, since that is Fig. 01 on the page; a fenced block becomes a figure
 * with a header row, `<section>.<n> / <title>` on the left and the language on
 * the right; and a quote whose last line starts with a dash — its own
 * paragraph, or the last line of the last one — becomes a figure: the
 * blockquote, then a `figcaption`, the attribution, outside the quoted words.
 * The mono voice throughout is the design system's own Mono classes, so the
 * page needs no rule for it.
 *
 * THE FENCE'S TITLE. Shiki replaces the fence and keeps none of its meta, so
 * `shikiPostCode` — a Shiki transformer, registered in astro.config's
 * `markdown.shikiConfig.transformers` — stamps the `title="…"` meta onto the
 * `pre` as `data-title` while it still has it, and the rehype half reads it
 * back off the same element. Each fence carries its own title, so a fence
 * nested in a list or a quote cannot shift the labels of the ones after it.
 * The remark half only fixes one authoring slip first: a fence with a title
 * and no language (```` ``` title="x" ````) parses the title AS the language,
 * so it is moved back into the meta.
 *
 * The remark and rehype halves run on every markdown file Astro renders and
 * do nothing unless the file is under TXT_BASE — the other markdown on the
 * site keeps its one column. The tags Astro maps onto components (h2, p, img,
 * blockquote) are the same tags afterwards, so the mapping still lands; the
 * wrappers are plain elements no mapping names. `mdxjsEsm` nodes (a post's
 * `import`s) stay at the root, where MDX needs them.
 *
 * THE IMAGES ARE IMPORTS. A post's pictures are files beside it
 * (`./images/x.webp`), and Astro's own rewrite — the relative `img` into an
 * `astro-image` JSX node whose `src` is the import, which the `img` mapping
 * (src/components/mdx/Img.astro) then draws as a <Picture> — runs after the
 * site's plugins, so it lands inside the figure this makes. `imageOf` takes
 * the rewritten shapes too, so the order is not load-bearing.
 */
import type { Element, ElementContent, Root, RootContent, Text } from "hast";
import type { Code, Root as MdRoot } from "mdast";
import type { ShikiConfig } from "@astrojs/markdown-remark";
import type { VFile } from "vfile";
import { TXT_BASE } from "../blog";

type ShikiTransformer = NonNullable<ShikiConfig["transformers"]>[number];

/** The collection's folder as a path fragment, `/src/content/txt/`. */
const TXT_DIR = `/${TXT_BASE.replace(/^\.\//, "").replace(/\/$/, "")}/`;

const inTxt = (file: VFile) =>
	(file.path ?? file.history[0] ?? "").replace(/\\/g, "/").includes(TXT_DIR);

interface PostData {
	astro?: { frontmatter?: { hero?: unknown } };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `title="env.yml"` / `title='env.yml'` / `title=env.yml` out of a fence's meta. */
export const titleOf = (meta: string | null | undefined): string | null => {
	if (!meta) return null;
	const m = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
	return m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
};

/** Every mdast node, depth first. */
function walkMd(node: { type: string; children?: unknown[] }, visit: (n: Code) => void) {
	if (node.type === "code") visit(node as Code);
	for (const child of node.children ?? []) {
		walkMd(child as { type: string; children?: unknown[] }, visit);
	}
}

/** An info string's first word that is really meta: `title="x"`, `a=b`. */
const META_AS_LANG = /^[\w-]+=/;

/**
 * The remark half: a fence written with a title and no language has its
 * title parsed as the language (the info string's first word). Move it back
 * into the meta, where the Shiki transformer looks for it.
 */
export function remarkPostCode() {
	return (tree: MdRoot, file: VFile) => {
		if (!inTxt(file)) return;
		walkMd(tree, (node) => {
			if (node.lang && META_AS_LANG.test(node.lang)) {
				node.meta = [node.lang, node.meta].filter(Boolean).join(" ");
				node.lang = null;
			}
		});
	};
}

/**
 * The Shiki half: stamps the fence's `title="…"` meta on its `pre` as
 * `data-title`, for the rehype half to read. Astro already stamps the
 * language (`data-language`). Harmless outside /txt — the rehype half, which
 * is scoped, is the only reader.
 */
export const shikiPostCode: ShikiTransformer = {
	name: "post-code-title",
	pre(node) {
		const title = titleOf(this.options.meta?.__raw);
		if (title) node.properties.dataTitle = title;
	},
};

const isElement = (node: unknown): node is Element =>
	typeof node === "object" && node !== null && (node as Element).type === "element";

/** The element's tag, or null for any other node — a plain string, not a
 *  type guard: a guard on the tag would narrow the node away from Element
 *  for every branch after the one it fails. */
const tagOf = (node: unknown): string | null => (isElement(node) ? node.tagName : null);

const isBlank = (node: RootContent | ElementContent) =>
	node.type === "text" && node.value.trim() === "";

const text = (node: ElementContent): string =>
	node.type === "text"
		? node.value
		: node.type === "element"
			? node.children.map(text).join("")
			: "";

const el = (
	tagName: string,
	properties: Element["properties"],
	children: ElementContent[],
): Element => ({ type: "element", tagName, properties, children });

const MONO = ["ds-mono", "ds-mono--variant-caps", "ds-caps"];

/** A caps Mono, as Mono.astro renders one. */
const mono = (value: string, tone?: "primary"): Element =>
	el("span", { className: [...MONO, ...(tone ? [`ds-mono--tone-${tone}`] : [])] }, [
		{ type: "text", value },
	]);

/** Section 00's label: set as H2.astro renders a heading, but not one. */
const introLabel = (): Element =>
	el(
		"span",
		{
			className: [
				"ds-text",
				"ds-text--size-6",
				"ds-text--variant-primary",
				"ds-heading",
				"ds-prose-section__title",
			],
		},
		[{ type: "text", value: "Intro" }],
	);

/** An MDX JSX node, as @astrojs/mdx rewrites a relative image: an
 *  `astro-image` element whose `src` is the file's import. hast's types do
 *  not know it without an augmentation import. */
interface JsxImage {
	type: "mdxJsxFlowElement" | "mdxJsxTextElement";
	name: string | null;
	attributes: { type: string; name?: string; value?: unknown }[];
}

const JSX_IMAGE = /^(?:img|astro-image)$/;

/** An image, in any of the shapes Astro's pipeline gives one, with its alt:
 *  the markdown `img` (as this plugin normally sees it — Astro's own rewrite
 *  of a relative path to its import runs after the site's plugins, in the
 *  markdown and the MDX pipelines both, and lands inside the figure this
 *  makes), the same `img` after the markdown rewrite (its props folded into
 *  `__ASTRO_IMAGE_`), or the MDX rewrite's `astro-image` JSX node. Taking
 *  all three keeps the order of the plugins from being load-bearing. */
function imageOf(node: unknown): { alt: string } | null {
	if (isElement(node)) {
		if (node.tagName !== "img") return null;
		const { alt, __ASTRO_IMAGE_: folded } = node.properties;
		if (typeof alt === "string") return { alt };
		if (typeof folded === "string") {
			try {
				const props = JSON.parse(folded) as { alt?: unknown };
				return { alt: typeof props.alt === "string" ? props.alt : "" };
			} catch {
				return { alt: "" };
			}
		}
		return { alt: "" };
	}
	const jsx = node as JsxImage | null;
	if (
		typeof jsx !== "object" ||
		jsx === null ||
		(jsx.type !== "mdxJsxFlowElement" && jsx.type !== "mdxJsxTextElement") ||
		!jsx.name ||
		!JSX_IMAGE.test(jsx.name)
	) {
		return null;
	}
	const alt = jsx.attributes.find((a) => a.type === "mdxJsxAttribute" && a.name === "alt")?.value;
	return { alt: typeof alt === "string" ? alt : "" };
}

/** A paragraph that is only an image, or only a link around one: the
 *  paragraph's one child (the image, or the a) and the image's alt, or null. */
function soleImage(node: RootContent): { content: ElementContent; alt: string } | null {
	if (!isElement(node) || node.tagName !== "p") return null;
	const kids = node.children.filter((c) => !isBlank(c));
	const only = kids[0];
	if (kids.length !== 1 || only === undefined) return null;
	const direct = imageOf(only);
	if (direct) return { content: only, alt: direct.alt };
	if (isElement(only) && only.tagName === "a") {
		const inner = only.children.filter((c) => !isBlank(c));
		const linked = inner.length === 1 ? imageOf(inner[0]) : null;
		if (linked) return { content: only, alt: linked.alt };
	}
	return null;
}

const DASH = /^\s*(?:—|–|--)\s*/;
/** A dash opening a line after a soft break: `…the words\n— Author`. */
const LINE_DASH = /\n\s*(?:—|–|--)\s*/;

/**
 * A quote's attribution, taken out of it: the last paragraph when it starts
 * with a dash (and is not the only one), or the last line of the last
 * paragraph when that line does. Returns the attribution's content with the
 * dash dropped, having removed it from the quote; null when there is none.
 */
function takeAttribution(quote: Element): ElementContent[] | null {
	const kids = quote.children.filter((c) => !isBlank(c));
	const last: ElementContent | undefined = kids.at(-1);
	if (last?.type !== "element" || last.tagName !== "p") return null;

	// Its own paragraph: `> words` / `>` / `> — Author`.
	if (kids.length > 1 && DASH.test(text(last))) {
		const first = last.children.find((c) => c.type === "text");
		if (first?.type === "text") first.value = first.value.replace(DASH, "");
		quote.children.splice(quote.children.lastIndexOf(last), 1);
		trimEnd(quote.children);
		return last.children;
	}

	// The last line of the last paragraph: `> words` / `> — Author`, one
	// paragraph with a soft break. The attribution is everything after the
	// last text node's last line-opening dash.
	for (let i = last.children.length - 1; i >= 0; i--) {
		const child = last.children[i];
		if (child.type !== "text") continue;
		let at = -1;
		let len = 0;
		for (const m of child.value.matchAll(new RegExp(LINE_DASH, "g"))) {
			at = m.index;
			len = m[0].length;
		}
		if (at === -1) continue;
		// Only a LINE that is the attribution: nothing after it may break again.
		const rest = last.children.slice(i + 1);
		if (child.value.slice(at + len).includes("\n") || rest.some((c) => text(c).includes("\n"))) {
			return null;
		}
		const after: Text = { type: "text", value: child.value.slice(at + len) };
		child.value = child.value.slice(0, at);
		last.children = last.children.slice(0, i + 1);
		trimEnd(last.children);
		return [after, ...rest].filter((c) => !(c.type === "text" && c.value === ""));
	}
	return null;
}

/** Drop trailing whitespace-only text, so the quote ends on its words. */
function trimEnd(children: ElementContent[]) {
	while (children.length > 0) {
		const tail = children.at(-1);
		if (tail?.type !== "text" || tail.value.trim() !== "") break;
		children.pop();
	}
}

/**
 * The rehype half: the cut, and the dress on figures, fences and quotes.
 */
export function rehypePostSections() {
	return (tree: Root, file: VFile) => {
		if (!inTxt(file)) return;
		const data = file.data as PostData;
		// The figures count on from the hero, which is Fig. 01 when there is one.
		let figure = data.astro?.frontmatter?.hero ? 2 : 1;

		// THE CUT. Root children in order: esm stays at the root; an h2 opens a
		// section; everything else belongs to the open one.
		const esm: RootContent[] = [];
		type Section = { heading: Element | null; nodes: RootContent[] };
		const sections: Section[] = [];
		let open: Section = { heading: null, nodes: [] };
		const close = () => {
			if (open.heading || open.nodes.some((n) => !isBlank(n))) sections.push(open);
		};
		for (const child of tree.children) {
			// hast's types do not know MDX's nodes without an augmentation import.
			if ((child as { type: string }).type === "mdxjsEsm") {
				esm.push(child);
			} else if (tagOf(child) === "h2") {
				close();
				open = { heading: child as Element, nodes: [] };
			} else {
				open.nodes.push(child);
			}
		}
		close();

		// THE DRESS, per block of a section's body.
		const dress = (node: RootContent, no: string, count: { code: number }): RootContent => {
			const image = soleImage(node);
			if (image) {
				const { alt } = image;
				const n = pad2(figure++);
				const label = alt ? `fig. ${n} / ${alt}` : `fig. ${n}`;
				// Fig's flow markup (packages/design-system/src/components/Fig.astro).
				return el("figure", { className: ["ds-fig"] }, [
					image.content,
					el("figcaption", { className: ["ds-fig__cap"] }, [mono(label)]),
				]);
			}
			if (!isElement(node)) return node;
			if (node.tagName === "pre") {
				const { dataLanguage, dataTitle } = node.properties;
				delete node.properties.dataTitle;
				const lang =
					typeof dataLanguage === "string" && dataLanguage && dataLanguage !== "plaintext"
						? dataLanguage
						: "text";
				const title = typeof dataTitle === "string" && dataTitle ? dataTitle : null;
				const n = `${no}.${++count.code}`;
				return el("figure", { className: ["ds-prose-code"] }, [
					el("div", { className: ["ds-prose-code__head"] }, [
						mono(title ? `${n} / ${title}` : n, "primary"),
						mono(lang),
					]),
					node,
				]);
			}
			if (node.tagName === "blockquote") {
				const attribution = takeAttribution(node);
				if (!attribution) return node;
				return el("figure", { className: ["ds-prose-quote"] }, [
					node,
					el("figcaption", { className: MONO }, attribution),
				]);
			}
			return node;
		};

		tree.children = [
			...esm,
			...sections.map((section, i) => {
				const no = pad2(i);
				const count = { code: 0 };
				return el("section", { className: ["ds-prose-section"], dataSection: no }, [
					el("header", { className: ["ds-prose-section__head"] }, [
						mono(no),
						section.heading ?? introLabel(),
					]),
					el(
						"div",
						{ className: ["ds-prose-section__body"] },
						section.nodes
							.filter((n) => !isBlank(n))
							.map((n) => dress(n, no, count)) as ElementContent[],
					),
				]);
			}),
		];
	};
}
