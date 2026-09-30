// eject — the eject mark: a blue triangle pointing up over a flat red bar.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.polygon([[24, 6], [35, 18], [13, 18]], { paint: "blue" }),
	k.rect(13, 22, 22, 3, { paint: "none", fill: "red" }),
]);
