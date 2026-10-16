/**
 * Continuous ambience building blocks ("beds") and recurring creature/event schedulers.
 * They all build into a LayerEnv: nodes go into env.bed (stopped with the layer) and
 * modulation/events are registered as look-ahead streams.
 */
import type { NoiseKind } from '../core/noise.ts';
import type { OutOptions, SynthEnv } from '../core/voice.ts';
import type { LayerEnv } from './layer.ts';
import type { Bird, BirdKind, FrogKind } from '../sounds/voices.ts';
import { curveTo, lfo, withOut } from '../core/voice.ts';
import { chance, clamp, expRand, pick, rand, randInt } from '../core/random.ts';
import { bubbleTexture, crackleTexture, pulseEnvelope, rainTexture, rustleTexture } from '../core/textures.ts';
import { VOWELS, birdCall, drip, drumHit, firePop, frogCall } from '../sounds/voices.ts';

// ───────────────────────────── Wind ─────────────────────────────

export interface WindOptions {
  level: number;
  /** Bandpass centre range (Hz) the wind wanders through. */
  band: [number, number];
  q?: number;
  /** Gust gain range. */
  gust?: [number, number];
  /** Seconds per gust segment. */
  gustTime?: [number, number];
  noise?: NoiseKind;
  /** Resonant howl amount (0..1). */
  howl?: number;
  howlBand?: [number, number];
  /** High resonant whistle amount (0..1). */
  whistle?: number;
  whistleBand?: [number, number];
  out?: OutOptions;
}

/** Wind: band-passed noise with wandering colour and random gusts. Returns the gust node (connect rustle/sand into it). */
export function wind(env: LayerEnv, o: WindOptions): GainNode {
  const b = env.bed;
  const t0 = env.t0;
  const [g0, g1] = o.gust ?? [0.35, 1];
  const [gt0, gt1] = o.gustTime ?? [2.5, 7];
  const src = b.noise(o.noise ?? 'pink', t0, undefined, rand(0.9, 1.1));
  const gust = b.gain((g0 + g1) / 2);
  env.walk(gust.gain, g0, g1, gt0, gt1);
  const bp = b.filter('bandpass', Math.sqrt(o.band[0] * o.band[1]), o.q ?? 0.8);
  env.walk(bp.frequency, o.band[0], o.band[1], 3, 9, true);
  const lp = b.filter('lowpass', o.band[1] * 2.2, 0.5);
  b.chain(src, bp, lp, gust);
  if (o.howl) {
    const [h0, h1] = o.howlBand ?? [280, 800];
    for (let i = 0; i < 2; i++) {
      const f = b.filter('bandpass', rand(h0, h1), rand(10, 18));
      env.walk(f.frequency, h0, h1, 2, 6, true);
      const g = b.gain(o.howl * 3);
      env.walk(g.gain, 0, o.howl * 7, 2, 5);
      b.chain(src, f, g, gust);
    }
  }
  if (o.whistle) {
    const [w0, w1] = o.whistleBand ?? [1200, 2600];
    for (let i = 0; i < 2; i++) {
      const f = b.filter('bandpass', rand(w0, w1), rand(35, 60));
      env.walk(f.frequency, w0, w1, 1.5, 5, true);
      const g = b.gain(0);
      env.walk(g.gain, 0, o.whistle * 16, 1.5, 4);
      b.chain(src, f, g, gust);
    }
  }
  const level = b.gain(o.level);
  gust.connect(level);
  b.out(level, o.out ?? {});
  return gust;
}

/** Granular rustle (leaves / sand / sleet / foam) fed into `into` (usually a wind gust node). */
export function rustle(env: LayerEnv, into: AudioNode, o: { level: number; lo: number; hi: number; rate: number; key: string }): void {
  const tex = env.textures.get(`rustle:${o.key}`, (ctx) => rustleTexture(ctx, o.lo, o.hi, o.rate));
  const b = env.bed;
  const g = b.gain(o.level);
  for (const rate of [1, 0.87]) {
    b.buffer(tex, env.t0, undefined, { loop: true, rate, offset: rand(0, tex.duration * 0.9) }).connect(g);
  }
  g.connect(into);
}

