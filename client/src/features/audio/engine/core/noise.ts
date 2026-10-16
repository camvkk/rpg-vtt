import { normalizeRms } from './dsp.ts';

export type NoiseKind = 'white' | 'pink' | 'brown';

/** Different lengths so that layered loops never line up. */
const SECONDS: Record<NoiseKind, number> = { white: 4.7, pink: 7.3, brown: 9.1 };
/** All noise buffers share the same RMS so level design is consistent across kinds. */
const TARGET_RMS = 0.2;
const SEAM_SECONDS = 0.06;

/** Lazily generated, cached, seamlessly looping stereo noise buffers (one set per AudioContext). */
export class NoiseBank {
  private readonly ctx: BaseAudioContext;
  private readonly cache = new Map<NoiseKind, AudioBuffer>();

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
  }

  get(kind: NoiseKind): AudioBuffer {
    let buf = this.cache.get(kind);
    if (!buf) {
      buf = makeNoise(this.ctx, kind);
      this.cache.set(kind, buf);
    }
    return buf;
  }
}

function generate(kind: NoiseKind, length: number): Float32Array {
  const d = new Float32Array(length);
  if (kind === 'white') {
    for (let i = 0; i < length; i++) d[i] = Math.random() * 2 - 1;
  } else if (kind === 'pink') {
    // Paul Kellet's refined pink filter.
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
      b6 = w * 0.115926;
    }
  } else {
    // Leaky integrator ("brown"/red noise).
    let last = 0;
    for (let i = 0; i < length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = last;
    }
  }
  return d;
}

export function makeNoise(ctx: BaseAudioContext, kind: NoiseKind): AudioBuffer {
  const sr = ctx.sampleRate;
  const n = Math.floor(SECONDS[kind] * sr);
  const seam = Math.floor(SEAM_SECONDS * sr);
  const buffer = ctx.createBuffer(2, n, sr);
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < 2; ch++) {
    const raw = generate(kind, n + seam);
    const out = buffer.getChannelData(ch);
    for (let i = seam; i < n; i++) out[i] = raw[i]!;
    // Equal-power crossfade of the head with the continuation past the end → seamless loop.
    for (let i = 0; i < seam; i++) {
      const x = i / seam;
      out[i] = raw[i]! * Math.sqrt(x) + raw[n + i]! * Math.sqrt(1 - x);
    }
    let mean = 0;
    for (let i = 0; i < n; i++) mean += out[i]!;
    mean /= n;
    for (let i = 0; i < n; i++) out[i] = out[i]! - mean;
    channels.push(out);
  }
  normalizeRms(channels, TARGET_RMS);
  return buffer;
}
