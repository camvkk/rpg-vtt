// Public API of the map engine for UI panels (filled in by the Engine when it mounts).
import type { Point } from '@shared/types.ts';

/** Drag & drop payload mime type for dropping things onto the map canvas. */
export const DND_MIME = 'application/x-vtt';

export type DropPayload =
  | { kind: 'monster'; id: string }
  | { kind: 'character'; id: string }
  | { kind: 'image'; url: string; name?: string };

export function setDragPayload(e: React.DragEvent | DragEvent, payload: DropPayload): void {
  e.dataTransfer?.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer?.setData('text/plain', payload.kind === 'image' ? payload.url : payload.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}

interface EngineHooks {
  viewCenter: () => Point;
  centerOn: (x: number, y: number, zoom?: number) => void;
  worldToScreen: (x: number, y: number) => Point;
  screenToWorld: (x: number, y: number) => Point;
  focusToken: (tokenId: string) => void;
}

const fallback: EngineHooks = {
  viewCenter: () => ({ x: 500, y: 500 }),
  centerOn: () => {},
  worldToScreen: (x, y) => ({ x, y }),
  screenToWorld: (x, y) => ({ x, y }),
  focusToken: () => {},
};

let hooks: EngineHooks = fallback;

export function registerEngine(h: EngineHooks | null): void {
  hooks = h ?? fallback;
}

export const engineApi = {
  /** World coordinates (px) at the center of the visible map area. */
  viewCenter: () => hooks.viewCenter(),
  centerOn: (x: number, y: number, zoom?: number) => hooks.centerOn(x, y, zoom),
  worldToScreen: (x: number, y: number) => hooks.worldToScreen(x, y),
  screenToWorld: (x: number, y: number) => hooks.screenToWorld(x, y),
  focusToken: (tokenId: string) => hooks.focusToken(tokenId),
};
