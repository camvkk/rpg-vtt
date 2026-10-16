import { z } from 'zod';
import { computeStats, monsterInitiative } from '../rules5e.ts';
import { zId } from '../schemas.ts';
import type { CampaignState, Combat, Combatant, Token } from '../types.ts';
import { defineAction, DM_ONLY, dmOnly, isDM, NOT_FOUND, type ActionCtx } from './define.ts';

export function sortCombatants(combat: Combat): void {
  const currentId = combat.combatants[combat.turn]?.id;
  combat.combatants.sort((a, b) => {
    const ai = a.initiative ?? -Infinity, bi = b.initiative ?? -Infinity;
    if (ai !== bi) return bi - ai;
    if (a.initBonus !== b.initBonus) return b.initBonus - a.initBonus;
    return a.name.localeCompare(b.name);
  });
  if (currentId) {
    const idx = combat.combatants.findIndex((c) => c.id === currentId);
    if (idx >= 0) combat.turn = idx;
  }
}

function initBonusFor(s: CampaignState, token: Token, ctx: ActionCtx): number {
  if (token.characterId) {
    const c = s.characters[token.characterId];
    if (c) return computeStats(c).initiative;
  }
  if (token.monsterId) {
    const m = ctx.lookup.monster(token.monsterId);
    if (m) return monsterInitiative(m);
  }
  return 0;
}

function combatantFromToken(s: CampaignState, token: Token, ctx: ActionCtx): Combatant {
  const owners = new Set(token.ownerIds);
  if (token.characterId) {
    const c = s.characters[token.characterId];
    if (c?.ownerId) owners.add(c.ownerId);
  }
  return {
    id: ctx.newId(),
    tokenId: token.id,
    characterId: token.characterId,
    name: token.name,
    img: token.img,
    initiative: null,
    initBonus: initBonusFor(s, token, ctx),
    hidden: token.hidden,
    defeated: false,
    ownerIds: [...owners],
  };
}

function rollFor(c: Combatant, ctx: ActionCtx): number {
  return ctx.roll(`1d20${c.initBonus >= 0 ? '+' : ''}${c.initBonus}`).total;
}

function isNpc(c: Combatant): boolean {
  return c.ownerIds.length === 0;
}

function announceTurn(s: CampaignState, ctx: ActionCtx): void {
  const combat = s.combat;
  if (!combat?.started) return;
  const cur = combat.combatants[combat.turn];
  if (!cur) return;
  ctx.fx({ type: 'turn', combatantId: cur.id, ownerIds: cur.ownerIds, name: cur.hidden ? '???' : cur.name }, cur.hidden ? 'dm' : 'all');
}

