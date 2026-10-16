// Dice notation parser + roller.
// Supports: NdM, d%, keep/drop (kh kl dh dl k d), reroll (r ro with comparisons), explode (! / x with comparisons),
// min/max clamps, arithmetic + - * / with parentheses, flavor tags "2d6[fogo]", variables "@mod" (substituted),
// advantage/disadvantage on the first d20 term. Results are deterministic given an RNG.
import type { DieResult, RollResult, RollTerm } from './types.ts';

export class DiceError extends Error {}

export const DICE_LIMITS = {
  maxDicePerTerm: 100,
  maxDiceTotal: 300,
  maxSides: 1000,
  maxExplosions: 50,
  maxRerolls: 50,
  maxFormulaLength: 200,
};

export type Rng = (sides: number) => number;

/** Uniform integer in [1, sides] using crypto with rejection sampling. */
export const cryptoRng: Rng = (sides) => {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    if (buf[0]! < limit) return (buf[0]! % sides) + 1;
  }
};

type Compare = { op: '<' | '<=' | '>' | '>=' | '='; value: number };

interface DiceNode {
  type: 'dice';
  count: number;
  sides: number;
  keep: { mode: 'kh' | 'kl' | 'dh' | 'dl'; n: number } | null;
  reroll: { once: boolean; cmp: Compare } | null;
  explode: Compare | null;
  min: number | null;
  max: number | null;
  text: string;
  flavor?: string;
  termIndex: number;
}

type Node =
  | DiceNode
  | { type: 'num'; value: number; text: string; flavor?: string; termIndex: number }
  | { type: 'bin'; op: '+' | '-' | '*' | '/'; left: Node; right: Node }
  | { type: 'neg'; expr: Node }
  | { type: 'group'; expr: Node; flavor?: string };

// ---------------------------------------------------------------------------
// Tokenizer / parser
// ---------------------------------------------------------------------------

class Parser {
  pos = 0;
  src: string;
  terms: RollTerm[] = [];
  diceCount = 0;

  constructor(src: string) {
    this.src = src;
  }

  peek(): string {
    return this.src[this.pos] ?? '';
  }

  skipWs(): void {
    while (this.src[this.pos] === ' ') this.pos++;
  }

  eat(s: string): boolean {
    this.skipWs();
    if (this.src.startsWith(s, this.pos)) {
      this.pos += s.length;
      return true;
    }
    return false;
  }

  number(): number | null {
    this.skipWs();
    const m = /^\d+(\.\d+)?/.exec(this.src.slice(this.pos));
    if (!m) return null;
    this.pos += m[0].length;
    return Number(m[0]);
  }

  parse(): Node {
    const node = this.expr();
    this.skipWs();
    if (this.pos < this.src.length) {
      throw new DiceError(`Caractere inesperado "${this.src[this.pos]}" na posição ${this.pos + 1}`);
    }
    return node;
  }

  expr(): Node {
    let left = this.termExpr();
    for (;;) {
      this.skipWs();
      const c = this.peek();
      if (c === '+' || c === '-') {
        this.pos++;
        this.terms.push({ kind: 'op', text: c });
        const right = this.termExpr();
        left = { type: 'bin', op: c, left, right };
      } else return left;
    }
  }

  termExpr(): Node {
    let left = this.factor();
    for (;;) {
      this.skipWs();
      const c = this.peek();
      if (c === '*' || c === '/') {
        this.pos++;
        this.terms.push({ kind: 'op', text: c === '*' ? '×' : '÷' });
        const right = this.factor();
        left = { type: 'bin', op: c, left, right };
      } else return left;
    }
  }

  factor(): Node {
    this.skipWs();
    if (this.peek() === '-') {
      this.pos++;
      this.terms.push({ kind: 'op', text: '-' });
      return { type: 'neg', expr: this.factor() };
    }
    if (this.peek() === '+') {
      this.pos++;
      return this.factor();
    }
    return this.atom();
  }

