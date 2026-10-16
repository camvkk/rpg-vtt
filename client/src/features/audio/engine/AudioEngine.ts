/**
 * AudioEngine — persistent, app-wide audio service (singleton, not tied to React).
 *
 * Graph:
 *   music / ambience / sfx channel gains ─┐
 *   reverb buses (per channel & kind) ────┴→ bus → compressor → limiter → master → mute → destination
 *
 * Ambience presets are fully procedural (see ./ambience). Their random events are scheduled
 * by one look-ahead timer (100 ms) against AudioContext time.
 */
import type { AmbienceMix, ChannelId, MusicState, SfxId, SfxOptions } from './types.ts';
import type { ReverbKind } from './core/reverb.ts';
import type { SynthEnv } from './core/voice.ts';
import type { LayerHost } from './ambience/layer.ts';
import { NoiseBank } from './core/noise.ts';
import { TextureBank } from './core/textures.ts';
import { ReverbBus, makeImpulse } from './core/reverb.ts';
import { clamp, toGain } from './core/random.ts';
import { AmbienceLayer } from './ambience/layer.ts';
import { AMBIENCE_BUILDERS, AMBIENCE_TRIM } from './ambience/presets.ts';
import { SFX } from './sfx/sfx.ts';
import { MusicPlayer } from './music.ts';

type Listener = () => void;

const AMBIENCE_FADE = 3;
const MUSIC_AMBIENCE_FADE_IN = 2;
const MUSIC_AMBIENCE_FADE_OUT = 1.5;
const TICK_MS = 100;
const LOOKAHEAD_VISIBLE = 0.3;
const LOOKAHEAD_HIDDEN = 1.6;
const MAX_SFX = 24;
const AMBIENCE_PREFIX = 'ambience:';

interface Graph {
  ctx: AudioContext;
  noise: NoiseBank;
  textures: TextureBank;
  impulses: Map<ReverbKind, AudioBuffer>;
  reverbs: Map<string, ReverbBus>;
  channels: Record<ChannelId, GainNode>;
  bus: GainNode;
  master: GainNode;
  mute: GainNode;
}

interface Snapshot {
  master: number;
  channels: Record<ChannelId, number>;
  muted: boolean;
  ambience: AmbienceMix;
  music: MusicState | null;
}

type AudioContextCtor = new (options?: AudioContextOptions) => AudioContext;

function audioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

function sanitizeMix(mix: AmbienceMix | null | undefined): AmbienceMix {
  const out: AmbienceMix = {};
  if (!mix) return out;
  for (const [id, layer] of Object.entries(mix)) {
    const v = Number(layer?.volume);
    out[id] = { volume: clamp(Number.isFinite(v) ? v : 1, 0, 1) };
  }
  return out;
}

export class AudioEngine {
  private static instance: AudioEngine | null = null;

  /** The app-wide engine. */
  static get(): AudioEngine {
    if (!AudioEngine.instance) {
      AudioEngine.instance = new AudioEngine();
      const restored = takeHmrSnapshot();
      if (restored) AudioEngine.instance.restore(restored);
    }
    return AudioEngine.instance;
  }

  /** @internal — HMR support. */
  static peek(): AudioEngine | null {
    return AudioEngine.instance;
  }

  private graph: Graph | null = null;
  private readonly supported: boolean;
  private masterVolume = 0.8;
  private readonly channelVolume: Record<ChannelId, number> = { music: 0.8, ambience: 0.8, sfx: 0.9 };
  private isMuted = false;
  private readonly layers = new Map<string, AmbienceLayer>();
  private desiredAmbience: AmbienceMix = {};
  /** `ambience:<id>` played through the music slot. */
  private musicLayer: AmbienceLayer | null = null;
  private desiredMusic: MusicState | null = null;
  private readonly music: MusicPlayer;
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeSfx = 0;
  private lastDriftCheck = 0;
  private destroyed = false;
  private removeGestureListeners: (() => void) | null = null;

  private constructor() {
    this.supported = audioContextCtor() !== null;
    this.music = new MusicPlayer({
      context: () => this.ensureGraph()?.ctx ?? null,
      output: () => this.ensureGraph()?.channels.music ?? null,
      directGain: () => (this.isMuted ? 0 : toGain(this.masterVolume) * toGain(this.channelVolume.music)),
    });
    this.installGestureUnlock();
  }

  // ───────────────────────────── Public API ─────────────────────────────

