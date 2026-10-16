/**
 * Look-ahead event scheduling. A single engine-level setInterval (~100 ms) asks each
 * ambience layer to schedule everything that falls inside [now, now + lookahead) using
 * AudioContext time, so timing is sample-accurate and independent of timer jitter.
 */
import { curveTo } from './voice.ts';
import { logRand, rand } from './random.ts';

export interface EventStream {
  /** Audio time of the next event. */
  next: number;
  /** Schedules the event at audio time `t`; returns seconds until the following event. */
  fire(t: number): number;
}

const MAX_EVENTS_PER_TICK = 96;

export function runStreams(streams: readonly EventStream[], now: number, horizon: number): void {
  for (const s of streams) {
    let guard = 0;
    while (s.next < horizon && guard++ < MAX_EVENTS_PER_TICK) {
      // Late (throttled timer / suspended tab): fire right away instead of in the past.
      const t = s.next < now ? now + 0.02 : s.next;
      let gap: number;
      try {
        gap = s.fire(t);
      } catch (err) {
        console.warn('[audio] scheduled event failed', err);
        gap = 5;
      }
      s.next = t + (Number.isFinite(gap) ? Math.max(0.005, gap) : Infinity);
    }
  }
}

/** Random events with a gap drawn from [minGap, maxGap]. */
export function randomEvents(start: number, minGap: number, maxGap: number, fire: (t: number) => void): EventStream {
  return {
    next: start,
    fire(t) {
      fire(t);
      return rand(minGap, maxGap);
    },
  };
}

export interface WalkOptions {
  min: number;
  max: number;
  minDur: number;
  maxDur: number;
  start: number;
  /** Starting value; defaults to the param's current (constructor) value. */
  init?: number;
  /** Pick targets log-uniformly (frequencies). */
  exp?: boolean;
}

/**
 * Smooth random walk of an AudioParam: every few seconds glide (cosine curve) to a new
 * random target. Gives organic, never-repeating movement (gusts, swells, formants…).
 */
export function walk(p: AudioParam, o: WalkOptions): EventStream {
  let last = o.init ?? p.value;
  return {
    next: o.start,
    fire(t) {
      const dur = rand(o.minDur, o.maxDur);
      const target = o.exp ? logRand(o.min, o.max) : rand(o.min, o.max);
      curveTo(p, last, target, t, dur);
      last = target;
      return dur;
    },
  };
}
