/**
 * The procedural ambience presets. Each builder composes beds (continuous textures)
 * and look-ahead event streams into a LayerEnv. Levels are normalised per preset with
 * AMBIENCE_TRIM so every preset sits at a similar loudness at volume 1.
 */
import type { LayerBuilder, LayerEnv } from './layer.ts';
import { withOut } from '../core/voice.ts';
import { chance, logRand, pick, rand, randInt } from '../core/random.ts';
import {
  birds,
  bubbling,
  caveAir,
  crickets,
  crowd,
  drippers,
  drone,
  echo,
  fire,
  frogs,
  hum,
  insectBed,
  moan,
  pad,
  rain,
  rustle,
  stream,
  surf,
  warDrums,
  wind,
} from './beds.ts';
import {
  anvil,
  batFlutter,
  bellStrike,
  bubbleBurst,
  cart,
  chains,
  chime,
  clash,
  clink,
  creak,
  crowCaw,
  cuckoo,
  drip,
  duneHum,
  footstep,
  gull,
  hawkCry,
  knock,
  metalScrape,
  owl,
  pebbles,
  ping,
  ratSqueak,
  rumble,
  sapHiss,
  thunder,
  wave,
  whisper,
  wolfHowl,
  woodpecker,
  warHorn,
} from '../sounds/voices.ts';

// ───────────────────────────── Interiors / camps ─────────────────────────────

const tavern: LayerBuilder = (env) => {
  fire(env, { level: 0.55, crackle: 0.9, roar: 0.6, popsPerMin: 3, out: { pan: -0.45, wet: 0.2, reverb: 'room' } });
  crowd(env, { level: 0.5, noiseVoices: 6, talkers: 5, brightness: 1700, spread: 0.85, out: { wet: 0.35, reverb: 'room' } });
  env.events(2, 7, (t) => {
    clink(env, t, { kind: chance(0.55) ? 'mug' : 'glass', level: rand(0.12, 0.3), pan: rand(-0.8, 0.8), wet: 0.3, reverb: 'room' });
  }, 1.2);
  env.events(5, 15, (t) => {
    knock(env, t, { level: rand(0.12, 0.25), f: rand(120, 190), pan: rand(-0.8, 0.8), wet: 0.3, reverb: 'room', bright: rand(700, 1300) });
  });
  env.events(18, 45, (t) => {
    if (chance(0.5)) {
      creak(env, t, { dur: rand(0.25, 0.6), from: rand(40, 70), to: rand(60, 110), level: rand(0.08, 0.15), pan: rand(-0.8, 0.8), wet: 0.3, reverb: 'room' });
    } else {
      const n = randInt(3, 6);
      const pan = rand(-0.8, 0.8);
      for (let i = 0; i < n; i++) footstep(env, t + i * rand(0.45, 0.55), { surface: 'wood', level: rand(0.08, 0.14), pan, wet: 0.3, reverb: 'room' });
    }
  });
};

const campfire: LayerBuilder = (env) => {
  fire(env, { level: 0.85, crackle: 1, roar: 0.9, popsPerMin: 5, out: { wet: 0.1, reverb: 'open' } });
  wind(env, { level: 0.18, band: [180, 600], gust: [0.2, 0.8], gustTime: [4, 10], out: { wet: 0.1, reverb: 'open' } });
  crickets(env, { count: 3, level: 0.05, band: [3800, 4800], out: { wet: 0.4, reverb: 'open' } });
  env.events(25, 70, (t) => sapHiss(env, t, { level: rand(0.06, 0.12), pan: rand(-0.3, 0.3), wet: 0.1, reverb: 'open' }));
  env.events(60, 150, (t) => owl(env, t, { level: rand(0.05, 0.09), pan: rand(-0.9, 0.9), wet: 0.6, reverb: 'open' }));
};

// ───────────────────────────── Nature ─────────────────────────────

