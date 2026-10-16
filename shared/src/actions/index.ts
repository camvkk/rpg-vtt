import type { z } from 'zod';
import { campaignActions } from './campaign.ts';
import { characterActions } from './character.ts';
import { combatActions } from './combat.ts';
import { mapActions } from './map.ts';
import { rollActions } from './rolls.ts';
import { sceneActions } from './scene.ts';
import { tokenActions } from './token.ts';
import type { ActionDef } from './define.ts';

export const ACTIONS = {
  ...sceneActions,
  ...mapActions,
  ...tokenActions,
  ...characterActions,
  ...combatActions,
  ...campaignActions,
  ...rollActions,
};

export type Actions = typeof ACTIONS;
export type ActionType = keyof Actions;
export type ActionPayload<T extends ActionType> = Actions[T] extends ActionDef<infer S, unknown> ? z.input<S> : never;
export type ActionResult<T extends ActionType> = Actions[T] extends ActionDef<z.ZodType, infer R> ? R : never;

export function getAction(type: string): ActionDef | undefined {
  return Object.prototype.hasOwnProperty.call(ACTIONS, type) ? (ACTIONS as Record<string, ActionDef>)[type] : undefined;
}

export * from './define.ts';
export { sortCombatants } from './combat.ts';
export { splitFormulaLabel } from './rolls.ts';
