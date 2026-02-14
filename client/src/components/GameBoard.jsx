import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useGame } from '../contexts/GameContext';
import { WindowManagerProvider, useWindowManager } from '../contexts/WindowManagerContext';
import MapCanvas from './MapCanvas';
import DiceRoller from './DiceRoller';
import DiceEffects from './DiceEffects';
import ChatPanel from './ChatPanel';
import Initiative from './Initiative';
import InitiativeTracker from './InitiativeTracker';
import CharSheet from './CharSheet';
import CharacterSheet from './CharacterSheet';
import Ambiance from './Ambiance';
import SystemImporter from './SystemImporter';
import DMDashboard from './DMDashboard';
import GridConfigPanel from './GridConfigPanel';
import CharacterWizard from './CharacterWizard';
import ScenesPanel from './ScenesPanel';
import JournalPanel from './JournalPanel';
import JukeboxPanel from './JukeboxPanel';
import FloatingWindow from './FloatingWindow';
import MinimizedWindowBar from './MinimizedWindowBar';
import QuickActions from './QuickActions';
import ThemeSelector from './ThemeSelector';
import { 
  ContextualToolbar, 
  PlayerPresence, 
  Dock, 
  DiceBubble, 
  ChatBubble, 
  InitiativeBubble 
} from './ui';
import '../styles/GameBoard.css';
import '../styles/dropdown-menu.css';
import '../styles/FloatingWindow.css';

// Error boundary to catch MapCanvas crashes
import { Component } from 'react';
class GameBoardErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null, info: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('GAMEBOARD CRASH:', error, info.componentStack); this.setState({ info }); }
  render() {
    if (this.state.error) return (
      <div style={{color:'#ff6b6b',padding:40,background:'#1a1a2e',minHeight:'100vh',fontFamily:'monospace'}}>
        <h2>⚠️ GameBoard Error</h2>
        <pre style={{whiteSpace:'pre-wrap',marginTop:16}}>{this.state.error.message}</pre>
        <pre style={{whiteSpace:'pre-wrap',marginTop:8,fontSize:'0.8rem',color:'#888'}}>{this.state.info?.componentStack}</pre>
        <button onClick={() => this.setState({error:null,info:null})} style={{marginTop:16,padding:'8px 16px',cursor:'pointer'}}>Retry</button>
      </div>
    );
    return this.props.children;
  }
}

class CanvasErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('CANVAS CRASH:', error, info.componentStack); }
  render() {
    if (this.state.error) return <div style={{color:'red',padding:20}}>Canvas Error: {this.state.error.message}</div>;
    return this.props.children;
  }
}

export default function GameBoardWithErrorBoundary(props) {
  return (
    <WindowManagerProvider>
      <GameBoardErrorBoundary>
        <GameBoardInner {...props} />
      </GameBoardErrorBoundary>
    </WindowManagerProvider>
  );
}

