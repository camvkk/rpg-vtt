// Procedurally generated textures (cached).
import { Texture } from 'pixi.js';
import type { GridConfig } from '@shared/types.ts';
import { conditionSvg } from '../ui/conditionIcons.tsx';

const cache = new Map<string, Texture>();

function canvasTexture(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  draw(ctx);
  const tex = Texture.from(c);
  tex.source.scaleMode = 'linear';
  cache.set(key, tex);
  return tex;
}

/**
 * Radial light falloff: fully opaque until `bright` fraction, then smooth falloff to 0 at the edge.
 * Used as a texture fill (global space) for light polygons.
 */
export function lightGradient(brightRatio: number): Texture {
  const r = Math.round(Math.max(0, Math.min(1, brightRatio)) * 20) / 20;
  return canvasTexture(`light:${r}`, 256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    if (r > 0) g.addColorStop(Math.min(0.98, r), 'rgba(255,255,255,1)');
    g.addColorStop(Math.min(0.99, r + (1 - r) * 0.08), 'rgba(255,255,255,0.62)');
    g.addColorStop(Math.min(0.995, r + (1 - r) * 0.6), 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
  });
}

/** Soft circle used for vision/darkvision masks and glows. */
export function softCircle(): Texture {
  return canvasTexture('soft', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.85, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}

export function glowDot(): Texture {
  return canvasTexture('glow', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** Grid tile texture (white lines, tinted at render). Returns texture + tile origin for alignment. */
export function gridTile(g: GridConfig): { texture: Texture; originX: number; originY: number; scale: number } | null {
  if (g.type === 'none') return null;
  const SS = 2; // supersample for crisp lines
  const line = Math.max(1, Math.min(3, g.size / 40)) * SS;
  if (g.type === 'square') {
    const s = g.size * SS;
    const texture = canvasTexture(`grid:sq:${g.size}`, s, s, (ctx) => {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = line;
      ctx.beginPath();
      ctx.moveTo(0, line / 2);
      ctx.lineTo(s, line / 2);
      ctx.moveTo(line / 2, 0);
      ctx.lineTo(line / 2, s);
      ctx.stroke();
    });
    return { texture, originX: g.offsetX, originY: g.offsetY, scale: 1 / SS };
  }
  const R = (g.size / Math.sqrt(3)) * SS;
  const pointy = g.type === 'hex-pointy';
  const W = pointy ? Math.sqrt(3) * R : 3 * R;
  const H = pointy ? 3 * R : Math.sqrt(3) * R;
  const texture = canvasTexture(`grid:hex:${g.type}:${g.size}`, W, H, (ctx) => {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = line;
    const hex = (cx: number, cy: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = ((pointy ? 60 * i - 30 : 60 * i) * Math.PI) / 180;
        const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    };
    for (let i = -1; i <= 1; i++) {
      for (let j = -1; j <= 1; j++) {
        if (pointy) {
          hex(W / 2 + i * W, R + j * H);
          hex(i * W, 2.5 * R + j * H);
        } else {
          hex(R + i * W, H / 2 + j * H);
          hex(2.5 * R + i * W, j * H);
        }
      }
    }
  });
  // Tile point (W/2, R) [pointy] / (R, H/2) [flat] is the center of axial cell (0,0) = grid offset.
  const originX = g.offsetX - (pointy ? W / 2 : R) / SS;
  const originY = g.offsetY - (pointy ? R : H / 2) / SS;
  return { texture, originX, originY, scale: 1 / SS };
}

const svgTextures = new Map<string, Texture>();
const svgWaiters = new Map<string, (() => void)[]>();

/** Rasterize an SVG string into a cached texture (async; returns null until ready, then calls onReady). */
export function svgTexture(key: string, svg: string, size: number, onReady: () => void): Texture | null {
  const hit = svgTextures.get(key);
  if (hit) return hit;
  const waiting = svgWaiters.get(key);
  if (waiting) {
    waiting.push(onReady);
    return null;
  }
  svgWaiters.set(key, [onReady]);
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    c.getContext('2d')!.drawImage(img, 0, 0, size, size);
    svgTextures.set(key, Texture.from(c));
    const cbs = svgWaiters.get(key) ?? [];
    svgWaiters.delete(key);
    for (const cb of cbs) cb();
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return null;
}

/** Condition icon as a texture (loaded asynchronously from SVG; returns null until ready). */
export function conditionTexture(id: string, onReady: () => void): Texture | null {
  return svgTexture(`cond:${id}`, conditionSvg(id), 48, onReady);
}

/** Rain streak / snow flake / leaf / ember particle textures. */
export function particleTexture(kind: 'streak' | 'flake' | 'leaf' | 'cloud' | 'spark'): Texture {
  switch (kind) {
    case 'streak':
      return canvasTexture('p:streak', 4, 48, (ctx) => {
        const g = ctx.createLinearGradient(0, 0, 0, 48);
        g.addColorStop(0, 'rgba(200,220,255,0)');
        g.addColorStop(1, 'rgba(220,235,255,0.9)');
        ctx.fillStyle = g;
        ctx.fillRect(1, 0, 2, 48);
      });
    case 'flake':
      return canvasTexture('p:flake', 24, 24, (ctx) => {
        const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.7)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 24, 24);
      });
    case 'spark':
      return glowDot();
    case 'leaf':
      return canvasTexture('p:leaf', 24, 16, (ctx) => {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.ellipse(12, 8, 11, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(2, 8);
        ctx.lineTo(22, 8);
        ctx.stroke();
      });
    case 'cloud':
      return canvasTexture('p:cloud', 256, 256, (ctx) => {
        for (let i = 0; i < 14; i++) {
          const x = 70 + Math.random() * 116, y = 70 + Math.random() * 116, r = 40 + Math.random() * 50;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, 'rgba(255,255,255,0.22)');
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 256, 256);
        }
      });
  }
}
