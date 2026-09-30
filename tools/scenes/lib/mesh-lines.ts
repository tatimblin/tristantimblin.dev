/**
 * mesh-lines — the 3D → line route: a triangle mesh to the line work of a
 * scene. Read a `.glb`, weld its vertices, then draw it as PLANE SLICES
 * (the contour lines of a scan) and its SILHOUETTE (the outline, and every
 * fold where the surface turns away), hidden lines removed, projected
 * orthographically onto the panel. The output is a few sets of polylines,
 * each set one path `d`, for `kit("scene").path()`.
 *
 *   const mesh = weld(readGlb(readFileSync("head.glb")));
 *   const { sets } = meshLines(mesh, {
 *     yaw: 20, pitch: 8,
 *     fit: { width: 400, height: 400, margin: 28 },
 *     slices: [
 *       { axis: "y", count: 38, paint: "green", weight: "hair" },
 *       { axis: "x", values: [0.5, 1, 1.5], region: (p) => p[1] < 1.2, paint: "red", weight: "hair" },
 *     ],
 *     silhouette: { paint: "ink", weight: "hair" },
 *   });
 *   sets.map((s) => k.path(s.d, { paint: s.paint, weight: s.weight }))
 *
 * THE VIEW. The camera sits on +z looking down −z, y up, x right — the
 * mesh's +z face is toward the viewer at yaw 0, pitch 0. `yaw` turns the
 * subject about y (positive: its +z side swings to screen right, so the
 * viewer sees more of its −x side); `pitch` tips it about x (positive: its
 * +z side dips, so the viewer looks down on it). Both in degrees. The
 * rotation is yaw first, then pitch; nearest is the largest rotated z.
 * Orthographic: the rotated bounds are centred and scaled to fit
 * `fit.width` × `fit.height` inside `fit.margin`, y flipped to screen.
 *
 * FRONT AND BACK. Only front-facing triangles are sliced, and the
 * silhouette is every edge between a front and a back triangle (plus an
 * open edge on a front one). Which winding is "front" is decided from the
 * mesh itself, not assumed: the signed volume of the mesh under its own
 * winding says whether its triangles wind counter-clockwise seen from
 * outside (glTF's rule, positive volume) or clockwise (an exporter that
 * flipped), and a triangle is front when its outward normal has a
 * positive rotated z. A mesh with an open bottom still has a volume sign;
 * `winding` overrides the guess for a mesh that is mostly open.
 *
 * HIDDEN LINES. A software z-buffer of the front triangles at `zScale`
 * times the fit's grid: a point on a slice or a silhouette line is drawn
 * when it is no further than `epsilon` (model units) behind the surface
 * at the four samples round it, read leniently — the farthest of the four
 * — because at a contour the surface falls steeply away on one side of
 * the point, and a test that takes the nearest sample hides every curved
 * outline (the spike's 3×3 did). Every line is tested at every panel unit along it,
 * not only at the mesh's points (a coarse mesh's edge can cross the whole
 * panel), and cut into runs where it goes hidden and where it leaves a
 * slice's `region` (a model-space predicate: "below the chin, on one
 * side") — the mesh's own points stay, and a run gains one where it was
 * cut.
 *
 * OUTPUT. Every polyline is thinned — a point within `thin` panel units
 * of the last kept one is dropped, the last point always kept — and
 * written to a tenth, so the same mesh and options give the same bytes:
 * no randomness, no clock, insertion-ordered maps, and the mesh's own
 * order for every walk. Pure TypeScript, no dependencies; typed
 * generically over the paint and weight names so a scene passes the kit's
 * own literals through.
 */

export type Vec3 = readonly [number, number, number];
export type Vec2 = readonly [number, number];
export type Axis = "x" | "y" | "z";
const AXIS: Record<Axis, 0 | 1 | 2> = { x: 0, y: 1, z: 2 };

export interface Mesh {
	/** xyz triples */
	positions: Float32Array;
	/** three corners per triangle, into positions */
	indices: Uint32Array;
}

/** A line set's look: the paint and weight names a scene's kit knows. */
export interface Style<P = string, W = string> {
	paint: P;
	weight: W;
}

export interface SliceSpec<P = string, W = string> extends Style<P, W> {
	/** the model-space axis the planes are normal to: `y` for horizontal slices of a standing subject */
	axis: Axis;
	/** this many planes, at the middles of equal bands across `range` (the mesh's extent on the axis unless said) */
	count?: number;
	/** the extent `count` spreads over, model units */
	range?: readonly [number, number];
	/** explicit plane positions, model units; wins over `count` */
	values?: readonly number[];
	/** keep only the part of a slice inside this model-space region; a line is cut where it leaves */
	region?: (p: Vec3) => boolean;
}

