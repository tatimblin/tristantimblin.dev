import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const gallery = defineCollection({
	loader: glob({ pattern: "**/*.yaml", base: "./src/content/gallery" }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		media: z.string(),
		type: z.enum(["image", "video"]),
		poster: z.string().optional(),
		alt: z.string(),
	}),
});

const txt = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/txt" }),
	schema: z.object({
		title: z.string(),
		date: z.coerce.date(),
		icon: z.string().optional(),
		tags: z.array(z.string()).default([]),
		excerpt: z.string(),
		// Social card override; falls back to the site default when null.
		image: z.string().nullable().default(null),
		imageAlt: z.string().nullable().default(null),
		canonical: z.string().nullable().default(null),
		modified: z.coerce.date().nullable().default(null),
		draft: z.boolean().default(false),
		// Reserved hook for the two-layer goal: name an alternate themed layout
		// later. Unused for now (all posts use the default TxtPostLayout).
		layout: z.string().optional(),
	}),
});

export const collections = { gallery, txt };
