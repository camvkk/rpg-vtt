import { Suspense, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useGame } from '../store/game.ts';
import { useIsDM } from '../store/hooks.ts';
import { useUi } from '../store/ui.ts';
import { IconButton, Spinner } from '../ui/index.tsx';
import { PANELS } from './panels.tsx';

export function Sidebar() {
  const open = useUi((s) => s.sidebarOpen);
  const tab = useUi((s) => s.sidebarTab);
  const isDM = useIsDM();
  const customActive = useGame((s) => s.state?.settings.system === 'custom' && !!s.state.customSystem);
  const panels = PANELS.filter((p) => (!p.dmOnly || isDM) && (!p.customSystem || isDM || customActive));
  const active = panels.find((p) => p.id === tab) ?? panels[0]!;
  const unread = useUnreadChat(open && tab === 'chat');
  // Keep visited panels mounted so their state (scroll, drafts) survives tab switches.
  const [visited, setVisited] = useState<Set<string>>(() => new Set([active.id]));
  useEffect(() => {
    setVisited((v) => (v.has(active.id) ? v : new Set(v).add(active.id)));
  }, [active.id]);

  return (
    <aside className="sidebar panel" data-open={open ? 'true' : undefined} aria-hidden={!open}>
      <div className="sidebar__tabs" role="tablist">
        {panels.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            className="sidebar__tab"
            data-active={p.id === active.id ? 'true' : undefined}
            data-dm={p.dmOnly ? 'true' : undefined}
            data-tip={p.label}
            aria-label={p.label}
            onClick={() => useUi.getState().openSidebar(p.id)}
          >
            {p.icon}
            {p.id === 'chat' && unread > 0 && <span className="sidebar__badge">{unread > 9 ? '9+' : unread}</span>}
          </button>
        ))}
      </div>
      <div className="sidebar__header">
        <span className="sidebar__title">{active.label}</span>
        <IconButton icon={<X />} label="Fechar painel" size="sm" onClick={() => useUi.getState().toggleSidebar()} />
      </div>
      <div className="sidebar__body">
        {panels.filter((p) => visited.has(p.id)).map((p) => {
          const C = p.component;
          return (
            <div key={p.id} className="sidebar__panel" hidden={p.id !== active.id}>
              <Suspense fallback={<div className="u-center u-p-4"><Spinner /></div>}>
                <C />
              </Suspense>
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function useUnreadChat(visible: boolean): number {
  const count = useGame((s) => s.chat.length);
  const seen = useRef(count);
  if (visible) seen.current = count;
  return Math.max(0, count - seen.current);
}
