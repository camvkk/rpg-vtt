/**
 * Pure die shape definitions (no three.js / cannon-es / DOM).
 *
 * Every shape is a convex polyhedron centred at the origin with faces listed
 * counter-clockwise when seen from outside. Each shape also carries the numeral
 * layout of every face (in face-local world units), which the texture atlas and
 * the UV mapping are generated from.
 */
import {
  add, cross, dot, length, normalize, scale, sub,
  type DieKind, type RemapShape, type Vec3,
} from './faces.ts';

export interface FaceFrame {
  /** Point on the face where the numeral is centred. */
  center: Vec3;
  /** Numeral "right" (in the face plane). */
  u: Vec3;
  /** Numeral "up" (in the face plane). */
  v: Vec3;
  /** Outward face normal. */
  n: Vec3;
}

export interface Glyph {
  text: string;
  /** Centre of the glyph in the face frame (world units). */
  x: number;
  y: number;
  /** Clockwise rotation in canvas convention (radians). */
  rot: number;
  /** Target digit height (world units). */
  size: number;
  /** Max text width (world units). */
  maxWidth: number;
  underline: boolean;
}

export interface DieShape extends RemapShape {
  kind: DieKind;
  vertices: Vec3[];
  faces: number[][];
  faceNormals: Vec3[];
  features: Vec3[];
  /** True for the d4 (result = vertex pointing up). */
  featureIsVertex: boolean;
  values: number[];
  /** Display string per feature. */
  labels: string[];
  featureUp?: Vec3[];
  frames: FaceFrame[];
  /** Glyphs to paint for every face (atlas cell = face index). */
  glyphs: Glyph[][];
  /** Half size (world units) of the square region of a face mapped to one atlas cell. */
  cellHalf: number;
  /** Distance from centre to every face plane (resting height). */
  inradius: number;
  /** Circumradius. */
  radius: number;
  /** Visual edge bevel width (world units). */
  chamfer: number;
  /** Unique face-normal axes (for cannon's separating-axis test). */
  uniqueAxes: Vec3[];
}

export const DIE_KINDS: readonly DieKind[] = ['d4', 'd6', 'd8', 'd10', 'd100', 'd12', 'd20'];

const PHI = (1 + Math.sqrt(5)) / 2;

// ---------------------------------------------------------------------------
// Raw vertices
// ---------------------------------------------------------------------------

function trapezohedron(ringRadius: number, apexHeight: number): Vec3[] {
  // Planar kites require apexHeight = e * (1 + cos36°) / (1 - cos36°), e = ring zig-zag height.
  const c = Math.cos(Math.PI / 5);
  const e = (apexHeight * (1 - c)) / (1 + c);
  const out: Vec3[] = [[0, apexHeight, 0], [0, -apexHeight, 0]];
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5;
    out.push([ringRadius * Math.cos(a), k % 2 === 0 ? e : -e, ringRadius * Math.sin(a)]);
  }
  return out;
}

function rawVertices(kind: DieKind): Vec3[] {
  switch (kind) {
    case 'd4':
      return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case 'd6': {
      const out: Vec3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z]);
      return out;
    }
    case 'd8':
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'd10':
    case 'd100':
      return trapezohedron(1, 1.08);
    case 'd12': {
      const out: Vec3[] = [];
      for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) out.push([x, y, z]);
      const a = 1 / PHI;
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) {
          out.push([0, s * a, t * PHI]);
          out.push([s * a, t * PHI, 0]);
          out.push([s * PHI, 0, t * a]);
        }
      }
      return out;
    }
    case 'd20': {
      const out: Vec3[] = [];
      for (const s of [-1, 1]) {
        for (const t of [-1, 1]) {
          out.push([0, s, t * PHI]);
          out.push([s, t * PHI, 0]);
          out.push([s * PHI, 0, t]);
        }
      }
      return out;
    }
  }
}