export interface Fit {
	width: number;
	height: number;
	/** panel units kept clear on every side */
	margin: number;
}

export interface MeshLinesOptions<P = string, W = string> {
	/** degrees about y; 0 unless said */
	yaw?: number;
	/** degrees about x; 0 unless said */
	pitch?: number;
	fit: Fit;
	slices?: readonly SliceSpec<P, W>[];
	/** the outline and the folds; `false` for none */
	silhouette?: Style<P, W> | false;
	/** how far behind the nearest surface a point may sit and still show, model units; 0.08 unless said */
	epsilon?: number;
	/** the z-buffer's resolution as a multiple of the fit's grid; 2 unless said */
	zScale?: number;
	/** a point closer than this (panel units) to the last kept one is dropped; 1.2 unless said */
	thin?: number;
	/** which winding is outward; `auto` (the signed volume decides) unless said */
	winding?: "auto" | "ccw" | "cw";
}

export interface LineSet<P = string, W = string> extends Style<P, W> {
	/** every polyline of the set, one path */
	d: string;
	/** how many polylines `d` holds */
	lines: number;
	/** the plane positions a slice set was cut at, model units (a silhouette has none) */
	planes?: number[];
}

export interface MeshLinesResult<P = string, W = string> {
	/** in the order given: the slices, then the silhouette */
	sets: LineSet<P, W>[];
	/** a model-space point to the panel, the same projection the lines took */
	project: (p: Vec3) => Vec2;
	/** the same point's depth: larger is nearer */
	depth: (p: Vec3) => number;
	/** whether a model-space point shows (the z-buffer's answer) */
	visible: (p: Vec3) => boolean;
	/** the mesh's extent on each model axis */
	bounds: { min: Vec3; max: Vec3 };
	stats: {
		vertices: number;
		triangles: number;
		/** front-facing triangles */
		front: number;
		winding: "ccw" | "cw";
	};
}

// --- reading ---------------------------------------------------------------

const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

