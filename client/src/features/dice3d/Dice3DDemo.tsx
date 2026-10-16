import { useCallback, useRef, useState, type CSSProperties, type JSX } from 'react';
import { Dice3DOverlay } from './Dice3DOverlay.tsx';
import type { Dice3DDie, Dice3DHandle, Dice3DRoll } from './types.ts';

type Sides = Dice3DDie['sides'];

const PRESETS: { label: string; dice: Sides[] }[] = [
  { label: '1d20', dice: [20] },
  { label: '2d20', dice: [20, 20] },
  { label: '4d6', dice: [6, 6, 6, 6] },
  { label: '1d100', dice: [100] },
  { label: '8d6', dice: [6, 6, 6, 6, 6, 6, 6, 6] },
  { label: '1d4+1d6+1d8+1d10+1d12+1d20', dice: [4, 6, 8, 10, 12, 20] },
];

interface Entry {
  id: number;
  label: string;
  expected: string;
  status: string;
}

function describe(d: Dice3DDie): string {
  if (d.sides === 100) {
    const tens = Math.floor((d.value % 100) / 10);
    return `d100=${d.value} [${tens === 0 ? '00' : tens * 10} + ${d.value % 10}]`;
  }
  if (d.sides === 10 && d.value === 10) return 'd10=10 [shows 0]';
  return `d${d.sides}=${d.value}`;
}

const panel: CSSProperties = {
  position: 'fixed',
  top: 16,
  left: 16,
  zIndex: 1000,
  width: 340,
  maxWidth: 'calc(100vw - 32px)',
  padding: 14,
  borderRadius: 10,
  background: 'rgba(14, 9, 12, 0.88)',
  border: '1px solid rgba(232, 196, 106, 0.35)',
  color: '#ead9b0',
  font: '13px/1.4 Inter, system-ui, sans-serif',
  pointerEvents: 'auto',
  boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
};
const btn: CSSProperties = {
  margin: '0 6px 6px 0',
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid rgba(232, 196, 106, 0.5)',
  background: '#2a1318',
  color: '#e8c46a',
  font: '600 12px Cinzel, serif',
  cursor: 'pointer',
};

/** Dev page: roll random values and print what the dice must show. */
export function Dice3DDemo(): JSX.Element {
  const handle = useRef<Dice3DHandle | null>(null);
  const nextId = useRef(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [color, setColor] = useState('#7a1f2b');
  const [sound, setSound] = useState(true);
  const [enabled, setEnabled] = useState(true);

  const onReady = useCallback((h: Dice3DHandle) => {
    handle.current = h;
  }, []);

  const roll = useCallback(
    (label: string, dice: Dice3DDie[]) => {
      const d20 = dice.filter((d) => d.sides === 20);
      const crit = d20.some((d) => d.value === 20);
      const fumble = !crit && d20.some((d) => d.value === 1);
      const r: Dice3DRoll = { dice, color, crit, fumble };
      const id = nextId.current++;
      const expected = dice.map(describe).join(', ') + (crit ? '  — CRIT' : fumble ? '  — FUMBLE' : '');
      setEntries((e) => [{ id, label, expected, status: 'queued' }, ...e].slice(0, 8));
      const t0 = performance.now();
      const done = handle.current?.roll(r) ?? Promise.resolve();
      void done.then(() => {
        const ms = Math.round(performance.now() - t0);
        setEntries((e) => e.map((x) => (x.id === id ? { ...x, status: `shown (${ms} ms)` } : x)));
      });
    },
    [color],
  );

  const rollPreset = (p: (typeof PRESETS)[number]): void => {
    roll(
      p.label,
      p.dice.map((sides) => ({ sides, value: 1 + Math.floor(Math.random() * sides) })),
    );
  };

  return (
    <>
      <Dice3DOverlay onReady={onReady} />
      <div style={panel}>
        <div style={{ font: '700 15px Cinzel, serif', color: '#e8c46a', marginBottom: 8 }}>3D Dice — demo</div>
        <div>
          {PRESETS.map((p) => (
            <button key={p.label} type="button" style={btn} onClick={() => rollPreset(p)}>
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <button type="button" style={btn} onClick={() => roll('nat 20', [{ sides: 20, value: 20 }])}>
            nat 20
          </button>
          <button type="button" style={btn} onClick={() => roll('nat 1', [{ sides: 20, value: 1 }])}>
            nat 1
          </button>
          <button
            type="button"
            style={btn}
            onClick={() =>
              roll(
                '20 mixed',
                Array.from({ length: 20 }, (_, i) => {
                  const sides = ([4, 6, 8, 10, 12, 20, 100] as const)[i % 7]!;
                  return { sides, value: 1 + Math.floor(Math.random() * sides) };
                }),
              )
            }
          >
            20 mixed
          </button>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', margin: '4px 0 10px' }}>
          <label>
            colour{' '}
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ verticalAlign: 'middle' }} />
          </label>
          <label>
            <input
              type="checkbox"
              checked={sound}
              onChange={(e) => {
                setSound(e.target.checked);
                handle.current?.setSoundEnabled(e.target.checked);
              }}
            />{' '}
            sound
          </label>
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                handle.current?.setEnabled(e.target.checked);
              }}
            />{' '}
            enabled
          </label>
        </div>
        <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>Expected faces (newest first):</div>
        <ol style={{ margin: 0, paddingLeft: 18 }} data-testid="dice3d-expected">
          {entries.map((e) => (
            <li key={e.id} style={{ marginBottom: 4 }}>
              <strong style={{ color: '#e8c46a' }}>{e.label}</strong>: {e.expected}{' '}
              <span style={{ opacity: 0.6 }}>({e.status})</span>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