// ───────────────────────────── Rain ─────────────────────────────

export function rain(env: LayerEnv, o: { level: number; heavy?: boolean }): void {
  const b = env.bed;
  const t0 = env.t0;
  const heavy = o.heavy ?? false;
  const intensity = b.gain(0.9);
  env.walk(intensity.gain, heavy ? 0.8 : 0.7, 1.05, 5, 14);
  const lvl = b.gain(o.level);
  intensity.connect(lvl);
  b.out(lvl, { wet: heavy ? 0.12 : 0.08, reverb: 'open' });

  const hiss = b.noise('white', t0, undefined, rand(0.95, 1.05));
  b.chain(hiss, b.filter('highpass', heavy ? 2400 : 3200, 0.5), b.filter('lowpass', 11000, 0.5), b.gain(heavy ? 0.7 : 0.45), intensity);
  const body = b.noise('pink', t0, undefined, 0.95);
  b.chain(body, b.filter('bandpass', 1100, 0.6), b.gain(heavy ? 0.75 : 0.4), intensity);
  const low = b.noise('brown', t0);
  b.chain(low, b.filter('lowpass', 220, 0.7), b.gain(heavy ? 0.9 : 0.5), intensity);

  const tex = env.textures.get('rain', rainTexture);
  const ticks = b.gain(heavy ? 0.8 : 0.7);
  for (const rate of [1, 0.91]) {
    b.buffer(tex, t0, undefined, { loop: true, rate, offset: rand(0, tex.duration * 0.9) }).connect(ticks);
  }
  b.chain(ticks, b.filter('highpass', 600, 0.6), intensity);

  // Bigger drops into puddles / off eaves.
  const plops = withOut(env, lvl);
  env.events(0.25, heavy ? 0.9 : 1.6, (t) => {
    drip(plops, t, { f: rand(500, 1400), level: rand(0.05, 0.16), pan: rand(-0.9, 0.9), decay: rand(0.03, 0.06) });
  });
}

// ───────────────────────────── Fire ─────────────────────────────

export function fire(env: LayerEnv, o: { level: number; crackle: number; roar: number; popsPerMin: number; out: OutOptions }): void {
  const b = env.bed;
  const t0 = env.t0;
  const lvl = b.gain(o.level);
  b.out(lvl, o.out);

  const tex = env.textures.get('crackle', crackleTexture);
  const cr = b.gain(o.crackle * 0.8);
  env.walk(cr.gain, o.crackle * 0.55, o.crackle, 1.5, 5);
  for (const rate of [1, 0.89]) {
    b.buffer(tex, t0, undefined, { loop: true, rate, offset: rand(0, tex.duration * 0.9) }).connect(cr);
  }
  b.chain(cr, b.filter('highpass', 500, 0.6), lvl);

  // Low "breathing" roar of the flames.
  const roar = b.noise('brown', t0, undefined, rand(0.9, 1.1));
  const rlp = b.filter('lowpass', 420, 0.9);
  env.walk(rlp.frequency, 260, 650, 0.8, 2.5, true);
  const rg = b.gain(o.roar * 0.7);
  env.walk(rg.gain, o.roar * 0.45, o.roar, 0.6, 2.2);
  b.chain(roar, rlp, rg, lvl);

  const hiss = b.noise('pink', t0);
  b.chain(hiss, b.filter('bandpass', 3200, 0.9), b.gain(o.roar * 0.15), lvl);

  if (o.popsPerMin > 0) {
    const popEnv = withOut(env, lvl);
    const mean = 60 / o.popsPerMin;
    env.add({
      next: t0 + rand(1, 5),
      fire: (t) => {
        firePop(popEnv, t, { level: rand(0.25, 0.7), pan: rand(-0.4, 0.4), wet: o.out.wet, reverb: o.out.reverb });
        return expRand(mean) + 0.3;
      },
    });
  }
}

// ───────────────────────────── Crowd ─────────────────────────────

