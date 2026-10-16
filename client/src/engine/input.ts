// Pointer/keyboard input for the map: camera gestures + tools. Reads stores directly (no React closures).
import { LIGHT_PRESETS } from '@shared/defaults.ts';
import {
  measurePathFeet, simplifyPath, snapPoint, snapTokenPosition, tokenCenter, tokensInTemplate,
} from '@shared/geometry.ts';
import type { DrawingKind, ID, Template, Token } from '@shared/types.ts';
import { uploadFile } from '../net/api.ts';
import { act, sendFx } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { useUi } from '../store/ui.ts';
import { confirmDialog, toast } from '../ui/index.tsx';
import { DND_MIME, type DropPayload } from './api.ts';
import type { Engine } from './Engine.ts';
import { drawDrawing, drawingAt, drawTemplate } from './layers/objects.ts';

interface PEvent {
  sx: number;
  sy: number;
  wx: number;
  wy: number;
  button: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
  touch: boolean;
}

interface Tool {
  down?(e: PEvent): boolean | void;
  move?(e: PEvent): void;
  up?(e: PEvent): void;
  cancel?(): void;
  key?(e: KeyboardEvent): boolean;
  dblclick?(e: PEvent): void;
  hoverCursor?(e: PEvent): string | null;
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

const DRAG_THRESHOLD = 4;

export class InputController {
  private engine: Engine;
  private canvas: HTMLCanvasElement;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: 'none' | 'pan' | 'pinch' | 'tool' = 'none';
  private panLast = { x: 0, y: 0 };
  private pinchStart = { dist: 0, scale: 1, cx: 0, cy: 0 };
  private spaceDown = false;
  private tools: Record<string, Tool>;
  private lastHoverCheck = 0;
  private longPress = 0;
  private downAt = { x: 0, y: 0, t: 0 };

