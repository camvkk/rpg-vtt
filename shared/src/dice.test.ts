import { test } from 'node:test';
import assert from 'node:assert/strict';
import { critFormula, parseFormula, roll, type Rng } from './dice.ts';

/** RNG that returns a fixed sequence (then repeats the last value). */
function seq(...values: number[]): Rng {
  let i = 0;
  return (sides) => {
    const v = values[Math.min(i, values.length - 1)]!;
    i++;
    return Math.min(v, sides);
  };
}

test('basic arithmetic and precedence', () => {
  assert.equal(roll('2+3*4').total, 14);
  assert.equal(roll('(2+3)*4').total, 20);
  assert.equal(roll('10/3').total, 3);
  assert.equal(roll('-5+2').total, -3);
});

test('dice with modifiers', () => {
  const r = roll('2d6+3', { rng: seq(4, 5) });
  assert.equal(r.total, 12);
  assert.deepEqual(r.terms[0]!.dice!.map((d) => d.value), [4, 5]);
});

test('multiple dice terms add and subtract (v1 bug)', () => {
  assert.equal(roll('2d6+1d4', { rng: seq(3, 3, 2) }).total, 8);
  assert.equal(roll('1d20-1d4', { rng: seq(15, 3) }).total, 12);
});

test('keep highest / lowest / drop', () => {
  assert.equal(roll('4d6kh3', { rng: seq(1, 6, 4, 5) }).total, 15);
  assert.equal(roll('4d6d1', { rng: seq(1, 6, 4, 5) }).total, 15);
  assert.equal(roll('2d20kl1', { rng: seq(17, 4) }).total, 4);
  const r = roll('4d6kh3', { rng: seq(3, 3, 3, 3) });
  assert.equal(r.terms[0]!.dice!.filter((d) => d.dropped).length, 1, 'ties drop exactly one die');
});

test('advantage and disadvantage', () => {
  const adv = roll('1d20+5', { rng: seq(3, 18), mode: 'adv' });
  assert.equal(adv.total, 23);
  assert.equal(adv.formula, '2d20kh1+5');
  const dis = roll('d20+5', { rng: seq(3, 18), mode: 'dis' });
  assert.equal(dis.total, 8);
});

test('crit and fumble detection uses kept d20 only', () => {
  assert.equal(roll('1d20', { rng: seq(20) }).crit, true);
  assert.equal(roll('2d20kh1', { rng: seq(1, 20) }).crit, true);
  assert.equal(roll('2d20kh1', { rng: seq(1, 20) }).fumble, false);
  assert.equal(roll('1d6', { rng: seq(6) }).crit, false);
});

test('reroll and explode', () => {
  assert.equal(roll('1d20r1', { rng: seq(1, 1, 9) }).total, 9);
  assert.equal(roll('1d20ro<3', { rng: seq(2, 1) }).total, 1, 'reroll once keeps second result');
  assert.equal(roll('1d6!', { rng: seq(6, 6, 2) }).total, 14);
  assert.equal(roll('1d10x>=9', { rng: seq(9, 3) }).total, 12);
});

test('flavor tags and percent dice', () => {
  const r = roll('2d6[fogo]+1d8[cortante]', { rng: seq(1, 2, 3) });
  assert.equal(r.total, 6);
  assert.equal(r.terms[0]!.flavor, 'fogo');
  assert.equal(roll('d%', { rng: seq(42) }).total, 42);
});

test('variables', () => {
  assert.equal(roll('1d8+@mod', { rng: seq(5), vars: { mod: 3 } }).total, 8);
  assert.equal(roll('1d8+@mod', { rng: seq(5), vars: { mod: -1 } }).total, 4);
});

test('limits and errors', () => {
  assert.equal(parseFormula('9999999999d6').ok, false);
  assert.equal(parseFormula('1d0').ok, false);
  assert.equal(parseFormula('0d6').ok, false);
  assert.equal(parseFormula('1d6r<=6').ok, false);
  assert.equal(parseFormula('1d20 explode').ok, false);
  assert.equal(parseFormula('2d6+').ok, false);
  assert.equal(parseFormula('').ok, false);
});

test('crit damage doubles dice', () => {
  assert.equal(critFormula('1d8+3'), '2d8+3');
  assert.equal(critFormula('2d6+1d4[fogo]+2'), '4d6+2d4[fogo]+2');
});

test('uniform crypto rng covers all faces', () => {
  const seen = new Set<number>();
  for (let i = 0; i < 400; i++) seen.add(roll('1d6').total);
  assert.equal(seen.size, 6);
});
