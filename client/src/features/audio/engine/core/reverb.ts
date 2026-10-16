/**
 * Algorithmically generated impulse responses for ConvolverNode reverbs.
 * Exponentially decaying stereo noise with progressive high-frequency damping and a few
 * discrete early reflections.
 */
import { rand } from './random.ts';

export type ReverbKind = 'room' | 'hall' | 'cave' | 'open';

interface ReverbSpec {
  length: number;
  /** RT60-ish decay (s). */
  decay: number;
  preDelay: number;
  /** One-pole lowpass cutoff at the start / end of the tail. */
  hfStart: number;
  hfEnd: number;
  early: number;
  earlySpread: number;
  /** Diffuse onset ramp (s). */
  onset: number;
}

const SPECS: Record<ReverbKind, ReverbSpec> = {
  room: { length: 1.4, decay: 0.95, preDelay: 0.006, hfStart: 9000, hfEnd: 2600, early: 8, earlySpread: 0.035, onset: 0.006 },
  hall: { length: 3.9, decay: 3.0, preDelay: 0.018, hfStart: 7000, hfEnd: 1500, early: 10, earlySpread: 0.07, onset: 0.02 },
  cave: { length: 6.0, decay: 4.8, preDelay: 0.03, hfStart: 6000, hfEnd: 1100, early: 16, earlySpread: 0.16, onset: 0.04 },
  open: { length: 2.6, decay: 1.9, preDelay: 0.035, hfStart: 4500, hfEnd: 1600, early: 4, earlySpread: 0.14, onset: 0.03 },
};

export function makeImpulse(ctx: BaseAudioContext, kind: ReverbKind): AudioBuffer {
  const s = SPECS[kind];
  const sr = ctx.sampleRate;
  const n = Math.floor(s.length * sr);
  const buffer = ctx.createBuffer(2, n, sr);
  const pre = Math.floor(s.preDelay * sr);
  const fadeOut = Math.floor(0.08 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = buffer.getChannelData(ch);
    let y = 0;
    // Envelope/damping coefficients are updated per 32-sample block (cheap, inaudible).
    const block = 32;
    const envStep = Math.exp(-6.9 / (s.decay * sr));
    let env = 1;
    for (let i0 = pre; i0 < n; i0 += block) {
      const tt = (i0 - pre) / sr;
      const fc = s.hfStart * Math.pow(s.hfEnd / s.hfStart, Math.min(1, tt / s.decay));
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      const end = Math.min(n, i0 + block);
      for (let i = i0; i < end; i++) {
        const onset = Math.min(1, (i - pre) / (s.onset * sr));
        y = y * a + (Math.random() * 2 - 1) * (1 - a);
        d[i] = y * env * onset * 2.2;
        env *= envStep;
      }
    }
    // Early reflections (different per channel → width).
    for (let k = 0; k < s.early; k++) {
      const tt = s.preDelay + rand(0.001, s.earlySpread);
      const idx = Math.floor(tt * sr);
      if (idx >= n - 3) continue;
      const amp = rand(0.25, 0.75) * (1 - (tt - s.preDelay) / (s.earlySpread * 2)) * (Math.random() < 0.5 ? -1 : 1);
      d[idx] = d[idx]! + amp;
      d[idx + 1] = d[idx + 1]! + amp * 0.5;
      d[idx + 2] = d[idx + 2]! + amp * 0.2;
    }
    for (let i = 0; i < fadeOut; i++) {
      const k = n - fadeOut + i;
      d[k] = d[k]! * (1 - i / fadeOut);
    }
  }
  return buffer;
}

/** input → highpass → convolver → output → destination. */
export class ReverbBus {
  readonly input: GainNode;
  private readonly hp: BiquadFilterNode;
  private readonly conv: ConvolverNode;
  private readonly output: GainNode;

  constructor(ctx: BaseAudioContext, impulse: AudioBuffer, dest: AudioNode, level = 1) {
    this.input = new GainNode(ctx, { gain: 1 });
    this.hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 110, Q: 0.6 });
    this.conv = new ConvolverNode(ctx, { buffer: impulse });
    this.output = new GainNode(ctx, { gain: level });
    this.input.connect(this.hp);
    this.hp.connect(this.conv);
    this.conv.connect(this.output);
    this.output.connect(dest);
  }

  dispose(): void {
    this.input.disconnect();
    this.hp.disconnect();
    this.conv.disconnect();
    this.output.disconnect();
  }
}
