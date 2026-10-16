// Áudio: music playlists, procedural ambience mixer and SFX board (DM), plus the personal mixer (everyone).
import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, AudioLines, Beer, Bell, BellRing, Bomb, BookOpen, BowArrow, Bug, Castle, ChevronRight, ChevronsUp,
  CloudLightning, CloudRain, Coins, DoorClosed, DoorClosedLocked, DoorOpen, Ear, Flame, FlameKindling, Footprints, Ghost,
  GripVertical, HeartPulse, Hourglass, Link2, ListMusic, MoonStar, MoreVertical, Mountain, Music, Pause, Pencil, Play, Plus, Repeat,
  Search, Shield, SkipBack, SkipForward, Skull, Snowflake, Sparkles, Square, Star, Sun, Sword, Swords, Trash2, Trees,
  TrendingDown, Upload, Volume1, Volume2, VolumeX, WandSparkles, Waves, WavesHorizontal, X, Zap, type LucideProps,
} from 'lucide-react';
import type { AudioState, Playlist, Track } from '@shared/types.ts';
import { newId, normalize } from '@shared/util.ts';
import { act } from '../../net/socket.ts';
import { uploadFile } from '../../net/api.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import {
  Button, confirmDialog, Empty, IconButton, MenuItem, Popover, Segmented, Spinner, Tabs, Toggle, toast,
} from '../../ui/index.tsx';
import { AMBIENCE_PRESETS, AudioEngine, SFX_LIST, useAudioUnlocked, type AmbienceMix } from './engine/index.ts';
import { isSfxId, setAudioMuted, useAudioPrefs, type AudioPrefKey } from './AudioSync.tsx';
import './audio.css';

// ---------------------------------------------------------------------------
// Icons (explicit imports keep the bundle small; unknown names fall back to a generic icon)
// ---------------------------------------------------------------------------

type IconCmp = ComponentType<LucideProps>;

const ICONS: Record<string, IconCmp> = {
  beer: Beer, flamekindling: FlameKindling, trees: Trees, moonstar: MoonStar, cloudrain: CloudRain,
  cloudlightning: CloudLightning, skull: Skull, mountain: Mountain, ghost: Ghost, waveshorizontal: WavesHorizontal,
  waves: Waves, castle: Castle, swords: Swords, sparkles: Sparkles, sun: Sun, snowflake: Snowflake, bug: Bug,
  sword: Sword, bowarrow: BowArrow, flame: Flame, zap: Zap, heartpulse: HeartPulse, dooropen: DoorOpen,
  doorclosed: DoorClosed, doorclosedlocked: DoorClosedLocked, coins: Coins, star: Star, trendingdown: TrendingDown,
  wandsparkles: WandSparkles, bell: Bell, footprints: Footprints, bookopen: BookOpen, bomb: Bomb, shield: Shield,
  chevronsup: ChevronsUp, bellring: BellRing, hourglass: Hourglass, music: Music,
};

function iconFor(name: string | undefined, fallback: IconCmp = AudioLines): IconCmp {
  if (!name) return fallback;
  return ICONS[name.toLowerCase().replace(/[-_\s]/g, '')] ?? fallback;
}

const PRESET_BY_ID = new Map(AMBIENCE_PRESETS.map((p) => [p.id, p]));
const MAX_LAYERS = 6;
const AUDIO_ACCEPT = 'audio/mpeg,audio/ogg,audio/wav,audio/x-wav,audio/flac,audio/mp4,audio/x-m4a,.mp3,.ogg,.oga,.wav,.flac,.m4a';

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function isAudioUrl(u: string): boolean {
  return /^(https?:\/\/|\/assets\/)/i.test(u) && u.length <= 2_000;
}

function trackLabel(t: Track): string {
  if (t.src.startsWith('ambience:')) return `Ambiente procedural · ${PRESET_BY_ID.get(t.src.slice(9))?.name ?? t.src.slice(9)}`;
  if (t.src.startsWith('/assets/')) return 'Arquivo enviado';
  try {
    return new URL(t.src).hostname;
  } catch {
    return t.src;
  }
}

