// A live campaign room: authoritative state, connected sockets, action dispatch, projection and persistence.
import { enablePatches, produceWithPatches, type Patch } from 'immer';
import type { Server, Socket } from 'socket.io';
import { getAction, type ActionCtx, type FxTarget } from '../../shared/src/actions/index.ts';
import { diceForAnimation, roll as rollDice } from '../../shared/src/dice.ts';
import type {
  ClientToServerEvents, FxEvent, ServerToClientEvents, SocketData,
} from '../../shared/src/protocol.ts';
import { opsForViewer, projectChat, projectState, type Viewer } from '../../shared/src/projection.ts';
import type { CampaignState, ChatMessage, ID, PlayerInfo, Presence } from '../../shared/src/types.ts';
import { newId } from '../../shared/src/util.ts';
import { compendium } from './compendium.ts';
import { RateLimiter } from './ratelimit.ts';
import * as store from './store.ts';

enablePatches();

export type VttSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
export type VttServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

type Effect =
  | { kind: 'chat'; msg: ChatMessage }
  | { kind: 'chatUpdate'; msg: ChatMessage }
  | { kind: 'chatRemove'; id: ID }
  | { kind: 'chatClear' }
  | { kind: 'fx'; event: FxEvent; to: FxTarget };

const actionLimiter = new RateLimiter(40, 10_000);
const CHAT_CACHE = 400;

export class Room {
  state: CampaignState;
  readonly id: ID;
  readonly code: string;
  private sockets = new Map<string, VttSocket>();
  private chatCache: ChatMessage[];
  private saveTimer: NodeJS.Timeout | null = null;
  private firstDirtyAt = 0;
  lastActivity = Date.now();

  constructor(state: CampaignState) {
    this.state = state;
    this.id = state.id;
    this.code = state.code;
    this.chatCache = store.recentChat(state.id, CHAT_CACHE);
  }

  // -------------------------------------------------------------------------
  // Sockets & presence
  // -------------------------------------------------------------------------

  attach(socket: VttSocket): void {
    this.sockets.set(socket.id, socket);
    void socket.join(this.id);
    this.lastActivity = Date.now();
    this.broadcastPresence();
  }

  detach(socket: VttSocket): void {
    this.sockets.delete(socket.id);
    void socket.leave(this.id);
    this.lastActivity = Date.now();
    this.broadcastPresence();
  }

  get socketCount(): number {
    return this.sockets.size;
  }

  isOnline(playerId: ID): boolean {
    for (const s of this.sockets.values()) if (s.data.playerId === playerId) return true;
    return false;
  }

  presence(): Presence[] {
    const now = Date.now();
    return Object.values(this.state.players).map((p) => ({ playerId: p.id, online: this.isOnline(p.id), lastSeen: now }));
  }

  broadcastPresence(): void {
    const p = this.presence();
    for (const s of this.sockets.values()) s.emit('presence', p);
  }

  viewerOf(socket: VttSocket): Viewer | null {
    const { playerId, role } = socket.data;
    if (!playerId || !role) return null;
    return { id: playerId, role };
  }

  snapshotFor(viewer: Viewer): CampaignState {
    return projectState(this.state, viewer);
  }

