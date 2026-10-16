/**
 * Voice: a tiny node-graph builder that tracks every node it creates so the whole
 * sub-graph can be torn down automatically when its last source ends (one-shots) or
 * explicitly (continuous ambience beds).
 *
 * All nodes are created with constructor options (never `param.value = x`), so no
 * automation events are inserted at `currentTime` — this keeps later
 * `setValueCurveAtTime` calls from colliding with implicit events.
 */
import type { NoiseBank, NoiseKind } from './noise.ts';
import type { ReverbKind } from './reverb.ts';
import type { TextureBank } from './textures.ts';
import { rand } from './random.ts';

export interface SynthEnv {
  readonly ctx: BaseAudioContext;
  readonly noise: NoiseBank;
  readonly textures: TextureBank;
  /** Dry destination. */
  readonly out: AudioNode;
  /** Reverb send input of the given kind. */
  reverb(kind: ReverbKind): AudioNode;
}

export interface OutOptions {
  pan?: number;
  /** Reverb send amount (0 = none). */
  wet?: number;
  reverb?: ReverbKind;
  /** Pre-split level. */
  level?: number;
  /** Dry amount (default 1). */
  dry?: number;
}

/** Same env with a different dry destination. */
export function withOut(env: SynthEnv, out: AudioNode): SynthEnv {
  return { ctx: env.ctx, noise: env.noise, textures: env.textures, out, reverb: (k) => env.reverb(k) };
}

export class Voice {
  readonly env: SynthEnv;
  readonly ctx: BaseAudioContext;
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioScheduledSourceNode[] = [];
  private last: AudioScheduledSourceNode | null = null;
  private lastStop = -Infinity;

  constructor(env: SynthEnv) {
    this.env = env;
    this.ctx = env.ctx;
  }

  add<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  private source<T extends AudioScheduledSourceNode>(src: T, start: number, stop?: number, offset?: number): T {
    if (offset !== undefined && src instanceof AudioBufferSourceNode) src.start(start, offset);
    else src.start(start);
    if (stop !== undefined) {
      src.stop(stop);
      if (stop > this.lastStop) {
        this.lastStop = stop;
        this.last = src;
      }
    }
    this.sources.push(src);
    return this.add(src);
  }

  gain(value = 1): GainNode {
    return this.add(new GainNode(this.ctx, { gain: value }));
  }

  filter(type: BiquadFilterType, frequency: number, Q = Math.SQRT1_2, gain = 0): BiquadFilterNode {
    return this.add(new BiquadFilterNode(this.ctx, { type, frequency, Q, gain }));
  }

  pan(pan: number): StereoPannerNode {
    return this.add(new StereoPannerNode(this.ctx, { pan: Math.max(-1, Math.min(1, pan)) }));
  }

  shaper(curve: Float32Array<ArrayBuffer>, oversample: OverSampleType = '2x'): WaveShaperNode {
    return this.add(new WaveShaperNode(this.ctx, { curve, oversample }));
  }

  delay(delayTime: number, maxDelayTime = 2): DelayNode {
    return this.add(new DelayNode(this.ctx, { delayTime, maxDelayTime }));
  }

  osc(shape: OscillatorType | PeriodicWave, frequency: number, start: number, stop?: number, detune = 0): OscillatorNode {
    const node =
      shape instanceof PeriodicWave
        ? new OscillatorNode(this.ctx, { periodicWave: shape, frequency, detune })
        : new OscillatorNode(this.ctx, { type: shape, frequency, detune });
    return this.source(node, start, stop);
  }

  /** Looping noise from the shared bank, starting at a random offset. */
  noise(kind: NoiseKind, start: number, stop?: number, rate = 1): AudioBufferSourceNode {
    const buffer = this.env.noise.get(kind);
    const node = new AudioBufferSourceNode(this.ctx, { buffer, loop: true, playbackRate: rate });
    return this.source(node, start, stop, rand(0, buffer.duration * 0.98));
  }

  buffer(
    buffer: AudioBuffer,
    start: number,
    stop?: number,
    opts: { loop?: boolean; rate?: number; offset?: number } = {},
  ): AudioBufferSourceNode {
    const node = new AudioBufferSourceNode(this.ctx, { buffer, loop: opts.loop ?? false, playbackRate: opts.rate ?? 1 });
    return this.source(node, start, stop, opts.offset ?? 0);
  }

  /** Silent source that keeps the voice alive (e.g. for delay/feedback tails) until `until`. */
  keepAlive(start: number, until: number): void {
    this.source(new ConstantSourceNode(this.ctx, { offset: 0 }), start, until);
  }