interface GltfAccessor {
	bufferView?: number;
	byteOffset?: number;
	componentType: number;
	count: number;
	type: string;
	sparse?: unknown;
}
interface GltfBufferView {
	buffer: number;
	byteOffset?: number;
	byteLength: number;
	byteStride?: number;
}
interface Gltf {
	accessors?: GltfAccessor[];
	bufferViews?: GltfBufferView[];
	meshes?: Array<{ name?: string; primitives: Array<{ attributes: Record<string, number>; indices?: number; mode?: number }> }>;
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const SIZES: Record<number, number> = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

/**
 * The first primitive of the first mesh of a binary glTF: its positions and
 * its triangle indices. Node transforms are not applied (a scene rotates
 * and fits the mesh itself); a non-indexed primitive is indexed in order;
 * anything else — not a GLB, no mesh, a strip or a fan, a sparse accessor —
 * is an error that says so.
 */
export function readGlb(buffer: ArrayBuffer | Uint8Array): Mesh {
	const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (bytes.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) throw new Error("readGlb: not a binary glTF (no glTF magic)");
	if (view.getUint32(4, true) !== 2) throw new Error(`readGlb: glTF version ${view.getUint32(4, true)}; only 2 is read`);
	const jsonLength = view.getUint32(12, true);
	if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error("readGlb: the first chunk is not JSON");
	const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength))) as Gltf;
	const binHeader = 20 + jsonLength;
	if (binHeader + 8 > bytes.byteLength || view.getUint32(binHeader + 4, true) !== CHUNK_BIN) throw new Error("readGlb: no BIN chunk");
	const binLength = view.getUint32(binHeader, true);
	const bin = bytes.subarray(binHeader + 8, binHeader + 8 + binLength);

	const mesh = gltf.meshes?.[0];
	const prim = mesh?.primitives?.[0];
	if (!prim) throw new Error("readGlb: the file has no mesh primitive");
	if (prim.mode !== undefined && prim.mode !== 4) throw new Error(`readGlb: primitive mode ${prim.mode}; only triangles (4) are read`);
	if (prim.attributes.POSITION === undefined) throw new Error("readGlb: the primitive has no POSITION");

	const accessor = (i: number, want: string, types: number[]): { data: DataView; stride: number; count: number; componentType: number; n: number } => {
		const a = gltf.accessors?.[i];
		if (!a) throw new Error(`readGlb: no accessor ${i}`);
		if (a.sparse) throw new Error(`readGlb: accessor ${i} is sparse; not read`);
		if (a.type !== want || !types.includes(a.componentType)) throw new Error(`readGlb: accessor ${i} is ${a.type}/${a.componentType}; wanted ${want}/${types.join("|")}`);
		if (a.bufferView === undefined) throw new Error(`readGlb: accessor ${i} has no bufferView`);
		const bv = gltf.bufferViews?.[a.bufferView];
		if (!bv || bv.buffer !== 0) throw new Error(`readGlb: accessor ${i} reads a buffer that is not the BIN chunk`);
		const n = COMPONENTS[want];
		const stride = bv.byteStride ?? n * SIZES[a.componentType];
		const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
		const end = start + stride * (a.count - 1) + n * SIZES[a.componentType];
		if (end > bin.byteLength) throw new Error(`readGlb: accessor ${i} runs past the BIN chunk`);
		return { data: new DataView(bin.buffer, bin.byteOffset + start, end - start), stride, count: a.count, componentType: a.componentType, n };
	};

	const pos = accessor(prim.attributes.POSITION, "VEC3", [5126]);
	const positions = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		for (let d = 0; d < 3; d++) positions[i * 3 + d] = pos.data.getFloat32(i * pos.stride + d * 4, true);
	}

	let indices: Uint32Array;
	if (prim.indices === undefined) {
		indices = new Uint32Array(pos.count);
		for (let i = 0; i < pos.count; i++) indices[i] = i;
	} else {
		const idx = accessor(prim.indices, "SCALAR", [5121, 5123, 5125]);
		indices = new Uint32Array(idx.count);
		const size = SIZES[idx.componentType];
		for (let i = 0; i < idx.count; i++) {
			const at = i * idx.stride;
			indices[i] = size === 1 ? idx.data.getUint8(at) : size === 2 ? idx.data.getUint16(at, true) : idx.data.getUint32(at, true);
		}
	}
	if (indices.length % 3) throw new Error(`readGlb: ${indices.length} indices is not a whole number of triangles`);
	for (const i of indices) if (i >= pos.count) throw new Error(`readGlb: index ${i} is past the ${pos.count} positions`);
	return { positions, indices };
}

// --- welding ---------------------------------------------------------------

/**
 * Merge vertices at the same position (to `precision`, model units): an
 * export splits a vertex wherever a UV or a normal changes, and every such
 * seam would read as an open edge. Degenerate triangles (two corners
 * welded into one) are dropped. Vertex order is first appearance.
 */
export function weld(mesh: Mesh, precision = 1e-4): Mesh {
	const { positions, indices } = mesh;
	const count = positions.length / 3;
	const seen = new Map<string, number>();
	const remap = new Uint32Array(count);
	const out: number[] = [];
	const q = 1 / precision;
	for (let i = 0; i < count; i++) {
		const x = positions[i * 3];
		const y = positions[i * 3 + 1];
		const z = positions[i * 3 + 2];
		const key = `${Math.round(x * q)},${Math.round(y * q)},${Math.round(z * q)}`;
		let j = seen.get(key);
		if (j === undefined) {
			j = out.length / 3;
			seen.set(key, j);
			out.push(x, y, z);
		}
		remap[i] = j;
	}
	const tris: number[] = [];
	for (let t = 0; t < indices.length; t += 3) {
		const a = remap[indices[t]];
		const b = remap[indices[t + 1]];
		const c = remap[indices[t + 2]];
		if (a === b || b === c || a === c) continue;
		tris.push(a, b, c);
	}
	return { positions: new Float32Array(out), indices: Uint32Array.from(tris) };
}

// --- the lines -------------------------------------------------------------

const EDGE_LIMIT = 2 ** 21;
/** How often a line is tested for visibility, panel units. */
const SAMPLE = 1;
/** An undirected edge as one number: exact while every index is below 2^21. */
const edgeKey = (a: number, b: number): number => (a < b ? a * 4294967296 + b : b * 4294967296 + a);

/** A number to a tenth as the file writes it: no trailing `.0`, no `-0`. */
const tenth = (n: number): string => {
	const s = n.toFixed(1).replace(/\.0$/, "");
	return s === "-0" ? "0" : s;
};

