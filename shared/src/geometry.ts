// Geometry shared by the renderer (vision/lighting) and the server (movement collision, template targets).
import type { GridConfig, Point, Template, Token, Wall } from './types.ts';

export type Segment = [number, number, number, number];

// ---------------------------------------------------------------------------
// Walls
// ---------------------------------------------------------------------------

export function wallBlocksSight(w: Wall): boolean {
  switch (w.kind) {
    case 'wall':
    case 'ethereal':
      return true;
    case 'door':
      return w.door !== 'open';
    default:
      return false;
  }
}

export function wallBlocksMovement(w: Wall): boolean {
  switch (w.kind) {
    case 'wall':
    case 'window':
    case 'invisible':
      return true;
    case 'door':
      return w.door !== 'open';
    default:
      return false;
  }
}

/** Intersection of segment p→p2 with segment q→q2. Returns parameter t along p (0..1) or null. */
export function segmentIntersectT(
  px: number, py: number, p2x: number, p2y: number,
  qx: number, qy: number, q2x: number, q2y: number,
): number | null {
  const rx = p2x - px, ry = p2y - py;
  const sx = q2x - qx, sy = q2y - qy;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const qpx = qx - px, qpy = qy - py;
  const t = (qpx * sy - qpy * sx) / denom;
  const u = (qpx * ry - qpy * rx) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

/** True when moving in a straight line from a to b crosses any movement-blocking wall. */
export function movementBlocked(a: Point, b: Point, walls: Iterable<Wall>): boolean {
  for (const w of walls) {
    if (!wallBlocksMovement(w)) continue;
    const t = segmentIntersectT(a.x, a.y, b.x, b.y, w.c[0], w.c[1], w.c[2], w.c[3]);
    // ignore touching exactly at the start (token standing on a wall line)
    if (t !== null && t > 1e-6) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Visibility polygon (2D ray casting against wall endpoints)
// ---------------------------------------------------------------------------

/**
 * Computes the polygon visible from `origin` given blocking segments, limited to a square of `radius`
 * around the origin (and optional scene bounds). Returns flat [x0,y0,x1,y1,...] sorted by angle.
 */
export function visibilityPolygon(
  origin: Point,
  segments: Segment[],
  radius: number,
  bounds?: { x: number; y: number; w: number; h: number },
): number[] {
  const ox = origin.x, oy = origin.y;
  let minX = ox - radius, minY = oy - radius, maxX = ox + radius, maxY = oy + radius;
  if (bounds) {
    minX = Math.max(minX, bounds.x);
    minY = Math.max(minY, bounds.y);
    maxX = Math.min(maxX, bounds.x + bounds.w);
    maxY = Math.min(maxY, bounds.y + bounds.h);
    if (minX >= maxX || minY >= maxY) return [];
  }
  // Keep only segments that touch the box.
  const segs: Segment[] = [];
  for (const s of segments) {
    const sMinX = Math.min(s[0], s[2]), sMaxX = Math.max(s[0], s[2]);
    const sMinY = Math.min(s[1], s[3]), sMaxY = Math.max(s[1], s[3]);
    if (sMaxX < minX || sMinX > maxX || sMaxY < minY || sMinY > maxY) continue;
    segs.push(s);
  }
  // Box edges
  segs.push([minX, minY, maxX, minY], [maxX, minY, maxX, maxY], [maxX, maxY, minX, maxY], [minX, maxY, minX, minY]);

  // Unique angles toward every endpoint (± epsilon to see past corners).
  const angles: number[] = [];
  const eps = 0.00015;
  for (const s of segs) {
    for (let k = 0; k < 4; k += 2) {
      const ex = s[k]!, ey = s[k + 1]!;
      if (ex < minX - 1 || ex > maxX + 1 || ey < minY - 1 || ey > maxY + 1) {
        continue;
      }
      const a = Math.atan2(ey - oy, ex - ox);
      angles.push(a - eps, a, a + eps);
    }
  }
  // Also cast toward intersections of segments with the box edges, so clipped walls produce correct shapes.
  for (const s of segs) {
    for (const [bx1, by1, bx2, by2] of [
      [minX, minY, maxX, minY], [maxX, minY, maxX, maxY], [maxX, maxY, minX, maxY], [minX, maxY, minX, minY],
    ] as const) {
      const t = segmentIntersectT(s[0], s[1], s[2], s[3], bx1, by1, bx2, by2);
      if (t !== null) {
        const ix = s[0] + (s[2] - s[0]) * t, iy = s[1] + (s[3] - s[1]) * t;
        const a = Math.atan2(iy - oy, ix - ox);
        angles.push(a - eps, a, a + eps);
      }
    }
  }
  angles.sort((a, b) => a - b);

  const far = (maxX - minX + maxY - minY) * 2;
  const out: number[] = [];
  let lastA = Number.NaN;
  for (const a of angles) {
    if (a === lastA) continue;
    lastA = a;
    const dx = Math.cos(a), dy = Math.sin(a);
    const ex = ox + dx * far, ey = oy + dy * far;
    let best = Infinity;
    for (const s of segs) {
      const t = segmentIntersectT(ox, oy, ex, ey, s[0], s[1], s[2], s[3]);
      if (t !== null && t < best) best = t;
    }
    if (best === Infinity) continue;
    out.push(ox + (ex - ox) * best, oy + (ey - oy) * best);
  }
  return out;
}

export function sightSegments(walls: Iterable<Wall>): Segment[] {
  const out: Segment[] = [];
  for (const w of walls) if (wallBlocksSight(w)) out.push(w.c);
  return out;
}

export function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i]!, yi = poly[i + 1]!, xj = poly[j]!, yj = poly[j + 1]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---------------------------------------------------------------------------
// Grid math
// ---------------------------------------------------------------------------

const SQRT3 = Math.sqrt(3);

export interface Cell {
  col: number;
  row: number;
}

/** Hex size (center → corner) for a grid whose `size` is the cell width (pointy) / height (flat). */
function hexRadius(g: GridConfig): number {
  return g.size / SQRT3;
}

export function cellAt(g: GridConfig, x: number, y: number): Cell {
  const lx = x - g.offsetX, ly = y - g.offsetY;
  if (g.type === 'hex-pointy' || g.type === 'hex-flat') {
    const r = hexRadius(g);
    let q: number, rr: number;
    if (g.type === 'hex-pointy') {
      q = ((SQRT3 / 3) * lx - (1 / 3) * ly) / r;
      rr = ((2 / 3) * ly) / r;
    } else {
      q = ((2 / 3) * lx) / r;
      rr = ((-1 / 3) * lx + (SQRT3 / 3) * ly) / r;
    }
    const [cq, cr] = axialRound(q, rr);
    return { col: cq, row: cr };
  }
  return { col: Math.floor(lx / g.size), row: Math.floor(ly / g.size) };
}

function axialRound(q: number, r: number): [number, number] {
  const s = -q - r;
  let rq = Math.round(q), rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return [rq || 0, rr || 0]; // normalize -0
}

/** Center of a cell in world px. For hex grids col/row are axial (q, r). */
export function cellCenter(g: GridConfig, c: Cell): Point {
  if (g.type === 'hex-pointy') {
    const r = hexRadius(g);
    return { x: g.offsetX + r * (SQRT3 * c.col + (SQRT3 / 2) * c.row), y: g.offsetY + r * (1.5 * c.row) };
  }
  if (g.type === 'hex-flat') {
    const r = hexRadius(g);
    return { x: g.offsetX + r * (1.5 * c.col), y: g.offsetY + r * ((SQRT3 / 2) * c.col + SQRT3 * c.row) };
  }
  return { x: g.offsetX + (c.col + 0.5) * g.size, y: g.offsetY + (c.row + 0.5) * g.size };
}

/** Hexagon corner points (flat array) for drawing. */
export function hexCorners(g: GridConfig, center: Point): number[] {
  const r = hexRadius(g);
  const out: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = ((g.type === 'hex-pointy' ? 60 * i - 30 : 60 * i) * Math.PI) / 180;
    out.push(center.x + r * Math.cos(angle), center.y + r * Math.sin(angle));
  }
  return out;
}

/** Token footprint in px. */
export function tokenPixelSize(t: Pick<Token, 'size'>, g: GridConfig): number {
  return Math.max(0.25, t.size) * g.size;
}

export function tokenCenter(t: Pick<Token, 'x' | 'y' | 'size'>, g: GridConfig): Point {
  const s = tokenPixelSize(t, g);
  return { x: t.x + s / 2, y: t.y + s / 2 };
}

/** Snap a token's top-left so that it aligns with the grid. Input is the desired top-left. */
export function snapTokenPosition(g: GridConfig, t: Pick<Token, 'size'>, x: number, y: number): Point {
  if (!g.snap || g.type === 'none') return { x: Math.round(x), y: Math.round(y) };
  const s = tokenPixelSize(t, g);
  if (g.type === 'square') {
    const step = t.size < 1 ? g.size / 2 : g.size;
    return {
      x: Math.round((x - g.offsetX) / step) * step + g.offsetX,
      y: Math.round((y - g.offsetY) / step) * step + g.offsetY,
    };
  }
  // hex: snap the token center to the nearest hex center
  const c = cellCenter(g, cellAt(g, x + s / 2, y + s / 2));
  return { x: c.x - s / 2, y: c.y - s / 2 };
}

export function snapPoint(g: GridConfig, x: number, y: number, mode: 'center' | 'corner' | 'both' = 'center'): Point {
  if (g.type === 'none') return { x, y };
  if (g.type === 'square') {
    const s = g.size;
    const lx = x - g.offsetX, ly = y - g.offsetY;
    if (mode === 'corner') return { x: Math.round(lx / s) * s + g.offsetX, y: Math.round(ly / s) * s + g.offsetY };
    if (mode === 'both') {
      const h = s / 2;
      return { x: Math.round(lx / h) * h + g.offsetX, y: Math.round(ly / h) * h + g.offsetY };
    }
    return { x: (Math.floor(lx / s) + 0.5) * s + g.offsetX, y: (Math.floor(ly / s) + 0.5) * s + g.offsetY };
  }
  return cellCenter(g, cellAt(g, x, y));
}

function hexDistance(a: Cell, b: Cell): number {
  const dq = a.col - b.col, dr = a.row - b.row;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Distance in feet between two world points following the grid's diagonal rule. */
export function measureFeet(g: GridConfig, a: Point, b: Point): number {
  if (g.type === 'none' || g.diagonals === 'euclidean') {
    return (Math.hypot(b.x - a.x, b.y - a.y) / g.size) * g.units;
  }
  if (g.type === 'hex-pointy' || g.type === 'hex-flat') {
    return hexDistance(cellAt(g, a.x, a.y), cellAt(g, b.x, b.y)) * g.units;
  }
  const ca = cellAt(g, a.x, a.y), cb = cellAt(g, b.x, b.y);
  const dx = Math.abs(cb.col - ca.col), dy = Math.abs(cb.row - ca.row);
  const diag = Math.min(dx, dy), straight = Math.max(dx, dy) - diag;
  if (g.diagonals === '5-10-5') {
    return (straight + diag + Math.floor(diag / 2)) * g.units;
  }
  return (straight + diag) * g.units;
}

/** Multi-waypoint path distance. 5-10-5 parity continues across waypoints. */
export function measurePathFeet(g: GridConfig, points: Point[]): number {
  if (points.length < 2) return 0;
  if (g.type === 'square' && g.diagonals === '5-10-5') {
    let total = 0;
    let diagCount = 0;
    for (let i = 1; i < points.length; i++) {
      const ca = cellAt(g, points[i - 1]!.x, points[i - 1]!.y), cb = cellAt(g, points[i]!.x, points[i]!.y);
      const dx = Math.abs(cb.col - ca.col), dy = Math.abs(cb.row - ca.row);
      const diag = Math.min(dx, dy), straight = Math.max(dx, dy) - diag;
      for (let d = 0; d < diag; d++) {
        diagCount++;
        total += diagCount % 2 === 0 ? 2 : 1;
      }
      total += straight;
    }
    return total * g.units;
  }
  let total = 0;
  for (let i = 1; i < points.length; i++) total += measureFeet(g, points[i - 1]!, points[i]!);
  return total;
}

export function feetToPx(g: GridConfig, feet: number): number {
  return (feet / g.units) * g.size;
}

// ---------------------------------------------------------------------------
// Area templates
// ---------------------------------------------------------------------------

/** 5e cone: width at the end equals its length → total angle ≈ 53.13°. */
export const CONE_ANGLE = 2 * Math.atan(0.5);

/** Template outline as a flat polygon (circle/ring approximated). */
export function templatePolygon(t: Template, g: GridConfig, segments = 48): number[] {
  const size = feetToPx(g, t.size);
  const a = (t.angle * Math.PI) / 180;
  const out: number[] = [];
  switch (t.kind) {
    case 'circle':
    case 'ring':
      for (let i = 0; i < segments; i++) {
        const th = (i / segments) * Math.PI * 2;
        out.push(t.x + Math.cos(th) * size, t.y + Math.sin(th) * size);
      }
      return out;
    case 'square': {
      const h = size / 2;
      return [t.x - h, t.y - h, t.x + h, t.y - h, t.x + h, t.y + h, t.x - h, t.y + h];
    }
    case 'cone': {
      out.push(t.x, t.y);
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const th = a - CONE_ANGLE / 2 + (CONE_ANGLE * i) / steps;
        out.push(t.x + Math.cos(th) * size, t.y + Math.sin(th) * size);
      }
      return out;
    }
    case 'line': {
      const w = feetToPx(g, t.width || 5) / 2;
      const dx = Math.cos(a), dy = Math.sin(a);
      const nx = -dy * w, ny = dx * w;
      const ex = t.x + dx * size, ey = t.y + dy * size;
      return [t.x + nx, t.y + ny, ex + nx, ey + ny, ex - nx, ey - ny, t.x - nx, t.y - ny];
    }
  }
}

export function pointInTemplate(t: Template, g: GridConfig, x: number, y: number): boolean {
  const size = feetToPx(g, t.size);
  if (t.kind === 'circle') return Math.hypot(x - t.x, y - t.y) <= size + 0.5;
  if (t.kind === 'ring') {
    const d = Math.hypot(x - t.x, y - t.y);
    return d <= size + 0.5 && d >= size - g.size;
  }
  return pointInPolygon(x, y, templatePolygon(t, g));
}

/** Tokens touched by a template: any covered cell center of the token inside the template. */
export function tokensInTemplate(t: Template, g: GridConfig, tokens: Iterable<Token>): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    const s = tokenPixelSize(tok, g);
    const n = Math.max(1, Math.round(tok.size));
    const step = s / n;
    let hit = false;
    for (let i = 0; i < n && !hit; i++) {
      for (let j = 0; j < n && !hit; j++) {
        if (pointInTemplate(t, g, tok.x + step * (i + 0.5), tok.y + step * (j + 0.5))) hit = true;
      }
    }
    if (hit) out.push(tok);
  }
  return out;
}