/** Target circumradius (world units) per kind; d10 is scaled by ring radius instead. */
const SIZE: Record<DieKind, number> = {
  d4: 1.3,
  d6: 0.87,
  d8: 0.96,
  d10: 0.9,
  d100: 0.9,
  d12: 0.95,
  d20: 1.0,
};

const CHAMFER: Record<DieKind, number> = {
  d4: 0.08,
  d6: 0.075,
  d8: 0.065,
  d10: 0.055,
  d100: 0.055,
  d12: 0.06,
  d20: 0.055,
};

/** Numeral digit height and max width as a fraction of the face's inscribed radius. */
const GLYPH: Record<DieKind, { h: number; w: number }> = {
  d4: { h: 0, w: 0 }, // laid out per corner
  d6: { h: 1.0, w: 1.45 },
  d8: { h: 1.12, w: 1.5 },
  d10: { h: 1.3, w: 1.5 },
  d100: { h: 0.95, w: 1.95 },
  d12: { h: 0.92, w: 1.55 },
  d20: { h: 0.98, w: 1.62 },
};

// ---------------------------------------------------------------------------
// Convex hull faces (brute force; fine for <= 20 vertices)
// ---------------------------------------------------------------------------

function hullFaces(verts: readonly Vec3[]): { faces: number[][]; normals: Vec3[] } {
  let maxR = 0;
  for (const v of verts) maxR = Math.max(maxR, length(v));
  const eps = maxR * 1e-7;
  const planes: { n: Vec3; d: number }[] = [];
  const n = verts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        const vi = verts[i]!;
        let nn = cross(sub(verts[j]!, vi), sub(verts[k]!, vi));
        if (length(nn) < eps) continue;
        nn = normalize(nn);
        let d = dot(nn, vi);
        let pos = 0;
        let neg = 0;
        for (const v of verts) {
          const s = dot(nn, v) - d;
          if (s > eps) pos++;
          else if (s < -eps) neg++;
        }
        if (pos > 0 && neg > 0) continue;
        if (pos > 0) {
          nn = scale(nn, -1);
          d = -d;
        }
        if (planes.some((p) => dot(p.n, nn) > 1 - 1e-9 && Math.abs(p.d - d) < eps * 10)) continue;
        planes.push({ n: nn, d });
      }
    }
  }
  const faces = planes.map(({ n: nn, d }) => {
    const idx: number[] = [];
    verts.forEach((v, i) => {
      if (Math.abs(dot(nn, v) - d) < eps * 10) idx.push(i);
    });
    let c: Vec3 = [0, 0, 0];
    for (const i of idx) c = add(c, verts[i]!);
    c = scale(c, 1 / idx.length);
    const ref = normalize(sub(verts[idx[0]!]!, c));
    const ref2 = cross(nn, ref);
    const ang = (i: number): number => {
      const p = sub(verts[i]!, c);
      return Math.atan2(dot(p, ref2), dot(p, ref));
    };
    return idx.sort((a, b) => ang(a) - ang(b));
  });
  return { faces, normals: planes.map((p) => p.n) };
}

// ---------------------------------------------------------------------------
// 2D helpers for numeral placement
// ---------------------------------------------------------------------------

type P2 = [number, number];

