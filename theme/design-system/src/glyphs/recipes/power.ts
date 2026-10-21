// power — the power mark: a blue ring open at the top and a red stem
// dropping into the gap.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.arc(24, 17, 10, 35, 325, { paint: "blue" }),
	k.line(24, 4.5, 24, 15, { paint: "red" }),
]);
