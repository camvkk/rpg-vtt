// Custom (homebrew) systems: turns whatever the AI (or an imported JSON) produced into a valid CustomSystem,
// and resolves sheet values and rolls the same way on the server (roll.custom) and the client (sheet display).
import { DiceError, parseFormula, roll } from './dice.ts';
import { CUSTOM_LIMITS, zCustomSystem } from './schemas.ts';
import type {
  Character, CustomClass, CustomEntry, CustomModifierRule, CustomRace, CustomResource, CustomRule, CustomSheet,
  CustomSkill, CustomStat, CustomSystem,
} from './types.ts';
import { isRecord, normalize } from './util.ts';

/** Variables every custom formula may use besides the stat keys. */
export const RESERVED_VARS = ['atr', 'valor', 'pericia', 'nivel'] as const;
export const DEFAULT_CHECK_FORMULA = '1d20+@atr';
export const DEFAULT_SKILL_FORMULA = '1d20+@atr+@pericia';

export const MODIFIER_LABEL: Record<CustomModifierRule, string> = {
  value: 'o próprio valor',
  dnd: '(valor − 10) ÷ 2, como no D&D',
  half: 'metade do valor',
};

export function statModifier(rule: CustomModifierRule, value: number): number {
  switch (rule) {
    case 'dnd': return Math.floor((value - 10) / 2);
    case 'half': return Math.floor(value / 2);
    default: return value;
  }
}

/**
 * Dice pools: "{@atr+@pericia}d10" rolls as many dice as the expression inside the braces (1–100).
 * The rest of the formula keeps its @variables for the dice roller.
 */
export function expandPools(formula: string, vars: Record<string, number>): string {
  return formula.replace(/\{([^{}]{1,80})\}/g, (_m, expr: string) => {
    if (/\d*d\d/i.test(expr)) throw new DiceError('Use só números e variáveis dentro de { }.');
    const n = roll(expr, { vars }).total;
    return String(Math.max(1, Math.min(100, Math.round(n))));
  });
}

// ---------------------------------------------------------------------------
// Sheet values
// ---------------------------------------------------------------------------

export function findCustomRace(system: CustomSystem, race: string): CustomRace | undefined {
  const n = normalize(race);
  if (!n) return undefined;
  return system.races.find((r) => normalize(r.name) === n || r.key === n);
}

export function findCustomClass(system: CustomSystem, name: string): CustomClass | undefined {
  const n = normalize(name);
  if (!n) return undefined;
  return system.classes.find((k) => normalize(k.name) === n || k.key === n);
}

export function customLevel(c: Pick<Character, 'classes'>): number {
  return Math.max(1, c.classes.reduce((s, k) => s + k.level, 0));
}

/** Stat value before the race bonus. */
export function customStatBase(system: CustomSystem, c: Pick<Character, 'custom'>, key: string): number {
  const stat = system.stats.find((s) => s.key === key);
  return c.custom?.stats[key] ?? stat?.default ?? 0;
}

export function customRaceBonus(system: CustomSystem, c: Pick<Character, 'race'>, key: string): number {
  return findCustomRace(system, c.race)?.statBonuses[key] ?? 0;
}

export function customStatValue(system: CustomSystem, c: Pick<Character, 'custom' | 'race'>, key: string): number {
  return customStatBase(system, c, key) + customRaceBonus(system, c, key);
}

/** Dice variables for a character: @<stat> = modifier, @nivel = level. */
export function customVars(system: CustomSystem, c: Pick<Character, 'custom' | 'race' | 'classes'>): Record<string, number> {
  const vars: Record<string, number> = { atr: 0, valor: 0, pericia: 0, nivel: customLevel(c) };
  for (const st of system.stats) vars[st.key] = statModifier(system.modifier, customStatValue(system, c, st.key));
  return vars;
}

export type CustomRollKind = 'stat' | 'skill' | 'equipment' | 'power' | 'mechanic';