/** Crowd murmur: band-passed noise voices with slow random envelopes + muffled voiced talkers. */
export function crowd(
  env: LayerEnv,
  o: { level: number; noiseVoices: number; talkers: number; brightness: number; spread: number; out: OutOptions; pitch?: [number, number] },
): void {
  const b = env.bed;
  const t0 = env.t0;
  const bus = b.gain(1);
  const lp = b.filter('lowpass', o.brightness, 0.6);
  const lvl = b.gain(o.level);
  b.chain(bus, lp, lvl);
  b.out(lvl, o.out);

  const base = b.noise('pink', t0, undefined, rand(0.95, 1.05));
  const baseG = b.gain(0.5);
  env.walk(baseG.gain, 0.35, 0.6, 3, 8);
  b.chain(base, b.filter('bandpass', 480, 0.9), baseG, bus);

  for (let i = 0; i < o.noiseVoices; i++) {
    const src = b.noise('pink', t0, undefined, rand(0.85, 1.15));
    const bp = b.filter('bandpass', rand(300, 1200), rand(2, 4));
    env.walk(bp.frequency, 280, 1400, 0.25, 0.9, true);
    const g = b.gain(0);
    env.walk(g.gain, 0, 1.6, 0.3, 1.6);
    const p = b.pan(rand(-o.spread, o.spread));
    b.chain(src, bp, g, p, bus);
  }

  const [p0, p1] = o.pitch ?? [95, 230];
  for (let i = 0; i < o.talkers; i++) talker(env, bus, rand(-o.spread, o.spread), rand(p0, p1));
}

/** One muffled voice: sawtooth with intonation → moving vowel formants → syllable & phrase gating. */
function talker(env: LayerEnv, dest: AudioNode, pan: number, f0: number): void {
  const b = env.bed;
  const t0 = env.t0;
  const osc = b.osc('sawtooth', f0, t0);
  env.walk(osc.frequency, f0 * 0.82, f0 * 1.3, 0.12, 0.45, true);
  const pre = b.filter('lowpass', 2400, 0.7);
  const f1 = b.filter('bandpass', 600, 5);
  const f2 = b.filter('bandpass', 1400, 7);
  const g1 = b.gain(1);
  const g2 = b.gain(0.6);
  const syl = b.gain(0);
  env.walk(syl.gain, 0.05, 1, 0.07, 0.22);
  const gate = b.gain(0);
  const mix = b.gain(0.5);
  const p = b.pan(pan);
  b.chain(osc, pre);
  pre.connect(f1);
  pre.connect(f2);
  f1.connect(g1);
  f2.connect(g2);
  g1.connect(syl);
  g2.connect(syl);
  b.chain(syl, gate, mix, p, dest);

  const scale = f0 > 160 ? 1.15 : 1;
  let last: readonly [number, number] = [600, 1400];
  env.add({
    next: t0,
    fire: (t) => {
      const vw = pick(VOWELS);
      const target = [vw[0] * scale * rand(0.92, 1.08), vw[1] * scale * rand(0.92, 1.08)] as const;
      const dur = rand(0.09, 0.28);
      curveTo(f1.frequency, last[0], target[0], t, dur);
      curveTo(f2.frequency, last[1], target[1], t, dur);
      last = target;
      return dur;
    },
  });
  let talking = false;
  env.add({
    next: t0 + rand(0, 3),
    fire: (t) => {
      talking = !talking;
      curveTo(gate.gain, talking ? 0 : 1, talking ? 1 : 0, t, talking ? 0.15 : 0.35);
      return talking ? rand(1.2, 5) : rand(0.8, 6);
    },
  });
}

// ───────────────────────────── Insects ─────────────────────────────

