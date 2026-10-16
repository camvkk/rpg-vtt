// Dynamic lighting + fog of war.
// darkRT: black minus light polygons (erase blend with radial falloff), shown with alpha = scene darkness.
// colorLayer: additive tinted glows of lights.
// fogRT (players / DM preview): black minus (explored * k) minus (visible = ∪ token LOS ∩ (lit ∪ darkvision)) ± manual areas.
import { BlurFilter, Container, Graphics, Matrix, RenderTexture, Sprite, Texture } from 'pixi.js';
import { feetToPx, pointInPolygon, sightSegments, visibilityPolygon, type Segment } from '@shared/geometry.ts';
import type { FogArea, ID, LightAnimation, Scene, Shape, Token, Wall } from '@shared/types.ts';
import type { Engine, EngineCtx, Layer } from '../Engine.ts';
import { lightGradient, softCircle } from '../textures.ts';

interface Emitter {
  id: string;
  x: number;
  y: number;
  bright: number;
  dim: number;
  color: number;
  intensity: number;
  animation: LightAnimation;
  poly: number[];
}

interface Viewer {
  id: ID;
  x: number;
  y: number;
  los: number[];
  darkvision: number;
  range: number;
}

function hex(c: string): number {
  const v = c.replace('#', '');
  const n = parseInt(v.length === 3 ? v.split('').map((x) => x + x).join('') : v.slice(0, 6), 16);
  return Number.isFinite(n) ? n : 0xffffff;
}

const MAX_RT = 2048;

export class LightingLayer implements Layer {
  container = new Container();
  private colorLayer = new Container();
  private colorG = new Graphics();
  private darkSprite = new Sprite(Texture.EMPTY);
  private fogSprite = new Sprite(Texture.EMPTY);
  private darkRT: RenderTexture | null = null;
  private fogRT: RenderTexture | null = null;
  private visRT: RenderTexture | null = null;
  private tmpRT: RenderTexture | null = null;
  private exploredRT: RenderTexture | null = null;
  private f = 1;
  private w = 0;
  private h = 0;
  private sceneId: ID | null = null;
  private engine: Engine;

  private prevWalls: Record<ID, Wall> | null = null;
  private segments: Segment[] = [];
  private emitters: Emitter[] = [];
  private viewers: Viewer[] = [];
  private polyCache = new Map<string, number[]>();
  private sigLight = '';
  private sigFog = '';
  private animated = false;
  private lastFlicker = 0;
  private exploredDirty = false;
  private saveTimer = 0;
  private fogBlur = new BlurFilter({ strength: 6, quality: 3 });

  // reusable render containers
  private passRoot = new Container();

  constructor(engine: Engine) {
    this.engine = engine;
    this.colorLayer.addChild(this.colorG);
    this.colorG.blendMode = 'add';
    this.container.addChild(this.colorLayer, this.darkSprite, this.fogSprite);
    this.darkSprite.visible = false;
    this.fogSprite.visible = false;
    this.fogSprite.filters = [this.fogBlur];
  }

  // -------------------------------------------------------------------------

  private ensureTargets(scene: Scene): void {
    const w = Math.max(64, scene.map.width), h = Math.max(64, scene.map.height);
    if (this.darkRT && w === this.w && h === this.h && scene.id === this.sceneId) return;
    this.saveExplored();
    this.w = w;
    this.h = h;
    this.sceneId = scene.id;
    this.f = Math.min(1, MAX_RT / Math.max(w, h));
    const rw = Math.ceil(w * this.f), rh = Math.ceil(h * this.f);
    // Unbind before destroying, so no shader keeps a reference to a dead texture.
    this.darkSprite.texture = Texture.EMPTY;
    this.fogSprite.texture = Texture.EMPTY;
    const old = [this.darkRT, this.fogRT, this.visRT, this.tmpRT, this.exploredRT];
    window.setTimeout(() => {
      for (const rt of old) rt?.destroy(true);
    }, 0);
    this.darkRT = RenderTexture.create({ width: rw, height: rh });
    this.fogRT = RenderTexture.create({ width: rw, height: rh });
    this.visRT = RenderTexture.create({ width: rw, height: rh });
    this.tmpRT = RenderTexture.create({ width: rw, height: rh });
    this.exploredRT = RenderTexture.create({ width: rw, height: rh });
    this.clearRT(this.exploredRT);
    this.darkSprite.texture = this.darkRT;
    this.fogSprite.texture = this.fogRT;
    this.darkSprite.scale.set(1 / this.f);
    this.fogSprite.scale.set(1 / this.f);
    this.sigLight = '';
    this.sigFog = '';
    this.polyCache.clear();
    this.loadExplored();
  }

