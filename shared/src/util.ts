const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomIndex(max: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % max;
}

/** Short random id (not security sensitive). */
export function newId(len = 12): string {
  let s = '';
  for (let i = 0; i < len; i++) s += ID_ALPHABET[randomIndex(ID_ALPHABET.length)];
  return s;
}

/** Human friendly join code without ambiguous characters (no 0/O, 1/I). */
export function newCode(len = 6): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[randomIndex(CODE_ALPHABET.length)];
  return s;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function sum(values: number[]): number {
  let s = 0;
  for (const v of values) s += v;
  return s;
}

/** Remove accents and lowercase, for search and name matching. */
export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const PLAYER_COLORS = [
  '#e0a84f', '#7cc4fa', '#f472b6', '#a3e635', '#c084fc', '#fb923c',
  '#34d399', '#f87171', '#facc15', '#60a5fa', '#e879f9', '#2dd4bf',
];

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