function GameBoardInner({ onLeaveRoom }) {
  const { state, actions } = useGame();
  const { room, player, players, tokens, initiative, chat, ui, connected, campaign, character, systemData, aoeEffects, fogEnabled, allCharacters, weather } = state;
  const isDM = player.isDM;
  
  // Window manager for floating panels
  const { windows, toggleWindow, openWindow, closeWindow } = useWindowManager();
  
  // Copy room code feedback
  const [codeCopied, setCodeCopied] = useState(false);
  
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [showMapUpload, setShowMapUpload] = useState(false);
  const [showTokenCreator, setShowTokenCreator] = useState(false);
  const [showGoogleDocs, setShowGoogleDocs] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [showSystemImporter, setShowSystemImporter] = useState(false);
  // DM Dashboard is now managed by WindowManager
  const [showCharacterWizard, setShowCharacterWizard] = useState(false);
  const [tokenAwaitingPlacement, setTokenAwaitingPlacement] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [sidebarTab, setSidebarTab] = useState('tokens');
  const menuRef = useRef(null);
  const canvasAreaRef = useRef(null);

  // ── Multiple character sheet windows (for DM and token double-click) ──
  // Each sheet: { id, token?, character?, playerName?, isMinimized, position, zIndex }
  const [openSheets, setOpenSheets] = useState([]);
  const [nextSheetZIndex, setNextSheetZIndex] = useState(1000);

  // ── Open character sheet from token ──
  const openCharacterSheetForToken = useCallback((token) => {
    // Check if already open
    const existingIdx = openSheets.findIndex(s => s.tokenId === token.id);
    if (existingIdx >= 0) {
      // Focus existing sheet
      setOpenSheets(prev => prev.map((s, i) => 
        i === existingIdx ? { ...s, isMinimized: false, zIndex: nextSheetZIndex } : s
      ));
      setNextSheetZIndex(z => z + 1);
      return;
    }

    // Try to find character data for this token
    let charData = null;
    let playerName = null;

    // First check if there's a linked player character
    if (token.playerId) {
      const linkedPlayer = players.find(p => p.id === token.playerId);
      if (linkedPlayer && allCharacters.has(linkedPlayer.name)) {
        charData = allCharacters.get(linkedPlayer.name);
        playerName = linkedPlayer.name;
      }
    }

    // Or check if token name matches a player name
    if (!charData && token.name) {
      if (allCharacters.has(token.name)) {
        charData = allCharacters.get(token.name);
        playerName = token.name;
      }
    }

    // Create basic character from token stats if no linked character
    if (!charData) {
      charData = {
        name: token.name || 'Token',
        avatarEmoji: '🎭',
        hp: token.hp || { current: 10, max: 10, temp: 0 },
        ac: token.ac || 10,
        conditions: token.conditions || [],
        level: 1,
        race: '',
        class: '',
        attributes: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        skills: {},
        savingThrows: {},
        attacks: [],
        features: [],
        inventory: [],
        currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
        notes: '',
      };
    }

    // Calculate position with offset for multiple windows
    const offset = openSheets.length * 30;
    const newSheet = {
      id: `sheet_${Date.now()}`,
      tokenId: token.id,
      character: charData,
      playerName: playerName,
      isMinimized: false,
      position: { x: 100 + offset, y: 50 + offset },
      zIndex: nextSheetZIndex,
    };

    setOpenSheets(prev => [...prev, newSheet]);
    setNextSheetZIndex(z => z + 1);
  }, [openSheets, allCharacters, players, nextSheetZIndex]);

  // ── Close a sheet window ──
  const closeSheet = useCallback((sheetId) => {
    setOpenSheets(prev => prev.filter(s => s.id !== sheetId));
  }, []);

  // ── Toggle minimize for a sheet ──
  const toggleSheetMinimize = useCallback((sheetId, minimize) => {
    setOpenSheets(prev => prev.map(s => 
      s.id === sheetId ? { ...s, isMinimized: minimize } : s
    ));
  }, []);

  // ── Focus a sheet (bring to front) ──
  const focusSheet = useCallback((sheetId) => {
    setOpenSheets(prev => prev.map(s => 
      s.id === sheetId ? { ...s, zIndex: nextSheetZIndex } : s
    ));
    setNextSheetZIndex(z => z + 1);
  }, [nextSheetZIndex]);

  // ── Update character in sheet and sync to server ──
  const updateSheetCharacter = useCallback((sheetId, charData) => {
    setOpenSheets(prev => prev.map(s => 
      s.id === sheetId ? { ...s, character: charData } : s
    ));

    // If DM editing a player's character, save to server
    const sheet = openSheets.find(s => s.id === sheetId);
    if (sheet?.playerName && isDM && campaign.id) {
      actions.dmUpdateCharacter(campaign.id, sheet.playerName, charData);
    }
  }, [openSheets, isDM, campaign.id, actions]);

  // ── Listen for open-character-sheet events from MapCanvas ──
  useEffect(() => {
    const el = canvasAreaRef.current;
    if (!el) return;

    const handler = (e) => {
      openCharacterSheetForToken(e.detail.token);
    };

    el.addEventListener('open-character-sheet', handler);
    return () => el.removeEventListener('open-character-sheet', handler);
  }, [openCharacterSheetForToken]);

  // ── Load all characters on mount for DM ──
  useEffect(() => {
    if (isDM && campaign.id) {
      actions.getAllCharacters(campaign.id);
    }
  }, [isDM, campaign.id, actions]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      // Check if click is inside menu toolbar OR inside a dropdown (rendered via portal)
      const isInsideMenu = menuRef.current && menuRef.current.contains(e.target);
      const isInsideDropdown = e.target.closest('.gb-dropdown');
      if (!isInsideMenu && !isInsideDropdown) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const handle = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 's': actions.setActiveTool('select'); e.preventDefault(); break;
        case 'm': actions.setActiveTool('measure'); e.preventDefault(); break;
        case 'h': actions.setActiveTool('move-map'); e.preventDefault(); break;
        case 'f': if (isDM) { actions.setActiveTool('fog'); e.preventDefault(); } break;
        case 'w': if (isDM) { actions.setActiveTool('wall'); e.preventDefault(); } break;
        case 'r': if (isDM) { actions.setActiveTool('door'); e.preventDefault(); } break;
        case 't': if (isDM) { actions.setActiveTool('add-token'); e.preventDefault(); } break;
        case 'a': if (isDM) { actions.setActiveTool('aoe'); e.preventDefault(); } break;
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

  // ── Character wizard close handler (stable reference) ──
  const handleCloseWizard = useCallback(() => {
    setShowCharacterWizard(false);
  }, []);

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
      <div className="gb-toolbar" ref={menuRef}>
        <div className="gb-toolbar-left">
          <button className="gb-leave-btn" onClick={onLeaveRoom}>
            ← Sair
          </button>
          <div className="gb-toolbar-divider" />

          {/* ⚔️ Ferramentas */}
          <ToolbarMenu
            id="tools"
            icon="⚔️"
            label="Ferramentas"
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            items={[
              { id: 'select', icon: '🏹', label: 'Selecionar (S)', type: 'tool', active: ui.activeTool === 'select', onClick: () => { actions.setActiveTool('select'); setOpenMenu(null); } },
              { id: 'measure', icon: '📏', label: 'Medir (M)', type: 'tool', active: ui.activeTool === 'measure', onClick: () => { actions.setActiveTool('measure'); setOpenMenu(null); } },
              { id: 'move-map', icon: '✋', label: 'Mover Mapa (H)', type: 'tool', active: ui.activeTool === 'move-map', onClick: () => { actions.setActiveTool('move-map'); setOpenMenu(null); } },
              ...(isDM ? [
                { type: 'divider' },
                { id: 'draw', icon: '✏️', label: 'Desenhar (D)', type: 'tool', active: ui.activeTool === 'draw', onClick: () => { actions.setActiveTool('draw'); setOpenMenu(null); } },
                { id: 'fog', icon: '🌫️', label: 'Névoa (F)', type: 'tool', active: ui.activeTool === 'fog', onClick: () => { actions.setActiveTool('fog'); setOpenMenu(null); } },
                { id: 'wall', icon: '🧱', label: 'Paredes (W)', type: 'tool', active: ui.activeTool === 'wall', onClick: () => { actions.setActiveTool('wall'); setOpenMenu(null); } },
                { id: 'door', icon: '🚪', label: 'Porta (R)', type: 'tool', active: ui.activeTool === 'door', onClick: () => { actions.setActiveTool('door'); setOpenMenu(null); } },
                { id: 'aoe', icon: '💥', label: 'AoE Magias (A)', type: 'tool', active: ui.activeTool === 'aoe', onClick: () => { actions.setActiveTool('aoe'); setOpenMenu(null); } },
                { id: 'add-token', icon: '🎭', label: 'Criar Token (T)', type: 'tool', active: ui.activeTool === 'add-token' || !!tokenAwaitingPlacement, onClick: () => { setShowTokenCreator(true); setOpenMenu(null); } },
                { type: 'divider' },
                { id: 'toggle-fog', icon: fogEnabled ? '👁️' : '👁️‍🗨️', label: fogEnabled ? 'Desativar Névoa' : 'Ativar Névoa', type: 'action', onClick: () => { actions.toggleFog(!fogEnabled); setOpenMenu(null); } },
                { id: 'reset-fog', icon: '🌑', label: 'Resetar Névoa', type: 'action', onClick: () => { if (confirm('Resetar toda a névoa? Tudo será coberto novamente.')) { actions.resetFog(); setOpenMenu(null); } } },
                { id: 'clear-fog', icon: '🌫️', label: 'Revelar Tudo', type: 'action', onClick: () => { actions.clearFog(); setOpenMenu(null); } },
                { id: 'clear-walls', icon: '🧱', label: 'Limpar Paredes', type: 'action', onClick: () => { actions.clearWalls(); setOpenMenu(null); } },
                { id: 'clear-doors', icon: '🚪', label: 'Limpar Portas', type: 'action', onClick: () => { actions.clearDoors(); setOpenMenu(null); } },
              ] : []),
            ]}
            hasActive={['select', 'measure', 'draw', 'fog', 'wall', 'door', 'aoe', 'add-token', 'move-map'].includes(ui.activeTool)}
          />

          {/* 📋 Personagem */}
          <ToolbarMenu
            id="character"
            icon="📋"
            label="Personagem"
            openMenu={openMenu}
            setOpenMenu={setOpenMenu}
            items={[
              { id: 'char-sheet', icon: '📋', label: 'Ficha de Personagem', onClick: () => { setShowCharSheet(!showCharSheet); setOpenMenu(null); }, active: showCharSheet },
              { id: 'char-wizard', icon: '🧙', label: 'Criar Personagem', onClick: () => { setShowCharacterWizard(true); setOpenMenu(null); } },
            ]}
          />

          {/* 🗺️ Mapa */}
          {isDM && (
            <ToolbarMenu
              id="map"
              icon="🗺️"
              label="Mapa"
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              items={[
                { id: 'map-upload', icon: '🗺️', label: 'Importar Mapa', onClick: () => { setShowMapUpload(true); setOpenMenu(null); } },
                { id: 'move-map', icon: '✋', label: 'Mover Mapa', onClick: () => { actions.setActiveTool('move-map'); setOpenMenu(null); }, active: ui.activeTool === 'move-map' },
                { id: 'reset-map-offset', icon: '🔄', label: 'Resetar Posição', onClick: () => { actions.setMapOffset(0, 0); setOpenMenu(null); } },
                ...(campaign.id ? [
                  { id: 'docs-config', icon: '📄', label: 'Configurar Documento', onClick: () => { setShowDocsModal(true); setOpenMenu(null); } },
                ] : []),
                ...(campaign.googleDocsUrl ? [
                  { id: 'docs-toggle', icon: '📄', label: showGoogleDocs ? 'Ocultar Docs' : 'Mostrar Docs', onClick: () => { setShowGoogleDocs(!showGoogleDocs); setOpenMenu(null); }, active: showGoogleDocs },
                ] : []),
              ]}
            />
          )}

          {/* 👑 Mestre (DM only) */}
          {isDM && campaign.id && (
            <ToolbarMenu
              id="dm"
              icon="👑"
              label="Mestre"
              openMenu={openMenu}
              setOpenMenu={setOpenMenu}
              items={[
                { id: 'dm-dashboard', icon: '👥', label: 'Painel do Grupo', onClick: () => { toggleWindow('dmDashboard'); setOpenMenu(null); }, active: windows.dmDashboard?.isOpen },
                { id: 'system-import', icon: '📚', label: 'Importar Regras', onClick: () => { setShowSystemImporter(true); setOpenMenu(null); } },
                { type: 'divider' },
                { id: 'weather-none', icon: '☀️', label: 'Clima: Limpo', onClick: () => { actions.setWeather('none'); setOpenMenu(null); }, active: weather === 'none' || !weather },
                { id: 'weather-rain', icon: '🌧️', label: 'Clima: Chuva', onClick: () => { actions.setWeather('rain'); setOpenMenu(null); }, active: weather === 'rain' },
                { id: 'weather-snow', icon: '❄️', label: 'Clima: Neve', onClick: () => { actions.setWeather('snow'); setOpenMenu(null); }, active: weather === 'snow' },
                { id: 'weather-fog', icon: '🌫️', label: 'Clima: Neblina', onClick: () => { actions.setWeather('fog'); setOpenMenu(null); }, active: weather === 'fog' },
              ]}
            />
          )}
        </div>

        <div className="gb-toolbar-center">
          {campaign.id ? (
            <div className="gb-campaign-info">
              <span className="gb-campaign-name">{campaign.name}</span>
              <div className="gb-room-code-container">
                <span className="gb-room-code">#{room.code}</span>
                <button 
                  className={`gb-copy-code-btn ${codeCopied ? 'copied' : ''}`}
                  onClick={() => {
                    navigator.clipboard.writeText(room.code);
                    setCodeCopied(true);
                    setTimeout(() => setCodeCopied(false), 2000);
                  }}
                  title={codeCopied ? 'Copiado!' : 'Copiar código'}
                >
                  {codeCopied ? '✓' : '📋'}
                </button>
              </div>
            </div>
          ) : (
            <div className="gb-room-code-container">
              <span className="gb-room-code">#{room.code}</span>
              <button 
                className={`gb-copy-code-btn ${codeCopied ? 'copied' : ''}`}
                onClick={() => {
                  navigator.clipboard.writeText(room.code);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 2000);
                }}
                title={codeCopied ? 'Copiado!' : 'Copiar código'}
              >
                {codeCopied ? '✓' : '📋'}
              </button>
            </div>
          )}
        </div>

        <div className="gb-toolbar-right">
          <button 
            className={`btn btn-ghost gb-toolbar-btn ${windows.leftPanel?.isOpen && !windows.leftPanel?.isMinimized ? 'active' : ''}`} 
            onClick={() => toggleWindow('leftPanel')}
            title="Painel Esquerdo"
          >
            👥
          </button>
          <button 
            className={`btn btn-ghost gb-toolbar-btn ${windows.rightPanel?.isOpen && !windows.rightPanel?.isMinimized ? 'active' : ''}`} 
            onClick={() => toggleWindow('rightPanel')}
            title="Chat & Dados"
          >
            💬
          </button>
          <button 
            className={`btn btn-ghost gb-toolbar-btn ${windows.initiative?.isOpen && !windows.initiative?.isMinimized ? 'active' : ''}`} 
            onClick={() => toggleWindow('initiative')}
            title="Iniciativa"
          >
            ⚔️
          </button>
          <button 
            className={`btn btn-ghost gb-toolbar-btn ${windows.diceRoller?.isOpen && !windows.diceRoller?.isMinimized ? 'active' : ''}`} 
            onClick={() => toggleWindow('diceRoller')}
            title="Rolagem de Dados"
          >
            🎲
          </button>
          <div className="gb-toolbar-divider" />
          <ThemeSelector compact />
        </div>
      </div>

      {/* ── Fog Tool Info Panel ── */}
      {ui.activeTool === 'fog' && isDM && (
        <div className="gb-aoe-config" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--color-border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.85rem' }}>
          <span>🌫️ <strong>Névoa:</strong></span>
          <span style={{ color: 'var(--color-text-dim)' }}>Arraste para revelar retângulos</span>
          <span style={{ color: '#ff6b6b' }}>Shift + arraste para esconder</span>
          <button className="btn btn-ghost btn-sm" onClick={() => { if (confirm('Resetar névoa?')) actions.resetFog(); }} style={{ marginLeft: 'auto' }}>
            🌑 Resetar
          </button>
        </div>
      )}

      {/* ── Door Tool Info Panel ── */}
      {ui.activeTool === 'door' && isDM && (
        <div className="gb-aoe-config" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--color-border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.85rem' }}>
          <span>🚪 <strong>Porta:</strong></span>
          <span style={{ color: 'var(--color-text-dim)' }}>Clique numa parede para colocar porta</span>
          <span style={{ color: '#DEB887' }}>Clique na porta para alternar: Fechada → Aberta → Trancada</span>
        </div>
      )}

      {/* ── Move Map Tool Info Panel ── */}
      {ui.activeTool === 'move-map' && isDM && (
        <div className="gb-aoe-config" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--color-border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.85rem' }}>
          <span>🗺️ <strong>Mover Mapa:</strong></span>
          <span style={{ color: 'var(--color-text-dim)' }}>Arraste o mapa para reposicioná-lo dentro do cenário</span>
          <button 
            className="btn btn-ghost btn-sm" 
            onClick={() => actions.setMapOffset(0, 0)} 
            style={{ marginLeft: 'auto' }}
          >
            ↺ Resetar Posição
          </button>
        </div>
      )}

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
        {/* Center — Map Canvas (full area now) */}
        <div className="gb-canvas-area" ref={canvasAreaRef}>
          <div style={{ position: 'absolute', inset: 0 }}>
            <CanvasErrorBoundary>
              <MapCanvas 
                isDM={isDM} 
                tokenAwaitingPlacement={tokenAwaitingPlacement}
                onTokenPlaced={() => setTokenAwaitingPlacement(null)}
              />
            </CanvasErrorBoundary>
          </div>
          
          {/* ── Contextual Toolbar (Owlbear-style) ── */}
          <ContextualToolbar context={isDM ? 'dm' : 'default'} />
          
          {/* ── Player Presence Avatars (Owlbear-style) ── */}
          <PlayerPresence />
          
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
      </div>

      {/* ═══ FLOATING WINDOWS ═══ */}
      
      {/* Left Panel - Players, Scenes, Journal, etc */}
      <FloatingWindow
        windowId="leftPanel"
        title="Jogadores & Cenas"
        icon="👥"
        resizable={true}
      >
        <div className="gb-side-panel gb-left-panel">
          {/* Sidebar Tabs */}
          <div style={{
            display: 'flex', gap: 2, background: 'var(--bg-surface-light)',
            borderRadius: 'var(--radius-md)', padding: 2, marginBottom: 'var(--spacing-sm)',
          }}>
            {[
              { id: 'tokens', icon: '🎭', label: 'Tokens' },
              { id: 'scenes', icon: '🗺️', label: 'Cenas' },
              { id: 'journal', icon: '📋', label: 'Diário' },
              { id: 'jukebox', icon: '🎵', label: 'Jukebox' },
              { id: 'settings', icon: '⚙️', label: 'Config' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSidebarTab(tab.id)}
                title={tab.label}
                style={{
                  flex: 1, padding: '6px 4px', border: 'none', borderRadius: 'var(--radius-sm)',
                  background: sidebarTab === tab.id ? 'var(--color-primary)' : 'transparent',
                  color: sidebarTab === tab.id ? 'white' : 'var(--color-text-dim)',
                  cursor: 'pointer', fontSize: '0.85rem', transition: 'all 0.15s',
                }}
              >
                {tab.icon}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {sidebarTab === 'tokens' && (
            <>
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

              {/* Initiative Toggle */}
              <button
                onClick={() => toggleWindow('initiative')}
                className={`btn ${windows.initiative?.isOpen ? 'btn-primary' : 'btn-ghost'}`}
                style={{ width: '100%', marginTop: 'var(--spacing-sm)' }}
              >
                ⚔️ {windows.initiative?.isOpen ? 'Ocultar' : 'Mostrar'} Iniciativa
              </button>
            </>
          )}

          {sidebarTab === 'scenes' && <ScenesPanel />}
          {sidebarTab === 'journal' && <JournalPanel />}
          {sidebarTab === 'jukebox' && <JukeboxPanel />}

          {sidebarTab === 'settings' && (
            <>
              {/* Ambiance (DM) */}
              {isDM && <Ambiance isDM={isDM} />}

              {/* Grid Config (DM) */}
              {isDM && <GridConfigPanel />}
            </>
          )}
        </div>
      </FloatingWindow>

      {/* Right Panel - Chat */}
      <FloatingWindow
        windowId="rightPanel"
        title="Chat & Dados"
        icon="💬"
        resizable={true}
      >
        <ChatPanel
          messages={chat}
          onSendMessage={handleChatSend}
          onDeleteMessage={actions.deleteMessage}
          onHideMessage={actions.hideMessage}
          currentUser={{ name: player.name, id: player.id, isDM }}
          isConnected={connected}
          onSpellDetected={handleSpellDetected}
        />
      </FloatingWindow>

      {/* Initiative Tracker */}
      <FloatingWindow
        windowId="initiative"
        title="Iniciativa"
        icon="⚔️"
        resizable={true}
      >
        <InitiativeTracker />
      </FloatingWindow>

      {/* DM Dashboard */}
      {isDM && campaign.id && (
        <FloatingWindow
          windowId="dmDashboard"
          title="Painel do Mestre"
          icon="👑"
          resizable={true}
        >
          <DMDashboard
            isOpen={true}
            onClose={() => closeWindow('dmDashboard')}
          />
        </FloatingWindow>
      )}

      {/* Minimized Window Bar */}
      <MinimizedWindowBar />

      {/* Quick Actions Hotbar (only for players, not DM) */}
      <QuickActions />

      {/* ═══ NEW OWLBEAR-STYLE COMPONENTS ═══ */}
      
      {/* Dock - Bottom floating bar */}
      <Dock />
      
      {/* Dice Bubble - Floating dice roller */}
      <DiceBubble initialPosition={{ x: window.innerWidth - 320, y: 100 }} />
      
      {/* Chat Bubble - Floating chat */}
      <ChatBubble initialPosition={{ x: window.innerWidth - 320, y: 400 }} />
      
      {/* Initiative Bubble - Floating initiative tracker */}
      <InitiativeBubble initialPosition={{ x: 16, y: 200 }} />

      {/* Note: Initiative Tracker is now in FloatingWindow above */}

      {/* Character Sheet Modal (own character - full-page) */}
      {showCharSheet && (
        <CharacterSheet
          character={character}
          isEditable={!isDM}
          isDM={isDM}
          isOtherCharacter={false}
          onUpdateCharacter={(char) => actions.updateCharacter(char)}
          onRollDice={handleDiceRoll}
          onClose={() => setShowCharSheet(false)}
          windowMode={false}
        />
      )}

      {/* Multiple Character Sheet Windows (from token double-click) */}
      {openSheets.map((sheet) => (
        <CharacterSheet
          key={sheet.id}
          sheetId={sheet.id}
          character={sheet.character}
          isEditable={false}
          isDM={isDM}
          isOtherCharacter={true}
          onUpdateCharacter={(char) => updateSheetCharacter(sheet.id, char)}
          onRollDice={handleDiceRoll}
          onClose={() => closeSheet(sheet.id)}
          onMinimize={(minimize) => toggleSheetMinimize(sheet.id, minimize)}
          isMinimized={sheet.isMinimized}
          windowMode={true}
          initialPosition={sheet.position}
          zIndex={sheet.zIndex}
          onFocus={() => focusSheet(sheet.id)}
        />
      ))}

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

      {/* DM Dashboard is now in FloatingWindow above */}

      {/* Dice Roller */}
      <FloatingWindow
        windowId="diceRoller"
        title="Rolagem de Dados"
        icon="🎲"
        resizable={true}
      >
        <DiceRoller />
      </FloatingWindow>

      {/* Character Wizard Modal */}
      <CharacterWizard
        isOpen={showCharacterWizard}
        onClose={handleCloseWizard}
        onCreateCharacter={handleCharacterCreate}
        system={campaign.system || room.system || 'dnd5e'}
        systemData={systemData}
      />

      {/* Epic Dice Effects Overlay */}
      <DiceEffects />
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
  const [visionRadius, setVisionRadius] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const sizeOptions = {
    tiny: { label: 'Minúsculo', value: 'tiny', multiplier: 0.5, desc: '½ célula' },
    small: { label: 'Pequeno', value: 'small', multiplier: 0.5, desc: '½ célula' },
    medium: { label: 'Médio', value: 'medium', multiplier: 1, desc: '1×1' },
    large: { label: 'Grande', value: 'large', multiplier: 2, desc: '2×2' },
    huge: { label: 'Enorme', value: 'huge', multiplier: 3, desc: '3×3' },
    gargantuan: { label: 'Colossal', value: 'gargantuan', multiplier: 4, desc: '4×4' }
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
      visionRadius: visionRadius,
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
            width: `${Math.max(30, 40 * Math.min(sizeOptions[tokenSize].multiplier, 2))}px`,
            height: `${Math.max(30, 40 * Math.min(sizeOptions[tokenSize].multiplier, 2))}px`,
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--spacing-xs)' }}>
            {Object.entries(sizeOptions).map(([key, option]) => (
              <button
                key={key}
                className={`btn ${tokenSize === key ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setTokenSize(key)}
                style={{ fontSize: '0.75rem', padding: '4px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}
              >
                <span>{option.label}</span>
                <span style={{ fontSize: '0.65rem', opacity: 0.7 }}>{option.desc}</span>
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

        {/* Vision Radius */}
        <div>
          <label className="form-label">Raio de Visão (quadrados do mapa)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <input
              type="range"
              min="0"
              max="24"
              step="1"
              value={visionRadius}
              onChange={(e) => setVisionRadius(parseInt(e.target.value))}
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
              {visionRadius === 0 ? 'Nenhuma' : `${visionRadius * 5}ft`}
            </span>
          </div>
          {visionRadius > 0 && (
            <div style={{
              marginTop: 'var(--spacing-xs)',
              fontSize: '0.8rem',
              color: 'var(--color-text-dim)'
            }}>
              👁️ Visão de {visionRadius * 5} pés (para névoa de guerra)
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

// ── Toolbar Dropdown Menu ──
function ToolbarMenu({ id, icon, label, items, openMenu, setOpenMenu, hasActive }) {
  const isOpen = openMenu === id;
  const btnRef = React.useRef(null);
  const [dropdownPos, setDropdownPos] = React.useState({ top: 0, left: 0 });
  const toggle = () => {
    if (!isOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 6, left: rect.left });
    }
    setOpenMenu(isOpen ? null : id);
  };

  // Render dropdown via portal to ensure it's above everything
  const dropdownContent = isOpen && ReactDOM.createPortal(
    <div className="gb-dropdown" style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left }}>
      {items.map((item, i) => {
        if (item.type === 'divider') return <div key={i} className="gb-dropdown-divider" />;
        return (
          <button
            key={item.id}
            className={`gb-dropdown-item ${item.active ? 'gb-dropdown-item-active' : ''}`}
            onClick={item.onClick}
          >
            <span className="gb-dropdown-icon">{item.icon}</span>
            <span className="gb-dropdown-label">{item.label}</span>
            {item.active && <span className="gb-dropdown-check">●</span>}
          </button>
        );
      })}
    </div>,
    document.body
  );

  return (
    <div className="gb-menu-container">
      <button
        ref={btnRef}
        className={`btn btn-ghost gb-toolbar-btn gb-menu-trigger ${isOpen ? 'gb-menu-open' : ''} ${hasActive ? 'gb-menu-has-active' : ''}`}
        onClick={toggle}
      >
        {icon} {label} <span className="gb-menu-arrow">{isOpen ? '▴' : '▾'}</span>
      </button>
      {dropdownContent}
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
