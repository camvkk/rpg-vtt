import { useState, useEffect, useCallback, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import MapCanvas from './MapCanvas';
import DiceRoller from './DiceRoller';
import ChatPanel from './ChatPanel';
import Initiative from './Initiative';
import CharSheet from './CharSheet';
import Ambiance from './Ambiance';
import SystemImporter from './SystemImporter';
import DMDashboard from './DMDashboard';
import CharacterWizard from './CharacterWizard';
import '../styles/GameBoard.css';

// Error boundary to catch MapCanvas crashes
import { Component } from 'react';
class CanvasErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('CANVAS CRASH:', error, info.componentStack); }
  render() {
    if (this.state.error) return <div style={{color:'red',padding:20}}>Canvas Error: {this.state.error.message}</div>;
    return this.props.children;
  }
}

export default function GameBoard({ onLeaveRoom }) {
  const { state, actions } = useGame();
  const { room, player, players, tokens, initiative, chat, ui, connected, campaign, character, systemData, aoeEffects } = state;
  const isDM = player.isDM;
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [showMapUpload, setShowMapUpload] = useState(false);
  const [showTokenCreator, setShowTokenCreator] = useState(false);
  const [showGoogleDocs, setShowGoogleDocs] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showSystemImporter, setShowSystemImporter] = useState(false);
  const [showDMDashboard, setShowDMDashboard] = useState(false);
  const [showCharacterWizard, setShowCharacterWizard] = useState(false);
  const [tokenAwaitingPlacement, setTokenAwaitingPlacement] = useState(null);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handle = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 's': actions.setActiveTool('select'); e.preventDefault(); break;
        case 'f': if (isDM) { actions.setActiveTool('fog'); e.preventDefault(); } break;
        case 'w': if (isDM) { actions.setActiveTool('wall'); e.preventDefault(); } break;
        case 't': if (isDM) { actions.setActiveTool('add-token'); e.preventDefault(); } break;
        case 'a': if (isDM) { actions.setActiveTool('aoe'); e.preventDefault(); } break;
        case 'm': if (isDM) { actions.setActiveTool('measure'); e.preventDefault(); } break;
        case 'd': if (isDM) { actions.setActiveTool('draw'); e.preventDefault(); } break;
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

  // ── Character creation handler ──
  const handleCharacterCreate = useCallback((characterData) => {
    actions.updateCharacter(characterData);
    setShowCharacterWizard(false);
  }, [actions]);

  // ── Spell detection handler ──
  const handleSpellDetected = useCallback((spell) => {
    if (!isDM) return; // Only DMs can place AoE
    
    // Auto-configure AoE tool with spell parameters
    actions.setAoEConfig({
      shape: spell.shape,
      radius: spell.radius || 20,
      length: spell.length || 30,
      width: spell.width || 5,
      angle: spell.angle || 60,
      color: spell.color || 'damage',
      spellName: spell.name
    });
    
    // Switch to AoE tool
    actions.setActiveTool('aoe');
    
    // Show notification
    console.log(`🎯 Magia detectada: ${spell.name} - ${spell.description}`);
  }, [isDM, actions]);

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
              <ToolButton id="measure" icon="📏" label="Medir" active={ui.activeTool} onClick={actions.setActiveTool} />
              <ToolButton id="draw" icon="✏️" label="Desenhar" active={ui.activeTool} onClick={actions.setActiveTool} />
              <ToolButton id="aoe" icon="💥" label="AoE" active={ui.activeTool} onClick={actions.setActiveTool} />
              <ToolButton id="wall" icon="🧱" label="Paredes" active={ui.activeTool} onClick={actions.setActiveTool} />
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
              {campaign.id && (
                <>
                  <button 
                    className="btn btn-ghost gb-toolbar-btn" 
                    onClick={() => setShowDMDashboard(!showDMDashboard)}
                    title="Painel de Personagens"
                  >
                    👥 Grupo
                  </button>
                  <button 
                    className="btn btn-ghost gb-toolbar-btn" 
                    onClick={() => setShowDocsModal(true)}
                    title="Google Docs"
                  >
                    📄 Documento
                  </button>
                  {campaign.system === 'custom' && (
                    <button 
                      className="btn btn-ghost gb-toolbar-btn" 
                      onClick={() => setShowSystemImporter(true)}
                      title="Sistema Customizado"
                    >
                      📖 Sistema
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="gb-toolbar-center">
          {campaign.id ? (
            <div className="gb-campaign-info">
              <span className="gb-campaign-name">{campaign.name}</span>
              <span className="gb-room-code">#{room.code}</span>
            </div>
          ) : (
            <span className="gb-room-code">#{room.code}</span>
          )}
        </div>

        <div className="gb-toolbar-right">
          {campaign.googleDocsUrl && (
            <button 
              className={`btn btn-ghost gb-toolbar-btn ${showGoogleDocs ? 'active' : ''}`} 
              onClick={() => setShowGoogleDocs(!showGoogleDocs)}
              title="Mostrar/Ocultar Google Docs"
            >
              📄 Docs
            </button>
          )}
          <button 
            className="btn btn-ghost gb-toolbar-btn" 
            onClick={() => setShowCharSheet(!showCharSheet)}
            title="Ficha de Personagem"
          >
            📋 Ficha
          </button>
          <button 
            className="btn btn-ghost gb-toolbar-btn" 
            onClick={() => setShowCharacterWizard(true)}
            title="Criar Novo Personagem"
          >
            🧙 Criar Personagem
          </button>
          {isDM && (
            <>
              <button 
                className="btn btn-ghost gb-toolbar-btn" 
                onClick={actions.clearFog}
                title="Limpar Névoa"
              >
                🌫️ Limpar
              </button>
              <button 
                className="btn btn-ghost gb-toolbar-btn" 
                onClick={actions.clearWalls}
                title="Limpar Paredes"
              >
                🧱 Limpar
              </button>
            </>
          )}
          <button className="btn btn-ghost gb-toolbar-btn" onClick={actions.toggleLeftPanel}>
            {ui.leftPanel ? '◄' : '►'}
          </button>
          <button className="btn btn-ghost gb-toolbar-btn" onClick={actions.toggleRightPanel}>
            {ui.rightPanel ? '►' : '◄'}
          </button>
        </div>
      </div>

      {/* ── AoE Configuration Panel (only shown when AoE tool is active) ── */}
      {ui.activeTool === 'aoe' && isDM && (
        <AoEConfigPanel 
          config={ui.aoeConfig} 
          onConfigChange={actions.setAoEConfig}
          onClearAoE={actions.clearAoE}
        />
      )}

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
        <div className="gb-canvas-area" style={{ 
          display: 'flex', 
          flexDirection: showGoogleDocs ? 'row' : 'column' 
        }}>
          <div style={{ flex: 1, width: '100%', height: '100%', minHeight: 0 }}>
            <CanvasErrorBoundary>
              <MapCanvas 
                isDM={isDM} 
                tokenAwaitingPlacement={tokenAwaitingPlacement}
                onTokenPlaced={() => setTokenAwaitingPlacement(null)}
              />
            </CanvasErrorBoundary>
          </div>
          
          {/* Google Docs Panel */}
          {showGoogleDocs && campaign.googleDocsUrl && (
            <div className="gb-docs-panel">
              <div className="gb-docs-header">
                <span>📄 Documentos da Campanha</span>
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowGoogleDocs(false)}
                >
                  ✕
                </button>
              </div>
              <iframe
                src={convertToEmbedUrl(campaign.googleDocsUrl)}
                className="gb-docs-iframe"
                title="Google Docs"
                allowFullScreen
              />
            </div>
          )}
        </div>

        {/* Right panel */}
        {ui.rightPanel && (
          <div className="gb-side-panel gb-right-panel">
            <ChatPanel
              messages={chat}
              onSendMessage={handleChatSend}
              currentUser={{ name: player.name, id: player.id }}
              isConnected={connected}
              onSpellDetected={handleSpellDetected}
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
              character={character}
              isEditable={!isDM} // Jogadores editam, DM só visualiza
              onUpdateCharacter={(char) => actions.updateCharacter(char)}
              onRollDice={handleDiceRoll}
              onToggleCollapse={() => setShowCharSheet(false)}
              system={campaign.system || room.system || 'dnd5e'}
              systemData={systemData}
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

      {/* Google Docs Modal */}
      {showDocsModal && (
        <div className="gb-charsheet-overlay">
          <div className="gb-docs-modal-container">
            <GoogleDocsModal
              currentUrl={campaign.googleDocsUrl}
              onSave={async (url) => {
                try {
                  await actions.setGoogleDocs(campaign.id, url);
                  setShowDocsModal(false);
                } catch (err) {
                  console.error('Error setting Google Docs URL:', err);
                }
              }}
              onClose={() => setShowDocsModal(false)}
            />
          </div>
        </div>
      )}

      {/* System Importer Modal */}
      {showSystemImporter && (
        <SystemImporter
          isOpen={showSystemImporter}
          onClose={() => setShowSystemImporter(false)}
          campaignId={campaign.id}
        />
      )}

      {/* DM Dashboard Modal */}
      {showDMDashboard && isDM && campaign.id && (
        <div className="gb-charsheet-overlay">
          <div className="gb-dm-dashboard-container">
            <DMDashboard
              isOpen={showDMDashboard}
              onClose={() => setShowDMDashboard(false)}
            />
          </div>
        </div>
      )}

      {/* Character Wizard Modal */}
      <CharacterWizard
        isOpen={showCharacterWizard}
        onClose={() => setShowCharacterWizard(false)}
        onCreateCharacter={handleCharacterCreate}
        system={campaign.system || room.system || 'dnd5e'}
        systemData={systemData}
      />
    </div>
  );
}

// ── Google Docs URL conversion helper ──
function convertToEmbedUrl(url) {
  if (!url) return '';
  
  // Handle Google Docs
  if (url.includes('docs.google.com/document')) {
    // Convert /edit or /view to /preview
    return url.replace(/\/(edit|view).*$/, '/preview');
  }
  
  // Handle Google Sheets
  if (url.includes('docs.google.com/spreadsheets')) {
    // For sheets, use /htmlembed or /pubhtml
    return url.replace(/\/(edit|view).*$/, '/pubhtml?embedded=true');
  }
  
  // Handle Google Slides
  if (url.includes('docs.google.com/presentation')) {
    return url.replace(/\/(edit|view).*$/, '/embed');
  }
  
  // For other URLs, just return as-is
  return url;
}

// ── Token Creator Modal ──
function TokenCreatorModal({ onCreateToken, onClose }) {
  const [tokenName, setTokenName] = useState('');
  const [tokenColor, setTokenColor] = useState('#3b82f6');
  const [tokenSize, setTokenSize] = useState('medium');
  const [tokenImage, setTokenImage] = useState(null);
  const [imageUrl, setImageUrl] = useState('');
  const [lightRadius, setLightRadius] = useState(0);
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
      lightRadius: lightRadius,
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

        {/* Light Radius */}
        <div>
          <label className="form-label">Raio de Luz (quadrados do mapa)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <input
              type="range"
              min="0"
              max="10"
              step="1"
              value={lightRadius}
              onChange={(e) => setLightRadius(parseInt(e.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{
              minWidth: '60px',
              textAlign: 'center',
              padding: 'var(--spacing-xs)',
              background: 'var(--bg-surface-light)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.9rem',
              fontWeight: 'bold'
            }}>
              {lightRadius === 0 ? 'Nenhuma' : `${lightRadius} ${lightRadius === 1 ? 'quadrado' : 'quadrados'}`}
            </span>
          </div>
          {lightRadius > 0 && (
            <div style={{
              marginTop: 'var(--spacing-xs)',
              fontSize: '0.8rem',
              color: 'var(--color-text-dim)'
            }}>
              💡 Este token iluminará {lightRadius} quadrado{lightRadius !== 1 ? 's' : ''} ao redor
            </div>
          )}
        </div>

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

  const builtInMaps = [
    {
      id: 'tavern',
      name: 'Taverna do Anão',
      filename: 'builtin-tavern.jpg',
      description: 'Interior de taverna com mesas e lareira'
    },
    {
      id: 'dungeon',
      name: 'Cripta Antiga',
      filename: 'builtin-dungeon.jpg',
      description: 'Complexo de masmorras subterrâneas'
    },
    {
      id: 'forest',
      name: 'Clareira Gelada',
      filename: 'builtin-forest.jpg',
      description: 'Clareira na floresta com portal mágico'
    }
  ];

  const handleBuiltInMapSelect = (map) => {
    onUrlSet(`/public/maps/${map.filename}`);
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--spacing-lg)',
      maxWidth: '500px',
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-lg)'
      }}>
        <h3 className="heading-sm" style={{ margin: 0 }}>🗺️ Mapas</h3>
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {/* Built-in Maps Section */}
        <div>
          <label className="form-label" style={{ marginBottom: 'var(--spacing-sm)' }}>📚 Mapas Inclusos</label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 'var(--spacing-sm)',
            marginBottom: 'var(--spacing-md)'
          }}>
            {builtInMaps.map((map) => (
              <button
                key={map.id}
                className="btn btn-ghost"
                onClick={() => handleBuiltInMapSelect(map)}
                style={{
                  padding: 'var(--spacing-sm)',
                  height: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)',
                  background: 'var(--bg-surface-dark)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 0.2s ease',
                  overflow: 'hidden'
                }}
                onMouseEnter={(e) => {
                  e.target.style.borderColor = 'var(--color-primary)';
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                }}
                onMouseLeave={(e) => {
                  e.target.style.borderColor = 'var(--color-border)';
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = 'none';
                }}
              >
                {/* Map thumbnail */}
                <div style={{
                  width: '100%',
                  height: '80px',
                  borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--color-border)',
                  position: 'relative'
                }}>
                  <img
                    src={`/public/maps/${map.filename}`}
                    alt={map.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'center'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                      e.target.nextSibling.style.display = 'flex';
                    }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    display: 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--bg-surface)',
                    color: 'var(--color-text-dim)',
                    fontSize: '1.5rem'
                  }}>
                    🗺️
                  </div>
                </div>
                
                {/* Map info */}
                <div style={{
                  textAlign: 'center',
                  width: '100%'
                }}>
                  <div style={{
                    fontSize: '0.85rem',
                    fontWeight: '600',
                    color: 'var(--color-text)',
                    marginBottom: '2px'
                  }}>
                    {map.name}
                  </div>
                  <div style={{
                    fontSize: '0.7rem',
                    color: 'var(--color-text-dim)',
                    lineHeight: '1.2'
                  }}>
                    {map.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-sm)',
          color: 'var(--color-text-dim)',
          fontSize: '0.85rem'
        }}>
          <hr style={{ flex: 1, border: '1px solid var(--color-border)' }} />
          <span>ou envie seu próprio</span>
          <hr style={{ flex: 1, border: '1px solid var(--color-border)' }} />
        </div>

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