function playTrack(pl: Playlist | null, t: Track): void {
  void act('audio.music', {
    track: { trackId: t.id, playlistId: pl?.id ?? null, src: t.src, name: t.name.slice(0, 120), loop: t.loop, volume: t.volume },
  });
}

function stopMusic(): void {
  void act('audio.music', { track: null });
}

/** Debounced sender that keeps the last value. */
function useDebouncedSender<T>(send: (v: T) => void, ms: number) {
  const timer = useRef(0);
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return (v: T, immediate = false) => {
    window.clearTimeout(timer.current);
    if (immediate) sendRef.current(v);
    else timer.current = window.setTimeout(() => sendRef.current(v), ms);
  };
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

type AudioTab = 'music' | 'ambience' | 'sfx' | 'mixer';

export default function AudioPanel() {
  const isDM = useIsDM();
  const unlocked = useAudioUnlocked();
  const [tab, setTab] = useState<AudioTab>('music');

  return (
    <div className="au-panel">
      {!unlocked && <UnlockBanner />}
      <NowPlaying isDM={isDM} />
      {isDM ? (
        <>
          <Tabs<AudioTab>
            className="au-tabs"
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'music', label: 'Trilha', icon: <ListMusic /> },
              { value: 'ambience', label: 'Ambiente', icon: <Trees /> },
              { value: 'sfx', label: 'Efeitos', icon: <Zap /> },
              { value: 'mixer', label: 'Volume', icon: <Volume2 /> },
            ]}
          />
          <div className="au-scroll" key={tab}>
            {tab === 'music' && <MusicTab />}
            {tab === 'ambience' && <AmbienceTab />}
            {tab === 'sfx' && <SfxTab />}
            {tab === 'mixer' && <Mixer isDM />}
          </div>
        </>
      ) : (
        <div className="au-scroll">
          <Mixer isDM={false} />
        </div>
      )}
    </div>
  );
}

