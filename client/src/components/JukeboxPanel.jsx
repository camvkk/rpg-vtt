import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../contexts/GameContext';

export default function JukeboxPanel() {
  const { state, actions } = useGame();
  const { jukebox, player } = state;
  const isDM = player.isDM;
  const { playlists, currentTrack, isPlaying, volume } = jukebox;
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [addingTrack, setAddingTrack] = useState(false);
  const [trackUrl, setTrackUrl] = useState('');
  const [trackName, setTrackName] = useState('');
  const [localVolume, setLocalVolume] = useState(0.7);
  const audioRef = useRef(null);
  const fileRef = useRef(null);

  const serverUrl = (() => {
    const h = window.location.hostname;
    return import.meta.env.VITE_SERVER_URL ||
      (h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin);
  })();

  useEffect(() => {
    actions.listPlaylists();
  }, []);

  // Audio playback sync
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying && currentTrack?.url) {
      // Check if it's a direct audio file
      const url = currentTrack.url;
      const isDirectAudio = /\.(mp3|ogg|wav|flac|m4a|aac|webm)(\?|$)/i.test(url) || url.startsWith('/public/');
      if (isDirectAudio) {
        const fullUrl = url.startsWith('/') ? `${serverUrl}${url}` : url;
        if (audioRef.current.src !== fullUrl) {
          audioRef.current.src = fullUrl;
        }
        audioRef.current.play().catch(() => {});
      } else {
        audioRef.current.pause();
      }
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack, serverUrl]);

  // Volume sync
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = Math.min(1, volume * localVolume);
    }
  }, [volume, localVolume]);

  const handleCreatePlaylist = useCallback(() => {
    const id = `playlist_${Date.now()}`;
    actions.savePlaylist({ id, name: 'Nova Playlist', tracks: [], sortOrder: playlists.length });
    setSelectedPlaylist(id);
  }, [actions, playlists.length]);

  const handleDeletePlaylist = useCallback((playlistId) => {
    if (confirm('Excluir esta playlist?')) {
      actions.deletePlaylist(playlistId);
      if (selectedPlaylist === playlistId) setSelectedPlaylist(null);
    }
  }, [actions, selectedPlaylist]);

  const handleAddTrack = useCallback(async (file) => {
    if (!file) return;
    try {
      const resp = await fetch(`${serverUrl}/api/upload-audio`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await resp.json();
      if (data.success) {
        const pl = playlists.find(p => p.id === selectedPlaylist);
        if (!pl) return;
        const newTrack = {
          id: `track_${Date.now()}`,
          name: file.name.replace(/\.[^.]+$/, ''),
          url: data.url,
        };
        actions.savePlaylist({ ...pl, tracks: [...pl.tracks, newTrack] });
      }
    } catch (err) {
      console.error('Audio upload failed:', err);
    }
  }, [serverUrl, actions, playlists, selectedPlaylist]);

  const handleAddUrlTrack = useCallback(() => {
    if (!trackUrl.trim() || !selectedPlaylist) return;
    const pl = playlists.find(p => p.id === selectedPlaylist);
    if (!pl) return;
    const newTrack = {
      id: `track_${Date.now()}`,
      name: trackName.trim() || trackUrl.trim().split('/').pop() || 'Faixa',
      url: trackUrl.trim(),
    };
    actions.savePlaylist({ ...pl, tracks: [...pl.tracks, newTrack] });
    setTrackUrl('');
    setTrackName('');
    setAddingTrack(false);
  }, [trackUrl, trackName, actions, playlists, selectedPlaylist]);

  const handleRemoveTrack = useCallback((trackId) => {
    const pl = playlists.find(p => p.id === selectedPlaylist);
    if (!pl) return;
    actions.savePlaylist({ ...pl, tracks: pl.tracks.filter(t => t.id !== trackId) });
  }, [actions, playlists, selectedPlaylist]);

  const handlePlayTrack = useCallback((track, playlist) => {
    actions.jukeboxPlay({ ...track, playlistId: playlist.id, loop: true });
  }, [actions]);

  const handleNextTrack = useCallback(() => {
    if (!currentTrack?.playlistId) return;
    const pl = playlists.find(p => p.id === currentTrack.playlistId);
    if (!pl || pl.tracks.length === 0) return;
    const idx = pl.tracks.findIndex(t => t.id === currentTrack.id);
    const next = pl.tracks[(idx + 1) % pl.tracks.length];
    if (next) actions.jukeboxPlay({ ...next, playlistId: pl.id, loop: true });
  }, [actions, currentTrack, playlists]);

  const currentPl = playlists.find(p => p.id === selectedPlaylist);

  return (
    <div className="gb-panel-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
      <audio ref={audioRef} loop onEnded={handleNextTrack} style={{ display: 'none' }} />

      <div className="panel-header">
        <h3 className="heading-sm">🎵 Jukebox</h3>
      </div>

      {/* Now Playing */}
      {isPlaying && currentTrack && (
        <div style={{
          padding: 'var(--spacing-sm)', background: 'rgba(59,130,246,0.1)',
          border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>🎶 Tocando agora</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {currentTrack.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginTop: 6 }}>
            {isDM && (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => actions.jukeboxStop()}>⏹️</button>
                <button className="btn btn-ghost btn-sm" onClick={handleNextTrack}>⏭️</button>
              </>
            )}
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>Vol:</span>
            <input
              type="range" min="0" max="1" step="0.05"
              value={localVolume}
              onChange={(e) => setLocalVolume(parseFloat(e.target.value))}
              style={{ flex: 1, height: 4 }}
            />
          </div>
          {isDM && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginTop: 4 }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>Master:</span>
              <input
                type="range" min="0" max="1" step="0.05"
                value={volume}
                onChange={(e) => actions.jukeboxVolume(parseFloat(e.target.value))}
                style={{ flex: 1, height: 4 }}
              />
            </div>
          )}
        </div>
      )}

      {/* Playlists */}
      {!selectedPlaylist ? (
        <>
          {isDM && (
            <button className="btn btn-ghost btn-sm" onClick={handleCreatePlaylist} style={{ width: '100%' }}>
              ➕ Nova Playlist
            </button>
          )}
          {playlists.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', padding: 'var(--spacing-sm)' }}>
              {isDM ? 'Nenhuma playlist criada.' : 'Sem músicas disponíveis.'}
            </div>
          ) : (
            playlists.map(pl => (
              <div
                key={pl.id}
                onClick={() => setSelectedPlaylist(pl.id)}
                style={{
                  padding: '8px 10px', background: 'var(--bg-surface)',
                  border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
                }}
              >
                <span>🎵</span>
                <div style={{ flex: 1, fontSize: '0.85rem', fontWeight: 600 }}>{pl.name}</div>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                  {pl.tracks.length} faixa{pl.tracks.length !== 1 ? 's' : ''}
                </span>
                {isDM && (
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--color-danger, #ef4444)' }}
                    onClick={(e) => { e.stopPropagation(); handleDeletePlaylist(pl.id); }}
                  >
                    🗑️
                  </button>
                )}
              </div>
            ))
          )}
        </>
      ) : (
        <>
          {/* Playlist detail */}
          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedPlaylist(null); setAddingTrack(false); }}>
            ← Voltar
          </button>
          <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>🎵 {currentPl?.name || 'Playlist'}</div>

          {currentPl?.tracks.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)' }}>Nenhuma faixa.</div>
          ) : (
            currentPl?.tracks.map((track, i) => (
              <div
                key={track.id}
                style={{
                  padding: '6px 8px', background: currentTrack?.id === track.id ? 'rgba(59,130,246,0.1)' : 'var(--bg-surface)',
                  border: `1px solid ${currentTrack?.id === track.id ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center',
                  gap: 'var(--spacing-xs)', fontSize: '0.8rem',
                }}
              >
                {isDM && (
                  <button className="btn btn-ghost" style={{ padding: '2px 4px', fontSize: '0.7rem' }}
                    onClick={() => handlePlayTrack(track, currentPl)}>
                    ▶
                  </button>
                )}
                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {track.name}
                </div>
                {isDM && (
                  <button className="btn btn-ghost" style={{ padding: '2px 4px', fontSize: '0.7rem', color: 'var(--color-danger, #ef4444)' }}
                    onClick={() => handleRemoveTrack(track.id)}>
                    ✕
                  </button>
                )}
              </div>
            ))
          )}

          {/* Add track (DM only) */}
          {isDM && (
            <>
              {addingTrack ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
                  <input className="input" placeholder="Nome da faixa" value={trackName}
                    onChange={(e) => setTrackName(e.target.value)} style={{ fontSize: '0.8rem' }} />
                  <input className="input" placeholder="URL do áudio" value={trackUrl}
                    onChange={(e) => setTrackUrl(e.target.value)} style={{ fontSize: '0.8rem' }} />
                  <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                    <button className="btn btn-primary btn-sm" onClick={handleAddUrlTrack}>Adicionar</button>
                    <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }}
                      onChange={(e) => { handleAddTrack(e.target.files?.[0]); e.target.value = ''; setAddingTrack(false); }} />
                    <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                      📁 Upload
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setAddingTrack(false)}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-ghost btn-sm" onClick={() => setAddingTrack(true)} style={{ width: '100%' }}>
                  ➕ Adicionar Faixa
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