// ── Google Docs Modal ──
function GoogleDocsModal({ currentUrl, onSave, onClose }) {
  const [url, setUrl] = useState(currentUrl || '');
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!url.trim()) {
      onSave('');
      return;
    }

    // Validate Google Docs URL
    if (!isValidGoogleUrl(url)) {
      setError('URL deve ser do Google Docs, Sheets ou Slides');
      return;
    }

    setError('');
    onSave(url.trim());
  };

  return (
    <div style={{
      background: 'var(--bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--spacing-lg)',
      maxWidth: '500px',
      width: '100%'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-lg)'
      }}>
        <h3 className="heading-sm" style={{ margin: 0 }}>📄 Google Docs da Campanha</h3>
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
        <div>
          <label className="form-label">URL do Documento</label>
          <input
            type="url"
            className="input"
            placeholder="https://docs.google.com/document/d/..."
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setError('');
            }}
            style={{ width: '100%' }}
          />
          {error && (
            <div style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {error}
            </div>
          )}
        </div>

        <div style={{
          padding: 'var(--spacing-sm)',
          background: 'var(--bg-surface-light)',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.8rem',
          color: 'var(--color-text-dim)'
        }}>
          <strong>Como usar:</strong>
          <br />• Cole a URL do Google Docs, Sheets ou Slides
          <br />• O documento será incorporado na interface
          <br />• Deixe vazio para remover o documento atual
        </div>

        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            {currentUrl ? 'Atualizar' : 'Definir'} Documento
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Validate Google URL helper ──
function isValidGoogleUrl(url) {
  if (!url) return true; // Empty URL is valid (removes the doc)
  
  const googleDomains = [
    'docs.google.com/document',
    'docs.google.com/spreadsheets',
    'docs.google.com/presentation'
  ];
  
  return googleDomains.some(domain => url.includes(domain));
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

// ── AoE Configuration Panel ──
function AoEConfigPanel({ config, onConfigChange, onClearAoE }) {
  const shapeOptions = [
    { value: 'circle', label: '⭕ Círculo', fields: ['radius'] },
    { value: 'cone', label: '📐 Cone', fields: ['length', 'angle'] },
    { value: 'line', label: '➖ Linha', fields: ['length', 'width'] },
    { value: 'square', label: '⬜ Quadrado', fields: ['length'] }
  ];

  const colorOptions = [
    { value: 'damage', label: '🔥 Dano', color: '#ff6b35' },
    { value: 'healing', label: '💙 Cura', color: '#3b82f6' },
    { value: 'buff', label: '🌟 Buff', color: '#10b981' },
    { value: 'debuff', label: '💜 Debuff', color: '#8b5cf6' },
    { value: 'utility', label: '⚡ Utilidade', color: '#f59e0b' }
  ];

  const currentShape = shapeOptions.find(s => s.value === config.shape);

  return (
    <div className="gb-aoe-config">
      {/* Shape Selection */}
      <div className="gb-aoe-field">
        <label>Forma</label>
        <select 
          value={config.shape} 
          onChange={(e) => onConfigChange({ shape: e.target.value })}
        >
          {shapeOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Dynamic Fields based on shape */}
      {currentShape?.fields.includes('radius') && (
        <div className="gb-aoe-field">
          <label>Raio (ft)</label>
          <input
            type="number"
            value={config.radius}
            onChange={(e) => onConfigChange({ radius: parseInt(e.target.value) || 0 })}
            min="5"
            max="120"
            step="5"
          />
        </div>
      )}

      {currentShape?.fields.includes('length') && (
        <div className="gb-aoe-field">
          <label>
            {config.shape === 'square' ? 'Lado (ft)' : 'Comprimento (ft)'}
          </label>
          <input
            type="number"
            value={config.length}
            onChange={(e) => onConfigChange({ length: parseInt(e.target.value) || 0 })}
            min="5"
            max="120"
            step="5"
          />
        </div>
      )}

      {currentShape?.fields.includes('width') && (
        <div className="gb-aoe-field">
          <label>Largura (ft)</label>
          <input
            type="number"
            value={config.width}
            onChange={(e) => onConfigChange({ width: parseInt(e.target.value) || 0 })}
            min="5"
            max="30"
            step="5"
          />
        </div>
      )}

      {currentShape?.fields.includes('angle') && (
        <div className="gb-aoe-field">
          <label>Ângulo (°)</label>
          <select 
            value={config.angle} 
            onChange={(e) => onConfigChange({ angle: parseInt(e.target.value) })}
          >
            <option value={15}>15°</option>
            <option value={30}>30°</option>
            <option value={60}>60°</option>
            <option value={90}>90°</option>
          </select>
        </div>
      )}

      {/* Color/Type Selection */}
      <div className="gb-aoe-field">
        <label>Tipo</label>
        <select 
          value={config.color} 
          onChange={(e) => onConfigChange({ color: e.target.value })}
        >
          {colorOptions.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Quick Spell Input */}
      <div className="gb-aoe-field spell-input">
        <label>Magia (opcional)</label>
        <input
          type="text"
          value={config.spellName}
          onChange={(e) => onConfigChange({ spellName: e.target.value })}
          placeholder="ex: Fireball"
        />
      </div>

      {/* Clear AoEs Button */}
      <button
        onClick={onClearAoE}
        className="btn btn-ghost"
        title="Limpar todas as AoEs"
      >
        🗑️ Limpar
      </button>
    </div>
  );
}
