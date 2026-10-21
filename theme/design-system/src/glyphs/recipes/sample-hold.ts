// sample-hold — sample and hold: red noise on the left stepping, at the
// sampler, into a blue stair that holds each value it sampled.
import { recipe } from "../recipe";
import { lineD, rng, type Point } from "../../lib/micro";

const MID = 22;
const rnd = rng(5);
const noise: Point[] = Array.from({ length: 13 }, (_, i) => [4 + ((MID - 4) * i) / 12, 16 + 9 * (rnd() * 2 - 1)]);
const levels = [9, 20, 13, 24, 11];
const STEP = (44 - MID) / levels.length;
const stair: Point[] = [[MID, noise[noise.length - 1][1]]];
levels.forEach((y, i) => stair.push([MID + i * STEP, y], [MID + (i + 1) * STEP, y]));

export default recipe((k) => [
	k.path(lineD(noise), { paint: "red" }),
	k.path(lineD(stair), { paint: "blue", cap: "butt" }),
]);
