/**
 * One-shot synthesized sounds shared by ambience events and SFX.
 * Every function schedules a self-cleaning Voice at audio time `t` and returns its
 * approximate duration in seconds.
 */
import type { NoiseKind } from '../core/noise.ts';
import type { ReverbKind } from '../core/reverb.ts';
import type { OutOptions, SynthEnv } from '../core/voice.ts';
import { Voice, harmonicWave, lfo, perc, shapeCurve } from '../core/voice.ts';
import { chance, clamp, logRand, pick, rand, randInt } from '../core/random.ts';
import { rustleTexture } from '../core/textures.ts';

export interface Place {
  level: number;
  pan?: number;
  wet?: number;
  reverb?: ReverbKind;
}

function place(o: Place): OutOptions {
  return { pan: o.pan, wet: o.wet, reverb: o.reverb };
}

/** [time, duration] pairs → overall length. */
function spanOf(notes: readonly (readonly [number, number])[]): number {
  let end = 0;
  for (const [s, d] of notes) end = Math.max(end, s + d);
  return end;
}

// ───────────────────────────── Water ─────────────────────────────

/** Water drop "plink": sine with a fast upward pitch sweep. */
export function drip(env: SynthEnv, t: number, o: Place & { f: number; decay?: number }): number {
  const v = new Voice(env);
  const dec = o.decay ?? rand(0.05, 0.11);
  const osc = v.osc('sine', o.f, t, t + dec + 0.03);
  osc.frequency.setValueAtTime(o.f, t);
  osc.frequency.exponentialRampToValueAtTime(o.f * rand(1.6, 2.5), t + dec * 0.7);
  const g = v.gain(0);
  perc(g.gain, t, o.level, 0.0015, dec);
  osc.connect(g);
  v.out(g, place(o));
  v.done();
  return dec;
}

/** Cluster of mud/swamp bubbles. */
export function bubbleBurst(env: SynthEnv, t: number, o: Place & { n: number; fLo: number; fHi: number }): number {
  let tt = t;
  for (let i = 0; i < o.n; i++) {
    drip(env, tt, {
      f: logRand(o.fLo, o.fHi),
      level: o.level * rand(0.5, 1),
      pan: clamp((o.pan ?? 0) + rand(-0.2, 0.2), -1, 1),
      wet: o.wet,
      reverb: o.reverb,
      decay: rand(0.06, 0.15),
    });
    tt += rand(0.05, 0.3);
  }
  return tt - t + 0.2;
}

/** Ocean wave: slow swell, crash and foamy wash. */
export function wave(env: SynthEnv, t: number, o: Place & { size: number }): number {
  const v = new Voice(env);
  const size = clamp(o.size, 0, 1);
  const rise = rand(1.8, 3) * (0.75 + size * 0.5);
  const wash = rand(3, 5) * (0.7 + size * 0.6);
  const crash = t + rise;
  const end = crash + wash;
  const peak = o.level * (0.55 + 0.45 * size);
  const mix = v.gain(1);

  const src = v.noise('pink', t, end + 0.1, rand(0.85, 1.1));
  const lp = v.filter('lowpass', 220, 0.5);
  lp.frequency.setValueAtTime(220, t);
  lp.frequency.exponentialRampToValueAtTime(800 + 1800 * size, crash);
  lp.frequency.exponentialRampToValueAtTime(300, end);
  const g = v.gain(0);
  shapeCurve(g.gain, t, rise, (x) => x * x * (3 - 2 * x), peak);
  shapeCurve(g.gain, crash, wash, (x) => Math.pow(1 - x, 1.6) * Math.exp(-1.5 * x), peak);
  v.chain(src, lp, g, mix);

  const tex = env.textures.get('foam', (c) => rustleTexture(c, 1400, 9000, 900));
  const foamStart = crash - 0.5;
  const foamPeak = foamStart + 0.8; // exact end of the first curve (avoid float overlap)
  const fz = v.buffer(tex, foamStart, end + 0.1, { loop: true, rate: rand(0.9, 1.1), offset: rand(0, tex.duration * 0.9) });
  const fg = v.gain(0);
  const foam = peak * rand(0.7, 1.1);
  shapeCurve(fg.gain, foamStart, 0.8, (x) => x * x, foam);
  shapeCurve(fg.gain, foamPeak, end - foamPeak, (x) => Math.pow(1 - x, 2), foam);
  v.chain(fz, fg, mix);

  const p0 = o.pan ?? 0;
  const p = v.pan(p0);
  p.pan.setValueAtTime(p0, t);
  p.pan.linearRampToValueAtTime(clamp(p0 + rand(-0.3, 0.3), -1, 1), end);
  mix.connect(p);
  v.out(p, { wet: o.wet, reverb: o.reverb ?? 'open' });
  v.done();
  return end - t;
}

// ───────────────────────────── Weather ─────────────────────────────

/** Thunder: optional tearing crack + sub thump, then a long rolling rumble. */
export function thunder(env: SynthEnv, t: number, o: { intensity: number; distance: number; pan?: number }): number {
  const v = new Voice(env);
  const dist = clamp(o.distance, 0, 1);
  const pan = o.pan ?? rand(-0.6, 0.6);
  const start = t + dist * rand(0.3, 1.5);
  const dur = rand(5, 8) + dist * 4;
  const end = start + dur;
  const peak = o.intensity * (1 - dist * 0.5);
  const mix = v.gain(1);

  const src = v.noise('brown', start, end + 1.5, rand(0.5, 0.75));
  const lp = v.filter('lowpass', 1000, 0.7);
  const top = 1500 - dist * 1100;
  lp.frequency.setValueAtTime(top, start);
  lp.frequency.exponentialRampToValueAtTime(Math.max(60, top * 0.15), end);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, start);
  g.gain.setTargetAtTime(peak, start, 0.04 + dist * 0.3);
  let tt = start + rand(0.3, 0.8);
  let lvl = peak;
  while (tt < end - 3) {
    lvl *= rand(0.55, 0.9);
    g.gain.setTargetAtTime(lvl * rand(0.25, 0.5), tt, rand(0.15, 0.35));
    tt += rand(0.3, 0.9);
    g.gain.setTargetAtTime(lvl, tt, rand(0.08, 0.3));
    tt += rand(0.4, 1.2);
  }
  const rel = Math.max(tt, end - 3);
  g.gain.setTargetAtTime(0, rel, Math.max(0.2, (end - rel) / 4));
  v.chain(src, lp, g, mix);

  if (dist < 0.45) {
    const near = 1 - dist;
    const cn = v.noise('white', start, start + 1.2);
    const hp = v.filter('highpass', 900, 0.6);
    const cg = v.gain(0);
    let ct = start;
    const spikes = randInt(4, 9);
    for (let i = 0; i < spikes; i++) {
      cg.gain.setValueAtTime(0, ct);
      cg.gain.linearRampToValueAtTime(peak * rand(0.2, 0.55) * near, ct + 0.002);
      cg.gain.setTargetAtTime(0, ct + 0.002, rand(0.005, 0.02));
      ct += rand(0.01, 0.035);
    }
    cg.gain.setValueAtTime(0, ct);
    cg.gain.linearRampToValueAtTime(peak * 1.1 * near, ct + 0.003);
    cg.gain.setTargetAtTime(0, ct + 0.003, 0.09);
    v.chain(cn, hp, cg, mix);
    const sub = v.osc('sine', rand(38, 50), start, ct + 2.4);
    const sg = v.gain(0);
    perc(sg.gain, ct, peak * 0.7 * near, 0.03, 2.2);
    v.chain(sub, sg, mix);
  }
  v.out(mix, { pan, wet: 0.3 + dist * 0.35, reverb: 'hall' });
  v.done();
  return end - t + 1.5;
}

