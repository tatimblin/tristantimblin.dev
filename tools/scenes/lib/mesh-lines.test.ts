/**
 * mesh-lines on meshes built here — a cube, a split cube, a bumpy sphere:
 * the GLB reader round-trips and refuses what it cannot read, welding
 * merges seams, slices come one polyline per plane chained through shared
 * edges and only on front faces, the silhouette of a cube is its square,
 * the z-buffer hides what a nearer surface covers, the winding is read off
 * the mesh, a region cuts a line, and the same input gives the same bytes.
 * `bun run test:unit`.
 */
import { describe, expect, test } from "bun:test";
import { type Mesh, meshLines, readGlb, weld } from "./mesh-lines";

// --- meshes ---------------------------------------------------------------

/** A cube of `size` at `c`, 8 vertices, 12 triangles wound counter-clockwise seen from outside. */
function cube(size = 1, c: [number, number, number] = [0, 0, 0]): Mesh {
	const h = size / 2;
	const p: number[] = [];
	for (const z of [-h, h]) for (const y of [-h, h]) for (const x of [-h, h]) p.push(c[0] + x, c[1] + y, c[2] + z);
	// vertex i = x bit 0, y bit 1, z bit 2
	const faces = [
		[4, 5, 7, 6], // +z
		[1, 0, 2, 3], // -z
		[5, 1, 3, 7], // +x
		[0, 4, 6, 2], // -x
		[6, 7, 3, 2], // +y
		[0, 1, 5, 4], // -y
	];
	const i: number[] = [];
	for (const [a, b, cc, d] of faces) i.push(a, b, cc, a, cc, d);
	return { positions: new Float32Array(p), indices: Uint32Array.from(i) };
}

/** The same cube with every triangle's corners its own vertices: 36, as a flat-shaded export writes it. */
function splitCube(): Mesh {
	const m = cube();
	const p: number[] = [];
	const i: number[] = [];
	for (const v of m.indices) {
		i.push(p.length / 3);
		p.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]);
	}
	return { positions: new Float32Array(p), indices: Uint32Array.from(i) };
}

/** A lat/long sphere with a deterministic bump, so slices and silhouette are curves, not squares. */
function bumpySphere(rings = 12, segs = 24): Mesh {
	const p: number[] = [];
	for (let r = 0; r <= rings; r++) {
		const phi = (Math.PI * r) / rings;
		for (let s = 0; s < segs; s++) {
			const th = (2 * Math.PI * s) / segs;
			const rad = 1 + 0.12 * Math.sin(3 * th) * Math.sin(2 * phi);
			p.push(rad * Math.sin(phi) * Math.cos(th), rad * Math.cos(phi), rad * Math.sin(phi) * Math.sin(th));
		}
	}
	const i: number[] = [];
	const at = (r: number, s: number) => r * segs + (s % segs);
	for (let r = 0; r < rings; r++) {
		for (let s = 0; s < segs; s++) {
			const a = at(r, s), b = at(r, s + 1), c = at(r + 1, s), d = at(r + 1, s + 1);
			// outward: counter-clockwise seen from outside (y up, th grows toward +z from +x)
			if (r > 0) i.push(a, c, b);
			if (r < rings - 1) i.push(b, c, d);
		}
	}
	return weld({ positions: new Float32Array(p), indices: Uint32Array.from(i) });
}

/** Two meshes as one. */
function join(a: Mesh, b: Mesh): Mesh {
	const n = a.positions.length / 3;
	return {
		positions: new Float32Array([...a.positions, ...b.positions]),
		indices: Uint32Array.from([...a.indices, ...Array.from(b.indices, (i) => i + n)]),
	};
}