export function entriesOfKind(system: CustomSystem, kind: 'equipment' | 'power' | 'mechanic'): CustomEntry[] {
  return kind === 'equipment' ? system.equipment : kind === 'power' ? system.powers : system.mechanics;
}

/** Formula, variables and card title for a roll from a custom sheet, or a PT-BR error. Throws DiceError on bad pools. */
export function customRoll(
  system: CustomSystem,
  c: Pick<Character, 'custom' | 'race' | 'classes'>,
  kind: CustomRollKind,
  key: string,
): { formula: string; vars: Record<string, number>; title: string } | string {
  const vars = customVars(system, c);
  if (kind === 'stat') {
    const st = system.stats.find((s) => s.key === key);
    if (!st) return 'Esse atributo não existe no sistema.';
    const v = { ...vars, atr: vars[st.key] ?? 0, valor: customStatValue(system, c, st.key) };
    return { formula: expandPools(system.checkFormula, v), vars: v, title: `Teste de ${st.name}` };
  }
  if (kind === 'skill') {
    const sk = system.skills.find((s) => s.key === key);
    if (!sk) return 'Essa perícia não existe no sistema.';
    const st = sk.stat ? system.stats.find((s) => s.key === sk.stat) : undefined;
    const v = {
      ...vars,
      atr: st ? vars[st.key] ?? 0 : 0,
      valor: st ? customStatValue(system, c, st.key) : 0,
      pericia: c.custom?.skills[sk.key] ?? 0,
    };
    return { formula: expandPools(system.skillFormula, v), vars: v, title: `Teste de ${sk.name}` };
  }
  const entry = entriesOfKind(system, kind).find((e) => e.key === key);
  if (!entry) return 'Isso não existe no sistema.';
  if (!entry.formula) return `${entry.name} não tem rolagem.`;
  return { formula: expandPools(entry.formula, vars), vars, title: entry.name };
}

/** Validate a formula the DM typed for this system. Returns a PT-BR error or null. */
export function checkCustomFormula(formula: string, system: Pick<CustomSystem, 'stats'>): string | null {
  const f = formula.trim();
  if (!f) return 'Informe uma fórmula.';
  if (f.length > 120) return 'Fórmula longa demais.';
  const vars = Object.fromEntries([...RESERVED_VARS, ...system.stats.map((s) => s.key)].map((v) => [v, 1]));
  try {
    const r = parseFormula(expandPools(f, vars), { vars });
    return r.ok ? null : r.error;
  } catch (e) {
    return e instanceof Error ? e.message : 'Fórmula inválida.';
  }
}

