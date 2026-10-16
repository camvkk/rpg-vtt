/**
 * three.js geometry for a die: flat numbered faces, shrunk slightly in their planes,
 * joined by smoothly shaded bevel strips along the edges and small caps at the
 * corners. The result reads as a die with softly rounded edges while the physics
 * hull stays the sharp polyhedron (the faces the die rests on are unchanged).
 */
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { add, cross, dot, normalize, scale, sub, type Vec3 } from './faces.ts';
import type { DieShape } from './shapes.ts';
import { cellUV, type AtlasLayout } from './textures.ts';

export function buildDieGeometry(shape: DieShape, layout: AtlasLayout): BufferGeometry {
  const { vertices: V, faces, faceNormals: N, frames, chamfer: d, cellHalf } = shape;
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const blank = cellUV(layout, layout.faceCells, 0.5, 0.5);

  const pushTri = (
    p: [Vec3, Vec3, Vec3],
    n: [Vec3, Vec3, Vec3],
    t: [[number, number], [number, number], [number, number]],
  ): void => {
    // Orient outwards (the solid is convex and centred on the origin).
    const g = cross(sub(p[1], p[0]), sub(p[2], p[0]));
    const ref = add(add(n[0], n[1]), n[2]);
    let order = [0, 1, 2];
    if (dot(g, ref) < 0) order = [0, 2, 1];
    for (const i of order) {
      pos.push(p[i]![0], p[i]![1], p[i]![2]);
      nor.push(n[i]![0], n[i]![1], n[i]![2]);
      uv.push(t[i]![0], t[i]![1]);
    }
  };

  // Inset corner positions per face: inset[f][k] for corner k of face f.
  const inset: Vec3[][] = faces.map((f, fi) => {
    const n = N[fi]!;
    return f.map((vi, k) => {
      const v = V[vi]!;
      const prev = V[f[(k + f.length - 1) % f.length]!]!;
      const next = V[f[(k + 1) % f.length]!]!;
      const m1 = cross(n, normalize(sub(v, prev)));
      const m2 = cross(n, normalize(sub(next, v)));
      const k1 = d / (1 + dot(m1, m2));
      return add(v, scale(add(m1, m2), k1));
    });
  });

  // Faces
  faces.forEach((f, fi) => {
    const n = N[fi]!;
    const fr = frames[fi]!;
    const uvOf = (p: Vec3): [number, number] => {
      const q = sub(p, fr.center);
      return cellUV(layout, fi, dot(q, fr.u) / (2 * cellHalf) + 0.5, dot(q, fr.v) / (2 * cellHalf) + 0.5);
    };
    const pts = inset[fi]!;
    for (let k = 1; k + 1 < pts.length; k++) {
      pushTri([pts[0]!, pts[k]!, pts[k + 1]!], [n, n, n], [uvOf(pts[0]!), uvOf(pts[k]!), uvOf(pts[k + 1]!)]);
    }
  });

  // Edge bevels
  const edgeOwner = new Map<string, { face: number; corner: number }>();
  faces.forEach((f, fi) => {
    f.forEach((a, k) => {
      edgeOwner.set(`${a},${f[(k + 1) % f.length]}`, { face: fi, corner: k });
    });
  });
  faces.forEach((f, fi) => {
    f.forEach((a, k) => {
      const b = f[(k + 1) % f.length]!;
      const other = edgeOwner.get(`${b},${a}`);
      if (!other || other.face < fi) return;
      const g = other.face;
      const gf = faces[g]!;
      // In face g the edge runs b -> a: corner other.corner is b, the next one is a.
      const fa = inset[fi]![k]!;
      const fb = inset[fi]![(k + 1) % f.length]!;
      const gb = inset[g]![other.corner]!;
      const ga = inset[g]![(other.corner + 1) % gf.length]!;
      const nf = N[fi]!;
      const ng = N[g]!;
      pushTri([fa, fb, gb], [nf, nf, ng], [blank, blank, blank]);
      pushTri([fa, gb, ga], [nf, ng, ng], [blank, blank, blank]);
    });
  });

  // Corner caps
  V.forEach((v, vi) => {
    const pts: { p: Vec3; n: Vec3 }[] = [];
    faces.forEach((f, fi) => {
      const k = f.indexOf(vi);
      if (k >= 0) pts.push({ p: inset[fi]![k]!, n: N[fi]! });
    });
    if (pts.length < 3) return;
    const axis = normalize(v);
    const ref = normalize(sub(pts[0]!.p, scale(axis, dot(pts[0]!.p, axis))));
    const ref2 = cross(axis, ref);
    const ang = (p: Vec3): number => Math.atan2(dot(p, ref2), dot(p, ref));
    pts.sort((a, b) => ang(a.p) - ang(b.p));
    let c: Vec3 = [0, 0, 0];
    let cn: Vec3 = [0, 0, 0];
    for (const p of pts) {
      c = add(c, p.p);
      cn = add(cn, p.n);
    }
    c = scale(c, 1 / pts.length);
    cn = normalize(cn);
    if (pts.length === 3) {
      pushTri([pts[0]!.p, pts[1]!.p, pts[2]!.p], [pts[0]!.n, pts[1]!.n, pts[2]!.n], [blank, blank, blank]);
      return;
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]!;
      const b = pts[(i + 1) % pts.length]!;
      pushTri([c, a.p, b.p], [cn, a.n, b.n], [blank, blank, blank]);
    }
  });

  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.computeBoundingSphere();
  return geo;
}
