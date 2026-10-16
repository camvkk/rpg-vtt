import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  combinePercentile,
  d10DigitValue,
  dot,
  expandDice,
  findSymmetries,
  findUpFeature,
  normalize,
  quatFromUnitVectors,
  quatMultiply,
  quatNormalize,
  quatRotate,
  remapForResult,
  splitPercentile,
  swapLabels,
  type Quat,
  type Vec3,
} from './faces.ts';
import { DIE_KINDS, getShape } from './shapes.ts';

/** Deterministic PRNG so failures are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomQuat(rng: () => number): Quat {
  // Uniform random rotation (Shoemake).
  const u1 = rng(), u2 = rng(), u3 = rng();
  const s1 = Math.sqrt(1 - u1), s2 = Math.sqrt(u1);
  return quatNormalize([
    s1 * Math.sin(2 * Math.PI * u2),
    s1 * Math.cos(2 * Math.PI * u2),
    s2 * Math.sin(2 * Math.PI * u3),
    s2 * Math.cos(2 * Math.PI * u3),
  ]);
}

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) < eps;

test('quatRotate rotates 90° about Y', () => {
  const s = Math.SQRT1_2;
  const q: Quat = [0, s, 0, s];
  const r = quatRotate(q, [1, 0, 0]);
  assert.ok(near(r[0], 0) && near(r[1], 0) && near(r[2], -1), `got ${r.join(',')}`);
});

test('findUpFeature on a cube', () => {
  const d6 = getShape('d6');
  const identity = findUpFeature(d6.features, [0, 0, 0, 1]);
  assert.equal(d6.values[identity.index], 1); // +Y face carries 1
  assert.ok(near(identity.alignment, 1));

  // Tip the cube so its +X face points up.
  const q = quatFromUnitVectors([1, 0, 0], [0, 1, 0]);
  const tipped = findUpFeature(d6.features, q);
  assert.equal(d6.values[tipped.index], 2);
  assert.ok(near(tipped.alignment, 1));

  // 20° off flat still reports the same face with the reduced alignment.
  const a = (20 * Math.PI) / 180;
  const tilt: Quat = [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
  const r = findUpFeature(d6.features, tilt);
  assert.equal(d6.values[r.index], 1);
  assert.ok(near(r.alignment, Math.cos(a), 1e-9));
});

test('d4 uses the top vertex', () => {
  const d4 = getShape('d4');
  assert.equal(d4.featureIsVertex, true);
  // Put vertex 2 straight up.
  const q = quatFromUnitVectors(normalize(d4.vertices[2]!), [0, 1, 0]);
  assert.equal(findUpFeature(d4.features, q).index, 2);
});

test('every die shape is a proper fair solid with the expected symmetry', () => {
  const expected: Record<string, { faces: number; stab: number }> = {
    d4: { faces: 4, stab: 3 },
    d6: { faces: 6, stab: 4 },
    d8: { faces: 8, stab: 3 },
    d10: { faces: 10, stab: 1 },
    d100: { faces: 10, stab: 1 },
    d12: { faces: 12, stab: 5 },
    d20: { faces: 20, stab: 3 },
  };
  for (const kind of DIE_KINDS) {
    const s = getShape(kind);
    assert.equal(s.faces.length, expected[kind]!.faces, kind);
    // features <-> values one to one, values unique
    assert.equal(s.values.length, s.features.length, kind);
    assert.equal(new Set(s.values).size, s.values.length, kind);
    // every face is CCW from outside (fan normal agrees with face normal)
    s.faces.forEach((f, i) => {
      const [a, b, c] = [s.vertices[f[0]!]!, s.vertices[f[1]!]!, s.vertices[f[2]!]!];
      const n: Vec3 = normalize([
        (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
        (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
        (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
      ]);
      assert.ok(dot(n, s.faceNormals[i]!) > 0.9999, `${kind} face ${i} winding`);
    });
    // stabiliser of a feature has the order of the rotation group / #features
    assert.equal(findSymmetries(s.vertices, s.features, 0, 0).length, expected[kind]!.stab, kind);
  }
});

test('standard numbering: opposite faces sum to N+1 (d10: 9)', () => {
  const sums: Record<string, number> = { d6: 7, d8: 9, d10: 9, d100: 9, d12: 13, d20: 21 };
  for (const [kind, sum] of Object.entries(sums)) {
    const s = getShape(kind as 'd6');
    s.faceNormals.forEach((n, i) => {
      const opp = s.faceNormals.findIndex((m) => dot(n, m) < -0.999);
      assert.ok(opp >= 0, `${kind} face ${i} has an opposite`);
      assert.equal(s.values[i]! + s.values[opp]!, sum, `${kind} faces ${i}/${opp}`);
    });
  }
  assert.deepEqual([...getShape('d100').labels].sort(), ['00', '10', '20', '30', '40', '50', '60', '70', '80', '90']);
});

test('remapForResult: landed slot shows the requested value for every (landed, value) pair', () => {
  for (const kind of DIE_KINDS) {
    const s = getShape(kind);
    for (let landed = 0; landed < s.features.length; landed++) {
      for (const value of s.values) {
        const r = remapForResult(s, landed, value);
        assert.ok(r, `${kind}: no symmetry for landed=${landed} value=${value}`);
        assert.equal(r.labels[landed], value, `${kind} landed=${landed} value=${value}`);
        // result is a permutation of the original labels
        assert.deepEqual([...r.labels].sort((a, b) => a - b), [...s.values].sort((a, b) => a - b));
        // the remapped die is still a valid die: opposite faces keep their sums
        if (!s.featureIsVertex) {
          s.faceNormals.forEach((n, i) => {
            const opp = s.faceNormals.findIndex((m) => dot(n, m) < -0.999);
            assert.equal(r.labels[i]! + r.labels[opp]!, s.values[i]! + s.values[opp]!);
          });
        }
      }
    }
  }
});

test('remapForResult: rendering body*R puts the requested value on top for random throws', () => {
  const rng = mulberry32(1234);
  for (const kind of DIE_KINDS) {
    const s = getShape(kind);
    for (let trial = 0; trial < 200; trial++) {
      const q = randomQuat(rng);
      const landed = findUpFeature(s.features, q).index;
      const value = s.values[Math.floor(rng() * s.values.length)]!;
      const r = remapForResult(s, landed, value, q);
      assert.ok(r);
      const visual = quatMultiply(q, r.rotation);
      const top = findUpFeature(s.features, visual);
      assert.equal(s.values[top.index], value, `${kind} trial ${trial}`);
      // the symmetry must not change which body direction is up
      const landedAlign = findUpFeature(s.features, q).alignment;
      assert.ok(near(top.alignment, landedAlign, 1e-6));
    }
  }
});

test('remapForResult picks the most upright numeral among symmetries', () => {
  const s = getShape('d6');
  const rng = mulberry32(99);
  for (let trial = 0; trial < 100; trial++) {
    // Flat landing with a random spin about the vertical axis.
    const spin = rng() * Math.PI * 2;
    const q: Quat = [0, Math.sin(spin / 2), 0, Math.cos(spin / 2)];
    const landed = findUpFeature(s.features, q).index;
    const value = 1 + Math.floor(rng() * 6);
    const r = remapForResult(s, landed, value, q, [0, 0, -1]);
    assert.ok(r);
    const from = s.values.indexOf(value);
    const up = quatRotate(quatMultiply(q, r.rotation), s.featureUp![from]!);
    // with 4 choices on a cube the numeral is never more than 45° from upright
    assert.ok(dot(up, [0, 0, -1]) >= Math.cos(Math.PI / 4) - 1e-9, `trial ${trial}`);
  }
});

test('remapForResult rejects values that are not on the die', () => {
  assert.equal(remapForResult(getShape('d6'), 0, 7), null);
  assert.equal(remapForResult(getShape('d20'), 99, 3), null);
});

test('swapLabels swaps the landed face with the face holding the value', () => {
  assert.deepEqual(swapLabels([1, 2, 3, 4, 5, 6], 0, 6), [6, 2, 3, 4, 5, 1]);
  assert.deepEqual(swapLabels([1, 2, 3, 4, 5, 6], 2, 3), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(swapLabels([1, 2, 3], 1, 9), [1, 2, 3]);
});

test('percentile split / combine', () => {
  assert.deepEqual(splitPercentile(100), { tens: 0, units: 0 });
  assert.deepEqual(splitPercentile(7), { tens: 0, units: 7 });
  assert.deepEqual(splitPercentile(10), { tens: 1, units: 0 });
  assert.deepEqual(splitPercentile(55), { tens: 5, units: 5 });
  assert.deepEqual(splitPercentile(99), { tens: 9, units: 9 });
  for (let v = 1; v <= 100; v++) {
    const { tens, units } = splitPercentile(v);
    assert.equal(combinePercentile(tens, units), v);
  }
});

test('expandDice maps logical dice to physical dice and face keys', () => {
  const out = expandDice([
    { sides: 20, value: 20 },
    { sides: 100, value: 100 },
    { sides: 100, value: 42 },
    { sides: 10, value: 10 },
    { sides: 10, value: 3 },
    { sides: 6, value: 9 }, // out of range -> clamped
    { sides: 4, value: 1 },
  ]);
  assert.deepEqual(out, [
    { kind: 'd20', key: 20, source: 0 },
    { kind: 'd100', key: 0, source: 1 },
    { kind: 'd10', key: 0, source: 1 },
    { kind: 'd100', key: 4, source: 2 },
    { kind: 'd10', key: 2, source: 2 },
    { kind: 'd10', key: 0, source: 3 },
    { kind: 'd10', key: 3, source: 4 },
    { kind: 'd6', key: 6, source: 5 },
    { kind: 'd4', key: 1, source: 6 },
  ]);
  assert.equal(d10DigitValue(0), 10);
  assert.equal(d10DigitValue(7), 7);
  // every key exists on its die
  for (const d of out) assert.ok(getShape(d.kind).values.includes(d.key), `${d.kind} ${d.key}`);
});