/** A mesh as a binary glTF, the way readGlb expects one: POSITION as float VEC3, indices as uint16 (or none). */
function encodeGlb(mesh: Mesh, o: { indexed?: boolean; meshes?: boolean; mode?: number } = {}): Uint8Array {
	const indexed = o.indexed ?? true;
	const pos = new Uint8Array(mesh.positions.buffer.slice(0));
	const idx = new Uint8Array(Uint16Array.from(mesh.indices).buffer);
	const pad4 = (n: number) => (4 - (n % 4)) % 4;
	const binLength = pos.byteLength + pad4(pos.byteLength) + (indexed ? idx.byteLength + pad4(idx.byteLength) : 0);
	const gltf = {
		asset: { version: "2.0" },
		buffers: [{ byteLength: binLength }],
		bufferViews: [
			{ buffer: 0, byteOffset: 0, byteLength: pos.byteLength },
			{ buffer: 0, byteOffset: pos.byteLength + pad4(pos.byteLength), byteLength: idx.byteLength },
		],
		accessors: [
			{ bufferView: 0, componentType: 5126, count: mesh.positions.length / 3, type: "VEC3" },
			{ bufferView: 1, componentType: 5123, count: mesh.indices.length, type: "SCALAR" },
		],
		meshes: o.meshes === false ? [] : [{ primitives: [{ attributes: { POSITION: 0 }, ...(indexed ? { indices: 1 } : {}), ...(o.mode !== undefined ? { mode: o.mode } : {}) }] }],
	};
	let json = new TextEncoder().encode(JSON.stringify(gltf));
	if (json.byteLength % 4) json = new Uint8Array([...json, ...new Array(pad4(json.byteLength)).fill(0x20)]);
	const total = 12 + 8 + json.byteLength + 8 + binLength;
	const out = new Uint8Array(total);
	const v = new DataView(out.buffer);
	v.setUint32(0, 0x46546c67, true);
	v.setUint32(4, 2, true);
	v.setUint32(8, total, true);
	v.setUint32(12, json.byteLength, true);
	v.setUint32(16, 0x4e4f534a, true);
	out.set(json, 20);
	const binAt = 20 + json.byteLength;
	v.setUint32(binAt, binLength, true);
	v.setUint32(binAt + 4, 0x004e4942, true);
	out.set(pos, binAt + 8);
	if (indexed) out.set(idx, binAt + 8 + pos.byteLength + pad4(pos.byteLength));
	return out;
}

// --- reading the output ---------------------------------------------------

type Pt = [number, number];
/** The polylines of a path `d` as the library writes it (`M x yL x y…`). */
const polylines = (d: string): Pt[][] =>
	d
		.split("M")
		.filter(Boolean)
		.map((s) => s.split("L").map((p) => p.split(" ").map(Number) as Pt));

const FIT = { width: 100, height: 100, margin: 10 };
const green = { paint: "green", weight: "hair" } as const;
const ink = { paint: "ink", weight: "hair" } as const;

// --- the tests ------------------------------------------------------------

describe("readGlb", () => {
	test("round-trips a cube: positions, indices", () => {
		const m = cube();
		const r = readGlb(encodeGlb(m));
		expect(Array.from(r.positions)).toEqual(Array.from(m.positions));
		expect(Array.from(r.indices)).toEqual(Array.from(m.indices));
	});

	test("takes an ArrayBuffer as well as bytes", () => {
		const bytes = encodeGlb(cube());
		expect(readGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)).indices.length).toBe(36);
	});

	test("indexes a non-indexed primitive in order", () => {
		const m = splitCube();
		const r = readGlb(encodeGlb(m, { indexed: false }));
		expect(Array.from(r.indices)).toEqual(Array.from({ length: 36 }, (_, i) => i));
	});

	test("says what it cannot read", () => {
		expect(() => readGlb(new Uint8Array(64))).toThrow(/not a binary glTF/);
		expect(() => readGlb(new TextEncoder().encode('{"asset":{"version":"2.0"}}'))).toThrow(/not a binary glTF/);
		expect(() => readGlb(encodeGlb(cube(), { meshes: false }))).toThrow(/no mesh primitive/);
		expect(() => readGlb(encodeGlb(cube(), { mode: 5 }))).toThrow(/only triangles/);
	});
});

describe("weld", () => {
	test("merges the split cube's 36 vertices into 8, keeping its 12 triangles", () => {
		expect(splitCube().positions.length / 3).toBe(36);
		const w = weld(splitCube());
		expect(w.positions.length / 3).toBe(8);
		expect(w.indices.length / 3).toBe(12);
		expect(Math.max(...w.indices)).toBe(7);
	});

	test("drops a triangle two of whose corners weld into one", () => {
		const m = cube();
		const p = new Float32Array([...m.positions, ...m.positions.slice(0, 3)]); // vertex 8 = vertex 0
		const i = Uint32Array.from([...m.indices, 0, 8, 1]);
		expect(weld({ positions: p, indices: i }).indices.length / 3).toBe(12);
	});

	test("is a no-op on a welded mesh", () => {
		const m = cube();
		const w = weld(m);
		expect(Array.from(w.positions)).toEqual(Array.from(m.positions));
		expect(Array.from(w.indices)).toEqual(Array.from(m.indices));
	});
});

