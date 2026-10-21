// burst — a bold starburst: eleven spikes of uneven reach round a solid
// heart, one filled polygon in the ink (the 120-shapes pack's shape 02).
// The reaches are seeded, so it bakes the same every time. 48×32.
import { polar, rng, type Point } from "../../lib/micro";
import { recipe } from "../recipe";

const [CX, CY] = [24, 16];
const N = 11;
const r = rng(11);
// Each spike's reach, 8.5–12.5; the valleys between them at 4.5.
const points: Point[] = Array.from({ length: N * 2 }, (_, i) => {
	const reach = i % 2 === 0 ? 8.5 + r() * 4 : 4.5;
	return polar(CX, CY, reach, (360 / (N * 2)) * i + 7);
});

export default recipe((k) => [k.polygon(points, { paint: "none", fill: "ink" })]);
