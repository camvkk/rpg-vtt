import { z } from 'zod';
import { createCharacter } from '../defaults.ts';
import { computeStats, mod } from '../rules5e.ts';
import { zCharacter, zId } from '../schemas.ts';
import type { Character } from '../types.ts';
import { controlsCharacter, defineAction, DM_ONLY, dmOnly, isDM, NOT_FOUND } from './define.ts';
import { applyHp } from './hp.ts';

const zCharInput = zCharacter.omit({ id: true, createdAt: true, updatedAt: true });
const DM_FIELDS: (keyof Character)[] = ['ownerId', 'kind'];

export const characterActions = {
  'character.create': defineAction({
    schema: z.object({ character: zCharInput.partial().extend({ name: zCharacter.shape.name }) }),
    permit: (s, p, ctx) => {
      if (isDM(ctx)) return null;
      const mine = Object.values(s.characters).filter((c) => c.ownerId === ctx.actor.id).length;
      return mine >= 10 ? 'Você já tem personagens demais.' : null;
    },
    apply: (s, p, ctx) => {
      const input = { ...p.character };
      if (!isDM(ctx)) {
        input.kind = 'pc';
        input.ownerId = ctx.actor.id;
      }
      const c = createCharacter({ ...input, name: input.name || 'Aventureiro' });
      c.id = ctx.newId();
      c.createdAt = ctx.now;
      c.updatedAt = ctx.now;
      s.characters[c.id] = c;
      if (c.ownerId && s.players[c.ownerId] && !s.players[c.ownerId]!.characterId) {
        s.players[c.ownerId]!.characterId = c.id;
      }
      return { id: c.id };
    },
  }),

  'character.update': defineAction({
    schema: z.object({ id: zId, patch: zCharInput.partial() }),
    rate: 150,
    permit: (s, p, ctx) => {
      const c = s.characters[p.id];
      if (!c) return NOT_FOUND;
      if (!controlsCharacter(c, ctx)) return 'Essa ficha não é sua.';
      if (!isDM(ctx)) for (const k of DM_FIELDS) if (k in p.patch) return DM_ONLY;
      return null;
    },
    apply: (s, p, ctx) => {
      const c = s.characters[p.id]!;
      Object.assign(c, p.patch);
      c.updatedAt = ctx.now;
      if (c.hp.cur > c.hp.max) c.hp.cur = c.hp.max;
      if ('ownerId' in p.patch && c.ownerId && s.players[c.ownerId]) s.players[c.ownerId]!.characterId = c.id;
    },
  }),

  'character.delete': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => (s.characters[p.id] ? (controlsCharacter(s.characters[p.id], ctx) ? null : DM_ONLY) : NOT_FOUND),
    apply: (s, p) => {
      const c = s.characters[p.id]!;
      for (const scene of Object.values(s.scenes)) {
        for (const t of Object.values(scene.tokens)) {
          if (t.characterId === p.id) {
            t.characterId = null;
            t.hp = { ...c.hp };
          }
        }
      }
      for (const pl of Object.values(s.players)) if (pl.characterId === p.id) pl.characterId = null;
      delete s.characters[p.id];
    },
  }),

  'character.assign': defineAction({
    schema: z.object({ id: zId, ownerId: zId.nullable() }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.characters[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      const c = s.characters[p.id]!;
      c.ownerId = p.ownerId;
      if (p.ownerId && s.players[p.ownerId]) s.players[p.ownerId]!.characterId = c.id;
      for (const scene of Object.values(s.scenes)) {
        for (const t of Object.values(scene.tokens)) {
          if (t.characterId === c.id) t.ownerIds = p.ownerId ? [p.ownerId] : [];
        }
      }
    },
  }),

  'character.rest': defineAction({
    schema: z.object({ id: zId, kind: z.enum(['short', 'long']), hitDice: z.number().int().min(0).max(20).optional() }),
    permit: (s, p, ctx) => (controlsCharacter(s.characters[p.id], ctx) ? null : 'Essa ficha não é sua.'),
    apply: (s, p, ctx) => {
      const c = s.characters[p.id]!;
      const stats = computeStats(c);
      const lines: string[] = [];
      if (p.kind === 'short') {
        const available = stats.hitDiceTotal - c.hitDiceUsed;
        const spend = Math.min(p.hitDice ?? 0, available);
        let healed = 0;
        const die = stats.hitDice[0]?.die ?? 8;
        for (let i = 0; i < spend; i++) {
          healed += Math.max(0, ctx.roll(`1d${die}`).total + stats.mods.con);
        }
        c.hitDiceUsed += spend;
        const before = c.hp.cur;
        c.hp.cur = Math.min(c.hp.max, c.hp.cur + healed);
        for (const f of c.features) if (f.uses && f.uses.reset === 'short') f.uses.used = 0;
        if (c.spellcasting?.pact) c.spellcasting.pact.used = 0;
        lines.push(`☀️ ${c.name} faz um descanso curto${spend ? `, gasta ${spend} dado(s) de vida e recupera ${c.hp.cur - before} PV` : ''}.`);
      } else {
        c.hp.cur = c.hp.max;
        c.hp.temp = 0;
        const recover = Math.max(1, Math.floor(stats.hitDiceTotal / 2));
        c.hitDiceUsed = Math.max(0, c.hitDiceUsed - recover);
        for (const f of c.features) if (f.uses && f.uses.reset !== 'none') f.uses.used = 0;
        if (c.spellcasting) {
          for (const slot of Object.values(c.spellcasting.slots)) slot.used = 0;
          if (c.spellcasting.pact) c.spellcasting.pact.used = 0;
        }
        c.deathSaves = { success: 0, fail: 0 };
        c.exhaustion = Math.max(0, c.exhaustion - 1);
        c.conditions = c.conditions.filter((x) => x !== 'unconscious');
        c.concentration = null;
        lines.push(`🌙 ${c.name} faz um descanso longo e recupera todas as forças.`);
      }
      c.updatedAt = ctx.now;
      ctx.chat.post({ kind: 'system', text: lines.join('\n') });
    },
  }),

  'character.deathSave': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => {
      const c = s.characters[p.id];
      if (!controlsCharacter(c, ctx)) return 'Essa ficha não é sua.';
      return c!.hp.cur > 0 ? 'O personagem não está caído.' : null;
    },
    apply: (s, p, ctx) => {
      const c = s.characters[p.id]!;
      const r = ctx.roll('1d20');
      const v = r.terms[0]?.dice?.[0]?.value ?? r.total;
      let result: 'success' | 'fail' | 'crit' | 'fumble';
      if (v === 20) {
        result = 'crit';
        c.hp.cur = 1;
        c.deathSaves = { success: 0, fail: 0 };
        c.conditions = c.conditions.filter((x) => x !== 'unconscious');
      } else if (v === 1) {
        result = 'fumble';
        c.deathSaves.fail = Math.min(3, c.deathSaves.fail + 2);
      } else if (v >= 10) {
        result = 'success';
        c.deathSaves.success = Math.min(3, c.deathSaves.success + 1);
      } else {
        result = 'fail';
        c.deathSaves.fail = Math.min(3, c.deathSaves.fail + 1);
      }
      if (c.deathSaves.fail >= 3 && !c.conditions.includes('dead')) c.conditions.push('dead');
      ctx.chat.post({
        kind: 'card',
        speaker: c.name,
        card: {
          type: 'deathSave', actorName: c.name, roll: r,
          success: c.deathSaves.success, fail: c.deathSaves.fail, result,
        },
      });
    },
  }),

  /** Damage / heal / temp HP directly on a sheet (no token needed). Same rules as token.hp. */
  'character.hp': defineAction({
    schema: z.object({
      id: zId,
      op: z.enum(['damage', 'heal', 'temp']),
      amount: z.number().int().min(0).max(100_000),
      silent: z.boolean().optional(),
    }),
    rate: 60,
    permit: (s, p, ctx) => (controlsCharacter(s.characters[p.id], ctx) ? null : 'Essa ficha não é sua.'),
    apply: (s, p, ctx) => {
      const c = s.characters[p.id]!;
      const token = Object.values(s.scenes).flatMap((sc) => Object.values(sc.tokens)).find((t) => t.characterId === c.id);
      const line = applyHp(s, {
        name: c.name, hp: c.hp, conditions: c.conditions, isPc: c.kind === 'pc', concentration: c.concentration,
        deathSaves: c.deathSaves, tokenId: token?.id ?? null,
      }, p.amount, p.op, ctx);
      c.updatedAt = ctx.now;
      if (!p.silent) ctx.chat.post({ kind: 'system', text: line, gmOnly: c.kind === 'npc' });
    },
  }),

  /** Spend or restore a spell slot / feature use quickly. */
  'character.resource': defineAction({
    schema: z.object({
      id: zId,
      kind: z.enum(['slot', 'pact', 'feature', 'hitDie']),
      key: z.string().max(40),
      delta: z.number().int().min(-20).max(20),
    }),
    rate: 80,
    permit: (s, p, ctx) => (controlsCharacter(s.characters[p.id], ctx) ? null : 'Essa ficha não é sua.'),
    apply: (s, p, ctx) => {
      const c = s.characters[p.id]!;
      const clampUse = (used: number, max: number) => Math.max(0, Math.min(max, used));
      if (p.kind === 'slot' && c.spellcasting?.slots[p.key]) {
        const sl = c.spellcasting.slots[p.key]!;
        sl.used = clampUse(sl.used + p.delta, sl.max);
      } else if (p.kind === 'pact' && c.spellcasting?.pact) {
        c.spellcasting.pact.used = clampUse(c.spellcasting.pact.used + p.delta, c.spellcasting.pact.max);
      } else if (p.kind === 'feature') {
        const f = c.features.find((x) => x.id === p.key);
        if (f?.uses) f.uses.used = clampUse(f.uses.used + p.delta, f.uses.max);
      } else if (p.kind === 'hitDie') {
        c.hitDiceUsed = Math.max(0, c.hitDiceUsed + p.delta);
      }
      c.updatedAt = ctx.now;
    },
  }),
};

export { mod };
