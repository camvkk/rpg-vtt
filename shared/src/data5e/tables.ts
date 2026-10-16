// Rules tables and pure helpers (SRD 5.1 / DMG). No runtime dependencies.
import type { ClassData } from './types.ts';

// ---------------------------------------------------------------------------
// Basics
// ---------------------------------------------------------------------------

/** Proficiency bonus by character level (or CR ≥ 1): +2 at 1–4 … +6 at 17–20. */
export function proficiencyBonus(level: number): number {
  const lvl = Math.max(1, Math.floor(level));
  return 2 + Math.floor((lvl - 1) / 4);
}

/** Proficiency bonus for a monster's challenge rating (CR 0–4: +2 … CR 29–30: +9). */
export function proficiencyBonusForCr(cr: number): number {
  return proficiencyBonus(Math.max(1, Math.ceil(cr)));
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

/** "+3" / "-1" / "+0". */
export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

// ---------------------------------------------------------------------------
// Experience
// ---------------------------------------------------------------------------

/** Minimum XP for each level (index = level; index 0 unused). */
export const XP_BY_LEVEL: number[] = [
  0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
  85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000,
];

export function levelForXp(xp: number): number {
  let level = 1;
  for (let l = 1; l <= 20; l++) if (xp >= XP_BY_LEVEL[l]) level = l;
  return level;
}

/** XP needed for the next level, or null at level 20. */
export function xpForNextLevel(level: number): number | null {
  return level >= 20 ? null : XP_BY_LEVEL[Math.max(1, level) + 1];
}

/** XP by challenge rating, keyed by the CR as a decimal string. */
export const CR_XP: Record<string, number> = {
  '0': 10,
  '0.125': 25,
  '0.25': 50,
  '0.5': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
};

/** XP for a CR (accepts 0.125 / 0.25 / 0.5 and integers). Unknown CRs return 0. */
export function crToXp(cr: number): number {
  return CR_XP[String(cr)] ?? 0;
}

/** 0.125 → "1/8", 0.25 → "1/4", 0.5 → "1/2", 5 → "5". */
export function formatCr(cr: number): string {
  if (cr === 0.125) return '1/8';
  if (cr === 0.25) return '1/4';
  if (cr === 0.5) return '1/2';
  return String(cr);
}

/** Parse "1/4" / "0.25" / "5" back into a number (NaN if invalid). */
export function parseCr(text: string): number {
  const t = text.trim();
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(t.replace(',', '.'));
}

// ---------------------------------------------------------------------------
// Encounter building (DMG)
// ---------------------------------------------------------------------------

export interface XpThreshold {
  easy: number;
  medium: number;
  hard: number;
  deadly: number;
}

export const XP_THRESHOLDS: Record<number, XpThreshold> = {
  1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
  2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
  3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
  4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
  5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
  6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
  7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
  8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
  9: { easy: 550, medium: 1100, hard: 1600, deadly: 2400 },
  10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
  11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
  12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
  13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
  14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
  15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
  16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
  17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
  18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
  19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
  20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 },
};

/** Multiplier ladder; the DMG table uses indices 1–6, the extremes are for party-size shifts. */
const MULTIPLIERS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5];

/**
 * DMG encounter multiplier for the number of monsters, adjusted for party size:
 * fewer than 3 characters → next higher multiplier; 6 or more → next lower.
 */
export function encounterMultiplier(monsterCount: number, partySize: number): number {
  if (monsterCount <= 0) return 1;
  let idx: number;
  if (monsterCount === 1) idx = 1;
  else if (monsterCount === 2) idx = 2;
  else if (monsterCount <= 6) idx = 3;
  else if (monsterCount <= 10) idx = 4;
  else if (monsterCount <= 14) idx = 5;
  else idx = 6;
  if (partySize > 0 && partySize < 3) idx += 1;
  else if (partySize >= 6) idx -= 1;
  return MULTIPLIERS[Math.min(MULTIPLIERS.length - 1, Math.max(0, idx))];
}

export type EncounterDifficulty = 'trivial' | 'easy' | 'medium' | 'hard' | 'deadly';

export const DIFFICULTY_LABELS: Record<EncounterDifficulty, { name: string; color: string }> = {
  trivial: { name: 'Trivial', color: '#9e9e9e' },
  easy: { name: 'Fácil', color: '#66bb6a' },
  medium: { name: 'Médio', color: '#fdd835' },
  hard: { name: 'Difícil', color: '#fb8c00' },
  deadly: { name: 'Mortal', color: '#e53935' },
};

/**
 * Rate an encounter with the DMG method: sum monster XP, apply the multiplier for the number
 * of monsters (adjusted by party size) and compare against the party's summed thresholds.
 */
