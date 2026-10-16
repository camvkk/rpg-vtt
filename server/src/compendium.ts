import { MONSTERS_BY_ID } from '../../shared/src/data5e/monsters/index.ts';
import { SPELLS_BY_ID } from '../../shared/src/data5e/spells/index.ts';
import type { Monster, SpellData } from '../../shared/src/data5e/types.ts';

export const compendium = {
  monster(id: string): Monster | undefined {
    return Object.prototype.hasOwnProperty.call(MONSTERS_BY_ID, id) ? MONSTERS_BY_ID[id] : undefined;
  },
  spell(id: string): SpellData | undefined {
    return Object.prototype.hasOwnProperty.call(SPELLS_BY_ID, id) ? SPELLS_BY_ID[id] : undefined;
  },
};
