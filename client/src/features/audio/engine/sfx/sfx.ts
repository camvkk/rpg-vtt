/**
 * Synthesized one-shot sound effects. Each function schedules its sound at audio time
 * `t` into the given env and returns the duration (s) after which its per-call routing
 * can be released.
 */
import type { SfxId } from '../types.ts';
import type { SynthEnv } from '../core/voice.ts';
import { Voice, lfo, perc, shapeCurve, withOut } from '../core/voice.ts';
import { softClipCurve } from '../core/dsp.ts';
import { logRand, rand, randInt } from '../core/random.ts';
import { crackleTexture } from '../core/textures.ts';
import {
  bellStrike,
  brassNote,
  coinHit,
  creak,
  drumHit,
  footstep,
  gong,
  knock,
  metalRing,
  pageTurn,
  ping,
  thunder,
  whoosh,
} from '../sounds/voices.ts';

export type SfxFn = (env: SynthEnv, t: number) => number;

/** Tiny metallic latch click. */
function latch(env: SynthEnv, t: number, level: number): void {
  const v = new Voice(env);
  const mix = v.gain(1);
  const n = v.noise('white', t, t + 0.08);
  const bp = v.filter('bandpass', 3500, 3);
  const g = v.gain(0);
  perc(g.gain, t, level, 0.0005, 0.015);
  perc(g.gain, t + 0.04, level * 0.6, 0.0005, 0.012);
  v.chain(n, bp, g, mix);
  const tone = v.osc('sine', 2200, t, t + 0.08);
  const tg = v.gain(0);
  perc(tg.gain, t, level * 0.25, 0.0005, 0.03);
  v.chain(tone, tg, mix);
  v.out(mix, { wet: 0.2, reverb: 'room' });
  v.done();
}

/** Crackle burst (fire / debris) from the shared crackle texture. */
function crackleTail(env: SynthEnv, t: number, dur: number, level: number, hp = 800): void {
  const v = new Voice(env);
  const tex = env.textures.get('crackle', crackleTexture);
  const src = v.buffer(tex, t, t + dur + 0.05, { loop: true, offset: rand(0, tex.duration * 0.8), rate: rand(0.95, 1.1) });
  const f = v.filter('highpass', hp, 0.7);
  const g = v.gain(0);
  shapeCurve(g.gain, t, dur, (x) => Math.min(1, x * 8) * Math.pow(1 - x, 2), level);
  v.chain(src, f, g);
  v.out(g, { wet: 0.25, reverb: 'hall' });
  v.done();
}

const sword: SfxFn = (env, t) => {
  whoosh(env, t, { dur: 0.3, from: 600, to: 3000, q: 1.8, level: 0.55, pan: -0.3, panTo: 0.2, peakAt: 0.55 });
  const hit = t + 0.17;
  metalRing(env, hit, {
    f: rand(1100, 1400),
    ratios: [1, 2.41, 3.83, 5.17, 6.9],
    amps: [1, 0.8, 0.6, 0.4, 0.25],
    decay: 1.3,
    level: 0.9,
    noise: 0.5,
    noiseFreq: 4000,
    detune: 6,
    wet: 0.25,
    reverb: 'room',
  });
  return 1.7;
};

const arrow: SfxFn = (env, t) => {
  whoosh(env, t, { dur: 0.3, from: 2600, to: 900, q: 4, level: 0.6, pan: -0.7, panTo: 0.4, peakAt: 0.55 });
  const hit = t + 0.3;
  knock(env, hit, { f: rand(130, 170), decay: 0.12, level: 0.75, bright: 1400, pan: 0.4, wet: 0.15, reverb: 'room' });
  // Shaft quivering after impact.
  const v = new Voice(env);
  const f = rand(170, 220);
  const osc = v.osc('triangle', f, hit, hit + 0.45);
  const am = v.gain(0.5);
  lfo(v, am.gain, rand(24, 32), 0.5, hit, hit + 0.45);
  const g = v.gain(0);
  perc(g.gain, hit + 0.005, 0.18, 0.004, 0.4);
  v.chain(osc, am, g);
  v.out(g, { pan: 0.4 });
  v.done();
  return 0.9;
};