export function rateEncounter(
  partyLevels: number[],
  monsterCrs: number[],
): { xp: number; adjustedXp: number; difficulty: EncounterDifficulty; thresholds: XpThreshold; multiplier: number } {
  const thresholds: XpThreshold = { easy: 0, medium: 0, hard: 0, deadly: 0 };
  for (const lvl of partyLevels) {
    const t = XP_THRESHOLDS[Math.min(20, Math.max(1, Math.floor(lvl)))];
    thresholds.easy += t.easy;
    thresholds.medium += t.medium;
    thresholds.hard += t.hard;
    thresholds.deadly += t.deadly;
  }
  const xp = monsterCrs.reduce((sum, cr) => sum + crToXp(cr), 0);
  const multiplier = encounterMultiplier(monsterCrs.length, partyLevels.length);
  const adjustedXp = Math.round(xp * multiplier);
  let difficulty: EncounterDifficulty = 'trivial';
  if (monsterCrs.length > 0 && partyLevels.length > 0) {
    if (adjustedXp >= thresholds.deadly) difficulty = 'deadly';
    else if (adjustedXp >= thresholds.hard) difficulty = 'hard';
    else if (adjustedXp >= thresholds.medium) difficulty = 'medium';
    else if (adjustedXp >= thresholds.easy) difficulty = 'easy';
  }
  return { xp, adjustedXp, difficulty, thresholds, multiplier };
}

// ---------------------------------------------------------------------------
// Spell slots
// ---------------------------------------------------------------------------

/** Full caster table (bard, cleric, druid, sorcerer, wizard); index = level, 9 entries = slot levels 1–9. */
const FULL_CASTER: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0, 0],
  [2, 0, 0, 0, 0, 0, 0, 0, 0],
  [3, 0, 0, 0, 0, 0, 0, 0, 0],
  [4, 2, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 0, 0, 0, 0, 0, 0, 0],
  [4, 3, 2, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 0, 0, 0, 0, 0, 0],
  [4, 3, 3, 1, 0, 0, 0, 0, 0],
  [4, 3, 3, 2, 0, 0, 0, 0, 0],
  [4, 3, 3, 3, 1, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 0, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 0, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 0, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 0],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

/** Half casters (paladin, ranger) get slots from level 2; third casters (Eldritch Knight, Arcane Trickster) from level 3. */
function derivedTable(divisor: number, firstLevel: number): number[][] {
  return Array.from({ length: 21 }, (_, lvl) =>
    lvl < firstLevel ? FULL_CASTER[0].slice() : FULL_CASTER[Math.ceil(lvl / divisor)].slice(),
  );
}

/** Spell slots per class level (index 1–20) for single-class casters; each row lists slot levels 1–9. */
export const SPELL_SLOTS: Record<'full' | 'half' | 'third', number[][]> = {
  full: FULL_CASTER.map((row) => row.slice()),
  half: derivedTable(2, 2),
  third: derivedTable(3, 3),
};

