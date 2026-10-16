/**
 * Pure face / label logic for the 3D dice (no three.js, no cannon-es, no DOM).
 *
 * Coordinate conventions match three.js and cannon-es:
 *  - Vec3 = [x, y, z], world up is +Y.
 *  - Quat = [x, y, z, w]; quatMultiply(a, b) applies b first, then a.
 *
 * "Features" are the things that decide a die result:
 *  - face normals for d6/d8/d10/d12/d20 (the face pointing up is the result);
 *  - vertex directions for the d4 (the vertex pointing up is the result, read
 *    with the "number at the top vertex" convention).
 *
 * Forcing a result: the physics body is simulated once, we look at which feature
 * landed on top, then rotate the *visual* die by a symmetry rotation R of the solid
 * (R maps the polyhedron onto itself, so the silhouette and every collision are
 * identical) chosen so that the feature carrying the requested value sits where the
 * landed feature is. That is equivalent to relabelling the faces with a permutation
 * (see `remapForResult`), but it keeps a physically valid numbering (opposite faces
 * still sum to N+1) and lets every die of a kind share one geometry.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type DieKind = 'd4' | 'd6' | 'd8' | 'd10' | 'd100' | 'd12' | 'd20';
export type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

export const UP: Vec3 = [0, 1, 0];
export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

// ---------------------------------------------------------------------------
// Vector / quaternion helpers
// ---------------------------------------------------------------------------

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}
export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}
export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}

/** Rotate v by unit quaternion q. */
export function quatRotate(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  const [vx, vy, vz] = v;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx),
  ];
}

/** a * b (b applied first). */
export function quatMultiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l > 1e-12 ? [q[0] / l, q[1] / l, q[2] / l, q[3] / l] : [0, 0, 0, 1];
}

export function quatConjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/**
 * Quaternion from a rotation matrix given by its three columns
 * (the images of the X, Y and Z axes).
 */