  constructor(engine: Engine) {
    this.engine = engine;
    this.canvas = engine.app.canvas;
    this.tools = {
      select: new SelectTool(engine),
      measure: new MeasureTool(engine),
      ping: new PingTool(engine),
      draw: new DrawTool(engine),
      template: new TemplateTool(engine),
      wall: new WallTool(engine),
      light: new LightTool(engine),
      fog: new FogTool(engine),
      note: new NoteTool(engine),
    };
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    c.addEventListener('pointerup', this.onUp);
    c.addEventListener('pointercancel', this.onCancel);
    c.addEventListener('pointerleave', this.onLeave);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('contextmenu', this.onContext);
    c.addEventListener('dblclick', this.onDbl);
    c.addEventListener('dragover', this.onDragOver);
    c.addEventListener('drop', this.onDrop);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  private get tool(): Tool {
    return this.tools[useUi.getState().tool] ?? this.tools.select!;
  }

  private ev(e: PointerEvent | MouseEvent): PEvent {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const w = this.engine.camera.screenToWorld(sx, sy);
    return {
      sx, sy, wx: w.x, wy: w.y, button: e.button, shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey,
      touch: (e as PointerEvent).pointerType === 'touch',
    };
  }

  private onDown = (e: PointerEvent) => {
    if (!this.engine.ctx) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.ev(e);
    this.downAt = { x: p.sx, y: p.sy, t: performance.now() };
    if (this.pointers.size === 2) {
      // switch to pinch
      this.tool.cancel?.();
      const [a, b] = [...this.pointers.values()];
      const r = this.canvas.getBoundingClientRect();
      this.gesture = 'pinch';
      this.pinchStart = {
        dist: Math.hypot(a!.x - b!.x, a!.y - b!.y),
        scale: this.engine.camera.scale,
        cx: (a!.x + b!.x) / 2 - r.left,
        cy: (a!.y + b!.y) / 2 - r.top,
      };
      this.panLast = { x: this.pinchStart.cx, y: this.pinchStart.cy };
      return;
    }
    if (e.button === 1 || (e.button === 0 && this.spaceDown) || (e.button === 2 && useUi.getState().tool === 'select' && !this.engine.tokens.tokenAt(p.wx, p.wy))) {
      this.gesture = 'pan';
      this.panLast = { x: p.sx, y: p.sy };
      this.canvas.style.cursor = 'grabbing';
      return;
    }
    if (e.button === 0 && p.alt) {
      firePing(this.engine, p.wx, p.wy, p.shift);
      return;
    }
    if (p.touch) {
      window.clearTimeout(this.longPress);
      this.longPress = window.setTimeout(() => {
        if (this.gesture === 'tool' && Math.hypot(this.downAt.x - p.sx, this.downAt.y - p.sy) < 8) {
          this.tool.cancel?.();
          this.gesture = 'none';
          firePing(this.engine, p.wx, p.wy, false);
        }
      }, 650);
    }
    const handled = this.tool.down?.(p);
    if (handled === false && p.touch && e.button === 0) {
      // tool declined (e.g. empty space on touch): pan instead
      this.gesture = 'pan';
      this.panLast = { x: p.sx, y: p.sy };
      return;
    }
    this.gesture = 'tool';
  };

  private onMove = (e: PointerEvent) => {
    if (!this.engine.ctx) return;
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = this.ev(e);
    if (this.gesture === 'pinch' && this.pointers.size >= 2) {
      const [a, b] = [...this.pointers.values()];
      const r = this.canvas.getBoundingClientRect();
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const cx = (a!.x + b!.x) / 2 - r.left, cy = (a!.y + b!.y) / 2 - r.top;
      this.engine.camera.pan(cx - this.panLast.x, cy - this.panLast.y);
      this.panLast = { x: cx, y: cy };
      this.engine.camera.setZoomImmediate(cx, cy, this.pinchStart.scale * (dist / Math.max(1, this.pinchStart.dist)));
      return;
    }
    if (this.gesture === 'pan') {
      this.engine.camera.pan(p.sx - this.panLast.x, p.sy - this.panLast.y);
      this.panLast = { x: p.sx, y: p.sy };
      return;
    }
    if (this.gesture === 'tool') {
      this.tool.move?.(p);
      return;
    }
    // hover
    const now = performance.now();
    if (now - this.lastHoverCheck < 30) return;
    this.lastHoverCheck = now;
    this.hover(p);
  };

  private hover(p: PEvent): void {
    const ctx = this.engine.ctx!;
    const visible = (t: Token) => ctx.isDM || this.engine.lighting.isVisible(tokenCenter(t, ctx.scene.grid).x, tokenCenter(t, ctx.scene.grid).y);
    const tok = this.engine.tokens.tokenAt(p.wx, p.wy, visible);
    const ui = useUi.getState();
    if ((tok?.id ?? null) !== ui.hoverTokenId) ui.setHover(tok?.id ?? null);
    const door = !tok ? this.engine.walls.doorAt(p.wx, p.wy) : null;
    const doorVisible = door && (ctx.isDM || this.engine.lighting.isVisible((door.c[0] + door.c[2]) / 2, (door.c[1] + door.c[3]) / 2));
    this.engine.walls.setHoverDoor(doorVisible ? door!.id : null);
    const note = !tok && !door ? this.engine.notes.noteAt(p.wx, p.wy) : null;
    this.engine.notes.setHover(note?.id ?? null);
    const custom = this.tool.hoverCursor?.(p);
    this.canvas.style.cursor = custom ?? (tok || doorVisible || note ? 'pointer' : this.spaceDown ? 'grab' : 'default');
  }

  private onUp = (e: PointerEvent) => {
    window.clearTimeout(this.longPress);
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    const p = this.ev(e);
    if (this.gesture === 'pinch') {
      if (this.pointers.size < 2) this.gesture = this.pointers.size ? 'pan' : 'none';
      const rest = [...this.pointers.values()][0];
      if (rest) {
        const r = this.canvas.getBoundingClientRect();
        this.panLast = { x: rest.x - r.left, y: rest.y - r.top };
      }
      return;
    }
    if (this.gesture === 'pan') {
      this.gesture = 'none';
      this.canvas.style.cursor = this.spaceDown ? 'grab' : 'default';
      this.engine.saveCamera();
      // a tap without movement on touch = deselect
      if (p.touch && Math.hypot(this.downAt.x - p.sx, this.downAt.y - p.sy) < 6 && performance.now() - this.downAt.t < 300) {
        useUi.getState().select([]);
      }
      return;
    }
    if (this.gesture === 'tool') this.tool.up?.(p);
    this.gesture = 'none';
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    if (this.gesture === 'tool') this.tool.cancel?.();
    this.gesture = 'none';
  };

  private onLeave = () => {
    if (this.gesture === 'none') {
      useUi.getState().setHover(null);
      this.engine.walls.setHoverDoor(null);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    // Trackpad pinch arrives as ctrl+wheel with small deltas.
    const intensity = e.ctrlKey ? 0.012 : 0.0016;
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    const factor = Math.exp(-delta * intensity);
    if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.8 && e.deltaMode === 0) {
      this.engine.camera.pan(-e.deltaX, -e.deltaY);
      return;
    }
    this.engine.camera.zoomAt(sx, sy, factor);
    window.clearTimeout(this.wheelSave);
    this.wheelSave = window.setTimeout(() => this.engine.saveCamera(), 400);
  };
  private wheelSave = 0;

  private onContext = (e: MouseEvent) => {
    e.preventDefault();
  };

  private onDbl = (e: MouseEvent) => {
    this.tool.dblclick?.(this.ev(e));
  };

  private onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    if (e.dataTransfer.types.includes(DND_MIME) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  private onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const ctx = this.engine.ctx;
    if (!ctx || !e.dataTransfer) return;
    const p = this.ev(e);
    const raw = e.dataTransfer.getData(DND_MIME);
    if (raw) {
      let payload: DropPayload | null = null;
      try {
        payload = JSON.parse(raw) as DropPayload;
      } catch {
        payload = null;
      }
      if (!payload) return;
      const g = ctx.scene.grid;
      const at = { x: p.wx - g.size / 2, y: p.wy - g.size / 2 };
      if (payload.kind === 'monster') void act('token.create', { sceneId: ctx.scene.id, token: at, fromMonster: payload.id });
      else if (payload.kind === 'character') void act('token.create', { sceneId: ctx.scene.id, token: at, fromCharacter: payload.id });
      else if (payload.kind === 'image' && ctx.isDM) void act('token.create', { sceneId: ctx.scene.id, token: { ...at, img: payload.url, name: payload.name ?? 'Token' } });
      return;
    }
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    if (!ctx.isDM) {
      toast('Só o Mestre pode soltar imagens no mapa.', 'warning');
      return;
    }
    toast('Enviando imagem…', 'info', 1500);
    const res = await uploadFile(file);
    if (!res.ok || !res.url) {
      toast(res.error ?? 'Falha no envio.', 'danger');
      return;
    }
    const g = ctx.scene.grid;
    void act('token.create', {
      sceneId: ctx.scene.id,
      token: { x: p.wx - g.size / 2, y: p.wy - g.size / 2, img: res.url, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) },
    });
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e) || !this.engine.ctx) return;
    if (e.code === 'Space' && !e.repeat) {
      this.spaceDown = true;
      if (useUi.getState().tool !== 'measure') this.canvas.style.cursor = 'grab';
    }
    if (this.tool.key?.(e)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      this.tool.cancel?.();
      const ui = useUi.getState();
      if (ui.tool !== 'select') ui.setTool('select');
      else ui.select([]);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.spaceDown = false;
      if (this.gesture !== 'pan') this.canvas.style.cursor = 'default';
    }
  };

  destroy(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onDown);
    c.removeEventListener('pointermove', this.onMove);
    c.removeEventListener('pointerup', this.onUp);
    c.removeEventListener('pointercancel', this.onCancel);
    c.removeEventListener('pointerleave', this.onLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContext);
    c.removeEventListener('dblclick', this.onDbl);
    c.removeEventListener('dragover', this.onDragOver);
    c.removeEventListener('drop', this.onDrop);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
  }
}

