// ramp — a ramp: a lavender triangle rising left to right and dropping
// straight back, standing on a dim dotted time axis that runs out past it
// both ways.
import { recipe } from "../recipe";

export default recipe((k) => [
	k.guide([[4, 25], [44, 25]]),
	k.polygon([[9, 25], [39, 7], [39, 25]], { paint: "lavender" }),
]);
