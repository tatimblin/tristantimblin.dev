// Element → component map passed to a post's <Content components={…} /> so the
// rendered MDX uses @whois/design-system components instead of bare tags.
//
// Presets (p at reading size, ordered/unordered list, external-aware links) live
// in small wrapper components under ./mdx/. Prop-less mappings (headings, list
// item, em/strong) reference the DS component directly.
//
// Deliberately NOT mapped — kept as raw tags, styled via scoped CSS in
// TxtPostLayout (`.txt-prose :global(…)`):
//   - `code`: MDX maps it globally, so mapping to InlineCode would also wrap
//     fenced-block `<pre><code>`. Inline + block code are handled in CSS.
//   - `pre`, `hr`, `del`: no clean 1:1 DS component.
//
// `img` IS mapped (to ./mdx/Img.astro) — not for a DS component, but because
// markdown cannot express width/height, lazy loading, or a reveal hook, and the
// missing intrinsic dimensions were reflowing posts as each photo decoded.
import H2 from "@whois/design-system/H2";
import H3 from "@whois/design-system/H3";
import H4 from "@whois/design-system/H4";
import ListItem from "@whois/design-system/ListItem";
import EM from "@whois/design-system/EM";
import Strong from "@whois/design-system/Strong";

import P from "./mdx/P.astro";
import A from "./mdx/A.astro";
import Ul from "./mdx/Ul.astro";
import Ol from "./mdx/Ol.astro";
import Img from "./mdx/Img.astro";

export const mdxComponents = {
	p: P,
	a: A,
	img: Img,
	h2: H2,
	h3: H3,
	h4: H4,
	ul: Ul,
	ol: Ol,
	li: ListItem,
	em: EM,
	strong: Strong,
};
