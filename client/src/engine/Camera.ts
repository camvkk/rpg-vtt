import type { Container } from 'pixi.js';
import type { Point } from '@shared/types.ts';

export const MIN_ZOOM = 0.08;
export const MAX_ZOOM = 6;

/** Screen-space camera: world = (screen - offset) / scale. Smoothly animates toward a target. */
export class Camera {
  x = 0;
  y = 0;
  scale = 1;
  private target: { x: number; y: number; scale: number } | null = null;
  private world: Container;
  onChange: () => void = () => {};

  constructor(world: Container) {
    this.world = world;
  }

  apply(): void {
    this.world.position.set(this.x, this.y);
    this.world.scale.set(this.scale);
  }

  screenToWorld(sx: number, sy: number): Point {
    return { x: (sx - this.x) / this.scale, y: (sy - this.y) / this.scale };
  }

  worldToScreen(wx: number, wy: number): Point {
    return { x: wx * this.scale + this.x, y: wy * this.scale + this.y };
  }

  pan(dx: number, dy: number): void {
    this.target = null;
    this.x += dx;
    this.y += dy;
    this.apply();
    this.onChange();
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const base = this.target ?? { x: this.x, y: this.y, scale: this.scale };
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, base.scale * factor));
    const wx = (sx - base.x) / base.scale;
    const wy = (sy - base.y) / base.scale;
    this.target = { scale: next, x: sx - wx * next, y: sy - wy * next };
  }

  setZoomImmediate(sx: number, sy: number, scale: number): void {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, scale));
    const wx = (sx - this.x) / this.scale;
    const wy = (sy - this.y) / this.scale;
    this.target = null;
    this.scale = next;
    this.x = sx - wx * next;
    this.y = sy - wy * next;
    this.apply();
    this.onChange();
  }

  /** Center the world point at the screen point (vw/2, vh/2). */
  centerOn(wx: number, wy: number, viewW: number, viewH: number, zoom?: number, animate = true): void {
    const scale = zoom ? Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) : (this.target?.scale ?? this.scale);
    const t = { scale, x: viewW / 2 - wx * scale, y: viewH / 2 - wy * scale };
    if (animate) this.target = t;
    else {
      this.target = null;
      Object.assign(this, t);
      this.apply();
      this.onChange();
    }
  }

  fit(bounds: { x: number; y: number; w: number; h: number }, viewW: number, viewH: number, pad = 60, animate = false): void {
    const scale = Math.max(MIN_ZOOM, Math.min(2, Math.min((viewW - pad * 2) / bounds.w, (viewH - pad * 2) / bounds.h)));
    this.centerOn(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, viewW, viewH, scale, animate);
  }

  /** Advance animation; returns true while moving. */
  tick(dt: number): boolean {
    if (!this.target) return false;
    const k = 1 - Math.pow(0.0008, dt / 1000);
    this.x += (this.target.x - this.x) * k;
    this.y += (this.target.y - this.y) * k;
    this.scale += (this.target.scale - this.scale) * k;
    const done = Math.abs(this.target.x - this.x) < 0.3 && Math.abs(this.target.y - this.y) < 0.3 && Math.abs(this.target.scale - this.scale) < 0.0005;
    if (done) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.scale = this.target.scale;
      this.target = null;
    }
    this.apply();
    this.onChange();
    return !done;
  }

  get animating(): boolean {
    return this.target !== null;
  }

  get targetScale(): number {
    return this.target?.scale ?? this.scale;
  }
}
