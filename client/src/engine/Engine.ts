// Pixi v8 map engine. React never re-renders the canvas: the engine subscribes to the stores and
// diffs immutable state by identity, updating only what changed. Rendering happens on demand.
import { Application, Container } from 'pixi.js';
import type { CampaignState, ID, PlayerInfo, Scene, Token } from '@shared/types.ts';
import type { ToolOptions, Tool } from '../store/ui.ts';
import { Camera } from './Camera.ts';
import { InputController } from './input.ts';
import { GridLayer, MapLayer } from './layers/base.ts';
import { DrawingLayer, LightIconLayer, NoteLayer, TemplateLayer, WallLayer } from './layers/objects.ts';
import { LightingLayer } from './layers/lighting.ts';
import { OverlayLayer } from './layers/overlay.ts';
import { TokenLayer } from './layers/tokens.ts';
import { WeatherLayer } from './layers/weather.ts';

export interface EngineCtx {
  scene: Scene;
  campaign: CampaignState;
  me: PlayerInfo;
  isDM: boolean;
  tool: Tool;
  toolOpts: ToolOptions;
  selection: ReadonlySet<ID>;
  targets: ReadonlySet<ID>;
  hover: ID | null;
  visionPreview: ID | null;
  /** Token whose turn it is (combat). */
  turnTokenId: ID | null;
  /** Tokens this viewer controls. */
  controlled: ReadonlySet<ID>;
}

export interface Layer {
  update(ctx: EngineCtx): void;
  /** Return true while animating (keeps the render loop hot). */
  tick?(dt: number, now: number): boolean;
  reset?(): void;
  destroy(): void;
}

export class Engine {
  app!: Application;
  host: HTMLElement;
  world = new Container();
  screen = new Container();
  camera: Camera;
  ctx: EngineCtx | null = null;
  input!: InputController;

  map!: MapLayer;
  grid!: GridLayer;
  drawingsBelow!: DrawingLayer;
  templates!: TemplateLayer;
  walls!: WallLayer;
  tokens!: TokenLayer;
  drawingsAbove!: DrawingLayer;
  notes!: NoteLayer;
  lighting!: LightingLayer;
  lightIcons!: LightIconLayer;
  overlay!: OverlayLayer;
  weather!: WeatherLayer;
  private layers: Layer[] = [];

  private dirty = true;
  private raf = 0;
  private last = performance.now();
  private destroyed = false;
  private sceneId: ID | null = null;
  private resizeObserver: ResizeObserver | null = null;
  /** Width of UI covering the right side of the canvas (sidebar), for centering. */
  rightInset = 0;
  onCameraChange: () => void = () => {};

  constructor(host: HTMLElement) {
    this.host = host;
    this.camera = new Camera(this.world);
    this.camera.onChange = () => {
      this.dirty = true;
      this.onCameraChange();
    };
  }

  async init(): Promise<void> {
    const app = new Application();
    await app.init({
      background: '#08070b',
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoStart: false,
      sharedTicker: false,
      preference: 'webgl',
      width: this.host.clientWidth || 800,
      height: this.host.clientHeight || 600,
      powerPreference: 'high-performance',
    });
    if (this.destroyed) {
      // Never release Pixi's global pools: another engine instance may be alive (StrictMode/HMR remounts).
      app.destroy({ removeView: true }, { children: true });
      return;
    }
    this.app = app;
    app.canvas.classList.add('table__canvas');
    this.host.appendChild(app.canvas);
    app.stage.addChild(this.world, this.screen);

    this.map = new MapLayer(this);
    this.grid = new GridLayer(this);
    this.drawingsBelow = new DrawingLayer(this, 'below');
    this.templates = new TemplateLayer(this);
    this.walls = new WallLayer(this);
    this.tokens = new TokenLayer(this);
    this.drawingsAbove = new DrawingLayer(this, 'above');
    this.notes = new NoteLayer(this);
    this.lighting = new LightingLayer(this);
    this.lightIcons = new LightIconLayer(this);
    this.overlay = new OverlayLayer(this);
    this.weather = new WeatherLayer(this);
    this.layers = [
      this.map, this.grid, this.drawingsBelow, this.templates, this.walls, this.tokens, this.drawingsAbove,
      this.notes, this.lighting, this.lightIcons, this.overlay, this.weather,
    ];
    // z-order inside the world (weather lives in screen space)
    this.world.addChild(
      this.map.container, this.grid.container, this.drawingsBelow.container, this.templates.container,
      this.walls.container, this.tokens.container, this.drawingsAbove.container, this.notes.container,
      this.lighting.container, this.lightIcons.container, this.overlay.container,
    );
    this.screen.addChild(this.weather.container);

    this.input = new InputController(this);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.host);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  get viewW(): number {
    return this.app?.screen.width ?? 800;
  }

