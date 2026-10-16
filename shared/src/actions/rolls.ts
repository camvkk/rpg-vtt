// Chat + rules automation: commands, checks, attacks vs AC, spells, save requests, applying damage.
import { z } from 'zod';
import { critFormula, parseFormula } from '../dice.ts';
import {
  ABILITY_NAME, attackAbilityMod, attackSaveDc, attackToHit, characterVars, computeStats, mod, monsterSave,
  monsterSkill, resolveFormula, SKILL_ABILITY, SKILL_NAME,
} from '../rules5e.ts';
import { zAbility, zDamageType, zId } from '../schemas.ts';
import type {
  Ability, CampaignState, CardTarget, ChatCard, ChatMessage, DamageType, ID, RollResult, SkillId, Token,
} from '../types.ts';
import {
  controlsCharacter, controlsToken, defineAction, DM_ONLY, findToken, isDM, NOT_FOUND, type ActionCtx, type ChatDraft,
} from './define.ts';
import { applyHp, hpTargetForToken } from './hp.ts';

const zMode = z.enum(['normal', 'adv', 'dis']).optional();
const zVisibility = z.enum(['public', 'gm', 'blind', 'self']).optional();
type Visibility = z.output<typeof zVisibility>;

function visibilityFields(v: Visibility, ctx: ActionCtx): Partial<ChatMessage> {
  switch (v) {
    case 'gm': return { gmOnly: true };
    case 'blind': return { gmOnly: true, blind: true };
    case 'self': return { whisperTo: [ctx.actor.id] };
    default: return {};
  }
}