/** Crickets: high sines amplitude-modulated by looping pulse envelopes, chirping in spells. */
export function crickets(env: LayerEnv, o: { count: number; level: number; band: [number, number]; out: OutOptions }): void {
  const b = env.bed;
  const t0 = env.t0;
  const bus = b.gain(o.level);
  b.out(bus, o.out);
  for (let i = 0; i < o.count; i++) {
    const period = rand(0.32, 0.75);
    const pulses = randInt(2, 5);
    const envBuf = pulseEnvelope(env.ctx, period, pulses, rand(0.012, 0.022), rand(0.008, 0.016));
    const am = b.buffer(envBuf, t0 + rand(0, period), undefined, { loop: true, rate: rand(0.97, 1.03) });
    const osc = b.osc('sine', rand(o.band[0], o.band[1]), t0);
    const vca = b.gain(0);
    osc.connect(vca);
    am.connect(vca.gain);
    const gate = b.gain(0);
    let on = false;
    env.add({
      next: t0 + rand(0, 2),
      fire: (t) => {
        on = !on;
        const ramp = rand(0.4, 1.2);
        curveTo(gate.gain, on ? 0 : 1, on ? 1 : 0, t, ramp);
        // Next toggle never starts inside this curve.
        return Math.max(ramp + 0.05, on ? rand(6, 40) : rand(1, 9));
      },
    });
    b.chain(vca, gate, b.gain(rand(0.25, 1)), b.pan(rand(-0.9, 0.9)), bus);
  }
}

/** Distant insect chorus wash: narrow noise band with fast tremolo. */
export function insectBed(env: LayerEnv, o: { level: number; f: number; rate: number; out: OutOptions }): void {
  const b = env.bed;
  const src = b.noise('white', env.t0);
  const bp = b.filter('bandpass', o.f, 6);
  const am = b.gain(0.5);
  lfo(b, am.gain, o.rate, 0.5, env.t0);
  const swell = b.gain(0.6);
  env.walk(swell.gain, 0.3, 1, 4, 12);
  const lvl = b.gain(o.level * 4);
  b.chain(src, bp, am, swell, lvl);
  b.out(lvl, o.out);
}

// ───────────────────────────── Underground ─────────────────────────────

/** Low evolving drone: detuned saws through a wandering lowpass, sub, fading fifth & air rumble. */
export function drone(env: LayerEnv, o: { level: number; root: number; cutoff: [number, number]; out: OutOptions }): void {
  const b = env.bed;
  const t0 = env.t0;
  const lp = b.filter('lowpass', o.cutoff[0], 2.5);
  env.walk(lp.frequency, o.cutoff[0], o.cutoff[1], 6, 16, true);
  const amp = b.gain(0.8);
  env.walk(amp.gain, 0.5, 1, 5, 12);
  const lvl = b.gain(o.level);
  b.chain(lp, amp, lvl);
  b.out(lvl, o.out);

  const o1 = b.osc('sawtooth', o.root, t0);
  const o2 = b.osc('sawtooth', o.root, t0, undefined, 7);
  env.walk(o2.detune, -14, 14, 4, 10);
  const g12 = b.gain(0.35);
  o1.connect(g12);
  o2.connect(g12);
  g12.connect(lp);

  const sub = b.osc('sine', o.root * 0.75, t0);
  b.chain(sub, b.gain(0.45), amp);

  const fifth = b.osc('triangle', o.root * 1.5, t0);
  const fg = b.gain(0);
  env.walk(fg.gain, 0, 0.35, 8, 20);
  b.chain(fifth, fg, lp);

  const dark = b.osc('triangle', o.root * 2.4, t0);
  const dg = b.gain(0);
  env.walk(dg.gain, 0, 0.12, 10, 25);
  b.chain(dark, dg, lp);

  const air = b.noise('brown', t0);
  b.chain(air, b.filter('lowpass', 110, 0.7), b.gain(0.5), amp);
}

/** Hollow cave air: low band-passed brown noise plus a faint resonant hum. */
export function caveAir(env: LayerEnv, o: { level: number; out: OutOptions }): void {
  const b = env.bed;
  const lvl = b.gain(o.level);
  b.out(lvl, o.out);
  const src = b.noise('brown', env.t0, undefined, rand(0.9, 1.1));
  const bp = b.filter('bandpass', 140, 1.5);
  env.walk(bp.frequency, 90, 220, 5, 12, true);
  const g = b.gain(0.8);
  env.walk(g.gain, 0.5, 1, 4, 10);
  b.chain(src, bp, g, lvl);
  const hollow = b.noise('pink', env.t0);
  const res = b.filter('bandpass', rand(80, 95), 10);
  const hg = b.gain(3);
  env.walk(hg.gain, 1.5, 4, 6, 14);
  b.chain(hollow, res, hg, lvl);
}