  get viewH(): number {
    return this.app?.screen.height ?? 600;
  }

  private resize(): void {
    if (!this.app) return;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (w && h) this.app.renderer.resize(w, h);
    this.weather.resize(w, h);
    // Resizing clears the drawing buffer: repaint right away instead of waiting for the next change.
    this.app.render();
    this.dirty = true;
  }

  requestRender(): void {
    this.dirty = true;
  }

  sync(ctx: EngineCtx): void {
    if (!this.app || this.destroyed) return;
    const sceneChanged = ctx.scene.id !== this.sceneId;
    this.ctx = ctx;
    if (sceneChanged) {
      for (const l of this.layers) l.reset?.();
      this.sceneId = ctx.scene.id;
    }
    for (const l of this.layers) l.update(ctx);
    if (sceneChanged) this.restoreCamera(ctx.scene);
    this.dirty = true;
  }

  private frame = (now: number): void => {
    if (this.destroyed) return;
    const dt = Math.min(100, now - this.last);
    this.last = now;
    let animating = this.camera.tick(dt);
    for (const l of this.layers) if (l.tick?.(dt, now)) animating = true;
    if (this.dirty || animating) {
      this.app.render();
      this.dirty = false;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Advance animations by `ms` and render now (dev tooling / hidden-tab screenshots). */
  debugFrame(ms = 1000): void {
    const now = performance.now() + ms;
    this.camera.tick(ms);
    for (const l of this.layers) l.tick?.(ms, now);
    this.app.render();
  }

  /** Dev: render and upload a PNG of the canvas to the server (data/dev-snapshots/<name>.png). */
  async debugSnapshot(name = 'snapshot'): Promise<string> {
    this.debugFrame(1000);
    const canvas = this.app.renderer.extract.canvas({ target: this.app.stage, frame: this.app.screen }) as HTMLCanvasElement;
    const blob: Blob = await new Promise((r) => canvas.toBlob((b) => r(b!), 'image/png'));
    const res = await fetch(`/api/dev/snapshot?name=${encodeURIComponent(name)}`, { method: 'POST', body: blob });
    return ((await res.json()) as { file: string }).file;
  }

  // Camera helpers --------------------------------------------------------------

  visibleCenterScreen(): { x: number; y: number } {
    return { x: (this.viewW - this.rightInset) / 2, y: this.viewH / 2 };
  }

  viewCenterWorld(): { x: number; y: number } {
    const c = this.visibleCenterScreen();
    return this.camera.screenToWorld(c.x, c.y);
  }

  centerOn(x: number, y: number, zoom?: number): void {
    this.camera.centerOn(x, y, this.viewW - this.rightInset, this.viewH, zoom, true);
  }

  focusToken(t: Token): void {
    const g = this.ctx?.scene.grid;
    if (!g) return;
    const s = t.size * g.size;
    this.centerOn(t.x + s / 2, t.y + s / 2, Math.max(this.camera.targetScale, 0.9));
  }

  fitScene(animate = false): void {
    const s = this.ctx?.scene;
    if (!s) return;
    this.camera.fit({ x: 0, y: 0, w: s.map.width, h: s.map.height }, this.viewW - this.rightInset, this.viewH, 40, animate);
  }

  private restoreCamera(scene: Scene): void {
    try {
      const raw = sessionStorage.getItem(`vtt.cam.${scene.id}`);
      if (raw) {
        const c = JSON.parse(raw) as { x: number; y: number; s: number };
        this.camera.x = c.x;
        this.camera.y = c.y;
        this.camera.scale = c.s;
        this.camera.apply();
        return;
      }
    } catch {
      // ignore
    }
    if (scene.view) this.camera.centerOn(scene.view.x, scene.view.y, this.viewW - this.rightInset, this.viewH, scene.view.zoom, false);
    else {
      // Prefer centering on my own token when there is one.
      const mine = this.ctx ? Object.values(scene.tokens).find((t) => this.ctx!.controlled.has(t.id) && !this.ctx!.isDM) : undefined;
      if (mine) {
        const s = mine.size * scene.grid.size;
        this.camera.centerOn(mine.x + s / 2, mine.y + s / 2, this.viewW - this.rightInset, this.viewH, 1, false);
      } else this.fitScene(false);
    }
  }

  saveCamera(): void {
    if (!this.sceneId) return;
    try {
      sessionStorage.setItem(`vtt.cam.${this.sceneId}`, JSON.stringify({ x: this.camera.x, y: this.camera.y, s: this.camera.scale }));
    } catch {
      // ignore
    }
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.saveCamera();
    this.resizeObserver?.disconnect();
    this.input?.destroy();
    for (const l of this.layers) l.destroy();
    if (this.app) this.app.destroy({ removeView: true }, { children: true });
  }
}
