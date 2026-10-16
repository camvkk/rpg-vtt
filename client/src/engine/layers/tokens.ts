import { Assets, ColorMatrixFilter, Container, Graphics, Sprite, Text, TextStyle, type Texture } from 'pixi.js';
import { hpStatus } from '@shared/rules5e.ts';
import type { HitPoints, ID, Token } from '@shared/types.ts';
import { assetUrl } from '../../net/api.ts';
import { conditionMeta } from '../../ui/conditionIcons.tsx';
import type { Engine, EngineCtx, Layer } from '../Engine.ts';
import { creatureSvg } from '../creatureIcons.tsx';
import { conditionTexture, glowDot, svgTexture } from '../textures.ts';

const DISP: Record<string, number> = { friendly: 0x3fbf8f, neutral: 0xe0b45a, hostile: 0xe2554d, secret: 0x9b7bff };

const nameStyle = new TextStyle({
  fontFamily: 'Inter, sans-serif',
  fontSize: 13,
  fontWeight: '600',
  fill: '#f3ecdf',
  stroke: { color: '#000000', width: 3, join: 'round' },
  align: 'center',
});

const badgeStyle = new TextStyle({
  fontFamily: 'Inter, sans-serif',
  fontSize: 16,
  fontWeight: '800',
  fill: '#f6dc9a',
});

const initialsStyle = new TextStyle({
  fontFamily: 'Cinzel, serif',
  fontSize: 26,
  fontWeight: '700',
  fill: '#f6e7c4',
  stroke: { color: '#000000', width: 2 },
});

function hexColor(c: string): number {
  const v = c.replace('#', '');
  const full = v.length === 3 ? v.split('').map((x) => x + x).join('') : v.slice(0, 6);
  const n = parseInt(full, 16);
  return Number.isFinite(n) ? n : 0x8b5cf6;
}