function firePing(engine: Engine, x: number, y: number, pull: boolean): void {
  const ctx = engine.ctx;
  if (!ctx) return;
  const color = ctx.me.color;
  engine.overlay.addPing(x, y, color);
  sendFx({ type: 'ping', sceneId: ctx.scene.id, x, y, color, playerId: ctx.me.id, pull: pull && ctx.isDM });
}

function feetLabel(feet: number): string {
  const f = Math.round(feet * 10) / 10;
  const m = Math.round(f * 0.3 * 10) / 10;
  return `${f} pés · ${m} m`;
}

// ---------------------------------------------------------------------------
// Select / move tokens / doors
// ---------------------------------------------------------------------------

class SelectTool implements Tool {
  private engine: Engine;
  private drag: { ids: ID[]; origin: Map<ID, { x: number; y: number }>; startW: { x: number; y: number }; startS: { x: number; y: number }; moved: boolean; lead: ID; path: number[] } | null = null;
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private lastRulerSent = 0;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  private canSee(t: Token): boolean {
    const ctx = this.engine.ctx!;
    if (ctx.isDM) return true;
    const c = tokenCenter(t, ctx.scene.grid);
    return this.engine.lighting.isVisible(c.x, c.y);
  }

  down(e: PEvent): boolean | void {
    const ctx = this.engine.ctx!;
    const ui = useUi.getState();
    if (e.button === 2) {
      const tok = this.engine.tokens.tokenAt(e.wx, e.wy, (t) => this.canSee(t));
      if (tok) {
        if (!ui.selection.includes(tok.id)) ui.select([tok.id]);
        window.dispatchEvent(new CustomEvent('vtt:token-menu', { detail: { id: tok.id, x: e.sx, y: e.sy } }));
      } else if (ctx.isDM) {
        const w = this.engine.walls.doorAt(e.wx, e.wy);
        if (w) void act('wall.door', { sceneId: ctx.scene.id, id: w.id, state: w.door === 'locked' ? 'closed' : 'locked' });
      }
      return;
    }
    if (e.button !== 0) return;
    const tok = this.engine.tokens.tokenAt(e.wx, e.wy, (t) => this.canSee(t));
    if (!tok) {
      const door = this.engine.walls.doorAt(e.wx, e.wy);
      if (door && (ctx.isDM || this.engine.lighting.isVisible((door.c[0] + door.c[2]) / 2, (door.c[1] + door.c[3]) / 2))) {
        const next = e.shift && ctx.isDM ? (door.door === 'locked' ? 'closed' : 'locked') : door.door === 'open' ? 'closed' : 'open';
        if (door.door === 'locked' && !ctx.isDM) {
          toast('A porta está trancada.', 'warning');
          window.dispatchEvent(new CustomEvent('vtt:sfx', { detail: 'door-locked' }));
        } else void act('wall.door', { sceneId: ctx.scene.id, id: door.id, state: next });
        return;
      }
      const note = this.engine.notes.noteAt(e.wx, e.wy);
      if (note) {
        if (note.journalId && useGame.getState().state?.journal[note.journalId]) ui.set({ handoutId: note.journalId });
        else toast(note.label, 'info');
        return;
      }
      if (e.touch) return false;
      if (!e.shift) ui.select([]);
      this.box = { x0: e.wx, y0: e.wy, x1: e.wx, y1: e.wy };
      return;
    }
    if (e.shift) {
      ui.select([tok.id], true);
    } else if (!ui.selection.includes(tok.id)) {
      ui.select([tok.id]);
    }
    const sel = useUi.getState().selection;
    const movable = sel
      .map((id) => ctx.scene.tokens[id])
      .filter((t): t is Token => !!t && ctx.controlled.has(t.id) && (ctx.isDM || !t.locked));
    if (!movable.length || !movable.some((t) => t.id === tok.id)) {
      this.drag = null;
      return;
    }
    const origin = new Map<ID, { x: number; y: number }>();
    for (const t of movable) origin.set(t.id, tokenCenter(t, ctx.scene.grid));
    this.drag = {
      ids: movable.map((t) => t.id), origin, startW: { x: e.wx, y: e.wy }, startS: { x: e.sx, y: e.sy }, moved: false, lead: tok.id,
      path: [],
    };
  }

