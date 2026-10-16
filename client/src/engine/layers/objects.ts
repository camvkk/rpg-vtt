import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { cellsInTemplate, feetToPx, hexCorners, templatePolygon } from '@shared/geometry.ts';
import type { Drawing, ID, LightSource, MapNote, Template, Wall } from '@shared/types.ts';
import type { Engine, EngineCtx, Layer } from '../Engine.ts';

const WALL_COLOR: Record<string, number> = {
  wall: 0xffcf6b, door: 0xff9f43, window: 0x7dd3fc, invisible: 0xa1a1aa, ethereal: 0xb8a2ff,
};

function hex(c: string): number {
  const v = c.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v.slice(0, 6), 16);
  return Number.isFinite(n) ? n : 0xffffff;
}

export function distToSegment(px: number, py: number, c: [number, number, number, number]): number {
  const [x1, y1, x2, y2] = c;
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// ---------------------------------------------------------------------------
// Walls & doors
// ---------------------------------------------------------------------------

export class WallLayer implements Layer {
  container = new Container();
  private lines = new Graphics();
  private doors = new Graphics();
  private prev: Record<ID, Wall> | null = null;
  private prevMode = '';
  hoverDoor: ID | null = null;
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    this.container.addChild(this.lines, this.doors);
  }

  update(ctx: EngineCtx): void {
    const walls = ctx.scene.walls;
    const showAll = ctx.isDM && (ctx.tool === 'wall');
    const faint = ctx.isDM && (ctx.tool === 'light' || ctx.tool === 'fog');
    const mode = `${showAll}|${faint}|${this.hoverDoor}|${ctx.scene.grid.size}|${this.engine.camera.targetScale.toFixed(2)}`;
    if (walls === this.prev && mode === this.prevMode) return;
    this.prev = walls;
    this.prevMode = mode;
    const g = ctx.scene.grid.size;
    const zoom = Math.max(0.2, this.engine.camera.targetScale);
    this.lines.clear();
    this.doors.clear();
    if (showAll || faint) {
      const w = Math.max(2, 3 / zoom);
      for (const wall of Object.values(walls)) {
        const [x1, y1, x2, y2] = wall.c;
        const color = WALL_COLOR[wall.kind] ?? 0xffffff;
        this.lines.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0x000000, width: w + 2.5, alpha: faint ? 0.25 : 0.6, cap: 'round' });
        this.lines.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width: w, alpha: faint ? 0.4 : 0.95, cap: 'round' });
        if (showAll) {
          this.lines.circle(x1, y1, w * 1.4).fill({ color });
          this.lines.circle(x2, y2, w * 1.4).fill({ color });
        }
      }
    }
    // Doors for everyone
    for (const wall of Object.values(walls)) {
      if (wall.kind !== 'door') continue;
      const [x1, y1, x2, y2] = wall.c;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const len = Math.min(Math.hypot(x2 - x1, y2 - y1) * 0.8, g * 0.75);
      const th = Math.max(6, g * 0.16);
      const hovered = this.hoverDoor === wall.id;
      const cos = Math.cos(ang), sin = Math.sin(ang);
      const pts = (hw: number, hh: number) => [
        mx + cos * -hw - sin * -hh, my + sin * -hw + cos * -hh,
        mx + cos * hw - sin * -hh, my + sin * hw + cos * -hh,
        mx + cos * hw - sin * hh, my + sin * hw + cos * hh,
        mx + cos * -hw - sin * hh, my + sin * -hw + cos * hh,
      ];
      const stroke = wall.door === 'locked' ? 0xe2554d : wall.door === 'open' ? 0x3fbf8f : 0xe0b45a;
      if (wall.door === 'open') {
        // open: swung leaf
        const ox = x1 + cos * th * 0.2, oy = y1 + sin * th * 0.2;
        const leafAng = ang - Math.PI / 2.4;
        this.doors.moveTo(ox, oy).lineTo(ox + Math.cos(leafAng) * len, oy + Math.sin(leafAng) * len)
          .stroke({ color: 0x5a3a1c, width: th * 0.7, cap: 'round' });
        this.doors.moveTo(ox, oy).lineTo(ox + Math.cos(leafAng) * len, oy + Math.sin(leafAng) * len)
          .stroke({ color: stroke, width: Math.max(1.5, th * 0.18), alpha: hovered ? 1 : 0.8, cap: 'round' });
      } else {
        this.doors.poly(pts(len / 2, th / 2)).fill({ color: 0x5a3a1c }).stroke({ color: stroke, width: Math.max(1.5, th * 0.2), alpha: hovered ? 1 : 0.85 });
        if (wall.door === 'locked') this.doors.circle(mx, my, th * 0.28).fill({ color: 0xe2554d });
      }
      if (hovered) this.doors.circle(mx, my, g * 0.45).stroke({ color: 0xffffff, width: 2, alpha: 0.5 });
      if (ctx.isDM && wall.secret) this.doors.circle(mx, my, g * 0.32).stroke({ color: 0x9b7bff, width: 2, alpha: 0.9 });
    }
  }

  doorAt(x: number, y: number): Wall | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const g = ctx.scene.grid.size;
    let best: Wall | null = null;
    let bestD = g * 0.45;
    for (const w of Object.values(ctx.scene.walls)) {
      if (w.kind !== 'door') continue;
      const d = Math.hypot(x - (w.c[0] + w.c[2]) / 2, y - (w.c[1] + w.c[3]) / 2);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  wallAt(x: number, y: number): Wall | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const tol = 10 / Math.max(0.2, this.engine.camera.scale);
    let best: Wall | null = null;
    let bestD = tol;
    for (const w of Object.values(ctx.scene.walls)) {
      const d = distToSegment(x, y, w.c);
      if (d < bestD) {
        bestD = d;
        best = w;
      }
    }
    return best;
  }

  /** Nearest wall endpoint within tolerance (for snapping new walls to existing ones). */
  endpointNear(x: number, y: number): { x: number; y: number } | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const tol = 12 / Math.max(0.2, this.engine.camera.scale);
    let best: { x: number; y: number } | null = null;
    let bestD = tol;
    for (const w of Object.values(ctx.scene.walls)) {
      for (const [px, py] of [[w.c[0], w.c[1]], [w.c[2], w.c[3]]] as const) {
        const d = Math.hypot(x - px, y - py);
        if (d < bestD) {
          bestD = d;
          best = { x: px, y: py };
        }
      }
    }
    return best;
  }

  setHoverDoor(id: ID | null): void {
    if (id === this.hoverDoor) return;
    this.hoverDoor = id;
    if (this.engine.ctx) this.update(this.engine.ctx);
    this.engine.requestRender();
  }

  reset(): void {
    this.prev = null;
    this.prevMode = '';
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------
// Drawings
// ---------------------------------------------------------------------------

const textStyle = (color: string, size: number) => new TextStyle({
  fontFamily: 'Inter, sans-serif', fontSize: size, fontWeight: '700', fill: color,
  stroke: { color: '#000000', width: Math.max(2, size / 8), join: 'round' },
});

export function drawDrawing(g: Graphics, d: Drawing): void {
  const stroke = { color: hex(d.stroke), width: d.strokeWidth, cap: 'round' as const, join: 'round' as const };
  const fill = d.fill ? { color: hex(d.fill), alpha: d.fillAlpha } : null;
  switch (d.kind) {
    case 'path':
    case 'line':
    case 'poly': {
      const p = d.points;
      if (p.length < 4) {
        g.circle(d.x + (p[0] ?? 0), d.y + (p[1] ?? 0), d.strokeWidth / 2).fill({ color: stroke.color });
        return;
      }
      g.moveTo(d.x + p[0]!, d.y + p[1]!);
      for (let i = 2; i < p.length; i += 2) g.lineTo(d.x + p[i]!, d.y + p[i + 1]!);
      if (d.kind === 'poly') g.closePath();
      if (fill && d.kind === 'poly') g.fill(fill);
      g.stroke(stroke);
      return;
    }
    case 'rect': {
      const x = Math.min(d.x, d.x + d.w), y = Math.min(d.y, d.y + d.h);
      g.rect(x, y, Math.abs(d.w), Math.abs(d.h));
      if (fill) g.fill(fill);
      g.stroke(stroke);
      return;
    }
    case 'ellipse': {
      g.ellipse(d.x + d.w / 2, d.y + d.h / 2, Math.abs(d.w / 2), Math.abs(d.h / 2));
      if (fill) g.fill(fill);
      g.stroke(stroke);
      return;
    }
    default:
  }
}

export class DrawingLayer implements Layer {
  container = new Container();
  private items = new Map<ID, { d: Drawing; node: Graphics | Text }>();
  private prev: Record<ID, Drawing> | null = null;
  private which: 'below' | 'above';

  constructor(_engine: Engine, which: 'below' | 'above') {
    this.which = which;
  }

  update(ctx: EngineCtx): void {
    const all = ctx.scene.drawings;
    if (all === this.prev) return;
    this.prev = all;
    for (const [id, item] of this.items) {
      const d = all[id];
      if (!d || d.layer !== this.which || d !== item.d) {
        item.node.destroy();
        this.items.delete(id);
      }
    }
    for (const d of Object.values(all)) {
      if (d.layer !== this.which || this.items.has(d.id)) continue;
      let node: Graphics | Text;
      if (d.kind === 'text') {
        node = new Text({ text: d.text, style: textStyle(d.stroke, Math.max(10, d.strokeWidth * 6)), resolution: 2 });
        node.position.set(d.x, d.y);
      } else {
        node = new Graphics();
        drawDrawing(node, d);
      }
      node.alpha = d.gmOnly ? 0.6 : 1;
      this.container.addChild(node);
      this.items.set(d.id, { d, node });
    }
  }

  reset(): void {
    for (const i of this.items.values()) i.node.destroy();
    this.items.clear();
    this.prev = null;
  }

  destroy(): void {
    this.reset();
    this.container.destroy({ children: true });
  }
}

/** Hit test drawings (bounding boxes) — used by the eraser/select. */
export function drawingAt(drawings: Record<ID, Drawing>, x: number, y: number, tol: number): Drawing | null {
  const list = Object.values(drawings);
  for (let i = list.length - 1; i >= 0; i--) {
    const d = list[i]!;
    if (d.kind === 'path' || d.kind === 'line' || d.kind === 'poly') {
      for (let k = 0; k + 3 < d.points.length; k += 2) {
        const dist = distToSegment(x, y, [d.x + d.points[k]!, d.y + d.points[k + 1]!, d.x + d.points[k + 2]!, d.y + d.points[k + 3]!]);
        if (dist < tol + d.strokeWidth / 2) return d;
      }
    } else {
      const minX = Math.min(d.x, d.x + d.w) - tol, maxX = Math.max(d.x, d.x + d.w) + tol;
      const minY = Math.min(d.y, d.y + d.h) - tol, maxY = Math.max(d.y, d.y + d.h) + tol;
      const w = d.kind === 'text' ? Math.max(40, d.text.length * d.strokeWidth * 3.5) : 0;
      if (x >= minX && x <= maxX + w && y >= minY && y <= maxY + (d.kind === 'text' ? d.strokeWidth * 7 : 0)) return d;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Templates (areas of effect)
// ---------------------------------------------------------------------------

const labelStyle = new TextStyle({
  fontFamily: 'Cinzel, serif', fontSize: 14, fontWeight: '700', fill: '#fff4dc',
  stroke: { color: '#000000', width: 4, join: 'round' },
});

export function drawTemplate(g: Graphics, t: Template, ctx: EngineCtx, preview = false): void {
  const grid = ctx.scene.grid;
  const color = hex(t.color);
  if (grid.type !== 'none') {
    const cells = cellsInTemplate(t, grid);
    for (const c of cells) {
      if (grid.type === 'square') g.rect(c.x - grid.size / 2 + 1, c.y - grid.size / 2 + 1, grid.size - 2, grid.size - 2);
      else g.poly(hexCorners(grid, c));
    }
    g.fill({ color, alpha: preview ? 0.16 : 0.2 });
  }
  const poly = templatePolygon(t, grid);
  g.poly(poly).fill({ color, alpha: 0.12 }).stroke({ color, width: Math.max(2, grid.size * 0.04), alpha: 0.95 });
  if (t.kind === 'cone' || t.kind === 'line') {
    g.circle(t.x, t.y, Math.max(4, grid.size * 0.08)).fill({ color });
  }
  void feetToPx;
}

export class TemplateLayer implements Layer {
  container = new Container();
  private items = new Map<ID, { t: Template; g: Graphics; label: Text }>();
  private prev: Record<ID, Template> | null = null;
  private prevGrid: unknown = null;

  constructor(_engine: Engine) {}

  update(ctx: EngineCtx): void {
    const all = ctx.scene.templates;
    if (all === this.prev && ctx.scene.grid === this.prevGrid) return;
    const gridChanged = ctx.scene.grid !== this.prevGrid;
    this.prev = all;
    this.prevGrid = ctx.scene.grid;
    for (const [id, item] of this.items) {
      if (all[id] !== item.t || gridChanged) {
        item.g.destroy();
        item.label.destroy();
        this.items.delete(id);
      }
    }
    for (const t of Object.values(all)) {
      if (this.items.has(t.id)) continue;
      const g = new Graphics();
      drawTemplate(g, t, ctx);
      const label = new Text({ text: `${t.label ? `${t.label} · ` : ''}${t.size} pés`, style: labelStyle, resolution: 2 });
      label.anchor.set(0.5);
      label.scale.set(Math.max(0.7, ctx.scene.grid.size / 70));
      const lx = t.kind === 'cone' || t.kind === 'line'
        ? t.x + Math.cos((t.angle * Math.PI) / 180) * feetToPx(ctx.scene.grid, t.size) * 0.55
        : t.x;
      const ly = t.kind === 'cone' || t.kind === 'line'
        ? t.y + Math.sin((t.angle * Math.PI) / 180) * feetToPx(ctx.scene.grid, t.size) * 0.55
        : t.y;
      label.position.set(lx, ly);
      this.container.addChild(g, label);
      this.items.set(t.id, { t, g, label });
    }
  }

  reset(): void {
    for (const i of this.items.values()) {
      i.g.destroy();
      i.label.destroy();
    }
    this.items.clear();
    this.prev = null;
  }

  destroy(): void {
    this.reset();
    this.container.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

const noteStyle = new TextStyle({
  fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: '600', fill: '#f3ecdf',
  stroke: { color: '#000000', width: 3, join: 'round' },
});

export class NoteLayer implements Layer {
  container = new Container();
  private prev: Record<ID, MapNote> | null = null;
  private prevHover: ID | null = null;
  hover: ID | null = null;
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  update(ctx: EngineCtx): void {
    const notes = ctx.scene.notes;
    if (notes === this.prev && this.hover === this.prevHover) return;
    this.prev = notes;
    this.prevHover = this.hover;
    this.container.removeChildren().forEach((c) => c.destroy());
    const s = Math.max(18, ctx.scene.grid.size * 0.38);
    for (const n of Object.values(notes)) {
      const g = new Graphics();
      // teardrop pin
      g.circle(0, -s * 1.1, s * 0.55).fill({ color: n.hidden ? 0x7a5ae6 : 0xb43a34 }).stroke({ color: 0xf6dc9a, width: 2 });
      g.moveTo(-s * 0.42, -s * 0.8).lineTo(0, 0).lineTo(s * 0.42, -s * 0.8).fill({ color: n.hidden ? 0x7a5ae6 : 0xb43a34 });
      g.circle(0, -s * 1.1, s * 0.2).fill({ color: 0xf6dc9a });
      g.position.set(n.x, n.y);
      g.alpha = n.hidden ? 0.65 : 1;
      this.container.addChild(g);
      if (this.hover === n.id || n.label.length < 18) {
        const t = new Text({ text: n.label, style: noteStyle, resolution: 2 });
        t.anchor.set(0.5, 1);
        t.position.set(n.x, n.y - s * 1.8);
        this.container.addChild(t);
      }
    }
  }

  noteAt(x: number, y: number): MapNote | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const s = Math.max(18, ctx.scene.grid.size * 0.38);
    for (const n of Object.values(ctx.scene.notes)) {
      if (Math.hypot(x - n.x, y - (n.y - s * 0.9)) < s * 0.9) return n;
    }
    return null;
  }

  setHover(id: ID | null): void {
    if (this.hover === id) return;
    this.hover = id;
    if (this.engine.ctx) this.update(this.engine.ctx);
    this.engine.requestRender();
  }

  reset(): void {
    this.prev = null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

// ---------------------------------------------------------------------------
// Light icons (DM)
// ---------------------------------------------------------------------------

export class LightIconLayer implements Layer {
  container = new Container();
  private prev: Record<ID, LightSource> | null = null;
  private prevShow = false;
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
  }

  update(ctx: EngineCtx): void {
    const show = ctx.isDM && (ctx.tool === 'light' || ctx.tool === 'wall');
    if (ctx.scene.lights === this.prev && show === this.prevShow) return;
    this.prev = ctx.scene.lights;
    this.prevShow = show;
    this.container.removeChildren().forEach((c) => c.destroy());
    if (!show) return;
    const s = Math.max(12, ctx.scene.grid.size * 0.22);
    for (const l of Object.values(ctx.scene.lights)) {
      const g = new Graphics();
      g.circle(0, 0, s).fill({ color: 0x0b0a0f, alpha: 0.85 }).stroke({ color: hex(l.color), width: 2.5 });
      g.circle(0, 0, s * 0.45).fill({ color: l.enabled ? hex(l.color) : 0x444444 });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.moveTo(Math.cos(a) * s * 1.2, Math.sin(a) * s * 1.2).lineTo(Math.cos(a) * s * 1.6, Math.sin(a) * s * 1.6).stroke({ color: hex(l.color), width: 2, alpha: l.enabled ? 0.9 : 0.3 });
      }
      g.position.set(l.x, l.y);
      this.container.addChild(g);
    }
  }

  lightAt(x: number, y: number): LightSource | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const s = Math.max(12, ctx.scene.grid.size * 0.22) * 1.4;
    for (const l of Object.values(ctx.scene.lights)) if (Math.hypot(x - l.x, y - l.y) < s) return l;
    return null;
  }

  reset(): void {
    this.prev = null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
