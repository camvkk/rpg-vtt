/**
 * Procedural audio engine for the VTT.
 *
 *   import { AudioEngine, AMBIENCE_PRESETS, SFX_LIST } from '<src>/features/audio/engine/index.ts';
 *   const audio = AudioEngine.get();
 *   audio.setAmbience({ tavern: { volume: 0.8 }, rain: { volume: 0.4 } });
 *   audio.playSfx('crit');
 *   audio.playMusic({ src: '/uploads/theme.mp3', startedAt: serverEpochMs, loop: true, volume: 0.7 });
 *
 * All volumes are 0..1 slider values; the engine applies a perceptual (squared) curve.
 */
export type { AmbiencePreset, AmbienceMix, ChannelId, MusicState, SfxId, SfxInfo, SfxOptions } from './types.ts';
export { AMBIENCE_PRESETS, SFX_LIST } from './catalog.ts';
export { AudioEngine } from './AudioEngine.ts';
export { useAudioMuted, useAudioUnlocked } from './useAudioEngine.ts';