  move(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (this.box) {
      this.box.x1 = e.wx;
      this.box.y1 = e.wy;
      this.engine.overlay.setSelectBox(this.box);
      return;
    }
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.sx - d.startS.x, e.sy - d.startS.y) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      for (const id of d.ids) this.engine.tokens.raise(id);
    }
    const dx = e.wx - d.startW.x, dy = e.wy - d.startW.y;
    for (const id of d.ids) {
      const o = d.origin.get(id)!;
      this.engine.tokens.dragTo(id, o.x + dx, o.y + dy);
    }
    // Ruler from the lead token's origin to its snapped destination
    const lead = ctx.scene.tokens[d.lead];
    if (!lead) return;
    const o = d.origin.get(d.lead)!;
    const s = Math.max(0.25, lead.size) * ctx.scene.grid.size;
    const snapped = snapTokenPosition(ctx.scene.grid, lead, o.x + dx - s / 2, o.y + dy - s / 2);
    const dest = { x: snapped.x + s / 2, y: snapped.y + s / 2 };
    const pts = [o.x, o.y, ...d.path, dest.x, dest.y];
    const ptList: { x: number; y: number }[] = [];
    for (let i = 0; i < pts.length; i += 2) ptList.push({ x: pts[i]!, y: pts[i + 1]! });
    const feet = measurePathFeet(ctx.scene.grid, ptList);
    const label = feetLabel(feet);
    this.engine.overlay.setRuler('local', pts, ctx.me.color, label);
    const now = performance.now();
    if (now - this.lastRulerSent > 90) {
      this.lastRulerSent = now;
      sendFx({ type: 'ruler', sceneId: ctx.scene.id, playerId: ctx.me.id, color: ctx.me.color, points: pts, label });
    }
  }

  up(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (this.box) {
      const b = this.box;
      this.box = null;
      this.engine.overlay.setSelectBox(null);
      if (Math.abs(b.x1 - b.x0) > 4 || Math.abs(b.y1 - b.y0) > 4) {
        const ids = this.engine.tokens.tokensInRect(b.x0, b.y0, b.x1, b.y1).filter((t) => this.canSee(t) && (ctx.isDM || !t.hidden)).map((t) => t.id);
        useUi.getState().select(ids, e.shift);
      }
      return;
    }
    const d = this.drag;
    this.drag = null;
    this.engine.overlay.setRuler('local', null, '#fff', '');
    sendFx({ type: 'ruler', sceneId: ctx.scene.id, playerId: ctx.me.id, color: ctx.me.color, points: null, label: '' });
    if (!d || !d.moved) return;
    const dx = e.wx - d.startW.x, dy = e.wy - d.startW.y;
    const moves = d.ids.map((id) => {
      const t = ctx.scene.tokens[id]!;
      const o = d.origin.get(id)!;
      const s = Math.max(0.25, t.size) * ctx.scene.grid.size;
      const snapped = snapTokenPosition(ctx.scene.grid, t, o.x + dx - s / 2, o.y + dy - s / 2);
      return { id, x: snapped.x, y: snapped.y };
    });
    for (const id of d.ids) this.engine.tokens.endDrag(id);
    // optimistic: keep dragged position until state updates; on failure snap back
    for (const m of moves) {
      const t = ctx.scene.tokens[m.id]!;
      const s = Math.max(0.25, t.size) * ctx.scene.grid.size;
      this.engine.tokens.dragTo(m.id, m.x + s / 2, m.y + s / 2);
      this.engine.tokens.endDrag(m.id);
    }
    void act('token.move', { sceneId: ctx.scene.id, moves, path: d.path.length ? d.path : undefined }).then((res) => {
      if (!res.ok) for (const id of d.ids) this.engine.tokens.restore(id);
    });
  }

  cancel(): void {
    if (this.drag) for (const id of this.drag.ids) this.engine.tokens.restore(id);
    this.drag = null;
    this.box = null;
    this.engine.overlay.setSelectBox(null);
    this.engine.overlay.setRuler('local', null, '#fff', '');
  }

  dblclick(e: PEvent): void {
    const ctx = this.engine.ctx!;
    const tok = this.engine.tokens.tokenAt(e.wx, e.wy, (t) => this.canSee(t));
    if (!tok) return;
    if (tok.characterId && ctx.campaign.characters[tok.characterId]) useUi.getState().openSheet(tok.characterId);
    else window.dispatchEvent(new CustomEvent('vtt:token-menu', { detail: { id: tok.id, x: e.sx, y: e.sy } }));
  }

  key(e: KeyboardEvent): boolean {
    const ctx = this.engine.ctx!;
    const ui = useUi.getState();
    if (this.drag && (e.key === ' ' || e.code === 'Space')) {
      // waypoint while dragging
      const lead = ctx.scene.tokens[this.drag.lead];
      const v = this.engine.tokens.centerOf(this.drag.lead);
      if (lead && v) {
        const p = snapPoint(ctx.scene.grid, v.x, v.y, 'center');
        this.drag.path.push(p.x, p.y);
      }
      return true;
    }
    const sel = ui.selection.map((id) => ctx.scene.tokens[id]).filter((t): t is Token => !!t);
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel.length && ctx.isDM) {
      void (async () => {
        if (sel.length > 1 && !(await confirmDialog('Remover tokens?', `${sel.length} tokens serão removidos do mapa.`, { danger: true, ok: 'Remover' }))) return;
        await act('token.delete', { sceneId: ctx.scene.id, ids: sel.map((t) => t.id) });
        ui.select([]);
      })();
      return true;
    }
    if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) {
      const id = ui.hoverTokenId ?? sel[0]?.id;
      if (id) {
        ui.toggleTarget(id);
        sendFx({ type: 'target', playerId: ctx.me.id, tokenIds: useUi.getState().targets });
      }
      return true;
    }
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const dir = arrows[e.key];
    if (dir && sel.length) {
      const g = ctx.scene.grid.size;
      const moves = sel.filter((t) => ctx.controlled.has(t.id)).map((t) => ({ id: t.id, x: t.x + dir[0] * g, y: t.y + dir[1] * g }));
      if (moves.length) void act('token.move', { sceneId: ctx.scene.id, moves });
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Measure
// ---------------------------------------------------------------------------

class MeasureTool implements Tool {
  private engine: Engine;
  private points: number[] = [];
  private active = false;
  private lastSent = 0;
  private clearTimer = 0;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  private snap(x: number, y: number): { x: number; y: number } {
    const g = this.engine.ctx!.scene.grid;
    return g.type === 'none' ? { x, y } : snapPoint(g, x, y, 'center');
  }

  down(e: PEvent): void {
    window.clearTimeout(this.clearTimer);
    if (e.button === 2 && this.active) {
      const p = this.snap(e.wx, e.wy);
      this.points.splice(this.points.length - 2, 0, p.x, p.y);
      return;
    }
    if (e.button !== 0) return;
    const p = this.snap(e.wx, e.wy);
    this.points = [p.x, p.y, p.x, p.y];
    this.active = true;
    this.render(true);
  }

  move(e: PEvent): void {
    if (!this.active) return;
    const p = this.snap(e.wx, e.wy);
    this.points[this.points.length - 2] = p.x;
    this.points[this.points.length - 1] = p.y;
    this.render(false);
  }

  up(): void {
    if (!this.active) return;
    this.active = false;
    this.render(true);
    this.clearTimer = window.setTimeout(() => this.clear(), 2500);
  }

  key(e: KeyboardEvent): boolean {
    if (this.active && e.code === 'Space') {
      const n = this.points.length;
      this.points.push(this.points[n - 2]!, this.points[n - 1]!);
      return true;
    }
    return false;
  }

  private render(force: boolean): void {
    const ctx = this.engine.ctx!;
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < this.points.length; i += 2) pts.push({ x: this.points[i]!, y: this.points[i + 1]! });
    const label = feetLabel(measurePathFeet(ctx.scene.grid, pts));
    this.engine.overlay.setRuler('local', this.points, ctx.me.color, label);
    const now = performance.now();
    if (force || now - this.lastSent > 80) {
      this.lastSent = now;
      sendFx({ type: 'ruler', sceneId: ctx.scene.id, playerId: ctx.me.id, color: ctx.me.color, points: [...this.points], label });
    }
  }

  private clear(): void {
    const ctx = this.engine.ctx;
    this.points = [];
    this.engine.overlay.setRuler('local', null, '#fff', '');
    if (ctx) sendFx({ type: 'ruler', sceneId: ctx.scene.id, playerId: ctx.me.id, color: ctx.me.color, points: null, label: '' });
  }

  cancel(): void {
    this.active = false;
    this.clear();
  }

  hoverCursor(): string {
    return 'crosshair';
  }
}