const forest: LayerBuilder = (env) => {
  const gust = wind(env, { level: 0.5, band: [280, 900], gust: [0.2, 1], gustTime: [3, 10], out: { wet: 0.1, reverb: 'open' } });
  rustle(env, gust, { level: 0.55, lo: 2200, hi: 7500, rate: 450, key: 'leaves' });
  birds(env, { count: 5, level: 0.11 });
  env.events(35, 100, (t) => woodpecker(env, t, { level: rand(0.12, 0.22), pan: rand(-0.9, 0.9), wet: 0.4, reverb: 'open' }), rand(8, 20));
  env.events(60, 160, (t) => cuckoo(env, t, { level: rand(0.05, 0.09), pan: rand(-0.9, 0.9), wet: 0.5, reverb: 'open' }));
};

const night: LayerBuilder = (env) => {
  crickets(env, { count: 8, level: 0.07, band: [3900, 5400], out: { wet: 0.25, reverb: 'open' } });
  insectBed(env, { level: 0.02, f: 6200, rate: 38, out: { wet: 0.3, reverb: 'open' } });
  const gust = wind(env, { level: 0.22, band: [200, 650], gust: [0.15, 0.7], gustTime: [5, 12], out: { wet: 0.1, reverb: 'open' } });
  rustle(env, gust, { level: 0.25, lo: 2200, hi: 7000, rate: 350, key: 'leaves' });
  env.events(18, 50, (t) => owl(env, t, { level: rand(0.08, 0.16), pan: rand(-0.9, 0.9), wet: 0.5, reverb: 'open' }), rand(4, 10));
  env.events(70, 180, (t) => {
    const pan = rand(-0.9, 0.9);
    wolfHowl(env, t, { level: rand(0.05, 0.09), pan, wet: 0.7, reverb: 'open' });
    if (chance(0.35)) wolfHowl(env, t + rand(1, 2.5), { level: rand(0.03, 0.06), pan: -pan * 0.6, wet: 0.8, reverb: 'open' });
  }, rand(25, 60));
};

const ocean: LayerBuilder = (env) => {
  surf(env, { level: 0.55, out: { wet: 0.1, reverb: 'open' } });
  let set = 0;
  env.add({
    next: env.t0 + 0.3,
    fire: (t) => {
      // Waves come in sets: a few bigger ones, then smaller ones.
      set = (set + 1) % randInt(4, 7);
      const size = set < 2 ? rand(0.6, 1) : rand(0.25, 0.65);
      const d = wave(env, t, { size, level: 0.85, pan: rand(-0.5, 0.5), wet: 0.15, reverb: 'open' });
      return Math.max(3.5, d * rand(0.55, 0.85));
    },
  });
  wind(env, { level: 0.12, band: [300, 900], gust: [0.2, 0.8], out: { wet: 0.1, reverb: 'open' } });
  env.events(12, 35, (t) => gull(env, t, { level: rand(0.04, 0.09), pan: rand(-0.9, 0.9), wet: 0.4, reverb: 'open' }), rand(3, 8));
};

const swamp: LayerBuilder = (env) => {
  frogs(env, { count: 5, level: 0.16, out: { wet: 0.25, reverb: 'open' } });
  insectBed(env, { level: 0.03, f: 5200, rate: 46, out: { wet: 0.25, reverb: 'open' } });
  crickets(env, { count: 3, level: 0.04, band: [4200, 5200], out: { wet: 0.3, reverb: 'open' } });
  bubbling(env, { level: 0.12, perSec: 3, fLo: 120, fHi: 500, out: { wet: 0.15, reverb: 'open' } });
  wind(env, { level: 0.12, band: [150, 450], gust: [0.2, 0.7], gustTime: [5, 12], out: { wet: 0.1, reverb: 'open' } });
  const water = env.bed.noise('pink', env.t0);
  const wg = env.bed.gain(0.3);
  env.walk(wg.gain, 0.15, 0.45, 0.5, 1.5);
  env.bed.chain(water, env.bed.filter('lowpass', 480, 0.7), wg);
  env.bed.out(wg, { level: 0.25 });
  env.events(4, 12, (t) => bubbleBurst(env, t, { n: randInt(2, 7), fLo: 140, fHi: 520, level: rand(0.08, 0.18), pan: rand(-0.8, 0.8), wet: 0.15, reverb: 'open' }));
  env.events(40, 110, (t) => crowCaw(env, t, { level: rand(0.05, 0.1), pan: rand(-0.9, 0.9), wet: 0.5, reverb: 'open' }), rand(15, 40));
};

