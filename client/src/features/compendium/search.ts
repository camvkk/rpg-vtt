// Accent-insensitive in-memory index over the whole compendium (+ quick rules), built lazily once.
import type { BackgroundData, ClassData, ConditionData, ItemData, Monster, RaceData, SpellData } from '@shared/data5e/types.ts';
import { MONSTERS as MONSTER_DATA } from '@shared/data5e/monsters/index.ts';
import { SPELLS } from '@shared/data5e/spells/index.ts';
import { ITEMS } from '@shared/data5e/items.ts';
import { CONDITIONS } from '@shared/data5e/conditions.ts';
import { RACES } from '@shared/data5e/races.ts';
import { CLASSES } from '@shared/data5e/classes.ts';
import { BACKGROUNDS } from '@shared/data5e/backgrounds.ts';
import { itemSubtitle, monsterSubtitle, norm, spellSubtitle } from './format.ts';
import { RULE_SECTIONS, ruleSearchText, type RuleSection } from './RulesReference.tsx';

/** Typed alias so a single import line depends on the (large) monster module. */
export const MONSTERS: Monster[] = MONSTER_DATA;

export type EntryKind = 'monster' | 'spell' | 'item' | 'condition' | 'rule' | 'race' | 'class' | 'background';

export const KIND_LABEL: Record<EntryKind, string> = {
  monster: 'Monstro',
  spell: 'Magia',
  item: 'Item',
  condition: 'Condição',
  rule: 'Regra',
  race: 'Raça',
  class: 'Classe',
  background: 'Antecedente',
};

export interface EntryRef {
  kind: EntryKind;
  id: string;
}

export interface Entry extends EntryRef {
  name: string;
  nameEn: string;
  sub: string;
  /** Normalised PT-BR name. */
  n: string;
  /** Normalised English name. */
  nEn: string;
  /** Normalised extra text (rule bodies, condition rules, subraces...) — matched with low rank. */
  x: string;
}

export const entryKey = (kind: EntryKind, id: string): string => `${kind}:${id}`;

interface Index {
  all: Entry[];
  byKey: Map<string, Entry>;
  monsters: Map<string, Monster>;
  spells: Map<string, SpellData>;
  items: Map<string, ItemData>;
  conditions: Map<string, ConditionData>;
  rules: Map<string, RuleSection>;
  races: Map<string, RaceData>;
  classes: Map<string, ClassData>;
  backgrounds: Map<string, BackgroundData>;
}

let index: Index | null = null;

const idToWords = (id: string): string => id.replace(/[-_]+/g, ' ');

function build(): Index {
  const all: Entry[] = [];
  const add = (kind: EntryKind, id: string, name: string, nameEn: string, sub: string, extra = ''): void => {
    all.push({ kind, id, name, nameEn, sub, n: norm(name), nEn: norm(nameEn), x: extra });
  };
  for (const m of MONSTERS) add('monster', m.id, m.name, m.nameEn, monsterSubtitle(m));
  for (const s of SPELLS) add('spell', s.id, s.name, s.nameEn, spellSubtitle(s));
  for (const it of ITEMS) add('item', it.id, it.name, it.nameEn, itemSubtitle(it));
  for (const c of CONDITIONS) {
    add('condition', c.id, c.name, idToWords(c.id), c.official ? 'Condição oficial' : 'Marcador da mesa', norm(c.rules.join(' ')));
  }
  for (const r of RULE_SECTIONS) add('rule', r.id, r.title, '', 'Regras rápidas', ruleSearchText(r));
  for (const r of RACES) add('race', r.id, r.name, idToWords(r.id), 'Raça', norm(r.subraces.map((s) => s.name).join(' ')));
  for (const c of CLASSES) add('class', c.id, c.name, idToWords(c.id), `Classe · d${c.hitDie}`, norm(c.subclasses.map((s) => s.name).join(' ')));
  for (const b of BACKGROUNDS) add('background', b.id, b.name, idToWords(b.id), 'Antecedente');

  return {
    all,
    byKey: new Map(all.map((e) => [entryKey(e.kind, e.id), e])),
    monsters: new Map(MONSTERS.map((m) => [m.id, m])),
    spells: new Map(SPELLS.map((s) => [s.id, s])),
    items: new Map(ITEMS.map((i) => [i.id, i])),
    conditions: new Map(CONDITIONS.map((c) => [c.id, c])),
    rules: new Map(RULE_SECTIONS.map((r) => [r.id, r])),
    races: new Map(RACES.map((r) => [r.id, r])),
    classes: new Map(CLASSES.map((c) => [c.id, c])),
    backgrounds: new Map(BACKGROUNDS.map((b) => [b.id, b])),
  };
}

export function getIndex(): Index {
  if (!index) index = build();
  return index;
}

export function getEntry(kind: EntryKind, id: string): Entry | undefined {
  return getIndex().byKey.get(entryKey(kind, id));
}

function isWordChar(ch: string | undefined): boolean {
  return !!ch && /[a-z0-9]/.test(ch);
}

/** 0 exact, 1 prefix, 2 word start, 3 substring, 4 all words present; null = no match. */
function keyScore(key: string, q: string, words: string[]): number | null {
  if (!key) return null;
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  let at = key.indexOf(q);
  let sub = false;
  while (at !== -1) {
    if (!isWordChar(key[at - 1])) return 2;
    sub = true;
    at = key.indexOf(q, at + 1);
  }
  if (sub) return 3;
  if (words.length > 1 && words.every((w) => key.includes(w))) return 4;
  return null;
}

export function scoreEntry(e: Entry, q: string, words: string[]): number | null {
  let best: number | null = null;
  const a = keyScore(e.n, q, words);
  if (a !== null) best = a;
  const b = keyScore(e.nEn, q, words);
  if (b !== null && (best === null || b + 0.5 < best)) best = b + 0.5;
  if (best === null && e.x && q.length >= 3 && words.every((w) => e.x.includes(w))) best = 6;
  return best;
}

/** Ranks `list` against an already-normalised query. Empty query returns the list unchanged. */
export function rankEntries(list: Entry[], q: string): Entry[] {
  if (!q) return list;
  const words = q.split(' ').filter(Boolean);
  const scored: Array<{ e: Entry; s: number }> = [];
  for (const e of list) {
    const s = scoreEntry(e, q, words);
    if (s !== null) scored.push({ e, s });
  }
  scored.sort((a, b) => a.s - b.s || a.e.name.length - b.e.name.length || a.e.name.localeCompare(b.e.name, 'pt-BR'));
  return scored.map((x) => x.e);
}
