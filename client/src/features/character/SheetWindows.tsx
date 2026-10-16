// Floating character sheet windows (draggable, resizable, z-ordered, positions remembered).
import { lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { GripHorizontal, MapPin, X } from 'lucide-react';
import type { ID } from '@shared/types.ts';
import { getPref, setPref } from '../../net/session.ts';
import { useGame } from '../../store/game.ts';
import { useCharacter } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Spinner } from '../../ui/index.tsx';
import { CharacterAvatar, classLine, placeOnMap, useCanControl } from './common.tsx';
import './character.css';

const CharacterSheet = lazy(() => import('./CharacterSheet.tsx').then((m) => ({ default: m.CharacterSheet })));

interface WinRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_W = 420;
const DEFAULT_H = 640;
const MIN_W = 320;
const MIN_H = 320;
const MARGIN = 8;

function clampRect(r: WinRect): WinRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.max(Math.min(MIN_W, vw - MARGIN * 2), Math.min(r.w, vw - MARGIN * 2));
  const h = Math.max(Math.min(MIN_H, vh - MARGIN * 2), Math.min(r.h, vh - MARGIN * 2));
  const x = Math.max(MARGIN, Math.min(r.x, vw - w - MARGIN));
  const y = Math.max(MARGIN, Math.min(r.y, vh - h - MARGIN));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

function initialRect(id: ID, index: number): WinRect {
  const saved = getPref<WinRect | null>(`sheetWin.${id}`, null);
  if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.w)) return clampRect(saved);
  const vw = window.innerWidth;
  return clampRect({ x: Math.max(MARGIN, vw / 2 - DEFAULT_W / 2 - 120) + index * 28, y: 72 + index * 28, w: DEFAULT_W, h: DEFAULT_H });
}

function isMobile(): boolean {
  return window.matchMedia('(max-width: 700px)').matches;
}

export function SheetWindows() {
  const sheets = useUi((s) => s.sheets);
  const [order, setOrder] = useState<ID[]>(sheets);
  const prev = useRef<ID[]>(sheets);
  const orderRef = useRef(order);
  orderRef.current = order;
  const activeRef = useRef(false);

  // Keep z-order in sync: newly opened (or re-opened) sheets come to the front.
  useEffect(() => {
    const before = prev.current;
    prev.current = sheets;
    setOrder((cur) => {
      let next = cur.filter((id) => sheets.includes(id));
      for (const id of sheets) if (!next.includes(id)) next.push(id);
      const last = sheets[sheets.length - 1];
      if (last && before[before.length - 1] !== last) next = [...next.filter((x) => x !== last), last];
      return next;
    });
    if (sheets.length > before.length) activeRef.current = true;
  }, [sheets]);

  const focus = useCallback((id: ID) => {
    activeRef.current = true;
    setOrder((cur) => (cur[cur.length - 1] === id ? cur : [...cur.filter((x) => x !== id), id]));
  }, []);

  // Esc closes only the focused window (never while typing, never over popovers/modals).
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      activeRef.current = !!t?.closest?.('.sw-win');
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !activeRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('.popover, .modal-backdrop')) return;
      const top = orderRef.current[orderRef.current.length - 1];
      if (!top) return;
      e.preventDefault();
      useUi.getState().closeSheet(top);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  if (!sheets.length) return null;
  return (
    <>
      {sheets.map((id, i) => (
        <SheetWindow key={id} id={id} index={i} z={Math.max(0, order.indexOf(id))} top={order[order.length - 1] === id} onFocus={focus} />
      ))}
    </>
  );
}

const SheetBody = memo(function SheetBody({ id }: { id: ID }) {
  return (
    <Suspense fallback={<div className="u-center u-p-4"><Spinner /></div>}>
      <CharacterSheet characterId={id} mode="window" />
    </Suspense>
  );
});

const SheetWindow = memo(function SheetWindow({ id, index, z, top, onFocus }: {
  id: ID;
  index: number;
  z: number;
  top: boolean;
  onFocus: (id: ID) => void;
}) {
  const c = useCharacter(id);
  const canEdit = useCanControl(c);
  const ref = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<WinRect>(() => initialRect(id, index));
  const rectRef = useRef(rect);
  rectRef.current = rect;

  // Close windows of deleted / hidden characters.
  const exists = !!c;
  useEffect(() => {
    if (!exists) {
      const t = window.setTimeout(() => {
        if (!characterExists(id)) useUi.getState().closeSheet(id);
      }, 400);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [exists, id]);

  // Re-clamp on viewport resize.
  useEffect(() => {
    const onResize = () => setRect((r) => clampRect(r));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.left = `${rect.x}px`;
    el.style.top = `${rect.y}px`;
    el.style.width = `${rect.w}px`;
    el.style.height = `${rect.h}px`;
  }, [rect]);

  const commit = (r: WinRect) => {
    const next = clampRect(r);
    setRect(next);
    setPref(`sheetWin.${id}`, next);
  };

  /** Shared pointer-drag routine: mutates the DOM while moving, commits state once at the end. */
  const startDrag = (e: React.PointerEvent, kind: 'move' | 'resize') => {
    if (e.button !== 0 || isMobile()) return;
    const el = ref.current;
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const target = e.currentTarget as HTMLElement;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // synthetic / already released pointers
    }
    const start = { px: e.clientX, py: e.clientY, ...rectRef.current };
    let last = rectRef.current;
    el.dataset.dragging = 'true';
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - start.px;
      const dy = ev.clientY - start.py;
      last = clampRect(kind === 'move'
        ? { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }
        : { x: start.x, y: start.y, w: start.w + dx, h: start.h + dy });
      el.style.left = `${last.x}px`;
      el.style.top = `${last.y}px`;
      el.style.width = `${last.w}px`;
      el.style.height = `${last.h}px`;
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      delete el.dataset.dragging;
      commit(last);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const close = () => useUi.getState().closeSheet(id);

  return (
    <div
      ref={ref}
      className="sw-win"
      data-top={top ? 'true' : undefined}
      style={{ zIndex: 50 + z }}
      role="dialog"
      aria-label={c ? `Ficha de ${c.name}` : 'Ficha'}
      onPointerDownCapture={() => onFocus(id)}
    >
      <div
        className="sw-head"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          startDrag(e, 'move');
        }}
        onDoubleClick={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          // Double-click the title bar to restore the default size.
          commit({ ...rectRef.current, w: DEFAULT_W, h: DEFAULT_H });
        }}
      >
        <GripHorizontal className="sw-head__grip" />
        {c && <CharacterAvatar c={c} size={30} />}
        <div className="sw-head__text">
          <div className="sw-head__name u-ellipsis">{c?.name ?? 'Ficha'}</div>
          {c && <div className="sw-head__sub u-ellipsis">{[c.race, classLine(c)].filter(Boolean).join(' · ')}</div>}
        </div>
        {c && canEdit && (
          <button type="button" className="icon-btn icon-btn--sm" data-tip="Colocar no mapa" aria-label="Colocar no mapa" onClick={() => void placeOnMap(id)}>
            <MapPin />
          </button>
        )}
        <button type="button" className="icon-btn icon-btn--sm" data-tip="Fechar" data-kbd="Esc" aria-label="Fechar" onClick={close}>
          <X />
        </button>
      </div>
      <div className="sw-body">
        <SheetBody id={id} />
      </div>
      <div className="sw-resize" onPointerDown={(e) => startDrag(e, 'resize')} aria-hidden="true" />
    </div>
  );
});

function characterExists(id: ID): boolean {
  return !!useGame.getState().state?.characters[id];
}
