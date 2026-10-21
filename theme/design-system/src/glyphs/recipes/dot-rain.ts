// dot-rain — the phone's signal dots: a sparse field of small dots falling
// in columns, mostly blue, a few green, the trailing ones dim.
import { recipe } from "../recipe";
import type { Paint } from "../../lib/micro";

// Each column: x, then the rows it has a dot on, top to bottom. The last
// dot of a column is its head (coloured); the rest trail in dim.
const COLUMNS: readonly (readonly [number, readonly number[], Paint])[] = [
	[8, [6, 11], "blue"],
	[14, [11, 16, 21], "green"],
	[20, [6], "blue"],
	[26, [11, 16, 21, 26], "blue"],
	[32, [6, 11, 16], "blue"],
	[38, [21, 26], "green"],
	[44, [11, 16], "blue"],
];

export default recipe((k) =>
	COLUMNS.flatMap(([x, rows, head]) =>
		rows.map((y, i) => k.dot(x, y, i === rows.length - 1 ? 1.5 : 1, { paint: i === rows.length - 1 ? head : "dim" })),
	),
);