/** Generic band-passed noise sweep (swoosh, swish, swirl). */
export function whoosh(
  env: SynthEnv,
  t: number,
  o: Place & { dur: number; from: number; to: number; q?: number; panTo?: number; peakAt?: number; noise?: NoiseKind },
): number {
  const v = new Voice(env);
  const end = t + o.dur;
  const src = v.noise(o.noise ?? 'white', t, end + 0.02);
  const bp = v.filter('bandpass', o.from, o.q ?? 1.5);
  bp.frequency.setValueAtTime(o.from, t);
  bp.frequency.exponentialRampToValueAtTime(o.to, end);
  const g = v.gain(0);
  const pk = clamp(o.peakAt ?? 0.5, 0.05, 0.95);
  shapeCurve(g.gain, t, o.dur, (x) => (x < pk ? Math.pow(x / pk, 2) : Math.pow(1 - (x - pk) / (1 - pk), 1.5)), o.level);
  const p0 = o.pan ?? 0;
  const p = v.pan(p0);
  if (o.panTo !== undefined) {
    p.pan.setValueAtTime(p0, t);
    p.pan.linearRampToValueAtTime(clamp(o.panTo, -1, 1), end);
  }
  v.chain(src, bp, g, p);
  v.out(p, { wet: o.wet, reverb: o.reverb });
  v.done();
  return o.dur;
}

// ───────────────────────────── Fire ─────────────────────────────

/** A log pop / snap. */
export function firePop(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const n = v.noise('white', t, t + 0.15);
  const bp = v.filter('bandpass', rand(700, 2600), rand(1, 2.5));
  const g = v.gain(0);
  perc(g.gain, t, o.level, 0.0006, rand(0.03, 0.08));
  v.chain(n, bp, g, mix);
  const th = v.osc('sine', rand(140, 320), t, t + 0.15);
  const tg = v.gain(0);
  perc(tg.gain, t, o.level * 0.5, 0.002, 0.08);
  v.chain(th, tg, mix);
  v.out(mix, place(o));
  v.done();
  return 0.15;
}

/** Sap boiling out of a log: thin wobbling whistle + hiss. */
export function sapHiss(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const dur = rand(0.6, 2.2);
  const end = t + dur;
  const f = rand(1800, 3600);
  const osc = v.osc('sine', f, t, end + 0.02);
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.linearRampToValueAtTime(f * rand(0.9, 1.15), end);
  lfo(v, osc.frequency, rand(6, 11), rand(20, 70), t, end + 0.02);
  const g = v.gain(0);
  shapeCurve(g.gain, t, dur, (x) => Math.sin(Math.PI * Math.pow(x, 0.6)), o.level * 0.35);
  const n = v.noise('white', t, end + 0.02);
  const bp = v.filter('bandpass', rand(4000, 6500), 1.5);
  const ng = v.gain(0);
  shapeCurve(ng.gain, t, dur, (x) => Math.sin(Math.PI * Math.pow(x, 0.6)), o.level * 1.6);
  const mix = v.gain(1);
  v.chain(osc, g, mix);
  v.chain(n, bp, ng, mix);
  v.out(mix, place(o));
  v.done();
  return dur;
}

// ───────────────────────────── Wood / household ─────────────────────────────

/** Muffled wooden thump (mug set down, chair, door hitting frame). */
export function knock(env: SynthEnv, t: number, o: Place & { f?: number; decay?: number; bright?: number }): number {
  const v = new Voice(env);
  const f = o.f ?? rand(110, 180);
  const dec = o.decay ?? 0.18;
  const mix = v.gain(1);
  const osc = v.osc('sine', f * 1.4, t, t + dec + 0.05);
  osc.frequency.setValueAtTime(f * 1.4, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.03);
  const g = v.gain(0);
  perc(g.gain, t, o.level, 0.0015, dec);
  v.chain(osc, g, mix);
  const n = v.noise('white', t, t + 0.1);
  const lp = v.filter('lowpass', o.bright ?? 900, 0.8);
  const ng = v.gain(0);
  perc(ng.gain, t, o.level * 0.7, 0.0008, 0.04);
  v.chain(n, lp, ng, mix);
  v.out(mix, place(o));
  v.done();
  return dec;
}

/** Wooden creak: jittery stick-slip pulse train exciting a few wood resonances. */
export function creak(env: SynthEnv, t: number, o: Place & { dur: number; from: number; to: number }): number {
  const v = new Voice(env);
  const end = t + o.dur;
  const osc = v.osc('sawtooth', o.from, t, end + 0.05);
  const steps = Math.max(2, Math.ceil(o.dur / 0.03));
  osc.frequency.setValueAtTime(o.from, t);
  for (let i = 1; i <= steps; i++) {
    const x = i / steps;
    osc.frequency.linearRampToValueAtTime(o.from * Math.pow(o.to / o.from, x) * rand(0.86, 1.14), t + x * o.dur);
  }
  const exc = v.gain(1);
  osc.connect(exc);
  const n = v.noise('white', t, end + 0.05);
  const ng = v.gain(0.3);
  v.chain(n, ng, exc);
  const mix = v.gain(1);
  const res: readonly (readonly [number, number, number])[] = [
    [rand(380, 520), 8, 1.8],
    [rand(850, 1100), 11, 1.1],
    [rand(1500, 2100), 14, 0.6],
  ];
  for (const [f, q, a] of res) {
    const bp = v.filter('bandpass', f, q);
    const g = v.gain(a);
    v.chain(exc, bp, g, mix);
  }
  const amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(o.level * 0.6, t + 0.04);
  const segs = Math.max(2, Math.floor(o.dur / 0.05));
  for (let i = 1; i < segs; i++) {
    amp.gain.linearRampToValueAtTime(o.level * rand(0.35, 1), t + (i / segs) * o.dur);
  }
  amp.gain.linearRampToValueAtTime(0, end);
  mix.connect(amp);
  v.out(amp, place(o));
  v.done();
  return o.dur;
}

/** Glass / pewter mug / metal clink (sometimes a two-glass toast). */
export function clink(env: SynthEnv, t: number, o: Place & { kind: 'glass' | 'mug' | 'metal' }): number {
  const v = new Voice(env);
  const spec =
    o.kind === 'glass'
      ? { f: rand(1700, 3200), ratios: [1, 2.32, 4.25, 6.63], amps: [1, 0.45, 0.22, 0.1], decay: rand(0.35, 0.8) }
      : o.kind === 'mug'
        ? { f: rand(800, 1500), ratios: [1, 2.08, 3.3], amps: [1, 0.35, 0.15], decay: rand(0.08, 0.16) }
        : { f: rand(1200, 2600), ratios: [1, 2.71, 4.33, 5.9], amps: [1, 0.6, 0.35, 0.2], decay: rand(0.15, 0.4) };
  const mix = v.gain(1);
  const hits = chance(0.25) ? 2 : 1;
  let tt = t;
  for (let h = 0; h < hits; h++) {
    const detune = h ? rand(1.02, 1.08) : 1;
    const hitAmp = h ? rand(0.6, 0.9) : 1;
    spec.ratios.forEach((r, i) => {
      const f = spec.f * r * detune;
      if (f > 16000) return;
      const dec = spec.decay / (1 + i * 0.6);
      const osc = v.osc('sine', f, tt, tt + dec + 0.05);
      const g = v.gain(0);
      perc(g.gain, tt, ((spec.amps[i] ?? 0.1) * hitAmp) / spec.ratios.length, 0.001, dec);
      v.chain(osc, g, mix);
    });
    const n = v.noise('white', tt, tt + 0.03);
    const nb = v.filter('bandpass', Math.min(spec.f * 2, 9000), 1.5);
    const ng = v.gain(0);
    perc(ng.gain, tt, 0.25 * hitAmp, 0.0005, 0.008);
    v.chain(n, nb, ng, mix);
    tt += rand(0.025, 0.07);
  }
  v.out(mix, { ...place(o), level: o.level });
  v.done();
  return spec.decay + (tt - t);
}