describe("slices", () => {
	test("a cube face-on, three planes across y: three straight lines on the front face alone, none from the back", () => {
		const { sets } = meshLines(cube(), { fit: FIT, slices: [{ axis: "y", count: 3, ...green }], silhouette: false });
		expect(sets).toHaveLength(1);
		const [s] = sets;
		expect(s.paint).toBe("green");
		expect(s.planes?.map((v) => +v.toFixed(3))).toEqual([-0.333, 0, 0.333]);
		expect(s.lines).toBe(3);
		const lines = polylines(s.d);
		expect(lines).toHaveLength(3);
		// The cube spans the fit's 80 units; each line runs the front face's width at its plane's height,
		// through the face's diagonal (the crossing of its two triangles' shared edge) in the middle.
		const ys = lines.map((l) => l[0][1]).sort((a, b) => a - b);
		expect(ys).toEqual([23.3, 50, 76.7]);
		for (const l of lines) {
			expect(l).toHaveLength(3);
			const xs = l.map((p) => p[0]).sort((a, b) => a - b);
			expect([xs[0], xs[2]]).toEqual([10, 90]);
			expect(xs[1]).toBeGreaterThan(10);
			expect(xs[1]).toBeLessThan(90);
			expect(new Set(l.map((p) => p[1])).size).toBe(1);
		}
	});

	test("explicit values, and a range for count", () => {
		const { sets } = meshLines(cube(), {
			fit: FIT,
			slices: [
				{ axis: "y", values: [0.25], ...green },
				{ axis: "x", count: 2, range: [-0.5, 0], ...green },
			],
			silhouette: false,
		});
		expect(sets[0].planes).toEqual([0.25]);
		expect(sets[0].lines).toBe(1);
		expect(sets[1].planes).toEqual([-0.375, -0.125]);
		expect(sets[1].lines).toBe(2);
	});

	test("turned 45°, a plane crosses two front faces and comes back as one polyline through their shared edge", () => {
		const { sets, stats } = meshLines(cube(), { yaw: 45, fit: FIT, slices: [{ axis: "y", count: 2, ...green }], silhouette: false });
		expect(stats.front).toBe(4);
		const lines = polylines(sets[0].d);
		expect(lines).toHaveLength(2);
		for (const l of lines) {
			// Two faces of two triangles each: five crossings, the shared edge (the cube's corner) in the middle of the panel.
			expect(l).toHaveLength(5);
			expect(l[2][0]).toBe(50);
			const xs = l.map((p) => p[0]).sort((a, b) => a - b);
			expect([xs[0], xs[4]]).toEqual([10, 90]);
		}
	});

	test("a slice needs count or values", () => {
		expect(() => meshLines(cube(), { fit: FIT, slices: [{ axis: "y", ...green }] })).toThrow(/count/);
	});

	test("a region cuts a line where it leaves", () => {
		const { sets } = meshLines(cube(), {
			fit: FIT,
			slices: [{ axis: "x", count: 1, region: (p) => p[1] < 0, ...green }],
			silhouette: false,
		});
		const [l] = polylines(sets[0].d);
		expect(sets[0].lines).toBe(1);
		// Only the lower half (screen y ≥ 50) survives; the cut end sits at the region's edge.
		expect(Math.min(...l.map((p) => p[1]))).toBeGreaterThanOrEqual(50);
		expect(Math.max(...l.map((p) => p[1]))).toBe(90);
	});
});

