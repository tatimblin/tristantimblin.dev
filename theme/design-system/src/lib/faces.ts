/**
 * Faces, driven. A `<Faces>` stack renders every face and shows one; the
 * attribute the cross-fade keys on is `aria-hidden` (faces.css), so a script
 * swaps faces by moving it — which is all this does, once, instead of in
 * every widget.
 */

/** The faces of a stack, in DOM order. */
export function facesOf(stack: Element): HTMLElement[] {
	return Array.from(stack.querySelectorAll<HTMLElement>(":scope > .ds-face"));
}

/**
 * Show one face of the stack — by index, or by its `data-face` key — and
 * hide the rest. Returns the face shown, or null when none matched (the
 * stack is then left as it was).
 */
export function showFace(stack: Element, keyOrIndex: string | number): HTMLElement | null {
	const faces = facesOf(stack);
	const next =
		typeof keyOrIndex === "number"
			? faces[keyOrIndex]
			: faces.find((face) => face.dataset.face === keyOrIndex);
	if (!next) return null;
	for (const face of faces) face.setAttribute("aria-hidden", String(face !== next));
	return next;
}

/** The index of the face showing, or -1. */
export function shownFace(stack: Element): number {
	return facesOf(stack).findIndex((face) => face.getAttribute("aria-hidden") !== "true");
}
