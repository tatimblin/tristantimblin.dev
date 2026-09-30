/**
 * IDS — the plausible strings a module sheet is lettered with: file names,
 * node and module names, hex codes, bracketed states, coordinates. From a
 * seed, deterministically (the generators' `rng`), so a baked plate is the
 * same bytes every bake and two modules with two seeds read as two
 * different machines.
 *
 *   const id = ids(7);
 *   id.file()    // "LOG_004.TXT"
 *   id.node()    // "NODE B43"
 *   id.status()  // "[ACTIVE]"
 *
 * Every string is already in the voice's case (caps, a hex prefix's `x`
 * kept), so it goes straight into `k.text()`. Each call draws the next
 * value from the seed's stream: the order of the calls is part of the seed.
 */

import { rng } from "./gen/base";

const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ"; // no I or O: they read as figures
const HEX = "0123456789ABCDEF";
const STEMS = Object.freeze(["LOG", "DATA", "ARCHIVE", "CFG", "TRACE", "DUMP", "NODE"]);
const EXTS = Object.freeze(["TXT", "XML", "DAT", "LOG", "BIN"]);
/** The states a module reports. */
export const STATES = Object.freeze(["ACTIVE", "STANDBY", "ONLINE", "OFFLINE", "IDLE", "SYNCING", "STABLE", "VERIFIED", "LOCKED", "CALIBRATING"]);

export interface Ids {
	/** a whole number `0 … 10^digits − 1`, zero-padded: `0079` */
	num(digits?: number): string;
	/** a file name: `LOG_004.TXT` */
	file(): string;
	/** a node: `NODE B43` */
	node(): string;
	/** a module: `MODULE B7` */
	module(): string;
	/** a hex word: `0x7B8A` */
	hex(): string;
	/** an ID: `ID: 7F-C2` */
	id(): string;
	/** a code: `A0-04` */
	code(): string;
	/** a state: `ACTIVE` */
	state(): string;
	/** a bracketed state: `[ACTIVE]` */
	status(): string;
	/** a coordinate pair: `02.44 / 118.09` */
	coords(): string;
	/** one of `xs`, from the stream */
	pick<T>(xs: readonly T[]): T;
}

/** The strings for one seed; see the module comment. */
export function ids(seed: number): Ids {
	const r = rng(seed);
	const int = (n: number) => Math.floor(r() * n);
	const pad = (v: number, digits: number) => String(v).padStart(digits, "0");
	const pick = <T,>(xs: readonly T[]): T => xs[int(xs.length)];
	const hexes = (n: number) => Array.from({ length: n }, () => HEX[int(16)]).join("");
	const letter = () => LETTERS[int(LETTERS.length)];
	const num = (digits = 4) => pad(int(10 ** Math.max(1, Math.min(8, Math.round(digits)))), Math.max(1, Math.min(8, Math.round(digits))));
	const state = () => pick(STATES);
	return {
		num,
		file: () => `${pick(STEMS)}_${num(3)}.${pick(EXTS)}`,
		node: () => `NODE ${letter()}${num(2)}`,
		module: () => `MODULE ${letter()}${1 + int(9)}`,
		hex: () => `0x${hexes(4)}`,
		id: () => `ID: ${hexes(2)}-${hexes(2)}`,
		code: () => `${letter()}${int(10)}-${num(2)}`,
		state,
		status: () => `[${state()}]`,
		coords: () => `${pad(int(100), 2)}.${num(2)} / ${pad(int(360), 3)}.${num(2)}`,
		pick,
	};
}