  flavor(): string | undefined {
    this.skipWs();
    if (this.peek() !== '[') return undefined;
    const end = this.src.indexOf(']', this.pos);
    if (end < 0) throw new DiceError('Colchete "[" sem fechamento');
    const text = this.src.slice(this.pos + 1, end).trim();
    this.pos = end + 1;
    return text || undefined;
  }

  atom(): Node {
    this.skipWs();
    if (this.peek() === '(') {
      this.pos++;
      this.terms.push({ kind: 'paren', text: '(' });
      const expr = this.expr();
      if (!this.eat(')')) throw new DiceError('Parêntese ")" faltando');
      this.terms.push({ kind: 'paren', text: ')' });
      const flavor = this.flavor();
      return { type: 'group', expr, flavor };
    }
    const start = this.pos;
    const n = this.number();
    this.skipWs();
    if (this.peek() === 'd' || this.peek() === 'D') {
      return this.dice(start, n);
    }
    if (n === null) {
      const rest = this.src.slice(this.pos);
      throw new DiceError(rest ? `Não entendi "${rest.slice(0, 12)}"` : 'Fórmula incompleta');
    }
    const flavor = this.flavor();
    const termIndex = this.terms.length;
    this.terms.push({ kind: 'number', text: String(n), value: n, flavor });
    return { type: 'num', value: n, text: String(n), flavor, termIndex };
  }

  compare(): Compare | null {
    const m = /^(<=|>=|<|>|=)?(\d+)/.exec(this.src.slice(this.pos));
    if (!m) return null;
    this.pos += m[0].length;
    return { op: (m[1] as Compare['op']) || '=', value: Number(m[2]) };
  }

  dice(start: number, countRaw: number | null): DiceNode {
    this.pos++; // 'd'
    let sides: number;
    if (this.peek() === '%') {
      this.pos++;
      sides = 100;
    } else {
      const s = /^\d+/.exec(this.src.slice(this.pos));
      if (!s) throw new DiceError('Informe o número de faces depois do "d" (ex: 1d20)');
      this.pos += s[0].length;
      sides = Number(s[0]);
    }
    const count = countRaw ?? 1;
    if (!Number.isInteger(count) || count < 1) throw new DiceError('Quantidade de dados deve ser pelo menos 1');
    if (count > DICE_LIMITS.maxDicePerTerm) throw new DiceError(`Máximo de ${DICE_LIMITS.maxDicePerTerm} dados por termo`);
    if (sides < 2) throw new DiceError('Dados precisam ter pelo menos 2 faces');
    if (sides > DICE_LIMITS.maxSides) throw new DiceError(`Máximo de ${DICE_LIMITS.maxSides} faces`);
    this.diceCount += count;
    if (this.diceCount > DICE_LIMITS.maxDiceTotal) throw new DiceError(`Máximo de ${DICE_LIMITS.maxDiceTotal} dados por rolagem`);

    const node: DiceNode = {
      type: 'dice', count, sides, keep: null, reroll: null, explode: null, min: null, max: null, text: '', termIndex: -1,
    };
    // modifiers
    for (;;) {
      const rest = this.src.slice(this.pos);
      let m: RegExpExecArray | null;
      // "d" followed by digits right after a dice term means drop-lowest (4d6d1); "k" alone = keep highest 1.
      if ((m = /^(kh|kl|dh|dl|k)(\d+)?/i.exec(rest)) || (m = /^(d)(\d+)/i.exec(rest))) {
        const mode = m[1]!.toLowerCase();
        const n = m[2] ? Number(m[2]) : 1;
        this.pos += m[0].length;
        const map: Record<string, 'kh' | 'kl' | 'dh' | 'dl'> = { kh: 'kh', k: 'kh', kl: 'kl', dh: 'dh', dl: 'dl', d: 'dl' };
        node.keep = { mode: map[mode]!, n };
        continue;
      }
      if ((m = /^ro/i.exec(rest))) {
        this.pos += 2;
        const cmp = this.compare() ?? { op: '=', value: 1 };
        node.reroll = { once: true, cmp };
        continue;
      }
      if ((m = /^r/i.exec(rest)) && /^r(<=|>=|<|>|=)?\d/i.test(rest)) {
        this.pos += 1;
        node.reroll = { once: false, cmp: this.compare()! };
        continue;
      }
      if ((m = /^(!|x)/i.exec(rest))) {
        this.pos += 1;
        node.explode = this.compare() ?? { op: '=', value: sides };
        continue;
      }
      if ((m = /^min(\d+)/i.exec(rest))) {
        this.pos += m[0].length;
        node.min = Number(m[1]);
        continue;
      }
      if ((m = /^max(\d+)/i.exec(rest))) {
        this.pos += m[0].length;
        node.max = Number(m[1]);
        continue;
      }
      break;
    }
    if (node.reroll && matches(node.reroll.cmp, 1) && matches(node.reroll.cmp, sides) && !node.reroll.once) {
      // reroll condition covering everything would loop forever
      let all = true;
      for (let v = 1; v <= sides; v++) if (!matches(node.reroll.cmp, v)) all = false;
      if (all) throw new DiceError('Condição de rerrolagem cobre todas as faces');
    }
    if (node.explode) {
      let all = true;
      for (let v = 1; v <= sides; v++) if (!matches(node.explode, v)) all = false;
      if (all) throw new DiceError('Condição de explosão cobre todas as faces');
    }
    node.text = this.src.slice(start, this.pos).trim().replace(/D/g, 'd');
    node.flavor = this.flavor();
    node.termIndex = this.terms.length;
    this.terms.push({ kind: 'dice', text: node.text, dice: [], flavor: node.flavor });
    return node;
  }
}