export function quatFromColumns(c0: Vec3, c1: Vec3, c2: Vec3): Quat {
  const m11 = c0[0], m12 = c1[0], m13 = c2[0];
  const m21 = c0[1], m22 = c1[1], m23 = c2[1];
  const m31 = c0[2], m32 = c1[2], m33 = c2[2];
  const trace = m11 + m22 + m33;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    q = [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  } else if (m11 > m22 && m11 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
    q = [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  } else if (m22 > m33) {
    const s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
    q = [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  } else {
    const s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
    q = [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
  }
  return quatNormalize(q);
}

/** Shortest rotation taking unit vector `from` onto unit vector `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  let r = dot(from, to) + 1;
  let q: Quat;
  if (r < 1e-8) {
    r = 0;
    q = Math.abs(from[0]) > Math.abs(from[2])
      ? [-from[1], from[0], 0, r]
      : [0, -from[2], from[1], r];
  } else {
    const c = cross(from, to);
    q = [c[0], c[1], c[2], r];
  }
  return quatNormalize(q);
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  if (cos > 0.9995) {
    return quatNormalize([
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ]);
  }
  const theta = Math.acos(Math.min(1, cos));
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** Angle (radians) of the rotation between two unit quaternions. */
export function quatAngle(a: Quat, b: Quat): number {
  const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]);
  return 2 * Math.acos(Math.min(1, d));
}

// ---------------------------------------------------------------------------
// Up-feature detection
// ---------------------------------------------------------------------------

export interface UpFeature {
  /** Index of the feature (face or d4 vertex) pointing most upward. */
  index: number;
  /** cos of the angle between that feature and world up (1 = perfectly flat). */
  alignment: number;
}

/**
 * Given feature directions in body space (face normals, or vertex directions for
 * the d4) and the body orientation, find the feature that points up.
 */
export function findUpFeature(features: readonly Vec3[], q: Quat, up: Vec3 = UP): UpFeature {
  let best = -1;
  let bestDot = -Infinity;
  for (let i = 0; i < features.length; i++) {
    const d = dot(normalize(quatRotate(q, features[i]!)), up);
    if (d > bestDot) {
      bestDot = d;
      best = i;
    }
  }
  return { index: best, alignment: bestDot };
}

// ---------------------------------------------------------------------------
// Symmetries
// ---------------------------------------------------------------------------

function matchesVertexSet(vertices: readonly Vec3[], q: Quat, tol: number): boolean {
  for (const v of vertices) {
    const r = quatRotate(q, v);
    let found = false;
    for (const w of vertices) {
      if (Math.abs(r[0] - w[0]) < tol && Math.abs(r[1] - w[1]) < tol && Math.abs(r[2] - w[2]) < tol) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}

/**
 * All proper rotations R that map the polyhedron (given by its vertices) onto itself
 * and send feature `from` onto feature `to` (R·f_from = f_to).
 * Ordered deterministically; empty if none exists.
 */
export function findSymmetries(
  vertices: readonly Vec3[],
  features: readonly Vec3[],
  from: number,
  to: number,
): Quat[] {
  const a = normalize(features[from]!);
  const b = normalize(features[to]!);
  let maxR = 0;
  for (const v of vertices) maxR = Math.max(maxR, length(v));
  const tol = Math.max(1e-9, maxR * 1e-5);

  // Auxiliary vector: a vertex not parallel to `a`.
  let sIdx = -1;
  for (let i = 0; i < vertices.length; i++) {
    const d = normalize(vertices[i]!);
    if (Math.abs(dot(d, a)) < 0.999) {
      sIdx = i;
      break;
    }
  }
  if (sIdx < 0) return [];
  const s = vertices[sIdx]!;
  const sLen = length(s);
  const sDir = normalize(s);
  const cosAS = dot(a, sDir);
  // Orthonormal source frame (a, s', a×s')
  const s1 = normalize(sub(sDir, scale(a, cosAS)));
  const s2 = cross(a, s1);

  const out: Quat[] = [];
  for (const t of vertices) {
    if (Math.abs(length(t) - sLen) > tol) continue;
    const tDir = normalize(t);
    const cosBT = dot(b, tDir);
    if (Math.abs(cosBT - cosAS) > 1e-5) continue;
    const t1 = normalize(sub(tDir, scale(b, cosBT)));
    const t2 = cross(b, t1);
    // R = [b t1 t2] · [a s1 s2]^T ; columns of R are R·e_x, R·e_y, R·e_z.
    const col = (k: 0 | 1 | 2): Vec3 => [
      b[0] * a[k] + t1[0] * s1[k] + t2[0] * s2[k],
      b[1] * a[k] + t1[1] * s1[k] + t2[1] * s2[k],
      b[2] * a[k] + t1[2] * s1[k] + t2[2] * s2[k],
    ];
    const q = quatFromColumns(col(0), col(1), col(2));
    if (!matchesVertexSet(vertices, q, tol)) continue;
    if (out.some((o) => quatAngle(o, q) < 1e-4)) continue;
    out.push(q);
  }
  return out;
}

/** perm[i] = j such that R·f_i ≈ f_j (-1 if no match). */
export function permutationFromRotation(features: readonly Vec3[], q: Quat): number[] {
  const dirs = features.map(normalize);
  return dirs.map((f) => {
    const r = quatRotate(q, f);
    let best = -1;
    let bestDot = 0.999;
    for (let j = 0; j < dirs.length; j++) {
      const d = dot(r, dirs[j]!);
      if (d > bestDot) {
        bestDot = d;
        best = j;
      }
    }
    return best;
  });
}

/** Minimal description of a die needed for remapping (a subset of DieShape). */
export interface RemapShape {
  vertices: readonly Vec3[];
  /** Unit feature directions (face normals, or d4 vertex directions). */
  features: readonly Vec3[];
  /** Numeric key per feature (face value; d10/d100 use the 0-9 digit). */
  values: readonly number[];
  /**
   * Optional per-feature "reading up" direction (unit, body space) of the numeral
   * printed on that face. Used to pick the symmetry that shows the top numeral
   * most upright on screen. Omit for the d4.
   */
  featureUp?: readonly Vec3[];
}

export interface Remap {
  /** Symmetry rotation to post-multiply onto the body orientation: visual = body * rotation. */
  rotation: Quat;
  /** perm[i] = body-space slot where original feature i ends up. */
  perm: number[];
  /** Value shown at each body-space feature slot after remapping. */
  labels: number[];
}

/**
 * Given the feature that physically landed on top (`landed`, in body space) and the
 * requested value, produce the relabelling. `finalQuat`/`screenUp` (optional) choose,
 * among the valid symmetries, the one whose top numeral reads most upright.
 * Returns null if the value does not exist on this die.
 */
export function remapForResult(
  shape: RemapShape,
  landed: number,
  desiredValue: number,
  finalQuat?: Quat,
  screenUp: Vec3 = [0, 0, -1],
): Remap | null {
  const from = shape.values.indexOf(desiredValue);
  if (from < 0 || landed < 0 || landed >= shape.features.length) return null;
  const syms = findSymmetries(shape.vertices, shape.features, from, landed);
  if (syms.length === 0) return null;

  let rotation = syms[0]!;
  if (finalQuat && shape.featureUp && syms.length > 1) {
    let bestScore = -Infinity;
    const upLocal = shape.featureUp[from]!;
    for (const r of syms) {
      // The printed "up" of the requested face, after symmetry and final orientation.
      const w = quatRotate(finalQuat, quatRotate(r, upLocal));
      const score = dot(w, screenUp);
      if (score > bestScore) {
        bestScore = score;
        rotation = r;
      }
    }
  }
  const perm = permutationFromRotation(shape.features, rotation);
  const labels = new Array<number>(shape.values.length).fill(Number.NaN);
  perm.forEach((j, i) => {
    if (j >= 0) labels[j] = shape.values[i]!;
  });
  return { rotation, perm, labels };
}

/**
 * Plain label swap (the simplest relabelling): the landed slot gets the requested
 * value and the slot that had it gets the landed value. Kept for reference/tests;
 * the renderer uses the symmetry-based `remapForResult`.
 */
export function swapLabels(values: readonly number[], landed: number, desiredValue: number): number[] {
  const out = values.slice();
  const from = out.indexOf(desiredValue);
  if (from < 0 || landed < 0 || landed >= out.length) return out;
  out[from] = out[landed]!;
  out[landed] = desiredValue;
  return out;
}

// ---------------------------------------------------------------------------
// Dice values -> physical dice
// ---------------------------------------------------------------------------

export interface PhysicalDie {
  kind: DieKind;
  /** Feature value that must end on top (d10/d100: the 0-9 digit). */
  key: number;
  /** Index of the Dice3DDie this physical die came from. */
  source: number;
}

const SIDES: readonly DieSides[] = [4, 6, 8, 10, 12, 20, 100];

export function isDieSides(n: number): n is DieSides {
  return (SIDES as readonly number[]).includes(n);
}

function clampInt(v: number, lo: number, hi: number): number {
  const n = Number.isFinite(v) ? Math.round(v) : lo;
  return Math.min(hi, Math.max(lo, n));
}

/** Split a d100 result (1..100) into the tens die digit and the units die digit. 100 = "00" + "0". */
export function splitPercentile(value: number): { tens: number; units: number } {
  const v = clampInt(value, 1, 100);
  return { tens: Math.floor((v % 100) / 10), units: v % 10 };
}

/** Inverse of splitPercentile: "00" + "0" = 100. */
export function combinePercentile(tens: number, units: number): number {
  const v = tens * 10 + units;
  return v === 0 ? 100 : v;
}

/** Expand logical dice into the physical dice to throw (d100 -> tens d10 + units d10). */
export function expandDice(dice: readonly { sides: number; value: number }[]): PhysicalDie[] {
  const out: PhysicalDie[] = [];
  dice.forEach((d, source) => {
    const sides = isDieSides(d.sides) ? d.sides : 20;
    switch (sides) {
      case 100: {
        const { tens, units } = splitPercentile(d.value);
        out.push({ kind: 'd100', key: tens, source });
        out.push({ kind: 'd10', key: units, source });
        break;
      }
      case 10:
        out.push({ kind: 'd10', key: clampInt(d.value, 1, 10) % 10, source });
        break;
      default:
        out.push({ kind: `d${sides}` as DieKind, key: clampInt(d.value, 1, sides), source });
    }
  });
  return out;
}

/** The numeric value a single d10 face digit represents (0 means 10). */
export function d10DigitValue(digit: number): number {
  return digit === 0 ? 10 : digit;
}
