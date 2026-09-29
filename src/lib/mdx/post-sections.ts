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
 * Whatever comes before the first h2 is section 00, headed "Intro"; a post
 * with no h2s is one such section. Inside a body, three blocks are given
 * their ruled dress: a paragraph that is only an image becomes a figure with
 * a `Fig. 0N / <alt>` caption — numbered on from the hero when the
 * frontmatter has one, since that is Fig. 01 on the page; a fenced block
 * becomes a figure with a header row, `<section>.<n> / <title>` on the left
 * (the fence's `title="…"` meta, recorded by the remark half below because
 * Shiki drops it) and the language on the right; and a quote whose last
 * paragraph starts with a dash becomes a quote with a `footer`, the
 * attribution. The mono voice throughout is the design system's own Mono
 * classes, so the page needs no rule for it.
 *
 * Both plugins run on every markdown file Astro renders and do nothing
 * unless the file is under src/content/txt — the other markdown on the
 * site keeps its one column. The tags Astro maps onto components (h2, p,
 * img, blockquote) are the same tags afterwards, so the mapping still
 * lands; the wrappers are plain elements no mapping names. `mdxjsEsm`
 * nodes (a post's `import`s) stay at the root, where MDX needs them.
 */
import type { Element, ElementContent, Root, RootContent } from "hast";
import type { Code, Root as MdRoot } from "mdast";
import type { VFile } from "vfile";

const TXT = /[\\/]src[\\/]content[\\/]txt[\\/]/;

const inTxt = (file: VFile) => TXT.test(file.path ?? file.history[0] ?? "");

/** What the remark half records per fence, in document order. */
interface Fence {
	lang: string | null;
	title: string | null;
}

interface PostData {
	postCode?: Fence[];
	astro?: { frontmatter?: { hero?: unknown } };
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `title="env.yml"` / `title='env.yml'` / `title=env.yml` out of a fence's meta. */
const titleOf = (meta: string | null | undefined): string | null => {
	if (!meta) return null;
	const m = /(?:^|\s)title=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(meta);
	return m ? (m[1] ?? m[2] ?? m[3]) : null;
};

/** Every mdast node, depth first. */
function walkMd(node: { type: string; children?: unknown[] }, visit: (n: Code) => void) {
	if (node.type === "code") visit(node as Code);
	for (const child of node.children ?? []) {
		walkMd(child as { type: string; children?: unknown[] }, visit);
	}
}

/**
 * The remark half: records each fence's language and `title` meta on the
 * file, in document order, for the rehype half to read back — the
 * highlighter replaces the fence and keeps neither.
 */
export function remarkPostCode() {
	return (tree: MdRoot, file: VFile) => {
		if (!inTxt(file)) return;
		const fences: Fence[] = [];
		walkMd(tree, (node) => {
			fences.push({ lang: node.lang ?? null, title: titleOf(node.meta) });
		});
		(file.data as PostData).postCode = fences;
	};
}

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

/** A caps Mono, as Mono.astro renders one. */
const mono = (value: string, tone?: "primary"): Element =>
	el(
		"span",
		{
			className: [
				"ds-mono",
				"ds-mono--variant-caps",
				"ds-caps",
				...(tone ? [`ds-mono--tone-${tone}`] : []),
			],
		},
		[{ type: "text", value }],
	);

/** The one element child of a paragraph that is only an image, or null. */
function soleImage(node: RootContent): Element | null {
	if (!isElement(node) || node.tagName !== "p") return null;
	const kids = node.children.filter((c) => !isBlank(c));
	const only = kids[0];
	return kids.length === 1 && isElement(only) && only.tagName === "img" ? only : null;
}

const DASH = /^\s*(?:—|–|--)\s*/;

/**
 * The rehype half: the cut, and the dress on figures, fences and quotes.
 */
export function rehypePostSections() {
	return (tree: Root, file: VFile) => {
		if (!inTxt(file)) return;
		const data = file.data as PostData;
		const fences = data.postCode ?? [];
		// The figures count on from the hero, which is Fig. 01 when there is one.
		let figure = data.astro?.frontmatter?.hero ? 2 : 1;
		let fence = 0;

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
			const img = soleImage(node);
			if (img) {
				const alt = typeof img.properties.alt === "string" ? img.properties.alt : "";
				const n = pad2(figure++);
				return el("figure", { className: ["ds-prose-figure"] }, [
					img,
					el("figcaption", {}, [mono(alt ? `fig. ${n} / ${alt}` : `fig. ${n}`)]),
				]);
			}
			if (!isElement(node)) return node;
			if (node.tagName === "pre") {
				const meta = fences[fence++] ?? { lang: null, title: null };
				const lang =
					(typeof node.properties.dataLanguage === "string" && node.properties.dataLanguage) ||
					meta.lang ||
					"text";
				const n = `${no}.${++count.code}`;
				return el("figure", { className: ["ds-prose-code"] }, [
					el("div", { className: ["ds-prose-code__head"] }, [
						mono(meta.title ? `${n} / ${meta.title}` : n, "primary"),
						mono(lang),
					]),
					node,
				]);
			}
			if (node.tagName === "blockquote") {
				const kids = node.children.filter((c) => !isBlank(c));
				const last: ElementContent | undefined = kids.at(-1);
				if (
					kids.length > 1 &&
					last?.type === "element" &&
					last.tagName === "p" &&
					DASH.test(text(last))
				) {
					const first = last.children.find((c) => c.type === "text");
					if (first?.type === "text") first.value = first.value.replace(DASH, "");
					node.children[node.children.lastIndexOf(last)] = el(
						"footer",
						{ className: ["ds-mono", "ds-mono--variant-caps", "ds-caps"] },
						last.children,
					);
				}
				return node;
			}
			return node;
		};

		tree.children = [
			...esm,
			...sections.map((section, i) => {
				const no = pad2(i);
				const count = { code: 0 };
				const heading =
					(section.heading as Element | null) ??
					el("h2", {}, [{ type: "text", value: "Intro" }]);
				return el("section", { className: ["ds-prose-section"], dataSection: no }, [
					el("header", { className: ["ds-prose-section__head"] }, [mono(no), heading]),
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
