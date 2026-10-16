// Per-viewer projection of the campaign state. The DM sees everything; players get a filtered view
// (only the active scene, no hidden tokens/notes/gm drawings, secret doors look like walls, masked NPC HP,
// only journal pages shared with them, no NPC sheets they don't own).
import type { PatchOp } from './protocol.ts';
import { hpStatus } from './rules5e.ts';
import type {
  CampaignState, Character, ChatMessage, Combat, HitPoints, ID, JournalEntry, Role, Scene, Token, Wall,
} from './types.ts';

export interface Viewer {
  id: ID;
  role: Role;
}

const SCENE_COLLECTIONS = new Set(['tokens', 'walls', 'lights', 'drawings', 'templates', 'notes']);
const KEYED_COLLECTIONS = new Set(['characters', 'journal', 'players', 'scenes']);

/** Hidden marker returned by projectors when the entity must not be sent. */
const HIDDEN = Symbol('hidden');

export function entityRoot(path: readonly (string | number)[]): string[] {
  const p = path.map(String);
  if (p[0] === 'scenes') {
    if (p.length >= 4 && SCENE_COLLECTIONS.has(p[2]!)) return p.slice(0, 4);
    if (p.length >= 3) return p.slice(0, 3);
    return p.slice(0, 2);
  }
  if (KEYED_COLLECTIONS.has(p[0]!)) return p.length >= 2 ? p.slice(0, 2) : p.slice(0, 1);
  return p.slice(0, 1);
}

