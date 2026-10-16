// Convenience selectors.
import { useMemo } from 'react';
import { computeStats } from '@shared/rules5e.ts';
import type { Character, CustomSystem, ID, Scene, Token } from '@shared/types.ts';
import { useGame } from './game.ts';
import { useUi } from './ui.ts';

export const useIsDM = () => useGame((s) => s.me?.role === 'dm');

/** The campaign's custom system while sheets use it (settings.system === 'custom'), else null. */
export const useActiveCustomSystem = (): CustomSystem | null =>
  useGame((s) => (s.state?.settings.system === 'custom' ? s.state.customSystem ?? null : null));
export const useMe = () => useGame((s) => s.me);
export const useCampaign = () => useGame((s) => s.state);

/** Scene being displayed: DM may preview another scene; players always see the active one. */
export function useViewSceneId(): ID | null {
  const isDM = useIsDM();
  const active = useGame((s) => s.state?.activeSceneId ?? null);
  const view = useUi((s) => s.viewSceneId);
  const exists = useGame((s) => (view ? !!s.state?.scenes[view] : false));
  return isDM && view && exists ? view : active;
}

export function useScene(): Scene | null {
  const id = useViewSceneId();
  return useGame((s) => (id ? s.state?.scenes[id] ?? null : null));
}

export function getViewScene(): Scene | null {
  const g = useGame.getState();
  const st = g.state;
  if (!st) return null;
  const view = useUi.getState().viewSceneId;
  const id = g.me?.role === 'dm' && view && st.scenes[view] ? view : st.activeSceneId;
  return id ? st.scenes[id] ?? null : null;
}

export function useCharacter(id: ID | null | undefined): Character | null {
  return useGame((s) => (id ? s.state?.characters[id] ?? null : null));
}

export function useMyCharacter(): Character | null {
  return useGame((s) => {
    const me = s.me;
    const st = s.state;
    if (!me || !st) return null;
    if (me.characterId && st.characters[me.characterId]) return st.characters[me.characterId]!;
    return Object.values(st.characters).find((c) => c.ownerId === me.id) ?? null;
  });
}

export function useStats(c: Character | null) {
  return useMemo(() => (c ? computeStats(c) : null), [c]);
}

export function useSelectedTokens(): Token[] {
  const scene = useScene();
  const sel = useUi((s) => s.selection);
  return useMemo(() => (scene ? sel.map((id) => scene.tokens[id]).filter((t): t is Token => !!t) : []), [scene, sel]);
}

export function canControl(token: Token): boolean {
  const g = useGame.getState();
  const me = g.me;
  if (!me) return false;
  if (me.role === 'dm') return true;
  if (token.ownerIds.includes(me.id)) return true;
  const c = token.characterId ? g.state?.characters[token.characterId] : undefined;
  return !!c && c.ownerId === me.id;
}

export function playerName(id: ID | null | undefined): string {
  if (!id) return '';
  return useGame.getState().state?.players[id]?.name ?? '';
}
