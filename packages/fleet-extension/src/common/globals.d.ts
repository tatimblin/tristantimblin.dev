/**
 * The extension host provides a `console`, but no DOM lib and no `@types/node`
 * are loaded here (see the note in tsconfig.json on why both are deliberately
 * excluded), so nothing declares it. Rather than widen `lib`/`types` — which
 * would also hand this code `document`, `window`, `fetch`, `fs` and `process`,
 * none of which exist in *both* the Node and Web Worker extension hosts — this
 * declares only the sliver that genuinely exists in both.
 */
declare const console: {
	log(...args: unknown[]): void;
	info(...args: unknown[]): void;
	warn(...args: unknown[]): void;
	error(...args: unknown[]): void;
};
