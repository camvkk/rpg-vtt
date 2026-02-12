import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../contexts/GameContext';

export default function JournalPanel() {
  const { state, actions } = useGame();
  const { journal, player, players } = state;
  const isDM = player.isDM;
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editData, setEditData] = useState({ title: '', content: '', imageUrl: '', sharedWith: [] });
  const fileRef = useRef(null);

  useEffect(() => {
    actions.listJournal();
  }, []);

  const serverUrl = (() => {
    const h = window.location.hostname;
    return import.meta.env.VITE_SERVER_URL ||
      (h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin);
  })();

  const handleCreate = useCallback(() => {
    const id = `journal_${Date.now()}`;
    setEditData({ title: 'Nova Entrada', content: '', imageUrl: '', sharedWith: [] });
    setSelectedEntry(id);
    setEditing(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!editData.title.trim()) return;
    actions.saveJournalEntry({
      id: selectedEntry,
      title: editData.title,
      content: editData.content,
      imageUrl: editData.imageUrl || null,
      sharedWith: editData.sharedWith,
    });
    setEditing(false);
  }, [actions, selectedEntry, editData]);

  const handleDelete = useCallback((entryId) => {
    if (confirm('Excluir esta entrada?')) {
      actions.deleteJournalEntry(entryId);
      if (selectedEntry === entryId) {
        setSelectedEntry(null);
        setEditing(false);
      }
    }
  }, [actions, selectedEntry]);

  const handleImageUpload = useCallback(async (file) => {
    if (!file) return;
    try {
      const resp = await fetch(`${serverUrl}/api/upload-journal-image`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const data = await resp.json();
      if (data.success) {
        setEditData(prev => ({ ...prev, imageUrl: data.url }));
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    }
  }, [serverUrl]);

  const toggleShare = useCallback((name) => {
    setEditData(prev => {
      const shared = [...prev.sharedWith];
      if (name === 'all') {
        return { ...prev, sharedWith: shared.includes('all') ? [] : ['all'] };
      }
      const idx = shared.indexOf(name);
      if (idx >= 0) shared.splice(idx, 1);
      else shared.push(name);
      return { ...prev, sharedWith: shared.filter(s => s !== 'all') };
    });
  }, []);

  const openEntry = useCallback((entry) => {
    setSelectedEntry(entry.id);
    setEditData({
      title: entry.title,
      content: entry.content || '',
      imageUrl: entry.imageUrl || '',
      sharedWith: entry.sharedWith || [],
    });
    setEditing(false);
  }, []);

  // Detail/edit view
  if (selectedEntry) {
    const entry = journal.find(e => e.id === selectedEntry);
    return (
      <div className="gb-panel-section" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setSelectedEntry(null); setEditing(false); }}>
            ← Voltar
          </button>
          <span style={{ flex: 1 }} />
          {isDM && !editing && (
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>✏️ Editar</button>
          )}
        </div>

        {editing && isDM ? (
          <>
            <input
              className="input"
              value={editData.title}
              onChange={(e) => setEditData(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Título"
              style={{ fontWeight: 600 }}
            />
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => setEditData(prev => ({ ...prev, content: e.currentTarget.innerHTML }))}
              dangerouslySetInnerHTML={{ __html: editData.content }}
              style={{
                minHeight: 120, padding: 'var(--spacing-sm)',
                background: 'var(--bg-surface)', border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)', fontSize: '0.85rem',
                color: 'var(--color-text)', outline: 'none',
                overflow: 'auto', maxHeight: 300,
              }}
            />
            <div style={{ display: 'flex', gap: 'var(--spacing-xs)', flexWrap: 'wrap', fontSize: '0.75rem' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => document.execCommand('bold')}>
                <b>B</b>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => document.execCommand('italic')}>
                <i>I</i>
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => document.execCommand('formatBlock', false, 'h3')}>
                H3
              </button>
            </div>

            {/* Image */}
            <div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={(e) => handleImageUpload(e.target.files?.[0])} />
              <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                🖼️ {editData.imageUrl ? 'Trocar Imagem' : 'Anexar Imagem'}
              </button>
              {editData.imageUrl && (
                <div style={{ marginTop: 4 }}>
                  <img src={editData.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 'var(--radius-sm)' }} />
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditData(prev => ({ ...prev, imageUrl: '' }))}>
                    🗑️ Remover
                  </button>
                </div>
              )}
            </div>

            {/* Sharing */}
            <div>
              <label className="form-label" style={{ fontSize: '0.8rem' }}>Compartilhar com:</label>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${editData.sharedWith.includes('all') ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => toggleShare('all')}
                >
                  Todos
                </button>
                {players.filter(p => !p.is_dm).map(p => (
                  <button
                    key={p.id}
                    className={`btn btn-sm ${editData.sharedWith.includes(p.name) ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => toggleShare(p.name)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>

            <button className="btn btn-primary btn-sm" onClick={handleSave}>💾 Salvar</button>
          </>
        ) : (
          <>
            <h4 style={{ margin: 0, fontSize: '1rem' }}>{editData.title}</h4>
            {editData.imageUrl && (
              <img src={editData.imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 'var(--radius-sm)' }} />
            )}
            <div
              dangerouslySetInnerHTML={{ __html: editData.content || '<em style="color:var(--color-text-dim)">Sem conteúdo</em>' }}
              style={{ fontSize: '0.85rem', lineHeight: 1.5 }}
            />
            {isDM && editData.sharedWith.length > 0 && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                👁️ Visível para: {editData.sharedWith.join(', ')}
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  // List view
  return (
    <div className="gb-panel-section">
      <div className="panel-header" style={{ marginBottom: 'var(--spacing-sm)' }}>
        <h3 className="heading-sm">📋 Diário</h3>
        {isDM && (
          <button className="btn btn-ghost btn-sm" onClick={handleCreate} title="Nova entrada">
            ➕
          </button>
        )}
      </div>

      {journal.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-dim)', padding: 'var(--spacing-sm)' }}>
          {isDM ? 'Nenhuma entrada. Clique ➕ para criar.' : 'Nenhuma entrada disponível.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xs)' }}>
          {journal.map((entry) => (
            <div
              key={entry.id}
              onClick={() => openEntry(entry)}
              style={{
                padding: '8px 10px', background: 'var(--bg-surface)',
                border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)',
              }}
            >
              <span style={{ fontSize: '1.1rem' }}>{entry.imageUrl ? '🖼️' : '📝'}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.title}
                </div>
                {isDM && entry.sharedWith?.length > 0 && (
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-dim)' }}>
                    👁️ {entry.sharedWith.includes('all') ? 'Todos' : entry.sharedWith.join(', ')}
                  </div>
                )}
              </div>
              {isDM && (
                <button
                  className="btn btn-ghost"
                  style={{ padding: '2px 6px', fontSize: '0.75rem', color: 'var(--color-danger, #ef4444)' }}
                  onClick={(e) => { e.stopPropagation(); handleDelete(entry.id); }}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