/** Splits "1d20+5 Ataque furtivo" into formula + label using the longest valid prefix. */
export function splitFormulaLabel(text: string): { formula: string; label: string } | null {
  const hash = text.indexOf('#');
  if (hash >= 0) {
    const formula = text.slice(0, hash).trim();
    return parseFormula(formula).ok ? { formula, label: text.slice(hash + 1).trim() } : null;
  }
  const words = text.trim().split(/\s+/);
  for (let i = words.length; i >= 1; i--) {
    const candidate = words.slice(0, i).join(' ');
    if (/@/.test(candidate)) continue;
    if (parseFormula(candidate).ok) return { formula: candidate, label: words.slice(i).join(' ') };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Target helpers
// ---------------------------------------------------------------------------

function tokenAc(s: CampaignState, t: Token, ctx: ActionCtx): number | null {
  if (t.characterId) {
    const c = s.characters[t.characterId];
    if (c) return computeStats(c).ac;
  }
  if (t.ac !== null) return t.ac;
  if (t.monsterId) return ctx.lookup.monster(t.monsterId)?.ac ?? null;
  return null;
}

function tokenSave(s: CampaignState, t: Token, a: Ability, ctx: ActionCtx): number {
  if (t.characterId) {
    const c = s.characters[t.characterId];
    if (c) return computeStats(c).saves[a];
  }
  if (t.monsterId) {
    const m = ctx.lookup.monster(t.monsterId);
    if (m) return monsterSave(m, a);
  }
  return 0;
}

function isPcToken(s: CampaignState, t: Token): boolean {
  if (!t.characterId) return t.ownerIds.length > 0;
  return s.characters[t.characterId]?.kind === 'pc' || t.ownerIds.length > 0;
}

function signedNum(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function firstD20(r: RollResult): number | null {
  for (const t of r.terms) {
    if (t.kind === 'dice' && t.dice?.[0]?.sides === 20) {
      const kept = t.dice.filter((d) => !d.dropped && !d.rerolled);
      return kept[0]?.value ?? null;
    }
  }
  return null;
}

function rollSaveFor(s: CampaignState, t: Token, ability: Ability, dc: number, ctx: ActionCtx): CardTarget {
  const bonus = tokenSave(s, t, ability, ctx);
  const roll = ctx.roll(`1d20${signedNum(bonus)}`);
  return {
    tokenId: t.id, name: t.name, ac: null, roll, applied: null,
    outcome: roll.total >= dc ? 'success' : 'fail',
  };
}

function resolveTargets(s: CampaignState, sceneId: ID | undefined, ids: ID[]): Token[] {
  const out: Token[] = [];
  for (const id of ids) {
    const scene = sceneId ? s.scenes[sceneId] : undefined;
    const t = scene?.tokens[id] ?? findToken(s, id)?.token;
    if (t) out.push(t);
  }
  return out;
}

interface ActorInfo {
  name: string;
  tokenId: ID | null;
  hidden: boolean;
}

function actorFrom(s: CampaignState, characterId: ID | undefined, tokenId: ID | undefined): ActorInfo {
  if (tokenId) {
    const found = findToken(s, tokenId);
    if (found) return { name: found.token.name, tokenId, hidden: found.token.hidden };
  }
  if (characterId) {
    const c = s.characters[characterId];
    if (c) return { name: c.name, tokenId: null, hidden: false };
  }
  return { name: '?', tokenId: null, hidden: false };
}

function canActAs(s: CampaignState, p: { characterId?: ID; tokenId?: ID }, ctx: ActionCtx): string | null {
  if (p.characterId) {
    const c = s.characters[p.characterId];
    if (!c) return NOT_FOUND;
    return controlsCharacter(c, ctx) ? null : 'Essa ficha não é sua.';
  }
  if (p.tokenId) {
    const f = findToken(s, p.tokenId);
    if (!f) return NOT_FOUND;
    return controlsToken(s, f.token, ctx) ? null : 'Esse token não é seu.';
  }
  return 'Informe quem está rolando.';
}

function postCard(ctx: ActionCtx, card: ChatCard, speaker: string, extra: Partial<ChatDraft> = {}): ChatMessage {
  return ctx.chat.post({ kind: 'card', speaker, card, ...extra });
}

const zRef = { characterId: zId.optional(), tokenId: zId.optional() };

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const rollActions = {
  'chat.send': defineAction({
    schema: z.object({
      text: z.string().min(1).max(4_000),
      speaker: z.string().max(120).nullable().optional(),
      whisperTo: z.array(zId).max(30).optional(),
    }),
    rate: 30,
    permit: () => null,
    apply: (s, p, ctx) => {
      const text = p.text.trim();
      const speaker = p.speaker ?? null;
      const cmd = /^\/(\w+)\s*([\s\S]*)$/.exec(text);
      if (!cmd) {
        ctx.chat.post({ kind: 'text', text, speaker, whisperTo: p.whisperTo ?? [] });
        return;
      }
      const name = cmd[1]!.toLowerCase();
      const rest = cmd[2]!.trim();
      const doRoll = (visibility: Visibility) => {
        const split = splitFormulaLabel(rest || '1d20');
        if (!split) throw new Error('Fórmula de dados inválida. Ex: /r 1d20+5');
        const roll = ctx.roll(split.formula);
        ctx.chat.post({ kind: 'roll', text: split.label, speaker, roll, ...visibilityFields(visibility, ctx) });
      };
      switch (name) {
        case 'r': case 'roll': case 'rolar': doRoll('public'); return;
        case 'gr': case 'gmroll': doRoll('gm'); return;
        case 'br': case 'blind': doRoll('blind'); return;
        case 'sr': case 'self': doRoll('self'); return;
        case 'me': case 'em':
          ctx.chat.post({ kind: 'emote', text: rest, speaker: speaker ?? ctx.actor.name });
          return;
        case 'ooc':
          ctx.chat.post({ kind: 'ooc', text: rest });
          return;
        case 'desc': case 'narrar':
          if (!isDM(ctx)) throw new Error(DM_ONLY);
          ctx.chat.post({ kind: 'narration', text: rest });
          return;
        case 'w': case 'sussurro': {
          // match the longest player name prefix (names can contain spaces)
          const players = Object.values(s.players).sort((a, b) => b.name.length - a.name.length);
          const lower = rest.toLowerCase();
          const target = players.find((pl) => lower.startsWith(pl.name.toLowerCase() + ' ') || lower === pl.name.toLowerCase())
            ?? (/^(mestre|gm|dm)\b/i.test(rest) ? players.find((pl) => pl.role === 'dm') : undefined);
          if (!target) throw new Error('Jogador não encontrado. Use /w Nome mensagem');
          const msg = rest.slice(rest.toLowerCase().startsWith(target.name.toLowerCase()) ? target.name.length : rest.split(' ')[0]!.length).trim();
          if (!msg) throw new Error('Escreva a mensagem depois do nome.');
          ctx.chat.post({ kind: 'text', text: msg, speaker, whisperTo: [target.id] });
          return;
        }
        case 'clear': case 'limpar':
          if (!isDM(ctx)) throw new Error(DM_ONLY);
          ctx.chat.clear();
          return;
        default:
          throw new Error(`Comando desconhecido: /${name}. Tente /r, /gr, /w, /me, /ooc${isDM(ctx) ? ', /desc, /clear' : ''}.`);
      }
    },
  }),

  'chat.delete': defineAction({
    schema: z.object({ id: zId }),
    permit: (_s, p, ctx) => {
      const m = ctx.chat.get(p.id);
      if (!m) return NOT_FOUND;
      return isDM(ctx) || m.authorId === ctx.actor.id ? null : 'Você só pode apagar suas mensagens.';
    },
    apply: (_s, p, ctx) => {
      ctx.chat.remove(p.id);
    },
  }),

  'roll.formula': defineAction({
    schema: z.object({
      formula: z.string().min(1).max(200),
      label: z.string().max(120).optional(),
      mode: zMode,
      visibility: zVisibility,
      speaker: z.string().max(120).nullable().optional(),
    }),
    rate: 30,
    permit: () => null,
    apply: (_s, p, ctx) => {
      const roll = ctx.roll(p.formula, { mode: p.mode });
      const msg = ctx.chat.post({
        kind: 'roll', text: p.label ?? '', speaker: p.speaker ?? null, roll, ...visibilityFields(p.visibility, ctx),
      });
      return { messageId: msg.id, total: roll.total };
    },
  }),

  /** Ability check, saving throw, skill check or initiative from a sheet or a monster token. */
  'roll.check': defineAction({
    schema: z.object({
      ...zRef,
      kind: z.enum(['ability', 'save', 'skill']),
      key: z.string().max(30),
      mode: zMode,
      visibility: zVisibility,
      dc: z.number().int().min(0).max(40).optional(),
    }),
    rate: 30,
    permit: (s, p, ctx) => canActAs(s, p, ctx),
    apply: (s, p, ctx) => {
      let bonus = 0;
      let title = '';
      if (p.kind === 'skill') {
        const skill = p.key as SkillId;
        if (!(skill in SKILL_ABILITY)) throw new Error('Perícia inválida.');
        title = `Teste de ${SKILL_NAME[skill]}`;
      } else {
        const a = p.key as Ability;
        if (!(a in ABILITY_NAME)) throw new Error('Atributo inválido.');
        title = p.kind === 'save' ? `Salvaguarda de ${ABILITY_NAME[a]}` : `Teste de ${ABILITY_NAME[a]}`;
      }
      const actor = actorFrom(s, p.characterId, p.tokenId);
      const charId = p.characterId ?? (p.tokenId ? findToken(s, p.tokenId)?.token.characterId ?? undefined : undefined);
      if (charId && s.characters[charId]) {
        const c = s.characters[charId]!;
        const st = computeStats(c);
        if (p.kind === 'skill') bonus = st.skills[p.key as SkillId];
        else if (p.kind === 'save') bonus = st.saves[p.key as Ability];
        else bonus = st.mods[p.key as Ability];
      } else if (p.tokenId) {
        const t = findToken(s, p.tokenId)?.token;
        const m = t?.monsterId ? ctx.lookup.monster(t.monsterId) : undefined;
        if (m) {
          if (p.kind === 'skill') bonus = monsterSkill(m, p.key as SkillId);
          else if (p.kind === 'save') bonus = monsterSave(m, p.key as Ability);
          else bonus = mod(m.abilities[p.key as Ability]);
        }
      }
      const roll = ctx.roll(`1d20${signedNum(bonus)}`, { mode: p.mode });
      const hidden = actor.hidden && isDM(ctx);
      postCard(ctx, { type: 'check', actorName: actor.name, title, roll, dc: p.dc ?? null }, actor.name, {
        ...visibilityFields(hidden ? 'gm' : p.visibility, ctx),
      });
      return { total: roll.total };
    },
  }),

  /** Weapon / natural attack from a sheet (attackId) or a monster statblock (actionIndex). */
  'roll.attack': defineAction({
    schema: z.object({
      ...zRef,
      sceneId: zId.optional(),
      attackId: zId.optional(),
      actionIndex: z.number().int().min(0).max(60).optional(),
      bonusAction: z.boolean().optional(),
      targets: z.array(zId).max(20),
      mode: zMode,
      visibility: zVisibility,
    }),
    rate: 30,
    permit: (s, p, ctx) => canActAs(s, p, ctx),
    apply: (s, p, ctx) => {
      const actor = actorFrom(s, p.characterId, p.tokenId);
      const charId = p.characterId ?? (p.tokenId ? findToken(s, p.tokenId)?.token.characterId ?? undefined : undefined);
      let title = 'Ataque';
      let toHitBonus: number | null = null;
      let critOn = 20;
      let damage: { formula: string; type: DamageType }[] = [];
      let save: { ability: Ability; dc: number; half: boolean } | null = null;
      let description = '';
      if (charId && s.characters[charId] && p.attackId) {
        const c = s.characters[charId]!;
        const atk = c.attacks.find((a) => a.id === p.attackId);
        if (!atk) throw new Error('Ataque não encontrado na ficha.');
        const st = computeStats(c);
        const am = attackAbilityMod(c, atk, st);
        const vars = characterVars(c, st, am);
        title = atk.name;
        critOn = atk.critOn;
        description = atk.notes;
        damage = atk.damage.map((d) => ({ formula: resolveFormula(d.formula, vars), type: d.type }));
        if (atk.save) {
          save = { ability: atk.save.ability, dc: attackSaveDc(c, atk, st) ?? 10, half: atk.save.half };
        } else {
          toHitBonus = attackToHit(c, atk, st);
        }
      } else if (p.tokenId && p.actionIndex !== undefined) {
        const t = findToken(s, p.tokenId)?.token;
        const m = t?.monsterId ? ctx.lookup.monster(t.monsterId) : undefined;
        const action = m ? (p.bonusAction ? m.bonusActions : m.actions)[p.actionIndex] : undefined;
        if (!action) throw new Error('Ação não encontrada.');
        title = action.name;
        description = action.text;
        if (action.attack) {
          toHitBonus = action.attack.bonus;
          damage = action.attack.damage.map((d) => ({ ...d }));
        } else if (action.save) {
          save = { ability: action.save.ability, dc: action.save.dc, half: action.save.half ?? false };
          damage = (action.save.damage ?? []).map((d) => ({ ...d }));
        }
      } else {
        throw new Error('Ataque inválido.');
      }

      const targets = resolveTargets(s, p.sceneId, p.targets);
      let toHit: RollResult | null = null;
      let crit = false;
      const cardTargets: CardTarget[] = [];
      if (toHitBonus !== null) {
        toHit = ctx.roll(`1d20${signedNum(toHitBonus)}`, { mode: p.mode });
        const nat = firstD20(toHit) ?? 0;
        crit = nat >= critOn;
        const fumble = nat === 1;
        toHit.crit = crit;
        for (const t of targets) {
          const ac = tokenAc(s, t, ctx);
          let outcome: CardTarget['outcome'] = 'pending';
          if (crit) outcome = 'crit';
          else if (fumble) outcome = 'miss';
          else if (ac !== null) outcome = toHit.total >= ac ? 'hit' : 'miss';
          cardTargets.push({ tokenId: t.id, name: t.name, ac, outcome, roll: null, applied: null });
        }
      } else if (save) {
        for (const t of targets) {
          if (isPcToken(s, t)) {
            cardTargets.push({ tokenId: t.id, name: t.name, ac: null, outcome: 'pending', roll: null, applied: null });
          } else {
            cardTargets.push(rollSaveFor(s, t, save.ability, save.dc, ctx));
          }
        }
      }
      const anyHit = toHit === null || targets.length === 0 || cardTargets.some((t) => t.outcome !== 'miss');
      const dmg = anyHit
        ? damage.filter((d) => d.formula.trim()).map((d) => ({
            roll: ctx.roll(crit ? critFormula(d.formula) : d.formula),
            type: d.type,
          }))
        : [];
      const hidden = actor.hidden && isDM(ctx);
      const msg = postCard(ctx, {
        type: 'attack', actorName: actor.name, actorTokenId: actor.tokenId, title,
        subtitle: toHit ? `${signedNum(toHitBonus!)} para acertar` : save ? `Salvaguarda de ${ABILITY_NAME[save.ability]} CD ${save.dc}` : '',
        toHit, damage: dmg, targets: cardTargets, save, description: description.slice(0, 600),
      }, actor.name, visibilityFields(hidden ? 'gm' : p.visibility, ctx));
      if (crit) ctx.fx({ type: 'sfx', id: 'crit' });
      return { messageId: msg.id };
    },
  }),

  /** Cast a spell from a sheet: consumes a slot, rolls attack/save/damage/healing. */
  'roll.spell': defineAction({
    schema: z.object({
      characterId: zId,
      spellRef: z.string().max(80).optional(),
      knownSpellId: zId.optional(),
      slotLevel: z.number().int().min(0).max(9),
      sceneId: zId.optional(),
      targets: z.array(zId).max(30),
      mode: zMode,
      consumeSlot: z.boolean(),
      visibility: zVisibility,
    }),
    rate: 20,
    permit: (s, p, ctx) => {
      const c = s.characters[p.characterId];
      if (!controlsCharacter(c, ctx)) return 'Essa ficha não é sua.';
      return null;
    },
    apply: (s, p, ctx) => {
      const c = s.characters[p.characterId]!;
      const known = p.knownSpellId ? c.spellcasting?.spells.find((x) => x.id === p.knownSpellId) : undefined;
      const ref = known?.ref ?? p.spellRef ?? null;
      const spell = ref ? ctx.lookup.spell(ref) : undefined;
      const name = spell?.name ?? known?.name ?? 'Magia';
      const baseLevel = spell?.level ?? known?.level ?? 0;
      const slotLevel = Math.max(baseLevel, p.slotLevel);
      if (p.consumeSlot && baseLevel > 0) {
        const sc = c.spellcasting;
        const slot = sc?.slots[String(slotLevel)];
        if (slot && slot.used < slot.max) slot.used++;
        else if (sc?.pact && sc.pact.level === slotLevel && sc.pact.used < sc.pact.max) sc.pact.used++;
        else throw new Error(`Sem espaços de magia de ${slotLevel}º nível.`);
      }
      const st = computeStats(c);
      const spellMod = st.spell ? st.mods[st.spell.ability] : 0;
      const vars = characterVars(c, st, spellMod);
      const extraLevels = Math.max(0, slotLevel - baseLevel);
      const cantripTier = baseLevel === 0 ? (st.level >= 17 ? 3 : st.level >= 11 ? 2 : st.level >= 5 ? 1 : 0) : 0;
      const scale = (formula: string): string => {
        let f = resolveFormula(formula, vars);
        const up = spell?.upcast;
        const times = baseLevel === 0 ? cantripTier : extraLevels;
        if (times > 0) {
          if (baseLevel === 0) {
            // cantrips: multiply the first die count
            f = f.replace(/^(\d*)d(\d+)/, (_m, n: string, d: string) => `${Number(n || 1) * (times + 1)}d${d}`);
          } else if (up) {
            f = `${f}+${Array.from({ length: times }, () => resolveFormula(up, vars)).join('+')}`;
          }
        }
        return f;
      };
      if (spell?.concentration) {
        c.concentration = name;
        if (!c.conditions.includes('concentrating')) c.conditions.push('concentrating');
      }
      const targets = resolveTargets(s, p.sceneId, p.targets);
      const levelLabel = baseLevel === 0 ? 'Truque' : `${slotLevel}º nível`;
      const vis = visibilityFields(p.visibility, ctx);

      if (spell?.heal) {
        const roll = ctx.roll(scale(spell.heal));
        postCard(ctx, {
          type: 'attack', actorName: c.name, actorTokenId: null, title: name, subtitle: `${levelLabel} · cura`,
          toHit: null, damage: [{ roll, type: 'healing' }],
          targets: targets.map((t) => ({ tokenId: t.id, name: t.name, ac: null, outcome: 'hit', roll: null, applied: null })),
          save: null, description: spell.description.slice(0, 400),
        }, c.name, vis);
        ctx.fx({ type: 'sfx', id: 'heal' });
        return;
      }
      if (spell && (spell.attack || spell.save)) {
        let toHit: RollResult | null = null;
        let crit = false;
        const cardTargets: CardTarget[] = [];
        const dc = st.spell?.dc ?? 10;
        if (spell.attack) {
          toHit = ctx.roll(`1d20${signedNum(st.spell?.attack ?? 0)}`, { mode: p.mode });
          const nat = firstD20(toHit) ?? 0;
          crit = nat === 20;
          for (const t of targets) {
            const ac = tokenAc(s, t, ctx);
            cardTargets.push({
              tokenId: t.id, name: t.name, ac, roll: null, applied: null,
              outcome: crit ? 'crit' : nat === 1 ? 'miss' : ac === null ? 'pending' : toHit.total >= ac ? 'hit' : 'miss',
            });
          }
        } else if (spell.save) {
          for (const t of targets) {
            cardTargets.push(isPcToken(s, t)
              ? { tokenId: t.id, name: t.name, ac: null, outcome: 'pending', roll: null, applied: null }
              : rollSaveFor(s, t, spell.save, dc, ctx));
          }
        }
        const dmg = (spell.damage ?? []).map((d) => ({
          roll: ctx.roll(crit ? critFormula(scale(d.formula)) : scale(d.formula)),
          type: d.type,
        }));
        postCard(ctx, {
          type: 'attack', actorName: c.name, actorTokenId: null, title: name,
          subtitle: spell.attack ? `${levelLabel} · ataque mágico ${signedNum(st.spell?.attack ?? 0)}` : `${levelLabel} · ${ABILITY_NAME[spell.save!]} CD ${dc}`,
          toHit, damage: dmg, targets: cardTargets,
          save: spell.save ? { ability: spell.save, dc, half: spell.half ?? false } : null,
          description: spell.description.slice(0, 500),
        }, c.name, vis);
        ctx.fx({ type: 'sfx', id: spell.damage?.[0]?.type === 'fire' ? 'fireball' : spell.damage?.[0]?.type === 'lightning' ? 'lightning' : 'magic' });
        return;
      }
      if (spell?.damage?.length) {
        // Auto-hit damage (e.g. Mísseis Mágicos): no attack roll, no save.
        const dmg = spell.damage.map((d) => ({ roll: ctx.roll(scale(d.formula)), type: d.type }));
        postCard(ctx, {
          type: 'attack', actorName: c.name, actorTokenId: null, title: name, subtitle: `${levelLabel} · acerto automático`,
          toHit: null, damage: dmg,
          targets: targets.map((t) => ({ tokenId: t.id, name: t.name, ac: null, outcome: 'hit', roll: null, applied: null })),
          save: null, description: spell.description.slice(0, 500),
        }, c.name, vis);
        ctx.fx({ type: 'sfx', id: 'magic' });
        return;
      }
      postCard(ctx, {
        type: 'spell', actorName: c.name, spellId: ref, title: name, level: slotLevel,
        description: spell?.description ?? known?.notes ?? '',
      }, c.name, vis);
      ctx.fx({ type: 'sfx', id: 'magic' });
    },
  }),

  /** DM asks targets for a saving throw; NPC saves are rolled automatically. */
  'save.request': defineAction({
    schema: z.object({
      sceneId: zId.optional(),
      tokenIds: z.array(zId).min(1).max(40),
      ability: zAbility,
      dc: z.number().int().min(1).max(40),
      title: z.string().max(120).optional(),
      damage: z.object({ formula: z.string().max(80), type: zDamageType }).nullable().optional(),
      half: z.boolean().optional(),
    }),
    permit: (s, p, ctx) => (isDM(ctx) ? null : DM_ONLY),
    apply: (s, p, ctx) => {
      const targets = resolveTargets(s, p.sceneId, p.tokenIds);
      const cardTargets = targets.map((t) => (isPcToken(s, t)
        ? { tokenId: t.id, name: t.name, ac: null, outcome: 'pending' as const, roll: null, applied: null }
        : rollSaveFor(s, t, p.ability, p.dc, ctx)));
      const damage = p.damage?.formula ? { roll: ctx.roll(p.damage.formula), type: p.damage.type } : null;
      postCard(ctx, {
        type: 'saveRequest', title: p.title || `Salvaguarda de ${ABILITY_NAME[p.ability]}`, ability: p.ability, dc: p.dc,
        damage, half: p.half ?? true, targets: cardTargets,
      }, 'Mestre');
    },
  }),

  /** A player (or DM) rolls the pending save of a card target. */
  'card.rollSave': defineAction({
    schema: z.object({ messageId: zId, targetIndex: z.number().int().min(0).max(40), mode: zMode }),
    rate: 30,
    permit: (s, p, ctx) => {
      const m = ctx.chat.get(p.messageId);
      const card = m?.card;
      if (!card || (card.type !== 'saveRequest' && card.type !== 'attack')) return NOT_FOUND;
      const target = card.targets[p.targetIndex];
      if (!target?.tokenId) return NOT_FOUND;
      if (target.outcome !== 'pending') return 'Essa salvaguarda já foi rolada.';
      const tok = findToken(s, target.tokenId)?.token;
      return controlsToken(s, tok, ctx) ? null : 'Esse personagem não é seu.';
    },
    apply: (s, p, ctx) => {
      const m = ctx.chat.get(p.messageId)!;
      const card = m.card as Extract<ChatCard, { type: 'saveRequest' | 'attack' }>;
      const target = card.targets[p.targetIndex]!;
      const tok = findToken(s, target.tokenId!)!.token;
      const ability = card.type === 'saveRequest' ? card.ability : card.save?.ability;
      const dc = card.type === 'saveRequest' ? card.dc : card.save?.dc;
      if (!ability || dc === undefined) throw new Error('Esse card não pede salvaguarda.');
      const bonus = tokenSave(s, tok, ability, ctx);
      const roll = ctx.roll(`1d20${signedNum(bonus)}`, { mode: p.mode });
      target.roll = roll;
      target.outcome = roll.total >= dc ? 'success' : 'fail';
      ctx.chat.update(m);
      ctx.fx({ type: 'dice3d', messageId: m.id, playerId: ctx.actor.id, color: ctx.actor.color, dice: [{ sides: 20, value: firstD20(roll) ?? 1 }], crit: false, fumble: false });
    },
  }),

  /** DM applies the card's damage (or healing) to one/all targets with a multiplier. */
  'card.apply': defineAction({
    schema: z.object({
      messageId: zId,
      targetIndex: z.number().int().min(-1).max(40),
      multiplier: z.union([z.literal(0), z.literal(0.25), z.literal(0.5), z.literal(1), z.literal(2)]),
    }),
    permit: (s, p, ctx) => {
      if (!isDM(ctx)) return DM_ONLY;
      const m = ctx.chat.get(p.messageId);
      if (!m?.card || (m.card.type !== 'attack' && m.card.type !== 'saveRequest')) return NOT_FOUND;
      return null;
    },
    apply: (s, p, ctx) => {
      const m = ctx.chat.get(p.messageId)!;
      const card = m.card as Extract<ChatCard, { type: 'saveRequest' | 'attack' }>;
      const parts = card.type === 'attack' ? card.damage : card.damage ? [card.damage] : [];
      const healing = parts.length > 0 && parts.every((d) => d.type === 'healing');
      const base = parts.reduce((acc, d) => acc + d.roll.total, 0);
      const half = card.type === 'saveRequest' ? card.half : card.save?.half ?? false;
      const indices = p.targetIndex < 0 ? card.targets.map((_t, i) => i) : [p.targetIndex];
      const lines: string[] = [];
      for (const i of indices) {
        const tgt = card.targets[i];
        if (!tgt?.tokenId) continue;
        if (!healing && card.type === 'attack' && card.toHit && tgt.outcome === 'miss' && p.targetIndex < 0) continue;
        let amount = base;
        if (!healing && tgt.outcome === 'success') amount = half ? Math.floor(base / 2) : 0;
        amount = Math.floor(amount * p.multiplier);
        const found = findToken(s, tgt.tokenId);
        if (!found) continue;
        const hpTarget = hpTargetForToken(s, found.token);
        if (!hpTarget) continue;
        lines.push(applyHp(s, hpTarget, amount, healing ? 'heal' : 'damage', ctx));
        tgt.applied = (tgt.applied ?? 0) + (healing ? -amount : amount);
      }
      ctx.chat.update(m);
      if (lines.length) ctx.chat.post({ kind: 'system', text: lines.join('\n') });
    },
  }),
};

export { splitFormulaLabel as _splitFormulaLabel };
export type { DamageType };
