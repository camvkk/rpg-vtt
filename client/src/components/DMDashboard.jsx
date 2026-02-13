import { useState, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import CharSheet from './CharSheet';
import CharacterWizard from './CharacterWizard';
import '../styles/DMDashboard.css';

// Available conditions for D&D 5e
const CONDITIONS = [
  { name: 'Amedrontado', icon: '😨' },
  { name: 'Atordoado', icon: '💫' },
  { name: 'Cego', icon: '🙈' },
  { name: 'Encantado', icon: '💖' },
  { name: 'Envenenado', icon: '🤢' },
  { name: 'Exaustão 1', icon: '😩' },
  { name: 'Exaustão 2', icon: '😩' },
  { name: 'Exaustão 3', icon: '😩' },
  { name: 'Exaustão 4', icon: '😩' },
  { name: 'Exaustão 5', icon: '😩' },
  { name: 'Exaustão 6', icon: '😩' },
  { name: 'Incapacitado', icon: '🚫' },
  { name: 'Invisível', icon: '👻' },
  { name: 'Paralisado', icon: '⚡' },
  { name: 'Petrificado', icon: '🗿' },
  { name: 'Prone', icon: '🔽' },
  { name: 'Restringido', icon: '🔗' },
  { name: 'Surdo', icon: '🙉' },
  { name: 'Concentrating', icon: '🧘' },
  { name: 'Em Chamas', icon: '🔥' },
  { name: 'Queimando', icon: '🔥' },
  { name: 'Sangrando', icon: '🩸' },
  { name: 'Marcado', icon: '🎯' },
  { name: 'Abençoado', icon: '✨' },
  { name: 'Amaldiçoado', icon: '💀' }
];

// Available skills for dice requests
const SKILLS = {
  'Athletics': 'str',
  'Acrobatics': 'dex',
  'Sleight of Hand': 'dex',
  'Stealth': 'dex',
  'Arcana': 'int',
  'History': 'int',
  'Investigation': 'int',
  'Nature': 'int',
  'Religion': 'int',
  'Animal Handling': 'wis',
  'Insight': 'wis',
  'Medicine': 'wis',
  'Perception': 'wis',
  'Survival': 'wis',
  'Deception': 'cha',
  'Intimidation': 'cha',
  'Performance': 'cha',
  'Persuasion': 'cha'
};

// Saving throws
const SAVES = ['Força', 'Destreza', 'Constituição', 'Inteligência', 'Sabedoria', 'Carisma'];

export default function DMDashboard({ isOpen, onClose }) {
  const { state, actions } = useGame();
  const { player, players, allCharacters, campaign, connected, npcs, systemData } = state;
  const [viewMode, setViewMode] = useState('overview'); // 'overview', 'detail', 'npcs'
  const [selectedCharacter, setSelectedCharacter] = useState(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortBy, setSortBy] = useState('name'); // 'name', 'hp', 'level'
  const [displayMode, setDisplayMode] = useState('card'); // 'card' or 'list'
  
  // NPC management state
  const [showNPCWizard, setShowNPCWizard] = useState(false);
  const [editingNPC, setEditingNPC] = useState(null);
  const [selectedNPC, setSelectedNPC] = useState(null);

  // Load all characters and NPCs when dashboard opens
  useEffect(() => {
    if (isOpen && campaign.id && player.isDM) {
      actions.getAllCharacters(campaign.id);
      actions.listNPCs();
    }
  }, [isOpen, campaign.id, player.isDM]);

  // Handle NPC creation from wizard
  const handleCreateNPC = async (characterData) => {
    try {
      if (editingNPC) {
        // Update existing NPC
        await actions.updateNPC(editingNPC.id, characterData);
      } else {
        // Create new NPC
        await actions.createNPC(characterData);
      }
      setShowNPCWizard(false);
      setEditingNPC(null);
    } catch (error) {
      console.error('Error saving NPC:', error);
    }
  };

  // Handle NPC deletion
  const handleDeleteNPC = async (npcId) => {
    if (!window.confirm('Tem certeza que deseja deletar este NPC?')) return;
    try {
      await actions.deleteNPC(npcId);
    } catch (error) {
      console.error('Error deleting NPC:', error);
    }
  };

  // Create token from NPC
  const handleCreateTokenFromNPC = async (npc) => {
    try {
      const tokenData = {
        name: npc.name,
        x: 5,
        y: 5,
        conditions: npc.conditions || [],
        hp: npc.hp || null,
        color: npc.tokenColor ? parseInt(npc.tokenColor.replace('#', '0x')) : 0x9b59b6,
        size: npc.size || 'medium',
        imageUrl: npc.imageUrl || null,
        isNPC: true,
        npcId: npc.id
      };
      await actions.addToken(tokenData);
      console.log(`Token created for NPC ${npc.name}`);
    } catch (error) {
      console.error('Error creating token from NPC:', error);
    }
  };

  // Convert allCharacters Map to array for display
  const charactersArray = allCharacters ? Array.from(allCharacters.entries()).map(([playerName, character]) => ({
    playerName,
    character,
    isOnline: players.some(p => p.name === playerName && p.is_connected !== false)
  })) : [];

  // Filter and sort characters
  const filteredCharacters = charactersArray
    .filter(({ character, playerName }) => {
      if (!searchFilter) return true;
      const search = searchFilter.toLowerCase();
      return (character.name || '').toLowerCase().includes(search) ||
             playerName.toLowerCase().includes(search) ||
             (character.class || '').toLowerCase().includes(search) ||
             (character.race || '').toLowerCase().includes(search);
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'hp':
          const aHP = (a.character.hp?.current || 0) / (a.character.hp?.max || 1);
          const bHP = (b.character.hp?.current || 0) / (b.character.hp?.max || 1);
          return aHP - bHP; // Lowest HP first
        case 'level':
          return (b.character.level || 0) - (a.character.level || 0); // Highest level first
        case 'name':
        default:
          return (a.character.name || '').localeCompare(b.character.name || '');
      }
    });

  // Get HP percentage and color
  const getHPPercentage = (character) => {
    const current = character.hp?.current || 0;
    const max = character.hp?.max || 1;
    return Math.max(0, (current / max) * 100);
  };

  const getHPColor = (percentage) => {
    if (percentage > 75) return 'var(--color-success)';
    if (percentage > 50) return '#ffd700';
    if (percentage > 25) return '#ff9f43';
    return 'var(--color-accent)';
  };

  // Get ability modifier
  const getModifier = (score) => Math.floor((score - 10) / 2);

  // Handle HP change
  const handleHPChange = async (playerName, character, delta) => {
    const newHP = Math.max(0, Math.min(
      (character.hp.current || 0) + delta,
      (character.hp.max || 1) + (character.hp.temp || 0)
    ));
    
    const updatedHP = { ...character.hp, current: newHP };
    const updatedCharacter = {
      ...character,
      hp: updatedHP
    };
    
    try {
      await actions.dmUpdateCharacter(campaign.id, playerName, updatedCharacter);
      
      // Also update the corresponding token on the map if it exists
      const correspondingToken = state.tokens.find(token => 
        token.name === character.name || 
        token.characterName === playerName ||
        token.playerId === playerName
      );
      
      if (correspondingToken) {
        await actions.updateToken(correspondingToken.id, {
          hp: updatedHP,
          conditions: character.conditions // Also sync conditions
        });
      }
    } catch (error) {
      console.error('Error updating HP:', error);
    }
  };

  // Handle condition toggle
  const handleConditionToggle = async (playerName, character, conditionName) => {
    const conditions = character.conditions || [];
    const hasCondition = conditions.some(c => c.name === conditionName);
    
    let newConditions;
    if (hasCondition) {
      // Remove condition
      newConditions = conditions.filter(c => c.name !== conditionName);
    } else {
      // Add condition
      const condition = CONDITIONS.find(c => c.name === conditionName);
      newConditions = [...conditions, condition];
    }
    
    const updatedCharacter = {
      ...character,
      conditions: newConditions
    };
    
    try {
      await actions.dmUpdateCharacter(campaign.id, playerName, updatedCharacter);
      
      // Also update the corresponding token on the map if it exists
      const correspondingToken = state.tokens.find(token => 
        token.name === character.name || 
        token.characterName === playerName ||
        token.playerId === playerName
      );
      
      if (correspondingToken) {
        await actions.updateToken(correspondingToken.id, {
          conditions: newConditions,
          hp: character.hp // Also sync HP data
        });
      }
    } catch (error) {
      console.error('Error updating condition:', error);
    }
  };

  // Handle skill test request
  const handleRequestTest = (playerName, character, testType, testName) => {
    const message = `🎲 **Pedido de Teste** para **${character.name || playerName}**: Role um teste de **${testName}**`;
    actions.sendMessage(message);
  };

  // Handle character update from detail view
  const handleCharacterUpdate = async (updatedCharacter) => {
    if (!selectedPlayerName) return;
    
    try {
      await actions.dmUpdateCharacter(campaign.id, selectedPlayerName, updatedCharacter);
      setSelectedCharacter(updatedCharacter);
    } catch (error) {
      console.error('Error updating character:', error);
    }
  };

  // Create token from character (for testing and quick token creation)
  const handleCreateTokenFromCharacter = async (playerName, character) => {
    try {
      const tokenData = {
        name: character.name || playerName,
        characterName: playerName,
        playerId: playerName,
        x: 5, // Place at grid 5,5 by default
        y: 5,
        conditions: character.conditions || [],
        hp: character.hp || null,
        color: 0x3b82f6, // Default blue
        size: 'medium'
      };
      
      await actions.addToken(tokenData);
      console.log(`Token created for ${character.name || playerName}`);
    } catch (error) {
      console.error('Error creating token:', error);
    }
  };

  // Handle dice roll from character sheet
  const handleDiceRoll = (rollData) => {
    actions.rollDice(rollData.notation);
  };

  if (!isOpen) return null;

  return (
    <div className="dm-dashboard">
      {/* Header */}
      <div className="dm-dashboard-header">
        <div className="dm-dashboard-title">
          <h2>👥 Painel do Mestre</h2>
          <span className="character-count">
            {filteredCharacters.length} personagem{filteredCharacters.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="dm-dashboard-controls">
          {viewMode === 'detail' && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setViewMode('overview');
                setSelectedCharacter(null);
                setSelectedPlayerName(null);
                setIsEditing(false);
              }}
            >
              ← Voltar
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="dm-dashboard-tabs">
        <button
          className={`dm-tab ${viewMode === 'overview' || viewMode === 'detail' ? 'active' : ''}`}
          onClick={() => setViewMode('overview')}
        >
          👥 Personagens dos Jogadores
        </button>
        <button
          className={`dm-tab ${viewMode === 'npcs' ? 'active' : ''}`}
          onClick={() => setViewMode('npcs')}
        >
          🎭 NPCs/Personagens do Mestre ({npcs?.length || 0})
        </button>
      </div>

      {/* Content */}
      <div className="dm-dashboard-content">
        {/* NPCs Tab */}
        {viewMode === 'npcs' ? (
          <div className="dm-npcs-section">
            {/* NPC Controls */}
            <div className="dm-dashboard-filters">
              <div className="filter-row">
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setEditingNPC(null);
                    setShowNPCWizard(true);
                  }}
                >
                  ➕ Criar NPC/Personagem
                </button>
              </div>
            </div>

            {/* NPCs Grid */}
            <div className="dm-characters dm-characters-grid">
              {(!npcs || npcs.length === 0) ? (
                <div className="dm-no-characters">
                  <p>🎭 Nenhum NPC criado ainda</p>
                  <span>Clique em "Criar NPC/Personagem" para adicionar NPCs com fichas completas.</span>
                </div>
              ) : (
                npcs.map((npc) => (
                  <NPCCard
                    key={npc.id}
                    npc={npc}
                    onEdit={() => {
                      setEditingNPC(npc);
                      setShowNPCWizard(true);
                    }}
                    onDelete={() => handleDeleteNPC(npc.id)}
                    onCreateToken={() => handleCreateTokenFromNPC(npc)}
                    onViewDetails={() => {
                      setSelectedNPC(npc);
                      setSelectedCharacter(npc);
                      setSelectedPlayerName(`NPC: ${npc.name}`);
                      setViewMode('detail');
                    }}
                    getHPPercentage={getHPPercentage}
                    getHPColor={getHPColor}
                  />
                ))
              )}
            </div>
          </div>
        ) : viewMode === 'overview' ? (
          <>
            {/* Controls */}
            <div className="dm-dashboard-filters">
              <div className="filter-row">
                <input
                  type="text"
                  placeholder="🔍 Buscar personagem, jogador, classe..."
                  className="input dm-search"
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                />
                
                <select
                  className="input dm-sort"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="name">Ordenar por Nome</option>
                  <option value="hp">Ordenar por HP</option>
                  <option value="level">Ordenar por Nível</option>
                </select>

                <div className="view-toggle">
                  <button
                    className={`btn btn-sm ${displayMode === 'card' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setDisplayMode('card')}
                    title="Visualização em Cards"
                  >
                    ▦
                  </button>
                  <button
                    className={`btn btn-sm ${displayMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setDisplayMode('list')}
                    title="Visualização em Lista"
                  >
                    ☰
                  </button>
                </div>
              </div>
            </div>

            {/* Characters Grid/List */}
            <div className={`dm-characters ${displayMode === 'list' ? 'dm-characters-list' : 'dm-characters-grid'}`}>
              {filteredCharacters.length === 0 ? (
                <div className="dm-no-characters">
                  <p>📝 Nenhum personagem encontrado</p>
                  <span>Os jogadores precisam criar e salvar seus personagens primeiro.</span>
                </div>
              ) : (
                filteredCharacters.map(({ playerName, character, isOnline }) => (
                  <CharacterCard
                    key={playerName}
                    playerName={playerName}
                    character={character}
                    isOnline={isOnline}
                    displayMode={displayMode}
                    onHPChange={(delta) => handleHPChange(playerName, character, delta)}
                    onConditionToggle={(condition) => handleConditionToggle(playerName, character, condition)}
                    onRequestTest={(type, name) => handleRequestTest(playerName, character, type, name)}
                    onCreateToken={() => handleCreateTokenFromCharacter(playerName, character)}
                    onViewDetails={() => {
                      setSelectedCharacter(character);
                      setSelectedPlayerName(playerName);
                      setViewMode('detail');
                    }}
                    getHPPercentage={getHPPercentage}
                    getHPColor={getHPColor}
                    getModifier={getModifier}
                  />
                ))
              )}
            </div>
          </>
        ) : viewMode === 'detail' ? (
          /* Detail View */
          <div className="dm-character-detail">
            {selectedCharacter && (
              <>
                <div className="detail-header">
                  <div className="detail-player-info">
                    <span className="detail-player-name">
                      {players.find(p => p.name === selectedPlayerName)?.is_connected !== false ? '🟢' : '🔴'} {selectedPlayerName}
                    </span>
                    <h3>{selectedCharacter.name}</h3>
                  </div>
                  <div className="detail-actions">
                    <button
                      className={`btn btn-sm ${isEditing ? 'btn-accent' : 'btn-secondary'}`}
                      onClick={() => setIsEditing(!isEditing)}
                    >
                      {isEditing ? '👁️ Visualizar' : '✏️ Editar'}
                    </button>
                  </div>
                </div>
                
                <div className="detail-charsheet">
                  <CharSheet
                    character={selectedCharacter}
                    isEditable={isEditing}
                    onUpdateCharacter={handleCharacterUpdate}
                    onRollDice={handleDiceRoll}
                    system={campaign.system || 'dnd5e'}
                    systemData={state.systemData}
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Character Card Component
function CharacterCard({
  playerName,
  character,
  isOnline,
  displayMode,
  onHPChange,
  onConditionToggle,
  onRequestTest,
  onCreateToken,
  onViewDetails,
  getHPPercentage,
  getHPColor,
  getModifier
}) {
  const [showConditions, setShowConditions] = useState(false);
  const [showTests, setShowTests] = useState(false);
  const [hpInput, setHpInput] = useState('');

  const hpPercentage = getHPPercentage(character);
  const hpColor = getHPColor(hpPercentage);

  // Handle manual HP input
  const handleHPInput = (e) => {
    e.preventDefault();
    const delta = parseInt(hpInput) || 0;
    if (delta !== 0) {
      onHPChange(delta);
      setHpInput('');
    }
  };

  if (displayMode === 'list') {
    return (
      <div className="character-card character-card-list">
        <div className="card-header-list">
          <div className="player-status">
            <span className={`online-indicator ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? '🟢' : '🔴'}
            </span>
            <span className="player-name">{playerName}</span>
          </div>
          <div className="character-basic">
            <span className="character-name">{character.name || 'Sem Nome'}</span>
            <span className="character-info">
              {character.race && character.class ? 
                `${character.race} ${character.class}` : 
                character.class || character.race || ''
              }
              {character.level && ` Nv.${character.level}`}
            </span>
          </div>
          <div className="hp-display-list">
            <span className="hp-text">
              {character.hp?.current || 0}/{character.hp?.max || 0}
            </span>
            <div className="hp-bar-small">
              <div
                className="hp-fill"
                style={{ width: `${hpPercentage}%`, backgroundColor: hpColor }}
              />
            </div>
          </div>
          <div className="ac-display">🛡️ {character.ac || 10}</div>
          <div className="card-actions-list">
            <QuickActions
              character={character}
              onHPChange={onHPChange}
              onConditionToggle={onConditionToggle}
              onRequestTest={onRequestTest}
              onCreateToken={onCreateToken}
              onViewDetails={onViewDetails}
              compact={true}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="character-card">
      {/* Header */}
      <div className="card-header">
        <div className="player-status">
          <span className={`online-indicator ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? '🟢' : '🔴'}
          </span>
          <span className="player-name">{playerName}</span>
        </div>
      </div>

      <div className="card-divider"></div>

      {/* Character Info */}
      <div className="character-info">
        <h4 className="character-name">{character.name || 'Sem Nome'}</h4>
        <div className="character-details">
          {character.race && character.class ? (
            <span>{character.race} {character.class}</span>
          ) : (
            <span>{character.class || character.race || 'Classe/Raça não definida'}</span>
          )}
          {character.level && <span>Nv.{character.level}</span>}
        </div>
      </div>

      {/* HP Bar */}
      <div className="hp-section">
        <div className="hp-info">
          <span className="hp-text">
            ❤️ {character.hp?.current || 0}/{character.hp?.max || 0}
            {character.hp?.temp && character.hp.temp > 0 && (
              <span className="temp-hp"> (+{character.hp.temp})</span>
            )}
          </span>
          <span className="ac-text">🛡️ {character.ac || 10}</span>
        </div>
        <div className="hp-bar">
          <div
            className="hp-fill"
            style={{ width: `${hpPercentage}%`, backgroundColor: hpColor }}
          />
        </div>
      </div>

      {/* Stats */}
      {character.attributes && (
        <div className="stats-section">
          {Object.entries(character.attributes).map(([stat, value]) => (
            <div key={stat} className="stat-badge">
              <span className="stat-name">{stat.toUpperCase()}</span>
              <span className="stat-value">{value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Conditions */}
      {character.conditions && character.conditions.length > 0 && (
        <div className="conditions-section">
          {character.conditions.map((condition, index) => (
            <span key={index} className="condition-badge">
              {condition.icon} {condition.name}
            </span>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="card-actions">
        <QuickActions
          character={character}
          onHPChange={onHPChange}
          onConditionToggle={onConditionToggle}
          onRequestTest={onRequestTest}
          onCreateToken={onCreateToken}
          onViewDetails={onViewDetails}
        />
      </div>
    </div>
  );
}

// Quick Actions Component
function QuickActions({ character, onHPChange, onConditionToggle, onRequestTest, onCreateToken, onViewDetails, compact = false }) {
  const [showHPInput, setShowHPInput] = useState(false);
  const [hpInput, setHpInput] = useState('');
  const [showConditionsMenu, setShowConditionsMenu] = useState(false);
  const [showTestsMenu, setShowTestsMenu] = useState(false);

  const handleHPSubmit = (e) => {
    e.preventDefault();
    const delta = parseInt(hpInput) || 0;
    if (delta !== 0) {
      onHPChange(delta);
    }
    setHpInput('');
    setShowHPInput(false);
  };

  if (compact) {
    return (
      <div className="quick-actions-compact">
        <button className="action-btn" onClick={() => setShowHPInput(!showHPInput)} title="Modificar HP">
          ❤️
        </button>
        <button className="action-btn" onClick={() => setShowConditionsMenu(!showConditionsMenu)} title="Condições">
          ⚔️
        </button>
        <button className="action-btn" onClick={() => setShowTestsMenu(!showTestsMenu)} title="Pedir Teste">
          🎲
        </button>
        <button className="action-btn" onClick={onCreateToken} title="Criar Token no Mapa">
          🎭
        </button>
        <button className="action-btn" onClick={onViewDetails} title="Ver Ficha">
          👁️
        </button>

        {/* HP Input */}
        {showHPInput && (
          <div className="action-popup hp-popup">
            <form onSubmit={handleHPSubmit}>
              <input
                type="number"
                placeholder="±HP"
                value={hpInput}
                onChange={(e) => setHpInput(e.target.value)}
                className="hp-input"
                autoFocus
              />
            </form>
          </div>
        )}

        {/* Conditions Menu */}
        {showConditionsMenu && (
          <ConditionsMenu
            character={character}
            onConditionToggle={onConditionToggle}
            onClose={() => setShowConditionsMenu(false)}
          />
        )}

        {/* Tests Menu */}
        {showTestsMenu && (
          <TestsMenu
            character={character}
            onRequestTest={onRequestTest}
            onClose={() => setShowTestsMenu(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="quick-actions">
      <div className="action-group">
        <button
          className="action-btn hp-btn"
          onClick={() => setShowHPInput(!showHPInput)}
          title="Curar/Dano"
        >
          ❤️ HP
        </button>
        
        {showHPInput && (
          <form className="hp-input-form" onSubmit={handleHPSubmit}>
            <input
              type="number"
              placeholder="±"
              value={hpInput}
              onChange={(e) => setHpInput(e.target.value)}
              className="hp-input"
              autoFocus
            />
            <button type="submit" className="hp-apply">✓</button>
          </form>
        )}
      </div>

      <button
        className="action-btn condition-btn"
        onClick={() => setShowConditionsMenu(!showConditionsMenu)}
        title="Condições"
      >
        ⚔️ Condição
      </button>

      <button
        className="action-btn test-btn"
        onClick={() => setShowTestsMenu(!showTestsMenu)}
        title="Pedir Teste"
      >
        🎲 Teste
      </button>

      <button
        className="action-btn token-btn"
        onClick={onCreateToken}
        title="Criar Token no Mapa"
      >
        🎭 Token
      </button>

      <button
        className="action-btn view-btn"
        onClick={onViewDetails}
        title="Ver Ficha Completa"
      >
        👁️ Ficha
      </button>

      {/* Conditions Dropdown */}
      {showConditionsMenu && (
        <ConditionsMenu
          character={character}
          onConditionToggle={onConditionToggle}
          onClose={() => setShowConditionsMenu(false)}
        />
      )}

      {/* Tests Dropdown */}
      {showTestsMenu && (
        <TestsMenu
          character={character}
          onRequestTest={onRequestTest}
          onClose={() => setShowTestsMenu(false)}
        />
      )}
    </div>
  );
}

// Conditions Menu Component
function ConditionsMenu({ character, onConditionToggle, onClose }) {
  const activeConditions = character.conditions || [];

  return (
    <div className="conditions-menu">
      <div className="menu-header">
        <span>Condições</span>
        <button onClick={onClose} className="menu-close">✕</button>
      </div>
      <div className="menu-content">
        {CONDITIONS.map((condition) => {
          const isActive = activeConditions.some(c => c.name === condition.name);
          return (
            <button
              key={condition.name}
              className={`condition-item ${isActive ? 'active' : ''}`}
              onClick={() => onConditionToggle(condition.name)}
            >
              <span className="condition-icon">{condition.icon}</span>
              <span className="condition-name">{condition.name}</span>
              {isActive && <span className="condition-check">✓</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Tests Menu Component  
function TestsMenu({ character, onRequestTest, onClose }) {
  return (
    <div className="tests-menu">
      <div className="menu-header">
        <span>Pedir Testes</span>
        <button onClick={onClose} className="menu-close">✕</button>
      </div>
      <div className="menu-content">
        <div className="menu-section">
          <h5>Salvaguardas</h5>
          {SAVES.map((save) => (
            <button
              key={save}
              className="test-item"
              onClick={() => onRequestTest('save', save)}
            >
              💾 {save}
            </button>
          ))}
        </div>
        
        <div className="menu-section">
          <h5>Perícias</h5>
          {Object.keys(SKILLS).map((skill) => (
            <button
              key={skill}
              className="test-item"
              onClick={() => onRequestTest('skill', skill)}
            >
              🎯 {skill}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}