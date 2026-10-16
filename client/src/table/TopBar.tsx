import { useState } from 'react';
import {
  Check, ChevronDown, Copy, Crown, Eye, Link2, LogOut, Map as MapIcon, PanelRight, Play, Settings2, Volume2, VolumeX,
} from 'lucide-react';
import { act, disconnectAndLeave } from '../net/socket.ts';
import { setPref } from '../net/session.ts';
import { useGame } from '../store/game.ts';
import { useIsDM, useViewSceneId } from '../store/hooks.ts';
import { useUi } from '../store/ui.ts';
import { Avatar, IconButton, MenuItem, Popover, toast } from '../ui/index.tsx';
import { AudioEngine } from '../features/audio/engine/index.ts';

export function TopBar() {
  const name = useGame((s) => s.state?.name ?? '');
  const code = useGame((s) => s.code ?? '');
  const isDM = useIsDM();
  const [copied, setCopied] = useState(false);
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const muted = useUi((s) => s.muted);

  const copyInvite = async () => {
    const url = `${window.location.origin}/m/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast('Link de convite copiado!', 'success');
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(`Código da mesa: ${code}`, 'info', 8000);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    useUi.getState().set({ muted: next });
    setPref('muted', next);
    AudioEngine.get().setMuted(next);
  };

  return (
    <>
      <div className="topbar topbar--left panel">
        <div className="topbar__brand" data-tip="RPG VTT">
          <span className="topbar__sigil">20</span>
        </div>
        <div className="topbar__title">
          <div className="topbar__name u-ellipsis">{name}</div>
          <button type="button" className="topbar__code" onClick={copyInvite} data-tip="Copiar link de convite">
            {copied ? <Check size={12} /> : <Link2 size={12} />}
            <span className="u-mono">{code}</span>
            <Copy size={11} className="u-dim" />
          </button>
        </div>
        {isDM && <SceneSwitcher />}
      </div>

      <div className="topbar topbar--right panel">
        <Presence />
        <span className="topbar__sep" />
        <IconButton icon={muted ? <VolumeX /> : <Volume2 />} label={muted ? 'Ativar som' : 'Silenciar'} onClick={toggleMute} />
        <IconButton
          icon={<PanelRight />}
          label={sidebarOpen ? 'Fechar painel' : 'Abrir painel'}
          kbd="Tab"
          active={sidebarOpen}
          onClick={() => useUi.getState().toggleSidebar()}
        />
        <IconButton icon={<LogOut />} label="Sair da mesa" onClick={() => {
          disconnectAndLeave();
          window.history.replaceState(null, '', '/');
        }} />
      </div>
    </>
  );
}

function Presence() {
  const players = useGame((s) => s.state?.players);
  const presence = useGame((s) => s.presence);
  const meId = useGame((s) => s.me?.id);
  if (!players) return null;
  const list = Object.values(players).sort((a, b) => (a.role === 'dm' ? -1 : b.role === 'dm' ? 1 : a.joinedAt - b.joinedAt));
  return (
    <div className="presence">
      {list.map((p) => {
        const online = presence[p.id]?.online;
        return (
          <span
            key={p.id}
            className="presence__item"
            data-online={online ? 'true' : undefined}
            data-tip={`${p.name}${p.role === 'dm' ? ' (Mestre)' : ''}${p.id === meId ? ' — você' : ''}${online ? '' : ' · offline'}`}
          >
            <Avatar name={p.name} color={p.color} img={p.avatar} size="sm" />
            {p.role === 'dm' && <Crown className="presence__crown" />}
          </span>
        );
      })}
    </div>
  );
}

function SceneSwitcher() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const scenes = useGame((s) => s.state?.scenes);
  const order = useGame((s) => s.state?.sceneOrder ?? []);
  const activeId = useGame((s) => s.state?.activeSceneId);
  const viewId = useViewSceneId();
  const view = viewId && scenes ? scenes[viewId] : undefined;
  if (!scenes) return null;
  return (
    <>
      <span className="topbar__sep" />
      <button type="button" className="scene-switch" onClick={(e) => setAnchor(e.currentTarget)}>
        <MapIcon size={15} className="u-gold" />
        <span className="u-ellipsis" style={{ maxWidth: 180 }}>{view?.name ?? 'Cena'}</span>
        {viewId !== activeId ? <span className="badge badge--dm">Prévia</span> : <span className="badge badge--gold">Ao vivo</span>}
        <ChevronDown size={14} className="u-muted" />
      </button>
      {viewId && (
        <IconButton icon={<Settings2 />} label="Configurar cena" size="sm" onClick={() => useUi.getState().set({ sceneSettingsId: viewId })} />
      )}
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)}>
          <div className="menu" style={{ minWidth: 260 }}>
            <div className="menu__label">Cenas</div>
            {order.map((id) => {
              const sc = scenes[id];
              if (!sc) return null;
              return (
                <div key={id} className="u-row" style={{ gap: 2 }}>
                  <MenuItem icon={id === activeId ? <Play /> : <Eye />} onClick={() => { useUi.getState().set({ viewSceneId: id }); setAnchor(null); }}>
                    <span className={id === viewId ? 'u-gold' : undefined}>{sc.name}</span>
                  </MenuItem>
                  {id !== activeId && (
                    <IconButton size="sm" icon={<Play />} label="Levar jogadores para esta cena" onClick={() => {
                      void act('scene.activate', { id });
                      useUi.getState().set({ viewSceneId: id });
                      setAnchor(null);
                    }} />
                  )}
                </div>
              );
            })}
            <div className="menu__sep" />
            <MenuItem icon={<MapIcon />} onClick={() => { useUi.getState().openSidebar('scenes'); setAnchor(null); }}>Gerenciar cenas…</MenuItem>
          </div>
        </Popover>
      )}
    </>
  );
}
