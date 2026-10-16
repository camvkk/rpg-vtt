// Pure helpers to build sheet data from the compendium: weapon attacks, inventory entries, features,
// spell slots, level-up patches and the PT-BR starting-equipment parser used by the wizard.
// Item/spell lists are passed in (never imported statically) so the sheet stays light.
import type { Ability, Attack, Character, ClassLevel, Feature, InventoryItem, Spellcasting } from '@shared/types.ts';
import type { ClassFeature, ItemData } from '@shared/data5e/types.ts';
import { CLASSES, CLASSES_BY_ID, classFeaturesUpTo, resolveUses } from '@shared/data5e/classes.ts';
import { spellSlotsFor } from '@shared/data5e/tables.ts';
import { computeStats, mod } from '@shared/rules5e.ts';
import { norm, uid } from './common.tsx';

// ---------------------------------------------------------------------------
// Weapons → attacks
// ---------------------------------------------------------------------------

const PREPOSITIONS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

function pluralizePhrase(phrase: string): string {
  const words = phrase.split(' ');
  let stop = false;
  return words.map((w) => {
    if (PREPOSITIONS.has(w)) stop = true;
    if (stop || w.endsWith('s')) return w;
    if (w.endsWith('ao')) return `${w.slice(0, -2)}oes`;
    if (w.endsWith('l')) return `${w.slice(0, -1)}is`;
    return `${w}s`;
  }).join(' ');
}

/** Heuristic: is the character proficient with this weapon given proficiency text (class + race traits)? */
export function weaponProficient(item: ItemData, profText: string): boolean {
  if (!item.weapon) return false;
  const t = norm(profText);
  if (item.weapon.category === 'simple' && t.includes('armas simples')) return true;
  if (item.weapon.category === 'martial' && t.includes('armas marciais')) return true;
  const n = norm(item.name);
  return t.includes(n) || t.includes(pluralizePhrase(n));
}

export function weaponAttack(item: ItemData, proficient: boolean): Attack {
  const w = item.weapon!;
  const finesse = w.properties.includes('acuidade');
  const ability: Attack['ability'] = finesse ? 'finesse' : w.type === 'ranged' ? 'dex' : 'str';
  let range = w.properties.includes('alcance') ? '10 pés' : '5 pés';
  if (w.type === 'ranged') range = w.range ?? '';
  else if (w.range) range = `${range} · arremesso ${w.range}`;
  const notes: string[] = [];
  if (w.versatile) notes.push(`Versátil: ${w.versatile} com duas mãos.`);
  const props = w.properties.filter((p) => p !== 'versátil');
  if (props.length) notes.push(`Propriedades: ${props.join(', ')}.`);
  return {
    id: uid(),
    name: item.name,
    ability,
    proficient,
    bonus: 0,
    damage: w.damage.type === 'none' ? [] : [{ formula: `${w.damage.formula}+@mod`, type: w.damage.type }],
    range: range.slice(0, 60),
    critOn: 20,
    notes: notes.join(' ').slice(0, 2000),
    save: null,
  };
}

export function inventoryFromItem(item: ItemData, qty = 1, equipped = false): InventoryItem {
  return {
    id: uid(),
    ref: item.id,
    name: item.name,
    qty,
    weight: item.weight,
    equipped,
    attuned: false,
    notes: '',
    armor: item.armor ? { base: item.armor.base, dexCap: item.armor.dexCap, type: item.armor.type } : null,
  };
}

// ---------------------------------------------------------------------------
// Features & spell slots
// ---------------------------------------------------------------------------

export function featureFrom(f: ClassFeature | { name: string; text: string }, source: string, ctx: { level: number; prof: number; mods: Record<Ability, number> }): Feature {
  let uses: Feature['uses'] = null;
  if ('uses' in f && f.uses) {
    const max = Math.max(0, Math.min(100, resolveUses(f.uses.max, ctx)));
    if (max > 0) uses = { max, used: 0, reset: f.uses.reset };
  } else if (!('level' in f)) {
    // Racial traits like "Resistência Implacável": once per long/short rest.
    const t = norm(f.text);
    if (/novamente ate (terminar|completar) um descanso (curto ou )?longo/.test(t)) {
      uses = { max: 1, used: 0, reset: /descanso curto ou longo/.test(t) ? 'short' : 'long' };
    }
  }
  return { id: uid(), name: f.name.slice(0, 120), source: source.slice(0, 80), text: f.text, uses };
}

export function slotsFor(classes: ClassLevel[], prev?: Spellcasting | null): Pick<Spellcasting, 'slots' | 'pact'> {
  const out = spellSlotsFor(classes.map((k) => ({ id: k.id, level: k.level, subclass: k.subclass })), CLASSES);
  const slots: Spellcasting['slots'] = {};
  for (const [lvl, max] of Object.entries(out.slots)) {
    const used = prev?.slots[lvl]?.used ?? 0;
    slots[lvl] = { max, used: Math.min(used, max) };
  }
  const pact = out.pact && out.pact.count > 0
    ? { max: out.pact.count, used: Math.min(prev?.pact?.used ?? 0, out.pact.count), level: Math.max(1, out.pact.level) }
    : null;
  return { slots, pact };
}

