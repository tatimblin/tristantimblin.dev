// distort — the distortion ring: two red spiky stars, the inner one turned
// half a point so their spikes interleave, a hairline under the line.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.star(24, 16, 11, 8.5, 12, { paint: "red" }),
	k.star(24, 16, 11, 4.5, 7.5, { paint: "red", weight: "hair", angle: 360 / 22 }),
]);