/** Distant underground stream: bubbling texture + soft rush. */
export function stream(env: LayerEnv, o: { level: number; out: OutOptions }): void {
  const b = env.bed;
  const lvl = b.gain(o.level);
  b.out(lvl, o.out);
  const tex = env.textures.get('bubbles:stream', (ctx) => bubbleTexture(ctx, 70, 300, 1600));
  const bub = b.gain(0.9);
  for (const rate of [1, 0.93]) b.buffer(tex, env.t0, undefined, { loop: true, rate, offset: rand(0, tex.duration * 0.9) }).connect(bub);
  b.chain(bub, b.filter('lowpass', 3000, 0.7), lvl);
  const rush = b.noise('pink', env.t0);
  const rg = b.gain(0.4);
  env.walk(rg.gain, 0.25, 0.5, 2, 6);
  b.chain(rush, b.filter('bandpass', 600, 0.7), rg, lvl);
}

/** Water drips from a few "leaks", each dripping with its own rhythm for a while. */
export function drippers(
  env: LayerEnv,
  o: { count: number; level: number; fRange: [number, number]; period: [number, number]; wet: number; reverb: OutOptions['reverb'] },
): void {
  for (let i = 0; i < o.count; i++) {
    let f = rand(o.fRange[0], o.fRange[1]);
    let pan = rand(-0.9, 0.9);
    let period = rand(o.period[0], o.period[1]);
    let lvl = o.level * rand(0.4, 1);
    let remaining = randInt(6, 30);
    env.add({
      next: env.t0 + rand(0.2, period),
      fire: (t) => {
        if (remaining-- <= 0) {
          f = rand(o.fRange[0], o.fRange[1]);
          pan = rand(-0.9, 0.9);
          period = rand(o.period[0], o.period[1]);
          lvl = o.level * rand(0.4, 1);
          remaining = randInt(6, 30);
          return rand(3, 12);
        }
        drip(env, t, { f: f * rand(0.96, 1.04), level: lvl * rand(0.7, 1), pan, wet: o.wet, reverb: o.reverb });
        return period * rand(0.9, 1.1);
      },
    });
  }
}

// ───────────────────────────── Tonal ─────────────────────────────

/** Evolving pad: detuned oscillator pairs per chord tone, independent swells, slow chord glides. */
export function pad(
  env: LayerEnv,
  o: {
    chords: readonly (readonly number[])[];
    level: number;
    type: OscillatorType;
    detune: number;
    cutoff: [number, number];
    swell: [number, number];
    vibrato?: number;
    changeEvery?: [number, number];
    out: OutOptions;
  },
): void {
  const b = env.bed;
  const t0 = env.t0;
  const lp = b.filter('lowpass', o.cutoff[0], 0.8);
  env.walk(lp.frequency, o.cutoff[0], o.cutoff[1], 6, 15, true);
  const lvl = b.gain(o.level);
  b.chain(lp, lvl);
  b.out(lvl, o.out);
  const first = o.chords[0] ?? [];
  const voices = first.map((f) => {
    const a = b.osc(o.type, f, t0, undefined, -o.detune * rand(0.6, 1.2));
    const c = b.osc(o.type, f, t0, undefined, o.detune * rand(0.6, 1.2));
    if (o.vibrato) {
      lfo(b, a.detune, rand(0.08, 0.25), o.vibrato, t0);
      lfo(b, c.detune, rand(0.08, 0.25), o.vibrato, t0);
    }
    const g = b.gain(0);
    env.walk(g.gain, o.swell[0], o.swell[1], 4, 12);
    a.connect(g);
    c.connect(g);
    g.connect(lp);
    return { a, c, f };
  });
  const every = o.changeEvery;
  if (every && o.chords.length > 1) {
    let idx = 0;
    env.add({
      next: t0 + rand(every[0], every[1]),
      fire: (t) => {
        idx = (idx + randInt(1, o.chords.length - 1)) % o.chords.length;
        const next = o.chords[idx] ?? first;
        const glide = rand(5, 9);
        voices.forEach((vv, i) => {
          const to = next[i % next.length] ?? vv.f;
          curveTo(vv.a.frequency, vv.f, to, t, glide);
          curveTo(vv.c.frequency, vv.f, to, t, glide);
          vv.f = to;
        });
        return rand(every[0], every[1]);
      },
    });
  }
}