describe("silhouette", () => {
	test("a cube face-on is its square: one closed loop through the four corners", () => {
		const { sets } = meshLines(cube(), { fit: FIT, silhouette: ink });
		expect(sets).toHaveLength(1);
		expect(sets[0].paint).toBe("ink");
		expect(sets[0].lines).toBe(1);
		const [loop] = polylines(sets[0].d);
		expect(loop).toHaveLength(5);
		expect(loop[0]).toEqual(loop[4]);
		const corners = loop.slice(0, 4).map((p) => p.join(",")).sort();
		expect(corners).toEqual(["10,10", "10,90", "90,10", "90,90"]);
	});

	test("turned 45°, the fold between the two front faces is drawn too", () => {
		const { sets } = meshLines(cube(), { yaw: 45, fit: FIT, silhouette: ink });
		const pts = polylines(sets[0].d).flat();
		// The outline plus the vertical edge down the middle: some point sits at x = 50.
		expect(pts.some((p) => p[0] === 50)).toBe(true);
	});

	test("a sphere's silhouette is a curve that stays inside the fit", () => {
		const { sets } = meshLines(bumpySphere(), { fit: FIT, silhouette: ink });
		const pts = polylines(sets[0].d).flat();
		expect(pts.length).toBeGreaterThan(20);
		for (const [x, y] of pts) {
			expect(x).toBeGreaterThanOrEqual(9);
			expect(x).toBeLessThanOrEqual(91);
			expect(y).toBeGreaterThanOrEqual(9);
			expect(y).toBeLessThanOrEqual(91);
		}
	});

	test("silhouette: false draws none", () => {
		expect(meshLines(cube(), { fit: FIT, silhouette: false }).sets).toEqual([]);
	});
});

describe("hidden lines", () => {
	test("a small cube in front of a big one cuts the big one's slice into two runs, and shows its own", () => {
		const big = cube(2);
		const small = cube(0.6, [0, 0, 2]);
		const both = join(big, small);
		const opts = { fit: FIT, slices: [{ axis: "y" as const, values: [0], ...green }], silhouette: false };
		const alone = polylines(meshLines(big, opts).sets[0].d);
		expect(alone).toHaveLength(1);
		expect(alone[0].map((p) => p[0]).sort((a, b) => a - b)).toEqual([10, 50, 90]);

		const lines = polylines(meshLines(both, opts).sets[0].d);
		expect(lines).toHaveLength(3);
		// The small cube's front face covers screen x 38–62; the big cube's line stops at its edges.
		const xs = lines.map((l) => [Math.min(...l.map((p) => p[0])), Math.max(...l.map((p) => p[0]))]);
		expect(xs.some(([a, b]) => a === 10 && b <= 38 && b >= 36)).toBe(true);
		expect(xs.some(([a, b]) => a >= 62 && a <= 64 && b === 90)).toBe(true);
		expect(xs.some(([a, b]) => a === 38 && b === 62)).toBe(true);
		// Nothing of the big cube's line (the runs that reach the frame) is drawn where the small one sits.
		for (const l of lines) {
			if (!l.some((p) => p[0] === 10 || p[0] === 90)) continue;
			for (const [x] of l) expect(x <= 38 || x >= 62).toBe(true);
		}
	});

	test("the back cube's silhouette is hidden where the front one covers it", () => {
		const both = join(cube(2), cube(0.6, [0, 0, 2]));
		const { sets } = meshLines(both, { fit: FIT, silhouette: ink });
		const pts = polylines(sets[0].d).flat();
		// The big cube's outline is the frame; the small one's square is inside it; no point of the big cube's
		// outline lies inside the small square (there are none to hide — they are the frame), and the small
		// square's four corners are all there.
		for (const c of ["38,38", "62,38", "62,62", "38,62"]) expect(pts.map((p) => p.join(",")).includes(c)).toBe(true);
	});

	test("visible() and project() answer for a model-space point", () => {
		const both = join(cube(2), cube(0.6, [0, 0, 2]));
		const r = meshLines(both, { fit: FIT, silhouette: false });
		expect(r.project([0, 0, 1])).toEqual([50, 50]);
		expect(r.project([-1, 1, 1])).toEqual([10, 10]);
		expect(r.visible([0, 0, 1])).toBe(false); // the big cube's front face, behind the small cube
		expect(r.visible([0.8, 0.8, 1])).toBe(true); // beside it
		expect(r.visible([0, 0, 2.3])).toBe(true); // the small cube's own face
		expect(r.depth([0, 0, 2.3])).toBeGreaterThan(r.depth([0, 0, 1]));
	});

	test("epsilon: a point a little behind the surface shows within it, not beyond", () => {
		const r = meshLines(cube(2), { fit: FIT, silhouette: false, epsilon: 0.05 });
		expect(r.visible([0, 0, 0.97])).toBe(true);
		expect(r.visible([0, 0, 0.9])).toBe(false);
	});
});

