import { describe, expect, test } from "bun:test";
import { portableHtml } from "./feed-html";

const POST = "https://tristantimblin.dev/txt/a-post/";

describe("portableHtml", () => {
	test("unwraps the ruled sections, keeping each h2 and dropping the intro's label", () => {
		const html =
			'<section class="ds-prose-section" data-section="00"><header class="ds-prose-section__head"><span class="ds-mono">00</span><span class="ds-heading">Intro</span></header><div class="ds-prose-section__body"><p>Lede.</p></div></section>' +
			'<section class="ds-prose-section" data-section="01"><header class="ds-prose-section__head"><span>01</span><h2 id="one">One</h2></header><div class="ds-prose-section__body"><p class="ds-body">Body.</p></div></section>';
		expect(portableHtml(html, POST)).toBe('<p>Lede.</p><h2 id="one">One</h2><p>Body.</p>');
	});

	test("makes every URL absolute against the post", () => {
		const html =
			'<p><a href="#one">here</a> <a href="/txt/">all</a> <a href="https://x.dev/">x</a></p>' +
			'<picture><source srcset="/_astro/a.avif 400w, /_astro/b.avif 800w"><img src="/_astro/a.webp" alt=""></picture>' +
			'<video poster="/p.jpg"></video><blockquote cite="/q/"></blockquote>';
		const out = portableHtml(html, POST);
		expect(out).toContain(`href="${POST}#one"`);
		expect(out).toContain('href="https://tristantimblin.dev/txt/"');
		expect(out).toContain('href="https://x.dev/"');
		expect(out).toContain(
			'srcset="https://tristantimblin.dev/_astro/a.avif 400w, https://tristantimblin.dev/_astro/b.avif 800w"',
		);
		expect(out).toContain('src="https://tristantimblin.dev/_astro/a.webp"');
		expect(out).toContain('poster="https://tristantimblin.dev/p.jpg"');
		expect(out).toContain('cite="https://tristantimblin.dev/q/"');
	});

	test("drops scripts, styles, buttons and hidden parts, and a fence's header becomes its caption", () => {
		const html =
			'<script>alert(1)</script><style>p{}</style>' +
			'<figure class="ds-card"><div class="ds-prose-code__head"><span class="ds-card-header__title">env.yml</span><span><span>yaml</span><button data-code-copy hidden>Copy</button></span></div>' +
			'<pre class="astro-code" style="color:red" tabindex="0"><code><span class="line"><span style="color:var(--x)">a: 1</span></span></code></pre></figure>' +
			'<div aria-hidden="true"><svg></svg></div><p><span class="ds-visually-hidden">A to B: </span>Hi</p>';
		expect(portableHtml(html, POST)).toBe(
			"<figure><figcaption>env.yml</figcaption><pre><code>a: 1</code></pre></figure><p>A to B: Hi</p>",
		);
	});

	test("a custom element becomes its poster, linked to the post", () => {
		const html =
			'<fleet-demo class="fleet-demo"><div data-poster><picture><img src="/_astro/poster.webp" alt="The demo"></picture><button data-launch>Launch</button><p data-caption>Roomier on a desktop.</p></div></fleet-demo>';
		expect(portableHtml(html, POST)).toBe(
			`<figure><a href="${POST}"><picture><img src="https://tristantimblin.dev/_astro/poster.webp" alt="The demo"></picture></a>` +
				`<figcaption><a href="${POST}">This is interactive: open the original post to try it.</a></figcaption></figure>`,
		);
	});
});
