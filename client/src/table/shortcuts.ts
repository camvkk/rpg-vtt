import { useEffect } from 'react';
import { useGame } from '../store/game.ts';
import { useUi, type Tool } from '../store/ui.ts';

const TOOL_KEYS: Record<string, { tool: Tool; dm?: boolean }> = {
  v: { tool: 'select' },
  s: { tool: 'select' },
  m: { tool: 'measure' },
  p: { tool: 'ping' },
  d: { tool: 'draw' },
  a: { tool: 'template' },
  w: { tool: 'wall', dm: true },
  l: { tool: 'light', dm: true },
  f: { tool: 'fog', dm: true },
  n: { tool: 'note', dm: true },
};

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

/** Global keyboard shortcuts for the table UI (map-specific keys live in engine/input.ts). */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || e.altKey) return;
      const ui = useUi.getState();
      const isDM = useGame.getState().me?.role === 'dm';
      if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        ui.toggleSidebar();
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' || e.key === '/') {
        e.preventDefault();
        ui.openSidebar('chat');
        window.setTimeout(() => {
          const input = document.querySelector<HTMLTextAreaElement>('.chat__input textarea');
          if (input) {
            input.focus();
            if (e.key === '/' && !input.value) input.value = '/';
          }
        }, 30);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'c' && !e.shiftKey) {
        ui.openSidebar('character');
        return;
      }
      if (k === 'i' && !e.shiftKey) {
        ui.openSidebar('combat');
        return;
      }
      const t = TOOL_KEYS[k];
      if (t && (!t.dm || isDM) && !e.shiftKey) {
        ui.setTool(t.tool);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
