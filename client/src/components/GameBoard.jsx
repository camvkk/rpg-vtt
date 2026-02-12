import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import MapCanvas from './MapCanvas';
import DiceRoller from './DiceRoller';
import ChatPanel from './ChatPanel';
import Initiative from './Initiative';
import CharSheet from './CharSheet';
import Ambiance from './Ambiance';
import '../styles/GameBoard.css';

export default function GameBoard({ onLeaveRoom }) {
  const { state, actions } = useGame();
  const { room, player, players, tokens, initiative, chat, ui, connected } = state;
  const isDM = player.isDM;
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [showMapUpload, setShowMapUpload] = useState(false);
  const [showTokenCreator, setShowTokenCreator] = useState(false);
  const [tokenAwaitingPlacement, setTokenAwaitingPlacement] = useState(null);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handle = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 's': actions.setActiveTool('select'); e.preventDefault(); break;
        case 'f': if (isDM) { actions.setActiveTool('fog'); e.preventDefault(); } break;
        case 't': if (isDM) { actions.setActiveTool('add-token'); e.preventDefault(); } break;
        case 'escape': actions.setActiveTool('select'); e.preventDefault(); break;
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [isDM, actions]);

  // ── Chat input handler ──
  const handleChatSend = useCallback((messageData) => {
    if (messageData.type === 'dice_command') {
      actions.rollDice(messageData.diceNotation);
    } else if (messageData.type === 'gm_dice_command' && isDM) {
      actions.rollDice(messageData.diceNotation, true);
    } else if (messageData.type === 'whisper') {
      actions.sendMessage(messageData.content, true, messageData.target);
    } else {
      actions.sendMessage(messageData.content);
    }
  }, [actions, isDM]);

  // ── Dice roll handler ──
  const handleDiceRoll = useCallback((rollData) => {
    actions.rollDice(rollData.notation);
  }, [actions]);

  // ── Map upload handler (HTTP upload, not base64 via socket) ──
  const handleMapUpload = useCallback(async (file) => {
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
        actions.setMap(data.url);
        setShowMapUpload(false);
      }
    } catch (err) {
      console.error('Map upload failed:', err);
    }
  }, [actions]);

  const handleMapUrlSet = useCallback((url) => {
    if (!url) return;
    actions.setMap(url);
    setShowMapUpload(false);
  }, [actions]);

  // ── Token creation handler ──
  const handleTokenCreate = useCallback((tokenData) => {
    setTokenAwaitingPlacement(tokenData);
    setShowTokenCreator(false);
    actions.setActiveTool('add-token');
  }, [actions]);

  if (!connected) {
    return (
      <div className="gb-loading">
        <div className="gb-loading-inner">
          <div className="gb-spinner" />
          <h2 className="heading-lg">Conectando à mesa...</h2>
          <p className="text-dim">Aguarde enquanto carregamos o jogo</p>
        </div>
      </div>
    );
  }

  return (
    <div className="game-board">
      {/* ── Toolbar ── */}
      <div className="gb-toolbar">
        <div className="gb-toolbar-left">
          <button className="btn btn-ghost gb-toolbar-btn" onClick={onLeaveRoom}>
            ← Sair
          </button>
          <div className="gb-toolbar-divider" />
          <ToolButton id="select" icon="🏹" label="Selecionar" active={ui.activeTool} onClick={actions.setActiveTool} />
          {isDM && (
            <>
              <ToolButton id="fog" icon="🌫️" label="Névoa" active={ui.activeTool} onClick={actions.setActiveTool} />
              <button 
                className={`btn ${tokenAwaitingPlacement ? 'btn-primary' : 'btn-ghost'} gb-toolbar-btn`}
                onClick={() => setShowTokenCreator(true)}
                title="Criar Token"
              >
                🎭 Token
              </button>
              <button 
                className="btn btn-ghost gb-toolbar-btn" 
                onClick={() => setShowMapUpload(true)}
                title="Upload de Mapa"
              >
                🗺️ Mapa
              </button>
            </>
          )}
        </div>

        <div className="gb-toolbar-center">
          <span className="gb-room-code">#{room.code}</span>
        </div>

        <div className="gb-toolbar-right">
          <button 
            className="btn btn-ghost gb-toolbar-btn" 
            onClick={() => setShowCharSheet(!showCharSheet)}
            title="Ficha de Personagem"
          >
            📋 Ficha
          </button>
          {isDM && (
            <button 
              className="btn btn-ghost gb-toolbar-btn" 
              onClick={actions.clearFog}
              title="Limpar Névoa"
            >
              🌫️ Limpar
            </button>
          )}
          <button className="btn btn-ghost gb-toolbar-btn" onClick={actions.toggleLeftPanel}>
            {ui.leftPanel ? '◄' : '►'}
          </button>
          <button className="btn btn-ghost gb-toolbar-btn" onClick={actions.toggleRightPanel}>
            {ui.rightPanel ? '►' : '◄'}
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="gb-content">
        {/* Left panel */}
        {ui.leftPanel && (
          <div className="gb-side-panel gb-left-panel">
            {/* Players */}
            <div className="gb-panel-section">
              <div className="panel-header">
                <h3 className="heading-sm">Jogadores</h3>
                <span style={{ fontSize: '0.8rem' }} className="text-dim">{players.length} conectados</span>
              </div>
              <div className="gb-player-list">
                {players.map((p) => (
                  <div key={p.id} className={`gb-player-item ${p.is_dm ? 'dm' : ''}`}>
                    <div className="gb-player-avatar">{p.name?.[0]?.toUpperCase()}</div>
                    <div className="gb-player-info">
                      <div className="gb-player-name">{p.name}</div>
                      <div className="gb-player-role text-dim">
                        {p.is_dm ? 'Mestre' : 'Jogador'}
                        {p.id === player.id && ' (Você)'}
                      </div>
                    </div>
                    <span>{p.is_connected !== false ? '🟢' : '🔴'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Initiative */}
            <Initiative
              combatants={initiative.players?.map((p, i) => ({
                id: p.playerId,
                name: p.playerName,
                initiative: p.initiative,
                hp: { current: 100, max: 100 },
                ac: 15,
                conditions: p.conditions || [],
              })) || []}
              currentTurn={initiative.currentTurn}
              isInCombat={initiative.active}
              isDM={isDM}
              onNextTurn={() => actions.nextTurn()}
              onRollInitiative={() => actions.rollInitiative(player.id)}
              onStartCombat={() => actions.rollInitiative(player.id)}
              onEndCombat={() => actions.clearInitiative()}
            />

            {/* Ambiance (DM) */}
            {isDM && <Ambiance isDM={isDM} />}
          </div>
        )}

        {/* Center — Map Canvas */}
        <div className="gb-canvas-area">
          <MapCanvas 
            isDM={isDM} 
            tokenAwaitingPlacement={tokenAwaitingPlacement}
            onTokenPlaced={() => setTokenAwaitingPlacement(null)}
          />
        </div>

        {/* Right panel */}
        {ui.rightPanel && (
          <div className="gb-side-panel gb-right-panel">
            <ChatPanel
              messages={chat}
              onSendMessage={handleChatSend}
              currentUser={{ name: player.name, id: player.id }}
              isConnected={connected}
            />
            <DiceRoller onRoll={handleDiceRoll} />
          </div>
        )}
      </div>

      {/* Character Sheet Modal */}
      {showCharSheet && (
        <div className="gb-charsheet-overlay">
          <div className="gb-charsheet-container">
            <CharSheet
              character={null} // Usar personagem padrão por enquanto
              isEditable={!isDM} // Jogadores editam, DM só visualiza
              onUpdateCharacter={() => {}}
              onRollDice={handleDiceRoll}
              onToggleCollapse={() => setShowCharSheet(false)}
            />
          </div>
        </div>
      )}

      {/* Map Upload Modal */}
      {showMapUpload && (
        <div className="gb-charsheet-overlay">
          <div className="gb-map-upload-container">
            <MapUploadModal
              onUpload={handleMapUpload}
              onUrlSet={handleMapUrlSet}
              onClose={() => setShowMapUpload(false)}
            />
          </div>
        </div>
      )}

      {/* Token Creator Modal */}
      {showTokenCreator && (
        <div className="gb-charsheet-overlay">
          <div className="gb-token-creator-container">
            <TokenCreatorModal
              onCreateToken={handleTokenCreate}
              onClose={() => setShowTokenCreator(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Token Creator Modal ──
function TokenCreatorModal({ onCreateToken, onClose }) {
  const [tokenName, setTokenName] = useState('');
  const [tokenColor, setTokenColor] = useState('#3b82f6');
  const [tokenSize, setTokenSize] = useState('medium');
  const [tokenImage, setTokenImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const sizeOptions = {
    small: { label: 'Pequeno', value: 'small', multiplier: 0.7 },
    medium: { label: 'Médio', value: 'medium', multiplier: 1 },
    large: { label: 'Grande', value: 'large', multiplier: 1.5 }
  };

  const presetColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
    '#6b7280', '#1f2937', '#dc2626', '#059669'
  ];

  // Handle file selection for token image
  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione apenas arquivos de imagem.');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) { // 2MB limit
      alert('Arquivo muito grande. Máximo 2MB.');
      return;
    }
    
    setIsUploading(true);
    
    try {
      const h = window.location.hostname;
      const serverUrl = import.meta.env.VITE_SERVER_URL || 
        (h === 'localhost' || h === '127.0.0.1' ? 'http://localhost:3001' : window.location.origin);
      
      const response = await fetch(`${serverUrl}/api/upload-token`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      
      const data = await response.json();
      if (data.success) {
        setImageUrl(data.url);
        setTokenImage(URL.createObjectURL(file)); // For preview
      } else {
        alert('Erro no upload da imagem.');
      }
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Erro no upload da imagem.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = () => {
    if (!tokenName.trim()) return;
    
    const token = {
      id: `token_${Date.now()}`,
      name: tokenName.trim(),
      color: tokenColor,
      size: tokenSize,
      x: 0, // Will be set when placed
      y: 0,
      ...(imageUrl && { imageUrl }) // Include imageUrl if we have one
    };
    
    onCreateToken(token);
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--spacing-lg)',
      maxWidth: '400px',
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-lg)'
      }}>
        <h3 className="heading-sm" style={{ margin: 0 }}>🎭 Criar Token</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-dim)',
            cursor: 'pointer',
            fontSize: '1.2rem'
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {/* Token Preview */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          marginBottom: 'var(--spacing-md)'
        }}>
          <div style={{
            width: `${40 * sizeOptions[tokenSize].multiplier}px`,
            height: `${40 * sizeOptions[tokenSize].multiplier}px`,
            borderRadius: '50%',
            backgroundColor: tokenImage ? 'transparent' : tokenColor,
            border: '2px solid #ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            backgroundImage: tokenImage ? `url(${tokenImage})` : 'none',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            overflow: 'hidden'
          }}>
            {!tokenImage && (tokenName?.[0]?.toUpperCase() || '?')}
          </div>
        </div>

        {/* Token Name */}
        <div>
          <label className="form-label">Nome do Token</label>
          <input
            type="text"
            className="input"
            placeholder="Ex: Goblin, Orc Capitão..."
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
          />
        </div>

        {/* Token Image Upload */}
        <div>
          <label className="form-label">Imagem do Token (opcional)</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            style={{ display: 'none' }}
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              style={{ flex: 1 }}
            >
              {isUploading ? '⏳ Enviando...' : '📁 Escolher Imagem'}
            </button>
            {imageUrl && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setImageUrl('');
                  setTokenImage(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                style={{ color: 'var(--color-danger)' }}
              >
                🗑️ Remover
              </button>
            )}
          </div>
          {imageUrl && (
            <div style={{
              marginTop: 'var(--spacing-xs)',
              fontSize: '0.8rem',
              color: 'var(--color-text-dim)'
            }}>
              ✅ Imagem carregada com sucesso
            </div>
          )}
        </div>

        {/* Token Size */}
        <div>
          <label className="form-label">Tamanho</label>
          <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
            {Object.entries(sizeOptions).map(([key, option]) => (
              <button
                key={key}
                className={`btn ${tokenSize === key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTokenSize(key)}
                style={{ flex: 1, fontSize: '0.8rem' }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Token Color (fallback when no image) */}
        {!imageUrl && (
          <div>
            <label className="form-label">Cor</label>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(6, 1fr)',
              gap: 'var(--spacing-sm)',
              marginBottom: 'var(--spacing-sm)'
            }}>
              {presetColors.map(color => (
                <button
                  key={color}
                  onClick={() => setTokenColor(color)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: color,
                    border: tokenColor === color ? '3px solid var(--color-primary)' : '2px solid var(--color-border)',
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>
            <input
              type="color"
              value={tokenColor}
              onChange={(e) => setTokenColor(e.target.value)}
              style={{
                width: '100%',
                height: '40px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer'
              }}
            />
          </div>
        )}

        {/* Create Button */}
        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={!tokenName.trim()}
          style={{ marginTop: 'var(--spacing-md)' }}
        >
          Criar Token
        </button>

        <div style={{
          padding: 'var(--spacing-sm)',
          background: 'var(--bg-surface-light)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
          color: 'var(--color-text-dim)'
        }}>
          💡 <strong>Dica:</strong> Após criar, clique no mapa para posicionar o token.
        </div>
      </div>
    </div>
  );
}

// ── Map Upload Modal ──
function MapUploadModal({ onUpload, onUrlSet, onClose }) {
  const [mapUrl, setMapUrl] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onUpload(file);
    }
  };

  const handleUrlSubmit = () => {
    if (mapUrl.trim()) {
      onUrlSet(mapUrl.trim());
    }
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--spacing-lg)',
      maxWidth: '400px',
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-lg)'
      }}>
        <h3 className="heading-sm" style={{ margin: 0 }}>🗺️ Upload de Mapa</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-text-dim)',
            cursor: 'pointer',
            fontSize: '1.2rem'
          }}
        >
          ✕
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
        {/* File Upload */}
        <div>
          <label className="form-label">Upload de Arquivo</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
          <button
            className="btn btn-ghost"
            onClick={() => fileInputRef.current?.click()}
            style={{ width: '100%' }}
          >
            📁 Escolher Arquivo de Imagem
          </button>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          color: 'var(--color-text-dim)',
          fontSize: '0.85rem'
        }}>
          <hr style={{ flex: 1, border: '1px solid var(--color-border)' }} />
          <span>ou</span>
          <hr style={{ flex: 1, border: '1px solid var(--color-border)' }} />
        </div>

        {/* URL Input */}
        <div>
          <label className="form-label">URL da Imagem</label>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <input
              type="url"
              className="input"
              placeholder="https://exemplo.com/mapa.jpg"
              value={mapUrl}
              onChange={(e) => setMapUrl(e.target.value)}
              style={{ flex: 1 }}
            />
            <button
              className="btn btn-primary"
              onClick={handleUrlSubmit}
              disabled={!mapUrl.trim()}
            >
              Definir
            </button>
          </div>
        </div>

        <div style={{
          padding: 'var(--spacing-sm)',
          background: 'var(--bg-surface-light)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
          color: 'var(--color-text-dim)'
        }}>
          💡 <strong>Dica:</strong> Use imagens otimizadas para melhor performance.
          Formatos suportados: JPG, PNG, WebP.
        </div>
      </div>
    </div>
  );
}

// ── Small tool button ──
function ToolButton({ id, icon, label, active, onClick }) {
  const isActive = active === id;
  return (
    <button
      className={`btn ${isActive ? 'btn-primary' : 'btn-ghost'} gb-toolbar-btn`}
      onClick={() => onClick(id)}
    >
      {icon} {label}
    </button>
  );
}
