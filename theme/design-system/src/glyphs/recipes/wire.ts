// wire — an orthogonal circuit trace: a blue wire leaving a dot low on the
// left, stepping up through two rounded elbows, and landing on a red square
// terminal at the right.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.wire([[6, 23], [20, 23], [20, 9], [38, 9]], { paint: "blue", start: "dot" }),
	k.terminal(40, 9, 4, { paint: "red" }),
]);
