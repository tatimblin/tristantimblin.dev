// leader — a callout: a red dot on the subject, an ink line rising from it
// to an elbow and a short shelf, and a dim dotted leg running on from there
// to where the label would sit.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.polyline([[11, 23], [24, 10], [29, 10]]),
	k.guide([[33, 10], [43, 10]]),
	k.dot(11, 23, 2, { paint: "red" }),
]);
