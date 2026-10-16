/**
 * Streaming music via HTMLAudioElement → MediaElementAudioSourceNode (so it shares the
 * engine's channel gains / limiter). Every client seeks to (now − startedAt) so all
 * players stay in sync; src changes crossfade, stop fades out.
 *
 * Cross-origin files without CORS headers cannot be routed through WebAudio (they would
 * be silent), so such tracks fall back to "direct" playback using element.volume.
 */
import type { MusicState } from './types.ts';
import { clamp, toGain } from './core/random.ts';

export interface MusicHost {
  /** AudioContext (created on demand) or null if WebAudio is unavailable. */
  context(): AudioContext | null;
  /** Music channel input. */
  output(): AudioNode | null;
  /** master × music channel × mute, as linear gain — used for direct (non-WebAudio) playback. */
  directGain(): number;
}

interface Track {
  state: MusicState;
  el: HTMLAudioElement;
  source: MediaElementAudioSourceNode | null;
  gain: GainNode | null;
  direct: boolean;
  triedFallback: boolean;
  playing: boolean;
  blocked: boolean;
  ended: boolean;
  disposed: boolean;
  /** Fade multiplier target (0..1) applied on top of the track volume. */
  fade: number;
  /** Current fade multiplier for direct mode stepping. */
  fadeNow: number;
  fadeTimer: ReturnType<typeof setInterval> | null;
  startTimer: ReturnType<typeof setTimeout> | null;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  /** Track this one replaces (faded out once this one actually starts). */
  replaces: Track | null;
  fadeInTime: number;
}

const CROSSFADE = 2;
const STOP_FADE = 1.5;
const FIRST_FADE = 1;
const DRIFT_TOLERANCE = 0.75;

function needsCors(src: string): boolean {
  try {
    const u = new URL(src, location.href);
    if (u.protocol === 'blob:' || u.protocol === 'data:') return false;
    return u.origin !== location.origin;
  } catch {
    return false;
  }
}

export class MusicPlayer {
  private readonly host: MusicHost;
  private current: Track | null = null;
  private readonly retiring = new Set<Track>();

  constructor(host: MusicHost) {
    this.host = host;
  }

  get active(): boolean {
    return this.current !== null || this.retiring.size > 0;
  }

  get state(): MusicState | null {
    return this.current ? { ...this.current.state } : null;
  }

  play(m: MusicState | null): void {
    if (!m || !m.src) {
      if (this.current) {
        this.retire(this.current, STOP_FADE);
        this.current = null;
      }
      return;
    }
    const cur = this.current;
    if (cur && cur.state.src === m.src) {
      const prev = cur.state;
      cur.state = { ...m };
      if (prev.loop !== m.loop) cur.el.loop = m.loop;
      if (prev.startedAt !== m.startedAt) {
        cur.ended = false;
        this.resync(cur, true);
      }
      if (prev.volume !== m.volume) this.applyLevel(cur, 0.6);
      return;
    }
    const next = this.createTrack(m, false);
    next.replaces = cur;
    next.fadeInTime = cur ? CROSSFADE : FIRST_FADE;
    this.current = next;
    if (cur) {
      // If the new track never starts (load error, autoplay block), don't keep the old one forever.
      const old = cur;
      setTimeout(() => {
        if (next.replaces === old) {
          next.replaces = null;
          this.retire(old, CROSSFADE);
        }
      }, 10000);
    }
    this.start(next);
  }

  /** Call synchronously inside a user gesture: retries playback that the autoplay policy blocked. */
  kick(): void {
    const t = this.current;
    if (!t || t.disposed || t.ended || t.playing) return;
    if (!t.blocked && t.el.readyState < 1) return;
    t.blocked = false;
    const p = t.el.play();
    p.then(() => {
      if (t.disposed) return;
      this.resync(t, false);
      this.onStarted(t);
    }).catch(() => {
      t.blocked = true;
    });
  }

