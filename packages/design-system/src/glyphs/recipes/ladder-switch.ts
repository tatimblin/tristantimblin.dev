// ladder-switch — a level ladder feeding a switch: `switch-ladder` drawn
// the other way round, the blue ladder and its dim bus on the left, the
// wire running out to a red contact and an open ink lever on the right.
import { recipe } from "../recipe";
import { switchLadder } from "./switch-ladder";

export default recipe((k) => switchLadder(k, true));