function UnlockBanner() {
  const [busy, setBusy] = useState(false);
  return (
    <div className="au-unlock" role="alert">
      <span className="au-unlock__icon"><VolumeX /></span>
      <div className="u-grow">
        <div className="au-unlock__title">Áudio bloqueado</div>
        <div className="au-unlock__text">O navegador só toca som depois de um clique.</div>
      </div>
      <Button
        variant="primary"
        size="sm"
        icon={busy ? <Spinner /> : <Volume2 />}
        onClick={() => {
          setBusy(true);
          void AudioEngine.get().unlock().finally(() => setBusy(false));
        }}
      >
        Ativar áudio
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Now playing
// ---------------------------------------------------------------------------

function NowPlaying({ isDM }: { isDM: boolean }) {
  const music = useGame((s) => s.state?.audio.music ?? null);
  const ambience = useGame((s) => s.state?.audio.ambience);
  const playlists = useGame((s) => s.state?.audio.playlists);
  const muted = useUi((s) => s.muted);
  const unlocked = useAudioUnlocked();
  const layers = Object.entries(ambience ?? {});
  const live = unlocked && !muted;

  const playlist = music?.playlistId ? playlists?.[music.playlistId] ?? null : null;
  const idx = playlist && music ? playlist.tracks.findIndex((t) => t.id === music.trackId) : -1;
  const step = (d: number) => {
    if (!playlist || !playlist.tracks.length) return;
    const n = playlist.tracks.length;
    const next = playlist.tracks[(((idx < 0 ? 0 : idx) + d) % n + n) % n]!;
    playTrack(playlist, next);
  };

  const [vol, setVol] = useState(music?.volume ?? 0.8);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current && music) setVol(music.volume);
  }, [music]);
  const sendVol = useDebouncedSender<number>((v) => {
    void act('audio.musicVolume', { volume: v }, { quiet: true });
  }, 220);

  const removeLayer = (id: string) => {
    const next = { ...(ambience ?? {}) };
    delete next[id];
    void act('audio.ambience', { layers: next });
  };

  if (!music && !layers.length) {
    return (
      <div className="au-now au-now--idle">
        <span className="au-now__disc" aria-hidden="true"><Music /></span>
        <div className="u-grow">
          <div className="au-now__label">Em silêncio</div>
          <div className="au-now__sub">{isDM ? 'Escolha uma trilha ou ambiente abaixo.' : 'Nenhuma trilha ou ambiente tocando.'}</div>
        </div>
        {!isDM && <MuteButton />}
      </div>
    );
  }

  return (
    <div className="au-now" data-live={live ? 'true' : undefined}>
      {music && (
        <div className="au-now__music">
          <Equalizer live={live} />
          <div className="u-grow" style={{ minWidth: 0 }}>
            <div className="au-now__label">Tocando agora</div>
            <div className="au-now__title u-ellipsis" title={music.name}>{music.name || 'Faixa sem nome'}</div>
            {playlist && <div className="au-now__sub u-ellipsis">{playlist.name}{music.loop ? ' · em repetição' : ''}</div>}
            {!playlist && music.loop && <div className="au-now__sub">Em repetição</div>}
          </div>
          {isDM ? (
            <div className="au-now__ctrl">
              {playlist && playlist.tracks.length > 1 && <IconButton size="sm" icon={<SkipBack />} label="Faixa anterior" onClick={() => step(-1)} />}
              <IconButton size="sm" icon={<Square />} label="Parar música" onClick={stopMusic} className="au-stop" />
              {playlist && playlist.tracks.length > 1 && <IconButton size="sm" icon={<SkipForward />} label="Próxima faixa" onClick={() => step(1)} />}
            </div>
          ) : (
            <MuteButton />
          )}
        </div>
      )}
      {isDM && music && (
        <div className="au-now__vol">
          <Volume1 />
          <Range
            value={vol}
            label="Volume da música (para a mesa)"
            onChange={(v) => {
              dragging.current = true;
              setVol(v);
              sendVol(v);
            }}
            onCommit={(v) => {
              dragging.current = false;
              sendVol(v, true);
            }}
          />
          <span className="au-now__pct">{pct(vol)}</span>
        </div>
      )}
      {layers.length > 0 && (
        <div className="au-now__layers">
          {!music && <span className="au-now__label au-now__label--row">Ambiente ao fundo</span>}
          {layers.map(([id, l]) => {
            const p = PRESET_BY_ID.get(id);
            const Icon = iconFor(p?.icon, Waves);
            return (
              <span key={id} className="au-layer-chip" data-tip={`${p?.name ?? id} · ${pct(l.volume)}`}>
                <Icon />
                {p?.name ?? id}
                {isDM && (
                  <button type="button" className="au-layer-chip__x" aria-label={`Desligar ${p?.name ?? id}`} onClick={() => removeLayer(id)}>
                    <X />
                  </button>
                )}
              </span>
            );
          })}
          {!music && !isDM && <MuteButton />}
        </div>
      )}
    </div>
  );
}

function Equalizer({ live }: { live: boolean }) {
  return (
    <span className="au-eq" data-live={live ? 'true' : undefined} aria-hidden="true">
      <i /><i /><i /><i />
    </span>
  );
}

function MuteButton() {
  const muted = useUi((s) => s.muted);
  return (
    <IconButton
      size="sm"
      icon={muted ? <VolumeX /> : <Volume2 />}
      label={muted ? 'Ativar som' : 'Silenciar'}
      active={muted}
      onClick={() => setAudioMuted(!muted)}
    />
  );
}

// ---------------------------------------------------------------------------
// Range with a gold fill
// ---------------------------------------------------------------------------

