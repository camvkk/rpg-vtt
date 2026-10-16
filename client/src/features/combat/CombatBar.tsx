import { ChevronLeft, ChevronRight, Dices, EyeOff, Play, Skull, Square, Swords } from 'lucide-react';
import { hpStatus } from '@shared/rules5e.ts';
import type { Combatant } from '@shared/types.ts';
import { engineApi } from '../../engine/api.ts';
import { act, assetUrlSafe } from './util.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM, useViewSceneId } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { IconButton } from '../../ui/index.tsx';
import './combat.css';

export function CombatBar() {
  const combat = useGame((s) => s.state?.combat ?? null);
  const viewSceneId = useViewSceneId();
  const isDM = useIsDM();
  const me = useGame((s) => s.me);
  if (!combat || combat.sceneId !== viewSceneId) return null;
  const needsMine = !combat.started && combat.combatants.some((c) => me && c.ownerIds.includes(me.id) && c.initiative === null);

  return (
    <div className="combatbar">
      <div className="combatbar__inner panel">
        <div className="combatbar__round">
          <Swords size={14} />
          {combat.started ? <><span className="u-display">Rodada</span><strong>{combat.round}</strong></> : <span className="u-display">Iniciativa</span>}
        </div>
        <div className="combatbar__list">
          {combat.combatants.map((c, i) => (
            <Portrait key={c.id} c={c} active={combat.started && i === combat.turn} />
          ))}
          {combat.combatants.length === 0 && <span className="u-xs u-muted" style={{ padding: '0 8px' }}>Nenhum combatente</span>}
        </div>
        <div className="combatbar__controls">
          {needsMine && (
            <button type="button" className="btn btn--sm btn--primary" onClick={(e) => act('combat.roll', { who: 'mine', mode: e.shiftKey ? 'adv' : useUi.getState().rollMode })}>
              <Dices /> Rolar iniciativa
            </button>
          )}
          {isDM && !combat.started && (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => act('combat.begin', {})}><Play /> Começar</button>
          )}
          {isDM && combat.started && (
            <>
              <IconButton size="sm" icon={<ChevronLeft />} label="Turno anterior" onClick={() => act('combat.prev', {})} />
              <IconButton size="sm" icon={<ChevronRight />} label="Próximo turno" onClick={() => act('combat.next', { expectedTurn: combat.turn })} />
            </>
          )}
          {isDM && <IconButton size="sm" icon={<Square />} label="Encerrar combate" danger onClick={() => act('combat.end', {})} />}
        </div>
      </div>
    </div>
  );
}

function Portrait({ c, active }: { c: Combatant; active: boolean }) {
  const isDM = useIsDM();
  const token = useGame((s) => {
    const st = s.state;
    const sc = st?.combat ? st.scenes[st.combat.sceneId] : undefined;
    return c.tokenId && sc ? sc.tokens[c.tokenId] : undefined;
  });
  const character = useGame((s) => (c.characterId ? s.state?.characters[c.characterId] : undefined));
  const hp = character?.hp ?? token?.hp ?? null;
  const masked = !!token?.hpMasked;
  const pct = hp && hp.max > 0 ? Math.max(0, Math.min(1, hp.cur / hp.max)) : null;
  const color = hp && masked ? hpStatus(hp.cur, hp.max).color : pct === null ? undefined : pct > 0.5 ? '#3fbf8f' : pct > 0.25 ? '#f0a43a' : '#e2554d';
  const img = assetUrlSafe(c.img ?? token?.img ?? character?.portrait ?? null);
  const initials = c.name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('');
  return (
    <button
      type="button"
      className="cb-portrait"
      data-active={active ? 'true' : undefined}
      data-defeated={c.defeated ? 'true' : undefined}
      data-hidden={c.hidden ? 'true' : undefined}
      data-tip={`${c.name}${c.initiative !== null ? ` — iniciativa ${c.initiative}` : ''}`}
      onClick={() => c.tokenId && engineApi.focusToken(c.tokenId)}
      onDoubleClick={() => c.characterId && useUi.getState().openSheet(c.characterId)}
    >
      <span className="cb-portrait__img">
        {img ? <img src={img} alt="" /> : <span>{initials}</span>}
        {c.defeated && <Skull className="cb-portrait__dead" />}
        {c.hidden && isDM && <EyeOff className="cb-portrait__hid" />}
      </span>
      <span className="cb-portrait__init">{c.initiative ?? '–'}</span>
      {pct !== null && <span className="cb-portrait__hp"><i style={{ width: `${pct * 100}%`, background: color }} /></span>}
    </button>
  );
}
