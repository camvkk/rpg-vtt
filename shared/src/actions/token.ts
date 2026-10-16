import { z } from 'zod';
import { createToken } from '../defaults.ts';
import { movementBlocked, snapTokenPosition, tokenCenter } from '../geometry.ts';
import { SIZE_CELLS } from '../rules5e.ts';
import { zId, zToken } from '../schemas.ts';
import type { Token } from '../types.ts';
import {
  controlsCharacter, controlsToken, defineAction, DM_ONLY, isDM, NOT_FOUND, sceneFor, uniqueTokenName,
} from './define.ts';
import { applyHp, hpTargetForToken } from './hp.ts';

const zTokenInput = zToken.omit({ id: true }).partial().extend({
  x: zToken.shape.x,
  y: zToken.shape.y,
});

/** Fields an owning player may change on their own tokens. */
const PLAYER_TOKEN_FIELDS = new Set<keyof Token>(['name', 'img', 'rotation', 'light', 'conditions', 'elevation', 'aura', 'hp', 'color']);

export const tokenActions = {
  'token.create': defineAction({
    schema: z.object({
      sceneId: zId,
      token: zTokenInput,
      fromMonster: z.string().max(80).optional(),
      fromCharacter: zId.optional(),
      rollHp: z.boolean().optional(),
      count: z.number().int().min(1).max(20).optional(),
    }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      if (isDM(ctx)) {
        if (p.fromMonster && !ctx.lookup.monster(p.fromMonster)) return 'Monstro não encontrado no compêndio.';
        return Object.keys(scene.tokens).length > 800 ? 'Muitos tokens na cena.' : null;
      }
      if (!p.fromCharacter) return 'Jogadores só podem colocar o próprio personagem no mapa.';
      const c = s.characters[p.fromCharacter];
      if (!controlsCharacter(c, ctx)) return 'Esse personagem não é seu.';
      if (Object.values(scene.tokens).some((t) => t.characterId === p.fromCharacter)) return 'Seu personagem já está nesta cena.';
      return null;
    },
    apply: (s, p, ctx) => {
      const scene = s.scenes[p.sceneId]!;
      const ids: string[] = [];
      const count = isDM(ctx) ? p.count ?? 1 : 1;
      for (let i = 0; i < count; i++) {
        let base: Partial<Token> = {};
        if (p.fromMonster) {
          const m = ctx.lookup.monster(p.fromMonster)!;
          let hp = m.hp;
          if (p.rollHp && m.hpFormula) {
            try {
              hp = Math.max(1, ctx.roll(m.hpFormula).total);
            } catch {
              hp = m.hp;
            }
          }
          base = {
            name: m.name,
            monsterId: m.id,
            size: SIZE_CELLS[m.size] ?? 1,
            hp: { cur: hp, max: hp, temp: 0 },
            ac: m.ac,
            disposition: 'hostile',
            vision: { enabled: true, range: 0, darkvision: m.darkvision },
            showHp: 'dm',
            showName: 'hover',
            color: '#b91c1c',
          };
        } else if (p.fromCharacter) {
          const c = s.characters[p.fromCharacter]!;
          base = {
            name: c.name,
            characterId: c.id,
            img: c.tokenImg ?? c.portrait,
            ownerIds: c.ownerId ? [c.ownerId] : [],
            disposition: c.kind === 'pc' ? 'friendly' : 'neutral',
            vision: { enabled: true, range: 0, darkvision: c.senses.darkvision },
            showName: 'always',
            showHp: c.kind === 'pc' ? 'always' : 'dm',
            color: s.players[c.ownerId ?? '']?.color ?? '#e0a84f',
          };
        }
        const merged = { ...base, ...p.token } as Partial<Token> & { x: number; y: number; name?: string };
        const tok = createToken({ ...merged, name: merged.name || 'Token', x: merged.x, y: merged.y });
        // Spread multiple spawns in a row.
        if (i > 0) tok.x += i * scene.grid.size * tok.size;
        const snapped = snapTokenPosition(scene.grid, tok, tok.x, tok.y);
        tok.x = snapped.x;
        tok.y = snapped.y;
        if (p.fromMonster) tok.name = uniqueTokenName(scene, tok.name);
        tok.id = ctx.newId();
        scene.tokens[tok.id] = tok;
        ids.push(tok.id);
      }
      return { ids };
    },
  }),

  'token.update': defineAction({
    schema: z.object({ sceneId: zId, id: zId, patch: zToken.omit({ id: true }).partial() }),
    rate: 80,
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      const t = scene.tokens[p.id];
      if (!t) return NOT_FOUND;
      if (isDM(ctx)) return null;
      if (!controlsToken(s, t, ctx)) return 'Esse token não é seu.';
      for (const k of Object.keys(p.patch) as (keyof Token)[]) {
        if (!PLAYER_TOKEN_FIELDS.has(k)) return DM_ONLY;
      }
      if (p.patch.hp && t.characterId) return 'Altere os PV pela ficha.';
      return null;
    },
    apply: (s, p) => {
      Object.assign(s.scenes[p.sceneId]!.tokens[p.id]!, p.patch);
    },
  }),

  'token.move': defineAction({
    schema: z.object({
      sceneId: zId,
      moves: z.array(z.object({ id: zId, x: zToken.shape.x, y: zToken.shape.y })).min(1).max(100),
      /** Optional waypoints (flat px) the moving token passed through, checked for walls. */
      path: z.array(zToken.shape.x).max(400).optional(),
    }),
    rate: 120,
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      for (const m of p.moves) {
        const t = scene.tokens[m.id];
        if (!t) return NOT_FOUND;
        if (isDM(ctx)) continue;
        if (!controlsToken(s, t, ctx)) return 'Esse token não é seu.';
        if (t.locked) return 'Token travado pelo Mestre.';
        if (s.combat?.started && s.combat.sceneId === scene.id) {
          // Players may only move during their own turn (or any token they own not in combat).
          const order = s.combat.combatants;
          const current = order[s.combat.turn];
          const inCombat = order.some((c) => c.tokenId === t.id);
          if (inCombat && current?.tokenId !== t.id) return 'Aguarde o seu turno para mover.';
        }
        if (s.settings.wallsBlockMovement) {
          const walls = Object.values(scene.walls);
          const from = tokenCenter(t, scene.grid);
          const to = tokenCenter({ ...t, x: m.x, y: m.y }, scene.grid);
          const pts = [from];
          if (p.moves.length === 1 && p.path && p.path.length >= 2) {
            for (let i = 0; i + 1 < p.path.length; i += 2) pts.push({ x: p.path[i]!, y: p.path[i + 1]! });
          }
          pts.push(to);
          for (let i = 1; i < pts.length; i++) {
            if (movementBlocked(pts[i - 1]!, pts[i]!, walls)) return 'Uma parede bloqueia o caminho.';
          }
        }
      }
      return null;
    },
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const m of p.moves) {
        const t = scene.tokens[m.id]!;
        const snapped = snapTokenPosition(scene.grid, t, m.x, m.y);
        t.x = snapped.x;
        t.y = snapped.y;
      }
    },
  }),

  'token.delete': defineAction({
    schema: z.object({ sceneId: zId, ids: z.array(zId).min(1).max(800) }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      if (isDM(ctx)) return null;
      // Players can remove their own character token from the map.
      return p.ids.every((id) => {
        const t = scene.tokens[id];
        return t?.characterId && controlsToken(s, t, ctx);
      }) ? null : DM_ONLY;
    },
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) delete scene.tokens[id];
      if (s.combat) {
        const before = s.combat.combatants[s.combat.turn]?.id;
        s.combat.combatants = s.combat.combatants.filter((c) => !c.tokenId || !p.ids.includes(c.tokenId));
        const idx = s.combat.combatants.findIndex((c) => c.id === before);
        s.combat.turn = idx >= 0 ? idx : Math.min(s.combat.turn, Math.max(0, s.combat.combatants.length - 1));
      }
    },
  }),

  /** Damage / heal / temp HP / set HP on one or more tokens. */
  'token.hp': defineAction({
    schema: z.object({
      sceneId: zId,
      ids: z.array(zId).min(1).max(100),
      op: z.enum(['damage', 'heal', 'temp', 'set']),
      amount: z.number().int().min(0).max(100_000),
      silent: z.boolean().optional(),
    }),
    rate: 60,
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      for (const id of p.ids) {
        const t = scene.tokens[id];
        if (!t) return NOT_FOUND;
        if (!controlsToken(s, t, ctx)) return 'Esse token não é seu.';
      }
      return null;
    },
    apply: (s, p, ctx) => {
      const scene = s.scenes[p.sceneId]!;
      const lines: string[] = [];
      for (const id of p.ids) {
        const t = scene.tokens[id]!;
        const target = hpTargetForToken(s, t);
        if (!target) continue;
        if (p.op === 'set') {
          target.hp.cur = Math.min(target.hp.max, p.amount);
          continue;
        }
        lines.push(applyHp(s, target, p.amount, p.op, ctx));
      }
      if (!p.silent && lines.length) {
        const hidden = p.ids.some((id) => scene.tokens[id]?.hidden);
        ctx.chat.post({ kind: 'system', text: lines.join('\n'), gmOnly: hidden });
      }
    },
  }),

  'token.conditions': defineAction({
    schema: z.object({
      sceneId: zId,
      ids: z.array(zId).min(1).max(100),
      toggle: z.string().max(40).optional(),
      add: z.array(z.string().max(40)).max(20).optional(),
      remove: z.array(z.string().max(40)).max(20).optional(),
    }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      return p.ids.every((id) => controlsToken(s, scene.tokens[id], ctx)) ? null : 'Esse token não é seu.';
    },
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) {
        const t = scene.tokens[id]!;
        const c = t.characterId ? s.characters[t.characterId] : undefined;
        const list = c ? c.conditions : t.conditions;
        const set = new Set(list);
        if (p.toggle) {
          if (set.has(p.toggle)) set.delete(p.toggle);
          else set.add(p.toggle);
        }
        for (const a of p.add ?? []) set.add(a);
        for (const r of p.remove ?? []) set.delete(r);
        list.splice(0, list.length, ...set);
        if (c && p.toggle === 'concentrating' && !set.has('concentrating')) c.concentration = null;
      }
    },
  }),
};
