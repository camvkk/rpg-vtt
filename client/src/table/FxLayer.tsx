import { useEffect, useRef, useState } from 'react';
import { Swords } from 'lucide-react';
import { Dice3DOverlay, type Dice3DHandle } from '../features/dice3d/index.ts';
import { AudioSync } from '../features/audio/AudioSync.tsx';
import { AudioEngine } from '../features/audio/engine/index.ts';
import { HandoutListener } from '../features/journal/HandoutListener.tsx';
import { getPref } from '../net/session.ts';
import { onFx } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { useUi } from '../store/ui.ts';
import { toast } from '../ui/index.tsx';

type DieSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;
const SUPPORTED = new Set([4, 6, 8, 10, 12, 20, 100]);

export function FxLayer() {
  const dice = useRef<Dice3DHandle | null>(null);
  const [banner, setBanner] = useState<{ name: string; key: number } | null>(null);

  useEffect(() => {
    const offFx = onFx((e) => {
      if (e.type === 'dice3d') {
        const handle = dice.current;
        const enabled = getPref('dice3d', true) && !document.hidden;
        const list = e.dice.filter((d) => SUPPORTED.has(d.sides)).map((d) => ({ sides: d.sides as DieSides, value: d.value }));
        if (!handle || !enabled || !list.length) return;
        useUi.getState().addPendingDice(e.messageId);
        const safety = window.setTimeout(() => useUi.getState().resolveDice(e.messageId), 7000);
        void handle.roll({ dice: list, color: e.color, crit: e.crit, fumble: e.fumble }).finally(() => {
          window.clearTimeout(safety);
          useUi.getState().resolveDice(e.messageId);
          if (e.crit) AudioEngine.get().playSfx('crit');
          else if (e.fumble) AudioEngine.get().playSfx('fumble');
        });
      } else if (e.type === 'turn') {
        const me = useGame.getState().me;
        if (me && e.ownerIds.includes(me.id)) {
          setBanner({ name: e.name, key: Date.now() });
          window.setTimeout(() => setBanner(null), 2600);
        }
      } else if (e.type === 'toast') {
        toast(e.text, e.tone);
      } else if (e.type === 'target') {
        // other players' targets are informational only (shown in their own UI)
      }
    });
    const onThunder = () => AudioEngine.get().playSfx('thunder', { volume: 0.7 });
    const onSfx = (ev: Event) => AudioEngine.get().playSfx((ev as CustomEvent<string>).detail as Parameters<AudioEngine['playSfx']>[0]);
    window.addEventListener('vtt:thunder', onThunder);
    window.addEventListener('vtt:sfx', onSfx);
    return () => {
      offFx();
      window.removeEventListener('vtt:thunder', onThunder);
      window.removeEventListener('vtt:sfx', onSfx);
    };
  }, []);

  return (
    <>
      <Dice3DOverlay onReady={(h) => {
        dice.current = h;
        h.setSoundEnabled(!useUi.getState().muted);
      }} />
      <AudioSync />
      <HandoutListener />
      {banner && (
        <div className="turn-banner" key={banner.key} role="status">
          <Swords />
          <div>
            <div className="turn-banner__title">Sua vez!</div>
            <div className="turn-banner__name">{banner.name}</div>
          </div>
        </div>
      )}
    </>
  );
}
