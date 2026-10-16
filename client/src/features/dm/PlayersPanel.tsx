import { useState } from 'react';
import { Copy, Crown, Link2, Palette, ScrollText, UserMinus } from 'lucide-react';
import { PLAYER_COLORS } from '@shared/util.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Avatar, Button, confirmDialog, IconButton, Popover, toast } from '../../ui/index.tsx';
import './dm.css';

export default function PlayersPanel() {
  const players = useGame((s) => s.state?.players);
  const characters = useGame((s) => s.state?.characters);
  const presence = useGame((s) => s.presence);
  const code = useGame((s) => s.code);
  const me = useGame((s) => s.me);
  const isDM = useIsDM();
  const [colorAnchor, setColorAnchor] = useState<HTMLElement | null>(null);
  const [name, setName] = useState(me?.name ?? '');
  if (!players || !me) return null;
  const invite = `${window.location.origin}/m/${code}`;
  const list = Object.values(players).sort((a, b) => (a.role === b.role ? a.joinedAt - b.joinedAt : a.role === 'dm' ? -1 : 1));

  return (
    <div className="dm-panel u-scroll">
      <div className="invite card">
        <div className="section-title"><Link2 size={13} /> Convite</div>
        <div className="invite__code u-display">{code}</div>
        <div className="u-xs u-muted u-ellipsis">{invite}</div>
        <Button size="sm" variant="primary" icon={<Copy />} onClick={async () => {
          try {
            await navigator.clipboard.writeText(invite);
            toast('Link copiado! Mande para seus jogadores.', 'success');
          } catch {
            toast(invite, 'info', 8000);
          }
        }}>Copiar link</Button>
      </div>

      <div className="section-title u-mt-3">Você</div>
      <div className="me-row">
        <button type="button" className="me-row__color" style={{ background: me.color }} onClick={(e) => setColorAnchor(e.currentTarget)} data-tip="Sua cor"><Palette size={14} /></button>
        <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => {
          if (name.trim() && name.trim() !== me.name) void act('player.update', { name: name.trim() });
        }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      </div>
      {colorAnchor && (
        <Popover anchor={colorAnchor} onClose={() => setColorAnchor(null)}>
          <div className="u-row u-wrap" style={{ width: 200, gap: 6, padding: 4 }}>
            {PLAYER_COLORS.map((c) => (
              <button key={c} type="button" className="swatch" style={{ background: c }} data-active={c === me.color ? 'true' : undefined} onClick={() => { void act('player.update', { color: c }); setColorAnchor(null); }} />
            ))}
          </div>
        </Popover>
      )}

      <div className="section-title u-mt-3">Na mesa ({list.length})</div>
      <div className="u-col u-gap-1">
        {list.map((p) => {
          const char = p.characterId ? characters?.[p.characterId] : undefined;
          const online = presence[p.id]?.online;
          return (
            <div key={p.id} className="player-row list-item">
              <span className="player-row__avatar" data-online={online ? 'true' : undefined}><Avatar name={p.name} color={p.color} img={p.avatar} /></span>
              <div className="u-grow" style={{ minWidth: 0 }}>
                <div className="u-row u-gap-1">
                  <span className="u-ellipsis" style={{ fontWeight: 600 }}>{p.name}</span>
                  {p.role === 'dm' && <Crown size={13} className="u-gold" />}
                  {p.id === me.id && <span className="badge">você</span>}
                </div>
                <div className="u-xs u-muted u-ellipsis">{online ? 'online' : 'offline'}{char ? ` · ${char.name}` : ''}</div>
              </div>
              {char && <IconButton size="sm" icon={<ScrollText />} label={`Ficha de ${char.name}`} onClick={() => useUi.getState().openSheet(char.id)} />}
              {isDM && p.role === 'player' && (
                <IconButton size="sm" icon={<UserMinus />} label="Remover da mesa" danger onClick={async () => {
                  if (await confirmDialog('Remover jogador?', `${p.name} sai da lista da mesa (pode voltar com o código). As fichas ficam sem dono.`, { danger: true, ok: 'Remover' })) {
                    void act('player.remove', { playerId: p.id });
                  }
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