/** Footstep on stone / wood / dirt: heel thud, toe tap, optional scuff. */
export function footstep(env: SynthEnv, t: number, o: Place & { surface: 'stone' | 'wood' | 'dirt' }): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const n = v.noise('white', t, t + 0.3);
  const hl = v.filter('lowpass', o.surface === 'dirt' ? 700 : 1100, 0.7);
  const hg = v.gain(0);
  perc(hg.gain, t, o.level * 0.9, 0.002, 0.07);
  v.chain(n, hl, hg, mix);
  const f = o.surface === 'wood' ? 140 : 95;
  const thud = v.osc('sine', f, t, t + 0.14);
  thud.frequency.setValueAtTime(f, t);
  thud.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.08);
  const tg = v.gain(0);
  perc(tg.gain, t, o.level * 0.6, 0.002, 0.07);
  v.chain(thud, tg, mix);
  const toeT = t + rand(0.06, 0.1);
  const bp = v.filter('bandpass', o.surface === 'dirt' ? 1200 : 1800, 1);
  const toe = v.gain(0);
  perc(toe.gain, toeT, o.level * 0.5, 0.001, 0.035);
  v.chain(n, bp, toe, mix);
  if (o.surface === 'dirt' || chance(0.4)) {
    const hp = v.filter('highpass', 2500, 0.7);
    const sc = v.gain(0);
    sc.gain.setValueAtTime(0, toeT);
    sc.gain.linearRampToValueAtTime(o.level * 0.15, toeT + 0.02);
    sc.gain.linearRampToValueAtTime(0, toeT + 0.12);
    v.chain(n, hp, sc, mix);
  }
  let outNode: AudioNode = mix;
  if (o.surface === 'wood') {
    const pk = v.filter('peaking', 320, 3, 7);
    mix.connect(pk);
    outNode = pk;
  }
  v.out(outNode, place(o));
  v.done();
  return 0.3;
}

/** Page turn: crinkly paper rustle, swish and a soft flap. */
export function pageTurn(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const dur = rand(0.38, 0.5);
  const mix = v.gain(1);
  const n = v.noise('white', t, t + dur + 0.2);
  const bp = v.filter('bandpass', 3500, 0.8);
  const crinkle = v.gain(0);
  crinkle.gain.setValueAtTime(0, t);
  let tt = t;
  while (tt < t + dur) {
    const x = (tt - t) / dur;
    const shape = Math.sin(Math.PI * Math.min(1, x * 1.15));
    crinkle.gain.linearRampToValueAtTime(o.level * shape * rand(0.1, 0.6), tt + 0.004);
    tt += rand(0.008, 0.022);
  }
  crinkle.gain.linearRampToValueAtTime(0, tt + 0.01);
  v.chain(n, bp, crinkle, mix);
  const sw = v.filter('bandpass', 1200, 1.2);
  sw.frequency.setValueAtTime(1200, t);
  sw.frequency.exponentialRampToValueAtTime(4500, t + dur);
  const swg = v.gain(0);
  shapeCurve(swg.gain, t, dur, (x) => Math.sin(Math.PI * x), o.level * 0.6);
  v.chain(n, sw, swg, mix);
  const ft = t + dur;
  const lp = v.filter('lowpass', 900, 0.7);
  const fg = v.gain(0);
  perc(fg.gain, ft, o.level * 0.5, 0.002, 0.07);
  v.chain(n, lp, fg, mix);
  const p = v.pan(o.pan ?? 0);
  p.pan.setValueAtTime(clamp((o.pan ?? 0) - 0.3, -1, 1), t);
  p.pan.linearRampToValueAtTime(clamp((o.pan ?? 0) + 0.3, -1, 1), ft);
  mix.connect(p);
  v.out(p, { wet: o.wet, reverb: o.reverb });
  v.done();
  return dur + 0.2;
}

// ───────────────────────────── Metal ─────────────────────────────

export interface RingOptions extends Place {
  f: number;
  ratios: readonly number[];
  amps: readonly number[];
  decay: number;
  /** Strike transient amount. */
  noise?: number;
  noiseFreq?: number;
  lowpass?: number;
  /** Detune (cents) between the twin oscillators of each partial → shimmer/beating. */
  detune?: number;
}

/** Inharmonic metallic ring (swords, shields, anvils, clashes). */
export function metalRing(env: SynthEnv, t: number, o: RingOptions): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const det = o.detune ?? 4;
  o.ratios.forEach((r, i) => {
    const f = o.f * r;
    if (f > 15000) return;
    const dec = o.decay / (1 + i * 0.45);
    const a = (o.amps[i] ?? 0.2) * o.level * 0.18;
    for (const d of [-1, 1]) {
      const osc = v.osc('sine', f, t, t + dec + 0.05, d * det);
      const g = v.gain(0);
      perc(g.gain, t, a, 0.0006, dec);
      v.chain(osc, g, mix);
    }
  });
  if (o.noise) {
    const n = v.noise('white', t, t + 0.12);
    const bp = v.filter('bandpass', o.noiseFreq ?? 3000, 0.8);
    const ng = v.gain(0);
    perc(ng.gain, t, o.noise * o.level, 0.0004, 0.05);
    v.chain(n, bp, ng, mix);
  }
  let node: AudioNode = mix;
  if (o.lowpass) {
    const lp = v.filter('lowpass', o.lowpass, 0.7);
    mix.connect(lp);
    node = lp;
  }
  v.out(node, place(o));
  v.done();
  return o.decay;
}

export function clash(env: SynthEnv, t: number, o: Place & { lowpass?: number }): number {
  return metalRing(env, t, {
    ...o,
    f: rand(800, 1700),
    ratios: [1, 2.42, 3.71, 5.12],
    amps: [1, 0.7, 0.5, 0.3],
    decay: rand(0.25, 0.6),
    noise: 0.8,
    noiseFreq: rand(2500, 4000),
    lowpass: o.lowpass ?? 4500,
  });
}

/** A chain rattling: a cluster of small metallic clinks. */
export function chains(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(5, 14);
  const span = rand(0.4, 1.2);
  const mix = v.gain(1);
  let end = t;
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(Math.random(), 1.4) * span;
    const f = rand(1400, 3800);
    const dec = rand(0.04, 0.14);
    const a = o.level * rand(0.3, 1);
    const parts: readonly (readonly [number, number])[] = [
      [1, 1],
      [2.7, 0.5],
    ];
    for (const [r, amp] of parts) {
      const osc = v.osc('sine', f * r, tt, tt + dec + 0.02);
      const g = v.gain(0);
      perc(g.gain, tt, a * amp * 0.4, 0.0005, r > 1 ? dec / 1.8 : dec);
      v.chain(osc, g, mix);
    }
    end = Math.max(end, tt + dec);
  }
  const lp = v.filter('lowpass', 5000, 0.7);
  mix.connect(lp);
  v.out(lp, place(o));
  v.done();
  return end - t;
}

/** Distant metal scrape / groan: noise through drifting high-Q inharmonic resonances. */
export function metalScrape(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const dur = rand(1.2, 3);
  const end = t + dur;
  const src = v.noise('white', t, end + 0.05);
  const base = rand(380, 900);
  const mix = v.gain(1);
  const parts: readonly (readonly [number, number, number])[] = [
    [1, 30, 1],
    [1.53, 40, 0.7],
    [2.31, 45, 0.5],
  ];
  for (const [r, q, a] of parts) {
    const bp = v.filter('bandpass', base * r, q);
    bp.frequency.setValueAtTime(base * r, t);
    bp.frequency.linearRampToValueAtTime(base * r * rand(0.88, 1.12), end);
    const g = v.gain(a * 9);
    v.chain(src, bp, g, mix);
  }
  const amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  let tt = t;
  while (tt < end - 0.1) {
    tt += rand(0.04, 0.09);
    const x = (tt - t) / dur;
    amp.gain.linearRampToValueAtTime(o.level * Math.pow(Math.sin(Math.PI * clamp(x, 0, 1)), 0.7) * rand(0.4, 1), tt);
  }
  amp.gain.linearRampToValueAtTime(0, end);
  mix.connect(amp);
  v.out(amp, place(o));
  v.done();
  return dur;
}