function darker(c: number, k = 0.45): number {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export interface TokenRender {
  token: Token;
  hp: HitPoints | null;
  hpMasked: boolean;
  conditions: string[];
  showHp: boolean;
  showName: boolean;
  selected: boolean;
  hovered: boolean;
  targeted: boolean;
  turn: boolean;
  controlled: boolean;
  ringColor: number;
  gridSize: number;
  isDM: boolean;
}

class TokenView {
  root = new Container();
  glow = new Sprite(glowDot());
  turnRing = new Graphics();
  body = new Container();
  disc = new Graphics();
  initials: Text | null = null;
  glyph: Sprite | null = null;
  numBadge = new Container();
  img: Sprite | null = null;
  imgMask = new Graphics();
  ring = new Graphics();
  overlay = new Graphics();
  hpBar = new Graphics();
  label: Text;
  conds = new Container();
  targetMark = new Graphics();
  data: TokenRender | null = null;
  imgUrl: string | null = null;
  /** Displayed center (may lag behind during tweens). */
  cx = 0;
  cy = 0;
  private tween: { fx: number; fy: number; tx: number; ty: number; t0: number; dur: number } | null = null;
  dragging = false;
  labelBase = 1;
  private grey: ColorMatrixFilter | null = null;
  private layer: TokenLayer;

  constructor(layer: TokenLayer) {
    this.layer = layer;
    this.glow.anchor.set(0.5);
    this.glow.visible = false;
    this.label = new Text({ text: '', style: nameStyle, resolution: 2 });
    this.label.anchor.set(0.5, 0);
    this.body.addChild(this.disc, this.imgMask);
    this.root.addChild(this.glow, this.turnRing, this.body, this.ring, this.overlay, this.targetMark, this.conds, this.numBadge, this.hpBar, this.label);
  }

  setTarget(x: number, y: number, animate: boolean): void {
    if (!animate || this.dragging) {
      this.tween = null;
      this.cx = x;
      this.cy = y;
      this.root.position.set(x, y);
      return;
    }
    if (Math.abs(x - this.cx) < 0.5 && Math.abs(y - this.cy) < 0.5) return;
    const dist = Math.hypot(x - this.cx, y - this.cy);
    this.tween = { fx: this.cx, fy: this.cy, tx: x, ty: y, t0: performance.now(), dur: Math.min(450, 160 + dist * 0.35) };
  }

  tick(now: number): boolean {
    let anim = false;
    if (this.tween) {
      const k = Math.min(1, (now - this.tween.t0) / this.tween.dur);
      const e = easeOut(k);
      this.cx = this.tween.fx + (this.tween.tx - this.tween.fx) * e;
      this.cy = this.tween.fy + (this.tween.ty - this.tween.fy) * e;
      this.root.position.set(this.cx, this.cy);
      if (k >= 1) this.tween = null;
      anim = true;
    }
    if (this.data?.turn) {
      this.turnRing.rotation = (now / 2400) % (Math.PI * 2);
      this.glow.alpha = 0.35 + Math.sin(now / 380) * 0.12;
      anim = true;
    }
    if (this.data?.targeted) {
      this.targetMark.rotation = -(now / 3000) % (Math.PI * 2);
      anim = true;
    }
    return anim;
  }

  render(r: TokenRender): void {
    const prev = this.data;
    this.data = r;
    const t = r.token;
    const size = Math.max(0.25, t.size) * r.gridSize;
    const rad = (size / 2) * 0.92;
    const stroke = Math.max(2, size * 0.045);

    // Body: image or colored disc + initials
    const url = assetUrl(t.img);
    if (url !== this.imgUrl) {
      this.imgUrl = url;
      if (this.img) {
        this.img.destroy();
        this.img = null;
      }
      if (url) void this.loadImage(url);
    }
    this.disc.clear();
    const base = hexColor(t.color);
    this.disc.circle(0, 0, rad).fill({ color: darker(base, 0.35) });
    this.disc.circle(0, -rad * 0.15, rad * 0.85).fill({ color: base, alpha: 0.35 });
    // Monsters without art get a creature-type glyph; others show initials.
    const glyphSvg = !this.img ? creatureSvg(t.monsterId) : null;
    const glyphTex = glyphSvg ? svgTexture(`creature:${t.monsterId}`, glyphSvg, 128, () => {
      this.data = null;
      if (this.layer.engine.ctx) this.layer.update(this.layer.engine.ctx);
    }) : null;
    if (glyphTex) {
      if (!this.glyph) {
        this.glyph = new Sprite(glyphTex);
        this.glyph.anchor.set(0.5);
        this.body.addChild(this.glyph);
      }
      this.glyph.texture = glyphTex;
      this.glyph.width = this.glyph.height = rad * 1.15;
      this.glyph.tint = 0xf3e6cc;
      this.glyph.alpha = 0.92;
      this.glyph.visible = true;
    } else if (this.glyph) this.glyph.visible = false;
    if (!this.img && !glyphTex) {
      const initials = t.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
      if (!this.initials) {
        this.initials = new Text({ text: initials, style: initialsStyle, resolution: 2 });
        this.initials.anchor.set(0.5);
        this.body.addChild(this.initials);
      }
      this.initials.text = initials;
      this.initials.scale.set((rad * 0.9) / 26);
      this.initials.visible = true;
    } else if (this.initials) this.initials.visible = false;
    if (this.img) this.fitImage(rad);

    // Number badge for numbered monsters ("Goblin 3")
    this.numBadge.removeChildren().forEach((c) => c.destroy());
    const num = /\s(\d{1,3})$/.exec(t.name)?.[1];
    if (num && t.monsterId) {
      const br = Math.max(7, rad * 0.32);
      const g = new Graphics().circle(0, 0, br).fill({ color: 0x0b0a0f }).stroke({ color: r.ringColor, width: Math.max(1.5, br * 0.18) });
      const txt = new Text({ text: num, style: badgeStyle, resolution: 2 });
      txt.anchor.set(0.5);
      txt.scale.set((br * 1.25) / 16);
      this.numBadge.addChild(g, txt);
      this.numBadge.position.set(rad * 0.72, rad * 0.72);
    }

    // Ring
    this.ring.clear();
    this.ring.circle(0, 0, rad).stroke({ color: 0x000000, width: stroke + 2, alpha: 0.6 });
    this.ring.circle(0, 0, rad).stroke({ color: r.ringColor, width: stroke });
    if (r.selected) this.ring.circle(0, 0, rad + stroke * 1.6).stroke({ color: 0xf6dc9a, width: stroke * 0.8, alpha: 0.95 });
    else if (r.hovered) this.ring.circle(0, 0, rad + stroke * 1.2).stroke({ color: 0xffffff, width: stroke * 0.5, alpha: 0.45 });
    if (t.hidden) this.ring.circle(0, 0, rad + stroke * 2.6).stroke({ color: 0x9b7bff, width: stroke * 0.6, alpha: 0.8 });

    // Turn halo
    this.turnRing.clear();
    this.glow.visible = r.turn || r.selected;
    this.glow.tint = r.turn ? 0xe0b45a : 0xf6dc9a;
    this.glow.width = this.glow.height = size * (r.turn ? 2.2 : 1.7);
    this.glow.alpha = r.turn ? 0.4 : 0.18;
    if (r.turn) {
      const R = rad + stroke * 3.2;
      for (let i = 0; i < 12; i++) {
        const a0 = (i / 12) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / 24;
        this.turnRing.moveTo(Math.cos(a0) * R, Math.sin(a0) * R).arc(0, 0, R, a0, a1).stroke({ color: 0xf6dc9a, width: stroke * 0.9, alpha: 0.95 });
      }
    }

    // Target crosshair
    this.targetMark.clear();
    if (r.targeted) {
      const R = rad + stroke * 2.4;
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2 + Math.PI / 4;
        this.targetMark.moveTo(Math.cos(a - 0.35) * R, Math.sin(a - 0.35) * R).arc(0, 0, R, a - 0.35, a + 0.35).stroke({ color: 0xff5a4f, width: stroke * 1.1 });
        this.targetMark.moveTo(Math.cos(a) * (R + stroke * 2.2), Math.sin(a) * (R + stroke * 2.2)).lineTo(Math.cos(a) * (R - stroke), Math.sin(a) * (R - stroke)).stroke({ color: 0xff5a4f, width: stroke });
      }
    }

    // Dead / unconscious overlays
    this.overlay.clear();
    const dead = r.conditions.includes('dead');
    const down = !dead && r.conditions.includes('unconscious');
    if (dead || down) {
      if (!this.grey) this.grey = new ColorMatrixFilter();
      this.grey.reset();
      this.grey.desaturate();
      this.body.filters = [this.grey];
      this.body.alpha = dead ? 0.7 : 0.85;
      if (dead) {
        const k = rad * 0.55;
        this.overlay.moveTo(-k, -k).lineTo(k, k).moveTo(k, -k).lineTo(-k, k).stroke({ color: 0xb91c1c, width: stroke * 1.8, alpha: 0.9, cap: 'round' });
      }
    } else {
      this.body.filters = [];
      this.body.alpha = 1;
    }
    this.root.alpha = t.hidden ? 0.5 : 1;
    this.root.rotation = 0;
    this.body.rotation = (t.rotation * Math.PI) / 180;

    // HP bar
    this.hpBar.clear();
    let labelY = rad + stroke + 4;
    if (r.showHp && r.hp && r.hp.max > 0) {
      const w = size * 0.86, h = Math.max(5, size * 0.085);
      const y = rad + stroke + 2;
      const pct = Math.max(0, Math.min(1, r.hp.cur / r.hp.max));
      const color = r.hpMasked ? hexColor(hpStatus(r.hp.cur, r.hp.max).color) : pct > 0.5 ? 0x3fbf8f : pct > 0.25 ? 0xf0a43a : 0xe2554d;
      this.hpBar.roundRect(-w / 2 - 1.5, y - 1.5, w + 3, h + 3, (h + 3) / 2).fill({ color: 0x000000, alpha: 0.75 });
      if (pct > 0) this.hpBar.roundRect(-w / 2, y, w * pct, h, h / 2).fill({ color });
      if (r.hp.temp > 0 && !r.hpMasked) {
        const tp = Math.min(1, r.hp.temp / r.hp.max);
        this.hpBar.roundRect(w / 2 - w * tp, y, w * tp, h, h / 2).fill({ color: 0x5fa8f5, alpha: 0.9 });
      }
      labelY = y + h + 3;
    }

    // Name
    this.label.visible = r.showName && !!t.name;
    if (this.label.visible) {
      this.label.text = t.elevation ? `${t.name}  ▲${t.elevation}` : t.name;
      this.labelBase = Math.max(0.6, Math.min(1.4, size / 80));
      this.applyZoom(this.layer.engine.camera.scale);
      this.label.position.set(0, labelY);
    }

    // Conditions
    const condKey = r.conditions.join(',');
    if (!prev || condKey !== prev.conditions.join(',') || size !== prev.gridSize * Math.max(0.25, prev.token.size)) {
      this.conds.removeChildren().forEach((c) => c.destroy());
      const list = r.conditions.filter((c) => c !== 'dead').slice(0, 8);
      const badge = Math.max(12, size * 0.26);
      list.forEach((id, i) => {
        const angle = -Math.PI / 2 + 0.55 + i * 0.5;
        const R = rad + badge * 0.15;
        const g = new Graphics();
        const meta = conditionMeta(id);
        g.circle(0, 0, badge / 2).fill({ color: 0x0b0a0f, alpha: 0.92 }).stroke({ color: hexColor(meta.color), width: Math.max(1.5, badge * 0.08) });
        g.position.set(Math.cos(angle) * R, Math.sin(angle) * R);
        this.conds.addChild(g);
        const tex = conditionTexture(id, () => {
          this.data = null;
          this.layer.engine.ctx && this.layer.update(this.layer.engine.ctx);
        });
        if (tex) {
          const s = new Sprite(tex);
          s.anchor.set(0.5);
          s.width = s.height = badge * 0.62;
          s.tint = hexColor(meta.color);
          s.position.copyFrom(g.position);
          this.conds.addChild(s);
        }
      });
    }
  }

  /** Keep names readable (≥ ~11px on screen) when zoomed out. */
  applyZoom(zoom: number): void {
    const min = 11 / (13 * Math.max(0.05, zoom));
    this.label.scale.set(Math.min(Math.max(this.labelBase, min), this.labelBase * 4));
  }

  private async loadImage(url: string): Promise<void> {
    try {
      const tex = (await Assets.load<Texture>({ src: url, parser: 'texture' })) as Texture;
      if (url !== this.imgUrl || this.root.destroyed) return;
      const img = new Sprite(tex);
      img.anchor.set(0.5);
      img.mask = this.imgMask;
      this.img = img;
      this.body.addChildAt(img, 1);
      if (this.data) this.render(this.data);
      this.layer.engine.requestRender();
    } catch {
      // keep initials fallback
    }
  }

  private fitImage(rad: number): void {
    if (!this.img) return;
    const tex = this.img.texture;
    const d = rad * 2;
    const s = Math.max(d / tex.width, d / tex.height);
    this.img.scale.set(s);
    this.imgMask.clear();
    this.imgMask.circle(0, 0, rad).fill({ color: 0xffffff });
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

export class TokenLayer implements Layer {
  container = new Container();
  engine: Engine;
  views = new Map<ID, TokenView>();
  private rootIds = new WeakMap<Container, ID>();
  private prevTokens: Record<ID, Token> | null = null;
  private order: ID[] = [];

  constructor(engine: Engine) {
    this.engine = engine;
    this.container.sortableChildren = false;
  }

  update(ctx: EngineCtx): void {
    const scene = ctx.scene;
    const tokens = scene.tokens;
    const g = scene.grid;
    const firstSync = this.prevTokens === null;
    let orderDirty = tokens !== this.prevTokens;
    // remove
    for (const [id, v] of this.views) {
      if (!tokens[id]) {
        v.destroy();
        this.views.delete(id);
        orderDirty = true;
      }
    }
    for (const t of Object.values(tokens)) {
      let v = this.views.get(t.id);
      const isNew = !v;
      if (!v) {
        v = new TokenView(this);
        this.views.set(t.id, v);
        this.rootIds.set(v.root, t.id);
        this.container.addChild(v.root);
      }
      const r = this.renderInfo(t, ctx);
      if (!v.data || !sameRender(v.data, r)) v.render(r);
      const s = Math.max(0.25, t.size) * g.size;
      v.setTarget(t.x + s / 2, t.y + s / 2, !isNew && !firstSync);
    }
    this.prevTokens = tokens;
    if (orderDirty) this.sort(ctx);
  }

  private renderInfo(t: Token, ctx: EngineCtx): TokenRender {
    const ch = t.characterId ? ctx.campaign.characters[t.characterId] : undefined;
    const controlled = ctx.controlled.has(t.id);
    const hovered = ctx.hover === t.id;
    const selected = ctx.selection.has(t.id);
    const vis = (v: Token['showName']) => v === 'always' || ctx.isDM || (v === 'owner' && controlled) || (v === 'hover' && (hovered || selected || controlled));
    const owner = ch?.ownerId ? ctx.campaign.players[ch.ownerId] : t.ownerIds[0] ? ctx.campaign.players[t.ownerIds[0]] : undefined;
    return {
      token: t,
      hp: ch ? ch.hp : t.hp,
      hpMasked: !!t.hpMasked,
      conditions: ch ? ch.conditions : t.conditions,
      showHp: vis(t.showHp) || !!t.hpMasked,
      showName: vis(t.showName),
      selected,
      hovered,
      targeted: ctx.targets.has(t.id),
      turn: ctx.turnTokenId === t.id,
      controlled,
      ringColor: owner && owner.role !== 'dm' ? hexColor(owner.color) : DISP[t.disposition] ?? 0xe0b45a,
      gridSize: ctx.scene.grid.size,
      isDM: ctx.isDM,
    };
  }

  private sort(ctx: EngineCtx): void {
    const tokens = ctx.scene.tokens;
    this.order = Object.keys(tokens).sort((a, b) => {
      const ta = tokens[a]!, tb = tokens[b]!;
      if (ta.elevation !== tb.elevation) return ta.elevation - tb.elevation;
      if (ta.size !== tb.size) return tb.size - ta.size;
      return a < b ? -1 : 1;
    });
    this.order.forEach((id, i) => {
      const v = this.views.get(id);
      if (v) this.container.setChildIndex(v.root, Math.min(i, this.container.children.length - 1));
    });
  }

  /** Bring a token to front temporarily (while dragging). */
  raise(id: ID): void {
    const v = this.views.get(id);
    if (v) this.container.setChildIndex(v.root, this.container.children.length - 1);
  }

  private lastZoom = 1;

  tick(_dt: number, now: number): boolean {
    let anim = false;
    const zoom = this.engine.camera.scale;
    if (Math.abs(zoom - this.lastZoom) / this.lastZoom > 0.03) {
      this.lastZoom = zoom;
      for (const v of this.views.values()) v.applyZoom(zoom);
    }
    for (const v of this.views.values()) if (v.tick(now)) anim = true;
    return anim;
  }

  /** Topmost token under a world point. */
  tokenAt(x: number, y: number, filter?: (t: Token) => boolean): Token | null {
    const ctx = this.engine.ctx;
    if (!ctx) return null;
    const g = ctx.scene.grid;
    for (let i = this.container.children.length - 1; i >= 0; i--) {
      const id = this.rootIds.get(this.container.children[i]!);
      const v = id ? this.views.get(id) : undefined;
      const t = id ? ctx.scene.tokens[id] : undefined;
      if (!v || !t) continue;
      if (filter && !filter(t)) continue;
      const r = (Math.max(0.25, t.size) * g.size) / 2;
      if (Math.hypot(x - v.cx, y - v.cy) <= r) return t;
    }
    return null;
  }

  tokensInRect(x0: number, y0: number, x1: number, y1: number): Token[] {
    const ctx = this.engine.ctx;
    if (!ctx) return [];
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1), minY = Math.min(y0, y1), maxY = Math.max(y0, y1);
    const out: Token[] = [];
    for (const [id, v] of this.views) {
      const t = ctx.scene.tokens[id];
      if (t && v.cx >= minX && v.cx <= maxX && v.cy >= minY && v.cy <= maxY) out.push(t);
    }
    return out;
  }

  /** Move token views directly while dragging (no state change). */
  dragTo(id: ID, cx: number, cy: number): void {
    const v = this.views.get(id);
    if (!v) return;
    v.dragging = true;
    v.setTarget(cx, cy, false);
    this.engine.requestRender();
  }

  endDrag(id: ID): void {
    const v = this.views.get(id);
    if (v) v.dragging = false;
  }

  /** Snap a dragged token back to its state position (move rejected). */
  restore(id: ID): void {
    const ctx = this.engine.ctx;
    const v = this.views.get(id);
    const t = ctx?.scene.tokens[id];
    if (!v || !t || !ctx) return;
    v.dragging = false;
    const s = Math.max(0.25, t.size) * ctx.scene.grid.size;
    v.setTarget(t.x + s / 2, t.y + s / 2, true);
    this.engine.requestRender();
  }

  centerOf(id: ID): { x: number; y: number } | null {
    const v = this.views.get(id);
    return v ? { x: v.cx, y: v.cy } : null;
  }

  reset(): void {
    for (const v of this.views.values()) v.destroy();
    this.views.clear();
    this.prevTokens = null;
  }

  destroy(): void {
    this.reset();
    this.container.destroy({ children: true });
  }
}

function sameRender(a: TokenRender, b: TokenRender): boolean {
  return a.token === b.token && a.hp === b.hp && a.hpMasked === b.hpMasked && a.conditions === b.conditions
    && a.showHp === b.showHp && a.showName === b.showName && a.selected === b.selected && a.hovered === b.hovered
    && a.targeted === b.targeted && a.turn === b.turn && a.controlled === b.controlled && a.ringColor === b.ringColor
    && a.gridSize === b.gridSize && a.isDM === b.isDM;
}