const fireball: SfxFn = (env, t) => {
  const boom = t + 0.55;
  const v = new Voice(env);
  // Ignition swell + flame roar.
  const sw = v.noise('pink', t, boom + 1.2);
  const bp = v.filter('bandpass', 300, 0.8);
  bp.frequency.setValueAtTime(300, t);
  bp.frequency.exponentialRampToValueAtTime(2200, boom);
  bp.frequency.exponentialRampToValueAtTime(500, boom + 1.1);
  const sg = v.gain(0);
  shapeCurve(sg.gain, t, 0.55, (x) => x * x, 0.55);
  shapeCurve(sg.gain, boom, 1.1, (x) => Math.pow(1 - x, 2), 0.55);
  v.chain(sw, bp, sg);
  // Low boom.
  const drive = v.shaper(softClipCurve(2.5));
  const kick = v.osc('sine', 95, boom, boom + 1.3);
  kick.frequency.setValueAtTime(95, boom);
  kick.frequency.exponentialRampToValueAtTime(32, boom + 0.7);
  const kg = v.gain(0);
  perc(kg.gain, boom, 0.9, 0.005, 1.1);
  v.chain(kick, kg, drive);
  // Blast body.
  const body = v.noise('brown', boom, boom + 1.8, 0.8);
  const lp = v.filter('lowpass', 2400, 0.7);
  lp.frequency.setValueAtTime(2400, boom);
  lp.frequency.exponentialRampToValueAtTime(90, boom + 1.6);
  const bg = v.gain(0);
  perc(bg.gain, boom, 1.2, 0.01, 1.6);
  v.chain(body, lp, bg, drive);
  const mix = v.gain(1);
  sg.connect(mix);
  drive.connect(mix);
  v.out(mix, { wet: 0.3, reverb: 'hall' });
  v.done();
  crackleTail(env, boom + 0.05, 1.8, 0.5);
  return 2.6;
};

const lightning: SfxFn = (env, t) => {
  const v = new Voice(env);
  const zap = 0.5;
  const mix = v.gain(1);
  // Electric crackle: noise gated by random spikes.
  const n = v.noise('white', t, t + zap + 0.1);
  const hp = v.filter('highpass', 1800, 0.7);
  const g = v.gain(0);
  let tt = t;
  while (tt < t + zap) {
    g.gain.setValueAtTime(rand(0.15, 0.6), tt);
    g.gain.setTargetAtTime(0, tt + 0.002, rand(0.004, 0.015));
    tt += rand(0.004, 0.03);
  }
  v.chain(n, hp, g, mix);
  // Buzz with jittering pitch.
  const buzz = v.osc('sawtooth', 90, t, t + zap + 0.1);
  for (let bt = t; bt < t + zap; bt += 0.015) buzz.frequency.setValueAtTime(rand(60, 140), bt);
  const bbp = v.filter('bandpass', 1200, 1);
  const bg = v.gain(0);
  shapeCurve(bg.gain, t, zap, (x) => Math.sin(Math.PI * Math.min(1, x * 1.3)) * (0.6 + 0.4 * Math.random()), 0.35, 64);
  v.chain(buzz, bbp, bg, mix);
  // Final crack.
  const ct = t + zap;
  const cn = v.noise('white', ct, ct + 0.3);
  const chp = v.filter('highpass', 600, 0.7);
  const cg = v.gain(0);
  perc(cg.gain, ct, 1, 0.0005, 0.12);
  v.chain(cn, chp, cg, mix);
  v.out(mix, { wet: 0.25, reverb: 'hall' });
  v.done();
  const dur = thunder(env, ct + 0.05, { intensity: 0.55, distance: 0.2, pan: rand(-0.3, 0.3) });
  return dur + zap + 0.05;
};

