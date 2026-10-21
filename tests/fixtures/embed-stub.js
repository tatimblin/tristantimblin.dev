// A stand-in for an embed bundle (the shape painterly-scene's dist/index.js
// has): mount(el, { assetBase }) draws into a canvas inside `el` and returns
// { destroy() }. tests/embed.spec.ts serves it in place of the bucket's module,
// so CI exercises <Embed> without the private build or the bucket. It records
// its calls on window.__embedStub for the test to read.
export function mount(el, opts) {
	const log = (window.__embedStub ??= { mounts: 0, destroys: 0, assetBase: null });
	log.mounts++;
	log.assetBase = opts.assetBase;
	const canvas = document.createElement("canvas");
	canvas.width = el.clientWidth;
	canvas.height = el.clientHeight;
	canvas.style.cssText = "display:block;width:100%;height:100%";
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "rgb(200, 40, 40)";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	el.appendChild(canvas);
	return {
		destroy() {
			log.destroys++;
			canvas.remove();
		},
	};
}
