/**
 * three.js renderer for the dice overlay. Loaded lazily (dynamic import) on the
 * first roll, together with three and cannon-es.
 */
import '@fontsource/cinzel/700.css';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  NeutralToneMapping,
  PCFShadowMap,
  OrthographicCamera,
  PlaneGeometry,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  ShadowMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type WebGLRenderTarget,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DiceAudio } from './audio.ts';
import { expandDice, remapForResult, type DieKind, type PhysicalDie } from './faces.ts';
import { buildDieGeometry } from './geometry.ts';
import { getShape } from './shapes.ts';
import { DiceSimulation, SIM_DT, STRIDE, type Arena, type SimResult } from './sim.ts';
import {
  atlasLayout,
  DEFAULT_DIE_COLOR,
  ensureFont,
  NUMERAL_GOLD,
  paintAtlas,
  paintHalo,
  type AtlasLayout,
} from './textures.ts';
import type { Dice3DRoll } from './types.ts';

const CAMERA_DIST = 80;
const TILT = (14 * Math.PI) / 180;
/** World units visible across the short side of the viewport (sets die size). */
const UNITS_ACROSS = 19;
const FADE_MS = 520;
const SHADOW_OPACITY = 0.46;
const KEY_DIR = new Vector3(-0.55, 1, -0.5).normalize();
const MAX_CACHED_MATERIALS = 18;
const SIM_BUDGET_MS = 450;

type HighlightKind = 'crit' | 'fumble';

interface Halo {
  glow: Sprite;
  ring: Sprite;
  light: PointLight | null;
  type: HighlightKind;
  radius: number;
}

interface Playback {
  sim: SimResult;
  dice: PhysicalDie[];
  meshes: Mesh[];
  rots: Quaternion[];
  materials: Set<MeshPhysicalMaterial>;
  highlight: { die: number; type: HighlightKind }[];
  halos: Halo[];
  start: number;
  settledAt: number;
  fadeAt: number;
  lingerMs: number;
  nextEvent: number;
  shown: boolean;
  onShown: () => void;
  resolve: () => void;
}

export interface PlayOptions {
  /** How long the settled result stays fully visible before fading (ms). */
  lingerMs?: number;
  /** Called once the result has been shown (before the fade-out). */
  onShown?: () => void;
}

const yieldToMain = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Parse a player colour and keep it dark enough for gold numerals to read. */
export function dieBodyColor(input?: string): string {
  const c = new Color(DEFAULT_DIE_COLOR);
  if (input && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(input.trim())) c.setStyle(input.trim());
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(hsl.s, 0.8), Math.min(hsl.l, 0.3));
  return `#${c.getHexString()}`;
}

function paintRing(size = 128): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.62, 'rgba(255,255,255,0)');
  g.addColorStop(0.8, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.9, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvas;
}

export class DiceEngine {
  /** True after a WebGL context loss: the owner should dispose and recreate. */
  broken = false;

  #container: HTMLElement;
  #renderer: WebGLRenderer;
  #scene = new Scene();
  #camera = new OrthographicCamera(-10, 10, 6, -6, 1, 200);
  #diceGroup = new Group();
  #key: DirectionalLight;
  #floorGeo: PlaneGeometry;
  #floorMat: ShadowMaterial;
  #glowLights: PointLight[] = [];
  #env: WebGLRenderTarget | null = null;
  #layouts = new Map<DieKind, AtlasLayout>();
  #geoms = new Map<DieKind, BufferGeometry>();
  #masks = new Map<DieKind, CanvasTexture>();
  #mats = new Map<string, { mat: MeshPhysicalMaterial; map: CanvasTexture }>();
  #haloTex: CanvasTexture;
  #ringTex: CanvasTexture;
  #glowMats: Record<HighlightKind, SpriteMaterial>;
  #ringMats: Record<HighlightKind, SpriteMaterial>;
  #audio = new DiceAudio();
  #ro: ResizeObserver | null = null;
  #arena: Arena = { nearLeft: [-10, 6], nearRight: [10, 6], farRight: [10, -6], farLeft: [-10, -6] };
  #halfWidth = 10;
  #maxAniso = 1;
  #raf = 0;
  #watchdog: ReturnType<typeof setInterval> | undefined;
  #lastTick = 0;
  #token = 0;
  #current: Playback | null = null;
  #disposed = false;
  #warmedSprites = false;
  // scratch
  #q0 = new Quaternion();
  #q1 = new Quaternion();
  #v = new Vector3();