// ---------------------------------------------------------------------------
// Ping
// ---------------------------------------------------------------------------

class PingTool implements Tool {
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  down(e: PEvent): void {
    if (e.button === 0) firePing(this.engine, e.wx, e.wy, e.shift);
  }

  hoverCursor(): string {
    return 'crosshair';
  }
}

// ---------------------------------------------------------------------------
// Draw
// ---------------------------------------------------------------------------

class DrawTool implements Tool {
  private engine: Engine;
  private pts: number[] = [];
  private start: { x: number; y: number } | null = null;
  private kind: DrawingKind = 'path';

  constructor(engine: Engine) {
    this.engine = engine;
  }

  down(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (e.button === 2) {
      const d = drawingAt(ctx.scene.drawings, e.wx, e.wy, 8 / this.engine.camera.scale);
      if (d && (ctx.isDM || d.authorId === ctx.me.id)) void act('drawing.delete', { sceneId: ctx.scene.id, ids: [d.id] });
      return;
    }
    if (e.button !== 0) return;
    const opts = useUi.getState().toolOpts.draw;
    this.kind = opts.kind;
    if (opts.kind === 'text') {
      const text = window.prompt('Texto no mapa:');
      if (text?.trim()) {
        void act('drawing.create', {
          sceneId: ctx.scene.id,
          drawing: {
            kind: 'text', points: [], x: e.wx, y: e.wy, w: 0, h: 0, text: text.trim().slice(0, 500), stroke: opts.stroke,
            strokeWidth: Math.max(3, opts.width), fill: null, fillAlpha: 0, layer: 'above', gmOnly: opts.gmOnly && ctx.isDM,
          },
        });
      }
      return;
    }
    this.start = { x: e.wx, y: e.wy };
    this.pts = [e.wx, e.wy];
  }

  move(e: PEvent): void {
    if (!this.start) return;
    const opts = useUi.getState().toolOpts.draw;
    if (this.kind === 'path') {
      const lx = this.pts[this.pts.length - 2]!, ly = this.pts[this.pts.length - 1]!;
      if (Math.hypot(e.wx - lx, e.wy - ly) * this.engine.camera.scale < 3) return;
      this.pts.push(e.wx, e.wy);
    } else {
      this.pts = [this.start.x, this.start.y, e.wx, e.wy];
    }
    const g = this.engine.overlay.preview;
    g.clear();
    drawDrawing(g, this.toDrawing(opts));
    this.engine.requestRender();
  }

