// Remembered tables (localStorage). Tokens let players rejoin with one click.
export interface SavedTable {
  code: string;
  name: string;
  token: string;
  playerName: string;
  role: 'dm' | 'player';
  lastJoined: number;
}

const KEY = 'vtt.tables.v2';

export function loadTables(): SavedTable[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedTable[]) : [];
    return Array.isArray(list) ? list.sort((a, b) => b.lastJoined - a.lastJoined) : [];
  } catch {
    return [];
  }
}

export function saveTable(t: SavedTable): void {
  try {
    const list = loadTables().filter((x) => x.code !== t.code);
    list.unshift(t);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch {
    // storage unavailable
  }
}

export function forgetTable(code: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(loadTables().filter((x) => x.code !== code)));
  } catch {
    // ignore
  }
}

export function findTable(code: string): SavedTable | undefined {
  return loadTables().find((t) => t.code === code.toUpperCase());
}

export function getPref<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`vtt.pref.${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: unknown): void {
  try {
    localStorage.setItem(`vtt.pref.${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}
