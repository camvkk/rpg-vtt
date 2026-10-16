// Pure formatting helpers for the compendium (PT-BR labels, search normalisation, highlighting).
import type { CreatureSize, ItemData, Monster, SpellData, SpellSchool } from '@shared/data5e/types.ts';
import type { DamagePart } from '@shared/types.ts';
import { DAMAGE_TYPE_NAME } from '@shared/rules5e.ts';
import { formatCr } from '@shared/data5e/tables.ts';
import { ITEM_CATEGORY_NAMES } from '@shared/data5e/items.ts';

// ---------------------------------------------------------------------------
// Search normalisation
// ---------------------------------------------------------------------------

const MARKS = /[̀-ͯ]/g;

/** Lowercase, accent-free, single-spaced. */
export function norm(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Finds `query` (already normalised) inside `text` ignoring accents/case and returns the
 * [start, end) range in the ORIGINAL string, so the match can be highlighted.
 */
export function matchRange(text: string, query: string): [number, number] | null {
  if (!query) return null;
  let flat = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const n = text[i]!.normalize('NFD').replace(MARKS, '').toLowerCase();
    for (let k = 0; k < n.length; k++) {
      flat += n[k];
      map.push(i);
    }
  }
  const at = flat.indexOf(query);
  if (at < 0) return null;
  const start = map[at]!;
  const end = (map[at + query.length - 1] ?? text.length - 1) + 1;
  return [start, end];
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function fmtNum(n: number): string {
  return n.toLocaleString('pt-BR');
}

export function fmtWeight(lb: number): string {
  if (!lb) return '—';
  return `${lb.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} lb`;
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

/** All standard challenge ratings, in order. */
export const CR_STEPS: number[] = [0, 0.125, 0.25, 0.5, ...Array.from({ length: 30 }, (_, i) => i + 1)];

const SIZE_NAME: Record<CreatureSize, [string, string]> = {
  tiny: ['Miúdo', 'Miúda'],
  small: ['Pequeno', 'Pequena'],
  medium: ['Médio', 'Média'],
  large: ['Grande', 'Grande'],
  huge: ['Enorme', 'Enorme'],
  gargantuan: ['Imenso', 'Imensa'],
};

const FEMININE_TYPES = new Set(['besta', 'fera', 'monstruosidade', 'aberracao', 'planta', 'gosma', 'limo', 'fada', 'criatura']);

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** "Humanoide (goblinoide)" → "Humanoide". */
export function monsterTypeBase(type: string): string {
  const base = type.split('(')[0]!.trim();
  return capitalize(base);
}

export function sizeName(size: CreatureSize, type = ''): string {
  const first = norm(type.split(/[\s(]/)[0] ?? '');
  const pair = SIZE_NAME[size] ?? SIZE_NAME.medium;
  return FEMININE_TYPES.has(first) ? pair[1] : pair[0];
}

/** "Humanoide Pequeno (goblinoide), neutro e mau" — PT-BR statblock order. */
export function monsterTypeLine(m: Monster): string {
  const paren = m.type.indexOf('(');
  const base = (paren >= 0 ? m.type.slice(0, paren) : m.type).trim();
  const rest = paren >= 0 ? ` ${m.type.slice(paren).trim()}` : '';
  const size = sizeName(m.size, m.type);
  return `${capitalize(base)} ${size}${rest}${m.alignment ? `, ${m.alignment}` : ''}`;
}

export function monsterSubtitle(m: Monster): string {
  return `ND ${formatCr(m.cr)} · ${monsterTypeBase(m.type)}`;
}

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

export const SCHOOL_NAME: Record<SpellSchool, string> = {
  abjuration: 'Abjuração',
  conjuration: 'Conjuração',
  divination: 'Adivinhação',
  enchantment: 'Encantamento',
  evocation: 'Evocação',
  illusion: 'Ilusão',
  necromancy: 'Necromancia',
  transmutation: 'Transmutação',
};

export const SCHOOL_COLOR: Record<SpellSchool, string> = {
  abjuration: '#7cb4f5',
  conjuration: '#f0a43a',
  divination: '#a9b6ff',
  enchantment: '#f28cc6',
  evocation: '#f2704a',
  illusion: '#b99bff',
  necromancy: '#6fd69a',
  transmutation: '#e8cf5a',
};

export function spellLevelLabel(level: number): string {
  return level === 0 ? 'Truque' : `${level}º nível`;
}

export function spellSubtitle(s: SpellData): string {
  return `${spellLevelLabel(s.level)} · ${SCHOOL_NAME[s.school] ?? s.school}`;
}

export const AREA_NAME: Record<string, string> = {
  circle: 'Esfera',
  cone: 'Cone',
  line: 'Linha',
  square: 'Cubo',
  ring: 'Anel',
};

export function areaText(a: { kind: string; size: number; width?: number }): string {
  const name = AREA_NAME[a.kind] ?? a.kind;
  if (a.kind === 'circle' || a.kind === 'ring') return `${name} de ${a.size} pés de raio`;
  if (a.kind === 'line') return `${name} de ${a.size} × ${a.width ?? 5} pés`;
  return `${name} de ${a.size} pés`;
}

// ---------------------------------------------------------------------------
// Damage
// ---------------------------------------------------------------------------

export function damageTypeName(type: string): string {
  return DAMAGE_TYPE_NAME[type] ?? type;
}

export function damageText(d: DamagePart): string {
  const t = damageTypeName(d.type);
  return t ? `${d.formula} ${t}` : d.formula;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const ARMOR_TYPE_NAME = { light: 'Armadura leve', medium: 'Armadura média', heavy: 'Armadura pesada', shield: 'Escudo' } as const;

export function armorTypeName(t: keyof typeof ARMOR_TYPE_NAME): string {
  return ARMOR_TYPE_NAME[t];
}

export function armorAcText(a: NonNullable<ItemData['armor']>): string {
  if (a.type === 'shield') return `+${a.base}`;
  if (a.type === 'light' || a.dexCap === null) return `${a.base} + Des`;
  if (a.dexCap > 0) return `${a.base} + Des (máx. ${a.dexCap})`;
  return `${a.base}`;
}

export function weaponKindText(w: NonNullable<ItemData['weapon']>): string {
  return `${w.category === 'simple' ? 'Arma simples' : 'Arma marcial'} ${w.type === 'melee' ? 'corpo a corpo' : 'à distância'}`;
}

export function itemSubtitle(it: ItemData): string {
  if (it.weapon) {
    const w = it.weapon;
    const dmg = w.damage.type === 'none' ? 'especial' : damageText(w.damage);
    return `${w.category === 'simple' ? 'Arma simples' : 'Arma marcial'} · ${dmg}`;
  }
  if (it.armor) {
    if (it.armor.type === 'shield') return `Escudo · ${armorAcText(it.armor)} CA`;
    return `${armorTypeName(it.armor.type)} · CA ${armorAcText(it.armor)}`;
  }
  const cat = ITEM_CATEGORY_NAMES[it.category] ?? it.category;
  if (it.rarity) return `${cat} · ${it.rarity}${it.attunement ? ' (sintonia)' : ''}`;
  return `${cat} · ${it.cost}`;
}