  /** Resumes the AudioContext; call from (or after) a user gesture. Safe to call often. */
  async unlock(): Promise<void> {
    if (!this.supported || this.destroyed) return;
    const g = this.ensureGraph();
    if (!g) return;
    const ctx = g.ctx;
    if (ctx.state !== 'running') {
      // iOS needs a sound started inside the gesture.
      try {
        const src = new AudioBufferSourceNode(ctx, { buffer: ctx.createBuffer(1, 1, ctx.sampleRate) });
        src.connect(ctx.destination);
        src.start();
      } catch {
        /* ignore */
      }
      const resumed = ctx.resume();
      this.music.kick();
      try {
        await resumed;
      } catch {
        /* still locked */
      }
    } else {
      this.music.kick();
    }
    this.ensureTimer();
    this.tick();
    this.emit();
  }

  get unlocked(): boolean {
    return this.graph?.ctx.state === 'running';
  }

  get muted(): boolean {
    return this.isMuted;
  }

  getMasterVolume(): number {
    return this.masterVolume;
  }

  getChannelVolume(ch: ChannelId): number {
    return this.channelVolume[ch];
  }

  /** Current ambience mix (as last requested). */
  getAmbience(): AmbienceMix {
    return { ...this.desiredAmbience };
  }

  getMusic(): MusicState | null {
    return this.desiredMusic ? { ...this.desiredMusic } : null;
  }

  setMasterVolume(v: number): void {
    this.masterVolume = clamp(Number.isFinite(v) ? v : 0, 0, 1);
    const g = this.graph;
    if (g) smooth(g.ctx, g.master.gain, toGain(this.masterVolume));
    this.music.refreshDirect();
  }

  setChannelVolume(ch: ChannelId, v: number): void {
    if (!(ch in this.channelVolume)) return;
    this.channelVolume[ch] = clamp(Number.isFinite(v) ? v : 0, 0, 1);
    const g = this.graph;
    if (g) smooth(g.ctx, g.channels[ch].gain, toGain(this.channelVolume[ch]));
    if (ch === 'music') this.music.refreshDirect();
  }

  setMuted(m: boolean): void {
    if (this.isMuted === m) return;
    this.isMuted = m;
    const g = this.graph;
    if (g) smooth(g.ctx, g.mute.gain, m ? 0 : 1, 0.04);
    this.music.refreshDirect();
    this.emit();
  }

  /**
   * Streams a music file synced across clients (seek = now − startedAt, mod duration when
   * looping). Changing src crossfades (2 s); null fades out (1.5 s); same src+startedAt is
   * a no-op apart from volume/loop updates. `ambience:<preset>` srcs play a procedural preset
   * on the music channel.
   */
  playMusic(m: MusicState | null): void {
    if (this.destroyed) return;
    const next = m && m.src ? { ...m, volume: clamp(Number.isFinite(m.volume) ? m.volume : 1, 0, 1) } : null;
    this.desiredMusic = next;
    if (!this.supported) return;
    if (next && next.src.startsWith(AMBIENCE_PREFIX)) {
      this.music.play(null);
      this.setMusicLayer(next.src.slice(AMBIENCE_PREFIX.length), next.volume);
    } else {
      this.setMusicLayer(null, 0);
      this.music.play(next);
    }
    this.ensureTimer();
  }

  /** Diffs against the current mix: fades new presets in (3 s), removed ones out (3 s), ramps volume changes. */
  setAmbience(layers: AmbienceMix): void {
    if (this.destroyed) return;
    this.desiredAmbience = sanitizeMix(layers);
    if (!this.supported) return;
    const g = this.ensureGraph();
    if (!g) return;
    for (const [id, layer] of this.layers) {
      const want = this.desiredAmbience[id];
      if (!want) {
        if (!layer.stopping) {
          layer.fadeOut(AMBIENCE_FADE);
          this.scheduleDispose(this.layers, id, layer, AMBIENCE_FADE);
        }
      } else if (layer.stopping) {
        layer.revive(this.layerGain(id, want.volume), AMBIENCE_FADE);
      } else {
        layer.setGain(this.layerGain(id, want.volume), 1);
      }
    }
    for (const [id, want] of Object.entries(this.desiredAmbience)) {
      if (this.layers.has(id)) continue;
      const layer = this.createLayer(g, id, g.channels.ambience, this.layerGain(id, want.volume), AMBIENCE_FADE);
      if (layer) this.layers.set(id, layer);
    }
    this.ensureTimer();
    this.tick();
  }