/** Blacksmith hammering an anvil, a few strikes with occasional bounce taps. */
export function anvil(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const f = rand(600, 820);
  const ratios = [1, 2.39, 3.86, 5.53, 7.01];
  const amps = [1, 0.7, 0.45, 0.3, 0.2];
  const decays = [1.4, 0.9, 0.6, 0.4, 0.25];
  const mix = v.gain(1);
  const strike = (st: number, a: number): void => {
    ratios.forEach((r, i) => {
      const dec = decays[i]! * rand(0.85, 1.1);
      const osc = v.osc('sine', f * r * rand(0.998, 1.002), st, st + dec + 0.05);
      const g = v.gain(0);
      perc(g.gain, st, amps[i]! * a * 0.2, 0.0008, dec);
      v.chain(osc, g, mix);
    });
    const n = v.noise('white', st, st + 0.05);
    const bp = v.filter('bandpass', 3200, 1);
    const ng = v.gain(0);
    perc(ng.gain, st, a * 0.5, 0.0004, 0.02);
    v.chain(n, bp, ng, mix);
  };
  const strikes = randInt(3, 7);
  const iv = rand(0.75, 1.1);
  let tt = t;
  for (let s = 0; s < strikes; s++) {
    const a = rand(0.7, 1);
    strike(tt, a);
    if (chance(0.35)) strike(tt + rand(0.14, 0.2), a * 0.25);
    tt += iv * rand(0.95, 1.05);
  }
  const lp = v.filter('lowpass', 4000, 0.7);
  mix.connect(lp);
  v.out(lp, { ...place(o), level: o.level });
  v.done();
  return tt - t + 1.5;
}

const BELL_PARTIALS: readonly (readonly [number, number, number])[] = [
  [0.5, 0.55, 1],
  [1, 0.9, 0.8],
  [1.183, 0.55, 0.7],
  [1.506, 0.35, 0.5],
  [2, 0.75, 0.55],
  [2.514, 0.3, 0.35],
  [2.662, 0.2, 0.3],
  [3.011, 0.25, 0.25],
  [4.166, 0.15, 0.18],
  [5.433, 0.08, 0.12],
];

/** Church / hand bell strike (classic minor-third bell partials, warbling hum & prime). */
export function bellStrike(env: SynthEnv, t: number, o: Place & { f: number; decay: number; bright?: number }): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const bright = o.bright ?? 1;
  for (const [r, a, d] of BELL_PARTIALS) {
    const f = o.f * r;
    if (f > 14000) continue;
    const amp = a * (r > 2 ? bright : 1) * o.level * 0.22;
    const dec = o.decay * d;
    const g = v.gain(0);
    perc(g.gain, t, amp, 0.001, dec);
    v.osc('sine', f, t, t + dec + 0.05).connect(g);
    if (r <= 1) v.osc('sine', f * rand(1.0015, 1.004), t, t + dec + 0.05).connect(g);
    g.connect(mix);
  }
  const n = v.noise('white', t, t + 0.05);
  const bp = v.filter('bandpass', Math.min(o.f * 3, 9000), 1.2);
  const ng = v.gain(0);
  perc(ng.gain, t, o.level * 0.25 * bright, 0.0005, 0.02);
  v.chain(n, bp, ng, mix);
  v.out(mix, place(o));
  v.done();
  return o.decay;
}

/** Gong: dense inharmonic partials that bloom after a soft mallet strike. */
export function gong(env: SynthEnv, t: number, o: Place & { f: number; decay: number }): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const parts: readonly (readonly [number, number, number, number])[] = [
    [1, 1, 1, 0.004],
    [1.49, 0.6, 0.85, 0.05],
    [2.0, 0.5, 0.7, 0.08],
    [2.45, 0.4, 0.6, 0.15],
    [2.88, 0.35, 0.5, 0.2],
    [3.37, 0.25, 0.45, 0.25],
    [4.2, 0.18, 0.35, 0.3],
    [5.1, 0.12, 0.3, 0.35],
  ];
  for (const [r, a, d, atk] of parts) {
    const f = o.f * r;
    const dec = o.decay * d;
    const osc = v.osc('sine', f, t, t + atk + dec + 0.05);
    osc.frequency.setValueAtTime(f * 1.012, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.995, t + 1.5);
    const g = v.gain(0);
    perc(g.gain, t, o.level * a * 0.3, atk, dec);
    v.chain(osc, g, mix);
  }
  const n = v.noise('brown', t, t + 0.3);
  const lp = v.filter('lowpass', 300, 0.7);
  const ng = v.gain(0);
  perc(ng.gain, t, o.level * 0.8, 0.004, 0.12);
  v.chain(n, lp, ng, mix);
  v.out(mix, place(o));
  v.done();
  return o.decay + 0.4;
}

/** Ghostly tubular chime with slow vibrato and beating twins. */
export function chime(env: SynthEnv, t: number, o: Place & { f: number; decay?: number }): number {
  const v = new Voice(env);
  const dec = o.decay ?? rand(3, 5);
  const mix = v.gain(1);
  const vib = v.osc('sine', rand(3.5, 5.5), t, t + dec + 0.1);
  const vd = v.gain(rand(4, 9));
  vib.connect(vd);
  const parts: readonly (readonly [number, number, number])[] = [
    [1, 1, 1],
    [2.76, 0.45, 0.6],
    [5.4, 0.2, 0.35],
    [8.93, 0.08, 0.2],
  ];
  for (const [r, a, d] of parts) {
    const f = o.f * r;
    if (f > 15000) continue;
    const g = v.gain(0);
    perc(g.gain, t, o.level * a * 0.35, 0.002, dec * d);
    for (const det of [-3, 3]) {
      const osc = v.osc('sine', f, t, t + dec * d + 0.05, det * (r === 1 ? 1 : 0.5));
      vd.connect(osc.detune);
      osc.connect(g);
    }
    g.connect(mix);
  }
  v.out(mix, place(o));
  v.done();
  return dec;
}

/** Bell-ish sine ping with optional FM shimmer (arpeggios, sparkles, chimes). */
export function ping(env: SynthEnv, t: number, o: Place & { f: number; decay: number; fm?: number }): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const car = v.osc('sine', o.f, t, t + o.decay + 0.05);
  if (o.fm) {
    const mod = v.osc('sine', o.f * 3.5, t, t + o.decay + 0.05);
    const mg = v.gain(0);
    perc(mg.gain, t, o.f * o.fm, 0.001, o.decay * 0.4);
    mod.connect(mg);
    mg.connect(car.frequency);
  }
  const g = v.gain(0);
  perc(g.gain, t, o.level, 0.002, o.decay);
  v.chain(car, g, mix);
  if (o.f * 2 < 16000) {
    const oct = v.osc('sine', o.f * 2, t, t + o.decay * 0.5 + 0.05);
    const og = v.gain(0);
    perc(og.gain, t, o.level * 0.22, 0.002, o.decay * 0.45);
    v.chain(oct, og, mix);
  }
  v.out(mix, place(o));
  v.done();
  return o.decay;
}

/** Coin hitting coins. */
export function coinHit(env: SynthEnv, t: number, o: Place & { f: number; decay: number }): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const ratios = [1, 2.22, 3.6, 5.1];
  const amps = [1, 0.6, 0.35, 0.2];
  ratios.forEach((r, i) => {
    const f = o.f * r;
    if (f > 16000) return;
    const dec = o.decay / (1 + i * 0.5);
    const osc = v.osc('sine', f, t, t + dec + 0.03);
    const g = v.gain(0);
    perc(g.gain, t, o.level * amps[i]! * 0.35, 0.0006, dec);
    v.chain(osc, g, mix);
  });
  const n = v.noise('white', t, t + 0.02);
  const hp = v.filter('highpass', 5000, 0.7);
  const ng = v.gain(0);
  perc(ng.gain, t, o.level * 0.3, 0.0003, 0.005);
  v.chain(n, hp, ng, mix);
  v.out(mix, place(o));
  v.done();
  return o.decay;
}

