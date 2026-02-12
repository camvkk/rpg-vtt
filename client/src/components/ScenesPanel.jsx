import { useState, useEffect, useRef, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';

export default function ScenesPanel() {
  const { state, actions } = useGame();
  const { scenes, player } = state;
  const isDM = player.isDM;
  const [editingScene, setEditingScene] = useState(null);
  const [newName, setNewName] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    actions.listScenes();
  }, []);

  const handleCreate = useCallback(() => {
    const id = `scene_${Date.now()}`;
    actions.saveScene({
      id,
      name: 'Nova Cena',
      mapUrl: null,
      gridConfig: null,
      tokens: [],
      fog: [],
      walls: [],
      drawings: [],
      aoeEffects: [],
      isActive: false,
      sortOrder: scenes.length,
    });
  }, [actions, scenes.length]);

  const handleActivate = useCallback((sceneId) => {
    // Save current scene state first, then activate new one
    actions.saveCurrentScene().then(() => {
      actions.activateScene(sceneId);
    }).catch(() => {
      actions.activateScene(sceneId);
    });
  }, [actions]);

  const handleDelete = useCallback((sceneId) => {
    if (confirm('Excluir esta cena?')) {
      actions.deleteScene(sceneId);
    }
  }, [actions]);

  const handleRename = useCallback((scene) => {
    if (!newName.trim()) return;
    actions.saveScene({ ...scene, name: newName.trim() });
    setEditingScene(null);
    setNewName('');
  }, [actions, newName]);

  const handleMapUpload = useCallback(async (scene, file) => {
    if (!file) return;
    try {
      const h = window.location.hostname;
      const serverUrl = import.meta.env.VITE_SERVER_URL ||
        (h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin);
      const resp = await fetch(`${serverUrl}/api/upload-map`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await resp.json();
      if (data.success) {
        actions.saveScene({ ...scene, mapUrl: data.url });
      }
    } catch (err) {
      console.error('Map upload failed:', err);
    }
  }, [actions]);

  const activeScene = scenes.find(s => s.isActive);

  return (
    <div className="gb-panel-section">
      <div className="panel-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
        <h3 className="heading-sm">🗺️ Cenas</h3>
        {isDM && (
          <button className="btn btn-ghost btn-sm" onClick={handleCreate} title="Nova cena">
            ➕
          </button>
        )}
      </div>

      {scenes.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', padding: 'var(--spacing-sm)' }}>
          {isDM ? 'Nenhuma cena. Clique ➕ para criar.' : 'Nenhuma cena disponível.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          {scenes.map((scene) => (
            <div
              key={scene.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                padding: '8px 10px',
                background: scene.isActive ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
                border: `1px solid ${scene.isActive ? 'var(--color-primary)' : 'var(--color-border)'}`,
                borderRadius: 'var(--radius-md)',
                cursor: isDM ? 'pointer' : 'default',
              }}
            >
              {/* Thumbnail */}
              <div style={{
                width: 36, height: 36, borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-light)', overflow: 'hidden',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', flexShrink: 0,
              }}>
                {scene.mapUrl ? (
                  <img src={scene.mapUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : '🗺️'}
              </div>

              {/* Name */}
              <div style={{ flex: 1, minWidth: 0 }}>
                {editingScene === scene.id ? (
                  <input
                    className="input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename(scene)}
                    onBlur={() => handleRename(scene)}
                    autoFocus
                    style={{ fontSize: '0.8rem', padding: '2px 6px' }}
                  />
                ) : (
                  <div style={{ fontSize: '0.85rem', fontWeight: scene.isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {scene.isActive && '▶ '}{scene.name}
                  </div>
                )}
              </div>

              {/* Actions (DM only) */}
              {isDM && (
                <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                  {!scene.isActive && (
                    <button
                      className="btn btn-ghost"
                      style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                      onClick={() => handleActivate(scene.id)}
                      title="Ativar cena"
                    >
                      ▶
                    </button>
                  )}
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    onClick={() => { setEditingScene(scene.id); setNewName(scene.name); }}
                    title="Renomear"
                  >
                    ✏️
                  </button>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    ref={fileRef}
                    onChange={(e) => {
                      handleMapUpload(scene, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.75rem' }}
                    onClick={() => fileRef.current?.click()}
                    title="Definir mapa"
                  >
                    🖼️
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--color-danger, #ef4444)' }}
                    onClick={() => handleDelete(scene.id)}
                    title="Excluir"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {isDM && activeScene && (
        <button
          className="btn btn-ghost"
          style={{ marginTop: 'var(--spacing-sm)', fontSize: '0.8rem', width: '100%' }}
          onClick={() => actions.saveCurrentScene()}
        >
          💾 Salvar Estado da Cena Ativa
        </button>
      )}
    </div>
  );
}