/** Human-readable formula: "1d20+@forca" → "1d20+FOR", "{@valor+@pericia}d10" → "(valor+perícia)d10". */
export function prettyFormula(formula: string, system: Pick<CustomSystem, 'stats'>): string {
  const names: Record<string, string> = { atr: 'atributo', valor: 'valor', pericia: 'perícia', nivel: 'nível' };
  for (const st of system.stats) names[st.key] = st.short || st.name;
  return formula
    .replace(/\{([^{}]*)\}/g, '($1)')
    .replace(/@([a-z_][a-z0-9_]*)/gi, (m, k: string) => names[k] ?? m)
    .replace(/([+\-*/])/g, ' $1 ')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

/** Sheet data for a system, keeping values the character already has. */
export function newCustomSheet(system: CustomSystem, prev?: CustomSheet | null): CustomSheet {
  const stats: Record<string, number> = {};
  for (const st of system.stats) stats[st.key] = prev?.stats[st.key] ?? st.default;
  const skills: Record<string, number> = {};
  for (const sk of system.skills) {
    const v = prev?.skills[sk.key];
    if (v) skills[sk.key] = v;
  }
  const resources: CustomSheet['resources'] = {};
  for (const r of system.resources) resources[r.key] = prev?.resources[r.key] ?? { cur: r.max, max: r.max };
  return { stats, skills, resources };
}

// ---------------------------------------------------------------------------
// Normalization (AI output / imported JSON → CustomSystem)
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

function str(v: unknown, max: number): string {
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim().slice(0, max);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
}

/** Like str() but keeps line breaks (descriptions, rules). */
function text(v: unknown, max: number): string {
  if (Array.isArray(v)) return text(v.map((x) => str(x, max)).filter(Boolean).join('\n'), max);
  if (typeof v !== 'string') return str(v, max);
  return v.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /[+-]?\d+(?:[.,]\d+)?/.exec(v);
    if (m) {
      const n = Number(m[0].replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = num(v);
  return Math.min(max, Math.max(min, Math.round(n ?? fallback)));
}

/** First present field among aliases. */
function pick(r: Rec, ...keys: string[]): unknown {
  for (const k of keys) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k];
  return undefined;
}

/** Arrays or keyed objects → list of records (object keys kept as __key; bare strings go to `field`). */
function entriesOf(v: unknown, field = 'name'): Rec[] {
  const wrap = (x: unknown, key?: string): Rec | null => {
    if (isRecord(x)) return key === undefined ? x : { __key: key, ...x };
    if (typeof x === 'string' || typeof x === 'number') {
      const base: Rec = key === undefined ? {} : { __key: key, name: key };
      return { ...base, [field]: x };
    }
    return null;
  };
  if (Array.isArray(v)) return v.map((x) => wrap(x)).filter((x): x is Rec => !!x);
  if (isRecord(v)) return Object.entries(v).map(([k, x]) => wrap(x, k)).filter((x): x is Rec => !!x);
  if (typeof v === 'string' && v.trim()) return v.split(/\n|;/).map((s) => wrap(s.trim())).filter((x): x is Rec => !!x && !!str(x[field], 1));
  return [];
}

function stringList(v: unknown, max: number, itemMax: number): string[] {
  const out: string[] = [];
  const items = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/\n|;|•/) : isRecord(v) ? Object.entries(v).map(([k, x]) => ({ name: k, description: x })) : [];
  for (const x of items) {
    let s = '';
    if (isRecord(x)) {
      const name = str(pick(x, 'name', 'nome', 'title', 'titulo'), 120);
      const level = num(pick(x, 'level', 'nivel'));
      const d = str(pick(x, 'description', 'descricao', 'desc', 'effect', 'efeito'), itemMax);
      s = [level !== null ? `Nível ${level}:` : '', name, d && name ? `— ${d}` : d].filter(Boolean).join(' ');
    } else {
      s = str(x, itemMax);
    }
    s = s.replace(/^[-*•]\s*/, '').slice(0, itemMax);
    if (s) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

export function slugKey(s: string): string {
  let k = normalize(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (!k) return '';
  if (!/^[a-z]/.test(k)) k = `k_${k}`;
  return k.slice(0, 24).replace(/_+$/, '');
}

/** Keeps keys unique (and away from reserved variables). */
class KeyMaker {
  private taken = new Set<string>();
  constructor(reserved: readonly string[] = []) {
    for (const r of reserved) this.taken.add(r);
  }
  make(...candidates: unknown[]): string {
    let base = '';
    for (const c of candidates) {
      base = slugKey(str(c, 80));
      if (base) break;
    }
    if (!base) base = 'item';
    let k = base;
    for (let i = 2; this.taken.has(k); i++) k = `${base.slice(0, 24 - String(i).length - 1)}_${i}`;
    this.taken.add(k);
    return k;
  }
}

function modifierRule(v: unknown, stats: Rec[]): CustomModifierRule {
  const s = normalize(str(v, 60));
  if (s) {
    if (/dnd|d&d|5e|-\s*10|10\)\s*\/\s*2/.test(s)) return 'dnd';
    if (/half|metade|\/\s*2/.test(s)) return 'half';
    if (/value|valor|direto|proprio|igual/.test(s)) return 'value';
  }
  // Heuristic: scores centred on 10 with a ceiling of 18+ are D&D-like.
  const defaults = stats.map((x) => num(pick(x, 'default', 'padrao', 'inicial', 'start'))).filter((n): n is number => n !== null);
  const maxes = stats.map((x) => num(pick(x, 'max', 'maximo'))).filter((n): n is number => n !== null);
  if (defaults.length && defaults.every((d) => d === 10) && maxes.some((m) => m >= 18)) return 'dnd';
  return 'value';
}

function range(r: Rec): [number | null, number | null] {
  const raw = str(pick(r, 'range', 'faixa', 'intervalo'), 40);
  const m = /(-?\d+)\s*(?:-|–|a|até|ate|to|\.\.)\s*(-?\d+)/i.exec(raw);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}

interface Resolver {
  get(v: unknown): string | null;
}

function resolverFor(items: { key: string; name: string; short?: string }[], extra: Record<string, string> = {}): Resolver {
  const map = new Map<string, string>();
  for (const [alias, key] of Object.entries(extra)) map.set(alias, key);
  for (const it of items) {
    map.set(it.key, it.key);
    map.set(normalize(it.name), it.key);
    if (it.short) map.set(normalize(it.short), it.key);
    const slug = slugKey(it.name);
    if (slug) map.set(slug, it.key);
  }
  return {
    get: (v) => {
      const s = normalize(str(v, 80)).replace(/^@/, '');
      if (!s) return null;
      return map.get(s) ?? map.get(slugKey(s)) ?? null;
    },
  };
}

/** Resolve a list of references ("FOR, VIT", ["Força"], [{name}]) to unique keys. */
function refs(v: unknown, res: Resolver): string[] {
  const items: unknown[] = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;/\n]|\se\s/) : isRecord(v) ? Object.keys(v) : [];
  const out = new Set<string>();
  for (const x of items) {
    const k = res.get(isRecord(x) ? pick(x, 'key', 'name', 'nome') : x);
    if (k) out.add(k);
  }
  return [...out];
}

/** D&D-style ability keys the AI may use for any system. */
const DND_ALIASES: Record<string, string[]> = {
  str: ['forca', 'strength', 'for'], dex: ['destreza', 'dexterity', 'des', 'agilidade'], con: ['constituicao', 'constitution', 'vigor'],
  int: ['inteligencia', 'intelligence', 'intelecto'], wis: ['sabedoria', 'wisdom', 'sab'], cha: ['carisma', 'charisma', 'car'],
};

function formulaAliases(stats: CustomStat[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const st of stats) {
    for (const a of [st.key, normalize(st.name), normalize(st.short), slugKey(st.name)]) if (a) m.set(a, st.key);
  }
  for (const [en, pts] of Object.entries(DND_ALIASES)) {
    const target = [en, ...pts].map((a) => m.get(a)).find(Boolean);
    if (target) for (const a of [en, ...pts]) if (!m.has(a)) m.set(a, target);
  }
  for (const a of ['mod', 'modificador', 'atributo', 'atr', 'attribute', 'ability', 'stat']) if (!m.has(a)) m.set(a, 'atr');
  for (const a of ['pericia', 'skill', 'pericias', 'treino', 'rank', 'ranks']) if (!m.has(a)) m.set(a, 'pericia');
  for (const a of ['nivel', 'level', 'nv', 'lvl']) if (!m.has(a)) m.set(a, 'nivel');
  for (const a of ['valor', 'value']) if (!m.has(a)) m.set(a, 'valor');
  return m;
}

const WORD = /@?[A-Za-zÀ-ÖØ-öø-ÿ_][A-Za-zÀ-ÖØ-öø-ÿ0-9_]*/g;

/** Make a formula from free text: "1d20 + FOR" → "1d20+@forca". Returns null when nothing rollable remains. */
export function normalizeFormula(raw: unknown, aliases: Map<string, string>, varNames: string[]): string | null {
  let f = str(raw, 200);
  if (!f) return null;
  f = f.replace(/[−–—]/g, '-').replace(/×/g, '*').replace(/÷/g, '/').replace(/(\d)\s*[dD]\s*(\d|%)/g, '$1d$2');
  f = f.replace(WORD, (w: string, offset: number, all: string) => {
    const at = w.startsWith('@');
    const bare = at ? w.slice(1) : w;
    const prev = all[offset - 1];
    // Dice syntax right after a number or ")" (1d20, 4d6kh3, 2d10!) and a bare "d20" stay as written.
    if (!at && prev && /[\d)}%]/.test(prev)) return w;
    if (!at && /^d(\d+|%)$/i.test(bare)) return w.toLowerCase();
    const target = aliases.get(normalize(bare)) ?? aliases.get(slugKey(bare));
    return target ? `@${target}` : w;
  });
  // Pools written as "@valor d6" or "(@atr+@pericia)d10" become "{...}d6" (see expandPools).
  f = f
    .replace(/\(([^()]*@[^()]*)\)\s*d(\d|%)/gi, '{$1}d$2')
    .replace(/(@[a-z_][a-z0-9_]*)\s*d(\d|%)/gi, (m: string, v: string, d: string) => (varNames.includes(v.slice(1)) ? `{${v}}d${d}` : m));
  const vars = Object.fromEntries(varNames.map((v) => [v, 1]));
  const ok = (x: string) => {
    if (!x || x.length > 120) return false;
    try {
      return parseFormula(expandPools(x, vars), { vars }).ok;
    } catch {
      return false;
    }
  };
  const compact = f.replace(/\s+/g, '');
  if (ok(compact)) return compact;
  // Salvage the first dice expression ("2d6 (fogo)", "1d20 + @forca contra a dificuldade").
  const spaced = f.replace(/\s*([+\-*/])\s*/g, '$1');
  const die = String.raw`(?:\{[^{}]*\}|\d*)d(?:\d+|%)`;
  const m = new RegExp(String.raw`${die}(?:[+\-*](?:\d+|@[a-z_][a-z0-9_]*\b|${die}))*`, 'i').exec(spaced);
  if (m && ok(m[0])) return m[0];
  return /^\d+$/.test(compact) ? compact : null;
}