/** Ghostly moaning wind: noise through a narrow wandering band. */
export function moan(env: LayerEnv, o: { level: number; band: [number, number]; out: OutOptions }): void {
  const b = env.bed;
  const src = b.noise('pink', env.t0);
  const bp = b.filter('bandpass', Math.sqrt(o.band[0] * o.band[1]), 14);
  env.walk(bp.frequency, o.band[0], o.band[1], 3, 8, true);
  const g = b.gain(0);
  env.walk(g.gain, 0, 1, 4, 10);
  const lvl = b.gain(o.level * 6);
  b.chain(src, bp, g, lvl);
  b.out(lvl, o.out);
}

/** Arcane hum: low sines + filtered saw with slow tremolo. */
export function hum(env: LayerEnv, o: { level: number; f: number; out: OutOptions }): void {
  const b = env.bed;
  const t0 = env.t0;
  const trem = b.gain(0.75);
  lfo(b, trem.gain, rand(0.12, 0.2), 0.25, t0);
  const lvl = b.gain(o.level);
  b.chain(trem, lvl);
  b.out(lvl, o.out);
  b.chain(b.osc('sine', o.f, t0), b.gain(0.6), trem);
  b.chain(b.osc('sine', o.f * 2, t0, undefined, 3), b.gain(0.3), trem);
  b.chain(b.osc('sawtooth', o.f, t0), b.filter('lowpass', o.f * 4, 0.7), b.gain(0.12), trem);
}

/** Feedback echo; returns its input. */
export function echo(env: LayerEnv, o: { time: number; feedback: number; damp: number; level: number; out: OutOptions }): AudioNode {
  const b = env.bed;
  const input = b.gain(1);
  const dl = b.delay(o.time, 2);
  const lp = b.filter('lowpass', o.damp, 0.7);
  const fb = b.gain(o.feedback);
  const lvl = b.gain(o.level);
  b.chain(input, dl, lp, fb, dl);
  lp.connect(lvl);
  b.out(lvl, o.out);
  return input;
}

/** Ocean bed: distant surf rumble + faint haze. */
export function surf(env: LayerEnv, o: { level: number; out: OutOptions }): void {
  const b = env.bed;
  const lvl = b.gain(o.level);
  b.out(lvl, o.out);
  const low = b.noise('brown', env.t0);
  const lg = b.gain(0.7);
  env.walk(lg.gain, 0.45, 0.9, 6, 14);
  b.chain(low, b.filter('lowpass', 320, 0.6), lg, lvl);
  const haze = b.noise('white', env.t0);
  b.chain(haze, b.filter('highpass', 2500, 0.5), b.filter('lowpass', 7000, 0.5), b.gain(0.12), lvl);
}

/** Bubbling texture (swamp mud / potions). */
export function bubbling(env: LayerEnv, o: { level: number; perSec: number; fLo: number; fHi: number; out: OutOptions }): void {
  const b = env.bed;
  const tex = env.textures.get(`bubbles:${o.perSec}:${o.fLo}:${o.fHi}`, (ctx) => bubbleTexture(ctx, o.perSec, o.fLo, o.fHi));
  const g = b.gain(o.level);
  for (const rate of [1, 0.91]) b.buffer(tex, env.t0, undefined, { loop: true, rate, offset: rand(0, tex.duration * 0.9) }).connect(g);
  b.out(g, o.out);
}

// ───────────────────────────── Creature schedulers ─────────────────────────────

/** A few individual birds, each with its own voice, position and singing habits. */
export function birds(env: LayerEnv, o: { count: number; level: number; kinds?: BirdKind[] }): void {
  const kinds: BirdKind[] = o.kinds ?? ['chirp', 'trill', 'whistle', 'warble'];
  for (let i = 0; i < o.count; i++) {
    const kind = kinds[i % kinds.length] ?? 'chirp';
    const far = Math.random();
    const bird: Bird = {
      kind,
      f: kind === 'whistle' ? rand(2200, 3400) : kind === 'trill' ? rand(3200, 5200) : rand(2800, 5000),
      level: o.level * (1 - far * 0.6),
      pan: rand(-0.95, 0.95),
      wet: 0.15 + far * 0.45,
    };
    let bout = randInt(2, 6);
    env.add({
      next: env.t0 + rand(0.5, 6 + i * 2),
      fire: (t) => {
        const d = birdCall(env, t, bird);
        if (--bout > 0) return d + rand(0.8, 3.5);
        bout = randInt(2, 6);
        if (chance(0.3)) bird.pan = rand(-0.95, 0.95);
        return d + rand(6, 22);
      },
    });
  }
}