// ───────────────────────────── Music-ish ─────────────────────────────

/** Low war drum / taiko hit with pitch drop and skin slap. */
export function drumHit(env: SynthEnv, t: number, o: Place & { f: number; decay: number }): number {
  const v = new Voice(env);
  const mix = v.gain(1);
  const osc = v.osc('sine', o.f * 2.2, t, t + o.decay + 0.05);
  osc.frequency.setValueAtTime(o.f * 2.2, t);
  osc.frequency.exponentialRampToValueAtTime(o.f, t + 0.035);
  osc.frequency.exponentialRampToValueAtTime(o.f * 0.85, t + o.decay);
  const g = v.gain(0);
  perc(g.gain, t, o.level, 0.002, o.decay);
  v.chain(osc, g, mix);
  const o2 = v.osc('sine', o.f * 1.59, t, t + o.decay * 0.5 + 0.05);
  const g2 = v.gain(0);
  perc(g2.gain, t, o.level * 0.25, 0.002, o.decay * 0.4);
  v.chain(o2, g2, mix);
  const n = v.noise('white', t, t + 0.12);
  const nl = v.filter('lowpass', 1400, 0.7);
  const ng = v.gain(0);
  perc(ng.gain, t, o.level * 0.45, 0.0008, 0.06);
  v.chain(n, nl, ng, mix);
  v.out(mix, place(o));
  v.done();
  return o.decay;
}

/** FM brass note (modulation index follows the envelope → brassy "blat"). */
export function brassNote(env: SynthEnv, t: number, o: Place & { f: number; dur: number; vibrato?: boolean }): number {
  const v = new Voice(env);
  const rel = 0.25;
  const sus = t + Math.max(o.dur, 0.2);
  const stop = sus + rel + 0.05;
  const car = v.osc('sine', o.f, t, stop);
  const mod = v.osc('sine', o.f, t, stop);
  const idx = v.gain(0);
  idx.gain.setValueAtTime(0, t);
  idx.gain.linearRampToValueAtTime(o.f * 3.2, t + 0.05);
  idx.gain.linearRampToValueAtTime(o.f * 2.0, t + 0.18);
  idx.gain.setValueAtTime(o.f * 2.0, sus);
  idx.gain.linearRampToValueAtTime(0, sus + rel);
  mod.connect(idx);
  idx.connect(car.frequency);
  if (o.vibrato) {
    const vib = v.osc('sine', 5.5, t, stop);
    const vd = v.gain(0);
    vd.gain.setValueAtTime(0, t + 0.2);
    vd.gain.linearRampToValueAtTime(o.f * 0.008, t + 0.6);
    vib.connect(vd);
    vd.connect(car.frequency);
  }
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.level, t + 0.035);
  g.gain.linearRampToValueAtTime(o.level * 0.75, t + 0.16);
  g.gain.setValueAtTime(o.level * 0.75, sus);
  g.gain.linearRampToValueAtTime(0, sus + rel);
  const lp = v.filter('lowpass', Math.min(o.f * 8, 5000), 0.7);
  v.chain(car, g, lp);
  v.out(lp, place(o));
  v.done();
  return sus + rel - t;
}

/** Distant war horn call (1–3 notes) with brassy filter bloom. */
export function warHorn(env: SynthEnv, t: number, o: Place & { f: number }): number {
  const v = new Voice(env);
  const calls: readonly (readonly (readonly [number, number])[])[] = [
    [[1, rand(2.4, 3.6)]],
    [
      [1, 1.1],
      [1.5, 2.4],
    ],
    [
      [1, 0.7],
      [1, 0.7],
      [1.335, 2.2],
    ],
    [
      [0.75, 1.0],
      [1, 2.6],
    ],
  ];
  const call = pick(calls);
  const notes: [number, number, number][] = [];
  let tt = t;
  for (const [r, d] of call) {
    notes.push([tt, d, o.f * r]);
    tt += d + 0.12;
  }
  const end = tt;
  const o1 = v.osc('sawtooth', o.f, t, end + 0.1);
  const o2 = v.osc('sawtooth', o.f, t, end + 0.1, 9);
  const sub = v.osc('sine', o.f / 2, t, end + 0.1);
  const lp = v.filter('lowpass', 250, 1.2);
  const g = v.gain(0);
  const sg = v.gain(0.35);
  for (const [s, d, f] of notes) {
    for (const osc of [o1, o2]) {
      osc.frequency.setValueAtTime(f * 0.94, s);
      osc.frequency.exponentialRampToValueAtTime(f, s + 0.15);
    }
    sub.frequency.setValueAtTime(f / 2, s);
    lp.frequency.setValueAtTime(250, s);
    lp.frequency.linearRampToValueAtTime(1600, s + 0.35);
    lp.frequency.linearRampToValueAtTime(1000, s + d);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + 0.25);
    g.gain.setValueAtTime(o.level, s + Math.max(0.26, d - 0.4));
    g.gain.linearRampToValueAtTime(0, s + d);
  }
  lfo(v, o1.frequency, 5, o.f * 0.006, t, end + 0.1);
  lfo(v, o2.frequency, 5.3, o.f * 0.006, t, end + 0.1);
  const mix = v.gain(0.5);
  o1.connect(mix);
  o2.connect(mix);
  sub.connect(sg);
  sg.connect(mix);
  const far = v.filter('lowpass', 2200, 0.7);
  v.chain(mix, lp, g, far);
  v.out(far, place(o));
  v.done();
  return end - t;
}

// ───────────────────────────── Creatures ─────────────────────────────

export type BirdKind = 'chirp' | 'trill' | 'whistle' | 'warble';
export interface Bird {
  kind: BirdKind;
  f: number;
  level: number;
  pan: number;
  wet: number;
}

interface Note {
  s: number;
  d: number;
  f0: number;
  f1: number;
  a: number;
}

/** Synthesized bird phrase (FM chirps, trills, whistles, warbles). */
export function birdCall(env: SynthEnv, t: number, b: Bird): number {
  const notes: Note[] = [];
  let tt = 0;
  if (b.kind === 'chirp') {
    const n = randInt(2, 6);
    const up = chance(0.5);
    for (let i = 0; i < n; i++) {
      const d = rand(0.035, 0.075);
      const f0 = b.f * rand(0.88, 1.05);
      notes.push({ s: tt, d, f0, f1: up ? f0 * rand(1.25, 1.6) : f0 / rand(1.25, 1.6), a: rand(0.7, 1) });
      tt += d + rand(0.05, 0.11);
    }
  } else if (b.kind === 'whistle') {
    const pattern = pick<readonly number[]>([
      [1, 0.84],
      [0.92, 1.0, 0.8],
      [1, 1, 0.84],
      [0.84, 1.06],
    ]);
    for (const r of pattern) {
      const d = rand(0.18, 0.32);
      const f0 = b.f * r;
      notes.push({ s: tt, d, f0: f0 * 1.02, f1: f0 * 0.97, a: 1 });
      tt += d + rand(0.06, 0.14);
    }
  } else if (b.kind === 'warble') {
    const n = randInt(5, 11);
    for (let i = 0; i < n; i++) {
      const d = rand(0.05, 0.13);
      const f0 = b.f * rand(0.75, 1.45);
      notes.push({ s: tt, d, f0, f1: f0 * rand(0.8, 1.25), a: rand(0.6, 1) });
      tt += d + rand(0.015, 0.05);
    }
  } else {
    const d = rand(0.5, 1.2);
    notes.push({ s: 0, d, f0: b.f * 1.06, f1: b.f * 0.9, a: 1 });
    tt = d;
  }
  const v = new Voice(env);
  const end = t + tt + 0.05;
  const osc = v.osc('sine', notes[0]!.f0, t, end);
  const g = v.gain(0);
  for (const n of notes) {
    const s = t + n.s;
    osc.frequency.setValueAtTime(n.f0, s);
    osc.frequency.exponentialRampToValueAtTime(n.f1, s + n.d);
    const atk = Math.min(0.012, n.d * 0.25);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(n.a * b.level, s + atk);
    g.gain.linearRampToValueAtTime(n.a * b.level * 0.6, s + n.d * 0.75);
    g.gain.linearRampToValueAtTime(0, s + n.d);
  }
  if (b.kind === 'trill') lfo(v, osc.frequency, rand(16, 28), b.f * rand(0.08, 0.15), t, end);
  else if (b.kind === 'warble') lfo(v, osc.frequency, rand(35, 60), b.f * 0.03, t, end);
  v.chain(osc, g);
  v.out(g, { pan: b.pan, wet: b.wet, reverb: 'open' });
  v.done();
  return tt;
}