function matches(cmp: Compare, v: number): boolean {
  switch (cmp.op) {
    case '<': return v < cmp.value;
    case '<=': return v <= cmp.value;
    case '>': return v > cmp.value;
    case '>=': return v >= cmp.value;
    case '=': return v === cmp.value;
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

function rollDiceNode(node: DiceNode, rng: Rng): { dice: DieResult[]; total: number } {
  const dice: DieResult[] = [];
  let explosions = 0;
  let rerolls = 0;
  const rollOne = (exploded: boolean): void => {
    let value = rng(node.sides);
    if (node.reroll) {
      let tries = 0;
      while (matches(node.reroll.cmp, value) && rerolls < DICE_LIMITS.maxRerolls) {
        dice.push({ sides: node.sides, value, dropped: true, exploded, rerolled: true });
        value = rng(node.sides);
        rerolls++;
        tries++;
        if (node.reroll.once && tries >= 1) break;
      }
    }
    if (node.min !== null && value < node.min) value = node.min;
    if (node.max !== null && value > node.max) value = node.max;
    dice.push({ sides: node.sides, value, dropped: false, exploded, rerolled: false });
    if (node.explode && matches(node.explode, value) && explosions < DICE_LIMITS.maxExplosions) {
      explosions++;
      rollOne(true);
    }
  };
  for (let i = 0; i < node.count; i++) rollOne(false);

  if (node.keep) {
    const live = dice.map((d, i) => ({ d, i })).filter((x) => !x.d.rerolled);
    const sorted = [...live].sort((a, b) => a.d.value - b.d.value || a.i - b.i);
    const n = Math.min(node.keep.n, live.length);
    let drop: typeof live = [];
    switch (node.keep.mode) {
      case 'kh': drop = sorted.slice(0, live.length - n); break;
      case 'kl': drop = sorted.slice(n); break;
      case 'dh': drop = sorted.slice(live.length - n); break;
      case 'dl': drop = sorted.slice(0, n); break;
    }
    for (const x of drop) x.d.dropped = true;
  }
  let total = 0;
  for (const d of dice) if (!d.dropped) total += d.value;
  return { dice, total };
}

function evaluate(node: Node, rng: Rng, terms: RollTerm[]): number {
  switch (node.type) {
    case 'num':
      return node.value;
    case 'dice': {
      const r = rollDiceNode(node, rng);
      const term = terms[node.termIndex]!;
      term.dice = r.dice;
      term.value = r.total;
      return r.total;
    }
    case 'neg':
      return -evaluate(node.expr, rng, terms);
    case 'group':
      return evaluate(node.expr, rng, terms);
    case 'bin': {
      const a = evaluate(node.left, rng, terms);
      const b = evaluate(node.right, rng, terms);
      switch (node.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return b === 0 ? 0 : Math.floor(a / b);
      }
    }
  }
}

export interface RollOptions {
  rng?: Rng;
  /** Apply advantage/disadvantage to the first single d20 term. */
  mode?: 'normal' | 'adv' | 'dis';
  /** Variables substituted for @name (e.g. { mod: 3, prof: 2 }). */
  vars?: Record<string, number>;
}

/** Normalize user input: PT-BR "2d6 + 3", unicode minus, "d20" → "1d20", variables. */
export function prepareFormula(input: string, opts: RollOptions = {}): string {
  let f = input.trim().replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  if (f.length > DICE_LIMITS.maxFormulaLength) throw new DiceError('Fórmula longa demais');
  f = f.replace(/@([a-zA-Z_]\w*)/g, (_m, name: string) => {
    const v = opts.vars?.[name];
    if (v === undefined) throw new DiceError(`Variável desconhecida @${name}`);
    return v < 0 ? `(${v})` : String(v);
  });
  // "+ -3" → "-3"
  f = f.replace(/\+\s*\(-(\d+)\)/g, '-$1');
  if (opts.mode === 'adv' || opts.mode === 'dis') {
    const keep = opts.mode === 'adv' ? 'kh1' : 'kl1';
    let done = false;
    f = f.replace(/(^|[^\dd])1?d20(?![\dkdrx!])/i, (m, pre: string) => {
      if (done) return m;
      done = true;
      return `${pre}2d20${keep}`;
    });
  }
  return f;
}

export function parseFormula(formula: string, opts: RollOptions = {}): { ok: true; normalized: string } | { ok: false; error: string } {
  try {
    const f = prepareFormula(formula, opts);
    new Parser(f).parse();
    return { ok: true, normalized: f };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function roll(formula: string, opts: RollOptions = {}): RollResult {
  const rng = opts.rng ?? cryptoRng;
  const f = prepareFormula(formula, opts);
  if (!f) throw new DiceError('Fórmula vazia');
  const parser = new Parser(f);
  const ast = parser.parse();
  const total = evaluate(ast, rng, parser.terms);
  // Crit / fumble: first d20 dice term, first kept die.
  let crit = false;
  let fumble = false;
  for (const t of parser.terms) {
    if (t.kind === 'dice' && t.dice && t.dice.length && t.dice[0]!.sides === 20) {
      const kept = t.dice.filter((d) => !d.dropped);
      if (kept.length === 1) {
        crit = kept[0]!.value === 20;
        fumble = kept[0]!.value === 1;
      }
      break;
    }
  }
  return { formula: f, terms: parser.terms, total, crit, fumble, mode: opts.mode ?? 'normal' };
}

/** Double the dice of a damage formula for critical hits (5e: roll twice as many dice). */
export function critFormula(formula: string): string {
  return formula.replace(/(\d*)d(\d+)/gi, (_m, n: string, s: string) => `${(Number(n || 1)) * 2}d${s}`);
}

/** Flatten all kept dice for the 3D animation. */
export function diceForAnimation(r: RollResult): { sides: number; value: number }[] {
  const out: { sides: number; value: number }[] = [];
  for (const t of r.terms) {
    if (t.kind !== 'dice' || !t.dice) continue;
    for (const d of t.dice) {
      if (d.rerolled) continue;
      out.push({ sides: d.sides, value: d.value });
    }
  }
  return out.slice(0, 30);
}

/** Short human readable breakdown: "4d6kh3 [6, 5, 4, ~~1~~] + 2". */
export function describeRoll(r: RollResult): string {
  return r.terms
    .map((t) => {
      if (t.kind === 'dice') {
        const ds = (t.dice ?? []).filter((d) => !d.rerolled).map((d) => (d.dropped ? `~${d.value}~` : String(d.value)));
        return `${t.text}[${ds.join(', ')}]`;
      }
      return t.text;
    })
    .join(' ');
}
