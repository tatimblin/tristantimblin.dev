// switch — a toggle lever between two contacts: a dim dotted lead into a
// blue pivot dot, an ink lever thrown up onto the live contact (a green
// dot, its line running on), the open contact below a dim pip.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.guide([[4, 22], [10, 22]]),
	k.line(34, 10, 44, 10, { paint: "green" }),
	k.line(36, 22, 44, 22, { paint: "dim", weight: "hair" }),
	k.line(14, 22, 31.5, 11.2),
	k.pip(34, 22, 2, { paint: "dim", weight: "hair" }),
	k.dot(34, 10, 2.25, { paint: "green" }),
	k.dot(14, 22, 2.5, { paint: "blue" }),
]);
