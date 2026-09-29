import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { categoryIds, TXT_BASE } from "./lib/blog";

const txt = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: TXT_BASE }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		// ONE category from the closed set in src/lib/blog.ts — the label and icon
		// the index shows beside the title. Tags stay free-form and plural.
		category: z.enum(categoryIds).optional(),
		tags: z.array(z.string()).default([]),
		excerpt: z.string(),
		// THE HERO: a real image (a screenshot, a photo) under the title, drawn as
		// `Fig. 01` on the post page; the body's figures count on from it. A post
		// that opens with an image names it here rather than in the body, so the
		// page can set it on the grid. Optional — a post without one shows no
		// figure block. `caption` is the mono line under it; the alt stands in
		// when there is none.
		hero: z
			.object({
				src: z.string(),
				alt: z.string(),
				caption: z.string().optional(),
			})
			.optional(),
		// Social card override; falls back to the site default when null.
		image: z.string().nullable().default(null),
		imageAlt: z.string().nullable().default(null),
		canonical: z.string().nullable().default(null),
		modified: z.coerce.date().nullable().default(null),
		draft: z.boolean().default(false),
		// Reserved hook for the two-layer goal: name an alternate themed layout
		// later. Unused for now (all posts use the default PostLayout).
		layout: z.string().optional(),
	}),
});

export const collections = { txt };