describe("facing", () => {
	test("the winding is read off the mesh: a cube wound clockwise draws the same lines", () => {
		const ccw = cube();
		const cw: Mesh = { positions: ccw.positions, indices: Uint32Array.from(ccw.indices) };
		for (let t = 0; t < cw.indices.length; t += 3) [cw.indices[t + 1], cw.indices[t + 2]] = [cw.indices[t + 2], cw.indices[t + 1]];
		const opts = { yaw: 30, pitch: 10, fit: FIT, slices: [{ axis: "y" as const, count: 4, ...green }], silhouette: ink };
		const a = meshLines(ccw, opts);
		const b = meshLines(cw, opts);
		expect(a.stats.winding).toBe("ccw");
		expect(b.stats.winding).toBe("cw");
		expect(a.stats.front).toBe(b.stats.front);
		// The same lines; a loop may start from another edge, so compare the points.
		const points = (d: string) => [...new Set(polylines(d).flat().map((p) => p.join(",")))].sort();
		expect(b.sets.map((s) => points(s.d))).toEqual(a.sets.map((s) => points(s.d)));
		expect(b.sets.map((s) => s.lines)).toEqual(a.sets.map((s) => s.lines));
	});

	test("winding can be said, and a wrong one turns the mesh inside out", () => {
		const r = meshLines(cube(), { fit: FIT, silhouette: false, winding: "cw" });
		expect(r.stats.winding).toBe("cw");
		expect(r.stats.front).toBe(2); // the far face
		expect(r.visible([0, 0, 0.5])).toBe(true); // nothing nearer in the buffer
	});

	test("pitch: looking down on a cube brings its top into view", () => {
		const level = meshLines(cube(), { fit: FIT, silhouette: false });
		const down = meshLines(cube(), { pitch: 30, fit: FIT, silhouette: false });
		expect(level.stats.front).toBe(2);
		expect(down.stats.front).toBe(4);
		expect(down.visible([0, 0.5, 0])).toBe(true);
	});
});

describe("output", () => {
	test("is deterministic: the same mesh and options give the same bytes", () => {
		const opts = {
			yaw: -20,
			pitch: 8,
			fit: { width: 400, height: 400, margin: 28 },
			slices: [
				{ axis: "y" as const, count: 12, ...green },
				{ axis: "x" as const, count: 5, region: (p: readonly number[]) => p[1] < 0, paint: "red", weight: "hair" },
			],
			silhouette: ink,
		};
		const a = meshLines(bumpySphere(), opts);
		const b = meshLines(bumpySphere(), opts);
		expect(a.sets).toEqual(b.sets);
		expect(a.sets.map((s) => s.lines)).toEqual(b.sets.map((s) => s.lines));
		expect(a.sets[0].lines).toBeGreaterThan(0);
		expect(a.sets[2].lines).toBeGreaterThan(0);
	});

	test("writes a tenth, never -0, and thins points closer than `thin`", () => {
		const { sets } = meshLines(bumpySphere(), { fit: FIT, slices: [{ axis: "y", count: 6, ...green }], silhouette: ink });
		for (const s of sets) {
			expect(s.d).toMatch(/^(M-?\d+(\.\d)?(?: -?\d+(\.\d)?)(L-?\d+(\.\d)? -?\d+(\.\d)?)+)+$/);
			expect(s.d).not.toMatch(/-0[ L]/);
			for (const l of polylines(s.d)) {
				for (let i = 1; i < l.length - 1; i++) expect(Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1])).toBeGreaterThanOrEqual(1.1);
			}
		}
	});

	test("sets come in the order given, with the silhouette last", () => {
		const { sets } = meshLines(cube(), {
			fit: FIT,
			slices: [
				{ axis: "y", count: 1, paint: "green", weight: "hair" },
				{ axis: "x", count: 1, paint: "red", weight: "line" },
			],
			silhouette: { paint: "ink", weight: "line" },
		});
		expect(sets.map((s) => [s.paint, s.weight])).toEqual([
			["green", "hair"],
			["red", "line"],
			["ink", "line"],
		]);
	});

	test("bounds and stats", () => {
		const r = meshLines(cube(2, [1, 2, 3]), { fit: FIT, silhouette: false });
		expect(r.bounds).toEqual({ min: [0, 1, 2], max: [2, 3, 4] });
		expect(r.stats).toEqual({ vertices: 8, triangles: 12, front: 2, winding: "ccw" });
	});
});