  private clearRT(rt: RenderTexture): void {
    const c = new Container();
    this.engine.app.renderer.render({ container: c, target: rt, clear: true, clearColor: [0, 0, 0, 0] });
    c.destroy();
  }

  private render(container: Container, target: RenderTexture, clear = true): void {
    container.scale.set(this.f);
    this.engine.app.renderer.render({ container, target, clear, clearColor: [0, 0, 0, 0] });
  }

  // -------------------------------------------------------------------------

  update(ctx: EngineCtx): void {
    const scene = ctx.scene;
    this.ensureTargets(scene);
    const g = scene.grid;
    if (scene.walls !== this.prevWalls) {
      this.prevWalls = scene.walls;
      this.segments = sightSegments(Object.values(scene.walls));
      this.polyCache.clear();
    }
    const bounds = { x: 0, y: 0, w: this.w, h: this.h };

    // Light emitters ------------------------------------------------------------
    const emitters: Emitter[] = [];
    const addEmitter = (id: string, x: number, y: number, l: { bright: number; dim: number; color: string; intensity: number; animation: LightAnimation }) => {
      const dim = feetToPx(g, Math.max(l.dim, l.bright));
      if (dim <= 1) return;
      const key = `${Math.round(x)},${Math.round(y)},${Math.round(dim)}`;
      let poly = this.polyCache.get(key);
      if (!poly) {
        poly = visibilityPolygon({ x, y }, this.segments, dim * 1.06, bounds);
        this.polyCache.set(key, poly);
      }
      emitters.push({ id, x, y, bright: feetToPx(g, l.bright), dim, color: hex(l.color), intensity: l.intensity, animation: l.animation, poly });
    };
    for (const l of Object.values(scene.lights)) if (l.enabled) addEmitter(`l:${l.id}`, l.x, l.y, l);
    for (const t of Object.values(scene.tokens)) {
      if (!t.light) continue;
      const s = Math.max(0.25, t.size) * g.size;
      addEmitter(`t:${t.id}`, t.x + s / 2, t.y + s / 2, t.light);
    }
    this.emitters = emitters;
    this.animated = emitters.some((e) => e.animation !== 'none');

    // Viewers (vision) ----------------------------------------------------------
    const viewerTokens: Token[] = [];
    if (ctx.isDM) {
      if (ctx.visionPreview && scene.tokens[ctx.visionPreview]) viewerTokens.push(scene.tokens[ctx.visionPreview]!);
    } else {
      for (const t of Object.values(scene.tokens)) if (ctx.controlled.has(t.id) && t.vision.enabled) viewerTokens.push(t);
      if (!viewerTokens.length) for (const t of Object.values(scene.tokens)) if (ctx.controlled.has(t.id)) viewerTokens.push(t);
    }
    this.viewers = viewerTokens.map((t) => {
      const s = Math.max(0.25, t.size) * g.size;
      const x = t.x + s / 2, y = t.y + s / 2;
      const range = t.vision.range > 0 ? feetToPx(g, t.vision.range) : Math.max(this.w, this.h) * 1.5;
      const key = `v:${Math.round(x)},${Math.round(y)},${Math.round(range)}`;
      let los = this.polyCache.get(key);
      if (!los) {
        los = visibilityPolygon({ x, y }, this.segments, range, bounds);
        this.polyCache.set(key, los);
      }
      return { id: t.id, x, y, los, darkvision: feetToPx(g, t.vision.darkvision), range: t.vision.range > 0 ? range : 0 };
    });
    if (this.polyCache.size > 600) this.polyCache.clear();

    const darkness = scene.lighting.darkness;
    const preview = ctx.isDM && !!ctx.visionPreview;
    const playerView = !ctx.isDM || preview;

    // Darkness + color glows ------------------------------------------------------
    const sigLight = [
      darkness, this.w, this.h, ctx.isDM, preview,
      emitters.map((e) => `${e.id}:${e.x | 0},${e.y | 0},${e.dim | 0},${e.bright | 0},${e.color},${e.intensity}`).join(';'),
      this.segments.length, scene.walls === this.prevWalls ? 1 : 0,
      playerView ? this.viewers.map((v) => `${v.x | 0},${v.y | 0},${v.darkvision | 0}`).join(';') : '',
    ].join('|');
    if (sigLight !== this.sigLight) {
      this.sigLight = sigLight;
      this.renderDarkness(ctx, 0);
    }

    // Fog -----------------------------------------------------------------------
    const fog = scene.fog;
    const showFog = fog.mode !== 'off' && (playerView || fog.mode === 'manual');
    const sigFog = [
      fog.mode, fog.exploration, fog.areas.length, fog.areas[fog.areas.length - 1]?.id ?? '', ctx.isDM, preview,
      this.viewers.map((v) => `${v.id}:${v.x | 0},${v.y | 0},${v.los.length},${v.darkvision | 0},${v.range | 0}`).join(';'),
      darkness > 0.35 && !scene.lighting.globalLight ? emitters.map((e) => `${e.x | 0},${e.y | 0},${e.dim | 0}`).join(';') : 'lit',
      this.segments.length,
    ].join('|');
    if (sigFog !== this.sigFog) {
      this.sigFog = sigFog;
      if (showFog) this.renderFog(ctx, playerView);
    }
    this.fogSprite.visible = showFog;
    if (showFog) {
      if (playerView) {
        this.fogSprite.alpha = 1;
        this.fogSprite.tint = 0xffffff;
      } else {
        this.fogSprite.alpha = 0.5;
        this.fogSprite.tint = 0x6f5aa8;
      }
    }
  }

