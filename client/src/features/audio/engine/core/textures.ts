/**
 * Pre-rendered, seamlessly looping "texture" buffers for dense micro-events
 * (fire crackle, rain ticks, leaf rustle, bubbling…). Rendering thousands of tiny
 * grains in JS once is far cheaper than scheduling thousands of AudioNodes at runtime.
 * Inner loops use recurrences (no per-sample exp/sin) to keep generation in the tens of ms.
 */
import { BiquadJS, normalizeRms, softLimit } from './dsp.ts';
import { chance, clamp, expRand, logRand, rand, randInt } from './random.ts';

export class TextureBank {
  private readonly ctx: BaseAudioContext;
  private readonly cache = new Map<string, AudioBuffer>();

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  get(key: string, make: (ctx: BaseAudioContext) => AudioBuffer): AudioBuffer {
    let buf = this.cache.get(key);
    if (!buf) {
      buf = make(this.ctx);
      this.cache.set(key, buf);
    }
    return buf;
  }
}

interface Canvas {
  buffer: AudioBuffer;
  channels: Float32Array[];
  n: number;
  sr: number;
}

/** Textures that are band-limited anyway are rendered at a lower rate (resampled on playback). */
function canvas(ctx: BaseAudioContext, seconds: number, maxRate = Infinity): Canvas {
  const sr = Math.min(ctx.sampleRate, maxRate);
  const n = Math.floor(seconds * sr);
  const buffer = ctx.createBuffer(2, n, sr);
  return { buffer, channels: [buffer.getChannelData(0), buffer.getChannelData(1)], n, sr };
}

/** Adds a grain at sample `pos` with equal-power pan; wraps around the end (seamless loop). */
function stamp(c: Canvas, pos: number, pan: number, len: number, gen: () => number): void {
  const angle = ((clamp(pan, -1, 1) + 1) * Math.PI) / 4;
  const gl = Math.cos(angle);
  const gr = Math.sin(angle);
  const left = c.channels[0]!;
  const right = c.channels[1]!;
  let k = ((Math.floor(pos) % c.n) + c.n) % c.n;
  for (let i = 0; i < len; i++) {
    const s = gen();
    left[k] = left[k]! + s * gl;
    right[k] = right[k]! + s * gr;
    if (++k >= c.n) k = 0;
  }
}

/** Exponentially decaying sinusoid via a two-pole resonator recurrence. */
function resonator(amp: number, freq: number, tau: number, sr: number, phase: number): () => number {
  const w = (2 * Math.PI * freq) / sr;
  const r = Math.exp(-1 / tau);
  const c1 = 2 * r * Math.cos(w);
  const c2 = -r * r;
  let y2 = amp * Math.sin(phase - w) / r;
  let y1 = amp * Math.sin(phase);
  let first = true;
  return () => {
    if (first) {
      first = false;
      return y1;
    }
    const y = c1 * y1 + c2 * y2;
    y2 = y1;
    y1 = y;
    return y;
  };
}

function finish(c: Canvas, rms: number): AudioBuffer {
  normalizeRms(c.channels, rms);
  softLimit(c.channels, 0.95);
  return c.buffer;
}

/** Fire crackle: sharp micro-clicks (often clustered) plus occasional resonant pops. */
export function crackleTexture(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 8.3;
  const c = canvas(ctx, seconds);
  const sr = c.sr;
  let t = 0;
  while (t < seconds) {
    t += expRand(1 / 20);
    const cluster = chance(0.28) ? randInt(2, 7) : 1;
    let ct = t;
    for (let k = 0; k < cluster; k++) {
      const len = Math.max(8, Math.floor(rand(0.0004, 0.0028) * sr));
      const amp = Math.min(1, 0.06 + expRand(0.14)) * (k === 0 ? 1 : rand(0.3, 0.9));
      const decay = Math.exp(-3.5 / len);
      const bright = rand(0.2, 1);
      let prev = 0;
      let e = amp;
      stamp(c, ct * sr, rand(-0.8, 0.8), len, () => {
        const w = Math.random() * 2 - 1;
        const y = (w - prev * bright) * e;
        prev = w;
        e *= decay;
        return y;
      });
      ct += rand(0.002, 0.035);
    }
  }
  t = 0;
  while (t < seconds) {
    t += expRand(1.4);
    const len = Math.floor(rand(0.008, 0.03) * sr);
    const amp = rand(0.35, 1);
    const ring = resonator(0.45 * amp, rand(250, 1200), len / 4, sr, Math.random() * Math.PI);
    const dN = Math.exp(-7 / len);
    let eN = amp * 1.6;
    let lp = 0;
    stamp(c, t * sr, rand(-0.6, 0.6), len, () => {
      lp += (Math.random() * 2 - 1 - lp) * 0.4;
      const y = lp * eN + ring();
      eN *= dN;
      return y;
    });
  }
  return finish(c, 0.08);
}