/** Centre of the largest inscribed circle of a convex CCW polygon. */
function chebyshevCenter(poly: readonly P2[]): { x: number; y: number; r: number } {
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    const nx = -dy / l;
    const ny = dx / l;
    return { nx, ny, c: nx * a[0] + ny * a[1] };
  });
  const distMin = (x: number, y: number): number =>
    Math.min(...lines.map((ln) => ln.nx * x + ln.ny * y - ln.c));
  let cx = 0;
  let cy = 0;
  for (const p of poly) {
    cx += p[0];
    cy += p[1];
  }
  cx /= poly.length;
  cy /= poly.length;
  let best = { x: cx, y: cy, r: distMin(cx, cy) };
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      for (let k = j + 1; k < lines.length; k++) {
        const A = lines[i]!, B = lines[j]!, C = lines[k]!;
        // Solve n·p - r = c for the three lines (unknowns x, y, r).
        const det =
          A.nx * (B.ny * -1 - -1 * C.ny) - A.ny * (B.nx * -1 - -1 * C.nx) + -1 * (B.nx * C.ny - B.ny * C.nx);
        if (Math.abs(det) < 1e-12) continue;
        const dx = A.c * (B.ny * -1 - -1 * C.ny) - A.ny * (B.c * -1 - -1 * C.c) + -1 * (B.c * C.ny - B.ny * C.c);
        const dy = A.nx * (B.c * -1 - -1 * C.c) - A.c * (B.nx * -1 - -1 * C.nx) + -1 * (B.nx * C.c - B.c * C.nx);
        const x = dx / det;
        const y = dy / det;
        const r = distMin(x, y);
        if (r > best.r + 1e-12) best = { x, y, r };
      }
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function assignOppositeValues(normals: readonly Vec3[], count: number, order: readonly number[]): number[] {
  const values = new Array<number>(normals.length).fill(-1);
  let next = 1;
  for (const f of order) {
    if (values[f] !== -1) continue;
    values[f] = next;
    let opp = -1;
    for (let g = 0; g < normals.length; g++) {
      if (dot(normals[f]!, normals[g]!) < -0.999) opp = g;
    }
    if (opp >= 0) values[opp] = count + 1 - next;
    next++;
  }
  return values;
}

function angleAroundY(v: Vec3): number {
  return Math.atan2(v[2], v[0]);
}