  #scale: number;

  /** `scale` multiplies the on-screen die size (default 1). */
  static async create(container: HTMLElement, opts: { scale?: number } = {}): Promise<DiceEngine> {
    await ensureFont();
    return new DiceEngine(container, opts.scale ?? 1);
  }

  private constructor(container: HTMLElement, scale: number) {
    this.#container = container;
    this.#scale = Math.max(0.25, Math.min(4, scale));
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

    const renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    this.#renderer = renderer;
    this.#maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    const canvas = renderer.domElement;
    Object.assign(canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
      display: 'none',
    });
    canvas.setAttribute('aria-hidden', 'true');
    canvas.addEventListener('webglcontextlost', this.#onContextLost);
    container.appendChild(canvas);

    // Image-based lighting for the clearcoat and the metallic numerals.
    try {
      const pmrem = new PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      this.#env = pmrem.fromScene(room, 0.04);
      room.dispose();
      pmrem.dispose();
      this.#scene.environment = this.#env.texture;
      this.#scene.environmentIntensity = 0.45;
    } catch {
      this.#env = null;
    }

    // Lights: warm key (shadow caster) top-left, cool rim from the far side, warm fill.
    this.#scene.add(new HemisphereLight(0xffe6c4, 0x1c0a12, 0.4));
    const key = new DirectionalLight(0xffe0b8, 2.1);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    this.#key = key;
    this.#scene.add(key);
    const rim = new DirectionalLight(0x93a9ff, 1.5);
    rim.position.set(0.35, 0.5, -1).multiplyScalar(40);
    this.#scene.add(rim);
    const fill = new DirectionalLight(0xff9d70, 0.5);
    fill.position.set(1, 0.7, 0.9).multiplyScalar(40);
    this.#scene.add(fill);
    for (let i = 0; i < 2; i++) {
      const l = new PointLight(0xffc85a, 0, 9, 2);
      this.#glowLights.push(l);
      this.#scene.add(l);
    }

    // Invisible floor that only shows contact shadows.
    this.#floorGeo = new PlaneGeometry(400, 400);
    this.#floorGeo.rotateX(-Math.PI / 2);
    this.#floorMat = new ShadowMaterial({ color: 0x0a0208, opacity: SHADOW_OPACITY, depthWrite: false });
    const floor = new Mesh(this.#floorGeo, this.#floorMat);
    floor.receiveShadow = true;
    floor.renderOrder = -2;
    this.#scene.add(floor);
    this.#scene.add(this.#diceGroup);

    this.#haloTex = new CanvasTexture(paintHalo());
    this.#haloTex.colorSpace = SRGBColorSpace;
    this.#ringTex = new CanvasTexture(paintRing());
    this.#ringTex.colorSpace = SRGBColorSpace;
    const spriteMat = (map: CanvasTexture, color: number): SpriteMaterial =>
      new SpriteMaterial({ map, color, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, depthTest: false });
    this.#glowMats = { crit: spriteMat(this.#haloTex, 0xffc65c), fumble: spriteMat(this.#haloTex, 0xff2a2a) };
    this.#ringMats = { crit: spriteMat(this.#ringTex, 0xffe39a), fumble: spriteMat(this.#ringTex, 0xff4a3a) };

    if (typeof ResizeObserver !== 'undefined') {
      this.#ro = new ResizeObserver(() => this.#resize());
      this.#ro.observe(container);
    } else {
      window.addEventListener('resize', this.#resize);
    }
    document.addEventListener('visibilitychange', this.#onVisibility);
    this.#resize();
  }

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  setSound(on: boolean): void {
    this.#audio.enabled = on;
  }

  get busy(): boolean {
    return this.#current !== null;
  }

  /** Play one roll. Resolves when the dice have faded out and been cleared. */
  async play(roll: Dice3DRoll, opts: PlayOptions = {}): Promise<void> {
    let shown = false;
    const onShown = (): void => {
      if (shown) return;
      shown = true;
      opts.onShown?.();
    };
    this.cancel();
    const token = ++this.#token;
    const dice = expandDice(roll.dice ?? []);
    if (this.#disposed || this.broken || dice.length === 0 || document.visibilityState === 'hidden') {
      onShown();
      return;
    }
    this.#audio.prepare();
    const color = dieBodyColor(roll.color);

    const sim = await this.#simulate(dice.map((d) => d.kind), token);
    if (!sim || token !== this.#token || this.#disposed) {
      onShown();
      return;
    }

    // Choose, per die, the symmetry that brings the requested value to the landed face.
    const rots = dice.map((d, i) => {
      const r = remapForResult(getShape(d.kind), sim.landed[i]!, d.key, sim.finalQuats[i]);
      if (!r) console.warn('[dice3d] could not map value', d);
      return r ? new Quaternion(r.rotation[0], r.rotation[1], r.rotation[2], r.rotation[3]) : new Quaternion();
    });

    const materials = new Set<MeshPhysicalMaterial>();
    const meshes = dice.map((d) => {
      const mat = this.#material(d.kind, color);
      materials.add(mat);
      const m = new Mesh(this.#geometry(d.kind), mat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.#diceGroup.add(m);
      return m;
    });

    const highlight = this.#pickHighlights(roll, dice);

    const playback: Playback = {
      sim,
      dice,
      meshes,
      rots,
      materials,
      highlight,
      halos: [],
      start: 0,
      settledAt: -1,
      fadeAt: -1,
      lingerMs: opts.lingerMs ?? 1200,
      nextEvent: 0,
      shown: false,
      onShown,
      resolve: () => undefined,
    };
    this.#applyPoses(playback, 0);

    // Compile shaders before the first visible frame (no hitch on the first roll).
    try {
      if (!this.#warmedSprites) {
        const warm = [this.#glowMats.crit, this.#ringMats.crit].map((m) => {
          const s = new Sprite(m);
          s.scale.setScalar(0.001);
          this.#scene.add(s);
          return s;
        });
        await this.#renderer.compileAsync(this.#scene, this.#camera);
        for (const s of warm) this.#scene.remove(s);
        this.#warmedSprites = true;
      } else {
        await this.#renderer.compileAsync(this.#scene, this.#camera);
      }
    } catch {
      /* compile lazily on first render instead */
    }
    if (token !== this.#token || this.#disposed) {
      for (const m of meshes) this.#diceGroup.remove(m);
      onShown();
      return;
    }

    await new Promise<void>((resolve) => {
      playback.resolve = resolve;
      playback.start = performance.now();
      this.#current = playback;
      this.#renderer.domElement.style.display = 'block';
      this.#lastTick = playback.start;
      this.#raf = requestAnimationFrame(this.#tick);
      // rAF can stall while the page still reports itself visible (occluded window,
      // embedded webview...). Keep the timeline moving so roll() always resolves.
      this.#watchdog = setInterval(() => {
        const now = performance.now();
        if (this.#current && now - this.#lastTick > 300) this.#tick(now);
      }, 300);
    });
  }

  /** Stop the current roll immediately (its promises resolve). */
  cancel(): void {
    this.#token++;
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    if (this.#current) this.#finish(this.#current);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.cancel();
    this.#disposed = true;
    this.#ro?.disconnect();
    window.removeEventListener('resize', this.#resize);
    document.removeEventListener('visibilitychange', this.#onVisibility);
    const canvas = this.#renderer.domElement;
    canvas.removeEventListener('webglcontextlost', this.#onContextLost);
    for (const g of this.#geoms.values()) g.dispose();
    for (const t of this.#masks.values()) t.dispose();
    for (const { mat, map } of this.#mats.values()) {
      mat.dispose();
      map.dispose();
    }
    this.#geoms.clear();
    this.#masks.clear();
    this.#mats.clear();
    this.#haloTex.dispose();
    this.#ringTex.dispose();
    for (const m of [...Object.values(this.#glowMats), ...Object.values(this.#ringMats)]) m.dispose();
    this.#floorGeo.dispose();
    this.#floorMat.dispose();
    this.#env?.dispose();
    this.#key.shadow.map?.dispose();
    this.#renderer.dispose();
    this.#renderer.forceContextLoss();
    canvas.remove();
    this.#audio.dispose();
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  #resize = (): void => {
    if (this.#disposed) return;
    const w = Math.max(1, this.#container.clientWidth || window.innerWidth);
    const h = Math.max(1, this.#container.clientHeight || window.innerHeight);
    // Cap DPR at 2 and keep the backing store under ~9 MP.
    const dpr = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(9e6 / (w * h))));
    this.#renderer.setPixelRatio(dpr);
    this.#renderer.setSize(w, h, false);

    const ppu = Math.min(72, Math.max(24, Math.min(w, h) / UNITS_ACROSS)) * this.#scale;
    // Orthographic: every die is seen from the same slight angle, so the top face is
    // always the most frontal one (a perspective camera can make a neighbouring d20
    // face look more "on top" than the real one near the screen edges).
    const cam = this.#camera;
    cam.left = -w / (2 * ppu);
    cam.right = w / (2 * ppu);
    cam.top = h / (2 * ppu);
    cam.bottom = -h / (2 * ppu);
    cam.near = 1;
    cam.far = CAMERA_DIST * 2;
    cam.position.set(0, CAMERA_DIST * Math.cos(TILT), CAMERA_DIST * Math.sin(TILT));
    cam.up.set(0, 1, 0);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();

    this.#arena = this.#computeArena(10 / ppu);
    const a = this.#arena;
    this.#halfWidth = Math.max(1, (a.nearRight[0] - a.nearLeft[0] + a.farRight[0] - a.farLeft[0]) / 4);

    // Fit the shadow camera to the visible floor.
    let ext = 2;
    for (const c of [a.nearLeft, a.nearRight, a.farRight, a.farLeft]) {
      for (const y of [0, 3]) {
        this.#v.set(c[0], y, c[1]);
        const along = this.#v.dot(KEY_DIR);
        ext = Math.max(ext, this.#v.addScaledVector(KEY_DIR, -along).length() + 2);
      }
    }
    const key = this.#key;
    key.position.copy(KEY_DIR).multiplyScalar(ext * 2 + 20);
    const sc = key.shadow.camera;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = ext * 4 + 40;
    sc.updateProjectionMatrix();

    if (this.#current && !this.#raf) this.#renderer.render(this.#scene, this.#camera);
  };

  /** Visible floor region for dice, inset by `margin` world units. */
  #computeArena(margin: number): Arena {
    const cam = this.#camera;
    const p0 = new Vector3();
    const corner = (nx: number, ny: number, y: number): [number, number] => {
      p0.set(nx, ny, -1).unproject(cam);
      const d = this.#v.set(nx, ny, 1).unproject(cam).sub(p0);
      const t = (y - p0.y) / d.y;
      return [p0.x + d.x * t, p0.z + d.z * t];
    };
    // Pick, per corner, the more restrictive of the floor and die-top projections.
    const pick = (nx: number, ny: number): [number, number] => {
      const lo = corner(nx, ny, 0);
      const hi = corner(nx, ny, 1.4);
      const x = nx < 0 ? Math.max(lo[0], hi[0]) + margin : Math.min(lo[0], hi[0]) - margin;
      const z = ny < 0 ? Math.min(lo[1], hi[1]) - margin : Math.max(lo[1], hi[1]) + margin;
      return [x, z];
    };
    return { nearLeft: pick(-1, -1), nearRight: pick(1, -1), farRight: pick(1, 1), farLeft: pick(-1, 1) };
  }

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  #layout(kind: DieKind): AtlasLayout {
    let l = this.#layouts.get(kind);
    if (!l) {
      l = atlasLayout(getShape(kind));
      this.#layouts.set(kind, l);
    }
    return l;
  }

  #geometry(kind: DieKind): BufferGeometry {
    let g = this.#geoms.get(kind);
    if (!g) {
      g = buildDieGeometry(getShape(kind), this.#layout(kind));
      this.#geoms.set(kind, g);
    }
    return g;
  }

  #mask(kind: DieKind): CanvasTexture {
    let t = this.#masks.get(kind);
    if (!t) {
      t = new CanvasTexture(paintAtlas(getShape(kind), this.#layout(kind), 'mask'));
      t.anisotropy = this.#maxAniso;
      this.#renderer.initTexture(t);
      this.#masks.set(kind, t);
    }
    return t;
  }

  #material(kind: DieKind, color: string): MeshPhysicalMaterial {
    const key = `${kind}|${color}`;
    const hit = this.#mats.get(key);
    if (hit) {
      this.#mats.delete(key);
      this.#mats.set(key, hit);
      return hit.mat;
    }
    const map = new CanvasTexture(paintAtlas(getShape(kind), this.#layout(kind), 'color', color));
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = this.#maxAniso;
    // Upload now (before playback starts) rather than on the first animated frame.
    this.#renderer.initTexture(map);
    const mask = this.#mask(kind);
    const mat = new MeshPhysicalMaterial({
      map,
      metalnessMap: mask,
      emissiveMap: mask,
      emissive: new Color(NUMERAL_GOLD),
      emissiveIntensity: 0.14,
      metalness: 1,
      roughness: 0.34,
      clearcoat: 0.75,
      clearcoatRoughness: 0.14,
      transparent: true,
      opacity: 1,
    });
    this.#mats.set(key, { mat, map });
    return mat;
  }

  /** Drop least-recently-used materials beyond the cache size (never ones on screen). */
  #evict(): void {
    if (this.#mats.size <= MAX_CACHED_MATERIALS) return;
    const inUse = this.#current?.materials;
    for (const [key, { mat, map }] of this.#mats) {
      if (this.#mats.size <= MAX_CACHED_MATERIALS) break;
      if (inUse?.has(mat)) continue;
      mat.dispose();
      map.dispose();
      this.#mats.delete(key);
    }
  }

  // -------------------------------------------------------------------------
  // Simulation
  // -------------------------------------------------------------------------

  async #simulate(kinds: DieKind[], token: number): Promise<SimResult | null> {
    const t0 = performance.now();
    let best: SimResult | null = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      const sim = new DiceSimulation(kinds, this.#arena);
      // Time-sliced so a 20-dice throw never blocks the UI for long.
      while (!sim.run(performance.now() + 8)) {
        await yieldToMain();
        if (token !== this.#token || this.#disposed) return null;
      }
      const r = sim.result();
      if (!best || r.quality < best.quality) best = r;
      // Good enough: every die visible and on the floor, few needed straightening.
      const s = best.stats;
      const acceptable = s.outside === 0 && s.stacked === 0 && s.cocked <= Math.floor(kinds.length / 8);
      if (acceptable || performance.now() - t0 > SIM_BUDGET_MS) break;
      await yieldToMain();
      if (token !== this.#token || this.#disposed) return null;
    }
    return best;
  }

  #pickHighlights(roll: Dice3DRoll, dice: PhysicalDie[]): { die: number; type: HighlightKind }[] {
    const d20 = dice.map((d, i) => ({ d, i })).filter((x) => x.d.kind === 'd20');
    if (d20.length === 0) return [];
    const out: { die: number; type: HighlightKind }[] = [];
    if (roll.crit) {
      let hits = d20.filter((x) => x.d.key === 20);
      if (hits.length === 0) hits = [d20.reduce((a, b) => (b.d.key > a.d.key ? b : a))];
      for (const h of hits) out.push({ die: h.i, type: 'crit' });
    }
    if (roll.fumble) {
      let hits = d20.filter((x) => x.d.key === 1);
      if (hits.length === 0) hits = [d20.reduce((a, b) => (b.d.key < a.d.key ? b : a))];
      for (const h of hits) if (!out.some((o) => o.die === h.i)) out.push({ die: h.i, type: 'fumble' });
    }
    return out;
  }

  // -------------------------------------------------------------------------
  // Playback
  // -------------------------------------------------------------------------

  #applyPoses(p: Playback, f: number): void {
    const { frames, frameCount, dieCount } = p.sim;
    const i0 = Math.max(0, Math.min(frameCount - 1, Math.floor(f)));
    const i1 = Math.min(frameCount - 1, i0 + 1);
    const a = Math.max(0, Math.min(1, f - i0));
    for (let j = 0; j < dieCount; j++) {
      const o0 = (i0 * dieCount + j) * STRIDE;
      const o1 = (i1 * dieCount + j) * STRIDE;
      const mesh = p.meshes[j]!;
      mesh.position.set(
        frames[o0]! + (frames[o1]! - frames[o0]!) * a,
        frames[o0 + 1]! + (frames[o1 + 1]! - frames[o0 + 1]!) * a,
        frames[o0 + 2]! + (frames[o1 + 2]! - frames[o0 + 2]!) * a,
      );
      this.#q0.set(frames[o0 + 3]!, frames[o0 + 4]!, frames[o0 + 5]!, frames[o0 + 6]!);
      this.#q1.set(frames[o1 + 3]!, frames[o1 + 4]!, frames[o1 + 5]!, frames[o1 + 6]!);
      mesh.quaternion.slerpQuaternions(this.#q0, this.#q1, a).multiply(p.rots[j]!);
    }
  }

  #playSounds(p: Playback, f: number): void {
    const ev = p.sim.events;
    while (p.nextEvent < ev.length && ev[p.nextEvent]!.frame <= f) {
      const e = ev[p.nextEvent++]!;
      if (f - e.frame > 6) continue; // stale after a frame hitch
      const x = p.meshes[e.die]?.position.x ?? 0;
      this.#audio.clack(e.speed, e.target, (x / this.#halfWidth) * 0.8);
    }
  }

  #startHalos(p: Playback): void {
    p.highlight.forEach((h, k) => {
      const mesh = p.meshes[h.die];
      if (!mesh) return;
      const shape = getShape(p.dice[h.die]!.kind);
      const glow = new Sprite(this.#glowMats[h.type]);
      glow.position.set(mesh.position.x, shape.inradius * 0.6, mesh.position.z);
      glow.renderOrder = -1;
      const ring = new Sprite(this.#ringMats[h.type]);
      ring.position.copy(glow.position);
      ring.renderOrder = -1;
      this.#scene.add(glow, ring);
      const light = this.#glowLights[k] ?? null;
      if (light) {
        light.color.set(h.type === 'crit' ? 0xffc65c : 0xff3a2a);
        light.position.set(mesh.position.x, 2.2, mesh.position.z + 0.4);
      }
      p.halos.push({ glow, ring, light, type: h.type, radius: shape.radius });
    });
  }

  #updateHalos(p: Playback, since: number, fade: number): void {
    const s = since / 1000;
    for (const h of p.halos) {
      const rise = 1 - Math.exp(-s * 6);
      const pulse = 0.7 + 0.3 * Math.sin(s * Math.PI * 2 * 1.5 - Math.PI / 2);
      const k = rise * pulse * fade;
      h.glow.scale.setScalar(h.radius * (3.6 + 1.0 * pulse));
      h.glow.material.opacity = k * (h.type === 'crit' ? 1 : 0.9);
      const ringT = Math.min(1, s / 0.8);
      h.ring.scale.setScalar(h.radius * (1.6 + 6 * (1 - (1 - ringT) * (1 - ringT))));
      h.ring.material.opacity = (1 - ringT) * 0.9 * fade;
      if (h.light) h.light.intensity = k * (h.type === 'crit' ? 30 : 24);
    }
  }

  #tick = (now: number): void => {
    // May be called by rAF or by the watchdog; never keep two frames queued.
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    this.#lastTick = now;
    const p = this.#current;
    if (!p || this.#disposed) return;
    const last = p.sim.frameCount - 1;
    const f = Math.min(((now - p.start) / 1000) / SIM_DT, last);
    this.#applyPoses(p, f);
    this.#playSounds(p, f);

    if (f >= last) {
      if (p.settledAt < 0) {
        p.settledAt = now;
        this.#startHalos(p);
      }
      const since = now - p.settledAt;
      if (!p.shown && since >= p.lingerMs) {
        p.shown = true;
        p.fadeAt = now;
        p.onShown();
      }
      let fade = 1;
      if (p.fadeAt >= 0) {
        const k = Math.min(1, (now - p.fadeAt) / FADE_MS);
        if (k >= 1) {
          this.#finish(p);
          return;
        }
        fade = 1 - k * k * (3 - 2 * k);
        for (const m of p.materials) m.opacity = fade;
        this.#floorMat.opacity = SHADOW_OPACITY * fade;
        const sc = 0.9 + 0.1 * fade;
        for (const m of p.meshes) m.scale.setScalar(sc);
      }
      this.#updateHalos(p, since, fade);
    }

    this.#renderer.render(this.#scene, this.#camera);
    this.#raf = requestAnimationFrame(this.#tick);
  };

  #finish(p: Playback): void {
    if (this.#current === p) this.#current = null;
    if (this.#raf) cancelAnimationFrame(this.#raf);
    this.#raf = 0;
    clearInterval(this.#watchdog);
    this.#watchdog = undefined;
    for (const m of p.meshes) this.#diceGroup.remove(m);
    for (const h of p.halos) {
      this.#scene.remove(h.glow, h.ring);
      h.glow.material.opacity = 0;
      h.ring.material.opacity = 0;
      if (h.light) h.light.intensity = 0;
    }
    for (const m of p.materials) m.opacity = 1;
    this.#floorMat.opacity = SHADOW_OPACITY;
    if (!this.#disposed) {
      this.#renderer.clear();
      this.#renderer.domElement.style.display = 'none';
    }
    if (!p.shown) {
      p.shown = true;
      p.onShown();
    }
    p.resolve();
    this.#evict();
  }

  #onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.cancel();
  };

  #onContextLost = (e: Event): void => {
    e.preventDefault();
    this.broken = true;
    this.cancel();
  };
}
