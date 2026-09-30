// petals — a flower of six discs round a hollow heart, one solid lavender
// blob with a scalloped edge (the HUD sheet's DATACLUSTER flower). Drawn as
// its OUTLINE — each petal's outer arc between the points where it meets
// its neighbours — plus the heart as a second subpath under evenodd, so the
// heart is cut clean (a union of overlapping discs would leave a ring of
// slivers round it). One path. 48×32.
import { polar, round, type Point } from "../../lib/micro";
import { recipe } from "../recipe";

const [CX, CY] = [24, 16];
const [N, ORBIT, R, HEART] = [6, 6.5, 5, 2.5];

// Two neighbouring petals meet on the ray between them, this far out.
const step = 360 / N;
const halfChord = ORBIT * Math.sin((step / 2) * (Math.PI / 180));
const meet = ORBIT * Math.cos((step / 2) * (Math.PI / 180)) + Math.sqrt(R * R - halfChord * halfChord);
const p = (q: Point) => `${round(q[0])} ${round(q[1])}`;

const outline = Array.from({ length: N }, (_, i) => {
	const to = polar(CX, CY, meet, step * i + step / 2);
	return `${i === 0 ? `M${p(polar(CX, CY, meet, -step / 2))}` : ""}A${R} ${R} 0 0 1 ${p(to)}`;
}).join("") + "Z";
const heart = `M${CX - HEART} ${CY}A${HEART} ${HEART} 0 1 0 ${CX + HEART} ${CY}A${HEART} ${HEART} 0 1 0 ${CX - HEART} ${CY}Z`;

export default recipe((k) => [k.path(outline + heart, { paint: "none", fill: "lavender", evenodd: true })]);