  /** Corrects drift > tolerance (e.g. after buffering stalls or a backgrounded tab). */
  checkDrift(): void {
    const t = this.current;
    if (!t || !t.playing || t.disposed || t.el.paused || t.el.seeking) return;
    const expected = this.expectedPosition(t);
    if (expected === null) return;
    const d = t.el.duration;
    let diff = Math.abs(t.el.currentTime - expected);
    if (t.state.loop && Number.isFinite(d) && d > 0) diff = Math.min(diff, d - diff);
    if (diff > DRIFT_TOLERANCE) this.resync(t, true);
  }

  /** Re-applies volumes of direct-mode tracks after master/channel/mute changes. */
  refreshDirect(): void {
    for (const t of [this.current, ...this.retiring]) {
      if (t && t.direct && !t.disposed) this.setDirectVolume(t);
    }
  }

  dispose(): void {
    if (this.current) this.disposeTrack(this.current);
    for (const t of this.retiring) this.disposeTrack(t);
    this.current = null;
    this.retiring.clear();
  }

  // ─────────────────────────────────────────────────────────────

  private createTrack(m: MusicState, forceDirect: boolean): Track {
    const el = new Audio();
    el.preload = 'auto';
    el.loop = m.loop;
    const cors = !forceDirect && needsCors(m.src);
    if (cors) el.crossOrigin = 'anonymous';
    const t: Track = {
      state: { ...m },
      el,
      source: null,
      gain: null,
      direct: forceDirect,
      triedFallback: forceDirect || !cors,
      playing: false,
      blocked: false,
      ended: false,
      disposed: false,
      fade: 0,
      fadeNow: 0,
      fadeTimer: null,
      startTimer: null,
      disposeTimer: null,
      replaces: null,
      fadeInTime: FIRST_FADE,
    };
    this.wire(t);
    el.src = m.src;
    return t;
  }

  private wire(t: Track): void {
    const el = t.el;
    el.addEventListener('ended', () => {
      if (t.el === el && !t.state.loop) {
        t.ended = true;
        t.playing = false;
      }
    });
    el.addEventListener('error', () => {
      if (t.el === el) this.onError(t);
    });
    if (!t.direct) {
      const ctx = this.host.context();
      const out = this.host.output();
      if (ctx && out) {
        try {
          t.source = new MediaElementAudioSourceNode(ctx, { mediaElement: el });
          t.gain = new GainNode(ctx, { gain: 0 });
          t.source.connect(t.gain);
          t.gain.connect(out);
        } catch {
          t.direct = true;
        }
      } else {
        t.direct = true;
      }
    }
    if (t.direct) el.volume = 0;
  }

  private onError(t: Track): void {
    if (t.disposed) return;
    if (!t.triedFallback) {
      // Probably a cross-origin file without CORS: retry without WebAudio routing.
      t.triedFallback = true;
      this.teardownElement(t);
      const el = new Audio();
      el.preload = 'auto';
      el.loop = t.state.loop;
      t.el = el;
      t.direct = true;
      t.source = null;
      t.gain = null;
      this.wire(t);
      el.src = t.state.src;
      this.start(t);
      return;
    }
    console.warn('[audio] failed to load music:', t.state.src);
    if (t.replaces) {
      this.retire(t.replaces, CROSSFADE);
      t.replaces = null;
    }
  }

  /** Expected playback position (s); negative = starts in the future; null = already finished. */
  private expectedPosition(t: Track): number | null {
    const elapsed = (Date.now() - t.state.startedAt) / 1000;
    const d = t.el.duration;
    if (elapsed < 0) return elapsed;
    if (!Number.isFinite(d) || d <= 0) return elapsed;
    if (t.state.loop) return elapsed % d;
    if (elapsed >= d - 0.05) return null;
    return elapsed;
  }

  private start(t: Track): void {
    const go = (): void => {
      if (t.disposed) return;
      const pos = this.expectedPosition(t);
      if (pos === null) {
        t.ended = true;
        if (t.replaces) {
          this.retire(t.replaces, CROSSFADE);
          t.replaces = null;
        }
        return;
      }
      if (pos < 0) {
        t.startTimer = setTimeout(go, Math.min(-pos * 1000, 2 ** 31 - 1));
        return;
      }
      try {
        t.el.currentTime = pos;
      } catch {
        /* not seekable yet */
      }
      t.el
        .play()
        .then(() => this.onStarted(t))
        .catch(() => {
          // Autoplay policy: wait for AudioEngine.unlock() → kick().
          t.blocked = true;
        });
    };
    if (t.el.readyState >= 1) go();
    else t.el.addEventListener('loadedmetadata', go, { once: true });
  }

