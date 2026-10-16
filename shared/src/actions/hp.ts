// Hit point bookkeeping shared by token actions and chat cards (apply damage / healing).
import type { CampaignState, HitPoints, ID, Token } from '../types.ts';
import type { ActionCtx } from './define.ts';

export interface HpTarget {
  name: string;
  hp: HitPoints;
  /** Conditions array to mutate (character or token). */
  conditions: string[];
  isPc: boolean;
  concentration: string | null;
  deathSaves: { success: number; fail: number } | null;
  tokenId: ID | null;
}

/** Resolves where HP lives for a token (linked character sheet or the token itself). */
export function hpTargetForToken(s: CampaignState, token: Token): HpTarget | null {
  if (token.characterId) {
    const c = s.characters[token.characterId];
    if (c) {
      return {
        name: c.name,
        hp: c.hp,
        conditions: c.conditions,
        isPc: c.kind === 'pc',
        concentration: c.concentration,
        deathSaves: c.deathSaves,
        tokenId: token.id,
      };
    }
  }
  if (!token.hp) token.hp = { cur: 0, max: 0, temp: 0 };
  return {
    name: token.name,
    hp: token.hp,
    conditions: token.conditions,
    isPc: false,
    concentration: null,
    deathSaves: null,
    tokenId: token.id,
  };
}

function addCondition(list: string[], id: string): void {
  if (!list.includes(id)) list.push(id);
}

function removeCondition(list: string[], id: string): void {
  const i = list.indexOf(id);
  if (i >= 0) list.splice(i, 1);
}

/**
 * Apply damage (amount > 0) or healing (amount < 0 via heal=true) to a target in a draft.
 * Returns a PT-BR summary line for the chat.
 */
export function applyHp(
  s: CampaignState,
  target: HpTarget,
  amount: number,
  kind: 'damage' | 'heal' | 'temp',
  ctx: ActionCtx,
): string {
  const hp = target.hp;
  amount = Math.max(0, Math.round(amount));
  if (kind === 'temp') {
    hp.temp = Math.max(hp.temp, amount);
    return `${target.name} recebe ${amount} PV temporários.`;
  }
  if (kind === 'heal') {
    const wasDown = hp.cur <= 0;
    const before = hp.cur;
    hp.cur = Math.min(hp.max, Math.max(0, hp.cur) + amount);
    if (wasDown && hp.cur > 0) {
      removeCondition(target.conditions, 'unconscious');
      removeCondition(target.conditions, 'dead');
      if (target.deathSaves) {
        target.deathSaves.success = 0;
        target.deathSaves.fail = 0;
      }
      markDefeated(s, target.tokenId, false);
    }
    return `${target.name} recupera ${hp.cur - Math.max(0, before)} PV (${hp.cur}/${hp.max}).`;
  }
  // damage
  let remaining = amount;
  const absorbed = Math.min(hp.temp, remaining);
  hp.temp -= absorbed;
  remaining -= absorbed;
  const wasDown = hp.cur <= 0;
  const before = hp.cur;
  hp.cur = Math.max(0, hp.cur - remaining);
  const parts: string[] = [`${target.name} sofre ${amount} de dano${absorbed ? ` (${absorbed} absorvidos)` : ''}`];

  if (target.isPc) {
    if (wasDown && remaining > 0 && target.deathSaves) {
      target.deathSaves.fail = Math.min(3, target.deathSaves.fail + 1);
      parts.push(`falha em teste de morte (${target.deathSaves.fail}/3)`);
      if (target.deathSaves.fail >= 3) {
        addCondition(target.conditions, 'dead');
        parts.push('💀 morreu');
      }
    } else if (hp.cur === 0 && before > 0) {
      const overflow = remaining - before;
      if (overflow >= hp.max) {
        addCondition(target.conditions, 'dead');
        parts.push('💀 morte instantânea (dano massivo)');
      } else {
        addCondition(target.conditions, 'unconscious');
        addCondition(target.conditions, 'prone');
        parts.push('cai inconsciente');
      }
    }
  } else if (hp.cur === 0 && before > 0) {
    addCondition(target.conditions, 'dead');
    markDefeated(s, target.tokenId, true);
    parts.push('foi derrotado');
  }
  if (target.concentration && remaining > 0 && hp.cur > 0) {
    const dc = Math.max(10, Math.floor(remaining / 2));
    parts.push(`teste de Concentração CD ${dc} (${target.concentration})`);
  }
  void ctx;
  return `${parts.join(' — ')}.`;
}

function markDefeated(s: CampaignState, tokenId: ID | null, defeated: boolean): void {
  if (!tokenId || !s.combat) return;
  for (const c of s.combat.combatants) if (c.tokenId === tokenId) c.defeated = defeated;
}
