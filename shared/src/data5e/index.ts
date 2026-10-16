// D&D 5e compendium (PT-BR). Content from SRD 5.1, CC-BY-4.0.
import type { SpellSchool } from './types.ts';
import { MONSTERS } from './monsters/index.ts';
import { SPELLS } from './spells/index.ts';
import { CONDITIONS } from './conditions.ts';
import { ITEMS, ITEM_CATEGORY_NAMES } from './items.ts';
import { RACES } from './races.ts';
import { CLASSES } from './classes.ts';
import { BACKGROUNDS } from './backgrounds.ts';
import { formatCr } from './tables.ts';

export type * from './types.ts';
export * from './skills.ts';
export * from './races.ts';
export * from './classes.ts';
export * from './backgrounds.ts';
export * from './items.ts';
export * from './tables.ts';
export * from './conditions.ts';
export * from './spells/index.ts';
export * from './monsters/index.ts';

// ---------------------------------------------------------------------------
// Compendium search
// ---------------------------------------------------------------------------

export type CompendiumKind = 'monster' | 'spell' | 'item' | 'condition' | 'race' | 'class' | 'background';

export const COMPENDIUM_KIND_LABELS: Record<CompendiumKind, string> = {
  monster: 'Monstro',
  spell: 'Magia',
  item: 'Item',
  condition: 'Condição',
  race: 'Raça',
  class: 'Classe',
  background: 'Antecedente',
};

export interface CompendiumHit {
  kind: CompendiumKind;
  id: string;
  name: string;
  subtitle: string;
}

export const SPELL_SCHOOL_NAMES: Record<SpellSchool, string> = {
  abjuration: 'Abjuração',
  conjuration: 'Conjuração',
  divination: 'Adivinhação',
  enchantment: 'Encantamento',
  evocation: 'Evocação',
  illusion: 'Ilusão',
  necromancy: 'Necromancia',
  transmutation: 'Transmutação',
};

/** Lowercase, accent-free, trimmed — for accent-insensitive comparisons. */
export function normalizeSearch(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

interface SearchKey {
  text: string;
  /** Added to the match score (secondary keys rank lower). */
  penalty: number;
  /** Subtitle override when this key is the best match (e.g. matched a subrace). */
  subtitle?: string;
}

interface SearchEntry extends CompendiumHit {
  keys: SearchKey[];
}

const idToEnglish = (id: string): string => id.replace(/[-_]+/g, ' ');

let index: SearchEntry[] | null = null;

function buildIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const add = (
    kind: CompendiumKind,
    id: string,
    name: string,
    nameEn: string,
    subtitle: string,
    extra: SearchKey[] = [],
  ): void => {
    entries.push({
      kind,
      id,
      name,
      subtitle,
      keys: [
        { text: normalizeSearch(name), penalty: 0 },
        { text: normalizeSearch(nameEn), penalty: 0.5 },
        ...extra.map((k) => ({ ...k, text: normalizeSearch(k.text) })),
      ],
    });
  };

  for (const m of MONSTERS) add('monster', m.id, m.name, m.nameEn, `${m.type} · ND ${formatCr(m.cr)}`);
  for (const s of SPELLS) {
    const school = SPELL_SCHOOL_NAMES[s.school] ?? s.school;
    add('spell', s.id, s.name, s.nameEn, s.level === 0 ? `Truque de ${school}` : `${school} de ${s.level}º nível`);
  }
  for (const it of ITEMS) {
    const cat = ITEM_CATEGORY_NAMES[it.category] ?? it.category;
    add('item', it.id, it.name, it.nameEn, it.rarity ? `${cat} · ${it.rarity}` : `${cat} · ${it.cost}`);
  }
  for (const c of CONDITIONS) add('condition', c.id, c.name, idToEnglish(c.id), c.official ? 'Condição' : 'Marcador');
  for (const r of RACES) {
    add(
      'race',
      r.id,
      r.name,
      idToEnglish(r.id),
      'Raça',
      r.subraces.flatMap((s) => [
        { text: s.name, penalty: 0.25, subtitle: `Raça · ${s.name}` },
        { text: idToEnglish(s.id), penalty: 0.75, subtitle: `Raça · ${s.name}` },
      ]),
    );
  }
  for (const c of CLASSES) {
    add(
      'class',
      c.id,
      c.name,
      idToEnglish(c.id),
      `Classe · d${c.hitDie}`,
      c.subclasses.flatMap((s) => [
        { text: s.name, penalty: 0.25, subtitle: `${c.subclassLabel} · ${s.name}` },
        { text: idToEnglish(s.id), penalty: 0.75, subtitle: `${c.subclassLabel} · ${s.name}` },
      ]),
    );
  }
  for (const b of BACKGROUNDS) add('background', b.id, b.name, idToEnglish(b.id), 'Antecedente');
  return entries;
}

function isWordChar(ch: string): boolean {
  return /[a-z0-9]/.test(ch);
}

/** 0 exact, 1 prefix, 2 word-start, 3 substring, 4 all words present; null = no match. */
function matchScore(key: string, query: string, words: string[]): number | null {
  if (!key) return null;
  if (key === query) return 0;
  if (key.startsWith(query)) return 1;
  let at = key.indexOf(query);
  let substring = false;
  while (at !== -1) {
    if (at === 0 || !isWordChar(key[at - 1])) return 2;
    substring = true;
    at = key.indexOf(query, at + 1);
  }
  if (substring) return 3;
  if (words.length > 1 && words.every((w) => key.includes(w))) return 4;
  return null;
}

/**
 * Accent-insensitive search over PT-BR and English names of the whole compendium.
 * Ranked by match quality (exact > prefix > word-start > substring > all words), PT-BR name
 * before English name, then shorter names first. An empty query lists entries alphabetically.
 */
export function searchCompendium(query: string, kinds?: CompendiumKind[], limit = 50): CompendiumHit[] {
  if (!index) index = buildIndex();
  const allowed = kinds && kinds.length > 0 ? new Set(kinds) : null;
  const q = normalizeSearch(query);
  const pool = allowed ? index.filter((e) => allowed.has(e.kind)) : index;

  if (!q) {
    return pool
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      .slice(0, limit)
      .map(({ kind, id, name, subtitle }) => ({ kind, id, name, subtitle }));
  }

  const words = q.split(' ').filter(Boolean);
  const scored: Array<{ hit: CompendiumHit; score: number }> = [];
  for (const e of pool) {
    let best: number | null = null;
    let subtitle = e.subtitle;
    for (const key of e.keys) {
      const s = matchScore(key.text, q, words);
      if (s === null) continue;
      const total = s + key.penalty;
      if (best === null || total < best) {
        best = total;
        subtitle = key.subtitle ?? e.subtitle;
      }
    }
    if (best !== null) scored.push({ hit: { kind: e.kind, id: e.id, name: e.name, subtitle }, score: best });
  }
  scored.sort(
    (a, b) => a.score - b.score || a.hit.name.length - b.hit.name.length || a.hit.name.localeCompare(b.hit.name, 'pt-BR'),
  );
  return scored.slice(0, limit).map((s) => s.hit);
}
