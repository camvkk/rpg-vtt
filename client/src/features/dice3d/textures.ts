/**
 * Canvas-generated numeral atlases.
 *
 * One atlas per die kind holds one square cell per face (plus a blank cell used by
 * the bevels). Each face of the geometry is UV-mapped onto its own cell, so a die
 * is a single draw call. Two variants are painted from the same layout:
 *  - 'color': die body colour + gold numerals with a dark outline (sRGB map);
 *  - 'mask' : white numerals on black (drives metalness + emissive, linear).
 */
import type { DieShape } from './shapes.ts';

export const FONT_FAMILY = "Cinzel, 'Trajan Pro', 'Times New Roman', serif";
export const NUMERAL_GOLD = '#e8c46a';
export const DEFAULT_DIE_COLOR = '#7a1f2b';

export interface AtlasLayout {
  cols: number;
  rows: number;
  cellPx: number;
  /** Number of face cells; the blank cell index equals this. */
  faceCells: number;
}

export function atlasLayout(shape: DieShape): AtlasLayout {
  const faceCells = shape.faces.length;
  const cells = faceCells + 1;
  const cols = Math.ceil(Math.sqrt(cells));
  const rows = Math.ceil(cells / cols);
  let minGlyph = Infinity;
  for (const g of shape.glyphs) for (const gl of g) minGlyph = Math.min(minGlyph, gl.size);
  // Aim for >= 48px tall digits in the texture (>= 1.4x the on-screen size at DPR 2).
  let cellPx = Math.ceil(48 / (minGlyph / (2 * shape.cellHalf)));
  cellPx = Math.max(128, Math.min(320, cellPx, Math.floor(2048 / Math.max(cols, rows))));
  cellPx = Math.ceil(cellPx / 8) * 8;
  return { cols, rows, cellPx, faceCells };
}

/** Atlas UV of a point (s, t) in [0,1]² inside `cell` (t = 1 is the top of the cell). */
export function cellUV(layout: AtlasLayout, cell: number, s: number, t: number): [number, number] {
  const col = cell % layout.cols;
  const row = Math.floor(cell / layout.cols);
  return [(col + s) / layout.cols, 1 - (row + 1 - t) / layout.rows];
}

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Deterministic tiny PRNG so atlases look the same every time. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number): number => Math.max(0, Math.min(255, Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `rgb(${r},${g},${b})`;
}

let digitRatio = 0;
/** Height of a lining digit relative to the font size (measured once). */
function digitHeightRatio(ctx: CanvasRenderingContext2D): number {
  if (digitRatio > 0) return digitRatio;
  ctx.save();
  ctx.font = `700 100px ${FONT_FAMILY}`;
  const m = ctx.measureText('8');
  ctx.restore();
  const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  digitRatio = h > 10 ? h / 100 : 0.7;
  return digitRatio;
}

export type AtlasMode = 'color' | 'mask';

/**
 * Paint the atlas. `bodyColor` must be a #rrggbb string (only used in 'color' mode).
 */
export function paintAtlas(shape: DieShape, layout: AtlasLayout, mode: AtlasMode, bodyColor = DEFAULT_DIE_COLOR): HTMLCanvasElement {
  const { cols, rows, cellPx } = layout;
  const canvas = makeCanvas(cols * cellPx, rows * cellPx);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.fillStyle = mode === 'color' ? bodyColor : '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (mode === 'color') {
    // Very subtle marbling so the resin does not look like flat plastic.
    const rnd = prng(shape.faces.length * 7919);
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let cell = 0; cell < layout.faceCells; cell++) {
      const cx = (cell % cols) * cellPx;
      const cy = Math.floor(cell / cols) * cellPx;
      ctx.save();
      ctx.beginPath();
      ctx.rect(cx, cy, cellPx, cellPx);
      ctx.clip();
      for (let k = 0; k < 5; k++) {
        ctx.strokeStyle = k % 2 === 0 ? shade(bodyColor, 0.22) : shade(bodyColor, -0.35);
        ctx.globalAlpha = 0.07 + rnd() * 0.05;
        ctx.lineWidth = cellPx * (0.04 + rnd() * 0.08);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(cx + rnd() * cellPx, cy + rnd() * cellPx);
        ctx.bezierCurveTo(
          cx + rnd() * cellPx, cy + rnd() * cellPx,
          cx + rnd() * cellPx, cy + rnd() * cellPx,
          cx + rnd() * cellPx, cy + rnd() * cellPx,
        );
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  const ratio = digitHeightRatio(ctx);
  const toPx = cellPx / (2 * shape.cellHalf);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';

  shape.glyphs.forEach((glyphs, cell) => {
    const ox = (cell % cols) * cellPx;
    const oy = Math.floor(cell / cols) * cellPx;
    for (const g of glyphs) {
      const targetH = g.size * toPx;
      let fontPx = targetH / ratio;
      ctx.font = `700 ${fontPx}px ${FONT_FAMILY}`;
      const w0 = ctx.measureText(g.text).width;
      const maxW = g.maxWidth * toPx;
      if (w0 > maxW) {
        fontPx *= maxW / w0;
        ctx.font = `700 ${fontPx}px ${FONT_FAMILY}`;
      }
      const m = ctx.measureText(g.text);
      const asc = m.actualBoundingBoxAscent || fontPx * ratio;
      const desc = m.actualBoundingBoxDescent || 0;
      const width = m.width;

      ctx.save();
      ctx.translate(ox + (g.x / (2 * shape.cellHalf) + 0.5) * cellPx, oy + (0.5 - g.y / (2 * shape.cellHalf)) * cellPx);
      ctx.rotate(g.rot);
      // Centre the glyph box (and its underline) on the anchor.
      const underlineGap = fontPx * 0.09;
      const underlineH = Math.max(1.5, fontPx * 0.075);
      const extra = g.underline ? underlineGap + underlineH : 0;
      const baseY = (asc - desc) / 2 - extra / 2;
      const ulY = baseY + desc + underlineGap;
      const ulW = Math.max(width * 0.7, fontPx * 0.42);

      if (mode === 'color') {
        // Soft engraved shadow + dark outline.
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = fontPx * 0.12;
        ctx.strokeStyle = 'rgba(22,8,10,0.92)';
        ctx.lineWidth = Math.max(2, fontPx * 0.13);
        ctx.strokeText(g.text, 0, baseY);
        if (g.underline) ctx.strokeRect(-ulW / 2, ulY, ulW, underlineH);
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
        const grad = ctx.createLinearGradient(0, baseY - asc, 0, baseY + desc + extra);
        grad.addColorStop(0, '#fbe9b0');
        grad.addColorStop(0.45, NUMERAL_GOLD);
        grad.addColorStop(1, '#b8893b');
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = '#fff';
      }
      ctx.fillText(g.text, 0, baseY);
      if (g.underline) ctx.fillRect(-ulW / 2, ulY, ulW, underlineH);
      ctx.restore();
    }
  });
  return canvas;
}

/** Radial glow used by the crit / fumble halo sprites. */
export function paintHalo(size = 128): HTMLCanvasElement {
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

/** Wait (bounded) for the numeral font so the atlases are painted with Cinzel. */
export async function ensureFont(timeoutMs = 1500): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  try {
    await Promise.race([
      document.fonts.load(`700 64px Cinzel`, '0123456789'),
      new Promise((r) => setTimeout(r, timeoutMs)),
    ]);
  } catch {
    /* fall back to serif */
  }
  digitRatio = 0;
}
