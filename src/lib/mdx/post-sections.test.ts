/**
 * The sections plugin, through Astro's own markdown pipeline (remark →
 * Shiki → rehype), on small posts. `bun test`.
 */
import { describe, expect, test } from "bun:test";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { pathToFileURL } from "node:url";
import { rehypePostSections, remarkPostCode, shikiPostCode } from "./post-sections";

const processor = await createMarkdownProcessor({
	shikiConfig: { theme: "css-variables", transformers: [shikiPostCode] },
	remarkPlugins: [remarkPostCode],
	rehypePlugins: [rehypePostSections],
});

const POST = pathToFileURL(`${process.cwd()}/src/content/txt/post.md`);

async function render(md: string, frontmatter: Record<string, unknown> = {}) {
	const { code, metadata } = await processor.render(md, { fileURL: POST, frontmatter });
	return { html: code, headings: metadata.headings };
}

/** How many times `needle` appears in the rendered HTML. */
const count = (html: string, needle: string) => html.split(needle).length - 1;

describe("post sections", () => {
	test("a post with no h2s is one section, 00, labelled Intro — not an h2", async () => {
		const { html, headings } = await render("One paragraph.\n\nAnother.\n");
		expect(count(html, '<section class="ds-prose-section"')).toBe(1);
		expect(html).toContain('data-section="00"');
		expect(html).toContain('ds-prose-section__title">Intro</span>');
		expect(html).not.toContain("<h2");
		expect(html).not.toContain('id="intro"');
		expect(headings).toEqual([]);
	});

	test("h2s open sections after the intro", async () => {
		const { html, headings } = await render("Lede.\n\n## One\n\nText.\n\n## Two\n\nMore.\n");
		expect(count(html, '<section class="ds-prose-section"')).toBe(3);
		expect(headings.map((h) => h.slug)).toEqual(["one", "two"]);
	});

	test("a fence nested in a list does not shift the next fence's label", async () => {
		const md = [
			"- a list item",
			"",
			"  ```js title=\"nested.js\"",
			"  const a = 1;",
			"  ```",
			"",
			"```yaml title=\"top.yml\"",
			"a: 1",
			"```",
			"",
		].join("\n");
		const { html } = await render(md);
		// One top-level fence, one figure, carrying ITS title and language.
		expect(count(html, 'class="ds-prose-code"')).toBe(1);
		expect(html).toMatch(/00\.1 \/ top\.yml<\/span><span[^>]*>yaml<\/span>/);
		expect(html).not.toContain("00.1 / nested.js");
	});

	test("a fence with a title and no language keeps its title", async () => {
		const { html } = await render('``` title="notes.txt"\nplain words\n```\n');
		expect(html).toMatch(/00\.1 \/ notes\.txt<\/span><span[^>]*>text<\/span>/);
	});

	test("a fence without a title is numbered alone", async () => {
		const { html } = await render("```ts\nlet a = 1;\n```\n");
		expect(html).toMatch(/>00\.1<\/span><span[^>]*>ts<\/span>/);
	});

	test("an image inside a link becomes a figure, the link kept", async () => {
		const { html } = await render("[![A desk](/desk.webp)](https://example.com)\n");
		expect(html).toMatch(
			/<figure class="ds-prose-figure"><a href="https:\/\/example\.com"><img src="\/desk\.webp" alt="A desk"[^>]*><\/a><figcaption><span[^>]*>fig\. 01 \/ A desk<\/span><\/figcaption><\/figure>/,
		);
	});

	test("figures count on from the hero", async () => {
		const { html } = await render("![A desk](/desk.webp)\n", { hero: { src: "/h.webp", alt: "h" } });
		expect(html).toContain("fig. 02 / A desk");
	});

	test("an attribution in its own paragraph leaves the quote as a figcaption", async () => {
		const { html } = await render("> The words.\n>\n> — Someone / Somewhere\n");
		expect(html).toMatch(
			/<figure class="ds-prose-quote"><blockquote>\s*<p>The words.<\/p>\s*<\/blockquote><figcaption class="ds-mono ds-mono--variant-caps ds-caps">Someone \/ Somewhere<\/figcaption><\/figure>/,
		);
	});

	test("an attribution on the last line of the same paragraph", async () => {
		const { html } = await render("> The words,\n> more words.\n> — Someone\n");
		expect(html).toMatch(
			/<blockquote>\s*<p>The words,\nmore words.<\/p>\s*<\/blockquote><figcaption[^>]*>Someone<\/figcaption>/,
		);
	});

	test("a one-paragraph quote that opens with a dash is not an attribution", async () => {
		const { html } = await render("> — just a dash\n");
		expect(html).not.toContain("ds-prose-quote");
		expect(html).toContain("<blockquote>");
	});

	test("markdown outside /txt is left alone", async () => {
		const { code } = await processor.render("## One\n\nText.\n", {
			fileURL: pathToFileURL(`${process.cwd()}/src/content/other/post.md`),
		});
		expect(code).not.toContain("ds-prose-section");
	});
});