export const combatActions = {
  'combat.start': defineAction({
    schema: z.object({ sceneId: zId, tokenIds: z.array(zId).max(100) }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.sceneId] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      const scene = s.scenes[p.sceneId]!;
      const combat: Combat = {
        id: ctx.newId(), sceneId: scene.id, started: false, round: 0, turn: 0, combatants: [], timers: [],
      };
      for (const id of p.tokenIds) {
        const t = scene.tokens[id];
        if (t) combat.combatants.push(combatantFromToken(s, t, ctx));
      }
      if (s.settings.autoRollNpcInitiative) {
        for (const c of combat.combatants) if (isNpc(c)) c.initiative = rollFor(c, ctx);
      }
      sortCombatants(combat);
      s.combat = combat;
      ctx.chat.post({ kind: 'system', text: '⚔️ Rolem iniciativa! O combate vai começar.' });
      ctx.fx({ type: 'sfx', id: 'roar' });
    },
  }),

  'combat.add': defineAction({
    schema: z.object({ tokenIds: z.array(zId).min(1).max(100) }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat ? null : 'Nenhum combate ativo.'),
    apply: (s, p, ctx) => {
      const combat = s.combat!;
      const scene = s.scenes[combat.sceneId];
      if (!scene) return;
      for (const id of p.tokenIds) {
        if (combat.combatants.some((c) => c.tokenId === id)) continue;
        const t = scene.tokens[id];
        if (!t) continue;
        const c = combatantFromToken(s, t, ctx);
        if (s.settings.autoRollNpcInitiative && isNpc(c)) c.initiative = rollFor(c, ctx);
        combat.combatants.push(c);
      }
      sortCombatants(combat);
    },
  }),

  'combat.remove': defineAction({
    schema: z.object({ combatantId: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat ? null : 'Nenhum combate ativo.'),
    apply: (s, p) => {
      const combat = s.combat!;
      const idx = combat.combatants.findIndex((c) => c.id === p.combatantId);
      if (idx < 0) return;
      combat.combatants.splice(idx, 1);
      if (idx < combat.turn) combat.turn--;
      if (combat.turn >= combat.combatants.length) combat.turn = 0;
    },
  }),

  /** Roll initiative. Players roll for their own combatants; the DM for npcs/all/specific. */
  'combat.roll': defineAction({
    schema: z.object({ who: z.enum(['mine', 'npcs', 'all', 'ids']), ids: z.array(zId).max(100).optional(), mode: z.enum(['normal', 'adv', 'dis']).optional() }),
    permit: (s, p, ctx) => {
      if (!s.combat) return 'Nenhum combate ativo.';
      if (p.who !== 'mine' && !isDM(ctx)) return DM_ONLY;
      return null;
    },
    apply: (s, p, ctx) => {
      const combat = s.combat!;
      const lines: string[] = [];
      for (const c of combat.combatants) {
        let take = false;
        if (p.who === 'mine') take = c.ownerIds.includes(ctx.actor.id) && c.initiative === null;
        else if (p.who === 'npcs') take = isNpc(c) && c.initiative === null;
        else if (p.who === 'all') take = c.initiative === null;
        else take = (p.ids ?? []).includes(c.id);
        if (!take) continue;
        const r = ctx.roll(`1d20${c.initBonus >= 0 ? '+' : ''}${c.initBonus}`, { mode: p.mode });
        c.initiative = r.total;
        if (p.who === 'mine') {
          ctx.chat.post({ kind: 'roll', speaker: c.name, text: 'Iniciativa', roll: r });
        } else {
          lines.push(`${c.hidden ? '(oculto) ' : ''}${c.name}: ${r.total}`);
        }
      }
      if (lines.length) ctx.chat.post({ kind: 'system', text: `Iniciativa:\n${lines.join('\n')}`, gmOnly: true });
      sortCombatants(combat);
    },
  }),

  'combat.setInitiative': defineAction({
    schema: z.object({ combatantId: zId, value: z.number().int().min(-20).max(60).nullable() }),
    permit: (s, p, ctx) => {
      if (!s.combat) return 'Nenhum combate ativo.';
      const c = s.combat.combatants.find((x) => x.id === p.combatantId);
      if (!c) return NOT_FOUND;
      return isDM(ctx) || (c.ownerIds.includes(ctx.actor.id) && !s.combat.started) ? null : DM_ONLY;
    },
    apply: (s, p) => {
      const c = s.combat!.combatants.find((x) => x.id === p.combatantId)!;
      c.initiative = p.value;
      sortCombatants(s.combat!);
    },
  }),

  'combat.update': defineAction({
    schema: z.object({
      combatantId: zId,
      patch: z.object({ name: z.string().max(120), hidden: z.boolean(), defeated: z.boolean(), initBonus: z.number().int().min(-20).max(30) }).partial(),
    }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat?.combatants.some((c) => c.id === p.combatantId) ? null : NOT_FOUND),
    apply: (s, p) => {
      Object.assign(s.combat!.combatants.find((x) => x.id === p.combatantId)!, p.patch);
    },
  }),

  'combat.begin': defineAction({
    schema: z.object({}),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat ? null : 'Nenhum combate ativo.'),
    apply: (s, _p, ctx) => {
      const combat = s.combat!;
      for (const c of combat.combatants) if (c.initiative === null) c.initiative = rollFor(c, ctx);
      sortCombatants(combat);
      combat.started = true;
      combat.round = 1;
      combat.turn = 0;
      ctx.chat.post({ kind: 'system', text: '⚔️ Rodada 1 — que comece a batalha!' });
      announceTurn(s, ctx);
    },
  }),

  /** End the current turn. DM, or the player who owns the active combatant. */
  'combat.next': defineAction({
    schema: z.object({ expectedTurn: z.number().int().optional() }),
    rate: 20,
    permit: (s, p, ctx) => {
      const combat = s.combat;
      if (!combat?.started) return 'O combate não começou.';
      if (p.expectedTurn !== undefined && p.expectedTurn !== combat.turn) return 'O turno já mudou.';
      if (isDM(ctx)) return null;
      const cur = combat.combatants[combat.turn];
      return cur?.ownerIds.includes(ctx.actor.id) ? null : 'Não é o seu turno.';
    },
    apply: (s, _p, ctx) => {
      const combat = s.combat!;
      const n = combat.combatants.length;
      if (!n) return;
      let next = combat.turn;
      for (let i = 0; i < n; i++) {
        next = (next + 1) % n;
        if (next === 0) {
          combat.round++;
          ctx.chat.post({ kind: 'system', text: `⏳ Rodada ${combat.round}` });
        }
        if (!combat.combatants[next]!.defeated) break;
      }
      combat.turn = next;
      // Tick condition timers owned by the new active combatant.
      const active = combat.combatants[next]!;
      const expired: string[] = [];
      combat.timers = combat.timers.filter((t) => {
        if (t.sourceCombatantId !== active.id) return true;
        t.rounds--;
        if (t.rounds > 0) return true;
        expired.push(t.condition);
        const scene = s.scenes[combat.sceneId];
        const tok = t.targetTokenId ? scene?.tokens[t.targetTokenId] : undefined;
        if (tok) {
          const ch = tok.characterId ? s.characters[tok.characterId] : undefined;
          const list = ch ? ch.conditions : tok.conditions;
          const i = list.indexOf(t.condition);
          if (i >= 0) list.splice(i, 1);
        }
        return false;
      });
      if (expired.length) ctx.chat.post({ kind: 'system', text: `Efeitos encerrados: ${expired.join(', ')}` });
      announceTurn(s, ctx);
    },
  }),

  'combat.prev': defineAction({
    schema: z.object({}),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat?.started ? null : 'O combate não começou.'),
    apply: (s, _p, ctx) => {
      const combat = s.combat!;
      const n = combat.combatants.length;
      if (!n) return;
      if (combat.turn === 0) {
        if (combat.round > 1) {
          combat.round--;
          combat.turn = n - 1;
        }
      } else combat.turn--;
      announceTurn(s, ctx);
    },
  }),

  'combat.end': defineAction({
    schema: z.object({}),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat ? null : 'Nenhum combate ativo.'),
    apply: (s, _p, ctx) => {
      const rounds = s.combat?.round ?? 0;
      s.combat = null;
      ctx.chat.post({ kind: 'system', text: rounds ? `🏁 Fim do combate após ${rounds} rodada(s).` : '🏁 Combate cancelado.' });
    },
  }),

  'combat.timer': defineAction({
    schema: z.object({
      targetTokenId: zId,
      condition: z.string().max(40),
      rounds: z.number().int().min(1).max(100),
    }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.combat?.started ? null : 'O combate não começou.'),
    apply: (s, p, ctx) => {
      const combat = s.combat!;
      const cur = combat.combatants[combat.turn];
      combat.timers.push({
        id: ctx.newId(), targetTokenId: p.targetTokenId, condition: p.condition, rounds: p.rounds,
        sourceCombatantId: cur?.id ?? null,
      });
      const tok = s.scenes[combat.sceneId]?.tokens[p.targetTokenId];
      if (tok) {
        const ch = tok.characterId ? s.characters[tok.characterId] : undefined;
        const list = ch ? ch.conditions : tok.conditions;
        if (!list.includes(p.condition)) list.push(p.condition);
      }
    },
  }),
};