function Range({ value, onChange, onCommit, label, disabled }: {
  value: number;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="range"
      className="range au-range"
      min={0}
      max={1}
      step={0.01}
      value={value}
      disabled={disabled}
      aria-label={label}
      style={{ '--fill': `${value * 100}%` } as CSSProperties}
      onChange={(e) => onChange(Number(e.target.value))}
      onPointerUp={(e) => onCommit?.(Number(e.currentTarget.value))}
      onKeyUp={(e) => onCommit?.(Number(e.currentTarget.value))}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

// ---------------------------------------------------------------------------
// Trilha (playlists)
// ---------------------------------------------------------------------------

function MusicTab() {
  const playlists = useGame((s) => s.state?.audio.playlists);
  const music = useGame((s) => s.state?.audio.music ?? null);
  const list = useMemo(
    () => Object.values(playlists ?? {}).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true })),
    [playlists],
  );
  const [openId, setOpenId] = useState<string | null>(() => music?.playlistId ?? null);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);

  const create = async () => {
    const id = newId();
    setCreating(true);
    const res = await act('audio.playlist.save', { playlist: { id, name: (name.trim() || 'Nova playlist').slice(0, 120), tracks: [] } });
    setCreating(false);
    if (res.ok) {
      setName('');
      setOpenId(id);
    }
  };

  return (
    <div className="au-music">
      <form
        className="au-newpl"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <input className="input input--sm" placeholder="Nova playlist (ex.: Combate épico)" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" variant="primary" icon={<Plus />} disabled={creating}>Criar</Button>
      </form>

      {!list.length ? (
        <Empty icon={<ListMusic />} title="Nenhuma playlist">
          Crie playlists para exploração, combate ou tavernas e adicione faixas por URL ou enviando MP3/OGG.
        </Empty>
      ) : (
        <div className="au-pls">
          {list.map((pl) => (
            <PlaylistCard
              key={pl.id}
              pl={pl}
              music={music}
              open={openId === pl.id}
              onToggle={() => setOpenId((v) => (v === pl.id ? null : pl.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlaylistCard({ pl: remote, music, open, onToggle }: {
  pl: Playlist;
  music: AudioState['music'];
  open: boolean;
  onToggle: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  // Optimistic copy: edits apply instantly and rapid edits build on each other, not on a stale echo.
  const [pl, setView] = useState(remote);
  const latest = useRef(remote);
  const inflight = useRef(0);
  useEffect(() => {
    if (inflight.current === 0) {
      latest.current = remote;
      setView(remote);
    }
  }, [remote]);
  const playingHere = music?.playlistId === pl.id;

  const save = (tracks: Track[], name = latest.current.name) => {
    const next: Playlist = { id: remote.id, name, tracks };
    latest.current = next;
    setView(next);
    inflight.current++;
    void act('audio.playlist.save', { playlist: next }).then(() => {
      inflight.current--;
      if (inflight.current === 0) {
        const cur = useGame.getState().state?.audio.playlists[remote.id];
        if (cur) {
          latest.current = cur;
          setView(cur);
        }
      }
    });
  };

  const move = (from: number, to: number) => {
    const cur = latest.current.tracks;
    if (from === to || to < 0 || to >= cur.length) return;
    const tracks = [...cur];
    const [t] = tracks.splice(from, 1);
    tracks.splice(to, 0, t!);
    save(tracks);
  };

  const remove = async () => {
    const ok = await confirmDialog('Excluir playlist', <>A playlist <strong>{pl.name}</strong> e suas {pl.tracks.length} faixas serão removidas.</>, { danger: true, ok: 'Excluir' });
    if (!ok) return;
    if (playingHere) stopMusic();
    void act('audio.playlist.delete', { id: pl.id });
  };

  return (
    <section className="au-pl" data-open={open ? 'true' : undefined} data-playing={playingHere ? 'true' : undefined}>
      <div className="au-pl__head">
        {renaming ? (
          <InlineRename
            initial={pl.name}
            onDone={(v) => {
              setRenaming(false);
              if (v && v !== latest.current.name) save(latest.current.tracks, v.slice(0, 120));
            }}
          />
        ) : (
          <button type="button" className="au-pl__toggle" onClick={onToggle} aria-expanded={open}>
            <ChevronRight className="au-chev" />
            <span className="au-pl__icon">{playingHere ? <Equalizer live /> : <ListMusic />}</span>
            <span className="au-pl__name u-ellipsis">{pl.name}</span>
            <span className="au-count">{pl.tracks.length}</span>
          </button>
        )}
        {!renaming && pl.tracks.length > 0 && (
          <IconButton size="sm" icon={<Play />} label="Tocar a primeira faixa" onClick={() => playTrack(pl, pl.tracks[0]!)} />
        )}
        {!renaming && (
          <IconButton size="sm" icon={<MoreVertical />} label="Opções da playlist" onClick={(e) => setMenu(e.currentTarget)} />
        )}
      </div>

      {open && (
        <div className="au-pl__body">
          {pl.tracks.length ? (
            <ol className="au-tracks">
              {pl.tracks.map((t, i) => {
                const playing = music?.trackId === t.id && playingHere;
                return (
                  <li
                    key={t.id}
                    className="au-track"
                    data-playing={playing ? 'true' : undefined}
                    data-over={overIdx === i && dragIdx !== null && dragIdx !== i ? (dragIdx < i ? 'below' : 'above') : undefined}
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(i);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', t.name);
                    }}
                    onDragOver={(e) => {
                      if (dragIdx === null) return;
                      e.preventDefault();
                      setOverIdx(i);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx !== null) move(dragIdx, i);
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                  >
                    <span className="au-track__grip" aria-hidden="true"><GripVertical /></span>
                    <button
                      type="button"
                      className="au-track__play"
                      aria-label={playing ? 'Parar' : `Tocar ${t.name}`}
                      data-tip={playing ? 'Parar' : 'Tocar para a mesa'}
                      onClick={() => (playing ? stopMusic() : playTrack(pl, t))}
                    >
                      {playing ? <Pause /> : <Play />}
                    </button>
                    <span className="au-track__text">
                      <span className="au-track__name u-ellipsis">{t.name}</span>
                      <span className="au-track__src u-ellipsis">{trackLabel(t)}</span>
                    </span>
                    <span className="au-track__actions">
                      <IconButton size="sm" icon={<ArrowUp />} label="Subir" disabled={i === 0} onClick={() => move(i, i - 1)} />
                      <IconButton size="sm" icon={<ArrowDown />} label="Descer" disabled={i === pl.tracks.length - 1} onClick={() => move(i, i + 1)} />
                      <IconButton
                        size="sm"
                        danger
                        icon={<Trash2 />}
                        label="Remover faixa"
                        onClick={() => save(latest.current.tracks.filter((x) => x.id !== t.id))}
                      />
                    </span>
                    <IconButton
                      size="sm"
                      icon={<Repeat />}
                      label={t.loop ? 'Repetição ligada' : 'Repetição desligada'}
                      active={t.loop}
                      onClick={() => save(latest.current.tracks.map((x) => (x.id === t.id ? { ...x, loop: !x.loop } : x)))}
                    />
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="au-hint">Playlist vazia. Adicione a primeira faixa:</div>
          )}
          <AddTrack disabled={pl.tracks.length >= 200} onAdd={(tracks) => save([...latest.current.tracks, ...tracks].slice(0, 200))} />
        </div>
      )}

      {menu && (
        <Popover anchor={menu} onClose={() => setMenu(null)}>
          <div className="menu">
            <MenuItem icon={<Pencil />} onClick={() => { setMenu(null); setRenaming(true); }}>Renomear</MenuItem>
            {playingHere && <MenuItem icon={<Square />} onClick={() => { setMenu(null); stopMusic(); }}>Parar música</MenuItem>}
            <div className="menu__sep" />
            <MenuItem icon={<Trash2 />} danger onClick={() => { setMenu(null); void remove(); }}>Excluir playlist</MenuItem>
          </div>
        </Popover>
      )}
    </section>
  );
}

function InlineRename({ initial, onDone }: { initial: string; onDone: (v: string | null) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (x: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(x === null ? null : x.trim());
  };
  return (
    <input
      className="input input--sm u-grow"
      value={v}
      autoFocus
      maxLength={120}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => finish(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v);
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(null);
        }
      }}
      aria-label="Nome da playlist"
    />
  );
}

type AddMode = 'file' | 'url' | 'procedural';

function AddTrack({ onAdd, disabled }: { onAdd: (tracks: Track[]) => void; disabled?: boolean }) {
  const [mode, setMode] = useState<AddMode>('file');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [preset, setPreset] = useState(AMBIENCE_PRESETS[0]?.id ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const mk = (n: string, src: string): Track => ({ id: newId(), name: n.trim().slice(0, 120) || 'Faixa', src, loop: true, volume: 0.8 });

  const upload = async (files: File[]) => {
    const out: Track[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i]!;
      setBusy(files.length > 1 ? `Enviando ${i + 1}/${files.length}…` : 'Enviando…');
      const res = await uploadFile(f);
      if (res.ok && res.url) out.push(mk(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '), res.url));
      else toast(`${f.name}: ${res.error ?? 'falha no envio'}`, 'danger');
    }
    setBusy(null);
    if (out.length) {
      onAdd(out);
      toast(out.length === 1 ? 'Faixa adicionada.' : `${out.length} faixas adicionadas.`, 'success', 2200);
    }
  };

  const addUrl = () => {
    const u = url.trim();
    if (!isAudioUrl(u)) {
      toast('Informe uma URL de áudio válida (https://…).', 'warning');
      return;
    }
    const fallback = decodeURIComponent(u.split('/').pop()?.split('?')[0] ?? '').replace(/\.[^.]+$/, '');
    onAdd([mk(name || fallback || 'Faixa', u)]);
    setUrl('');
    setName('');
  };

  return (
    <div className="au-add" aria-disabled={disabled || undefined}>
      <Segmented<AddMode>
        value={mode}
        onChange={setMode}
        options={[
          { value: 'file', label: 'Arquivo', icon: <Upload /> },
          { value: 'url', label: 'URL', icon: <Link2 /> },
          { value: 'procedural', label: 'Gerado', icon: <Sparkles />, tip: 'Um ambiente procedural tocado como trilha' },
        ]}
      />
      {mode === 'file' && (
        <>
          <button
            type="button"
            className="au-drop"
            disabled={!!busy || disabled}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('audio/') || /\.(mp3|ogg|oga|wav|flac|m4a)$/i.test(f.name));
              if (files.length) {
                e.preventDefault();
                void upload(files);
              }
            }}
          >
            {busy ? <><Spinner /> {busy}</> : <><Upload /> Enviar MP3, OGG, WAV…</>}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={AUDIO_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              if (files.length) void upload(files);
            }}
          />
        </>
      )}
      {mode === 'url' && (
        <form
          className="u-col"
          onSubmit={(e) => {
            e.preventDefault();
            addUrl();
          }}
        >
          <input className="input input--sm" placeholder="https://…/trilha.mp3" value={url} onChange={(e) => setUrl(e.target.value)} disabled={disabled} />
          <div className="u-row">
            <input className="input input--sm" placeholder="Nome (opcional)" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} disabled={disabled} />
            <Button type="submit" size="sm" icon={<Plus />} disabled={disabled || !url.trim()}>Adicionar</Button>
          </div>
        </form>
      )}
      {mode === 'procedural' && (
        <div className="u-row">
          <select className="select input--sm" value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="Ambiente">
            {AMBIENCE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button
            size="sm"
            icon={<Plus />}
            disabled={disabled || !preset}
            onClick={() => onAdd([mk(PRESET_BY_ID.get(preset)?.name ?? preset, `ambience:${preset}`)])}
          >
            Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ambiente
// ---------------------------------------------------------------------------

function AmbienceTab() {
  const remote = useGame((s) => s.state?.audio.ambience);
  const [local, setLocalState] = useState<AmbienceMix>(() => remote ?? {});
  // Latest mix, readable synchronously (rapid clicks must not build on a stale render).
  const localRef = useRef(local);
  const setLocal = (m: AmbienceMix) => {
    localRef.current = m;
    setLocalState(m);
  };
  const busy = useRef(0);
  const pendingTimer = useRef(0);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  useEffect(() => {
    if (busy.current === 0 && !pendingTimer.current) setLocal(remote ?? {});
  }, [remote]);
  useEffect(() => () => window.clearTimeout(pendingTimer.current), []);

  const send = (layers: AmbienceMix) => {
    pendingTimer.current = 0;
    busy.current++;
    void act('audio.ambience', { layers }).then((res) => {
      busy.current--;
      if (!res.ok && busy.current === 0) setLocal(useGame.getState().state?.audio.ambience ?? {});
    });
  };

  const commit = (layers: AmbienceMix, debounce = false) => {
    setLocal(layers);
    window.clearTimeout(pendingTimer.current);
    if (debounce) pendingTimer.current = window.setTimeout(() => send(layers), 220);
    else send(layers);
  };

  const toggle = (id: string) => {
    const next = { ...localRef.current };
    if (next[id]) delete next[id];
    else {
      if (Object.keys(next).length >= MAX_LAYERS) {
        toast(`Máximo de ${MAX_LAYERS} camadas de ambiente. Desligue uma antes.`, 'warning');
        return;
      }
      next[id] = { volume: 0.7 };
    }
    commit(next);
  };

  const topTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of AMBIENCE_PRESETS) for (const t of p.tags) count.set(t, (count.get(t) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
  }, []);

  const presets = useMemo(() => {
    const nq = normalize(q);
    return AMBIENCE_PRESETS.filter((p) => (!tag || p.tags.includes(tag))
      && (!nq || normalize(`${p.name} ${p.description} ${p.tags.join(' ')}`).includes(nq)));
  }, [q, tag]);

  const active = Object.keys(local).length;

  return (
    <div className="au-amb-tab">
      <div className="au-amb-head">
        <div className="au-layers-meter" data-tip="Camadas ativas">
          {Array.from({ length: MAX_LAYERS }, (_, i) => <i key={i} data-on={i < active ? 'true' : undefined} />)}
          <span>{active}/{MAX_LAYERS}</span>
        </div>
        <span className="u-grow" />
        <Button size="sm" variant="ghost" icon={<VolumeX />} disabled={!active} onClick={() => commit({})}>Silenciar tudo</Button>
      </div>

      <div className="au-filter">
        <div className="au-search">
          <Search aria-hidden="true" />
          <input className="input input--sm" placeholder="Buscar ambiente…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="au-tags">
          {topTags.map((t) => (
            <button key={t} type="button" className="chip" data-active={tag === t ? 'true' : undefined} onClick={() => setTag((v) => (v === t ? null : t))}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {!presets.length ? (
        <Empty icon={<Search />} title="Nenhum ambiente">Tente outra busca.</Empty>
      ) : (
        <div className="au-amb-grid">
          {presets.map((p) => {
            const layer = local[p.id];
            const Icon = iconFor(p.icon, Waves);
            return (
              <div key={p.id} className="au-amb" data-active={layer ? 'true' : undefined}>
                <button type="button" className="au-amb__toggle" aria-pressed={!!layer} onClick={() => toggle(p.id)} title={p.description}>
                  <span className="au-amb__icon"><Icon /></span>
                  <span className="au-amb__name">{p.name}</span>
                  <span className="au-amb__desc">{p.description}</span>
                </button>
                {layer && (
                  <div className="au-amb__vol">
                    <Volume1 />
                    <Range
                      value={layer.volume}
                      label={`Volume de ${p.name}`}
                      onChange={(v) => commit({ ...localRef.current, [p.id]: { volume: v } }, true)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Efeitos
// ---------------------------------------------------------------------------

function SfxTab() {
  const [preview, setPreview] = useState(false);
  const [fired, setFired] = useState<Record<string, number>>({});
  const unlocked = useAudioUnlocked();
  const last = useRef(0);

  const fire = (id: string) => {
    setFired((f) => ({ ...f, [id]: (f[id] ?? 0) + 1 }));
    if (preview) {
      if (isSfxId(id)) AudioEngine.get().playSfx(id);
      return;
    }
    const now = Date.now();
    if (now - last.current < 200) return;
    last.current = now;
    void act('audio.sfx', { id });
  };

  return (
    <div className="au-sfx-tab">
      <div className="au-sfx-head">
        <Toggle checked={preview} onChange={setPreview} label={<span className="u-row u-gap-1"><Ear className="au-ic" /> Só para mim (pré-escuta)</span>} />
      </div>
      {!unlocked && preview && <div className="au-hint">Ative o áudio para ouvir a pré-escuta.</div>}
      <div className="au-sfx-grid">
        {SFX_LIST.map((s) => {
          const Icon = iconFor(s.icon, Zap);
          return (
            <button key={s.id} type="button" className="au-sfx" onClick={() => fire(s.id)} data-preview={preview ? 'true' : undefined}>
              <span className="au-sfx__icon" key={fired[s.id] ?? 0} data-fired={fired[s.id] ? 'true' : undefined}><Icon /></span>
              <span className="au-sfx__name">{s.name}</span>
            </button>
          );
        })}
      </div>
      <p className="au-hint">{preview ? 'Os efeitos tocam apenas no seu computador.' : 'Cada efeito toca para toda a mesa.'}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Personal mixer
// ---------------------------------------------------------------------------

const MIXER_ROWS: { key: AudioPrefKey; label: string; icon: ReactNode; hint: string }[] = [
  { key: 'master', label: 'Geral', icon: <Volume2 />, hint: 'Tudo o que você ouve' },
  { key: 'music', label: 'Música', icon: <Music />, hint: 'Trilhas das playlists' },
  { key: 'ambience', label: 'Ambiente', icon: <Trees />, hint: 'Chuva, taverna, masmorra…' },
  { key: 'sfx', label: 'Efeitos', icon: <Zap />, hint: 'Espadas, magias, dados, seu turno' },
];

function Mixer({ isDM }: { isDM: boolean }) {
  const prefs = useAudioPrefs();
  const muted = useUi((s) => s.muted);
  const tableMaster = useGame((s) => s.state?.audio.masterVolume ?? 1);
  const [tm, setTm] = useState(tableMaster);
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setTm(tableMaster);
  }, [tableMaster]);
  const sendMaster = useDebouncedSender<number>((v) => {
    void act('audio.master', { volume: v }, { quiet: true });
  }, 220);

  return (
    <div className="au-mixer">
      <div className="section-title">Meu volume</div>
      <div className="au-mute-row">
        <div>
          <div className="au-mute-row__title">{muted ? 'Som desligado' : 'Som ligado'}</div>
          <div className="au-hint">Só afeta você. Fica salvo neste navegador.</div>
        </div>
        <Toggle checked={!muted} onChange={(on) => setAudioMuted(!on)} />
      </div>
      {MIXER_ROWS.map((r) => (
        <div key={r.key} className="au-vol" data-muted={muted ? 'true' : undefined}>
          <span className="au-vol__icon">{r.icon}</span>
          <div className="au-vol__body">
            <div className="au-vol__label">
              <span>{r.label}</span>
              <span className="au-vol__pct">{pct(prefs[r.key])}</span>
            </div>
            <Range value={prefs[r.key]} label={`Volume: ${r.label}`} onChange={(v) => prefs.setVolume(r.key, v)} />
            <div className="au-vol__hint">{r.hint}</div>
          </div>
        </div>
      ))}

      {isDM && (
        <>
          <div className="section-title u-mt-3">Mesa</div>
          <div className="au-vol au-vol--dm">
            <span className="au-vol__icon"><AudioLines /></span>
            <div className="au-vol__body">
              <div className="au-vol__label">
                <span>Volume geral da mesa</span>
                <span className="au-vol__pct">{pct(tm)}</span>
              </div>
              <Range
                value={tm}
                label="Volume geral da mesa"
                onChange={(v) => {
                  dragging.current = true;
                  setTm(v);
                  sendMaster(v);
                }}
                onCommit={(v) => {
                  dragging.current = false;
                  sendMaster(v, true);
                }}
              />
              <div className="au-vol__hint">Multiplica o volume de todos os jogadores.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
