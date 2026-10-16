export interface Dice3DDie {
  sides: 4 | 6 | 8 | 10 | 12 | 20 | 100;
  /** Result decided by the server. d10: 1..10 (10 shows "0"); d100: 1..100 (100 shows "00" + "0"). */
  value: number;
}

export interface Dice3DRoll {
  dice: Dice3DDie[];
  /** Player colour (#rgb / #rrggbb). Defaults to deep crimson #7a1f2b. */
  color?: string;
  /** Natural 20 on a d20: golden pulse around the d20 showing 20. */
  crit?: boolean;
  /** Natural 1 on a d20: red pulse around the d20 showing 1. */
  fumble?: boolean;
}

export interface Dice3DHandle {
  /**
   * Queue a roll. Resolves once the dice have settled and the result has been shown
   * (~1.2 s linger); the dice then fade out. Resolves immediately when disabled,
   * disposed, when the tab is hidden, or when WebGL is unavailable.
   */
  roll(r: Dice3DRoll): Promise<void>;
  setEnabled(on: boolean): void;
  setSoundEnabled(on: boolean): void;
  dispose(): void;
}