  private renderDarkness(ctx: EngineCtx, now: number): void {
    const scene = ctx.scene;
    const darkness = scene.lighting.darkness;
    const preview = ctx.isDM && !!ctx.visionPreview;
    const playerView = !ctx.isDM || preview;
    this.colorG.clear();
    if (darkness <= 0.001) {
      this.darkSprite.visible = false;
    } else {
      const root = this.passRoot;
      root.removeChildren().forEach((c) => c.destroy());
      const base = new Graphics().rect(0, 0, this.w, this.h).fill({ color: 0x000000 });
      const eraser = new Graphics();
      eraser.blendMode = 'erase';
      for (const e of this.emitters) {
        if (e.poly.length < 6) continue;
        const r = e.dim * this.flicker(e, now);
        const m = new Matrix().scale((2 * r) / 256, (2 * r) / 256).translate(e.x - r, e.y - r);
        eraser.poly(e.poly).fill({ texture: lightGradient(e.bright / e.dim), matrix: m, textureSpace: 'global' });
      }
      if (playerView) {
        for (const v of this.viewers) {
          // You can always make out your own surroundings a little; darkvision sees darkness as dim light.
          const r = Math.max(v.darkvision, ctx.scene.grid.size * 0.75);
          const m = new Matrix().scale((2 * r) / 128, (2 * r) / 128).translate(v.x - r, v.y - r);
          eraser.poly(v.los).fill({ texture: softCircle(), matrix: m, textureSpace: 'global', alpha: v.darkvision > 0 ? 0.7 : 0.45 });
        }
      }
      root.addChild(base, eraser);
      this.render(root, this.darkRT!);
      this.darkSprite.visible = true;
      this.darkSprite.alpha = playerView ? Math.min(0.97, darkness) : darkness * 0.55;
    }
    // Additive light color (stronger in the dark)
    const glow = 0.12 + 0.6 * darkness;
    for (const e of this.emitters) {
      if (e.poly.length < 6 || e.intensity <= 0) continue;
      const r = e.dim * this.flicker(e, now);
      const m = new Matrix().scale((2 * r) / 256, (2 * r) / 256).translate(e.x - r, e.y - r);
      this.colorG.poly(e.poly).fill({
        texture: lightGradient(e.bright / Math.max(1, e.dim) * 0.5),
        matrix: m,
        textureSpace: 'global',
        color: e.color,
        alpha: Math.min(0.85, e.intensity * glow * this.flickerAlpha(e, now)),
      });
    }
  }

