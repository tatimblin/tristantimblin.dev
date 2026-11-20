// A page-unique id for a component that points one element at another
// (aria-describedby, aria-controls). A module counter, not a random value, so
// a build renders the same ids every time.
let count = 0;

export function uid(prefix: string): string {
	return `${prefix}-${++count}`;
}
