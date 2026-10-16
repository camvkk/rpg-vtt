export type ChannelId = 'music' | 'ambience' | 'sfx';

export interface AmbiencePreset {
  id: string;
  /** PT-BR display name. */
  name: string;
  /** lucide-react icon name (PascalCase). */
  icon: string;
  /** PT-BR description. */
  description: string;
  tags: string[];
}

export type SfxId =
  | 'sword'
  | 'arrow'
  | 'fireball'
  | 'lightning'
  | 'heal'
  | 'door-open'
  | 'door-close'
  | 'door-locked'
  | 'coin'
  | 'crit'
  | 'fumble'
  | 'roar'
  | 'magic'
  | 'bell'
  | 'footsteps'
  | 'page'
  | 'thunder'
  | 'explosion'
  | 'shield'
  | 'level-up'
  | 'notification'
  | 'turn';

export interface SfxInfo {
  id: SfxId;
  /** PT-BR display name. */
  name: string;
  /** lucide-react icon name (PascalCase). */
  icon: string;
}

export interface MusicState {
  /** Audio file URL. `ambience:<presetId>` plays a procedural preset on the music channel instead. */
  src: string;
  /** Epoch ms at which track position 0 started (shared by all clients → sync). */
  startedAt: number;
  loop: boolean;
  /** 0..1 */
  volume: number;
}

/** Ambience layers keyed by preset id. */
export type AmbienceMix = Record<string, { volume: number }>;

export interface SfxOptions {
  /** 0..1 (default 1). */
  volume?: number;
  /** -1 (left) .. 1 (right). */
  pan?: number;
}