  private flicker(e: Emitter, now: number): number {
    if (!now) return 1;
    const seed = e.x * 0.013 + e.y * 0.007;
    switch (e.animation) {
      case 'torch': return 1 + 0.035 * Math.sin(now / 90 + seed) + 0.025 * Math.sin(now / 37 + seed * 3);
      case 'flicker': return 1 + 0.02 * Math.sin(now / 60 + seed) + 0.02 * Math.sin(now / 23 + seed);
      case 'pulse': return 1 + 0.06 * Math.sin(now / 600 + seed);
      case 'magic': return 1 + 0.04 * Math.sin(now / 400 + seed);
      default: return 1;
    }
  }

  private flickerAlpha(e: Emitter, now: number): number {
    if (!now) return 1;
    const seed = e.x * 0.011;
    if (e.animation === 'torch') return 0.9 + 0.1 * Math.sin(now / 70 + seed);
    if (e.animation === 'magic') return 0.85 + 0.15 * Math.sin(now / 300 + seed);
    return 1;
  }

  private shapeGraphics(shape: Shape, color = 0xffffff): Graphics {
    const g = new Graphics();
    if (shape.kind === 'rect') g.rect(shape.x, shape.y, shape.w, shape.h);
    else if (shape.kind === 'circle') g.circle(shape.x, shape.y, shape.r);
    else g.poly(shape.points);
    g.fill({ color });
    return g;
  }

  private renderFog(ctx: EngineCtx, playerView: boolean): void {
    const scene = ctx.scene;
    const fog = scene.fog;
    const root = this.passRoot;
    const dynamic = fog.mode === 'dynamic' && playerView;

    if (dynamic) {
      // visible = ∪ (LOS ∩ (lit ∪ darkvision ∪ own space))
      this.clearRT(this.visRT!);
      const lit = scene.lighting.globalLight || scene.lighting.darkness <= 0.35;
      for (const v of this.viewers) {
        root.removeChildren().forEach((c) => c.destroy());
        const light = new Graphics();
        if (lit) light.rect(0, 0, this.w, this.h).fill({ color: 0xffffff });
        else {
          for (const e of this.emitters) if (e.poly.length >= 6) light.poly(e.poly).fill({ color: 0xffffff });
          light.circle(v.x, v.y, Math.max(v.darkvision, scene.grid.size * 0.75)).fill({ color: 0xffffff });
        }
        const outside = new Graphics();
        outside.blendMode = 'erase';
        outside.rect(-10, -10, this.w + 20, this.h + 20).fill({ color: 0xffffff });
        if (v.los.length >= 6) outside.poly(v.los).cut();
        root.addChild(light, outside);
        if (v.range > 0) {
          const range = new Graphics();
          range.blendMode = 'erase';
          range.rect(-10, -10, this.w + 20, this.h + 20).fill({ color: 0xffffff }).circle(v.x, v.y, v.range).cut();
          root.addChild(range);
        }
        this.render(root, this.tmpRT!);
        const spr = new Sprite(this.tmpRT!);
        spr.scale.set(1 / this.f);
        const acc = new Container();
        acc.addChild(spr);
        this.render(acc, this.visRT!, false);
        acc.destroy({ children: true });
      }
      if (fog.exploration && this.viewers.length) {
        const spr = new Sprite(this.visRT!);
        spr.scale.set(1 / this.f);
        const acc = new Container();
        acc.addChild(spr);
        this.render(acc, this.exploredRT!, false);
        acc.destroy({ children: true });
        this.exploredDirty = true;
        this.scheduleSave();
      }
    }

    root.removeChildren().forEach((c) => c.destroy());
    root.addChild(new Graphics().rect(-10, -10, this.w + 20, this.h + 20).fill({ color: 0x07060a }));
    if (dynamic) {
      if (fog.exploration) {
        const ex = new Sprite(this.exploredRT!);
        ex.scale.set(1 / this.f);
        ex.blendMode = 'erase';
        ex.alpha = 0.42;
        root.addChild(ex);
      }
      const vis = new Sprite(this.visRT!);
      vis.scale.set(1 / this.f);
      vis.blendMode = 'erase';
      root.addChild(vis);
    }
    for (const a of fog.areas) {
      const g = this.shapeGraphics(a.shape, a.op === 'reveal' ? 0xffffff : 0x07060a);
      if (a.op === 'reveal') g.blendMode = 'erase';
      root.addChild(g);
    }
    this.render(root, this.fogRT!);
  }