const heal: SfxFn = (env, t) => {
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  notes.forEach((f, i) => {
    ping(env, t + i * 0.07, { f, decay: 1.3, level: 0.16, pan: -0.4 + i * 0.16, wet: 0.5, reverb: 'hall' });
  });
  const v = new Voice(env);
  const mix = v.gain(0);
  shapeCurve(mix.gain, t, 1.8, (x) => (x < 0.15 ? x / 0.15 : Math.pow(1 - (x - 0.15) / 0.85, 2)), 0.12);
  for (const f of [1046.5, 1318.51, 1567.98]) {
    const o = v.osc('sine', f, t, t + 1.85);
    o.frequency.setValueAtTime(f * 0.98, t);
    o.frequency.linearRampToValueAtTime(f * 1.01, t + 1.2);
    const trem = v.gain(0.6);
    lfo(v, trem.gain, rand(6, 8), 0.4, t, t + 1.85);
    v.chain(o, trem, mix);
  }
  const sp = v.noise('white', t, t + 1.85);
  const shp = v.filter('highpass', 7000, 0.7);
  const sg = v.gain(0.4);
  v.chain(sp, shp, sg, mix);
  v.out(mix, { wet: 0.5, reverb: 'hall' });
  v.done();
  return 2.4;
};

const doorOpen: SfxFn = (env, t) => {
  latch(env, t, 0.4);
  const dur = rand(0.9, 1.4);
  creak(env, t + 0.12, { dur, from: rand(55, 75), to: rand(120, 170), level: 0.55, pan: 0.1, wet: 0.25, reverb: 'room' });
  knock(env, t + 0.12 + dur, { f: 90, decay: 0.25, level: 0.3, wet: 0.3, reverb: 'room' });
  return dur + 0.8;
};

const doorClose: SfxFn = (env, t) => {
  const dur = rand(0.45, 0.7);
  creak(env, t, { dur, from: rand(140, 170), to: rand(65, 85), level: 0.45, pan: -0.1, wet: 0.25, reverb: 'room' });
  const hit = t + dur;
  knock(env, hit, { f: 75, decay: 0.38, level: 0.9, bright: 600, wet: 0.35, reverb: 'room' });
  latch(env, hit + 0.03, 0.35);
  return dur + 0.9;
};

const doorLocked: SfxFn = (env, t) => {
  const v = new Voice(env);
  const bursts = randInt(2, 3);
  const end = t + bursts * 0.32 + 0.2;
  const n = v.noise('white', t, end);
  const hi = v.filter('bandpass', 2500, 2);
  const lo = v.filter('bandpass', 260, 1.5);
  const hg = v.gain(0);
  const lg = v.gain(0);
  const tone = v.osc('sine', 1800, t, end);
  const tg = v.gain(0);
  for (let b = 0; b < bursts; b++) {
    let ct = t + b * 0.32;
    const clicks = randInt(3, 5);
    for (let c = 0; c < clicks; c++) {
      const a = rand(0.5, 1);
      perc(hg.gain, ct, a * 0.45, 0.0005, 0.012);
      perc(lg.gain, ct, a * 0.8, 0.001, 0.035);
      perc(tg.gain, ct, a * 0.08, 0.0005, 0.02);
      ct += rand(0.04, 0.055);
    }
  }
  const mix = v.gain(1);
  v.chain(n, hi, hg, mix);
  v.chain(n, lo, lg, mix);
  v.chain(tone, tg, mix);
  v.out(mix, { wet: 0.2, reverb: 'room' });
  v.done();
  return end - t;
};

const coin: SfxFn = (env, t) => {
  const n = randInt(6, 11);
  for (let i = 0; i < n; i++) {
    const tt = t + Math.pow(i / n, 1.6) * 0.5 + rand(0, 0.03);
    coinHit(env, tt, { f: rand(2600, 4800), decay: rand(0.12, 0.3), level: rand(0.25, 0.5) * (1 - (i / n) * 0.5), pan: rand(-0.4, 0.4), wet: 0.15, reverb: 'room' });
  }
  coinHit(env, t + 0.58, { f: rand(3000, 3600), decay: 0.6, level: 0.5, wet: 0.2, reverb: 'room' });
  return 1.3;
};