  private toDrawing(opts: ReturnType<typeof useUi.getState>['toolOpts']['draw']) {
    const ctx = this.engine.ctx!;
    const base = {
      id: 'preview', authorId: ctx.me.id, text: '', stroke: opts.stroke, strokeWidth: opts.width,
      fill: opts.fill ? opts.stroke : null, fillAlpha: 0.25, layer: 'below' as const, gmOnly: opts.gmOnly && ctx.isDM,
    };
    if (this.kind === 'rect' || this.kind === 'ellipse') {
      const [x0, y0, x1, y1] = this.pts as [number, number, number, number];
      return { ...base, kind: this.kind, points: [], x: x0, y: y0, w: (x1 ?? x0) - x0, h: (y1 ?? y0) - y0 };
    }
    let minX = Infinity, minY = Infinity;
    for (let i = 0; i < this.pts.length; i += 2) {
      minX = Math.min(minX, this.pts[i]!);
      minY = Math.min(minY, this.pts[i + 1]!);
    }
    const rel = this.pts.map((v, i) => (i % 2 === 0 ? v - minX : v - minY));
    return { ...base, kind: this.kind, points: rel, x: minX, y: minY, w: 0, h: 0 };
  }

  up(): void {
    const ctx = this.engine.ctx!;
    if (!this.start) return;
    const opts = useUi.getState().toolOpts.draw;
    if (this.kind === 'path') this.pts = simplifyPath(this.pts, 1.2 / this.engine.camera.scale);
    const d = this.toDrawing(opts);
    this.start = null;
    this.engine.overlay.clearPreview();
    const tiny = (d.kind === 'rect' || d.kind === 'ellipse') ? Math.abs(d.w) + Math.abs(d.h) < 4 : d.points.length < 4;
    if (tiny) return;
    const { id: _id, authorId: _a, ...drawing } = d;
    void act('drawing.create', { sceneId: ctx.scene.id, drawing: { ...drawing, layer: 'below' } });
  }

  cancel(): void {
    this.start = null;
    this.engine.overlay.clearPreview();
  }

  hoverCursor(): string {
    return 'crosshair';
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

class TemplateTool implements Tool {
  private engine: Engine;
  private origin: { x: number; y: number } | null = null;
  private moving: { id: ID; dx: number; dy: number } | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  private make(x: number, y: number, angle: number): Template {
    const ctx = this.engine.ctx!;
    const o = useUi.getState().toolOpts.template;
    return {
      id: 'preview', authorId: ctx.me.id, kind: o.kind, x, y, angle, size: o.size, width: o.width, color: o.color,
      label: o.label, spellId: o.spellId,
    };
  }

  private templateAt(x: number, y: number): Template | null {
    const ctx = this.engine.ctx!;
    const list = Object.values(ctx.scene.templates);
    for (let i = list.length - 1; i >= 0; i--) {
      const t = list[i]!;
      if (Math.hypot(x - t.x, y - t.y) < ctx.scene.grid.size * 0.5) return t;
    }
    return null;
  }

  down(e: PEvent): void {
    const ctx = this.engine.ctx!;
    const existing = this.templateAt(e.wx, e.wy);
    if (e.button === 2) {
      if (existing && (ctx.isDM || existing.authorId === ctx.me.id)) void act('template.delete', { sceneId: ctx.scene.id, ids: [existing.id] });
      return;
    }
    if (e.button !== 0) return;
    if (existing && (ctx.isDM || existing.authorId === ctx.me.id)) {
      this.moving = { id: existing.id, dx: e.wx - existing.x, dy: e.wy - existing.y };
      return;
    }
    const g = ctx.scene.grid;
    const kind = useUi.getState().toolOpts.template.kind;
    const p = g.type === 'none' ? { x: e.wx, y: e.wy } : snapPoint(g, e.wx, e.wy, kind === 'circle' || kind === 'square' ? 'both' : 'corner');
    this.origin = p;
    this.preview(p.x, p.y, 0);
  }

  private preview(x: number, y: number, angle: number): void {
    const ctx = this.engine.ctx!;
    const t = this.make(x, y, angle);
    const g = this.engine.overlay.preview;
    g.clear();
    drawTemplate(g, t, ctx, true);
    const hit = tokensInTemplate(t, ctx.scene.grid, Object.values(ctx.scene.tokens).filter((tk) => ctx.isDM || !tk.hidden));
    this.engine.overlay.setPreviewLabel(`${t.label ? `${t.label} · ` : ''}${t.size} pés${hit.length ? ` · ${hit.length} alvo(s)` : ''}`, x, y - ctx.scene.grid.size * 0.3);
    this.engine.requestRender();
  }

  move(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (this.moving) {
      const t = ctx.scene.templates[this.moving.id];
      if (!t) return;
      const g = this.engine.overlay.preview;
      g.clear();
      drawTemplate(g, { ...t, x: e.wx - this.moving.dx, y: e.wy - this.moving.dy }, ctx, true);
      this.engine.requestRender();
      return;
    }
    if (!this.origin) return;
    const angle = (Math.atan2(e.wy - this.origin.y, e.wx - this.origin.x) * 180) / Math.PI;
    this.preview(this.origin.x, this.origin.y, Math.round(angle / 5) * 5);
  }

  up(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (this.moving) {
      const m = this.moving;
      this.moving = null;
      this.engine.overlay.clearPreview();
      const g = ctx.scene.grid;
      const p = g.type === 'none' ? { x: e.wx - m.dx, y: e.wy - m.dy } : snapPoint(g, e.wx - m.dx, e.wy - m.dy, 'both');
      void act('template.update', { sceneId: ctx.scene.id, id: m.id, patch: { x: p.x, y: p.y } });
      return;
    }
    if (!this.origin) return;
    const o = this.origin;
    this.origin = null;
    const angle = Math.round(((Math.atan2(e.wy - o.y, e.wx - o.x) * 180) / Math.PI) / 5) * 5;
    const t = this.make(o.x, o.y, Number.isFinite(angle) ? angle : 0);
    this.engine.overlay.clearPreview();
    const { id: _id, authorId: _a, ...template } = t;
    void act('template.create', { sceneId: ctx.scene.id, template });
    // Auto-target everything inside the area (ready for "Pedir salvaguarda"/spell rolls).
    const hit = tokensInTemplate(t, ctx.scene.grid, Object.values(ctx.scene.tokens).filter((tk) => ctx.isDM || !tk.hidden));
    if (hit.length) {
      useUi.getState().setTargets(hit.map((h) => h.id));
      sendFx({ type: 'target', playerId: ctx.me.id, tokenIds: hit.map((h) => h.id) });
      toast(`${hit.length} alvo(s) marcados pela área.`, 'info', 2200);
    }
  }

  key(e: KeyboardEvent): boolean {
    const ctx = this.engine.ctx!;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const mine = Object.values(ctx.scene.templates).filter((t) => ctx.isDM || t.authorId === ctx.me.id);
      const last = mine[mine.length - 1];
      if (last) void act('template.delete', { sceneId: ctx.scene.id, ids: [last.id] });
      return true;
    }
    return false;
  }

  cancel(): void {
    this.origin = null;
    this.moving = null;
    this.engine.overlay.clearPreview();
  }

  hoverCursor(): string {
    return 'crosshair';
  }
}

// ---------------------------------------------------------------------------
// Walls (DM)
// ---------------------------------------------------------------------------

class WallTool implements Tool {
  private engine: Engine;
  private start: { x: number; y: number } | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  private snap(x: number, y: number, shift: boolean): { x: number; y: number } {
    const ctx = this.engine.ctx!;
    const near = this.engine.walls.endpointNear(x, y);
    if (near) return near;
    const o = useUi.getState().toolOpts.wall;
    if (o.snap !== shift && ctx.scene.grid.type === 'square') return snapPoint(ctx.scene.grid, x, y, 'both');
    return { x, y };
  }

