import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkCustomFormula, customRoll, customStatValue, customVars, expandPools, newCustomSheet, normalizeCustomSystem, prettyFormula,
} from './customSystem.ts';
import { roll } from './dice.ts';
import { zCustomSystem } from './schemas.ts';
import type { CustomSystem } from './types.ts';

/** Roughly what v1's importer (and a sloppy model) returns. */
const V1_STYLE = {
  systemName: 'CyberRPG 2080',
  description: 'Futuro sombrio.',
  stats: [{ key: 'corpo', name: 'CORPO', short: 'COR' }, { name: 'Reflexos', short: 'REF' }, { name: 'Mente' }, { name: 'Tech' }],
  skills: { hacking: { name: 'Hacking', ability: 'Mente' }, tiro: { name: 'Tiro', ability: 'REF' } },
  races: [{ name: 'Humano', statBonuses: '+1 REF, +1 Mente', traits: 'Adaptável; Determinado' }],
  classes: [{ name: 'Netrunner', hitDie: 'd6', primaryStats: 'Mente, Tech', classSkills: ['hacking'], level1Features: [{ name: 'Interface', description: 'conecta' }] }],
  equipment: [{ name: 'Pistola Neural', type: 'Arma', damage: '2d6+REFLEXOS', properties: ['Atordoante'] }, { name: 'Faca', damage: '1d4 (cortante)' }],
  spells: [{ name: 'Choque', level: 2, damage: '3d6' }],
  customMechanics: [
    { name: 'Hack Sistema', description: 'Invade sistemas', diceFormula: '1d20 + MENTE + TECH' },
    { name: 'Parada', diceFormula: '(@mente+@tech)d10' },
    { name: 'Sem dados', diceFormula: 'role e reze' },
  ],
  rules: [{ name: 'Combate', description: 'Turnos de 3 segundos.' }],
  checkFormula: '1d20 + atributo',
};

function normalized(input: unknown = V1_STYLE): CustomSystem {
  const r = normalizeCustomSystem(input, { now: 1, sources: ['regras.md'] });
  if ('error' in r) throw new Error(r.error);
  return r.system;
}

test('normalizer turns v1/AI output into a valid system', () => {
  const r = normalizeCustomSystem(V1_STYLE, { now: 1, sources: ['regras.md'] });
  assert.ok(!('error' in r));
  const sys = r.system;
  assert.equal(zCustomSystem.safeParse(sys).success, true);
  assert.equal(sys.name, 'CyberRPG 2080');
  assert.deepEqual(sys.stats.map((s) => s.key), ['corpo', 'reflexos', 'mente', 'tech']);
  assert.deepEqual(sys.skills.map((s) => [s.key, s.stat]), [['hacking', 'mente'], ['tiro', 'reflexos']]);
  assert.deepEqual(sys.races[0]!.statBonuses, { reflexos: 1, mente: 1 });
  assert.deepEqual(sys.races[0]!.traits, ['Adaptável', 'Determinado']);
  assert.equal(sys.classes[0]!.hitDie, 6);
  assert.deepEqual(sys.classes[0]!.primaryStats, ['mente', 'tech']);
  assert.deepEqual(sys.classes[0]!.skills, ['hacking']);
  assert.equal(sys.checkFormula, '1d20+@atr');
  assert.equal(sys.skillFormula, '1d20+@atr+@pericia');
  assert.equal(sys.equipment[0]!.formula, '2d6+@reflexos', 'stat names become variables');
  assert.equal(sys.equipment[1]!.formula, '1d4', 'prose around a formula is dropped');
  assert.equal(sys.powers[0]!.tag, 'Nível 2');
  const mech = Object.fromEntries(sys.mechanics.map((m) => [m.key, m.formula]));
  assert.equal(mech.hack_sistema, '1d20+@mente+@tech');
  assert.equal(mech.parada, '{@mente+@tech}d10', 'dice pools use braces');
  assert.equal(mech.sem_dados, null);
  assert.ok(r.warnings.some((w) => w.includes('fórmula')), 'lost formulas are reported');
  assert.deepEqual(sys.sources, ['regras.md']);
});

