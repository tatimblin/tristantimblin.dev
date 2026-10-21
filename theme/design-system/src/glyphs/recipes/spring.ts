// spring — the exploded phone's compression spring, standing: four turns
// of a coral coil rising from a dim dotted footprint. Wide (96×64).
import { recipe } from "../recipe";

export default recipe({
	viewBox: "0 0 96 64",
	draw: (k) => [
		k.isoEllipse(48, 50, 14, { paint: "dim", weight: "hair", dash: "dotted" }),
		k.isoCoil(48, 50, 14, 34, 4, { paint: "red" }),
	],
});
