// Compêndio de magias do SRD 5.1 (CC-BY-4.0) em PT-BR.
import type { SpellData } from '../types.ts';
import { SPELLS_LEVEL_0_1 } from './level0-1.ts';
import { SPELLS_LEVEL_2_3 } from './level2-3.ts';
import { SPELLS_LEVEL_4_5 } from './level4-5.ts';
import { SPELLS_LEVEL_6_9 } from './level6-9.ts';

/** All SRD spells, sorted by level and then by PT-BR name. */
export const SPELLS: SpellData[] = [
  ...SPELLS_LEVEL_0_1,
  ...SPELLS_LEVEL_2_3,
  ...SPELLS_LEVEL_4_5,
  ...SPELLS_LEVEL_6_9,
].sort((a, b) => a.level - b.level || a.name.localeCompare(b.name, 'pt-BR'));

export const SPELLS_BY_ID: Record<string, SpellData> = Object.fromEntries(
  SPELLS.map((s) => [s.id, s]),
);

/** Spells on a class's list (class id in lowercase English, e.g. "wizard"), sorted by level then name. */
export function spellsForClass(classId: string): SpellData[] {
  const id = classId.trim().toLowerCase();
  return SPELLS.filter((s) => s.classes.includes(id));
}
