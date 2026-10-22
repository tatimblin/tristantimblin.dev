// A stand-in for an embed that draws DOM and no canvas (meet-lolla's shape:
// DOM/CSS + Web Audio, no WebGL): mount(el, { assetBase }) appends a button
// inside `el` and returns { destroy() }. It records its calls on
// window.__embedStub, as embed-stub.js does.
export function mount(el, opts) {
	const log = (window.__embedStub ??= { mounts: 0, destroys: 0, assetBase: null });
	log.mounts++;
	log.assetBase = opts.assetBase;
	const root = document.createElement("div");
	root.style.cssText = "width:100%;height:100%;background:rgb(40, 40, 200)";
	const button = document.createElement("button");
	button.textContent = "Play";
	root.appendChild(button);
	el.appendChild(root);
	return {
		destroy() {
			log.destroys++;
			root.remove();
		},
	};
}