// ───────────────────────────── Weather ─────────────────────────────

const rainPreset: LayerBuilder = (env) => {
  rain(env, { level: 0.75 });
};

const storm: LayerBuilder = (env) => {
  rain(env, { level: 0.8, heavy: true });
  wind(env, { level: 0.55, band: [250, 1000], gust: [0.25, 1], gustTime: [1.5, 5], howl: 0.3, howlBand: [300, 750], out: { wet: 0.1, reverb: 'open' } });
  env.add({
    next: env.t0 + rand(4, 10),
    fire: (t) => {
      const close = chance(0.25);
      thunder(env, t, { intensity: close ? rand(0.8, 1) : rand(0.5, 0.85), distance: close ? rand(0.05, 0.35) : rand(0.45, 1) });
      return rand(12, 40);
    },
  });
};

const desert: LayerBuilder = (env) => {
  const gust = wind(env, { level: 0.55, band: [250, 850], gust: [0.25, 1], gustTime: [3, 9], out: { wet: 0.08, reverb: 'open' } });
  wind(env, { level: 0.18, band: [700, 1600], q: 1.2, gust: [0.1, 0.8], gustTime: [2, 6], noise: 'white' });
  rustle(env, gust, { level: 0.5, lo: 4500, hi: 11000, rate: 900, key: 'sand' });
  env.events(70, 160, (t) => duneHum(env, t, { level: rand(0.1, 0.18), pan: rand(-0.6, 0.6), wet: 0.4, reverb: 'open' }), rand(20, 50));
  env.events(40, 100, (t) => hawkCry(env, t, { level: rand(0.04, 0.08), pan: rand(-0.9, 0.9), wet: 0.55, reverb: 'open' }), rand(10, 30));
};

const blizzard: LayerBuilder = (env) => {
  const gust = wind(env, {
    level: 0.6,
    band: [250, 1100],
    gust: [0.35, 1],
    gustTime: [1.5, 5],
    howl: 0.6,
    howlBand: [320, 900],
    whistle: 0.5,
    whistleBand: [1100, 2600],
    out: { wet: 0.12, reverb: 'open' },
  });
  rustle(env, gust, { level: 0.35, lo: 5500, hi: 12000, rate: 700, key: 'ice' });
  const low = env.bed.noise('brown', env.t0);
  const lg = env.bed.gain(0.6);
  env.walk(lg.gain, 0.35, 0.9, 3, 8);
  env.bed.chain(low, env.bed.filter('lowpass', 200, 0.7), lg);
  env.bed.out(lg, { level: 0.6 });
  env.events(30, 80, (t) => creak(env, t, { dur: rand(0.6, 1.4), from: rand(35, 55), to: rand(50, 80), level: rand(0.05, 0.1), pan: rand(-0.9, 0.9), wet: 0.3, reverb: 'open' }));
};

// ───────────────────────────── Underground ─────────────────────────────