function buildShape(kind: DieKind): DieShape {
  let verts = rawVertices(kind);
  let maxR = 0;
  for (const v of verts) maxR = Math.max(maxR, length(v));
  const s = kind === 'd10' || kind === 'd100' ? SIZE[kind] : SIZE[kind] / maxR;
  verts = verts.map((v) => scale(v, s));

  const hull = hullFaces(verts);
  let faces = hull.faces;
  const faceNormals = hull.normals;

  // d10: start each kite at its apex so the numeral reads towards the apex.
  if (kind === 'd10' || kind === 'd100') {
    faces = faces.map((f) => {
      let apexPos = 0;
      f.forEach((vi, p) => {
        if (Math.abs(verts[vi]![1]) > Math.abs(verts[f[apexPos]!]![1])) apexPos = p;
      });
      return [...f.slice(apexPos), ...f.slice(0, apexPos)];
    });
  }

  const inradius = Math.min(...faces.map((f, i) => dot(faceNormals[i]!, verts[f[0]!]!)));
  let radius = 0;
  for (const v of verts) radius = Math.max(radius, length(v));

  // ----- values & labels -----
  const featureIsVertex = kind === 'd4';
  const features: Vec3[] = featureIsVertex ? verts.map(normalize) : faceNormals.slice();
  let values: number[];
  let labels: string[];
  // Faces ordered top-down then by angle; used for deterministic value assignment.
  const order = faces
    .map((_, i) => i)
    .sort((a, b) => {
      const na = faceNormals[a]!, nb = faceNormals[b]!;
      if (Math.abs(na[1] - nb[1]) > 1e-6) return nb[1] - na[1];
      return angleAroundY(na) - angleAroundY(nb);
    });

  switch (kind) {
    case 'd4':
      values = [1, 2, 3, 4];
      labels = values.map(String);
      break;
    case 'd6': {
      values = faceNormals.map((n) => {
        if (n[1] > 0.9) return 1;
        if (n[1] < -0.9) return 6;
        if (n[0] > 0.9) return 2;
        if (n[0] < -0.9) return 5;
        if (n[2] > 0.9) return 3;
        return 4;
      });
      labels = values.map(String);
      break;
    }
    case 'd10':
    case 'd100': {
      // Upper kites (apex at +Y) get odd digits around, opposite kites get 9 - v.
      const upper = order.filter((f) => faceNormals[f]![1] > 0);
      values = new Array<number>(faces.length).fill(-1);
      const odd = [1, 7, 3, 9, 5];
      upper.forEach((f, i) => {
        values[f] = odd[i]!;
        for (let g = 0; g < faces.length; g++) {
          if (dot(faceNormals[f]!, faceNormals[g]!) < -0.999) values[g] = 9 - odd[i]!;
        }
      });
      labels = kind === 'd100' ? values.map((d) => `${d}0`) : values.map(String);
      break;
    }
    default: {
      const n = faces.length;
      values = assignOppositeValues(faceNormals, n, order);
      labels = values.map(String);
    }
  }

  // ----- face frames & glyphs -----
  const frames: FaceFrame[] = [];
  const glyphs: Glyph[][] = [];
  let cellHalf = 0;
  faces.forEach((f, fi) => {
    const n = faceNormals[fi]!;
    const p0 = verts[f[0]!]!;
    const e1 = normalize(sub(verts[f[1]!]!, p0));
    const e2 = cross(n, e1);
    const to2 = (p: Vec3): P2 => [dot(sub(p, p0), e1), dot(sub(p, p0), e2)];
    const poly = f.map((vi) => to2(verts[vi]!));
    const cc = chebyshevCenter(poly);
    let center = add(p0, add(scale(e1, cc.x), scale(e2, cc.y)));
    const rho = cc.r;

    let target: Vec3;
    if (kind === 'd6') target = scale(add(verts[f[0]!]!, verts[f[1]!]!), 0.5);
    else target = verts[f[0]!]!;
    const toTarget = sub(target, center);
    const v = normalize(sub(toTarget, scale(n, dot(toTarget, n))));
    const u = cross(v, n);

    if (kind === 'd10' || kind === 'd100') {
      // Nudge the numeral towards the apex, into the wide part of the kite.
      center = add(center, scale(v, rho * 0.22));
    }
    frames.push({ center, u, v, n });

    const local = f.map((vi) => {
      const d = sub(verts[vi]!, center);
      return [dot(d, u), dot(d, v)] as P2;
    });
    for (const [a, b] of local) cellHalf = Math.max(cellHalf, Math.abs(a), Math.abs(b));

    if (kind === 'd4') {
      const g: Glyph[] = f.map((vi, k) => {
        const [a, b] = local[k]!;
        const dist = Math.hypot(a, b);
        return {
          text: labels[vi]!,
          x: a * 0.48,
          y: b * 0.48,
          rot: Math.atan2(a, b),
          size: dist * 0.4,
          maxWidth: dist * 0.42,
          underline: false,
        };
      });
      glyphs.push(g);
    } else {
      const text = labels[fi]!;
      glyphs.push([
        {
          text,
          x: 0,
          y: 0,
          rot: 0,
          size: rho * GLYPH[kind].h,
          maxWidth: rho * GLYPH[kind].w,
          underline: text === '6' || text === '9',
        },
      ]);
    }
  });
  cellHalf *= 1.04;

  const uniqueAxes: Vec3[] = [];
  for (const nn of faceNormals) {
    if (!uniqueAxes.some((a) => Math.abs(dot(a, nn)) > 0.9999)) uniqueAxes.push(nn);
  }

  return {
    kind,
    vertices: verts,
    faces,
    faceNormals,
    features,
    featureIsVertex,
    values,
    labels,
    featureUp: featureIsVertex ? undefined : frames.map((fr) => fr.v),
    frames,
    glyphs,
    cellHalf,
    inradius,
    radius,
    chamfer: CHAMFER[kind],
    uniqueAxes,
  };
}

const cache = new Map<DieKind, DieShape>();

export function getShape(kind: DieKind): DieShape {
  let s = cache.get(kind);
  if (!s) {
    s = buildShape(kind);
    cache.set(kind, s);
  }
  return s;
}
