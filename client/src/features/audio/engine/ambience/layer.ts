/**
 * One running ambience preset: a continuous "bed" of nodes plus scheduled event streams,
 * all routed through fade gains (dry + one per reverb send) so the whole layer — including
 * its reverb tails — fades in/out smoothly.
 */
import type { NoiseBank } from '../core/noise.ts';
import type { ReverbKind } from '../core/reverb.ts';
import type { TextureBank } from '../core/textures.ts';
import type { EventStream } from '../core/scheduler.ts';
import type { SynthEnv } from '../core/voice.ts';
import { Voice } from '../core/voice.ts';
import { randomEvents, runStreams, walk } from '../core/scheduler.ts';
import { rand } from '../core/random.ts';

export interface LayerEnv extends SynthEnv {
  /** Audio time at which the layer starts. */
  readonly t0: number;
  /** Registry for continuous nodes (stopped/disconnected when the layer is disposed). */
  readonly bed: Voice;
  add(stream: EventStream): void;
  /** Random events every [minGap, maxGap] s; first one after `first` s (default: random within minGap). */
  events(minGap: number, maxGap: number, fire: (t: number) => void, first?: number): void;
  /** Smooth random walk of a param between min and max, gliding for [minDur, maxDur] s per step. */
  walk(param: AudioParam, min: number, max: number, minDur: number, maxDur: number, exp?: boolean): void;
}

export type LayerBuilder = (env: LayerEnv) => void;

export interface LayerHost {
  readonly ctx: BaseAudioContext;
  readonly noise: NoiseBank;
  readonly textures: TextureBank;
  /** Channel input the layer feeds. */
  readonly dest: AudioNode;
  reverbInput(kind: ReverbKind): AudioNode;
}

interface FadeState {
  from: number;
  to: number;
  t0: number;
  t1: number;
}

export class AmbienceLayer {
  readonly id: string;
  stopping = false;
  disposed = false;
  private readonly host: LayerHost;
  private readonly ctx: BaseAudioContext;
  private readonly dry: GainNode;
  private readonly wets = new Map<ReverbKind, GainNode>();
  private readonly streams: EventStream[] = [];
  private readonly bed: Voice;
  private fade: FadeState = { from: 0, to: 0, t0: 0, t1: 0 };

  constructor(host: LayerHost, id: string, builder: LayerBuilder, gain: number, fadeIn: number) {
    this.host = host;
    this.id = id;
    this.ctx = host.ctx;
    const ctx = host.ctx;
    this.dry = new GainNode(ctx, { gain: 0 });
    this.dry.connect(host.dest);
    const t0 = ctx.currentTime + 0.05;
    const base: SynthEnv = {
      ctx,
      noise: host.noise,
      textures: host.textures,
      out: this.dry,
      reverb: (kind) => this.wet(kind),
    };
    this.bed = new Voice(base);
    const streams = this.streams;
    const env: LayerEnv = {
      ...base,
      t0,
      bed: this.bed,
      add: (s) => {
        streams.push(s);
      },
      events: (minGap, maxGap, fire, first) => {
        streams.push(randomEvents(t0 + (first ?? rand(0.2, 1) * minGap), minGap, maxGap, fire));
      },
      walk: (param, min, max, minDur, maxDur, exp) => {
        streams.push(walk(param, { min, max, minDur, maxDur, start: t0, exp }));
      },
    };
    builder(env);
    this.applyFade(gain, fadeIn);
  }

  /** Lazily created post-fade reverb send that mirrors the dry fade. */
  private wet(kind: ReverbKind): AudioNode {
    let g = this.wets.get(kind);
    if (!g) {
      const now = this.ctx.currentTime;
      g = new GainNode(this.ctx, { gain: 0 });
      const cur = this.valueAt(now);
      g.gain.setValueAtTime(cur, now);
      if (this.fade.t1 > now) g.gain.linearRampToValueAtTime(this.fade.to, this.fade.t1);
      else g.gain.setValueAtTime(this.fade.to, now);
      g.connect(this.host.reverbInput(kind));
      this.wets.set(kind, g);
    }
    return g;
  }

  private valueAt(t: number): number {
    const f = this.fade;
    if (t >= f.t1) return f.to;
    if (t <= f.t0) return f.from;
    return f.from + ((f.to - f.from) * (t - f.t0)) / (f.t1 - f.t0);
  }

  private applyFade(target: number, dur: number): void {
    const now = this.ctx.currentTime;
    const cur = this.valueAt(now);
    const gains = [this.dry, ...this.wets.values()];
    for (const g of gains) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(cur, now);
      g.gain.linearRampToValueAtTime(target, now + Math.max(0.02, dur));
    }
    this.fade = { from: cur, to: target, t0: now, t1: now + Math.max(0.02, dur) };
  }

  tick(now: number, horizon: number): void {
    if (this.disposed) return;
    runStreams(this.streams, now, horizon);
  }

  setGain(gain: number, dur = 0.8): void {
    if (this.disposed) return;
    this.applyFade(gain, dur);
  }

  fadeOut(dur: number): void {
    if (this.disposed) return;
    this.stopping = true;
    this.applyFade(0, dur);
  }

  revive(gain: number, dur: number): void {
    if (this.disposed) return;
    this.stopping = false;
    this.applyFade(gain, dur);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.streams.length = 0;
    this.bed.stopAll(this.ctx.currentTime + 0.05);
    this.bed.disconnectAll();
    this.dry.disconnect();
    for (const g of this.wets.values()) g.disconnect();
    this.wets.clear();
  }
}
