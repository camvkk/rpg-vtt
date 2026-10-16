/**
 * 3D dice overlay for the virtual tabletop.
 *
 *   <Dice3DOverlay onReady={(h) => (dice = h)} />
 *   await dice.roll({ dice: [{ sides: 20, value: 17 }], color: '#2f6fd6' });
 *
 * The server decides results; the animation always lands on the given values.
 * three.js and cannon-es are lazy-loaded on the first roll (separate chunk).
 */
export type { Dice3DDie, Dice3DRoll, Dice3DHandle } from './types.ts';
export { createDice3D } from './createDice3D.ts';
export { Dice3DOverlay } from './Dice3DOverlay.tsx';
