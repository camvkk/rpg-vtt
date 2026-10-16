import { useMemo } from 'react';
import { Dices, Eye, EyeOff, Flag, Play, Skull, Swords, Trash2, UserPlus, X } from 'lucide-react';
import { CONDITIONS_BY_ID } from '@shared/data5e/conditions.ts';
import { engineApi } from '../../engine/api.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM, useScene } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, Empty, IconButton } from '../../ui/index.tsx';
import './combat.css';

export default function CombatPanel() {
  const combat = useGame((s) => s.state?.combat ?? null);
  const isDM = useIsDM();
  const scene = useScene();
  const selection = useUi((s) => s.selection);
  const me = useGame((s) => s.me);

  const candidates = useMemo(() => {
    if (!scene) return [];
    const sel = selection.map((id) => scene.tokens[id]).filter(Boolean);
    if (sel.length) return sel.map((t) => t!.id);
    return Object.values(scene.tokens).filter((t) => !t.conditions.includes('dead')).map((t) => t.id);
  }, [scene, selection]);

  if (!combat) {
    return (
      <div className="combat-panel u-scroll">
        <Empty icon={<Swords />} title="Nenhum combate em andamento">
          {isDM ? (
            <div className="u-col u-gap-3" style={{ alignItems: 'center', marginTop: 8 }}>
              <span>Selecione os tokens no mapa (ou deixe sem seleção para incluir todos) e comece.</span>
              <Button variant="primary" icon={<Swords />} disabled={!scene || !candidates.length} onClick={() => scene && act('combat.start', { sceneId: scene.id, tokenIds: candidates })}>
                Iniciar combate ({candidates.length})
              </Button>
            </div>
          ) : 'Quando o Mestre iniciar um combate, a ordem de iniciativa aparece aqui.'}
        </Empty>
      </div>
    );
  }

  const current = combat.started && combat.turn >= 0 ? combat.combatants[combat.turn] : undefined;
  const timersByToken = new Map<string, { condition: string; rounds: number }[]>();
  for (const t of combat.timers) {
    if (!t.targetTokenId) continue;
    const list = timersByToken.get(t.targetTokenId) ?? [];
    list.push({ condition: t.condition, rounds: t.rounds });
    timersByToken.set(t.targetTokenId, list);
  }

  return (
    <div className="combat-panel">
      <div className="combat-panel__head">
        <div>
          <div className="u-display u-gold" style={{ fontSize: 18 }}>{combat.started ? `Rodada ${combat.round}` : 'Preparando combate'}</div>
          <div className="u-xs u-muted">{current ? `Vez de ${current.name}` : 'Rolem iniciativa'}</div>
        </div>
        <div className="u-row u-gap-1">
          {isDM && !combat.started && <Button size="sm" variant="primary" icon={<Play />} onClick={() => act('combat.begin', {})}>Começar</Button>}
          {isDM && combat.started && <Button size="sm" variant="primary" icon={<Flag />} onClick={() => act('combat.next', { expectedTurn: combat.turn })}>Próximo</Button>}
        </div>
      </div>
      <div className="combat-panel__tools">
        {!isDM && combat.combatants.some((c) => me && c.ownerIds.includes(me.id) && c.initiative === null) && (
          <Button size="sm" variant="primary" icon={<Dices />} onClick={() => act('combat.roll', { who: 'mine' })}>Rolar minha iniciativa</Button>
        )}
        {isDM && (
          <>
            <Button size="sm" icon={<Dices />} onClick={() => act('combat.roll', { who: 'npcs' })}>Rolar NPCs</Button>
            <Button size="sm" icon={<Dices />} onClick={() => act('combat.roll', { who: 'all' })}>Rolar todos</Button>
            <Button size="sm" icon={<UserPlus />} disabled={!selection.length} onClick={() => act('combat.add', { tokenIds: selection })}>Adicionar seleção</Button>
            <Button size="sm" variant="danger" icon={<X />} onClick={() => act('combat.end', {})}>Encerrar</Button>
          </>
        )}
      </div>
      <div className="combat-panel__list u-scroll">
        {combat.combatants.map((c, i) => {
          const active = combat.started && i === combat.turn;
          const timers = c.tokenId ? timersByToken.get(c.tokenId) ?? [] : [];
          return (
            <div key={c.id} className="cp-row" data-active={active ? 'true' : undefined} data-defeated={c.defeated ? 'true' : undefined}>
              {isDM ? (
                <input
                  className="input input--sm input--num cp-row__init"
                  type="number"
                  defaultValue={c.initiative ?? ''}
                  key={`${c.id}:${c.initiative}`}
                  placeholder="–"
                  onBlur={(e) => {
                    const v = e.target.value === '' ? null : Math.round(Number(e.target.value));
                    if (v !== c.initiative) void act('combat.setInitiative', { combatantId: c.id, value: Number.isFinite(v as number) ? v : null });
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                />
              ) : (
                <span className="cp-row__init cp-row__init--ro">{c.initiative ?? '–'}</span>
              )}
              <button type="button" className="cp-row__name u-ellipsis" onClick={() => c.tokenId && engineApi.focusToken(c.tokenId)}>
                {c.name}
                {timers.length > 0 && (
                  <span className="cp-row__timers">
                    {timers.map((t, k) => <span key={k} className="badge">{CONDITIONS_BY_ID[t.condition]?.name ?? t.condition} {t.rounds}r</span>)}
                  </span>
                )}
              </button>
              {isDM && (
                <span className="cp-row__actions">
                  <IconButton size="sm" icon={c.hidden ? <EyeOff /> : <Eye />} label={c.hidden ? 'Revelar na ordem' : 'Ocultar da ordem'} onClick={() => act('combat.update', { combatantId: c.id, patch: { hidden: !c.hidden } })} />
                  <IconButton size="sm" icon={<Skull />} label={c.defeated ? 'Reviver' : 'Marcar derrotado'} active={c.defeated} onClick={() => act('combat.update', { combatantId: c.id, patch: { defeated: !c.defeated } })} />
                  <IconButton size="sm" icon={<Trash2 />} label="Remover do combate" danger onClick={() => act('combat.remove', { combatantId: c.id })} />
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="combat-panel__foot u-xs u-dim">
        Dica: o jogador da vez move o próprio token e encerra o turno pela barra de baixo. Condições com duração expiram sozinhas.
      </div>
    </div>
  );
}
