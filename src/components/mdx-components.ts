// Element → component map passed to a post's <Content components={…} /> so the
// rendered MDX uses @whois/design-system components instead of bare tags.
//
// Presets (p at reading size, ordered/unordered list, external-aware links) live
// in small wrapper components under ./mdx/. Prop-less mappings (headings, list
// item, em/strong) reference the DS component directly.
//
// Deliberately NOT mapped — kept as raw tags, styled by the DS Prose container
// the post body sits in (theme/design-system/src/styles/prose.css):
//   - `code`: MDX maps it globally, so mapping it to a component would also
//     wrap fenced-block `<pre><code>`. Inline + block code are handled in CSS.
//   - `pre`, `hr`, `del`, `table`: no clean 1:1 DS component.
//
// `blockquote` IS mapped, to the DS Blockquote (via ./mdx/Blockquote.astro) —
// no fill, a bar of the accent down its left edge, the words a step up. The
// <p> inside is mapped too, so the quote is set through the Body role (the
// Blockquote retunes its tokens in scope).
//
// `img` IS mapped (to ./mdx/Img.astro) — not for a DS component, but because
// markdown cannot express width/height, lazy loading, or a reveal hook, and the
// missing intrinsic dimensions were reflowing posts as each photo decoded. A
// post's images are files beside it, so @astrojs/mdx hands the mapping each
// one's import (ImageMetadata), and Img draws it as a <Picture> — AVIF, a
// WebP fallback, a srcset cut to the ruled columns.
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
import Blockquote from "./mdx/Blockquote.astro";

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
	blockquote: Blockquote,
	em: EM,
	strong: Strong,
};