  down(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (!ctx.isDM) return;
    if (e.button === 2) {
      if (this.start) {
        this.cancel();
        return;
      }
      const w = this.engine.walls.wallAt(e.wx, e.wy);
      if (w) void act('wall.delete', { sceneId: ctx.scene.id, ids: [w.id] });
      return;
    }
    if (e.button !== 0) return;
    const p = this.snap(e.wx, e.wy, e.shift);
    if (!this.start) {
      this.start = p;
      return;
    }
    const o = useUi.getState().toolOpts.wall;
    const a = this.start;
    if (Math.hypot(p.x - a.x, p.y - a.y) > 2) {
      void act('wall.create', { sceneId: ctx.scene.id, walls: [{ c: [a.x, a.y, p.x, p.y], kind: o.kind, door: 'closed', secret: false }] });
    }
    this.start = o.chain && o.kind !== 'door' ? p : null;
    if (!this.start) this.engine.overlay.clearPreview();
  }

  move(e: PEvent): void {
    this.hoverPreview(e);
  }

  private hoverPreview(e: PEvent): void {
    if (!this.start) return;
    const p = this.snap(e.wx, e.wy, e.shift);
    const g = this.engine.overlay.preview;
    const k = 1 / Math.max(0.2, this.engine.camera.scale);
    g.clear();
    g.moveTo(this.start.x, this.start.y).lineTo(p.x, p.y).stroke({ color: 0xffcf6b, width: 3 * k, alpha: 0.8 });
    g.circle(p.x, p.y, 5 * k).fill({ color: 0xffcf6b });
    this.engine.requestRender();
  }

  hoverCursor(e: PEvent): string {
    if (this.start) this.hoverPreview(e);
    return 'crosshair';
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Escape' && this.start) {
      this.cancel();
      return true;
    }
    return false;
  }

  cancel(): void {
    this.start = null;
    this.engine.overlay.clearPreview();
  }
}

// ---------------------------------------------------------------------------
// Lights (DM)
// ---------------------------------------------------------------------------

class LightTool implements Tool {
  private engine: Engine;
  private moving: { id: ID } | null = null;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  down(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (!ctx.isDM) return;
    const hit = this.engine.lightIcons.lightAt(e.wx, e.wy);
    if (e.button === 2) {
      if (hit) void act('light.delete', { sceneId: ctx.scene.id, ids: [hit.id] });
      return;
    }
    if (e.button !== 0) return;
    if (hit) {
      this.moving = { id: hit.id };
      return;
    }
    const preset = LIGHT_PRESETS[useUi.getState().toolOpts.light.preset] ?? LIGHT_PRESETS.torch!;
    void act('light.create', { sceneId: ctx.scene.id, light: { ...preset.light, x: e.wx, y: e.wy, enabled: true, hidden: false } });
  }

  move(e: PEvent): void {
    if (!this.moving) return;
    const g = this.engine.overlay.preview;
    g.clear();
    g.circle(e.wx, e.wy, 10 / this.engine.camera.scale).fill({ color: 0xffd28a, alpha: 0.8 });
    this.engine.requestRender();
  }

  up(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (!this.moving) return;
    void act('light.update', { sceneId: ctx.scene.id, id: this.moving.id, patch: { x: e.wx, y: e.wy } });
    this.moving = null;
    this.engine.overlay.clearPreview();
  }

  dblclick(e: PEvent): void {
    const ctx = this.engine.ctx!;
    const hit = this.engine.lightIcons.lightAt(e.wx, e.wy);
    if (hit) void act('light.update', { sceneId: ctx.scene.id, id: hit.id, patch: { enabled: !hit.enabled } });
  }