function getIn(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// Entity projectors (player view)
// ---------------------------------------------------------------------------

function canSeeCharacter(c: Character, v: Viewer): boolean {
  return c.kind === 'pc' || c.ownerId === v.id;
}

function maskHp(hp: HitPoints, statusMode: boolean): HitPoints | null {
  if (!statusMode) return null;
  const st = hpStatus(hp.cur, hp.max);
  return { cur: Math.round(st.pct * 100), max: 100, temp: 0 };
}

function projectToken(s: CampaignState, t: Token, v: Viewer): Token | typeof HIDDEN {
  if (t.hidden) return HIDDEN;
  const owner = t.ownerIds.includes(v.id);
  const ch = t.characterId ? s.characters[t.characterId] : undefined;
  const ownsChar = !!ch && ch.ownerId === v.id;
  const out: Token = { ...t };
  const hpVisible = owner || ownsChar || t.showHp === 'always' || t.showHp === 'hover';
  if (ch && !canSeeCharacter(ch, v)) {
    // NPC sheet the player can't open: embed (masked) HP on the token itself.
    out.characterId = null;
    out.hp = hpVisible ? { ...ch.hp } : maskHp(ch.hp, s.settings.hpStatusForPlayers);
    out.ac = null;
    out.hpMasked = !hpVisible;
  } else if (!ch && t.hp && !hpVisible) {
    out.hp = maskHp(t.hp, s.settings.hpStatusForPlayers);
    out.hpMasked = true;
  }
  if (!owner && !ownsChar && t.showName === 'dm') out.name = '???';
  if (!owner && !ownsChar) out.ac = null;
  return out;
}

function projectWall(w: Wall): Wall {
  if (w.kind === 'door' && w.secret) return { ...w, kind: 'wall', door: 'closed', secret: false };
  return w;
}

function projectCombat(s: CampaignState, c: Combat, v: Viewer): Combat {
  const current = c.combatants[c.turn];
  const visible = c.combatants.filter((x) => !x.hidden);
  return {
    ...c,
    combatants: visible.map((x) => ({ ...x })),
    turn: current && !current.hidden ? visible.findIndex((x) => x.id === current.id) : -1,
    timers: c.timers.filter((t) => {
      const tok = t.targetTokenId ? s.scenes[c.sceneId]?.tokens[t.targetTokenId] : undefined;
      return !tok?.hidden;
    }),
  };
  void v;
}

function canSeeJournal(j: JournalEntry, v: Viewer): boolean {
  return j.sharedWith === 'all' || j.sharedWith.includes(v.id);
}

function projectScene(s: CampaignState, scene: Scene, v: Viewer): Scene {
  const tokens: Record<ID, Token> = {};
  for (const t of Object.values(scene.tokens)) {
    const p = projectToken(s, t, v);
    if (p !== HIDDEN) tokens[t.id] = p;
  }
  const walls: Record<ID, Wall> = {};
  for (const w of Object.values(scene.walls)) walls[w.id] = projectWall(w);
  const drawings: Scene['drawings'] = {};
  for (const d of Object.values(scene.drawings)) if (!d.gmOnly) drawings[d.id] = d;
  const notes: Scene['notes'] = {};
  for (const n of Object.values(scene.notes)) if (!n.hidden) notes[n.id] = n;
  return { ...scene, tokens, walls, drawings, notes };
}

/** Project a single entity root for a viewer. Returns HIDDEN when it must be deleted/omitted. */
function projectRoot(s: CampaignState, root: string[], value: unknown, v: Viewer): unknown {
  const [head, key, sub, subKey] = root;
  switch (head) {
    case 'scenes': {
      if (key !== s.activeSceneId) return HIDDEN;
      const scene = s.scenes[key!]!;
      if (root.length === 2) return projectScene(s, value as Scene, v);
      if (root.length === 4) {
        if (sub === 'tokens') return projectToken(s, value as Token, v);
        if (sub === 'walls') return projectWall(value as Wall);
        if (sub === 'drawings') return (value as Scene['drawings'][string]).gmOnly ? HIDDEN : value;
        if (sub === 'notes') return (value as Scene['notes'][string]).hidden ? HIDDEN : value;
        return value;
      }
      void scene;
      void subKey;
      return value; // scene-level field (grid, fog, lighting, ...)
    }
    case 'sceneOrder':
      return s.activeSceneId ? [s.activeSceneId] : [];
    case 'characters':
      if (root.length === 1) return projectCharacters(s, v);
      return canSeeCharacter(value as Character, v) ? value : HIDDEN;
    case 'journal':
      if (root.length === 1) return projectJournal(s, v);
      return canSeeJournal(value as JournalEntry, v) ? value : HIDDEN;
    case 'combat':
      return value ? projectCombat(s, value as Combat, v) : null;
    case 'audio':
      return { ...(value as CampaignState['audio']), playlists: {} };
    default:
      return value;
  }
}

function projectCharacters(s: CampaignState, v: Viewer): Record<ID, Character> {
  const out: Record<ID, Character> = {};
  for (const c of Object.values(s.characters)) if (canSeeCharacter(c, v)) out[c.id] = c;
  return out;
}

function projectJournal(s: CampaignState, v: Viewer): Record<ID, JournalEntry> {
  const out: Record<ID, JournalEntry> = {};
  for (const j of Object.values(s.journal)) if (canSeeJournal(j, v)) out[j.id] = j;
  return out;
}

/** Full snapshot for a viewer. */
export function projectState(s: CampaignState, v: Viewer): CampaignState {
  if (v.role === 'dm') return s;
  const active = s.activeSceneId ? s.scenes[s.activeSceneId] : undefined;
  return {
    ...s,
    scenes: active ? { [active.id]: projectScene(s, active, v) } : {},
    sceneOrder: active ? [active.id] : [],
    characters: projectCharacters(s, v),
    journal: projectJournal(s, v),
    combat: s.combat ? projectCombat(s, s.combat, v) : null,
    audio: { ...s.audio, playlists: {} },
  };
}

export interface PatchLike {
  path: (string | number)[];
}

/**
 * Turn raw patches into entity-level ops for a viewer. Returns 'resync' when the viewer needs a fresh snapshot
 * (e.g. the active scene changed).
 */
export function opsForViewer(s: CampaignState, patches: PatchLike[], v: Viewer): PatchOp[] | 'resync' {
  const roots = new Map<string, string[]>();
  for (const patch of patches) {
    const root = entityRoot(patch.path);
    roots.set(root.join('\u0000'), root);
  }
  if (v.role !== 'dm') {
    for (const root of roots.values()) if (root[0] === 'activeSceneId') return 'resync';
    // Character changes can affect masked HP on linked tokens in the active scene.
    const active = s.activeSceneId ? s.scenes[s.activeSceneId] : undefined;
    if (active) {
      for (const root of [...roots.values()]) {
        if (root[0] !== 'characters' || !root[1]) continue;
        for (const t of Object.values(active.tokens)) {
          if (t.characterId === root[1]) {
            const r = ['scenes', active.id, 'tokens', t.id];
            roots.set(r.join('\u0000'), r);
          }
        }
      }
    }
  }
  const ops: PatchOp[] = [];
  for (const root of roots.values()) {
    const value = getIn(s, root);
    if (v.role === 'dm') {
      ops.push(value === undefined ? { p: root, d: 1 } : { p: root, v: value });
      continue;
    }
    if (root[0] === 'scenes' && root[1] !== s.activeSceneId) continue;
    if (value === undefined) {
      ops.push({ p: root, d: 1 });
      continue;
    }
    const projected = projectRoot(s, root, value, v);
    ops.push(projected === HIDDEN ? { p: root, d: 1 } : { p: root, v: projected });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Chat visibility
// ---------------------------------------------------------------------------

/** Returns the message as the viewer should see it, or null if hidden. */
export function projectChat(m: ChatMessage, v: Viewer): ChatMessage | null {
  const isAuthor = m.authorId === v.id;
  if (v.role === 'dm') return m;
  if (m.whisperTo.length && !isAuthor && !m.whisperTo.includes(v.id)) return null;
  if (m.gmOnly && !isAuthor) return null;
  if (m.blind) {
    // Author sees that they rolled, but not the result.
    return { ...m, roll: null, card: null, text: `${m.text ? `${m.text} — ` : ''}rolagem secreta para o Mestre` };
  }
  // Players learn hit/miss, never the exact armor class of a target.
  if (m.card && (m.card.type === 'attack' || m.card.type === 'saveRequest') && m.card.targets.some((t) => t.ac !== null)) {
    return { ...m, card: { ...m.card, targets: m.card.targets.map((t) => ({ ...t, ac: null })) } };
  }
  return m;
}

/** Apply ops to a plain state object (client side). Returns a new object with structural sharing. */
export function applyOps<T extends object>(state: T, ops: PatchOp[]): T {
  let next = state as Record<string, unknown>;
  for (const op of ops) next = setIn(next, op.p, op.d ? undefined : op.v, !!op.d) as Record<string, unknown>;
  return next as T;
}

function setIn(obj: Record<string, unknown>, path: string[], value: unknown, del: boolean): Record<string, unknown> {
  if (path.length === 0) return value as Record<string, unknown>;
  const [k, ...rest] = path as [string, ...string[]];
  const copy: Record<string, unknown> = Array.isArray(obj) ? ([...obj] as unknown as Record<string, unknown>) : { ...obj };
  if (rest.length === 0) {
    if (del) delete copy[k];
    else copy[k] = value;
    return copy;
  }
  const child = copy[k];
  copy[k] = setIn((child && typeof child === 'object' ? child : {}) as Record<string, unknown>, rest, value, del);
  return copy;
}