const crit: SfxFn = (env, t) => {
  const g = 392;
  const place = { wet: 0.3, reverb: 'hall' as const };
  brassNote(env, t, { f: g, dur: 0.09, level: 0.22, ...place });
  brassNote(env, t + 0.12, { f: g, dur: 0.09, level: 0.22, ...place });
  brassNote(env, t + 0.24, { f: g, dur: 0.09, level: 0.22, ...place });
  const c = t + 0.38;
  const chord: readonly (readonly [number, number])[] = [
    [261.63, -0.3],
    [523.25, 0],
    [659.25, 0.25],
    [783.99, -0.15],
  ];
  for (const [f, pan] of chord) brassNote(env, c, { f, dur: 0.95, level: 0.16, vibrato: true, pan, ...place });
  drumHit(env, c, { f: 65, decay: 0.8, level: 0.5, wet: 0.3, reverb: 'hall' });
  const v = new Voice(env);
  const cy = v.noise('white', c, c + 1.5);
  const hp = v.filter('highpass', 6000, 0.7);
  const cg = v.gain(0);
  perc(cg.gain, c, 0.12, 0.02, 1.3);
  v.chain(cy, hp, cg);
  v.out(cg, { wet: 0.4, reverb: 'hall' });
  v.done();
  return 1.9;
};

const fumble: SfxFn = (env, t) => {
  const v = new Voice(env);
  const notes: readonly (readonly [number, number, number])[] = [
    [233.08, 0, 0.36],
    [220, 0.42, 0.36],
    [207.65, 0.84, 0.36],
    [196, 1.26, 1.3],
  ];
  const end = t + 1.26 + 1.3;
  const osc = v.osc('sawtooth', 233.08, t, end + 0.1);
  const lp = v.filter('lowpass', 500, 6);
  const amp = v.gain(0);
  for (const [f, s0, d] of notes) {
    const s = t + s0;
    osc.frequency.setValueAtTime(f * 0.96, s);
    osc.frequency.linearRampToValueAtTime(f, s + 0.06);
    lp.frequency.setValueAtTime(400, s);
    lp.frequency.linearRampToValueAtTime(1600, s + 0.12);
    lp.frequency.linearRampToValueAtTime(700, s + d);
    amp.gain.setValueAtTime(0, s);
    amp.gain.linearRampToValueAtTime(0.32, s + 0.04);
    amp.gain.setValueAtTime(0.32, s + d - 0.06);
    amp.gain.linearRampToValueAtTime(0, s + d);
  }
  const last = t + 1.26;
  osc.frequency.linearRampToValueAtTime(196 * 0.94, end);
  const vib = v.osc('sine', 5.5, last, end + 0.1);
  const vd = v.gain(0);
  vd.gain.setValueAtTime(0, last + 0.15);
  vd.gain.linearRampToValueAtTime(196 * 0.035, last + 0.9);
  vib.connect(vd);
  vd.connect(osc.frequency);
  const hp = v.filter('highpass', 120, 0.7);
  v.chain(osc, hp, lp, amp);
  v.out(amp, { wet: 0.2, reverb: 'room' });
  v.done();
  return 2.8;
};

const roar: SfxFn = (env, t) => {
  const v = new Voice(env);
  const dur = 1.9;
  const end = t + dur;
  const f0 = rand(55, 70);
  const osc = v.osc('sawtooth', f0, t, end + 0.05);
  osc.frequency.setValueAtTime(f0 * 0.9, t);
  osc.frequency.linearRampToValueAtTime(f0 * 1.25, t + 0.4);
  osc.frequency.linearRampToValueAtTime(f0 * 0.8, end);
  // Rough jitter on pitch.
  const jit = v.noise('brown', t, end + 0.05);
  const jg = v.gain(f0 * 1.5);
  v.chain(jit, jg);
  jg.connect(osc.frequency);
  const sub = v.osc('sine', f0 / 2, t, end + 0.05);
  const subG = v.gain(0.6);
  const breath = v.noise('pink', t, end + 0.05);
  const f1 = v.filter('bandpass', 400, 2);
  const f2 = v.filter('bandpass', 900, 3);
  f1.frequency.setValueAtTime(400, t);
  f1.frequency.linearRampToValueAtTime(700, t + 0.5);
  f1.frequency.linearRampToValueAtTime(350, end);
  f2.frequency.setValueAtTime(900, t);
  f2.frequency.linearRampToValueAtTime(1200, t + 0.5);
  f2.frequency.linearRampToValueAtTime(700, end);
  const bg = v.gain(2.5);
  const src = v.gain(1);
  osc.connect(src);
  v.chain(sub, subG, src);
  breath.connect(f1);
  breath.connect(f2);
  f1.connect(bg);
  f2.connect(bg);
  bg.connect(src);
  const flutter = v.gain(0.65);
  lfo(v, flutter.gain, rand(24, 32), 0.35, t, end + 0.05);
  const drive = v.shaper(softClipCurve(4));
  const lp = v.filter('lowpass', 2400, 0.7);
  const amp = v.gain(0);
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.5, t + 0.25);
  amp.gain.setValueAtTime(0.5, end - 0.6);
  amp.gain.linearRampToValueAtTime(0, end);
  v.chain(src, flutter, drive, lp, amp);
  v.out(amp, { wet: 0.3, reverb: 'hall' });
  v.done();
  return dur + 0.2;
};

