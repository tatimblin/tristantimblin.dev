import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { categoryIds, DEMOS_BASE, TXT_BASE } from "./lib/blog";
import { EMBEDS } from "./lib/embeds";

const txt = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: TXT_BASE }),
	// `image` is Astro's asset schema: a path relative to the post, checked
	// at build time (a missing file fails the build) and resolved to
	// ImageMetadata — the import, with width/height/format — so the page can
	// hand it to <Picture>/getImage(). The posts' images live beside them in
	// src/content/txt/images/.
	schema: ({ image }) =>
		z
			.object({
				title: z.string(),
				date: z.coerce.date(),
				// ONE category from the closed set in src/lib/blog.ts — the label and icon
				// the index shows beside the title. Tags stay free-form and plural.
				category: z.enum(categoryIds).optional(),
				// Lowercase, digits and hyphens: a tag is a URL segment (/txt/tag/<tag>/)
				// and printed with its hyphens as spaces.
				tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
				excerpt: z.string(),
				// THE HERO: a real image (a screenshot, a photo) under the title, drawn as
				// `Fig. 01` on the post page; the body's figures count on from it. A post
				// that opens with an image names it here rather than in the body, so the
				// page can set it on the grid. Optional — a post without one shows no
				// figure block. `caption` is the mono line under it; the alt stands in
				// when there is none.
				hero: z
					.object({
						src: image(),
						alt: z.string(),
						caption: z.string().optional(),
					})
					.strict()
					.optional(),
				// Social card override, a local image like the hero; falls back to the
				// hero, then the site default, when null. imageAlt describes it
				// (og:image:alt); the hero's alt stands in when the card IS the hero.
				image: image().nullable().default(null),
				imageAlt: z.string().nullable().default(null),
				// A syndicated post's origin, absolute.
				canonical: z.url().nullable().default(null),
				modified: z.coerce.date().nullable().default(null),
				draft: z.boolean().default(false),
			})
			// Strict: a misspelt key (`heor:`, `excrept:`) fails the build instead of
			// being dropped without a word.
			.strict(),
});

// A DEMO: a live experiment shown full screen at /demo/<slug>, not a written
// post. The file is all frontmatter (no body is rendered); `embed` names the
// module in src/data/embeds.json, `poster` is the still shown first and
// instead of the scene (no WebGL, a failed load, reduced motion without a
// still frame). Listed on /txt among the posts, in the feed and the sitemap,
// but numbered on its own (demo / 001), never as a txt.
const demos = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: DEMOS_BASE }),
	schema: ({ image }) =>
		z
			.object({
				title: z.string(),
				// One line: the panel's lede, the index's excerpt, the feed's
				// description, and the scene's text alternative.
				description: z.string(),
				date: z.coerce.date(),
				tags: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
				embed: z.enum(Object.keys(EMBEDS) as [string, ...string[]]),
				poster: z.object({ src: image(), alt: z.string() }).strict(),
				// Short text behind the panel's info toggle.
				notes: z.string().optional(),
				credits: z.string().optional(),
				draft: z.boolean().default(false),
			})
			.strict(),
});

export const collections = { txt, demos };
