import { useSyncExternalStore } from 'react';
import { AudioEngine } from './AudioEngine.ts';

const subscribe = (cb: () => void): (() => void) => AudioEngine.get().onStateChange(cb);

/** true once the AudioContext is running (after a user gesture). */
export function useAudioUnlocked(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => AudioEngine.get().unlocked,
    () => false,
  );
}

/** Engine mute state. */
export function useAudioMuted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => AudioEngine.get().muted,
    () => false,
  );
}