  /** Plays a synthesized one-shot. Silently ignored while audio is locked or for unknown ids. */
  playSfx(id: SfxId, opts: SfxOptions = {}): void {
    const g = this.graph;
    if (!g || g.ctx.state !== 'running' || this.destroyed) return;
    const fn = SFX[id];
    if (!fn) return;
    if (this.activeSfx >= MAX_SFX) return;
    const ctx = g.ctx;
    const vol = toGain(opts.volume ?? 1);
    const dry = new GainNode(ctx, { gain: vol });
    const pan = new StereoPannerNode(ctx, { pan: clamp(Number.isFinite(opts.pan) ? (opts.pan as number) : 0, -1, 1) });
    dry.connect(pan);
    pan.connect(g.channels.sfx);
    const sends = new Map<ReverbKind, GainNode>();
    const env: SynthEnv = {
      ctx,
      noise: g.noise,
      textures: g.textures,
      out: dry,
      reverb: (kind) => {
        let s = sends.get(kind);
        if (!s) {
          s = new GainNode(ctx, { gain: vol });
          s.connect(this.reverbInput(g, 'sfx', kind));
          sends.set(kind, s);
        }
        return s;
      },
    };
    let dur = 2;
    try {
      dur = fn(env, ctx.currentTime + 0.01);
    } catch (err) {
      console.error('[audio] sfx failed', id, err);
    }
    this.activeSfx++;
    setTimeout(
      () => {
        this.activeSfx--;
        dry.disconnect();
        pan.disconnect();
        for (const s of sends.values()) s.disconnect();
      },
      (Math.max(0.5, dur) + 0.6) * 1000,
    );
  }