const magic: SfxFn = (env, t) => {
  whoosh(env, t, { dur: 1.0, from: 800, to: 5000, q: 6, level: 0.35, pan: -0.6, panTo: 0.6, peakAt: 0.45, wet: 0.4, reverb: 'hall' });
  const v = new Voice(env);
  const out = v.gain(1);
  const dl = v.delay(0.18, 1);
  const fb = v.gain(0.35);
  const damp = v.filter('lowpass', 5000, 0.7);
  out.connect(env.out);
  out.connect(dl);
  v.chain(dl, damp, fb, dl);
  const echoOut = v.gain(0.5);
  damp.connect(echoOut);
  echoOut.connect(env.out);
  v.keepAlive(t, t + 2.4);
  v.done();
  const sparkle = withOut(env, out);
  for (let i = 0; i < 18; i++) {
    ping(sparkle, t + rand(0, 0.9), { f: logRand(2500, 7500), decay: rand(0.15, 0.4), level: rand(0.05, 0.14), pan: rand(-0.8, 0.8), wet: 0.4, reverb: 'hall' });
  }
  return 2.4;
};

const bell: SfxFn = (env, t) => {
  bellStrike(env, t, { f: 523.25, decay: 3.2, level: 0.6, wet: 0.35, reverb: 'hall' });
  return 3.4;
};

const footsteps: SfxFn = (env, t) => {
  const n = 5;
  const iv = rand(0.45, 0.52);
  for (let i = 0; i < n; i++) {
    footstep(env, t + i * iv * rand(0.95, 1.05), { surface: 'stone', level: 0.45 + i * 0.06, pan: (i % 2 ? 0.12 : -0.12) + (i - 2) * 0.05, wet: 0.25, reverb: 'room' });
  }
  return n * iv + 0.5;
};

const page: SfxFn = (env, t) => pageTurn(env, t, { level: 0.5, wet: 0.1, reverb: 'room' });

const thunderSfx: SfxFn = (env, t) => thunder(env, t, { intensity: 1, distance: rand(0.05, 0.2) });

const explosion: SfxFn = (env, t) => {
  const v = new Voice(env);
  const mix = v.gain(1);
  const drive = v.shaper(softClipCurve(3));
  // Transient.
  const tr = v.noise('white', t, t + 0.12);
  const trl = v.filter('lowpass', 6000, 0.7);
  const trg = v.gain(0);
  perc(trg.gain, t, 0.9, 0.0005, 0.08);
  v.chain(tr, trl, trg, mix);
  // Kick.
  const kick = v.osc('sine', 70, t, t + 1);
  kick.frequency.setValueAtTime(70, t);
  kick.frequency.exponentialRampToValueAtTime(28, t + 0.5);
  const kg = v.gain(0);
  perc(kg.gain, t, 1, 0.003, 0.9);
  v.chain(kick, kg, drive);
  // Body.
  const body = v.noise('brown', t, t + 2.5, 0.7);
  const lp = v.filter('lowpass', 3000, 0.7);
  lp.frequency.setValueAtTime(3000, t);
  lp.frequency.exponentialRampToValueAtTime(80, t + 2.2);
  const bg = v.gain(0);
  perc(bg.gain, t, 1.4, 0.01, 2.4);
  v.chain(body, lp, bg, drive);
  // Mid crunch.
  const mid = v.noise('pink', t, t + 0.8);
  const mbp = v.filter('bandpass', 900, 0.7);
  const mg = v.gain(0);
  perc(mg.gain, t, 0.6, 0.005, 0.6);
  v.chain(mid, mbp, mg, mix);
  drive.connect(mix);
  v.out(mix, { wet: 0.35, reverb: 'hall' });
  v.done();
  crackleTail(env, t + 0.3, 2, 0.45, 1500);
  const debris = randInt(3, 5);
  for (let i = 0; i < debris; i++) {
    knock(env, t + rand(0.6, 2), { f: rand(70, 140), decay: 0.2, level: rand(0.15, 0.3), pan: rand(-0.7, 0.7), wet: 0.3, reverb: 'hall' });
  }
  return 3.5;
};

