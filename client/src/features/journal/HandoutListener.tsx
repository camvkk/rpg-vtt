// Headless: pops a handout open when the DM uses "Mostrar aos jogadores".
import { useEffect } from 'react';
import { onFx } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useUi } from '../../store/ui.ts';

export function HandoutListener(): null {
  useEffect(
    () =>
      onFx((e) => {
        if (e.type !== 'handout') return;
        // The DM triggered it from the Diário (and already got a confirmation toast there).
        if (useGame.getState().me?.role === 'dm') return;
        useUi.getState().set({ handoutId: e.journalId });
      }),
    [],
  );
  return null;
}
