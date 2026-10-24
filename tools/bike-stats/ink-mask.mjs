// Builds public/images/lyft-ebike-ink.png, the Bay Wheels card's e-bike drawing,
// from the product render beside this script (lyft-ebike-sideview.png).
//
// The output is an alpha mask, black with the drawing in its alpha: the card
// fills it with an ink token, so it takes the theme's colour. Alpha is the
// render's tonal darkness plus its traced (Sobel) edges, so the shading and the
// line work both survive in one colour. The render's soft floor shadow is
// dropped, the tyres are kept whole, and the result is cropped to the bike and
// scaled to 1000px wide.
//
//   node tools/bike-stats/ink-mask.mjs [src.png] [out.png]
//
// Runs the pixel work in headless Chromium (Playwright, already a dev
// dependency) for its canvas, so there's no image library to install.
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const [src = here("./lyft-ebike-sideview.png"), out = here("../../public/images/lyft-ebike-ink.png")] =
	process.argv.slice(2);
const WIDTH = 1000;

const dataUrl = `data:image/png;base64,${readFileSync(src).toString("base64")}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const b64 = await page.evaluate(
	async ({ dataUrl, WIDTH }) => {
		const img = new Image();
		img.src = dataUrl;
		await img.decode();
		const W = img.naturalWidth;
		const H = img.naturalHeight;
		const ctx = new OffscreenCanvas(W, H).getContext("2d");
		ctx.drawImage(img, 0, 0);
		const px = ctx.getImageData(0, 0, W, H).data;

		// Luminance composited onto white: transparent pixels are black in RGB
		// and would otherwise trace the silhouette as a hard edge.
		const lum = new Float32Array(W * H);
		const opacity = new Float32Array(W * H);
		for (let i = 0; i < W * H; i++) {
			const a = px[i * 4 + 3] / 255;
			const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
			lum[i] = l * a + (1 - a);
			opacity[i] = a;
		}
		const at = (x, y) => lum[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];

		const alpha = new Float32Array(W * H);
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const i = y * W + x;
				// The render's translucent floor shadow, and its faint border.
				if (opacity[i] < 0.6 || x < 3 || x > W - 4 || y < 3) continue;
				const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
				const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
				alpha[i] = Math.min(1, (1 - lum[i]) * 0.7 + Math.hypot(gx, gy) * 0.8);
			}
		}

		// The contact shadow is opaque where the tyres meet the floor: a thin line
		// the bike's whole length. First drop any bottom row inked across most of
		// the width (only that line spans it; the two tyres never do)...
		for (let y = Math.floor(H * 0.9); y < H; y++) {
			let n = 0;
			for (let x = 0; x < W; x++) if (alpha[y * W + x] > 0.05) n++;
			if (n > 0.4 * W) alpha.fill(0, y * W, (y + 1) * W);
		}
		// ...then, in the bottom rows, keep only ink that continues upward (a
		// tyre); what's left of the line between the wheels has nothing above it.
		const before = alpha.slice();
		for (let y = Math.floor(H * 0.9); y < H; y++) {
			for (let x = 0; x < W; x++) if (before[(y - 8) * W + x] < 0.05) alpha[y * W + x] = 0;
		}

		// Crop to the drawing, 4px clear.
		let x0 = W, y0 = H, x1 = 0, y1 = 0;
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				if (alpha[y * W + x] <= 0.05) continue;
				x0 = Math.min(x0, x); x1 = Math.max(x1, x);
				y0 = Math.min(y0, y); y1 = Math.max(y1, y);
			}
		}
		x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4);
		x1 = Math.min(W - 1, x1 + 4); y1 = Math.min(H - 1, y1 + 4);
		const cw = x1 - x0 + 1;
		const ch = y1 - y0 + 1;
		const crop = new OffscreenCanvas(cw, ch);
		const out = crop.getContext("2d").createImageData(cw, ch);
		for (let y = 0; y < ch; y++) {
			for (let x = 0; x < cw; x++) out.data[(y * cw + x) * 4 + 3] = Math.round(alpha[(y + y0) * W + x + x0] * 255);
		}
		crop.getContext("2d").putImageData(out, 0, 0);

		const scaled = new OffscreenCanvas(WIDTH, Math.round((ch * WIDTH) / cw));
		const sctx = scaled.getContext("2d");
		sctx.imageSmoothingQuality = "high";
		sctx.drawImage(crop, 0, 0, scaled.width, scaled.height);
		const bytes = new Uint8Array(await (await scaled.convertToBlob({ type: "image/png" })).arrayBuffer());
		let s = "";
		for (const b of bytes) s += String.fromCharCode(b);
		return btoa(s);
	},
	{ dataUrl, WIDTH },
).finally(() => browser.close());
writeFileSync(out, Buffer.from(b64, "base64"));
console.log(`wrote ${out}`);