/** Warlock Pact Magic by warlock level (index 1–20). */
export const PACT_SLOTS: Array<{ count: number; level: number }> = [
  { count: 0, level: 0 },
  { count: 1, level: 1 },
  { count: 2, level: 1 },
  { count: 2, level: 2 },
  { count: 2, level: 2 },
  { count: 2, level: 3 },
  { count: 2, level: 3 },
  { count: 2, level: 4 },
  { count: 2, level: 4 },
  { count: 2, level: 5 },
  { count: 2, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 3, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
  { count: 4, level: 5 },
];

/** Subclasses that make a non-caster class a third caster (id or PT-BR name, normalized). */
const THIRD_CASTER_SUBCLASSES = new Set(['eldritch-knight', 'arcane-trickster', 'cavaleiro arcano', 'trapaceiro arcano']);

/** Minimum class level at which each progression has the Spellcasting feature. */
const FIRST_CASTER_LEVEL = { full: 1, half: 2, third: 3 } as const;
const PROGRESSION_DIVISOR = { full: 1, half: 2, third: 3 } as const;

function rowToSlots(row: number[]): Record<string, number> {
  const slots: Record<string, number> = {};
  row.forEach((n, i) => {
    if (n > 0) slots[String(i + 1)] = n;
  });
  return slots;
}

/**
 * Spell slots for a (possibly multiclassed) character, following the SRD multiclass rules:
 * - one spellcasting class → that class's own table;
 * - two or more → caster level = full levels + ⌊half levels / 2⌋ + ⌊third levels / 3⌋ per class,
 *   looked up on the full caster table;
 * - warlock Pact Magic is tracked separately (`pact`) and never adds to the caster level.
 * Classes not found in `classData` (or without spellcasting) are ignored, except that an optional
 * `subclass` of Eldritch Knight / Arcane Trickster makes fighter/rogue levels a third caster.
 */
export function spellSlotsFor(
  classes: Array<{ id: string; level: number; subclass?: string | null }>,
  classData: ClassData[],
): { slots: Record<string, number>; pact: { count: number; level: number } | null } {
  const byId = new Map(classData.map((c) => [c.id, c]));
  const casters: Array<{ progression: 'full' | 'half' | 'third'; level: number }> = [];
  let warlockLevels = 0;

  for (const entry of classes) {
    const level = Math.min(20, Math.max(0, Math.floor(entry.level)));
    if (level <= 0) continue;
    const data = byId.get(entry.id);
    let progression = data?.spellcasting?.progression ?? null;
    if (!progression && entry.subclass && THIRD_CASTER_SUBCLASSES.has(entry.subclass.trim().toLowerCase())) {
      progression = 'third';
    }
    if (!progression) continue;
    if (progression === 'pact') {
      warlockLevels += level;
      continue;
    }
    // Only classes that already have the Spellcasting feature count toward multiclassing.
    if (level >= FIRST_CASTER_LEVEL[progression]) casters.push({ progression, level });
  }

  let slots: Record<string, number> = {};
  if (casters.length === 1) {
    const only = casters[0];
    slots = rowToSlots(SPELL_SLOTS[only.progression][only.level]);
  } else if (casters.length > 1) {
    const casterLevel = Math.min(
      20,
      casters.reduce((sum, c) => sum + Math.floor(c.level / PROGRESSION_DIVISOR[c.progression]), 0),
    );
    slots = rowToSlots(SPELL_SLOTS.full[casterLevel]);
  }

  const pact = warlockLevels > 0 ? { ...PACT_SLOTS[Math.min(20, warlockLevels)] } : null;
  return { slots, pact };
}

/** Number of cantrips known by class level for the core casters (0 if none). */
export const CANTRIPS_KNOWN: Record<string, number[]> = {
  bard: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  cleric: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  druid: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sorcerer: [0, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  warlock: [0, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  wizard: [0, 3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
};

/** Spells known by class level for "known" casters (prepared casters use mod + level instead). */
export const SPELLS_KNOWN: Record<string, number[]> = {
  bard: [0, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  ranger: [0, 0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  sorcerer: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

// ---------------------------------------------------------------------------
// Ability score generation
// ---------------------------------------------------------------------------

export const POINT_BUY: { total: number; min: number; max: number; costs: Record<number, number> } = {
  total: 27,
  min: 8,
  max: 15,
  costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
};

export const STANDARD_ARRAY: number[] = [15, 14, 13, 12, 10, 8];

/** Total point-buy cost of a set of base scores, or null if any score is out of range. */
export function pointBuyCost(scores: number[]): number | null {
  let total = 0;
  for (const s of scores) {
    const c = POINT_BUY.costs[s];
    if (c === undefined) return null;
    total += c;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Carrying capacity
// ---------------------------------------------------------------------------

const SIZE_CARRY_MULTIPLIER: Record<string, number> = {
  tiny: 0.5,
  small: 1,
  medium: 1,
  large: 2,
  huge: 4,
  gargantuan: 8,
};

/** Carrying capacity in pounds: Strength × 15 (doubled per size category above Medium, halved for Tiny). */
export function carryingCapacity(str: number, size: string = 'medium'): number {
  return str * 15 * (SIZE_CARRY_MULTIPLIER[size] ?? 1);
}

/** Push, drag or lift limit in pounds: twice the carrying capacity. */
export function pushDragLift(str: number, size: string = 'medium'): number {
  return carryingCapacity(str, size) * 2;
}

/**
 * Variant encumbrance rule: over 5 × STR → encumbered (−10 ft), over 10 × STR → heavily
 * encumbered (−20 ft and disadvantage on STR/DEX/CON checks, attacks and saves).
 */
export function encumbrance(str: number, weight: number): 'none' | 'encumbered' | 'heavy' | 'over' {
  if (weight > carryingCapacity(str)) return 'over';
  if (weight > str * 10) return 'heavy';
  if (weight > str * 5) return 'encumbered';
  return 'none';
}

export const CARRYING = { carryingCapacity, pushDragLift, encumbrance };

// ---------------------------------------------------------------------------
// HP status for players
// ---------------------------------------------------------------------------

/** Descriptive HP status (what players see for NPCs when numbers are hidden). */
export function HP_STATUS(cur: number, max: number): { label: string; color: string } {
  if (max <= 0 || cur <= 0) return { label: 'Caído', color: '#616161' };
  const ratio = cur / max;
  if (ratio >= 1) return { label: 'Ileso', color: '#43a047' };
  if (ratio > 0.75) return { label: 'Arranhado', color: '#9ccc65' };
  if (ratio > 0.5) return { label: 'Ferido', color: '#fdd835' };
  if (ratio > 0.25) return { label: 'Muito ferido', color: '#fb8c00' };
  return { label: 'À beira da morte', color: '#e53935' };
}