/** Woodpecker drumming: a fast roll of wooden knocks. */
export function woodpecker(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(10, 22);
  const iv = rand(0.045, 0.06);
  const end = t + n * iv + 0.08;
  const src = v.noise('white', t, end);
  const bp = v.filter('bandpass', rand(1100, 1800), 4);
  const g = v.gain(0);
  const tone = v.osc('sine', rand(650, 950), t, end);
  const tg = v.gain(0);
  for (let i = 0; i < n; i++) {
    const tt = t + i * iv;
    const shape = i < 3 ? 0.55 + 0.15 * i : 1 - 0.45 * ((i - 3) / n);
    const a = o.level * shape * rand(0.85, 1);
    perc(g.gain, tt, a, 0.0006, 0.022);
    perc(tg.gain, tt, a * 0.35, 0.0006, 0.018);
  }
  const mix = v.gain(1);
  v.chain(src, bp, g, mix);
  v.chain(tone, tg, mix);
  v.out(mix, place(o));
  v.done();
  return end - t;
}

/** Owl hoots (great-horned or tawny pattern). */
export function owl(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const f = rand(290, 370);
  const pattern: readonly (readonly [number, number])[] = chance(0.5)
    ? [
        [0, 0.3],
        [0.58, 0.1],
        [0.72, 0.32],
        [1.3, 0.28],
        [1.8, 0.34],
      ]
    : [
        [0, 0.55],
        [1.25, 0.12],
        [1.42, 0.12],
        [1.6, 0.7],
      ];
  const dur = spanOf(pattern) + 0.1;
  const end = t + dur;
  const osc = v.osc(harmonicWave(v.ctx, [1, 0.12, 0.05]), f, t, end);
  const br = v.noise('pink', t, end);
  const bbp = v.filter('bandpass', f * 2, 3);
  const bg = v.gain(1.5);
  const src = v.gain(1);
  osc.connect(src);
  v.chain(br, bbp, bg, src);
  const g = v.gain(0);
  for (const [s0, d] of pattern) {
    const s = t + s0;
    osc.frequency.setValueAtTime(f * 1.04, s);
    osc.frequency.exponentialRampToValueAtTime(f * 0.92, s + d);
    const atk = Math.min(0.07, d * 0.35);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + atk);
    g.gain.linearRampToValueAtTime(o.level * 0.7, s + d * 0.7);
    g.gain.linearRampToValueAtTime(0, s + d);
  }
  const lp = v.filter('lowpass', 1300, 0.7);
  v.chain(src, g, lp);
  v.out(lp, place(o));
  v.done();
  return dur;
}

/** Distant wolf howl: rising, sustained with vibrato, falling. */
export function wolfHowl(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const f = rand(330, 430);
  const dur = rand(3.2, 4.6);
  const end = t + dur;
  const osc = v.osc(harmonicWave(v.ctx, [1, 0.3, 0.12, 0.05]), f * 0.8, t, end + 0.05);
  const fr = osc.frequency;
  fr.setValueAtTime(f * 0.8, t);
  fr.exponentialRampToValueAtTime(f * 1.3, t + 0.6);
  fr.linearRampToValueAtTime(f * 1.36, t + dur * 0.55);
  fr.exponentialRampToValueAtTime(f * 1.05, t + dur * 0.85);
  fr.exponentialRampToValueAtTime(f * 0.78, end);
  const vib = v.osc('sine', rand(4.5, 5.8), t, end + 0.05);
  const vd = v.gain(0);
  vd.gain.setValueAtTime(0, t);
  vd.gain.linearRampToValueAtTime(f * 0.012, t + 1.2);
  vib.connect(vd);
  vd.connect(fr);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.level, t + 0.45);
  g.gain.setValueAtTime(o.level, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, end);
  const hp = v.filter('highpass', 220, 0.7);
  const lp = v.filter('lowpass', 1700, 0.7);
  v.chain(osc, hp, lp, g);
  v.out(g, { pan: o.pan, wet: o.wet ?? 0.7, reverb: o.reverb ?? 'open' });
  v.done();
  return dur;
}

/** Cuckoo: "cu-coo" repeated. */
export function cuckoo(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(3, 7);
  const period = rand(0.75, 0.95);
  const f = rand(620, 700);
  const ratio = rand(0.78, 0.84);
  const end = t + n * period + 0.4;
  const osc = v.osc(harmonicWave(v.ctx, [1, 0.08]), f, t, end);
  const g = v.gain(0);
  for (let i = 0; i < n; i++) {
    const s = t + i * period;
    osc.frequency.setValueAtTime(f, s);
    osc.frequency.linearRampToValueAtTime(f * 0.98, s + 0.16);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + 0.03);
    g.gain.linearRampToValueAtTime(0, s + 0.17);
    const s2 = s + 0.24;
    osc.frequency.setValueAtTime(f * ratio, s2);
    osc.frequency.linearRampToValueAtTime(f * ratio * 0.97, s2 + 0.3);
    g.gain.setValueAtTime(0, s2);
    g.gain.linearRampToValueAtTime(o.level * 0.85, s2 + 0.04);
    g.gain.linearRampToValueAtTime(0, s2 + 0.32);
  }
  const lp = v.filter('lowpass', 1600, 0.7);
  v.chain(osc, g, lp);
  v.out(lp, place(o));
  v.done();
  return end - t;
}

/** Crow / raven caws: harsh, rough FM sawtooth through beak formants. */
export function crowCaw(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(2, 4);
  const f = rand(420, 560);
  const notes: [number, number][] = [];
  let tt = t;
  for (let i = 0; i < n; i++) {
    const d = rand(0.2, 0.32);
    notes.push([tt, d]);
    tt += d + rand(0.22, 0.42);
  }
  const end = tt;
  const osc = v.osc('sawtooth', f, t, end);
  lfo(v, osc.frequency, rand(70, 110), f * 0.18, t, end);
  const g = v.gain(0);
  for (const [s, d] of notes) {
    osc.frequency.setValueAtTime(f * 0.95, s);
    osc.frequency.linearRampToValueAtTime(f * 1.08, s + d * 0.3);
    osc.frequency.linearRampToValueAtTime(f * 0.82, s + d);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + 0.02);
    g.gain.linearRampToValueAtTime(o.level * 0.8, s + d - 0.05);
    g.gain.linearRampToValueAtTime(0, s + d);
  }
  const f1 = v.filter('bandpass', 1150, 2.5);
  const f2 = v.filter('bandpass', 1900, 3);
  const mix = v.gain(1.5);
  osc.connect(f1);
  osc.connect(f2);
  f1.connect(mix);
  f2.connect(mix);
  const lp = v.filter('lowpass', 3500, 0.7);
  v.chain(mix, lp, g);
  v.out(g, place(o));
  v.done();
  return end - t;
}

