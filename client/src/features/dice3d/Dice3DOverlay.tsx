import { useEffect, useRef, type CSSProperties, type JSX } from 'react';
import { createDice3D } from './createDice3D.ts';
import type { Dice3DHandle } from './types.ts';

const style: CSSProperties = {
  position: 'fixed',
  inset: 0,
  pointerEvents: 'none',
  zIndex: 900,
  overflow: 'hidden',
};

/**
 * Full-screen, click-through overlay hosting the 3D dice. Calls `onReady` with a
 * handle once mounted (again with a fresh handle after a remount); the handle is
 * disposed on unmount. three.js / cannon-es load on the first roll only.
 */
export function Dice3DOverlay(props: { onReady: (h: Dice3DHandle) => void }): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(props.onReady);

  useEffect(() => {
    onReadyRef.current = props.onReady;
  }, [props.onReady]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = createDice3D(el);
    onReadyRef.current(handle);
    return () => handle.dispose();
  }, []);

  return <div ref={ref} style={style} aria-hidden="true" data-dice3d-overlay="" />;
}
