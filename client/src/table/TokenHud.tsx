import { useEffect, useRef, useState } from 'react';
import {
  Copy, Eye, EyeOff, Flame, FlameKindling, Heart, Lock, MoreHorizontal, ScrollText, Shield, Skull, Sparkles, Swords,
  Target, Trash2, Unlock, UserRoundCog, Users,
} from 'lucide-react';
import { CONDITIONS } from '@shared/data5e/conditions.ts';
import { MONSTERS_BY_ID } from '@shared/data5e/monsters/index.ts';
import { LIGHT_PRESETS } from '@shared/defaults.ts';
import { computeStats, hpStatus } from '@shared/rules5e.ts';
import type { Token } from '@shared/types.ts';
import { engineApi } from '../engine/api.ts';
import { act, sendFx } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { canControl, useIsDM, useScene } from '../store/hooks.ts';
import { useUi } from '../store/ui.ts';
import { ConditionIcon } from '../ui/conditionIcons.tsx';
import { confirmDialog, HpBar, IconButton, MenuItem, Popover, Segmented } from '../ui/index.tsx';

export function TokenHud() {
  const scene = useScene();
  const selection = useUi((s) => s.selection);
  const token = selection.length === 1 && scene ? scene.tokens[selection[0]!] ?? null : null;
  const [pos, setPos] = useState<{ x: number; y: number; below: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Follow the token on screen.
  useEffect(() => {
    if (!token || !scene) {
      setPos(null);
      return;
    }
    let raf = 0;
    let last = '';
    const loop = () => {
      const t = useGame.getState().state?.scenes[scene.id]?.tokens[token.id];
      if (t) {
        const s = Math.max(0.25, t.size) * scene.grid.size;
        const top = engineApi.worldToScreen(t.x + s / 2, t.y);
        const bottom = engineApi.worldToScreen(t.x + s / 2, t.y + s);
        const h = ref.current?.offsetHeight ?? 120;
        const below = top.y - h - 70 < 60;
        const key = `${Math.round(top.x)},${Math.round(below ? bottom.y : top.y)},${below}`;
        if (key !== last) {
          last = key;
          setPos({ x: top.x, y: below ? bottom.y + 34 : top.y - 26, below });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [token?.id, scene?.id, scene?.grid.size]);

  if (!token || !scene || !pos) return null;
  if (!canControl(token) && !useGame.getState().me) return null;
  return (
    <div
      ref={ref}
      className="token-hud panel panel--raised"
      style={{ left: pos.x, top: pos.y, transform: pos.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <HudBody token={token} sceneId={scene.id} />
    </div>
  );
}

function HudBody({ token, sceneId }: { token: Token; sceneId: string }) {
  const isDM = useIsDM();
  const character = useGame((s) => (token.characterId ? s.state?.characters[token.characterId] ?? null : null));
  const combat = useGame((s) => s.state?.combat ?? null);
  const me = useGame((s) => s.me);
  const players = useGame((s) => s.state?.players);
  const targets = useUi((s) => s.targets);
  const preview = useUi((s) => s.visionPreviewTokenId);
  const [amount, setAmount] = useState('');
  const [condAnchor, setCondAnchor] = useState<HTMLElement | null>(null);
  const [moreAnchor, setMoreAnchor] = useState<HTMLElement | null>(null);
  const control = canControl(token);
  const monster = token.monsterId ? MONSTERS_BY_ID[token.monsterId] : undefined;
  const hp = character ? character.hp : token.hp;
  const ac = character ? computeStats(character).ac : token.ac ?? monster?.ac ?? null;
  const conditions = character ? character.conditions : token.conditions;
  const targeted = targets.includes(token.id);
  const inCombat = !!combat?.combatants.some((c) => c.tokenId === token.id);

  useEffect(() => {
    const onMenu = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; x: number; y: number }>).detail;
      if (d.id === token.id) setMoreAnchor(document.querySelector('.token-hud') as HTMLElement);
    };
    window.addEventListener('vtt:token-menu', onMenu);
    return () => window.removeEventListener('vtt:token-menu', onMenu);
  }, [token.id]);

  const applyHp = (op: 'damage' | 'heal' | 'temp') => {
    const n = Math.abs(parseInt(amount, 10));
    if (!Number.isFinite(n) || n <= 0) return;
    void act('token.hp', { sceneId, ids: [token.id], op, amount: n });
    setAmount('');
  };

  const toggleTarget = () => {
    useUi.getState().toggleTarget(token.id);
    if (me) sendFx({ type: 'target', playerId: me.id, tokenIds: useUi.getState().targets });
  };

  const masked = !!token.hpMasked;
  const status = hp && masked ? hpStatus(hp.cur, hp.max) : null;

  return (
    <div className="hud">
      <div className="hud__head">
        <div className="hud__name u-display u-ellipsis">{token.name}</div>
        {ac !== null && !masked && <span className="hud__ac" data-tip="Classe de Armadura"><Shield size={13} />{ac}</span>}
        {token.hidden && <span className="badge badge--dm">Oculto</span>}
      </div>
      {hp && hp.max > 0 && (
        <div className="hud__hp">
          <HpBar cur={hp.cur} max={hp.max} temp={hp.temp} masked={masked} />
          <span className="hud__hp-text u-tabular" style={status ? { color: status.color } : undefined}>
            {status ? status.label : `${hp.cur}/${hp.max}${hp.temp ? ` +${hp.temp}` : ''}`}
          </span>
        </div>
      )}
      {control && hp && (
        <div className="hud__hp-edit">
          <input
            className="input input--sm input--num"
            inputMode="numeric"
            placeholder="±PV"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyHp(e.shiftKey ? 'heal' : 'damage');
            }}
          />
          <button type="button" className="btn btn--sm btn--danger" onClick={() => applyHp('damage')} data-tip="Dano (Enter)"><Swords /> Dano</button>
          <button type="button" className="btn btn--sm btn--success" onClick={() => applyHp('heal')} data-tip="Cura (Shift+Enter)"><Heart /> Cura</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => applyHp('temp')} data-tip="PV temporários">Temp</button>
        </div>
      )}
      {conditions.length > 0 && (
        <div className="hud__conds">
          {conditions.map((c) => (
            <button key={c} type="button" className="hud__cond" data-tip={CONDITIONS.find((x) => x.id === c)?.name ?? c} disabled={!control}
              onClick={() => act('token.conditions', { sceneId, ids: [token.id], toggle: c })}>
              <ConditionIcon id={c} size={13} />
            </button>
          ))}
        </div>
      )}
      <div className="hud__actions">
        {character && <IconButton size="sm" icon={<ScrollText />} label="Abrir ficha" onClick={() => useUi.getState().openSheet(character.id)} />}
        {monster && isDM && <IconButton size="sm" icon={<Skull />} label="Ver bloco de estatísticas" onClick={() => {
          useUi.getState().openSidebar('compendium');
          window.dispatchEvent(new CustomEvent('vtt:open-monster', { detail: { id: monster.id, tokenId: token.id } }));
        }} />}
        <IconButton size="sm" icon={<Target />} label={targeted ? 'Remover alvo (T)' : 'Marcar como alvo (T)'} active={targeted} onClick={toggleTarget} />
        {control && <IconButton size="sm" icon={<Sparkles />} label="Condições" onClick={(e) => setCondAnchor(e.currentTarget)} />}
        {control && (
          <IconButton
            size="sm"
            icon={token.light ? <Flame /> : <FlameKindling />}
            label={token.light ? 'Apagar tocha' : 'Acender tocha'}
            active={!!token.light}
            onClick={() => act('token.update', { sceneId, id: token.id, patch: { light: token.light ? null : LIGHT_PRESETS.torch!.light } })}
          />
        )}
        {isDM && (
          <>
            <IconButton size="sm" dm icon={token.hidden ? <Eye /> : <EyeOff />} label={token.hidden ? 'Revelar aos jogadores' : 'Ocultar dos jogadores'} active={token.hidden}
              onClick={() => act('token.update', { sceneId, id: token.id, patch: { hidden: !token.hidden } })} />
            <IconButton size="sm" dm icon={<Users />} label={preview === token.id ? 'Parar de ver como este token' : 'Ver o que este token vê'} active={preview === token.id}
              onClick={() => useUi.getState().set({ visionPreviewTokenId: preview === token.id ? null : token.id })} />
            {combat && !inCombat && (
              <IconButton size="sm" dm icon={<Swords />} label="Adicionar ao combate" onClick={() => act('combat.add', { tokenIds: useUi.getState().selection.length ? useUi.getState().selection : [token.id] })} />
            )}
          </>
        )}
        <IconButton size="sm" icon={<MoreHorizontal />} label="Mais opções" onClick={(e) => setMoreAnchor(e.currentTarget)} />
      </div>

      {condAnchor && (
        <Popover anchor={condAnchor} onClose={() => setCondAnchor(null)} placement="top">
          <div className="cond-grid">
            {CONDITIONS.map((c) => (
              <button key={c.id} type="button" className="cond-grid__item" data-active={conditions.includes(c.id) ? 'true' : undefined} data-tip={c.rules[0]}
                onClick={() => act('token.conditions', { sceneId, ids: [token.id], toggle: c.id })}>
                <ConditionIcon id={c.id} size={15} />
                <span>{c.name}</span>
              </button>
            ))}
          </div>
        </Popover>
      )}

      {moreAnchor && (
        <Popover anchor={moreAnchor} onClose={() => setMoreAnchor(null)} placement="top">
          <div className="menu" style={{ minWidth: 230 }}>
            {isDM && (
              <>
                <div className="menu__label">Tamanho</div>
                <div className="u-row" style={{ padding: '0 8px 6px' }}>
                  <Segmented
                    value={String(token.size)}
                    onChange={(v) => act('token.update', { sceneId, id: token.id, patch: { size: Number(v) } })}
                    options={[
                      { value: '0.5', label: 'Min' }, { value: '1', label: 'M' }, { value: '2', label: 'G' },
                      { value: '3', label: 'E' }, { value: '4', label: 'Col' },
                    ]}
                  />
                </div>
                <div className="menu__label">Disposição</div>
                <div className="u-row" style={{ padding: '0 8px 6px' }}>
                  <Segmented
                    value={token.disposition}
                    onChange={(v) => act('token.update', { sceneId, id: token.id, patch: { disposition: v } })}
                    options={[
                      { value: 'friendly', label: 'Aliado' }, { value: 'neutral', label: 'Neutro' }, { value: 'hostile', label: 'Hostil' },
                    ]}
                  />
                </div>
                <MenuItem icon={token.locked ? <Unlock /> : <Lock />} onClick={() => act('token.update', { sceneId, id: token.id, patch: { locked: !token.locked } })}>
                  {token.locked ? 'Destravar movimento' : 'Travar movimento'}
                </MenuItem>
                <MenuItem icon={<Eye />} onClick={() => act('token.update', { sceneId, id: token.id, patch: { showName: token.showName === 'always' ? 'hover' : 'always' } })}>
                  {token.showName === 'always' ? 'Nome só ao passar o mouse' : 'Sempre mostrar nome'}
                </MenuItem>
                <MenuItem icon={<Heart />} onClick={() => act('token.update', { sceneId, id: token.id, patch: { showHp: token.showHp === 'always' ? 'dm' : 'always' } })}>
                  {token.showHp === 'always' ? 'Esconder PV dos jogadores' : 'Mostrar PV para todos'}
                </MenuItem>
                <MenuItem icon={<Eye />} onClick={() => act('token.update', { sceneId, id: token.id, patch: { vision: { ...token.vision, enabled: !token.vision.enabled } } })}>
                  {token.vision.enabled ? 'Desligar visão do token' : 'Ligar visão do token'}
                </MenuItem>
                <div className="menu__label">Controlado por</div>
                {players && Object.values(players).filter((p) => p.role === 'player').map((p) => (
                  <MenuItem key={p.id} icon={<UserRoundCog />} onClick={() => {
                    const owners = token.ownerIds.includes(p.id) ? token.ownerIds.filter((x) => x !== p.id) : [...token.ownerIds, p.id];
                    void act('token.update', { sceneId, id: token.id, patch: { ownerIds: owners } });
                  }}>
                    <span className={token.ownerIds.includes(p.id) ? 'u-gold' : undefined}>{token.ownerIds.includes(p.id) ? '✓ ' : ''}{p.name}</span>
                  </MenuItem>
                ))}
                <div className="menu__sep" />
                <MenuItem icon={<Copy />} onClick={() => {
                  const { id: _id, ...rest } = token;
                  void act('token.create', { sceneId, token: { ...rest, x: token.x + 70, y: token.y }, fromMonster: undefined });
                  setMoreAnchor(null);
                }}>Duplicar</MenuItem>
              </>
            )}
            {control && (
              <MenuItem icon={<Trash2 />} danger onClick={async () => {
                setMoreAnchor(null);
                if (await confirmDialog('Remover token?', `"${token.name}" será removido do mapa.`, { danger: true, ok: 'Remover' })) {
                  await act('token.delete', { sceneId, ids: [token.id] });
                  useUi.getState().select([]);
                }
              }}>Remover do mapa</MenuItem>
            )}
          </div>
        </Popover>
      )}
    </div>
  );
}