  /** Connects nodes in series; returns the last one. */
  chain(...nodes: AudioNode[]): AudioNode {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i]!.connect(nodes[i + 1]!);
    return nodes[nodes.length - 1]!;
  }

  /** Routes `node` to the env's dry output (optionally panned) and a reverb send. */
  out(node: AudioNode, o: OutOptions = {}): void {
    let src: AudioNode = node;
    if (o.level !== undefined && o.level !== 1) {
      const g = this.gain(o.level);
      src.connect(g);
      src = g;
    }
    if (o.pan) {
      const p = this.pan(o.pan);
      src.connect(p);
      src = p;
    }
    const dry = o.dry ?? 1;
    if (dry > 0) {
      if (dry !== 1) {
        const g = this.gain(dry);
        src.connect(g);
        g.connect(this.env.out);
      } else {
        src.connect(this.env.out);
      }
    }
    if (o.wet && o.wet > 0) {
      const w = this.gain(o.wet);
      src.connect(w);
      w.connect(this.env.reverb(o.reverb ?? 'room'));
    }
  }

  /** One-shot voices: disconnect the whole sub-graph once the last source has ended. */
  done(): void {
    const last = this.last;
    if (!last) return;
    const nodes = this.nodes;
    last.onended = () => {
      for (const n of nodes) {
        try {
          n.disconnect();
        } catch {
          /* already disconnected */
        }
      }
      nodes.length = 0;
    };
  }

  /** Continuous voices: stop every source. */
  stopAll(when: number): void {
    for (const s of this.sources) {
      try {
        s.stop(when);
      } catch {
        /* already stopped */
      }
    }
  }

  disconnectAll(): void {
    for (const n of this.nodes) {
      try {
        n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes.length = 0;
    this.sources.length = 0;
  }
}

// ───────────────────────────── Envelope helpers ─────────────────────────────

/** 0 → peak (linear, `attack`) → exponential decay to −80 dB over `decay`. Returns end time. */
export function perc(p: AudioParam, t: number, peak: number, attack: number, decay: number): number {
  const a = Math.max(attack, 0.0005);
  const end = t + a + Math.max(decay, 0.005);
  p.setValueAtTime(0, t);
  if (peak <= 0) return end;
  p.linearRampToValueAtTime(peak, t + a);
  p.exponentialRampToValueAtTime(peak * 1e-4, end);
  p.setValueAtTime(0, end + 0.0005);
  return end;
}

/** 0 → peak (attack) → hold → 0 (release), all linear. Returns end time. */
export function ahr(p: AudioParam, t: number, peak: number, attack: number, hold: number, release: number): number {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setValueAtTime(peak, t + attack + hold);
  p.linearRampToValueAtTime(0, t + attack + hold + release);
  return t + attack + hold + release;
}

/** Cosine-interpolated transition from → to, scheduled as a value curve (smooth, click-free). */
export function curveTo(p: AudioParam, from: number, to: number, t: number, dur: number, points = 16): void {
  const arr = new Float32Array(points);
  for (let i = 0; i < points; i++) {
    const x = i / (points - 1);
    arr[i] = from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * x));
  }
  try {
    p.setValueCurveAtTime(arr, t, Math.max(0.01, dur));
  } catch {
    // Overlap with another event (should not happen) → plain ramp if the timeline allows it.
    try {
      p.linearRampToValueAtTime(to, t + dur);
    } catch {
      /* skip this step */
    }
  }
}

/** Arbitrary shaped envelope: `shape(x)` for x∈[0,1] scaled by `scale`. */
export function shapeCurve(p: AudioParam, t: number, dur: number, shape: (x: number) => number, scale = 1, points = 48): void {
  const arr = new Float32Array(points);
  for (let i = 0; i < points; i++) arr[i] = shape(i / (points - 1)) * scale;
  try {
    p.setValueCurveAtTime(arr, t, Math.max(0.01, dur));
  } catch {
    try {
      p.linearRampToValueAtTime(arr[points - 1]!, t + dur);
    } catch {
      /* skip */
    }
  }
}

/** Sine with an arbitrary start phase (OscillatorNode has no phase option). */
export function phasedSine(ctx: BaseAudioContext, phase = Math.random() * Math.PI * 2): PeriodicWave {
  return new PeriodicWave(ctx, { real: [0, Math.sin(phase)], imag: [0, Math.cos(phase)] });
}

/** Harmonic waveform from relative partial amplitudes [h1, h2, …]. */
export function harmonicWave(ctx: BaseAudioContext, partials: readonly number[]): PeriodicWave {
  return new PeriodicWave(ctx, { real: [0, ...partials.map(() => 0)], imag: [0, ...partials] });
}

/** LFO (random phase sine by default) modulating `target` by ±depth. */
export function lfo(v: Voice, target: AudioParam, freq: number, depth: number, start: number, stop?: number): OscillatorNode {
  const o = v.osc(phasedSine(v.ctx), freq, start, stop);
  const g = v.gain(depth);
  o.connect(g);
  g.connect(target);
  return o;
}
