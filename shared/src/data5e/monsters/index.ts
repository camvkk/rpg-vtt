// SRD 5.1 monster compendium (PT-BR). Content from the System Reference Document 5.1, CC-BY-4.0.
import type { Monster } from '../types.ts';
import { MONSTERS_CR0_1 } from './cr0-1.ts';
import { MONSTERS_CR2_4 } from './cr2-4.ts';
import { MONSTERS_CR5_8 } from './cr5-8.ts';
import { MONSTERS_CR9_15 } from './cr9-15.ts';
import { MONSTERS_CR16PLUS } from './cr16plus.ts';

/** All monsters, sorted by challenge rating, then by PT-BR name. */
export const MONSTERS: Monster[] = [
  ...MONSTERS_CR0_1,
  ...MONSTERS_CR2_4,
  ...MONSTERS_CR5_8,
  ...MONSTERS_CR9_15,
  ...MONSTERS_CR16PLUS,
].sort((a, b) => a.cr - b.cr || a.name.localeCompare(b.name, 'pt-BR'));

export const MONSTERS_BY_ID: Record<string, Monster> = Object.fromEntries(MONSTERS.map((m) => [m.id, m]));