  hoverCursor(e: PEvent): string {
    return this.engine.lightIcons.lightAt(e.wx, e.wy) ? 'move' : 'copy';
  }
}

// ---------------------------------------------------------------------------
// Fog (DM)
// ---------------------------------------------------------------------------

class FogTool implements Tool {
  private engine: Engine;
  private start: { x: number; y: number } | null = null;
  private poly: number[] = [];

  constructor(engine: Engine) {
    this.engine = engine;
  }

  down(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (!ctx.isDM || e.button !== 0) {
      if (e.button === 2) this.cancel();
      return;
    }
    const o = useUi.getState().toolOpts.fog;
    if (o.shape === 'poly') {
      this.poly.push(e.wx, e.wy);
      this.drawPoly(e.wx, e.wy);
      return;
    }
    this.start = { x: e.wx, y: e.wy };
  }

  private drawPoly(cx: number, cy: number): void {
    const g = this.engine.overlay.preview;
    const k = 1 / Math.max(0.2, this.engine.camera.scale);
    g.clear();
    if (this.poly.length >= 2) {
      g.moveTo(this.poly[0]!, this.poly[1]!);
      for (let i = 2; i < this.poly.length; i += 2) g.lineTo(this.poly[i]!, this.poly[i + 1]!);
      g.lineTo(cx, cy).stroke({ color: 0x9b7bff, width: 2 * k });
      for (let i = 0; i < this.poly.length; i += 2) g.circle(this.poly[i]!, this.poly[i + 1]!, 4 * k).fill({ color: 0x9b7bff });
    }
    this.engine.requestRender();
  }

  move(e: PEvent): void {
    const o = useUi.getState().toolOpts.fog;
    if (o.shape === 'poly') {
      this.drawPoly(e.wx, e.wy);
      return;
    }
    if (!this.start) return;
    const g = this.engine.overlay.preview;
    g.clear();
    const color = o.op === 'reveal' ? 0x3fbf8f : 0x9b7bff;
    if (o.shape === 'rect') g.rect(Math.min(this.start.x, e.wx), Math.min(this.start.y, e.wy), Math.abs(e.wx - this.start.x), Math.abs(e.wy - this.start.y));
    else g.circle(this.start.x, this.start.y, Math.hypot(e.wx - this.start.x, e.wy - this.start.y));
    g.fill({ color, alpha: 0.15 }).stroke({ color, width: 2 / this.engine.camera.scale });
    this.engine.requestRender();
  }

  hoverCursor(e: PEvent): string {
    if (useUi.getState().toolOpts.fog.shape === 'poly' && this.poly.length) this.drawPoly(e.wx, e.wy);
    return 'crosshair';
  }

  up(e: PEvent): void {
    const ctx = this.engine.ctx!;
    const o = useUi.getState().toolOpts.fog;
    if (o.shape === 'poly' || !this.start) return;
    const s = this.start;
    this.start = null;
    this.engine.overlay.clearPreview();
    if (o.shape === 'rect') {
      const w = Math.abs(e.wx - s.x), h = Math.abs(e.wy - s.y);
      if (w < 4 || h < 4) return;
      void act('fog.add', { sceneId: ctx.scene.id, area: { op: o.op, shape: { kind: 'rect', x: Math.min(s.x, e.wx), y: Math.min(s.y, e.wy), w, h } } });
    } else {
      const r = Math.hypot(e.wx - s.x, e.wy - s.y);
      if (r < 4) return;
      void act('fog.add', { sceneId: ctx.scene.id, area: { op: o.op, shape: { kind: 'circle', x: s.x, y: s.y, r } } });
    }
  }

  dblclick(): void {
    this.closePoly();
  }

  key(e: KeyboardEvent): boolean {
    if (e.key === 'Enter' && this.poly.length >= 6) {
      this.closePoly();
      return true;
    }
    if (e.key === 'Escape' && this.poly.length) {
      this.cancel();
      return true;
    }
    return false;
  }

  private closePoly(): void {
    const ctx = this.engine.ctx!;
    if (this.poly.length >= 6) {
      const o = useUi.getState().toolOpts.fog;
      void act('fog.add', { sceneId: ctx.scene.id, area: { op: o.op, shape: { kind: 'poly', points: this.poly } } });
    }
    this.cancel();
  }

  cancel(): void {
    this.start = null;
    this.poly = [];
    this.engine.overlay.clearPreview();
  }
}

// ---------------------------------------------------------------------------
// Notes (DM)
// ---------------------------------------------------------------------------

class NoteTool implements Tool {
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  down(e: PEvent): void {
    const ctx = this.engine.ctx!;
    if (!ctx.isDM) return;
    const hit = this.engine.notes.noteAt(e.wx, e.wy);
    if (e.button === 2) {
      if (hit) void act('note.delete', { sceneId: ctx.scene.id, ids: [hit.id] });
      return;
    }
    if (e.button !== 0) return;
    if (hit) {
      const label = window.prompt('Texto da nota:', hit.label);
      if (label !== null) void act('note.update', { sceneId: ctx.scene.id, id: hit.id, patch: { label: label.slice(0, 120) } });
      return;
    }
    const label = window.prompt('Texto da nota (ex: Armadilha, Baú, Altar):');
    if (!label?.trim()) return;
    void act('note.create', {
      sceneId: ctx.scene.id,
      note: { x: e.wx, y: e.wy, label: label.trim().slice(0, 120), icon: 'pin', journalId: null, hidden: e.shift },
    });
    if (e.shift) toast('Nota secreta criada (só o Mestre vê).', 'info');
  }

  hoverCursor(): string {
    return 'copy';
  }
}