export interface NormalizeResult {
  system: CustomSystem;
  warnings: string[];
}

function capped<T>(list: T[], max: number, what: string, warnings: string[]): T[] {
  if (list.length > max) warnings.push(`Só os primeiros ${max} ${what} foram mantidos (havia ${list.length}).`);
  return list.slice(0, max);
}

/** Accepts the importer's JSON shape plus the variations models (and v1 exports) tend to produce. */
export function normalizeCustomSystem(input: unknown, opts: { sources?: string[]; now?: number } = {}): NormalizeResult | { error: string } {
  let raw: unknown = input;
  if (isRecord(raw) && isRecord(raw.system) && !raw.stats && !raw.atributos) raw = raw.system;
  if (isRecord(raw) && isRecord(raw.sistema)) raw = raw.sistema;
  if (!isRecord(raw)) return { error: 'A resposta não é um sistema válido (esperava um objeto JSON).' };
  const r = raw;
  const warnings: string[] = [];

  // Stats -------------------------------------------------------------------
  const statRecs = entriesOf(pick(r, 'stats', 'attributes', 'atributos', 'abilities'));
  const modifier = modifierRule(pick(r, 'modifier', 'attributeModifier', 'modificador', 'modifierRule'), statRecs);
  const statKeys = new KeyMaker(RESERVED_VARS);
  const stats: CustomStat[] = capped(statRecs, CUSTOM_LIMITS.stats, 'atributos', warnings).flatMap((x) => {
    const name = str(pick(x, 'name', 'nome', 'title'), 80) || str(x.__key, 80);
    if (!name) return [];
    const [rMin, rMax] = range(x);
    let min = int(pick(x, 'min', 'minimo') ?? rMin, modifier === 'dnd' ? 1 : 0, -1000, 1000);
    let max = int(pick(x, 'max', 'maximo') ?? rMax, modifier === 'dnd' ? 30 : Math.max(min + 1, 10), -1000, 1000);
    if (min > max) [min, max] = [max, min];
    const def = int(pick(x, 'default', 'padrao', 'inicial', 'start', 'base'), modifier === 'dnd' ? 10 : min, min, max);
    const short = (str(pick(x, 'short', 'abbr', 'abreviacao', 'sigla', 'abbreviation'), 6) || name.slice(0, 3)).toUpperCase();
    return [{
      key: statKeys.make(x.key, x.__key, name),
      name,
      short,
      description: text(pick(x, 'description', 'descricao', 'desc'), 1_500),
      min,
      max,
      default: def,
    }];
  });
  const statRes = resolverFor(stats, Object.fromEntries(
    Object.entries(DND_ALIASES).flatMap(([en, pts]) => {
      const target = stats.find((s) => [en, ...pts].includes(s.key) || [en, ...pts].includes(normalize(s.short)) || [en, ...pts].includes(slugKey(s.name)));
      return target ? [en, ...pts].map((a) => [a, target.key] as const) : [];
    }),
  ));

  // Skills ------------------------------------------------------------------
  const skillKeys = new KeyMaker();
  const skills: CustomSkill[] = capped(entriesOf(pick(r, 'skills', 'pericias', 'perícias')), CUSTOM_LIMITS.skills, 'perícias', warnings).flatMap((x) => {
    const name = str(pick(x, 'name', 'nome'), 80) || str(x.__key, 80);
    if (!name) return [];
    return [{
      key: skillKeys.make(x.key, x.__key, name),
      name,
      stat: statRes.get(pick(x, 'stat', 'ability', 'attribute', 'atributo', 'baseStat')),
      description: text(pick(x, 'description', 'descricao', 'desc'), 1_500),
    }];
  });
  const skillRes = resolverFor(skills);

  if (!stats.length && !skills.length) {
    return { error: 'Não encontrei atributos nem perícias no documento — confira se o texto descreve as regras do personagem.' };
  }

  // Resources ---------------------------------------------------------------
  const resKeys = new KeyMaker(stats.map((s) => s.key));
  const resources: CustomResource[] = capped(entriesOf(pick(r, 'resources', 'recursos', 'pools')), CUSTOM_LIMITS.resources, 'recursos', warnings).flatMap((x) => {
    const name = str(pick(x, 'name', 'nome'), 40) || str(x.__key, 40);
    if (!name) return [];
    return [{
      key: resKeys.make(x.key, x.__key, name),
      name,
      max: int(pick(x, 'max', 'maximo', 'default', 'inicial'), 10, 0, 100_000),
      description: text(pick(x, 'description', 'descricao', 'desc', 'formula'), 1_500),
    }];
  });

  // Races -------------------------------------------------------------------
  const bonusesOf = (v: unknown): Record<string, number> => {
    const out: Record<string, number> = {};
    const add = (stat: unknown, val: unknown) => {
      const k = statRes.get(stat);
      const n = num(val);
      if (k && n !== null && n !== 0) out[k] = Math.max(-100, Math.min(100, Math.round((out[k] ?? 0) + n)));
    };
    if (isRecord(v)) for (const [k, x] of Object.entries(v)) add(k, x);
    else if (Array.isArray(v)) {
      for (const x of v) {
        if (isRecord(x)) add(pick(x, 'stat', 'atributo', 'attribute', 'ability', 'name'), pick(x, 'value', 'valor', 'bonus', 'mod'));
        else if (typeof x === 'string') for (const [k, n] of Object.entries(bonusesOf(x))) add(k, n);
      }
    } else if (typeof v === 'string') {
      for (const m of v.matchAll(/([+-]\s*\d+)\s*(?:em\s+|de\s+|in\s+)?([A-Za-zÀ-ÿ_]+)|([A-Za-zÀ-ÿ_]+)\s*([+-]\s*\d+)/g)) {
        if (m[1]) add(m[2], m[1].replace(/\s/g, ''));
        else add(m[3], m[4]!.replace(/\s/g, ''));
      }
    }
    return out;
  };
  const raceKeys = new KeyMaker();
  const races: CustomRace[] = capped(entriesOf(pick(r, 'races', 'racas', 'raças', 'ancestries', 'ancestralidades', 'especies', 'origins')), CUSTOM_LIMITS.races, 'raças', warnings).flatMap((x) => {
    const name = str(pick(x, 'name', 'nome'), 80) || str(x.__key, 80);
    if (!name) return [];
    return [{
      key: raceKeys.make(x.key, x.__key, name),
      name,
      description: text(pick(x, 'description', 'descricao', 'desc'), 1_500),
      statBonuses: bonusesOf(pick(x, 'statBonuses', 'bonuses', 'bonus', 'modificadores', 'modifiers', 'abilityBonuses')),
      traits: stringList(pick(x, 'traits', 'tracos', 'traços', 'habilidades', 'features'), CUSTOM_LIMITS.traits, 300),
    }];
  });

  // Classes -----------------------------------------------------------------
  const classKeys = new KeyMaker();
  const classes: CustomClass[] = capped(entriesOf(pick(r, 'classes', 'classe', 'profissoes', 'arquetipos', 'archetypes')), CUSTOM_LIMITS.classes, 'classes', warnings).flatMap((x) => {
    const name = str(pick(x, 'name', 'nome'), 80) || str(x.__key, 80);
    if (!name) return [];
    const die = str(pick(x, 'hitDie', 'dadoDeVida', 'dado_de_vida', 'hit_die', 'hd'), 12);
    const dieN = /d\s*(\d+)/i.exec(die)?.[1] ?? (num(die) !== null ? String(num(die)) : '0');
    return [{
      key: classKeys.make(x.key, x.__key, name),
      name,
      description: text(pick(x, 'description', 'descricao', 'desc'), 1_500),
      hitDie: Math.max(0, Math.min(100, Math.round(Number(dieN)))),
      primaryStats: refs(pick(x, 'primaryStats', 'atributosPrincipais', 'mainStats', 'primary'), statRes),
      skills: refs(pick(x, 'skills', 'classSkills', 'pericias'), skillRes),
      features: stringList(pick(x, 'features', 'level1Features', 'habilidades', 'abilities', 'poderes'), CUSTOM_LIMITS.features, 300),
    }];
  });

  // Entries (equipment / powers / mechanics) -----------------------------------
  const aliases = formulaAliases(stats);
  const varNames = [...RESERVED_VARS, ...stats.map((s) => s.key)];
  let lostFormulas = 0;
  const formulaOf = (x: Rec, ...fields: string[]): string | null => {
    const rawF = pick(x, ...fields);
    if (rawF === undefined) return null;
    const f = normalizeFormula(rawF, aliases, varNames);
    if (!f) lostFormulas++;
    return f;
  };
  const entries = (v: unknown, max: number, what: string, map: (x: Rec) => Omit<CustomEntry, 'key' | 'name'>): CustomEntry[] => {
    const keys = new KeyMaker();
    return capped(entriesOf(v), max, what, warnings).flatMap((x) => {
      const name = str(pick(x, 'name', 'nome'), 80) || str(x.__key, 80);
      if (!name) return [];
      return [{ key: keys.make(x.key, x.__key, name), name, ...map(x) }];
    });
  };
  const listText = (v: unknown, max: number) => (Array.isArray(v) ? v.map((p) => str(p, 60)).filter(Boolean).join(', ') : str(v, max)).slice(0, max);

  const equipment = entries(pick(r, 'equipment', 'equipamentos', 'equipamento', 'items', 'itens'), CUSTOM_LIMITS.equipment, 'itens', (x) => ({
    tag: str(pick(x, 'type', 'tipo', 'category', 'categoria'), 60),
    detail: [listText(pick(x, 'properties', 'propriedades'), 160), str(pick(x, 'cost', 'custo', 'preco', 'price'), 40)].filter(Boolean).join(' · ').slice(0, 200),
    description: text(pick(x, 'description', 'descricao', 'desc'), 1_500),
    formula: formulaOf(x, 'damage', 'dano', 'formula', 'dice', 'dados', 'roll'),
  }));

  const powers = entries(pick(r, 'powers', 'spells', 'magias', 'poderes', 'tecnicas', 'abilities'), CUSTOM_LIMITS.powers, 'poderes', (x) => {
    const lv = pick(x, 'level', 'nivel', 'circle', 'circulo', 'tier', 'rank');
    const lvNum = typeof lv === 'number' ? lv : null;
    return {
      tag: lvNum !== null ? `Nível ${lvNum}` : str(lv, 60) || str(pick(x, 'school', 'escola', 'type', 'tipo'), 60),
      detail: [str(pick(x, 'cost', 'custo'), 60), str(pick(x, 'range', 'alcance'), 60), str(pick(x, 'duration', 'duracao'), 60)].filter(Boolean).join(' · ').slice(0, 200),
      description: text(pick(x, 'description', 'descricao', 'desc', 'effect', 'efeito'), 1_500),
      formula: formulaOf(x, 'formula', 'damage', 'dano', 'dice', 'dados', 'healing', 'cura', 'roll'),
    };
  });

  const mechanics = entries(pick(r, 'mechanics', 'customMechanics', 'mecanicas', 'mecânicas', 'specialMechanics'), CUSTOM_LIMITS.mechanics, 'mecânicas', (x) => ({
    tag: '',
    detail: str(pick(x, 'when', 'quando', 'trigger'), 200),
    description: text(pick(x, 'description', 'descricao', 'desc'), 1_500),
    formula: formulaOf(x, 'formula', 'diceFormula', 'dice', 'dados', 'roll', 'rolagem'),
  }));

  if (lostFormulas) warnings.push(`${lostFormulas} fórmula(s) de dados não puderam ser interpretadas e ficaram sem rolagem.`);

  // Rules -------------------------------------------------------------------
  const rules: CustomRule[] = capped(entriesOf(pick(r, 'rules', 'regras'), 'description'), CUSTOM_LIMITS.rules, 'regras', warnings).flatMap((x) => {
    const description = text(pick(x, 'description', 'descricao', 'text', 'texto'), 4_000);
    const name = str(pick(x, 'name', 'nome', 'title', 'titulo'), 80) || str(x.__key, 80) || description.slice(0, 40);
    return name || description ? [{ name: name || 'Regra', description }] : [];
  });

  // Core formulas -------------------------------------------------------------
  const check = normalizeFormula(pick(r, 'checkFormula', 'formulaTeste', 'testFormula', 'resolution', 'coreMechanic'), aliases, varNames);
  let skillFormula = normalizeFormula(pick(r, 'skillFormula', 'formulaPericia', 'skillCheck'), aliases, varNames);
  const checkFormula = check ?? DEFAULT_CHECK_FORMULA;
  if (!check) warnings.push(`Fórmula de teste não informada — usando ${DEFAULT_CHECK_FORMULA}.`);
  if (!skillFormula) skillFormula = checkFormula.includes('@pericia') ? checkFormula : `${checkFormula}+@pericia`;
  if (!normalizeFormula(skillFormula, aliases, varNames)) skillFormula = DEFAULT_SKILL_FORMULA;

  const name = str(pick(r, 'name', 'systemName', 'nome', 'title'), 80) || 'Sistema Customizado';
  const sources = (opts.sources ?? stringList(r.sources, 20, 120)).map((s) => s.slice(0, 120)).slice(0, 20);
  const system: CustomSystem = {
    name,
    description: text(pick(r, 'description', 'descricao', 'summary', 'resumo'), 3_000),
    modifier,
    checkFormula,
    skillFormula,
    hpName: str(pick(r, 'hpName', 'nomeVida', 'healthName'), 30) || 'Vida',
    defenseName: str(pick(r, 'defenseName', 'nomeDefesa', 'acName'), 30) || 'Defesa',
    stats,
    skills,
    resources,
    races,
    classes,
    equipment,
    powers,
    mechanics,
    rules,
    sources,
    importedAt: opts.now ?? Date.now(),
  };
  const parsed = zCustomSystem.safeParse(system);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { error: `Sistema inválido${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}.` };
  }
  return { system: parsed.data, warnings };
}
