/**
 * Dev-only playground for the audio engine: toggle/mix every ambience preset, fire every
 * SFX, try streamed music and the channel volumes. Mount it temporarily anywhere.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { AmbienceMix, ChannelId } from './types.ts';
import { AudioEngine } from './AudioEngine.ts';
import { AMBIENCE_PRESETS, SFX_LIST } from './catalog.ts';
import { useAudioMuted, useAudioUnlocked } from './useAudioEngine.ts';

const panel: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 13,
  color: '#e8e2d4',
  background: '#16130f',
  border: '1px solid #3a3229',
  borderRadius: 10,
  padding: 16,
  maxWidth: 980,
  display: 'grid',
  gap: 16,
};
const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8 };
const button = (active = false): CSSProperties => ({
  padding: '8px 10px',
  borderRadius: 6,
  border: `1px solid ${active ? '#c9a45c' : '#3a3229'}`,
  background: active ? '#3b2f1c' : '#211c16',
  color: '#e8e2d4',
  cursor: 'pointer',
  textAlign: 'left',
  font: 'inherit',
});
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' };
const h: CSSProperties = { margin: 0, fontSize: 14, color: '#c9a45c', letterSpacing: 0.5 };

export function AudioDemo() {
  const engine = AudioEngine.get();
  const unlocked = useAudioUnlocked();
  const muted = useAudioMuted();
  const [mix, setMix] = useState<AmbienceMix>(() => engine.getAmbience());
  const [master, setMaster] = useState(engine.getMasterVolume());
  const [channels, setChannels] = useState<Record<ChannelId, number>>({
    music: engine.getChannelVolume('music'),
    ambience: engine.getChannelVolume('ambience'),
    sfx: engine.getChannelVolume('sfx'),
  });
  const [musicUrl, setMusicUrl] = useState('');
  const [musicVol, setMusicVol] = useState(0.8);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const applyMix = (next: AmbienceMix): void => {
    setMix(next);
    engine.setAmbience(next);
  };
  const toggle = (id: string): void => {
    const next = { ...mix };
    if (next[id]) delete next[id];
    else next[id] = { volume: 0.8 };
    applyMix(next);
  };

  return (
    <div style={panel}>
      <div style={row}>
        <h3 style={h}>Audio engine — demo</h3>
        <span style={{ opacity: 0.8 }}>{unlocked ? 'áudio liberado' : 'áudio bloqueado (clique para liberar)'}</span>
        {!unlocked && (
          <button style={button(true)} onClick={() => void engine.unlock()}>
            Liberar áudio
          </button>
        )}
        <button style={button(muted)} onClick={() => engine.setMuted(!muted)}>
          {muted ? 'Desmutar' : 'Mutar'}
        </button>
        <button style={button()} onClick={() => applyMix({})}>
          Parar ambientes
        </button>
      </div>

      <div style={row}>
        <label>
          Master{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={master}
            onChange={(e) => {
              const v = Number(e.target.value);
              setMaster(v);
              engine.setMasterVolume(v);
            }}
          />
        </label>
        {(['music', 'ambience', 'sfx'] as const).map((ch) => (
          <label key={ch}>
            {ch}{' '}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={channels[ch]}
              onChange={(e) => {
                const v = Number(e.target.value);
                setChannels((c) => ({ ...c, [ch]: v }));
                engine.setChannelVolume(ch, v);
              }}
            />
          </label>
        ))}
      </div>

      <section style={{ display: 'grid', gap: 8 }}>
        <h4 style={h}>Ambientes (combináveis)</h4>
        <div style={grid}>
          {AMBIENCE_PRESETS.map((p) => {
            const layer = mix[p.id];
            return (
              <div key={p.id} style={{ ...button(!!layer), display: 'grid', gap: 4 }} title={p.description}>
                <button style={{ ...button(!!layer), border: 'none', padding: 0, background: 'transparent' }} onClick={() => toggle(p.id)}>
                  <strong>{p.name}</strong> <span style={{ opacity: 0.6 }}>({p.icon})</span>
                </button>
                <span style={{ opacity: 0.65, fontSize: 11 }}>{p.tags.join(' · ')}</span>
                {layer && (
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={layer.volume}
                    onChange={(e) => applyMix({ ...mix, [p.id]: { volume: Number(e.target.value) } })}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h4 style={h}>Efeitos sonoros</h4>
        <div style={grid}>
          {SFX_LIST.map((s) => (
            <button key={s.id} style={button()} onClick={() => engine.playSfx(s.id, { pan: (Math.random() - 0.5) * 0.4 })}>
              {s.name} <span style={{ opacity: 0.6 }}>({s.icon})</span>
            </button>
          ))}
        </div>
      </section>

      <section style={{ display: 'grid', gap: 8 }}>
        <h4 style={h}>Música (streaming sincronizado)</h4>
        <div style={row}>
          <input
            style={{ flex: 1, minWidth: 240, padding: 6, background: '#211c16', color: '#e8e2d4', border: '1px solid #3a3229', borderRadius: 6 }}
            placeholder="URL do áudio (mp3/ogg) ou ambience:tavern"
            value={musicUrl}
            onChange={(e) => setMusicUrl(e.target.value)}
          />
          <button
            style={button(true)}
            onClick={() => {
              const at = Date.now();
              setStartedAt(at);
              engine.playMusic({ src: musicUrl.trim(), startedAt: at, loop: true, volume: musicVol });
            }}
          >
            Tocar
          </button>
          <button
            style={button()}
            onClick={() => {
              setStartedAt(null);
              engine.playMusic(null);
            }}
          >
            Parar
          </button>
          <label>
            vol{' '}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={musicVol}
              onChange={(e) => {
                const v = Number(e.target.value);
                setMusicVol(v);
                if (startedAt !== null && musicUrl.trim()) engine.playMusic({ src: musicUrl.trim(), startedAt, loop: true, volume: v });
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}

export default AudioDemo;
