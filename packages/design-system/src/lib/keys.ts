/**
 * The arrow keys as a step along a range — a slider's, a stack of faces',
 * a list's: the same reading in every widget that has one.
 *
 * Left/Up step back, Right/Down step forward, Home and End jump to the
 * ends; anything else is null, so the caller leaves the event alone. The
 * result is clamped to 0..last.
 */
export function stepFromKey(event: KeyboardEvent, at: number, last: number): number | null {
	let next: number;
	switch (event.key) {
		case "ArrowLeft":
		case "ArrowUp":
			next = at - 1;
			break;
		case "ArrowRight":
		case "ArrowDown":
			next = at + 1;
			break;
		case "Home":
			next = 0;
			break;
		case "End":
			next = last;
			break;
		default:
			return null;
	}
	return Math.min(Math.max(next, 0), last);
}
