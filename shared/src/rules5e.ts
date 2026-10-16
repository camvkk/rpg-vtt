// D&D 5e derived stats for character sheets and monsters.
import type { Ability, Attack, Character, SkillId } from './types.ts';
import type { Monster } from './data5e/types.ts';

export const ABILITY_LIST: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_SHORT: Record<Ability, string> = {
  str: 'FOR', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR',
};

export const ABILITY_NAME: Record<Ability, string> = {
  str: 'Força', dex: 'Destreza', con: 'Constituição', int: 'Inteligência', wis: 'Sabedoria', cha: 'Carisma',
};

export const SKILL_ABILITY: Record<SkillId, Ability> = {
  acrobatics: 'dex', animalHandling: 'wis', arcana: 'int', athletics: 'str', deception: 'cha', history: 'int',
  insight: 'wis', intimidation: 'cha', investigation: 'int', medicine: 'wis', nature: 'int', perception: 'wis',
  performance: 'cha', persuasion: 'cha', religion: 'int', sleightOfHand: 'dex', stealth: 'dex', survival: 'wis',
};

export const SKILL_NAME: Record<SkillId, string> = {
  acrobatics: 'Acrobacia', animalHandling: 'Adestrar Animais', arcana: 'Arcanismo', athletics: 'Atletismo',
  deception: 'Enganação', history: 'História', insight: 'Intuição', intimidation: 'Intimidação',
  investigation: 'Investigação', medicine: 'Medicina', nature: 'Natureza', perception: 'Percepção',
  performance: 'Atuação', persuasion: 'Persuasão', religion: 'Religião', sleightOfHand: 'Prestidigitação',
  stealth: 'Furtividade', survival: 'Sobrevivência',
};

export const SKILL_LIST = Object.keys(SKILL_ABILITY) as SkillId[];

export function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function profBonusForLevel(level: number): number {
  return Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4) + 2;
}

export function totalLevel(c: Pick<Character, 'classes'>): number {
  let l = 0;
  for (const k of c.classes) l += k.level;
  return Math.max(1, l);
}

export interface CharacterStats {
  level: number;
  prof: number;
  mods: Record<Ability, number>;
  saves: Record<Ability, number>;
  skills: Record<SkillId, number>;
  passive: { perception: number; investigation: number; insight: number };
  ac: number;
  initiative: number;
  spell: { ability: Ability; dc: number; attack: number } | null;
  hitDice: { die: number; count: number }[];
  hitDiceTotal: number;
  carryCapacity: number;
  carried: number;
}

function hasClass(c: Character, id: string): boolean {
  return c.classes.some((k) => k.id === id);
}

export function computeAC(c: Character, mods: Record<Ability, number>): number {
  if (c.ac.mode === 'manual') return c.ac.value + c.ac.bonus;
  let armorAc: number | null = null;
  let shield = 0;
  for (const item of c.inventory) {
    if (!item.equipped || !item.armor) continue;
    if (item.armor.type === 'shield') {
      shield = Math.max(shield, item.armor.base || 2);
      continue;
    }
    const dex = item.armor.dexCap === null ? mods.dex : Math.min(mods.dex, item.armor.dexCap);
    const value = item.armor.base + (item.armor.type === 'heavy' ? 0 : dex);
    armorAc = Math.max(armorAc ?? 0, value);
  }
  let base: number;
  if (armorAc !== null) base = armorAc;
  else if (hasClass(c, 'barbarian')) base = 10 + mods.dex + mods.con;
  else if (hasClass(c, 'monk') && shield === 0) base = 10 + mods.dex + mods.wis;
  else base = 10 + mods.dex;
  return base + shield + c.ac.bonus;
}

export function computeStats(c: Character): CharacterStats {
  const level = totalLevel(c);
  const prof = profBonusForLevel(level);
  const mods = {} as Record<Ability, number>;
  for (const a of ABILITY_LIST) mods[a] = mod(c.abilities[a]);
  // Exhaustion level 1+ gives disadvantage on checks — tracked in UI; not a flat modifier.
  const saves = {} as Record<Ability, number>;
  for (const a of ABILITY_LIST) saves[a] = mods[a] + (c.saveProfs.includes(a) ? prof : 0);
  const skills = {} as Record<SkillId, number>;
  for (const s of SKILL_LIST) {
    const p = c.skills[s] ?? 0;
    const bonus = p === 2 ? prof * 2 : p === 1 ? prof : c.jackOfAllTrades ? Math.floor(prof / 2) : 0;
    skills[s] = mods[SKILL_ABILITY[s]] + bonus;
  }
  const spell = c.spellcasting
    ? {
        ability: c.spellcasting.ability,
        dc: 8 + prof + mods[c.spellcasting.ability],
        attack: prof + mods[c.spellcasting.ability],
      }
    : null;
  const dice = new Map<number, number>();
  for (const k of c.classes) dice.set(k.hitDie, (dice.get(k.hitDie) ?? 0) + k.level);
  let carried = 0;
  for (const item of c.inventory) carried += item.weight * item.qty;
  return {
    level,
    prof,
    mods,
    saves,
    skills,
    passive: {
      perception: 10 + skills.perception,
      investigation: 10 + skills.investigation,
      insight: 10 + skills.insight,
    },
    ac: computeAC(c, mods),
    initiative: mods.dex + c.initiativeBonus + (c.jackOfAllTrades ? Math.floor(prof / 2) : 0),
    spell,
    hitDice: [...dice.entries()].sort((a, b) => b[0] - a[0]).map(([die, count]) => ({ die, count })),
    hitDiceTotal: level,
    carryCapacity: c.abilities.str * 15,
    carried: Math.round(carried * 10) / 10,
  };
}

