import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { ID } from '@shared/types.ts';
import type { Engine, EngineCtx, Layer } from '../Engine.ts';

const rulerStyle = new TextStyle({
  fontFamily: 'Cinzel, serif', fontSize: 16, fontWeight: '700', fill: '#fff4dc',
  stroke: { color: '#000000', width: 4, join: 'round' },
});

function hex(c: string): number {
  const v = c.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v.slice(0, 6), 16);
  return Number.isFinite(n) ? n : 0xffffff;
}

interface Ruler {
  points: number[];
  color: number;
  label: string;
  updated: number;
  g: Graphics;
  text: Text;
}

interface Ping {
  x: number;
  y: number;
  color: number;
  t0: number;
  g: Graphics;
}

export class OverlayLayer implements Layer {
  container = new Container();
  /** Free-form preview for the active tool (cleared by tools). */
  preview = new Graphics();
  previewText: Text;
  private selectBox = new Graphics();
  private rulers = new Map<string, Ruler>();
  private pings: Ping[] = [];
  private engine: Engine;

  constructor(engine: Engine) {
    this.engine = engine;
    this.previewText = new Text({ text: '', style: rulerStyle, resolution: 2 });
    this.previewText.anchor.set(0.5, 1.2);
    this.previewText.visible = false;
    this.container.addChild(this.preview, this.selectBox, this.previewText);
  }

  update(_ctx: EngineCtx): void {}

  private zoomK(): number {
    return 1 / Math.max(0.15, this.engine.camera.scale);
  }

  setSelectBox(rect: { x0: number; y0: number; x1: number; y1: number } | null): void {
    this.selectBox.clear();
    if (rect) {
      const x = Math.min(rect.x0, rect.x1), y = Math.min(rect.y0, rect.y1);
      const w = Math.abs(rect.x1 - rect.x0), h = Math.abs(rect.y1 - rect.y0);
      this.selectBox.rect(x, y, w, h).fill({ color: 0xe0b45a, alpha: 0.08 }).stroke({ color: 0xf6dc9a, width: 1.5 * this.zoomK(), alpha: 0.9 });
    }
    this.engine.requestRender();
  }

  setPreviewLabel(text: string | null, x = 0, y = 0): void {
    this.previewText.visible = !!text;
    if (text) {
      this.previewText.text = text;
      this.previewText.position.set(x, y);
      this.previewText.scale.set(this.zoomK());
    }
    this.engine.requestRender();
  }

  clearPreview(): void {
    this.preview.clear();
    this.previewText.visible = false;
    this.engine.requestRender();
  }

  /** Draw/update a ruler (local or remote). points = flat world coords. */
  setRuler(key: string, points: number[] | null, color: string, label: string): void {
    let r = this.rulers.get(key);
    if (!points || points.length < 4) {
      if (r) {
        r.g.destroy();
        r.text.destroy();
        this.rulers.delete(key);
      }
      this.engine.requestRender();
      return;
    }
    if (!r) {
      r = { points, color: hex(color), label, updated: performance.now(), g: new Graphics(), text: new Text({ text: '', style: rulerStyle, resolution: 2 }) };
      r.text.anchor.set(0.5, 1.3);
      this.container.addChild(r.g, r.text);
      this.rulers.set(key, r);
    }
    r.points = points;
    r.color = hex(color);
    r.label = label;
    r.updated = performance.now();
    const k = this.zoomK();
    const g = r.g;
    g.clear();
    g.moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i]!, points[i + 1]!);
    g.stroke({ color: 0x000000, width: 7 * k, alpha: 0.55, cap: 'round', join: 'round' });
    g.moveTo(points[0]!, points[1]!);
    for (let i = 2; i < points.length; i += 2) g.lineTo(points[i]!, points[i + 1]!);
    g.stroke({ color: r.color, width: 3.5 * k, cap: 'round', join: 'round' });
    for (let i = 0; i < points.length; i += 2) {
      g.circle(points[i]!, points[i + 1]!, (i === 0 ? 5 : 4) * k).fill({ color: r.color }).stroke({ color: 0x000000, width: 1.5 * k });
    }
    const ex = points[points.length - 2]!, ey = points[points.length - 1]!;
    r.text.text = label;
    r.text.scale.set(k);
    r.text.position.set(ex, ey);
    this.engine.requestRender();
  }

  addPing(x: number, y: number, color: string): void {
    const g = new Graphics();
    this.container.addChild(g);
    this.pings.push({ x, y, color: hex(color), t0: performance.now(), g });
    this.engine.requestRender();
  }

  tick(_dt: number, now: number): boolean {
    let anim = false;
    const k = this.zoomK();
    this.pings = this.pings.filter((p) => {
      const t = (now - p.t0) / 1600;
      if (t >= 1) {
        p.g.destroy();
        return false;
      }
      anim = true;
      p.g.clear();
      for (let i = 0; i < 3; i++) {
        const tt = Math.max(0, Math.min(1, t * 1.25 - i * 0.18));
        if (tt <= 0 || tt >= 1) continue;
        const r = (12 + tt * 70) * k;
        p.g.circle(p.x, p.y, r).stroke({ color: p.color, width: (4 - tt * 3) * k, alpha: (1 - tt) * 0.95 });
      }
      p.g.circle(p.x, p.y, 6 * k).fill({ color: p.color, alpha: 1 - t });
      return true;
    });
    // Remote rulers fade after inactivity
    for (const [key, r] of this.rulers) {
      if (key === 'local') continue;
      if (now - r.updated > 6000) {
        r.g.destroy();
        r.text.destroy();
        this.rulers.delete(key);
        anim = true;
      }
    }
    return anim;
  }

  reset(): void {
    for (const r of this.rulers.values()) {
      r.g.destroy();
      r.text.destroy();
    }
    this.rulers.clear();
    for (const p of this.pings) p.g.destroy();
    this.pings = [];
    this.clearPreview();
    this.setSelectBox(null);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  removeRulerOf(playerId: ID): void {
    this.setRuler(playerId, null, '#fff', '');
  }
}