/** Seagull cries ("kyow kyow"). */
export function gull(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(1, 5);
  const f = rand(1100, 1500);
  const calls: [number, number][] = [];
  let tt = t;
  for (let i = 0; i < n; i++) {
    const d = rand(0.22, 0.42);
    calls.push([tt, d]);
    tt += d + rand(0.12, 0.3);
  }
  const end = tt;
  const osc = v.osc('sawtooth', f, t, end);
  lfo(v, osc.frequency, rand(30, 45), f * 0.025, t, end);
  const g = v.gain(0);
  for (const [s, d] of calls) {
    osc.frequency.setValueAtTime(f * 0.9, s);
    osc.frequency.linearRampToValueAtTime(f * 1.25, s + d * 0.25);
    osc.frequency.linearRampToValueAtTime(f * 0.72, s + d);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + 0.03);
    g.gain.linearRampToValueAtTime(o.level * 0.7, s + d * 0.7);
    g.gain.linearRampToValueAtTime(0, s + d);
  }
  const hp = v.filter('highpass', 700, 0.7);
  const bp = v.filter('bandpass', 2000, 1.2);
  const lp = v.filter('lowpass', 3800, 0.7);
  v.chain(osc, hp, bp, lp, g);
  v.out(g, place(o));
  v.done();
  return end - t;
}

/** Hawk / falcon screech, descending. */
export function hawkCry(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const dur = rand(0.9, 1.5);
  const f = rand(2200, 2700);
  const end = t + dur;
  const osc = v.osc('sawtooth', f * 0.85, t, end + 0.02);
  osc.frequency.setValueAtTime(f * 0.85, t);
  osc.frequency.linearRampToValueAtTime(f * 1.12, t + 0.12);
  osc.frequency.exponentialRampToValueAtTime(f * 0.62, end);
  lfo(v, osc.frequency, rand(50, 70), f * 0.03, t, end + 0.02);
  const bp = v.filter('bandpass', 2600, 1.5);
  const lp = v.filter('lowpass', 4500, 0.7);
  const g = v.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.level, t + 0.05);
  g.gain.linearRampToValueAtTime(o.level * 0.7, t + dur * 0.5);
  g.gain.linearRampToValueAtTime(0, end);
  v.chain(osc, bp, lp, g);
  v.out(g, place(o));
  v.done();
  return dur;
}

export type FrogKind = 'bull' | 'tree' | 'peeper';

/** Frog calls: bullfrog "rrum", tree-frog "rib-bit", spring-peeper "peep". */
export function frogCall(env: SynthEnv, t: number, kind: FrogKind, o: Place & { f: number }): number {
  const v = new Voice(env);
  if (kind === 'peeper') {
    const d = rand(0.1, 0.16);
    const osc = v.osc('sine', o.f, t, t + d + 0.02);
    osc.frequency.setValueAtTime(o.f, t);
    osc.frequency.linearRampToValueAtTime(o.f * 1.15, t + d);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.level, t + 0.015);
    g.gain.linearRampToValueAtTime(o.level * 0.6, t + d * 0.6);
    g.gain.linearRampToValueAtTime(0, t + d);
    v.chain(osc, g);
    v.out(g, place(o));
    v.done();
    return d;
  }
  if (kind === 'bull') {
    const d = rand(0.35, 0.75);
    const end = t + d;
    const osc = v.osc('sawtooth', o.f, t, end + 0.05);
    osc.frequency.setValueAtTime(o.f * 1.05, t);
    osc.frequency.linearRampToValueAtTime(o.f * 0.9, end);
    const am = v.gain(0.5);
    lfo(v, am.gain, rand(14, 24), 0.5, t, end + 0.05);
    const bp = v.filter('bandpass', rand(250, 380), 2.5);
    const lp = v.filter('lowpass', 900, 0.7);
    const mk = v.gain(2.2);
    const g = v.gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.level, t + 0.05);
    g.gain.setValueAtTime(o.level, end - 0.1);
    g.gain.linearRampToValueAtTime(0, end);
    v.chain(osc, am, bp, lp, mk, g);
    v.out(g, place(o));
    v.done();
    return d;
  }
  const s1 = rand(0.07, 0.1);
  const gap = rand(0.04, 0.07);
  const s2 = rand(0.08, 0.12);
  const t2 = t + s1 + gap;
  const end = t2 + s2;
  const osc = v.osc('sawtooth', o.f, t, end + 0.02);
  osc.frequency.setValueAtTime(o.f, t);
  osc.frequency.setValueAtTime(o.f * 0.92, t2);
  const am = v.gain(0.5);
  lfo(v, am.gain, rand(55, 85), 0.5, t, end + 0.02);
  const bp = v.filter('bandpass', o.f, 3);
  const mk = v.gain(1.8);
  const g = v.gain(0);
  for (const [s, d] of [
    [t, s1],
    [t2, s2],
  ] as const) {
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + 0.012);
    g.gain.linearRampToValueAtTime(o.level * 0.7, s + d * 0.7);
    g.gain.linearRampToValueAtTime(0, s + d);
  }
  v.chain(osc, am, bp, mk, g);
  v.out(g, place(o));
  v.done();
  return end - t;
}

/** Bat wings fluttering past, with tiny squeaks. */
export function batFlutter(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const dur = rand(0.5, 1.1);
  const end = t + dur;
  const dir = chance(0.5) ? 1 : -1;
  const src = v.noise('pink', t, end + 0.02);
  const bp = v.filter('bandpass', rand(900, 1600), 1.2);
  const am = v.gain(0.5);
  lfo(v, am.gain, rand(12, 18), 0.5, t, end + 0.02);
  const g = v.gain(0);
  shapeCurve(g.gain, t, dur, (x) => Math.sin(Math.PI * x), o.level);
  const p = v.pan(-0.9 * dir);
  p.pan.setValueAtTime(-0.9 * dir, t);
  p.pan.linearRampToValueAtTime(0.9 * dir, end);
  v.chain(src, bp, am, g, p);
  const sq = randInt(1, 3);
  for (let i = 0; i < sq; i++) {
    const st = t + rand(0, dur * 0.8);
    const f = rand(7000, 10000);
    const osc = v.osc('sine', f, st, st + 0.03);
    osc.frequency.setValueAtTime(f, st);
    osc.frequency.exponentialRampToValueAtTime(f * 0.7, st + 0.02);
    const sg = v.gain(0);
    perc(sg.gain, st, o.level * 0.25, 0.001, 0.02);
    v.chain(osc, sg, p);
  }
  v.out(p, { wet: o.wet, reverb: o.reverb });
  v.done();
  return dur;
}

/** Rat squeaks. */
export function ratSqueak(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(2, 4);
  const f = rand(3200, 4800);
  const notes: [number, number][] = [];
  let tt = t;
  for (let i = 0; i < n; i++) {
    const d = rand(0.04, 0.09);
    notes.push([tt, d]);
    tt += d + rand(0.06, 0.18);
  }
  const osc = v.osc('sine', f, t, tt);
  lfo(v, osc.frequency, 30, f * 0.02, t, tt);
  const g = v.gain(0);
  for (const [s, d] of notes) {
    osc.frequency.setValueAtTime(f * 0.9, s);
    osc.frequency.linearRampToValueAtTime(f * 1.15, s + d * 0.4);
    osc.frequency.linearRampToValueAtTime(f * 0.85, s + d);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(o.level, s + 0.008);
    g.gain.linearRampToValueAtTime(0, s + d);
  }
  v.chain(osc, g);
  v.out(g, place(o));
  v.done();
  return tt - t;
}

// ───────────────────────────── Underground ─────────────────────────────