  /** Subscribe to unlocked/muted changes. Returns an unsubscribe function. */
  onStateChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  /** Stops everything and releases the AudioContext (the singleton is recreated on next get()). */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.removeGestureListeners?.();
    this.music.dispose();
    for (const l of this.layers.values()) l.dispose();
    this.layers.clear();
    this.musicLayer?.dispose();
    this.musicLayer = null;
    const g = this.graph;
    this.graph = null;
    if (g) void g.ctx.close().catch(() => undefined);
    this.listeners.clear();
    if (AudioEngine.instance === this) AudioEngine.instance = null;
  }

  // ───────────────────────────── Internals ─────────────────────────────

  /** @internal */
  snapshot(): Snapshot {
    return {
      master: this.masterVolume,
      channels: { ...this.channelVolume },
      muted: this.isMuted,
      ambience: { ...this.desiredAmbience },
      music: this.desiredMusic ? { ...this.desiredMusic } : null,
    };
  }

  private restore(s: Snapshot): void {
    this.masterVolume = s.master;
    Object.assign(this.channelVolume, s.channels);
    this.isMuted = s.muted;
    if (Object.keys(s.ambience).length) this.setAmbience(s.ambience);
    if (s.music) this.playMusic(s.music);
  }

  private emit(): void {
    for (const cb of [...this.listeners]) {
      try {
        cb();
      } catch (err) {
        console.error('[audio] listener failed', err);
      }
    }
  }

  private ensureGraph(): Graph | null {
    if (this.graph) return this.graph;
    if (this.destroyed) return null;
    const Ctor = audioContextCtor();
    if (!Ctor) return null;
    let ctx: AudioContext;
    try {
      ctx = new Ctor({ latencyHint: 'playback' });
    } catch {
      try {
        ctx = new Ctor();
      } catch (err) {
        console.warn('[audio] WebAudio unavailable', err);
        return null;
      }
    }
    const bus = new GainNode(ctx, { gain: 0.8 });
    const comp = new DynamicsCompressorNode(ctx, { threshold: -14, knee: 12, ratio: 2.5, attack: 0.01, release: 0.3 });
    const limiter = new DynamicsCompressorNode(ctx, { threshold: -2, knee: 0, ratio: 20, attack: 0.002, release: 0.12 });
    const master = new GainNode(ctx, { gain: toGain(this.masterVolume) });
    const mute = new GainNode(ctx, { gain: this.isMuted ? 0 : 1 });
    bus.connect(comp);
    comp.connect(limiter);
    limiter.connect(master);
    master.connect(mute);
    mute.connect(ctx.destination);
    const channels = {
      music: new GainNode(ctx, { gain: toGain(this.channelVolume.music) }),
      ambience: new GainNode(ctx, { gain: toGain(this.channelVolume.ambience) }),
      sfx: new GainNode(ctx, { gain: toGain(this.channelVolume.sfx) }),
    };
    for (const ch of Object.values(channels)) ch.connect(bus);
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') {
        this.ensureTimer();
        this.tick();
      }
      this.emit();
    });
    this.graph = {
      ctx,
      noise: new NoiseBank(ctx),
      textures: new TextureBank(ctx),
      impulses: new Map(),
      reverbs: new Map(),
      channels,
      bus,
      master,
      mute,
    };
    return this.graph;
  }

  private reverbInput(g: Graph, ch: ChannelId, kind: ReverbKind): AudioNode {
    const key = `${ch}:${kind}`;
    let r = g.reverbs.get(key);
    if (!r) {
      let ir = g.impulses.get(kind);
      if (!ir) {
        ir = makeImpulse(g.ctx, kind);
        g.impulses.set(kind, ir);
      }
      r = new ReverbBus(g.ctx, ir, g.channels[ch]);
      g.reverbs.set(key, r);
    }
    return r.input;
  }

  private layerGain(id: string, volume: number): number {
    return toGain(volume) * (AMBIENCE_TRIM[id] ?? 1);
  }

  private createLayer(g: Graph, id: string, dest: GainNode, gain: number, fadeIn: number): AmbienceLayer | null {
    const builder = AMBIENCE_BUILDERS[id];
    if (!builder) {
      console.warn(`[audio] unknown ambience preset "${id}"`);
      return null;
    }
    const ch: ChannelId = dest === g.channels.music ? 'music' : 'ambience';
    const host: LayerHost = {
      ctx: g.ctx,
      noise: g.noise,
      textures: g.textures,
      dest,
      reverbInput: (kind) => this.reverbInput(g, ch, kind),
    };
    try {
      return new AmbienceLayer(host, id, builder, gain, fadeIn);
    } catch (err) {
      console.error('[audio] failed to build ambience', id, err);
      return null;
    }
  }

  private scheduleDispose(map: Map<string, AmbienceLayer> | null, id: string, layer: AmbienceLayer, fade: number): void {
    setTimeout(
      () => {
        if (!layer.stopping || layer.disposed) return;
        layer.dispose();
        if (map && map.get(id) === layer) map.delete(id);
      },
      (fade + 0.3) * 1000,
    );
  }

  private setMusicLayer(id: string | null, volume: number): void {
    const cur = this.musicLayer;
    if (cur && id === cur.id && !cur.stopping) {
      cur.setGain(this.layerGain(cur.id, volume), 0.6);
      return;
    }
    if (cur) {
      cur.fadeOut(id ? MUSIC_AMBIENCE_FADE_IN : MUSIC_AMBIENCE_FADE_OUT);
      this.scheduleDispose(null, cur.id, cur, id ? MUSIC_AMBIENCE_FADE_IN : MUSIC_AMBIENCE_FADE_OUT);
      this.musicLayer = null;
    }
    if (!id) return;
    const g = this.ensureGraph();
    if (!g) return;
    this.musicLayer = this.createLayer(g, id, g.channels.music, this.layerGain(id, volume), MUSIC_AMBIENCE_FADE_IN);
    this.tick();
  }

  private ensureTimer(): void {
    if (this.timer !== null || this.destroyed) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private tick(): void {
    const g = this.graph;
    if (!g || g.ctx.state !== 'running') return;
    const now = g.ctx.currentTime;
    const hidden = typeof document !== 'undefined' && document.hidden;
    const horizon = now + (hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD_VISIBLE);
    for (const layer of this.layers.values()) layer.tick(now, horizon);
    if (this.musicLayer) this.musicLayer.tick(now, horizon);
    const wall = Date.now();
    if (wall - this.lastDriftCheck > 4000) {
      this.lastDriftCheck = wall;
      this.music.checkDrift();
    }
    // Idle → stop the timer (restarted by any API call that needs it).
    if (this.layers.size === 0 && !this.musicLayer && !this.music.active && this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Any user gesture unlocks audio automatically (in addition to explicit unlock() calls). */
  private installGestureUnlock(): void {
    if (typeof window === 'undefined') return;
    const handler = (): void => {
      if (!this.destroyed && !this.unlocked) void this.unlock();
    };
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    for (const ev of events) window.addEventListener(ev, handler, { capture: true, passive: true });
    this.removeGestureListeners = () => {
      for (const ev of events) window.removeEventListener(ev, handler, { capture: true });
    };
  }
}

/** Click-free parameter change. */
function smooth(ctx: BaseAudioContext, p: AudioParam, value: number, tau = 0.06): void {
  const now = ctx.currentTime;
  p.cancelScheduledValues(now);
  p.setTargetAtTime(value, now, tau);
}

// ───────────────────────────── HMR ─────────────────────────────

let hmrSnapshot: Snapshot | null = null;

function takeHmrSnapshot(): Snapshot | null {
  const s = hmrSnapshot;
  hmrSnapshot = null;
  return s;
}

if (import.meta.hot) {
  const data = import.meta.hot.data as { audioSnapshot?: Snapshot };
  if (data.audioSnapshot) hmrSnapshot = data.audioSnapshot;
  import.meta.hot.dispose((d: { audioSnapshot?: Snapshot }) => {
    const e = AudioEngine.peek();
    if (e) {
      d.audioSnapshot = e.snapshot();
      e.destroy();
    }
  });
}