export function meshLines<P = string, W = string>(mesh: Mesh, o: MeshLinesOptions<P, W>): MeshLinesResult<P, W> {
	const { positions: P3, indices: I } = mesh;
	const V = P3.length / 3;
	const T = I.length / 3;
	if (V >= EDGE_LIMIT) throw new Error(`meshLines: ${V} vertices; the edge keys hold ${EDGE_LIMIT}`);
	const epsilon = o.epsilon ?? 0.08;
	const zScale = o.zScale ?? 2;
	const thin = o.thin ?? 1.2;
	const { width, height, margin } = o.fit;

	// The rotation: yaw about y, then pitch about x.
	const yaw = ((o.yaw ?? 0) * Math.PI) / 180;
	const pitch = ((o.pitch ?? 0) * Math.PI) / 180;
	const [cy, sy, cp, sp] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
	const rotate = (p: Vec3): [number, number, number] => {
		const x = cy * p[0] + sy * p[2];
		const z = -sy * p[0] + cy * p[2];
		return [x, cp * p[1] - sp * z, sp * p[1] + cp * z];
	};
	const at = (i: number): Vec3 => [P3[i * 3], P3[i * 3 + 1], P3[i * 3 + 2]];
	const R: Array<[number, number, number]> = [];
	for (let i = 0; i < V; i++) R.push(rotate(at(i)));

	// Bounds, model and rotated; the fit.
	const bmin: [number, number, number] = [Infinity, Infinity, Infinity];
	const bmax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
	const rmin: [number, number] = [Infinity, Infinity];
	const rmax: [number, number] = [-Infinity, -Infinity];
	for (let i = 0; i < V; i++) {
		for (let d = 0; d < 3; d++) {
			bmin[d] = Math.min(bmin[d], P3[i * 3 + d]);
			bmax[d] = Math.max(bmax[d], P3[i * 3 + d]);
		}
		for (let d = 0; d < 2; d++) {
			rmin[d] = Math.min(rmin[d], R[i][d]);
			rmax[d] = Math.max(rmax[d], R[i][d]);
		}
	}
	const scale = V ? Math.min((width - 2 * margin) / (rmax[0] - rmin[0] || 1), (height - 2 * margin) / (rmax[1] - rmin[1] || 1)) : 1;
	const centre: Vec2 = [(rmin[0] + rmax[0]) / 2, (rmin[1] + rmax[1]) / 2];
	const toScreen = (r: readonly [number, number, number]): Vec2 => [(r[0] - centre[0]) * scale + width / 2, -(r[1] - centre[1]) * scale + height / 2];
	const project = (p: Vec3): Vec2 => toScreen(rotate(p));
	const depth = (p: Vec3): number => rotate(p)[2];

	// Facing: the rotated normal's z is the screen-space signed area; outward is the winding the volume says.
	const area = new Float64Array(T);
	let volume = 0;
	for (let t = 0; t < T; t++) {
		const a = R[I[t * 3]];
		const b = R[I[t * 3 + 1]];
		const c = R[I[t * 3 + 2]];
		area[t] = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
		volume += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
	}
	const winding: "ccw" | "cw" = o.winding && o.winding !== "auto" ? o.winding : volume >= 0 ? "ccw" : "cw";
	const outward = winding === "ccw" ? 1 : -1;
	const front = new Uint8Array(T);
	let frontCount = 0;
	for (let t = 0; t < T; t++) {
		if (area[t] * outward > 1e-12) {
			front[t] = 1;
			frontCount++;
		}
	}

	// The z-buffer: the nearest front surface at every sample, zScale samples per panel unit.
	const W = Math.max(1, Math.ceil(width * zScale));
	const H = Math.max(1, Math.ceil(height * zScale));
	const zbuf = new Float32Array(W * H).fill(-Infinity);
	const sample = (p: Vec3): [number, number, number] => {
		const r = rotate(p);
		const [x, y] = toScreen(r);
		return [x * zScale, y * zScale, r[2]];
	};
	for (let t = 0; t < T; t++) {
		if (!front[t]) continue;
		const [a, b, c] = [0, 1, 2].map((e) => sample(at(I[t * 3 + e])));
		const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
		const x1 = Math.min(W - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
		const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
		const y1 = Math.min(H - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
		const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
		if (!den) continue;
		// A sample is covered when it is inside the triangle, its edges included, and no further: a
		// triangle's plane extended past its edge would put a surface where there is none — at a contour,
		// where the next triangle out is nearly edge-on, a nearer one than the real surface, hiding the
		// outline itself. A point on an edge that rounds to a sample outside its triangle finds the
		// neighbour's surface there, or nothing, and shows either way.
		for (let y = y0; y <= y1; y++) {
			for (let x = x0; x <= x1; x++) {
				const w1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / den;
				const w2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / den;
				const w3 = 1 - w1 - w2;
				if (w1 < -1e-9 || w2 < -1e-9 || w3 < -1e-9) continue;
				const z = w1 * a[2] + w2 * b[2] + w3 * c[2];
				if (z > zbuf[y * W + x]) zbuf[y * W + x] = z;
			}
		}
	}
	// A point shows when the surface at any of the four samples round it is no nearer than epsilon: the
	// lenient reading, because a point on a contour has surface falling steeply away on one side of it
	// and the sample there, read alone, would hide the outline; what the leniency costs is a hidden
	// line showing for half a sample past an occluder's edge, under a hairline.
	const visible = (p: Vec3): boolean => {
		const [x, y, z] = sample(p);
		let farthest = Infinity;
		for (const yy of [Math.floor(y), Math.ceil(y)]) {
			for (const xx of [Math.floor(x), Math.ceil(x)]) {
				if (xx < 0 || yy < 0 || xx >= W || yy >= H) return true;
				farthest = Math.min(farthest, zbuf[yy * W + xx]);
			}
		}
		return z >= farthest - epsilon;
	};

	// A polyline to the runs of it that pass `keep`, each at least two points long. The test is made on the
	// line sampled every panel unit — a mesh's edge may cross the whole panel, and a point it has not got
	// cannot go hidden — but a sample is kept only where a run starts or ends, so the output keeps the
	// mesh's own points and gains one at each cut.
	const runs = (line: readonly Vec3[], keep: (p: Vec3) => boolean): Vec3[][] => {
		const out: Vec3[][] = [];
		let cur: Array<{ p: Vec3; own: boolean }> = [];
		const flush = () => {
			if (cur.length > 1) out.push(cur.filter((s, i) => s.own || i === 0 || i === cur.length - 1).map((s) => s.p));
			cur = [];
		};
		const take = (p: Vec3, own: boolean) => {
			if (keep(p)) cur.push({ p, own });
			else flush();
		};
		for (let i = 0; i < line.length; i++) {
			if (i > 0) {
				const a = line[i - 1];
				const b = line[i];
				const [ax, ay] = project(a);
				const [bx, by] = project(b);
				const n = Math.ceil(Math.hypot(bx - ax, by - ay) / SAMPLE);
				for (let j = 1; j < n; j++) {
					const s = j / n;
					take([a[0] + s * (b[0] - a[0]), a[1] + s * (b[1] - a[1]), a[2] + s * (b[2] - a[2])], false);
				}
			}
			take(line[i], true);
		}
		flush();
		return out;
	};

	// Lines to one path: thinned, to a tenth.
	const toD = (lines: readonly (readonly Vec3[])[]): { d: string; lines: number } => {
		let d = "";
		let n = 0;
		for (const line of lines) {
			const q = line.map(project);
			let last = q[0];
			let s = `M${tenth(last[0])} ${tenth(last[1])}`;
			let points = 1;
			for (let i = 1; i < q.length; i++) {
				const p = q[i];
				if (i < q.length - 1 && Math.hypot(p[0] - last[0], p[1] - last[1]) < thin) continue;
				if (tenth(p[0]) === tenth(last[0]) && tenth(p[1]) === tenth(last[1])) continue;
				s += `L${tenth(p[0])} ${tenth(p[1])}`;
				last = p;
				points++;
			}
			if (points < 2) continue;
			d += s;
			n++;
		}
		return { d, lines: n };
	};

	// Slices: for each plane, the crossing point on every front edge it cuts, chained through the edges the triangles share.
	const slice = (axis: 0 | 1 | 2, k: number): Vec3[][] => {
		const pt = new Map<number, Vec3>();
		const adj = new Map<number, number[]>();
		const crossing = (a: number, c: number): number => {
			const key = edgeKey(a, c);
			if (!pt.has(key)) {
				const pa = at(a);
				const pc = at(c);
				const s = (k - pa[axis]) / (pc[axis] - pa[axis]);
				pt.set(key, [pa[0] + s * (pc[0] - pa[0]), pa[1] + s * (pc[1] - pa[1]), pa[2] + s * (pc[2] - pa[2])]);
			}
			return key;
		};
		for (let t = 0; t < T; t++) {
			if (!front[t]) continue;
			const vs = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
			const ends: number[] = [];
			for (let e = 0; e < 3; e++) {
				const a = vs[e];
				const c = vs[(e + 1) % 3];
				const da = P3[a * 3 + axis] - k;
				const dc = P3[c * 3 + axis] - k;
				if (da < 0 !== dc < 0) ends.push(crossing(a, c));
			}
			if (ends.length !== 2) continue;
			for (const [x, y] of [[ends[0], ends[1]], [ends[1], ends[0]]]) {
				let list = adj.get(x);
				if (!list) adj.set(x, (list = []));
				list.push(y);
			}
		}
		const seen = new Set<number>();
		const walk = (start: number): number[] => {
			const line = [start];
			seen.add(start);
			let cur = start;
			for (;;) {
				const next = adj.get(cur)?.find((n) => !seen.has(n));
				if (next === undefined) break;
				seen.add(next);
				line.push(next);
				cur = next;
			}
			return line;
		};
		const out: Vec3[][] = [];
		for (const [key, ns] of adj) if (ns.length === 1 && !seen.has(key)) out.push(walk(key).map((q) => pt.get(q)!));
		for (const key of adj.keys()) {
			if (seen.has(key)) continue;
			const loop = walk(key);
			loop.push(loop[0]);
			out.push(loop.map((q) => pt.get(q)!));
		}
		return out.filter((l) => l.length > 1);
	};

	const sets: LineSet<P, W>[] = [];
	for (const spec of o.slices ?? []) {
		const axis = AXIS[spec.axis];
		let planes: number[];
		if (spec.values) planes = [...spec.values];
		else if (spec.count && spec.count > 0) {
			const [lo, hi] = spec.range ?? [bmin[axis], bmax[axis]];
			planes = Array.from({ length: spec.count }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / spec.count!);
		} else throw new Error(`meshLines: a slice on ${spec.axis} needs \`count\` or \`values\``);
		const keep = spec.region ? (p: Vec3) => spec.region!(p) && visible(p) : visible;
		const lines = planes.flatMap((k) => slice(axis, k).flatMap((l) => runs(l, keep)));
		sets.push({ paint: spec.paint, weight: spec.weight, ...toD(lines), planes });
	}

	// The silhouette: an edge between a front and a back triangle, or an open edge on a front one; chained, then cut where hidden.
	if (o.silhouette) {
		const edges = new Map<number, number[]>();
		for (let t = 0; t < T; t++) {
			for (let e = 0; e < 3; e++) {
				const key = edgeKey(I[t * 3 + e], I[t * 3 + ((e + 1) % 3)]);
				let list = edges.get(key);
				if (!list) edges.set(key, (list = []));
				list.push(t);
			}
		}
		const sil: Array<[number, number]> = [];
		for (const [key, ts] of edges) {
			const f = ts.map((t) => front[t] === 1);
			if ((ts.length === 1 && f[0]) || (ts.length === 2 && f[0] !== f[1])) {
				const a = Math.floor(key / 4294967296);
				sil.push([a, key - a * 4294967296]);
			}
		}
		const adj = new Map<number, number[]>();
		for (const [a, c] of sil) {
			for (const [x, y] of [[a, c], [c, a]]) {
				let list = adj.get(x);
				if (!list) adj.set(x, (list = []));
				list.push(y);
			}
		}
		const used = new Set<number>();
		const lines: Vec3[][] = [];
		for (const [a0, c0] of sil) {
			if (used.has(edgeKey(a0, c0))) continue;
			used.add(edgeKey(a0, c0));
			const line = [a0, c0];
			for (const forward of [true, false]) {
				for (;;) {
					const end = forward ? line[line.length - 1] : line[0];
					const next = adj.get(end)?.find((n) => !used.has(edgeKey(end, n)));
					if (next === undefined) break;
					used.add(edgeKey(end, next));
					if (forward) line.push(next);
					else line.unshift(next);
				}
			}
			lines.push(...runs(line.map(at), visible));
		}
		sets.push({ paint: o.silhouette.paint, weight: o.silhouette.weight, ...toD(lines) });
	}

	return {
		sets,
		project,
		depth,
		visible,
		bounds: { min: bmin, max: bmax },
		stats: { vertices: V, triangles: T, front: frontCount, winding },
	};
}