const dungeon: LayerBuilder = (env) => {
  drone(env, { level: 0.5, root: 55, cutoff: [130, 330], out: { wet: 0.2, reverb: 'cave' } });
  const air = env.bed.noise('brown', env.t0, undefined, 0.8);
  const ag = env.bed.gain(0.5);
  env.walk(ag.gain, 0.2, 0.7, 4, 10);
  env.bed.chain(air, env.bed.filter('bandpass', 220, 2), ag);
  env.bed.out(ag, { level: 0.35, wet: 0.2, reverb: 'cave' });
  drippers(env, { count: 2, level: 0.18, fRange: [700, 1500], period: [1.4, 4], wet: 0.7, reverb: 'cave' });
  env.events(2, 7, (t) => drip(env, t, { f: rand(600, 1800), level: rand(0.06, 0.15), pan: rand(-1, 1), wet: 0.8, reverb: 'cave' }));
  env.events(18, 45, (t) => chains(env, t, { level: rand(0.1, 0.2), pan: rand(-0.9, 0.9), wet: 0.8, reverb: 'cave' }), rand(5, 15));
  env.events(25, 60, (t) => metalScrape(env, t, { level: rand(0.04, 0.08), pan: rand(-0.9, 0.9), wet: 1, reverb: 'cave' }), rand(10, 25));
  env.events(40, 90, (t) => rumble(env, t, { level: rand(0.35, 0.6), pan: rand(-0.5, 0.5), wet: 0.5, reverb: 'cave' }), rand(15, 40));
  env.events(45, 110, (t) => ratSqueak(env, t, { level: rand(0.03, 0.06), pan: rand(-1, 1), wet: 0.5, reverb: 'cave' }));
};

const cave: LayerBuilder = (env) => {
  caveAir(env, { level: 0.6, out: { wet: 0.25, reverb: 'cave' } });
  stream(env, { level: 0.25, out: { pan: rand(-0.6, 0.6), wet: 0.6, reverb: 'cave' } });
  drippers(env, { count: 3, level: 0.2, fRange: [600, 2000], period: [0.9, 3.5], wet: 0.85, reverb: 'cave' });
  env.events(1.5, 5, (t) => drip(env, t, { f: rand(500, 2200), level: rand(0.05, 0.14), pan: rand(-1, 1), wet: 0.9, reverb: 'cave' }));
  env.events(20, 50, (t) => pebbles(env, t, { level: rand(0.1, 0.2), pan: rand(-0.9, 0.9), wet: 0.8, reverb: 'cave' }), rand(6, 15));
  env.events(60, 120, (t) => rumble(env, t, { level: rand(0.3, 0.5), wet: 0.6, reverb: 'cave' }), rand(20, 50));
  env.events(30, 80, (t) => batFlutter(env, t, { level: rand(0.06, 0.12), wet: 0.5, reverb: 'cave' }), rand(12, 30));
};

const crypt: LayerBuilder = (env) => {
  pad(env, {
    chords: [
      [73.42, 110, 174.61, 220, 329.63],
      [69.3, 103.83, 164.81, 207.65, 311.13],
      [73.42, 116.54, 174.61, 233.08, 277.18],
      [65.41, 98, 155.56, 196, 293.66],
    ],
    level: 0.09,
    type: 'triangle',
    detune: 9,
    cutoff: [400, 1100],
    swell: [0.05, 0.7],
    vibrato: 6,
    changeEvery: [30, 70],
    out: { wet: 0.45, reverb: 'hall' },
  });
  moan(env, { level: 0.08, band: [220, 520], out: { wet: 0.6, reverb: 'hall' } });
  drippers(env, { count: 1, level: 0.08, fRange: [800, 1400], period: [3, 6], wet: 0.8, reverb: 'cave' });
  env.events(12, 30, (t) => whisper(env, t, { level: rand(0.08, 0.16), pan: rand(-0.95, 0.95), wet: 0.7, reverb: 'hall' }), rand(4, 10));
  const scale = [587.33, 622.25, 739.99, 880, 932.33, 1108.73, 1174.66, 1244.5, 1479.98];
  env.events(10, 28, (t) => {
    const n = randInt(1, 4);
    let tt = t;
    for (let i = 0; i < n; i++) {
      chime(env, tt, { f: pick(scale), level: rand(0.05, 0.1), pan: rand(-0.9, 0.9), wet: 0.85, reverb: 'hall' });
      tt += rand(0.4, 1.3);
    }
  }, rand(3, 8));
  env.events(40, 100, (t) => metalScrape(env, t, { level: rand(0.03, 0.06), pan: rand(-1, 1), wet: 1, reverb: 'hall' }));
};

// ───────────────────────────── Civilisation ─────────────────────────────