/** Frogs calling in bouts. */
export function frogs(env: LayerEnv, o: { count: number; level: number; out: OutOptions }): void {
  const kinds: FrogKind[] = ['bull', 'tree', 'peeper', 'tree', 'bull'];
  const voice: SynthEnv = env;
  for (let i = 0; i < o.count; i++) {
    const kind = kinds[i % kinds.length] ?? 'tree';
    const f = kind === 'bull' ? rand(95, 145) : kind === 'tree' ? rand(1300, 2200) : rand(2600, 3100);
    const pan = rand(-0.9, 0.9);
    const lvl = o.level * rand(0.5, 1) * (kind === 'peeper' ? 0.5 : 1);
    const iv = kind === 'bull' ? rand(1.2, 2.2) : kind === 'tree' ? rand(0.5, 1.1) : rand(0.6, 1);
    let remaining = randInt(3, 10);
    env.add({
      next: env.t0 + rand(0.3, 6),
      fire: (t) => {
        frogCall(voice, t, kind, { f: f * rand(0.97, 1.03), level: lvl * rand(0.8, 1), pan, wet: o.out.wet, reverb: o.out.reverb });
        if (--remaining > 0) return iv * rand(0.9, 1.15);
        remaining = randInt(3, 10);
        return rand(4, 18);
      },
    });
  }
}

/** War drums: a groove that changes pattern every few bars, with fills and rests. */
export function warDrums(env: LayerEnv, o: { level: number; out: OutOptions }): void {
  const patterns: readonly (readonly number[])[] = [
    [1, 0, 0, 0, 0.8, 0, 0, 0],
    [1, 0, 0, 0.7, 0, 0, 0.8, 0],
    [1, 0, 0.6, 0, 0.9, 0, 0, 0],
    [1, 0, 0, 0, 0.8, 0, 0.6, 0.7],
    [1, 0.5, 0, 0.7, 0.9, 0, 0.6, 0],
  ];
  const bpm = rand(78, 96);
  const eighth = 60 / bpm / 2;
  let step = 0;
  let bar = 0;
  let pattern = patterns[0]!;
  let rest = false;
  let fill = false;
  const pan = rand(-0.3, 0.3);
  env.add({
    next: env.t0 + 0.5,
    fire: (t) => {
      if (step === 0) {
        bar++;
        if (bar % 4 === 1) pattern = pick(patterns);
        rest = !fill && chance(0.07);
        fill = !rest && bar % 8 === 0;
      }
      const hit = rest ? 0 : fill && step >= 4 ? 0.8 + (step - 4) * 0.07 : (pattern[step] ?? 0);
      const human = rand(-0.008, 0.008);
      if (hit > 0) {
        const big = step === 0 || step === 4;
        drumHit(env, t + human, {
          f: big ? rand(52, 58) : rand(70, 85),
          decay: big ? 0.9 : 0.55,
          level: o.level * hit * rand(0.85, 1),
          pan,
          wet: o.out.wet,
          reverb: o.out.reverb,
        });
        if (fill && step >= 4) {
          drumHit(env, t + eighth / 2 + human, { f: rand(75, 90), decay: 0.4, level: o.level * hit * 0.6, pan, wet: o.out.wet, reverb: o.out.reverb });
        }
      }
      if (!rest && step % 2 === 1 && chance(0.45)) {
        drumHit(env, t + human, { f: rand(130, 160), decay: 0.18, level: o.level * 0.28, pan: clamp(pan + 0.3, -1, 1), wet: o.out.wet, reverb: o.out.reverb });
      }
      step = (step + 1) % 8;
      return eighth;
    },
  });
}