/** Far-away rumble (collapse, something huge moving). */
export function rumble(env: SynthEnv, t: number, o: Place & { dur?: number }): number {
  const v = new Voice(env);
  const dur = o.dur ?? rand(4, 8);
  const src = v.noise('brown', t, t + dur + 0.05, rand(0.45, 0.65));
  const lp = v.filter('lowpass', rand(90, 150), 0.8);
  const g = v.gain(0);
  shapeCurve(
    g.gain,
    t,
    dur,
    (x) => {
      const y = x < 0.35 ? (x / 0.35) * 0.5 : 0.5 + ((x - 0.35) / 0.65) * 0.5;
      return Math.pow(Math.sin(Math.PI * y), 1.6);
    },
    o.level,
  );
  v.chain(src, lp, g);
  v.out(g, place(o));
  v.done();
  return dur;
}

/** Pebbles trickling down rock. */
export function pebbles(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const n = randInt(4, 12);
  const bp = v.filter('bandpass', rand(1800, 3500), 2.5);
  const g = v.gain(0);
  let tt = t;
  let iv = rand(0.05, 0.12);
  let a = o.level;
  for (let i = 0; i < n; i++) {
    perc(g.gain, tt, a * rand(0.6, 1), 0.0005, rand(0.01, 0.03));
    tt += iv * rand(0.7, 1.3);
    iv *= rand(1.05, 1.25);
    a *= rand(0.75, 0.95);
  }
  const src = v.noise('white', t, tt + 0.05);
  v.chain(src, bp, g);
  v.out(g, place(o));
  v.done();
  if (chance(0.4)) knock(env, tt, { level: o.level * 0.6, f: rand(90, 140), decay: 0.2, pan: o.pan, wet: o.wet, reverb: o.reverb });
  return tt - t;
}

/** Whispering: formant-filtered noise syllables with sibilants, drifting in space. */
const VOWELS: readonly (readonly [number, number])[] = [
  [730, 1090],
  [530, 1840],
  [270, 2290],
  [570, 840],
  [300, 870],
  [660, 1720],
  [500, 1500],
  [640, 1190],
];
export { VOWELS };

export function whisper(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const count = randInt(4, 11);
  const syl: { s: number; d: number }[] = [];
  let tt = t;
  for (let i = 0; i < count; i++) {
    if (i > 0 && chance(0.2)) tt += rand(0.12, 0.35);
    const d = rand(0.11, 0.26);
    syl.push({ s: tt, d });
    tt += d;
  }
  const end = tt + 0.15;
  const src = v.noise('white', t, end);
  const hp = v.filter('highpass', 350, 0.7);
  src.connect(hp);
  const scale = rand(0.95, 1.25);
  const formants = [v.filter('bandpass', 600, 7), v.filter('bandpass', 1500, 9), v.filter('bandpass', 2600, 10)];
  const fg = [v.gain(2.6), v.gain(1.8), v.gain(1.0)];
  const voiced = v.gain(0);
  formants.forEach((f, i) => {
    hp.connect(f);
    f.connect(fg[i]!);
    fg[i]!.connect(voiced);
  });
  const sib = v.filter('highpass', 4200, 0.8);
  const sg = v.gain(0);
  hp.connect(sib);
  sib.connect(sg);
  for (const s of syl) {
    const vw = pick(VOWELS);
    formants[0]!.frequency.setTargetAtTime(vw[0] * scale, s.s, 0.03);
    formants[1]!.frequency.setTargetAtTime(vw[1] * scale, s.s, 0.03);
    formants[2]!.frequency.setTargetAtTime(rand(2400, 3000) * scale, s.s, 0.05);
    const peak = rand(0.5, 1);
    voiced.gain.setTargetAtTime(peak, s.s, 0.03);
    voiced.gain.setTargetAtTime(0, s.s + s.d * 0.6, 0.04);
    if (chance(0.45)) {
      sg.gain.setTargetAtTime(peak * rand(0.12, 0.25), Math.max(t, s.s - 0.03), 0.015);
      sg.gain.setTargetAtTime(0, s.s + 0.05, 0.02);
    }
  }
  voiced.gain.setTargetAtTime(0, end - 0.12, 0.03);
  sg.gain.setTargetAtTime(0, end - 0.12, 0.02);
  const mix = v.gain(o.level);
  voiced.connect(mix);
  sg.connect(mix);
  const p0 = o.pan ?? 0;
  const p = v.pan(p0);
  p.pan.setValueAtTime(p0, t);
  p.pan.linearRampToValueAtTime(clamp(p0 + rand(-0.5, 0.5), -1, 1), end);
  mix.connect(p);
  v.out(p, { wet: o.wet, reverb: o.reverb ?? 'hall' });
  v.done();
  return end - t;
}

// ───────────────────────────── Town ─────────────────────────────

/** Cart rolling over cobblestones with a horse, passing left↔right. */
export function cart(env: SynthEnv, t: number, o: Place & { dir: number }): number {
  const v = new Voice(env);
  const dur = rand(6, 10);
  const end = t + dur;
  const dir = o.dir >= 0 ? 1 : -1;
  const pass = v.gain(0);
  shapeCurve(pass.gain, t, dur, (x) => Math.pow(Math.sin(Math.PI * x), 1.5), o.level);
  const lp = v.filter('lowpass', 900, 0.7);
  shapeCurve(lp.frequency, t, dur, (x) => 900 + 2600 * Math.sin(Math.PI * x));
  const p = v.pan(-0.8 * dir);
  p.pan.setValueAtTime(-0.8 * dir, t);
  p.pan.linearRampToValueAtTime(0.8 * dir, end);
  v.chain(pass, lp, p);

  const wn = v.noise('white', t, end);
  const wb = v.filter('bandpass', rand(400, 700), 1.5);
  const wg = v.gain(0);
  let tt = t;
  while (tt < end - 0.06) {
    perc(wg.gain, tt, rand(0.3, 1), 0.001, rand(0.025, 0.05));
    tt += rand(0.07, 0.17);
  }
  v.chain(wn, wb, wg, pass);

  const rn = v.noise('brown', t, end);
  const rl = v.filter('lowpass', 160, 0.7);
  const rg = v.gain(0.6);
  v.chain(rn, rl, rg, pass);

  const hoof = v.osc('sine', rand(700, 900), t, end);
  const hg = v.gain(0);
  const hb = v.filter('bandpass', 2000, 2);
  const hng = v.gain(0);
  const stepT = rand(0.48, 0.58);
  let ht = t + rand(0, 0.3);
  let k = 0;
  while (ht < end - 0.1) {
    const a = rand(0.5, 1);
    perc(hg.gain, ht, a * 0.5, 0.001, 0.035);
    perc(hng.gain, ht, a * 0.4, 0.0005, 0.02);
    ht += (k % 2 === 0 ? stepT * 0.32 : stepT * 0.68) * rand(0.95, 1.05);
    k++;
  }
  v.chain(hoof, hg, pass);
  v.chain(wn, hb, hng, pass);
  v.out(p, { wet: o.wet, reverb: o.reverb ?? 'open' });
  v.done();
  return dur;
}

/** Singing sand dune: a low, beating hum that swells and fades. */
export function duneHum(env: SynthEnv, t: number, o: Place): number {
  const v = new Voice(env);
  const dur = rand(6, 10);
  const f = rand(80, 105);
  const mix = v.gain(0);
  shapeCurve(mix.gain, t, dur, (x) => Math.pow(Math.sin(Math.PI * x), 2), o.level);
  const parts: readonly (readonly [number, number])[] = [
    [1, 1],
    [1.006, 0.8],
    [2.01, 0.3],
    [2.99, 0.12],
  ];
  for (const [r, a] of parts) {
    const g = v.gain(a * 0.3);
    v.chain(v.osc('sine', f * r, t, t + dur + 0.05), g, mix);
  }
  const n = v.noise('pink', t, t + dur + 0.05);
  const bp = v.filter('bandpass', f * 2, 6);
  const ng = v.gain(3);
  v.chain(n, bp, ng, mix);
  const lp = v.filter('lowpass', 400, 0.7);
  mix.connect(lp);
  v.out(lp, place(o));
  v.done();
  return dur;
}
