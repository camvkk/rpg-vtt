// Action framework: every state change is an action with a schema, a permission check and a reducer.
// The server runs permit → apply (immer draft) → diffs → per-viewer projection → broadcast.
import type { z } from 'zod';
import type { FxEvent } from '../protocol.ts';
import type {
  CampaignState, Character, ChatKind, ChatMessage, ID, Role, RollResult, Scene, Token,
} from '../types.ts';
import type { Monster, SpellData } from '../data5e/types.ts';

export type FxTarget = 'all' | 'dm' | { players: ID[] };

export type ChatDraft = Partial<Omit<ChatMessage, 'id' | 'ts'>> & { kind: ChatKind };

export interface ActionCtx {
  actor: { id: ID; role: Role; name: string; color: string };
  now: number;
  newId(): string;
  /** Server-side dice roll (crypto RNG). Throws DiceError on invalid formulas. */
  roll(formula: string, opts?: { mode?: 'normal' | 'adv' | 'dis'; vars?: Record<string, number> }): RollResult;
  chat: {
    /** Queue a chat message; delivered after the state commit. Rolls trigger 3D dice for the same audience. */
    post(msg: ChatDraft): ChatMessage;
    get(id: ID): ChatMessage | null;
    update(msg: ChatMessage): void;
    remove(id: ID): void;
    clear(): void;
  };
  fx(e: FxEvent, to?: FxTarget): void;
  lookup: {
    monster(id: string): Monster | undefined;
    spell(id: string): SpellData | undefined;
  };
}

export interface ActionDef<S extends z.ZodType = z.ZodType, R = unknown> {
  schema: S;
  /** null = allowed, otherwise a PT-BR error message. */
  permit: (state: CampaignState, p: z.output<S>, ctx: ActionCtx) => string | null;
  /** Mutates the immer draft. The return value goes back to the caller in the ack. */
  apply: (draft: CampaignState, p: z.output<S>, ctx: ActionCtx) => R;
  /** Max calls per 10 seconds per socket (default 40). */
  rate?: number;
}

export function defineAction<S extends z.ZodType, R>(def: ActionDef<S, R>): ActionDef<S, R> {
  return def;
}

// ---------------------------------------------------------------------------
// Permission helpers
// ---------------------------------------------------------------------------

export const DM_ONLY = 'Apenas o Mestre pode fazer isso.';
export const NOT_FOUND = 'Não encontrado.';

export function isDM(ctx: ActionCtx): boolean {
  return ctx.actor.role === 'dm';
}

export function dmOnly(_s: CampaignState, _p: unknown, ctx: ActionCtx): string | null {
  return isDM(ctx) ? null : DM_ONLY;
}

/** Scene the actor may touch: DM any scene, players only the active one. */
export function sceneFor(state: CampaignState, sceneId: ID, ctx: ActionCtx): Scene | string {
  const scene = state.scenes[sceneId];
  if (!scene) return 'Cena não encontrada.';
  if (!isDM(ctx) && state.activeSceneId !== sceneId) return 'Essa cena não está ativa.';
  return scene;
}

export function controlsCharacter(c: Character | undefined, ctx: ActionCtx): boolean {
  if (!c) return false;
  return isDM(ctx) || (c.ownerId !== null && c.ownerId === ctx.actor.id);
}

export function controlsToken(state: CampaignState, t: Token | undefined, ctx: ActionCtx): boolean {
  if (!t) return false;
  if (isDM(ctx)) return true;
  if (t.ownerIds.includes(ctx.actor.id)) return true;
  if (t.characterId) {
    const c = state.characters[t.characterId];
    if (c && c.ownerId === ctx.actor.id) return true;
  }
  return false;
}

/** Number tokens created from the same monster: "Goblin", "Goblin 2", ... */
export function uniqueTokenName(scene: Scene, base: string): string {
  const names = new Set(Object.values(scene.tokens).map((t) => t.name));
  if (!names.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const n = `${base} ${i}`;
    if (!names.has(n)) return n;
  }
  return base;
}

export function findToken(state: CampaignState, tokenId: ID): { scene: Scene; token: Token } | null {
  for (const scene of Object.values(state.scenes)) {
    const token = scene.tokens[tokenId];
    if (token) return { scene, token };
  }
  return null;
}
