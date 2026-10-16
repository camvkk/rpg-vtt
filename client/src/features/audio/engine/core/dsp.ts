/**
 * Plain-JS DSP helpers used when pre-rendering textures/impulses into AudioBuffers
 * (runs once per buffer, never in the audio callback).
 */

export type JsFilterType = 'lowpass' | 'highpass' | 'bandpass';

/** RBJ biquad, direct form I. */
export class BiquadJS {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(type: JsFilterType, sampleRate: number, freq: number, q = Math.SQRT1_2) {
    const w0 = (2 * Math.PI * Math.min(freq, sampleRate * 0.45)) / sampleRate;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
    } else if (type === 'highpass') {
      b0 = (1 + cos) / 2;
      b1 = -(1 + cos);
      b2 = (1 + cos) / 2;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  /**
   * Filters a looping buffer in place. The filter is first primed with the buffer tail so
   * the output is continuous across the loop seam.
   */
  processLoop(data: Float32Array): void {
    const n = data.length;
    const prime = Math.min(n, 4096);
    for (let i = n - prime; i < n; i++) this.process(data[i]!);
    for (let i = 0; i < n; i++) data[i] = this.process(data[i]!);
  }
}

/** tanh soft-clip transfer curve for WaveShaperNode. */
export function softClipCurve(drive: number, size = 1024): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(size);
  const norm = Math.tanh(drive);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

export function rmsOf(channels: readonly Float32Array[]): number {
  let sum = 0;
  let count = 0;
  for (const d of channels) {
    for (let i = 0; i < d.length; i++) sum += d[i]! * d[i]!;
    count += d.length;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

export function normalizeRms(channels: readonly Float32Array[], target: number): void {
  const rms = rmsOf(channels);
  if (rms <= 0) return;
  const k = target / rms;
  for (const d of channels) for (let i = 0; i < d.length; i++) d[i] = d[i]! * k;
}

export function normalizePeak(channels: readonly Float32Array[], target: number): void {
  let peak = 0;
  for (const d of channels) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]!));
  if (peak <= 0) return;
  const k = target / peak;
  for (const d of channels) for (let i = 0; i < d.length; i++) d[i] = d[i]! * k;
}

/** Soft limiter on raw sample data (keeps rare spikes of dense textures under control). */
export function softLimit(channels: readonly Float32Array[], ceiling: number): void {
  for (const d of channels) {
    for (let i = 0; i < d.length; i++) d[i] = ceiling * Math.tanh(d[i]! / ceiling);
  }
}
