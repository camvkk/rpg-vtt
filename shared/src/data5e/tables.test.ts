import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  abilityMod,
  crToXp,
  encounterMultiplier,
  formatCr,
  HP_STATUS,
  levelForXp,
  proficiencyBonus,
  rateEncounter,
  spellSlotsFor,
  SPELL_SLOTS,
} from './tables.ts';
import { CLASSES } from './classes.ts';
import type { ClassData } from './types.ts';

test('proficiencyBonus follows the level table', () => {
  assert.equal(proficiencyBonus(1), 2);
  assert.equal(proficiencyBonus(4), 2);
  assert.equal(proficiencyBonus(5), 3);
  assert.equal(proficiencyBonus(8), 3);
  assert.equal(proficiencyBonus(9), 4);
  assert.equal(proficiencyBonus(13), 5);
  assert.equal(proficiencyBonus(17), 6);
  assert.equal(proficiencyBonus(20), 6);
});

test('abilityMod rounds down', () => {
  assert.equal(abilityMod(1), -5);
  assert.equal(abilityMod(8), -1);
  assert.equal(abilityMod(9), -1);
  assert.equal(abilityMod(10), 0);
  assert.equal(abilityMod(11), 0);
  assert.equal(abilityMod(15), 2);
  assert.equal(abilityMod(20), 5);
  assert.equal(abilityMod(30), 10);
});

test('xp helpers', () => {
  assert.equal(levelForXp(0), 1);
  assert.equal(levelForXp(299), 1);
  assert.equal(levelForXp(300), 2);
  assert.equal(levelForXp(355000), 20);
  assert.equal(crToXp(0.25), 50);
  assert.equal(crToXp(5), 1800);
  assert.equal(formatCr(0.125), '1/8');
  assert.equal(formatCr(0.5), '1/2');
  assert.equal(formatCr(5), '5');
});

test('encounterMultiplier applies party size adjustment', () => {
  assert.equal(encounterMultiplier(1, 4), 1);
  assert.equal(encounterMultiplier(2, 4), 1.5);
  assert.equal(encounterMultiplier(4, 4), 2);
  assert.equal(encounterMultiplier(8, 4), 2.5);
  assert.equal(encounterMultiplier(12, 4), 3);
  assert.equal(encounterMultiplier(15, 4), 4);
  assert.equal(encounterMultiplier(1, 2), 1.5);
  assert.equal(encounterMultiplier(15, 2), 5);
  assert.equal(encounterMultiplier(1, 6), 0.5);
  assert.equal(encounterMultiplier(3, 7), 1.5);
});

test('rateEncounter: DMG example-like cases', () => {
  // 4 level-1 PCs vs 4 goblins (CR 1/4): 200 XP × 2 = 400 ≥ deadly (400).
  const goblins = rateEncounter([1, 1, 1, 1], [0.25, 0.25, 0.25, 0.25]);
  assert.equal(goblins.xp, 200);
  assert.equal(goblins.adjustedXp, 400);
  assert.deepEqual(goblins.thresholds, { easy: 100, medium: 200, hard: 300, deadly: 400 });
  assert.equal(goblins.difficulty, 'deadly');

  // 4 level-3 PCs vs 1 CR 2 monster: 450 XP, medium threshold 600 → easy (≥ 300).
  const ogre = rateEncounter([3, 3, 3, 3], [2]);
  assert.equal(ogre.adjustedXp, 450);
  assert.equal(ogre.difficulty, 'easy');

  // 5 level-5 PCs vs 2 CR 3 monsters: 1400 × 1.5 = 2100 → easy 1250, medium 2500 → easy.
  assert.equal(rateEncounter([5, 5, 5, 5, 5], [3, 3]).difficulty, 'easy');

  // Trivial / empty.
  assert.equal(rateEncounter([10, 10, 10, 10], [0.125]).difficulty, 'trivial');
  assert.equal(rateEncounter([1, 1], []).difficulty, 'trivial');
});

test('SPELL_SLOTS tables', () => {
  assert.deepEqual(SPELL_SLOTS.full[1], [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.full[20], [4, 3, 3, 3, 3, 2, 2, 1, 1]);
  assert.deepEqual(SPELL_SLOTS.half[1], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.half[2], [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.half[5], [4, 2, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.half[20], [4, 3, 3, 3, 2, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.third[2], [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.third[3], [2, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(SPELL_SLOTS.third[19], [4, 3, 3, 1, 0, 0, 0, 0, 0]);
});

test('spellSlotsFor: single full caster level 5 → 4/3/2', () => {
  const r = spellSlotsFor([{ id: 'wizard', level: 5 }], CLASSES);
  assert.deepEqual(r.slots, { '1': 4, '2': 3, '3': 2 });
  assert.equal(r.pact, null);
});

test('spellSlotsFor: single half caster uses its own table', () => {
  assert.deepEqual(spellSlotsFor([{ id: 'paladin', level: 1 }], CLASSES).slots, {});
  assert.deepEqual(spellSlotsFor([{ id: 'paladin', level: 5 }], CLASSES).slots, { '1': 4, '2': 2 });
  // Paladin with a non-caster class still uses the paladin table.
  assert.deepEqual(spellSlotsFor([{ id: 'paladin', level: 5 }, { id: 'fighter', level: 3 }], CLASSES).slots, { '1': 4, '2': 2 });
});

test('spellSlotsFor: paladin 5 + wizard 3 → caster level 5', () => {
  const r = spellSlotsFor([{ id: 'paladin', level: 5 }, { id: 'wizard', level: 3 }], CLASSES);
  assert.deepEqual(r.slots, { '1': 4, '2': 3, '3': 2 });
});

test('spellSlotsFor: warlock pact magic is separate', () => {
  const r = spellSlotsFor([{ id: 'warlock', level: 5 }, { id: 'sorcerer', level: 3 }], CLASSES);
  assert.deepEqual(r.slots, { '1': 4, '2': 2 });
  assert.deepEqual(r.pact, { count: 2, level: 3 });
  assert.deepEqual(spellSlotsFor([{ id: 'warlock', level: 11 }], CLASSES), { slots: {}, pact: { count: 3, level: 5 } });
});

test('spellSlotsFor: third casters via subclass and custom class data', () => {
  assert.deepEqual(spellSlotsFor([{ id: 'fighter', level: 7, subclass: 'eldritch-knight' }], CLASSES).slots, { '1': 4, '2': 2 });
  // Fighter (EK) 6 + cleric 4 → ⌊6/3⌋ + 4 = 6.
  assert.deepEqual(
    spellSlotsFor([{ id: 'fighter', level: 6, subclass: 'Cavaleiro Arcano' }, { id: 'cleric', level: 4 }], CLASSES).slots,
    { '1': 4, '2': 3, '3': 3 },
  );
  const custom: ClassData[] = [{ ...CLASSES[0], id: 'artificer-like', spellcasting: { ability: 'int', progression: 'third', prepares: true } }];
  assert.deepEqual(spellSlotsFor([{ id: 'artificer-like', level: 3 }], custom).slots, { '1': 2 });
});

test('HP_STATUS labels', () => {
  assert.equal(HP_STATUS(10, 10).label, 'Ileso');
  assert.equal(HP_STATUS(9, 10).label, 'Arranhado');
  assert.equal(HP_STATUS(6, 10).label, 'Ferido');
  assert.equal(HP_STATUS(3, 10).label, 'Muito ferido');
  assert.equal(HP_STATUS(2, 10).label, 'À beira da morte');
  assert.equal(HP_STATUS(0, 10).label, 'Caído');
});
