import { describe, expect, test } from "bun:test";
import { media, MEDIA_BASE } from "./media";
import manifest from "../data/media.json";
import clips from "../data/video-clips.json";

describe("media", () => {
	test("resolves a logical name to its hash-named key on the media host", () => {
		expect(media("videos/fabric.mp4")).toBe(`${MEDIA_BASE}/${(manifest as Record<string, string>)["videos/fabric.mp4"]}`);
		expect(media("videos/fabric.mp4")).toMatch(/\/videos\/fabric\.[0-9a-f]{8}\.mp4$/);
	});

	test("throws on an unknown name", () => {
		expect(() => media("videos/nope.mp4")).toThrow(/not in src\/data\/media\.json/);
	});

	test("every carousel clip has an mp4 and a webm in the manifest", () => {
		for (const clip of clips) {
			expect(() => media(clip.src)).not.toThrow();
			expect(() => media(clip.src.replace(/\.mp4$/, ".webm"))).not.toThrow();
		}
	});
});