  tick(dt: number, now: number): boolean {
    void dt;
    const ctx = this.engine.ctx;
    if (!ctx || !this.animated) return false;
    if (now - this.lastFlicker < 50) return true;
    this.lastFlicker = now;
    this.renderDarkness(ctx, now);
    return true;
  }

  // -------------------------------------------------------------------------
  // Queries (hit testing for players)
  // -------------------------------------------------------------------------

  /** Can this viewer see the world point? (walls/LOS + manual fog; light ignored for simplicity). */
  isVisible(x: number, y: number): boolean {
    const ctx = this.engine.ctx;
    if (!ctx || ctx.isDM) return true;
    const fog = ctx.scene.fog;
    if (fog.mode === 'off') return true;
    let visible = false;
    if (fog.mode === 'dynamic') {
      for (const v of this.viewers) {
        if (v.range > 0 && Math.hypot(x - v.x, y - v.y) > v.range) continue;
        if (v.los.length >= 6 && pointInPolygon(x, y, v.los)) {
          visible = true;
          break;
        }
      }
    }
    for (const a of fog.areas) if (inShape(a, x, y)) visible = a.op === 'reveal';
    return visible;
  }

  get hasViewers(): boolean {
    return this.viewers.length > 0;
  }

  // -------------------------------------------------------------------------
  // Exploration memory (localStorage, downscaled)
  // -------------------------------------------------------------------------

  private storageKey(): string | null {
    const ctx = this.engine.ctx;
    if (!ctx || !this.sceneId) return null;
    return `vtt.explored.${ctx.campaign.id}.${this.sceneId}.${ctx.me.id}`;
  }

  private scheduleSave(): void {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveExplored(), 4000);
  }

  private saveExplored(): void {
    if (!this.exploredDirty || !this.exploredRT) return;
    const key = this.storageKey();
    if (!key) return;
    this.exploredDirty = false;
    try {
      const canvas = this.engine.app.renderer.extract.canvas({ target: this.exploredRT }) as HTMLCanvasElement;
      const small = document.createElement('canvas');
      const k = Math.min(1, 512 / Math.max(canvas.width, canvas.height));
      small.width = Math.max(1, Math.round(canvas.width * k));
      small.height = Math.max(1, Math.round(canvas.height * k));
      small.getContext('2d')!.drawImage(canvas, 0, 0, small.width, small.height);
      localStorage.setItem(key, small.toDataURL('image/webp', 0.6));
    } catch {
      // quota exceeded or unsupported — exploration just won't persist
    }
  }

  private loadExplored(): void {
    const key = this.storageKey();
    if (!key || !this.exploredRT) return;
    let data: string | null = null;
    try {
      data = localStorage.getItem(key);
    } catch {
      data = null;
    }
    if (!data) return;
    const img = new Image();
    const target = this.exploredRT;
    img.onload = () => {
      if (target !== this.exploredRT) return;
      const tex = Texture.from(img);
      const spr = new Sprite(tex);
      spr.width = target.width;
      spr.height = target.height;
      const c = new Container();
      c.addChild(spr);
      this.engine.app.renderer.render({ container: c, target, clear: false });
      c.destroy({ children: true });
      window.setTimeout(() => tex.destroy(true), 0);
      this.sigFog = '';
      if (this.engine.ctx) this.update(this.engine.ctx);
      this.engine.requestRender();
    };
    img.src = data;
  }

  reset(): void {
    this.saveExplored();
    this.prevWalls = null;
    this.sigLight = '';
    this.sigFog = '';
    this.polyCache.clear();
  }

  destroy(): void {
    this.saveExplored();
    window.clearTimeout(this.saveTimer);
    this.darkSprite.texture = Texture.EMPTY;
    this.fogSprite.texture = Texture.EMPTY;
    for (const rt of [this.darkRT, this.fogRT, this.visRT, this.tmpRT, this.exploredRT]) rt?.destroy(true);
    this.passRoot.destroy({ children: true });
    this.container.destroy({ children: true });
  }
}

function inShape(a: FogArea, x: number, y: number): boolean {
  const s = a.shape;
  if (s.kind === 'rect') return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
  if (s.kind === 'circle') return Math.hypot(x - s.x, y - s.y) <= s.r;
  return pointInPolygon(x, y, s.points);
}