  chatFor(viewer: Viewer, before?: number, limit = 150): ChatMessage[] {
    let msgs: ChatMessage[];
    if (before === undefined) msgs = this.chatCache.slice(-limit);
    else msgs = store.recentChat(this.id, limit, before);
    const out: ChatMessage[] = [];
    for (const m of msgs) {
      const p = projectChat(m, viewer);
      if (p) out.push(p);
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  dispatch(actor: PlayerInfo, socketId: string, type: string, payload: unknown): { ok: true; result?: unknown } | { ok: false; error: string } {
    const def = getAction(type);
    if (!def) return { ok: false, error: `Ação desconhecida: ${type}` };
    if (!actionLimiter.take(`${socketId}:${type}`, def.rate ?? 40) || !actionLimiter.take(`${socketId}:*`, 200)) {
      return { ok: false, error: 'Calma! Muitas ações em pouco tempo.' };
    }
    const parsed = def.schema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return { ok: false, error: `Dados inválidos${issue ? ` (${issue.path.join('.')}: ${issue.message})` : ''}` };
    }
    const effects: Effect[] = [];
    const ctx = this.makeCtx(actor, effects);
    const denied = def.permit(this.state, parsed.data, ctx);
    if (denied) return { ok: false, error: denied };
    let result: unknown;
    let next: CampaignState;
    let patches: Patch[];
    try {
      [next, patches] = produceWithPatches(this.state, (draft) => {
        result = def.apply(draft as CampaignState, parsed.data, ctx);
      });
    } catch (e) {
      // Plain Errors thrown by reducers carry PT-BR messages for the user; engine errors are bugs.
      const isBug = !(e instanceof Error) || e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError;
      if (!isBug) return { ok: false, error: (e as Error).message };
      console.error(`[room ${this.code}] action ${type} failed`, e);
      return { ok: false, error: 'Erro interno ao aplicar a ação.' };
    }
    this.state = next;
    // The state is committed at this point; delivery problems must never take the server down.
    try {
      if (patches.length) {
        this.markDirty();
        this.broadcastPatches(patches);
      }
      this.flushEffects(effects);
    } catch (e) {
      console.error(`[room ${this.code}] delivering ${type} failed`, e);
      this.resyncAll();
    }
    this.lastActivity = Date.now();
    return { ok: true, result: result === undefined ? undefined : JSON.parse(JSON.stringify(result)) };
  }

  /** Internal state change (joins, AI imports...) with the same broadcast pipeline. */
  mutate(fn: (draft: CampaignState) => void): void {
    const [next, patches] = produceWithPatches(this.state, (d) => {
      fn(d as CampaignState);
    });
    this.state = next;
    if (patches.length) {
      this.broadcastPatches(patches);
      this.markDirty();
    }
  }

  private makeCtx(actor: PlayerInfo, effects: Effect[]): ActionCtx {
    // Effects are delivered after the immer draft is finalized (and its proxies revoked),
    // so anything a reducer hands us must be copied to plain data right away.
    const plain = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    return {
      actor: { id: actor.id, role: actor.role, name: actor.name, color: actor.color },
      now: Date.now(),
      newId: () => newId(),
      roll: (formula, opts) => rollDice(formula, opts),
      chat: {
        post: (rawDraft) => {
          const draft = plain(rawDraft);
          const msg: ChatMessage = {
            id: newId(),
            ts: Date.now() + effects.length * 0.001,
            authorId: actor.id,
            authorName: actor.name,
            speaker: null,
            text: '',
            roll: null,
            card: null,
            whisperTo: [],
            gmOnly: false,
            blind: false,
            ...draft,
          };
          if (draft.kind === 'system' || draft.kind === 'narration') {
            msg.authorId = draft.kind === 'system' ? null : actor.id;
          }
          effects.push({ kind: 'chat', msg });
          return msg;
        },
        get: (id) => {
          const pending = effects.find((e) => e.kind === 'chat' && e.msg.id === id);
          if (pending && pending.kind === 'chat') return pending.msg;
          return this.chatCache.find((m) => m.id === id) ?? store.getChat(id);
        },
        update: (msg) => effects.push({ kind: 'chatUpdate', msg: plain(msg) }),
        remove: (id) => effects.push({ kind: 'chatRemove', id }),
        clear: () => effects.push({ kind: 'chatClear' }),
      },
      fx: (event, to = 'all') => effects.push({ kind: 'fx', event: plain(event), to: plain(to) }),
      lookup: compendium,
    };
  }

  private broadcastPatches(patches: Patch[]): void {
    for (const socket of this.sockets.values()) {
      const viewer = this.viewerOf(socket);
      if (!viewer) continue;
      const ops = opsForViewer(this.state, patches, viewer);
      if (ops === 'resync') socket.emit('snapshot', projectState(this.state, viewer));
      else if (ops.length) socket.emit('patch', ops);
    }
  }

  /** Resend full snapshots to everyone (e.g. after an import). */
  resyncAll(): void {
    for (const socket of this.sockets.values()) {
      const viewer = this.viewerOf(socket);
      if (viewer) socket.emit('snapshot', projectState(this.state, viewer));
    }
  }

  private flushEffects(effects: Effect[]): void {
    for (const e of effects) {
      switch (e.kind) {
        case 'chat':
          this.deliverChat(e.msg, true);
          break;
        case 'chatUpdate':
          this.deliverChat(e.msg, false);
          break;
        case 'chatRemove':
          store.deleteChat(e.id);
          this.chatCache = this.chatCache.filter((m) => m.id !== e.id);
          for (const s of this.sockets.values()) s.emit('chat.delete', e.id);
          break;
        case 'chatClear':
          store.clearChat(this.id);
          this.chatCache = [];
          for (const s of this.sockets.values()) s.emit('chat.clear');
          break;
        case 'fx':
          this.sendFx(e.event, e.to);
          break;
      }
    }
  }

  postSystem(text: string, gmOnly = false): void {
    this.deliverChat({
      id: newId(), ts: Date.now(), authorId: null, authorName: 'Sistema', speaker: null, kind: 'system', text,
      roll: null, card: null, whisperTo: [], gmOnly, blind: false,
    }, true);
  }

  private deliverChat(msg: ChatMessage, isNew: boolean): void {
    if (isNew) {
      store.insertChat(this.id, msg);
      this.chatCache.push(msg);
      if (this.chatCache.length > CHAT_CACHE) this.chatCache.splice(0, this.chatCache.length - CHAT_CACHE);
    } else {
      store.updateChat(msg);
      const i = this.chatCache.findIndex((m) => m.id === msg.id);
      if (i >= 0) this.chatCache[i] = msg;
    }
    const dice = isNew ? collectDice(msg) : [];
    const author = msg.authorId ? this.state.players[msg.authorId] : undefined;
    for (const socket of this.sockets.values()) {
      const viewer = this.viewerOf(socket);
      if (!viewer) continue;
      const projected = projectChat(msg, viewer);
      if (!projected) continue;
      if (dice.length && this.state.settings.dice3d && (projected.roll || projected.card)) {
        socket.emit('fx', {
          type: 'dice3d', messageId: msg.id, playerId: msg.authorId, color: author?.color ?? '#7a1f2b',
          dice: dice.slice(0, 24), crit: !!msg.roll?.crit || cardCrit(msg), fumble: !!msg.roll?.fumble,
        });
      }
      socket.emit(isNew ? 'chat' : 'chat.update', projected);
    }
  }

  sendFx(event: FxEvent, to: FxTarget, exceptSocket?: string): void {
    for (const socket of this.sockets.values()) {
      if (socket.id === exceptSocket) continue;
      const { playerId, role } = socket.data;
      if (to === 'dm' && role !== 'dm') continue;
      if (typeof to === 'object' && !(playerId && to.players.includes(playerId)) && role !== 'dm') continue;
      socket.emit('fx', event);
    }
  }

  // -------------------------------------------------------------------------
  // Persistence
  // -------------------------------------------------------------------------

  private markDirty(): void {
    const now = Date.now();
    if (!this.firstDirtyAt) this.firstDirtyAt = now;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    const wait = now - this.firstDirtyAt > 5_000 ? 0 : 1_200;
    this.saveTimer = setTimeout(() => this.save(), wait);
  }

  save(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.firstDirtyAt = 0;
    try {
      store.saveCampaignState(this.state);
    } catch (e) {
      console.error(`[room ${this.code}] save failed`, e);
    }
  }

  get dirty(): boolean {
    return this.saveTimer !== null;
  }
}

function collectDice(msg: ChatMessage): { sides: number; value: number }[] {
  const out: { sides: number; value: number }[] = [];
  if (msg.roll) out.push(...diceForAnimation(msg.roll));
  const card = msg.card;
  if (card) {
    if (card.type === 'attack') {
      if (card.toHit) out.push(...diceForAnimation(card.toHit));
      for (const d of card.damage) out.push(...diceForAnimation(d.roll));
    } else if (card.type === 'check' || card.type === 'deathSave') {
      out.push(...diceForAnimation(card.roll));
    } else if (card.type === 'saveRequest' && card.damage) {
      out.push(...diceForAnimation(card.damage.roll));
    }
  }
  return out;
}

function cardCrit(msg: ChatMessage): boolean {
  const c = msg.card;
  if (!c) return false;
  if (c.type === 'attack') return !!c.toHit?.crit;
  if (c.type === 'check') return c.roll.crit;
  if (c.type === 'deathSave') return c.result === 'crit';
  return false;
}
