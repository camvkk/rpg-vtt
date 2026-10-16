/**
 * Procedural dice sounds (WebAudio, no audio files): short filtered noise bursts
 * with a tiny resonant "tick" for die/die hits and a soft low thump for the table.
 */
export type ClackTarget = 'die' | 'floor' | 'wall';

type AudioCtor = typeof AudioContext;

export class DiceAudio {
  enabled = true;
  #ctx: AudioContext | null = null;
  #out: AudioNode | null = null;
  #noise: AudioBuffer | null = null;
  #lastAt = 0;
  #unlockBound = false;
  #unlock = (): void => {
    const ctx = this.#ctx;
    if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    this.#removeUnlock();
  };

  /** Create / resume the context. Call right before a roll starts. */
  prepare(): void {
    if (!this.enabled || typeof window === 'undefined') return;
    if (!this.#ctx) {
      const Ctor: AudioCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
      if (!Ctor) return;
      try {
        const ctx = new Ctor({ latencyHint: 'interactive' });
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 8;
        comp.ratio.value = 6;
        comp.attack.value = 0.002;
        comp.release.value = 0.12;
        const master = ctx.createGain();
        master.gain.value = 0.7;
        master.connect(comp);
        comp.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.6);
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.#ctx = ctx;
        this.#out = master;
        this.#noise = buf;
      } catch {
        return;
      }
    }
    const ctx = this.#ctx;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => undefined);
      if (!this.#unlockBound) {
        // Autoplay policy: resume on the next user gesture.
        this.#unlockBound = true;
        window.addEventListener('pointerdown', this.#unlock, true);
        window.addEventListener('keydown', this.#unlock, true);
      }
    }
  }

  #removeUnlock(): void {
    if (!this.#unlockBound) return;
    this.#unlockBound = false;
    window.removeEventListener('pointerdown', this.#unlock, true);
    window.removeEventListener('keydown', this.#unlock, true);
  }

  /**
   * @param speed impact speed along the contact normal (world units / s)
   * @param pan   stereo position, -1 (left) .. 1 (right)
   */
  clack(speed: number, target: ClackTarget, pan: number): void {
    const ctx = this.#ctx;
    const out = this.#out;
    const noise = this.#noise;
    if (!this.enabled || !ctx || !out || !noise || ctx.state !== 'running') return;
    const k = Math.min(1, Math.max(0, (speed - 1.2) / 16));
    if (k <= 0.02) return;
    const now = ctx.currentTime;
    // Global throttle: at most one voice every 22 ms (quieter hits are dropped first).
    if (now - this.#lastAt < 0.022 && k < 0.6) return;
    if (now - this.#lastAt < 0.008) return;
    this.#lastAt = now;

    const isDie = target === 'die';
    const dur = isDie ? 0.045 + Math.random() * 0.035 : 0.06 + Math.random() * 0.05;
    const peak = (isDie ? 0.5 : 0.34) * (0.12 + 0.88 * k);

    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.4;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = isDie
      ? 2400 + Math.random() * 2200 + 1400 * k
      : target === 'wall'
        ? 900 + Math.random() * 700
        : 1200 + Math.random() * 900 + 700 * k;
    bp.Q.value = isDie ? 3.5 + Math.random() * 4 : 1.4 + Math.random() * 1.4;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 280;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.0025);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(bp);
    bp.connect(hp);
    hp.connect(g);
    g.connect(p);
    p.connect(out);
    src.start(now, Math.random() * (noise.duration - dur - 0.02), dur + 0.02);

    // Resonant body: a bright tick for die/die, a soft thump for the table.
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const og = ctx.createGain();
    const oDur = isDie ? 0.03 + Math.random() * 0.02 : 0.05;
    const f0 = isDie ? 1700 + Math.random() * 1600 : 130 + Math.random() * 90;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f0 * (isDie ? 0.92 : 0.6), now + oDur);
    og.gain.setValueAtTime(0.0001, now);
    og.gain.exponentialRampToValueAtTime(peak * (isDie ? 0.28 : 0.55 * k), now + 0.002);
    og.gain.exponentialRampToValueAtTime(0.0001, now + oDur);
    osc.connect(og);
    og.connect(p);
    osc.start(now);
    osc.stop(now + oDur + 0.01);

    let live = 2;
    const release = (): void => {
      if (--live > 0) return;
      for (const node of [src, bp, hp, g, osc, og, p]) node.disconnect();
    };
    src.onended = release;
    osc.onended = release;
  }

  dispose(): void {
    this.#removeUnlock();
    const ctx = this.#ctx;
    this.#ctx = null;
    this.#out = null;
    this.#noise = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }
}