test('normalizer handles D&D-like scores, unique keys and reserved names', () => {
  const sys = normalized({
    name: 'Fantasia',
    stats: [
      { name: 'Força', short: 'FOR', min: 3, max: 18, default: 10 },
      { name: 'Força', short: 'FOR2', min: 3, max: 18, default: 10 },
      { name: 'Nível', min: 1, max: 20, default: 10 },
    ],
    skills: [{ name: 'Atletismo', stat: 'FOR' }],
  });
  assert.equal(sys.modifier, 'dnd');
  assert.deepEqual(sys.stats.map((s) => s.key), ['forca', 'forca_2', 'nivel_2'], 'duplicates and @nivel are renamed');
  assert.equal(sys.skills[0]!.stat, 'forca');
});

test('normalizer rejects input without stats or skills', () => {
  const r = normalizeCustomSystem({ name: 'Vazio', rules: [{ name: 'x', description: 'y' }] });
  assert.ok('error' in r);
  assert.ok('error' in normalizeCustomSystem('texto solto'));
});

test('schema rejects keys that cannot be dice variables and duplicated entries', () => {
  const sys = normalized();
  assert.equal(zCustomSystem.safeParse({ ...sys, stats: [{ ...sys.stats[0]!, key: 'Força' }] }).success, false);
  assert.equal(zCustomSystem.safeParse({ ...sys, skills: [sys.skills[0]!, sys.skills[0]!] }).success, false);
  assert.equal(zCustomSystem.safeParse({ ...sys, checkFormula: 'x'.repeat(200) }).success, false);
  assert.equal(zCustomSystem.safeParse({ ...sys, name: '' }).success, false);
});

test('rolls use stats + race bonus, skill values and dice pools', () => {
  const sys = normalized();
  const c = {
    race: 'Humano',
    classes: [{ id: 'netrunner', name: 'Netrunner', level: 3, subclass: '', hitDie: 6 }],
    custom: { ...newCustomSheet(sys), stats: { corpo: 2, reflexos: 3, mente: 4, tech: 2 }, skills: { hacking: 5 } },
  };
  assert.equal(customStatValue(sys, c, 'mente'), 5, 'base 4 + 1 from Humano');
  const vars = customVars(sys, c);
  assert.equal(vars.nivel, 3);
  assert.equal(vars.reflexos, 4);

  const stat = customRoll(sys, c, 'stat', 'mente');
  assert.ok(typeof stat !== 'string');
  assert.equal(roll(stat.formula, { vars: stat.vars }).formula, '1d20+5');
  assert.equal(stat.title, 'Teste de Mente');

  const skill = customRoll(sys, c, 'skill', 'hacking');
  assert.ok(typeof skill !== 'string');
  assert.equal(roll(skill.formula, { vars: skill.vars }).formula, '1d20+5+5');

  const pool = customRoll(sys, c, 'mechanic', 'parada');
  assert.ok(typeof pool !== 'string');
  assert.equal(pool.formula, '7d10', 'mente 5 + tech 2');

  assert.equal(typeof customRoll(sys, c, 'mechanic', 'sem_dados'), 'string', 'entries without a formula cannot roll');
  assert.equal(typeof customRoll(sys, c, 'stat', 'magia'), 'string');
});

test('dnd modifier rule and defaults for untouched sheets', () => {
  const sys = normalized({ name: 'D20', modifier: 'dnd', stats: [{ name: 'Força', short: 'FOR', min: 1, max: 20, default: 10 }], checkFormula: '1d20+@atr' });
  const blank = { race: '', classes: [], custom: null };
  const r = customRoll(sys, blank, 'stat', 'forca');
  assert.ok(typeof r !== 'string');
  assert.equal(r.vars.atr, 0, 'default 10 → +0');
  const strong = { ...blank, custom: { stats: { forca: 16 }, skills: {}, resources: {} } };
  const r2 = customRoll(sys, strong, 'stat', 'forca');
  assert.ok(typeof r2 !== 'string');
  assert.equal(r2.vars.atr, 3);
});

test('formula helpers', () => {
  const sys = normalized();
  assert.equal(checkCustomFormula('1d20+@mente', sys), null);
  assert.ok(checkCustomFormula('1d20+@magia', sys));
  assert.ok(checkCustomFormula('', sys));
  assert.equal(expandPools('{@a+@b}d6+@a', { a: 2, b: 3 }), '5d6+@a');
  assert.equal(expandPools('{@a}d6', { a: -4 }), '1d6', 'pools never go below one die');
  assert.equal(prettyFormula('1d20+@reflexos+@pericia', sys), '1d20 + REF + perícia');
  assert.equal(prettyFormula('{@valor+@pericia}d10', sys), '(valor + perícia)d10');
});