/** Rain on surfaces: dense tiny resonant ticks plus some bigger, lower drops. */
export function rainTexture(ctx: BaseAudioContext): AudioBuffer {
  const seconds = 9.1;
  const c = canvas(ctx, seconds);
  const sr = c.sr;
  let t = 0;
  while (t < seconds) {
    t += expRand(1 / 160);
    const tau = rand(0.0005, 0.0018) * sr;
    stamp(c, t * sr, rand(-1, 1), Math.floor(tau * 6), resonator(0.04 + expRand(0.1), logRand(1800, 9000), tau, sr, Math.random() * Math.PI * 2));
  }
  t = 0;
  while (t < seconds) {
    t += expRand(1 / 14);
    const f0 = logRand(600, 2600);
    const len = Math.floor(rand(0.006, 0.02) * sr);
    const d = Math.exp(-3.5 / len);
    const amp = rand(0.12, 0.45);
    const rise = rand(0.4, 1.2);
    const att = 0.0006 * sr;
    let e = amp;
    let phase = 0;
    let i = 0;
    stamp(c, t * sr, rand(-1, 1), len, () => {
      phase += (2 * Math.PI * f0 * (1 + (rise * i) / len)) / sr;
      const y = Math.min(1, i / att) * Math.sin(phase) * e;
      e *= d;
      i++;
      return y;
    });
  }
  return finish(c, 0.12);
}

/**
 * Granular noise: white noise amplitude-modulated by a dense cloud of short grains,
 * then band-limited. Sounds like leaves, sand, sleet or foam depending on band/density.
 */
export function rustleTexture(ctx: BaseAudioContext, lo: number, hi: number, grainsPerSec: number, seconds = 7.7): AudioBuffer {
  const c = canvas(ctx, seconds, hi > 11000 ? 32000 : 24000);
  const sr = c.sr;
  for (let ch = 0; ch < 2; ch++) {
    const env = new Float32Array(c.n);
    let t = 0;
    // Density itself breathes a little so the texture has "swishes".
    const swPeriod = rand(1.3, 2.7);
    const swPhase = Math.random() * Math.PI * 2;
    const att = Math.max(1, Math.floor(0.0006 * sr));
    while (t < seconds) {
      const density = grainsPerSec * (0.55 + 0.45 * Math.sin(swPhase + (2 * Math.PI * t) / swPeriod) ** 2);
      t += expRand(1 / Math.max(1, density));
      const len = Math.floor(rand(0.002, 0.014) * sr);
      const d = Math.exp(-3 / len);
      let e = 0.2 + expRand(0.4);
      let k = Math.floor(t * sr) % c.n;
      for (let i = 0; i < len; i++) {
        env[k] = env[k]! + (i < att ? (e * i) / att : e);
        e *= d;
        if (++k >= c.n) k = 0;
      }
    }
    const out = c.channels[ch]!;
    for (let i = 0; i < c.n; i++) out[i] = (Math.random() * 2 - 1) * env[i]!;
    new BiquadJS('highpass', sr, lo, 0.7).processLoop(out);
    new BiquadJS('lowpass', sr, Math.min(hi, sr * 0.45), 0.7).processLoop(out);
  }
  return finish(c, 0.12);
}

/** Bubbles: short sine "bloops" with rising pitch (Minnaert resonance of collapsing bubbles). */
export function bubbleTexture(ctx: BaseAudioContext, perSec: number, fLo: number, fHi: number, seconds = 8.9): AudioBuffer {
  const c = canvas(ctx, seconds, 24000);
  const sr = c.sr;
  let t = 0;
  while (t < seconds) {
    t += expRand(1 / perSec);
    const f0 = logRand(fLo, fHi);
    const len = Math.floor(clamp(rand(10, 24) / f0, 0.008, 0.16) * sr);
    const d = Math.exp(-3 / len);
    const rise = rand(0.3, 1.1);
    const att = Math.max(1, Math.floor(0.0015 * sr));
    let e = 0.15 + expRand(0.3);
    let phase = 0;
    let i = 0;
    stamp(c, t * sr, rand(-0.9, 0.9), len, () => {
      phase += (2 * Math.PI * f0 * (1 + (rise * i) / len)) / sr;
      const y = Math.min(1, i / att) * Math.sin(phase) * e;
      e *= d;
      i++;
      return y;
    });
  }
  return finish(c, 0.1);
}

/**
 * Mono amplitude envelope (0..1) for one cricket: `pulses` Hann-shaped pulses, then silence,
 * looping every `period` seconds. Fed into a GainNode's gain param (audio-rate AM).
 */
export function pulseEnvelope(ctx: BaseAudioContext, period: number, pulses: number, pulseLen: number, pulseGap: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.max(1, Math.floor(period * sr));
  const buffer = ctx.createBuffer(1, n, sr);
  const d = buffer.getChannelData(0);
  const len = Math.floor(pulseLen * sr);
  for (let p = 0; p < pulses; p++) {
    const start = Math.floor(p * (pulseLen + pulseGap) * sr);
    const amp = 1 - p * 0.08;
    for (let i = 0; i < len && start + i < n; i++) {
      d[start + i] = amp * 0.5 * (1 - Math.cos((2 * Math.PI * i) / len));
    }
  }
  return buffer;
}