const city: LayerBuilder = (env) => {
  crowd(env, { level: 0.45, noiseVoices: 8, talkers: 5, brightness: 2400, spread: 1, out: { wet: 0.2, reverb: 'open' }, pitch: [100, 240] });
  const din = env.bed.noise('pink', env.t0);
  const dinG = env.bed.gain(0.18);
  env.bed.chain(din, env.bed.filter('lowpass', 800, 0.6), dinG);
  env.bed.out(dinG, { wet: 0.1, reverb: 'open' });
  env.events(20, 50, (t) => anvil(env, t, { level: rand(0.12, 0.2), pan: rand(-0.9, 0.9), wet: 0.45, reverb: 'open' }), rand(3, 10));
  env.events(14, 35, (t) => cart(env, t, { level: rand(0.25, 0.4), dir: chance(0.5) ? 1 : -1, wet: 0.2, reverb: 'open' }), rand(6, 15));
  env.events(60, 150, (t) => {
    const strikes = randInt(3, 6);
    const f = rand(220, 330);
    const pan = rand(-0.7, 0.7);
    for (let i = 0; i < strikes; i++) bellStrike(env, t + i * rand(2.2, 2.8), { f, decay: 5, level: 0.18, pan, wet: 0.6, reverb: 'hall', bright: 0.7 });
  }, rand(15, 40));
  env.events(12, 30, (t) => {
    const n = randInt(5, 10);
    const pan = rand(-0.9, 0.9);
    for (let i = 0; i < n; i++) footstep(env, t + i * rand(0.42, 0.52), { surface: 'stone', level: rand(0.05, 0.1), pan, wet: 0.2, reverb: 'open' });
  });
  env.events(25, 60, (t) => clink(env, t, { kind: 'metal', level: rand(0.06, 0.12), pan: rand(-0.9, 0.9), wet: 0.3, reverb: 'open' }));
};

const battle: LayerBuilder = (env) => {
  warDrums(env, { level: 0.55, out: { wet: 0.35, reverb: 'open' } });
  // Distant army roar that surges and ebbs.
  const b = env.bed;
  const roarBus = b.gain(0.6);
  env.walk(roarBus.gain, 0.2, 1, 3, 8);
  const lvl = b.gain(0.4);
  b.chain(roarBus, b.filter('lowpass', 1500, 0.6), lvl);
  b.out(lvl, { wet: 0.35, reverb: 'open' });
  const roar = b.noise('pink', env.t0);
  b.chain(roar, b.filter('bandpass', 650, 1.1), b.gain(1.2), roarBus);
  for (let i = 0; i < 5; i++) {
    const f0 = rand(110, 210);
    const osc = b.osc('sawtooth', f0, env.t0);
    env.walk(osc.frequency, f0 * 0.85, f0 * 1.25, 0.3, 1.2, true);
    const f1 = b.filter('bandpass', rand(650, 780), 6);
    const g = b.gain(0);
    env.walk(g.gain, 0, 0.18, 0.4, 2);
    b.chain(osc, f1, g, b.pan(rand(-0.9, 0.9)), roarBus);
  }
  // Clash intensity drifts so the battle swells and calms.
  let intensity = 0.5;
  env.events(4, 10, () => {
    intensity = rand(0.15, 1);
  }, 0);
  env.add({
    next: env.t0 + 0.8,
    fire: (t) => {
      const n = chance(0.3) ? randInt(2, 4) : 1;
      for (let i = 0; i < n; i++) {
        clash(env, t + i * rand(0.08, 0.25), { level: rand(0.08, 0.25) * (0.5 + intensity), pan: rand(-0.95, 0.95), wet: 0.5, reverb: 'open', lowpass: rand(2500, 4500) });
      }
      return rand(0.3, 1.6) / (0.4 + intensity);
    },
  });
  env.events(25, 60, (t) => warHorn(env, t, { f: pick([98, 110, 87.31]), level: rand(0.12, 0.2), pan: rand(-0.8, 0.8), wet: 0.6, reverb: 'open' }), rand(4, 12));
};