const shield: SfxFn = (env, t) => {
  knock(env, t, { f: 110, decay: 0.15, level: 0.7, bright: 1200, wet: 0.2, reverb: 'room' });
  metalRing(env, t, {
    f: rand(480, 620),
    ratios: [1, 1.59, 2.14, 2.65, 3.16, 3.98],
    amps: [1, 0.8, 0.6, 0.45, 0.3, 0.2],
    decay: 0.9,
    level: 0.85,
    noise: 0.7,
    noiseFreq: 2500,
    detune: 8,
    wet: 0.25,
    reverb: 'room',
  });
  return 1.4;
};

const levelUp: SfxFn = (env, t) => {
  const arp = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  arp.forEach((f, i) => {
    const v = new Voice(env);
    const s = t + i * 0.075;
    const o = v.osc('triangle', f, s, s + 1);
    const lp = v.filter('lowpass', 6000, 0.7);
    lp.frequency.setValueAtTime(6000, s);
    lp.frequency.exponentialRampToValueAtTime(1200, s + 0.4);
    const g = v.gain(0);
    perc(g.gain, s, 0.25, 0.003, 0.9);
    v.chain(o, lp, g);
    v.out(g, { pan: -0.5 + i * 0.2, wet: 0.4, reverb: 'hall' });
    v.done();
  });
  const c = t + 0.5;
  const v = new Voice(env);
  const mix = v.gain(0);
  mix.gain.setValueAtTime(0, c);
  mix.gain.linearRampToValueAtTime(0.1, c + 0.08);
  mix.gain.exponentialRampToValueAtTime(0.0001, c + 1.5);
  for (const f of [1046.5, 1318.51, 1567.98, 2093]) {
    for (const det of [-5, 5]) v.osc('sine', f, c, c + 1.55, det).connect(mix);
  }
  v.out(mix, { wet: 0.45, reverb: 'hall' });
  v.done();
  for (let i = 0; i < 6; i++) {
    ping(env, c + rand(0, 0.7), { f: logRand(3000, 7000), decay: rand(0.2, 0.5), level: rand(0.04, 0.09), pan: rand(-0.8, 0.8), wet: 0.5, reverb: 'hall' });
  }
  return 2.4;
};

const notification: SfxFn = (env, t) => {
  for (const [f, dt] of [
    [880, 0],
    [1318.51, 0.12],
  ] as const) {
    const v = new Voice(env);
    const s = t + dt;
    const mix = v.gain(1);
    const parts: readonly (readonly [number, number])[] = [
      [1, 1],
      [2, 0.15],
      [3, 0.05],
    ];
    for (const [r, a] of parts) {
      const g = v.gain(0);
      perc(g.gain, s, 0.22 * a, 0.008, 0.9 / r);
      v.chain(v.osc('sine', f * r, s, s + 0.95), g, mix);
    }
    v.out(mix, { wet: 0.2, reverb: 'room' });
    v.done();
  }
  return 1.3;
};

const turn: SfxFn = (env, t) => gong(env, t, { f: rand(128, 136), decay: 3.2, level: 0.7, wet: 0.3, reverb: 'hall' });

export const SFX: Record<SfxId, SfxFn> = {
  sword,
  arrow,
  fireball,
  lightning,
  heal,
  'door-open': doorOpen,
  'door-close': doorClose,
  'door-locked': doorLocked,
  coin,
  crit,
  fumble,
  roar,
  magic,
  bell,
  footsteps,
  page,
  thunder: thunderSfx,
  explosion,
  shield,
  'level-up': levelUp,
  notification,
  turn,
};
