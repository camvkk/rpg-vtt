// Headless audio bridge, mounted once in the table:
//  - unlocks the AudioEngine on the first user gesture (browsers block autoplay);
//  - mirrors the shared campaign audio state (music synced by startedAt, ambience layers);
//  - plays broadcast SFX and the "your turn" chime;
//  - applies this viewer's personal volume preferences and mute.
import { useEffect } from 'react';
import { create } from 'zustand';
import type { AudioState } from '@shared/types.ts';
import { assetUrl } from '../../net/api.ts';
import { getPref, setPref } from '../../net/session.ts';
import { onFx } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useUi } from '../../store/ui.ts';
import { AMBIENCE_PRESETS, AudioEngine, SFX_LIST, type AmbienceMix, type MusicState, type SfxId } from './engine/index.ts';

// ---------------------------------------------------------------------------
// Personal preferences (local to this browser)
// ---------------------------------------------------------------------------

export type AudioPrefKey = 'master' | 'music' | 'ambience' | 'sfx';
export type AudioPrefs = Record<AudioPrefKey, number>;

const PREF_DEFAULTS: AudioPrefs = { master: 0.8, music: 0.8, ambience: 0.8, sfx: 0.9 };

function loadPref(k: AudioPrefKey): number {
  const v = Number(getPref(`audio.${k}`, PREF_DEFAULTS[k]));
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : PREF_DEFAULTS[k];
}

interface AudioPrefsStore extends AudioPrefs {
  setVolume(k: AudioPrefKey, v: number): void;
}

export const useAudioPrefs = create<AudioPrefsStore>((set) => ({
  master: loadPref('master'),
  music: loadPref('music'),
  ambience: loadPref('ambience'),
  sfx: loadPref('sfx'),
  setVolume: (k, v) => {
    const value = Math.min(1, Math.max(0, v));
    set({ [k]: value } as Partial<AudioPrefs>);
    setPref(`audio.${k}`, value);
    applyAudioPrefs();
  },
}));

/** Push personal volumes (× the table master volume) and mute into the engine. */
export function applyAudioPrefs(): void {
  const engine = AudioEngine.get();
  const p = useAudioPrefs.getState();
  const table = useGame.getState().state?.audio.masterVolume ?? 1;
  engine.setMasterVolume(p.master * (Number.isFinite(table) ? table : 1));
  engine.setChannelVolume('music', p.music);
  engine.setChannelVolume('ambience', p.ambience);
  engine.setChannelVolume('sfx', p.sfx);
  engine.setMuted(useUi.getState().muted);
}

/** Toggle the personal mute (shared with the top bar via useUi.muted). */
export function setAudioMuted(muted: boolean): void {
  setPref('muted', muted);
  useUi.getState().set({ muted });
  AudioEngine.get().setMuted(muted);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SFX_IDS = new Set<string>(SFX_LIST.map((s) => s.id));
const PRESET_IDS = new Set<string>(AMBIENCE_PRESETS.map((p) => p.id));

export function isSfxId(id: string): id is SfxId {
  return SFX_IDS.has(id);
}

function ambienceMix(audio: AudioState | undefined): AmbienceMix {
  const out: AmbienceMix = {};
  for (const [id, layer] of Object.entries(audio?.ambience ?? {})) {
    if (PRESET_IDS.has(id)) out[id] = { volume: Number(layer?.volume ?? 1) };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AudioSync(): null {
  useEffect(() => {
    const engine = AudioEngine.get();
    applyAudioPrefs();

    // (1) Unlock on the first gesture. The engine also listens, this just makes it explicit.
    const gestures = ['pointerdown', 'keydown', 'touchend'] as const;
    const removeGestures = () => {
      for (const ev of gestures) window.removeEventListener(ev, onGesture, true);
    };
    function onGesture() {
      if (engine.unlocked) {
        removeGestures();
        return;
      }
      void engine.unlock().then(() => {
        if (engine.unlocked) removeGestures();
      });
    }
    if (!engine.unlocked) for (const ev of gestures) window.addEventListener(ev, onGesture, true);

    // (2) Mirror the campaign audio state.
    let musicKey = '';
    let lastServerStart: number | null = null;
    let lastLocalStart = 0;
    let ambienceKey = '';
    let tableMaster: number | null = null;

    const sync = () => {
      const g = useGame.getState();
      const audio = g.state?.audio;
      const music = audio?.music ?? null;

      let next: MusicState | null = null;
      if (music && music.src) {
        // startedAt is server time; the engine seeks with the local clock (Date.now() − startedAt).
        let localStart = music.startedAt - g.serverOffset;
        // Don't re-seek on reconnects when only the clock-offset estimate jittered.
        if (lastServerStart === music.startedAt && Math.abs(localStart - lastLocalStart) < 2_000) localStart = lastLocalStart;
        lastServerStart = music.startedAt;
        lastLocalStart = localStart;
        const src = music.src.startsWith('ambience:') ? music.src : assetUrl(music.src) ?? music.src;
        next = { src, startedAt: localStart, loop: music.loop, volume: music.volume };
      } else {
        lastServerStart = null;
      }
      const mk = next ? `${next.src}|${next.startedAt}|${next.loop}|${next.volume}` : '';
      if (mk !== musicKey) {
        musicKey = mk;
        engine.playMusic(next);
      }

      const mix = ambienceMix(audio);
      const ak = JSON.stringify(mix);
      if (ak !== ambienceKey) {
        ambienceKey = ak;
        engine.setAmbience(mix);
      }

      const tm = audio?.masterVolume ?? 1;
      if (tm !== tableMaster) {
        tableMaster = tm;
        applyAudioPrefs();
      }
    };
    sync();

    const unsubGame = useGame.subscribe((s, prev) => {
      if (s.state?.audio !== prev.state?.audio || s.serverOffset !== prev.serverOffset) sync();
    });
    const unsubUi = useUi.subscribe((s, prev) => {
      if (s.muted !== prev.muted) engine.setMuted(s.muted);
    });

    // (3) Effects.
    const unsubFx = onFx((e) => {
      if (e.type === 'sfx') {
        if (isSfxId(e.id)) engine.playSfx(e.id);
      } else if (e.type === 'turn') {
        const me = useGame.getState().me;
        if (me && e.ownerIds.includes(me.id) && isSfxId('turn')) engine.playSfx('turn');
      }
    });

    return () => {
      removeGestures();
      unsubGame();
      unsubUi();
      unsubFx();
      // Leaving the table: silence everything. (A StrictMode re-mount keeps the state and resyncs.)
      if (!useGame.getState().state) {
        engine.playMusic(null);
        engine.setAmbience({});
      }
    };
  }, []);

  return null;
}
