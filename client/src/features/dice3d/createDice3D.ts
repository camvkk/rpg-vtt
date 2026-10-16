import type { DiceEngine } from './engine.ts';
import type { Dice3DHandle, Dice3DRoll } from './types.ts';

interface Job {
  roll: Dice3DRoll;
  resolve: () => void;
}

const LINGER_MS = 1200;
const LINGER_BUSY_MS = 650;

/**
 * Create a dice overlay inside `container` (which should cover the screen).
 * three.js and cannon-es are only downloaded / initialised on the first roll.
 */
export function createDice3D(container: HTMLElement): Dice3DHandle {
  let enabled = true;
  let sound = true;
  let disposed = false;
  let engine: DiceEngine | null = null;
  let loading: Promise<DiceEngine | null> | null = null;
  let failed = false;
  let running = false;
  const queue: Job[] = [];

  const getEngine = (): Promise<DiceEngine | null> => {
    if (engine && engine.broken) {
      engine.dispose();
      engine = null;
      loading = null;
    }
    if (engine) return Promise.resolve(engine);
    if (failed) return Promise.resolve(null);
    loading ??= import('./engine.ts')
      .then((m) => m.DiceEngine.create(container))
      .then((e) => {
        if (disposed) {
          e.dispose();
          return null;
        }
        e.setSound(sound);
        engine = e;
        return e;
      })
      .catch((err: unknown) => {
        console.warn('[dice3d] 3D dice unavailable:', err);
        failed = true;
        return null;
      });
    return loading;
  };

  const flush = (): void => {
    for (const job of queue.splice(0)) job.resolve();
  };

  const pump = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      while (queue.length > 0) {
        const job = queue.shift()!;
        if (disposed || !enabled) {
          job.resolve();
          continue;
        }
        const eng = await getEngine();
        if (!eng || disposed || !enabled) {
          job.resolve();
          continue;
        }
        try {
          await eng.play(job.roll, {
            lingerMs: queue.length > 0 ? LINGER_BUSY_MS : LINGER_MS,
            onShown: job.resolve,
          });
        } catch (err) {
          console.warn('[dice3d] roll failed:', err);
        }
        job.resolve();
      }
    } finally {
      running = false;
    }
  };

  return {
    roll(r: Dice3DRoll): Promise<void> {
      if (disposed || !enabled || failed || !r || !Array.isArray(r.dice) || r.dice.length === 0) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        queue.push({ roll: r, resolve });
        void pump();
      });
    },
    setEnabled(on: boolean): void {
      enabled = on;
      if (!on) {
        flush();
        engine?.cancel();
      }
    },
    setSoundEnabled(on: boolean): void {
      sound = on;
      engine?.setSound(on);
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      flush();
      engine?.dispose();
      engine = null;
    },
  };
}
