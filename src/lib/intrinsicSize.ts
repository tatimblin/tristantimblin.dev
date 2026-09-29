/**
 * Read an image's intrinsic width/height from its file header at BUILD TIME.
 *
 * Emitting `width`/`height` on an `<img>` lets the browser reserve the right box
 * before the bytes arrive, so a decoding image doesn't reflow the page (a real CLS
 * cost — measured on the /txt posts). This reads the header
 * straight off the file with no image library and no build step beyond what Astro
 * already runs in frontmatter (Node), so it's cheap enough to call per image.
 *
 * Returns null when the source isn't a local `public/` path or the format isn't
 * recognised — callers then simply omit the attributes rather than guess an aspect.
 *
 * Used by src/components/mdx/Img.astro.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export function intrinsicSize(publicPath: string): { w: number; h: number } | null {
	if (!publicPath.startsWith("/")) return null; // remote or data URI
	let buf: Buffer;
	try {
		buf = readFileSync(join(process.cwd(), "public", publicPath));
	} catch {
		return null;
	}

	// WebP: RIFF container, then a VP8/VP8L/VP8X chunk with its own size encoding.
	if (buf.length > 30 && buf.toString("ascii", 8, 12) === "WEBP") {
		const chunk = buf.toString("ascii", 12, 16);
		if (chunk === "VP8X") {
			return {
				w: 1 + buf.readUIntLE(24, 3),
				h: 1 + buf.readUIntLE(27, 3),
			};
		}
		if (chunk === "VP8 ") {
			return {
				w: buf.readUInt16LE(26) & 0x3fff,
				h: buf.readUInt16LE(28) & 0x3fff,
			};
		}
		if (chunk === "VP8L") {
			const bits = buf.readUInt32LE(21);
			return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
		}
		return null;
	}

	// PNG: IHDR is always the first chunk, at a fixed offset.
	if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
		return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
	}

	// GIF: logical screen descriptor, little-endian.
	if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") {
		return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
	}

	// JPEG: walk the segment chain to the first Start-Of-Frame, which carries the
	// real dimensions (they are not at a fixed offset).
	if (buf.length > 4 && buf.readUInt16BE(0) === 0xffd8) {
		let i = 2;
		while (i + 9 < buf.length) {
			if (buf[i] !== 0xff) {
				i++;
				continue;
			}
			const marker = buf[i + 1];
			// SOF0/1/2/3/5/6/7/9-11/13-15 all carry size; skip DHT/DAC/RST/SOS etc.
			const isSof =
				(marker >= 0xc0 && marker <= 0xc3) ||
				(marker >= 0xc5 && marker <= 0xc7) ||
				(marker >= 0xc9 && marker <= 0xcb) ||
				(marker >= 0xcd && marker <= 0xcf);
			if (isSof) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
			if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
				i += 2;
				continue;
			}
			i += 2 + buf.readUInt16BE(i + 2);
		}
	}

	return null;
}