  private onStarted(t: Track): void {
    if (t.disposed || t.playing) return;
    t.playing = true;
    t.blocked = false;
    this.setFade(t, 1, t.fadeInTime);
    if (t.replaces) {
      this.retire(t.replaces, CROSSFADE);
      t.replaces = null;
    }
  }

  private resync(t: Track, dip: boolean): void {
    if (t.disposed) return;
    const pos = this.expectedPosition(t);
    if (pos === null) {
      // Track is over for everyone.
      t.ended = true;
      this.setFade(t, 0, 0.5);
      setTimeout(() => {
        if (!t.disposed && t.ended) t.el.pause();
      }, 600);
      return;
    }
    if (pos < 0) {
      t.el.pause();
      t.playing = false;
      this.start(t);
      return;
    }
    const seek = (): void => {
      if (t.disposed) return;
      try {
        t.el.currentTime = pos + (dip ? 0.15 : 0);
      } catch {
        /* ignore */
      }
      if (t.el.paused) {
        // Restart (e.g. a finished track re-triggered with a new startedAt).
        t.playing = false;
        t.el
          .play()
          .then(() => this.onStarted(t))
          .catch(() => {
            t.blocked = true;
          });
      } else if (dip) {
        this.setFade(t, 1, 0.3);
      }
    };
    if (dip && t.playing) {
      this.setFade(t, 0, 0.12);
      setTimeout(seek, 150);
    } else {
      seek();
    }
  }

  private applyLevel(t: Track, time: number): void {
    if (t.direct) this.setDirectVolume(t);
    else this.setFade(t, t.fade, time);
  }

  private setFade(t: Track, fade: number, time: number): void {
    t.fade = fade;
    const level = toGain(t.state.volume) * fade;
    if (!t.direct && t.gain) {
      const ctx = t.gain.context;
      const p = t.gain.gain;
      const now = ctx.currentTime;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(level, now + Math.max(0.02, time));
      return;
    }
    // Direct mode: step element.volume.
    if (t.fadeTimer) clearInterval(t.fadeTimer);
    const from = t.fadeNow;
    const steps = Math.max(1, Math.round((time * 1000) / 40));
    let i = 0;
    t.fadeTimer = setInterval(() => {
      i++;
      t.fadeNow = from + ((fade - from) * i) / steps;
      this.setDirectVolume(t);
      if (i >= steps && t.fadeTimer) {
        clearInterval(t.fadeTimer);
        t.fadeTimer = null;
      }
    }, 40);
  }

  private setDirectVolume(t: Track): void {
    try {
      t.el.volume = clamp(toGain(t.state.volume) * t.fadeNow * this.host.directGain(), 0, 1);
    } catch {
      /* ignore */
    }
  }

  private retire(t: Track, time: number): void {
    if (t.disposed) return;
    if (this.current === t) this.current = null;
    this.retiring.add(t);
    if (t.startTimer) clearTimeout(t.startTimer);
    if (!t.playing) {
      this.disposeTrack(t);
      return;
    }
    this.setFade(t, 0, time);
    if (t.disposeTimer) clearTimeout(t.disposeTimer);
    t.disposeTimer = setTimeout(() => this.disposeTrack(t), (time + 0.15) * 1000);
  }

  private teardownElement(t: Track): void {
    try {
      t.el.pause();
      t.el.removeAttribute('src');
      t.el.load();
    } catch {
      /* ignore */
    }
    t.source?.disconnect();
    t.gain?.disconnect();
  }

  private disposeTrack(t: Track): void {
    if (t.disposed) return;
    t.disposed = true;
    if (t.fadeTimer) clearInterval(t.fadeTimer);
    if (t.startTimer) clearTimeout(t.startTimer);
    if (t.disposeTimer) clearTimeout(t.disposeTimer);
    this.teardownElement(t);
    this.retiring.delete(t);
    if (this.current === t) this.current = null;
  }
}