/** Grid cells (centers) covered by a template, for highlighting. */
export function cellsInTemplate(t: Template, g: GridConfig): Point[] {
  if (g.type === 'none') return [];
  const poly = templatePolygon(t, g, 32);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    minX = Math.min(minX, poly[i]!); maxX = Math.max(maxX, poly[i]!);
    minY = Math.min(minY, poly[i + 1]!); maxY = Math.max(maxY, poly[i + 1]!);
  }
  const out: Point[] = [];
  const seen = new Set<string>();
  const step = g.size / 2;
  for (let x = minX - g.size; x <= maxX + g.size; x += step) {
    for (let y = minY - g.size; y <= maxY + g.size; y += step) {
      const c = cellAt(g, x, y);
      const key = `${c.col},${c.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const center = cellCenter(g, c);
      if (pointInTemplate(t, g, center.x, center.y)) out.push(center);
      if (out.length > 4000) return out;
    }
  }
  return out;
}

/** Simplify a polyline (Ramer–Douglas–Peucker) — used for freehand drawings and fog brushes. */
export function simplifyPath(points: number[], tolerance: number): number[] {
  if (points.length <= 4) return points;
  const n = points.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const ax = points[s * 2]!, ay = points[s * 2 + 1]!, bx = points[e * 2]!, by = points[e * 2 + 1]!;
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const px = points[i * 2]!, py = points[i * 2 + 1]!;
      const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[i * 2]!, points[i * 2 + 1]!);
  return out;
}