const arcane: LayerBuilder = (env) => {
  const lydian = [110, 165, 220, 277.18, 311.13, 415.3, 554.37, 659.25];
  pad(env, {
    chords: [lydian, [98, 146.83, 196, 246.94, 277.18, 369.99, 493.88, 587.33]],
    level: 0.05,
    type: 'sine',
    detune: 4,
    cutoff: [1800, 4000],
    swell: [0, 0.8],
    vibrato: 3,
    changeEvery: [40, 90],
    out: { wet: 0.4, reverb: 'hall' },
  });
  // High shimmer partials with tremolo.
  const b = env.bed;
  const shimmer = b.gain(0.02);
  b.out(shimmer, { wet: 0.6, reverb: 'hall' });
  for (const f of [1760, 2217.46, 2637.02]) {
    const o = b.osc('sine', f * rand(0.998, 1.002), env.t0);
    const g = b.gain(0);
    env.walk(g.gain, 0, 1, 2, 7);
    const trem = b.gain(0.5);
    const lf = b.osc('sine', rand(4, 7), env.t0);
    const ld = b.gain(0.5);
    lf.connect(ld);
    ld.connect(trem.gain);
    b.chain(o, g, trem, shimmer);
  }
  hum(env, { level: 0.12, f: 55, out: { wet: 0.15, reverb: 'room' } });
  bubbling(env, { level: 0.03, perSec: 4, fLo: 300, fHi: 900, out: { pan: 0.6, wet: 0.3, reverb: 'room' } });
  const echoIn = echo(env, { time: 0.36, feedback: 0.42, damp: 3500, level: 0.6, out: { wet: 0.4, reverb: 'hall' } });
  const sparkleOut = b.gain(1);
  sparkleOut.connect(env.out);
  sparkleOut.connect(echoIn);
  const sparkleEnv = withOut(env, sparkleOut);
  const scale = [440, 493.88, 554.37, 622.25, 659.25, 739.99, 830.61];
  env.events(7, 18, (t) => {
    const n = randInt(6, 14);
    const rate = rand(7, 12);
    const up = chance(0.6);
    let idx = randInt(0, scale.length - 1);
    let oct = up ? randInt(1, 2) : randInt(3, 4);
    const panFrom = rand(-0.9, 0.9);
    const panTo = -panFrom;
    for (let i = 0; i < n; i++) {
      const f = (scale[idx] ?? 440) * Math.pow(2, oct - 1);
      ping(sparkleEnv, t + i / rate, { f, decay: rand(0.6, 1.3), fm: rand(0.5, 1.5), level: rand(0.04, 0.08), pan: panFrom + ((panTo - panFrom) * i) / n, wet: 0.6, reverb: 'hall' });
      idx += up ? randInt(1, 2) : -randInt(1, 2);
      if (idx >= scale.length) {
        idx -= scale.length;
        oct++;
      } else if (idx < 0) {
        idx += scale.length;
        oct--;
      }
      oct = Math.max(1, Math.min(4, oct));
    }
  }, rand(2, 5));
  env.events(3, 9, (t) => ping(sparkleEnv, t, { f: logRand(2000, 6000), decay: rand(0.3, 0.8), level: rand(0.015, 0.035), pan: rand(-1, 1), wet: 0.7, reverb: 'hall' }));
};

export const AMBIENCE_BUILDERS: Record<string, LayerBuilder> = {
  tavern,
  campfire,
  forest,
  night,
  rain: rainPreset,
  storm,
  dungeon,
  cave,
  crypt,
  ocean,
  city,
  battle,
  arcane,
  desert,
  blizzard,
  swamp,
};

/** Per-preset loudness trim (multiplies the user volume). Tuned from offline RMS measurements. */
export const AMBIENCE_TRIM: Record<string, number> = {
  tavern: 1,
  campfire: 1,
  forest: 1,
  night: 1,
  rain: 1,
  storm: 1,
  dungeon: 1,
  cave: 1,
  crypt: 1,
  ocean: 1,
  city: 1,
  battle: 1,
  arcane: 1,
  desert: 1,
  blizzard: 1,
  swamp: 1,
};

export type { LayerEnv };