/** Modifier the attack adds (to hit and damage). */
export function attackAbilityMod(c: Character, a: Attack, stats: CharacterStats): number {
  switch (a.ability) {
    case 'none': return 0;
    case 'spell': return stats.spell ? stats.mods[stats.spell.ability] : 0;
    case 'finesse': return Math.max(stats.mods.str, stats.mods.dex);
    default: return stats.mods[a.ability];
  }
}

export function attackToHit(c: Character, a: Attack, stats: CharacterStats): number {
  return attackAbilityMod(c, a, stats) + (a.proficient ? stats.prof : 0) + a.bonus;
}

export function attackSaveDc(c: Character, a: Attack, stats: CharacterStats): number | null {
  if (!a.save) return null;
  if (a.save.dc === 'spell') return stats.spell?.dc ?? 8 + stats.prof;
  return a.save.dc;
}

/** Damage formula with @mod/@prof/@level resolved. */
export function resolveFormula(formula: string, vars: Record<string, number>): string {
  return formula.replace(/@(\w+)/g, (_m, k: string) => {
    const v = vars[k];
    if (v === undefined) return '0';
    return v < 0 ? `(${v})` : String(v);
  }).replace(/\+\s*\((-\d+)\)/g, '$1');
}

export function characterVars(c: Character, stats: CharacterStats, abilityMod = 0): Record<string, number> {
  return {
    mod: abilityMod,
    prof: stats.prof,
    level: stats.level,
    str: stats.mods.str, dex: stats.mods.dex, con: stats.mods.con,
    int: stats.mods.int, wis: stats.mods.wis, cha: stats.mods.cha,
    spell: stats.spell ? stats.mods[stats.spell.ability] : 0,
  };
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

export function monsterSave(m: Monster, a: Ability): number {
  return m.saves[a] ?? mod(m.abilities[a]);
}

export function monsterSkill(m: Monster, s: SkillId): number {
  return m.skills[s] ?? mod(m.abilities[SKILL_ABILITY[s]]);
}

export function monsterInitiative(m: Monster): number {
  return mod(m.abilities.dex);
}

export const SIZE_CELLS: Record<string, number> = {
  tiny: 0.5, small: 1, medium: 1, large: 2, huge: 3, gargantuan: 4,
};

/** Descriptive HP status for players (when exact HP is hidden). */
export function hpStatus(cur: number, max: number): { label: string; color: string; pct: number } {
  if (max <= 0) return { label: 'Desconhecido', color: '#9ca3af', pct: 1 };
  const pct = cur / max;
  if (cur <= 0) return { label: 'Caído', color: '#6b7280', pct: 0 };
  if (pct >= 1) return { label: 'Ileso', color: '#22c55e', pct: 1 };
  if (pct > 0.75) return { label: 'Arranhado', color: '#84cc16', pct: 0.875 };
  if (pct > 0.5) return { label: 'Ferido', color: '#eab308', pct: 0.625 };
  if (pct > 0.25) return { label: 'Muito ferido', color: '#f97316', pct: 0.375 };
  return { label: 'À beira da morte', color: '#ef4444', pct: 0.125 };
}

export const DAMAGE_TYPE_NAME: Record<string, string> = {
  acid: 'ácido', bludgeoning: 'contundente', cold: 'frio', fire: 'fogo', force: 'energia', lightning: 'elétrico',
  necrotic: 'necrótico', piercing: 'perfurante', poison: 'veneno', psychic: 'psíquico', radiant: 'radiante',
  slashing: 'cortante', thunder: 'trovejante', healing: 'cura', none: '',
};

export const DAMAGE_TYPE_COLOR: Record<string, string> = {
  acid: '#a3e635', bludgeoning: '#a8a29e', cold: '#7dd3fc', fire: '#fb923c', force: '#c084fc', lightning: '#60a5fa',
  necrotic: '#4ade80', piercing: '#d6d3d1', poison: '#86efac', psychic: '#f472b6', radiant: '#fde047',
  slashing: '#e7e5e4', thunder: '#818cf8', healing: '#34d399', none: '#e5e7eb',
};