/** Spellcasting ability suggested by the character's classes (first caster class). */
export function casterAbility(classes: ClassLevel[]): Ability | null {
  for (const k of classes) {
    const sc = CLASSES_BY_ID[k.id]?.spellcasting;
    if (sc) return sc.ability;
  }
  return null;
}

export function classPrepares(classes: ClassLevel[]): boolean {
  return classes.some((k) => CLASSES_BY_ID[k.id]?.spellcasting?.prepares);
}

export function averageHpGain(hitDie: number, conScore: number): number {
  return Math.max(1, Math.floor(hitDie / 2) + 1 + mod(conScore));
}

/** Patch for leveling up the class at `index` (hp, features, uses, spell slots). */
export function levelUpPatch(c: Character, index: number, hpGain: number): Partial<Character> {
  const classes = c.classes.map((k, i) => (i === index ? { ...k, level: Math.min(20, k.level + 1) } : k));
  const k = classes[index]!;
  const next: Character = { ...c, classes };
  const stats = computeStats(next);
  const ctx = { level: k.level, prof: stats.prof, mods: stats.mods };
  const data = CLASSES_BY_ID[k.id];
  const features = c.features.map((f) => ({ ...f }));
  if (data) {
    const all = classFeaturesUpTo(k.id, k.level, k.subclass || null);
    for (const f of all) {
      const existing = features.find((x) => x.name === f.name);
      if (existing) {
        if (f.uses && existing.uses) {
          const max = Math.max(0, Math.min(100, resolveUses(f.uses.max, ctx)));
          if (max > 0) existing.uses = { ...existing.uses, max, used: Math.min(existing.uses.used, max) };
        }
        continue;
      }
      if (f.level === k.level) {
        const sub = data.subclasses.find((s) => s.id === k.subclass || s.name === k.subclass);
        const fromSub = sub?.features.includes(f);
        features.push(featureFrom(f, fromSub ? sub!.name : data.name, ctx));
      }
    }
  }
  const patch: Partial<Character> = {
    classes,
    hp: { ...c.hp, max: Math.max(1, c.hp.max + hpGain), cur: Math.max(0, c.hp.cur) + hpGain },
    features,
  };
  const hasCasting = classes.some((x) => CLASSES_BY_ID[x.id]?.spellcasting);
  if (c.spellcasting || hasCasting) {
    const { slots, pact } = slotsFor(classes, c.spellcasting);
    const ability = c.spellcasting?.ability ?? casterAbility(classes) ?? 'int';
    patch.spellcasting = { ability, spells: c.spellcasting?.spells ?? [], slots, pact };
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Starting equipment parser (PT-BR strings from classes/backgrounds)
// ---------------------------------------------------------------------------

export type AnyFilter = 'simple' | 'martial' | 'simple-melee' | 'martial-melee' | 'instrument' | 'arcane-focus' | 'druidic-focus' | 'holy-symbol';

export type EquipEntry =
  | { kind: 'item'; item: ItemData; qty: number }
  | { kind: 'custom'; name: string; qty: number }
  | { kind: 'any'; filter: AnyFilter; label: string }
  | { kind: 'coins'; coin: 'pp' | 'gp' | 'ep' | 'sp' | 'cp'; amount: number };

export const ANY_LABEL: Record<AnyFilter, string> = {
  simple: 'Arma simples',
  martial: 'Arma marcial',
  'simple-melee': 'Arma simples corpo a corpo',
  'martial-melee': 'Arma marcial corpo a corpo',
  instrument: 'Instrumento musical',
  'arcane-focus': 'Foco arcano',
  'druidic-focus': 'Foco druídico',
  'holy-symbol': 'Símbolo sagrado',
};

const INSTRUMENTS = new Set(['bagpipes', 'drum', 'dulcimer', 'flute', 'lute', 'lyre', 'horn', 'pan-flute', 'shawm', 'viol']);

export function anyOptions(filter: AnyFilter, items: ItemData[]): ItemData[] {
  return items.filter((it) => {
    switch (filter) {
      case 'simple': return it.weapon?.category === 'simple' && !it.rarity;
      case 'martial': return it.weapon?.category === 'martial' && !it.rarity;
      case 'simple-melee': return it.weapon?.category === 'simple' && it.weapon.type === 'melee' && !it.rarity;
      case 'martial-melee': return it.weapon?.category === 'martial' && it.weapon.type === 'melee' && !it.rarity;
      case 'instrument': return INSTRUMENTS.has(it.id);
      case 'arcane-focus': return it.id.startsWith('arcane-focus');
      case 'druidic-focus': return it.id.startsWith('druidic-focus');
      case 'holy-symbol': return it.id.startsWith('holy-symbol');
      default: return false;
    }
  });
}

const NUMBER_WORDS: Record<string, number> = {
  um: 1, uma: 1, uns: 2, umas: 2, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
};

const ALIASES: Record<string, string> = {
  'escudo de madeira': 'shield',
  'livro de oracoes': 'book',
  'kit de herbalismo': 'herbalism-kit',
};

const COIN: Record<string, 'pp' | 'gp' | 'ep' | 'sp' | 'cp'> = { po: 'gp', pp: 'sp', pc: 'cp', pe: 'ep', pl: 'pp' };

function singularWord(w: string): string {
  if (w.length <= 3) return w;
  if (w.endsWith('oes')) return `${w.slice(0, -3)}ao`;
  if (w.endsWith('ais')) return `${w.slice(0, -2)}l`;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function singularPhrase(s: string): string {
  let stop = false;
  return s.split(' ').map((w) => {
    if (PREPOSITIONS.has(w)) stop = true;
    return stop ? w : singularWord(w);
  }).join(' ');
}

export interface ItemIndex {
  byName: Map<string, ItemData>;
  byId: Map<string, ItemData>;
}

export function buildItemIndex(items: ItemData[]): ItemIndex {
  const byName = new Map<string, ItemData>();
  const byId = new Map<string, ItemData>();
  for (const it of items) {
    byId.set(it.id, it);
    if (it.rarity) continue;
    const n = norm(it.name.replace(/\([^)]*\)/g, ''));
    if (!byName.has(n)) byName.set(n, it);
  }
  return { byName, byId };
}

export function matchItem(text: string, index: ItemIndex): ItemData | null {
  const s = norm(text).replace(/\s+/g, ' ');
  const alias = ALIASES[s];
  if (alias) return index.byId.get(alias) ?? null;
  return index.byName.get(s) ?? index.byName.get(singularPhrase(s)) ?? null;
}

function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Parse one equipment option ("Armadura de couro, qualquer arma simples e duas adagas") into entries. */
export function parseEquipment(text: string, index: ItemIndex): EquipEntry[] {
  const cleaned = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(/,\s*|\s+e\s+|\s+com\s+/i).map((p) => p.trim()).filter(Boolean);
  const out: EquipEntry[] = [];
  for (let raw of parts) {
    raw = raw.split(/\s+ou\s+/i)[0]!.trim();
    let n = norm(raw);
    let qty = 1;
    const q = /^(\d+|um|uma|uns|umas|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(.+)$/.exec(n);
    let display = raw;
    if (q) {
      qty = /^\d+$/.test(q[1]!) ? Number(q[1]) : NUMBER_WORDS[q[1]!] ?? 1;
      n = q[2]!;
      display = raw.split(/\s+/).slice(1).join(' ');
    }
    n = n.replace(/^(conjunto|jogo) de /, '');
    const coin = /^(\d+)\s*(po|pp|pc|pe|pl)$/.exec(n) ?? (q && /^(po|pp|pc|pe|pl)$/.test(n) ? [n, String(qty), n] : null);
    if (coin) {
      out.push({ kind: 'coins', coin: COIN[coin[2]!]!, amount: Number(coin[1]) });
      continue;
    }
    const anyWeapon = /^(qualquer\s+)?(outr[oa]s?\s+)?armas?\s+(simples|marcia(?:l|is))(\s+corpo a corpo)?$/.exec(n);
    if (anyWeapon) {
      const martial = anyWeapon[3]!.startsWith('marcia');
      const filter: AnyFilter = martial ? (anyWeapon[4] ? 'martial-melee' : 'martial') : anyWeapon[4] ? 'simple-melee' : 'simple';
      for (let i = 0; i < qty; i++) out.push({ kind: 'any', filter, label: ANY_LABEL[filter] });
      continue;
    }
    let special: AnyFilter | null = null;
    if (/instrumento musical/.test(n)) special = 'instrument';
    else if (/^foco arcano$/.test(n)) special = 'arcane-focus';
    else if (/^foco druidico$/.test(n)) special = 'druidic-focus';
    else if (/^simbolo sagrado$/.test(n)) special = 'holy-symbol';
    if (special) {
      for (let i = 0; i < qty; i++) out.push({ kind: 'any', filter: special, label: ANY_LABEL[special] });
      continue;
    }
    const item = matchItem(n, index);
    if (item) {
      const pack = /\((\d+)\)/.exec(item.name);
      let count = qty;
      if (pack) count = Math.max(1, Math.round(qty / Number(pack[1])));
      out.push({ kind: 'item', item, qty: count });
      continue;
    }
    out.push({ kind: 'custom', name: capitalize(display.trim()).slice(0, 120), qty });
  }
  return out;
}
