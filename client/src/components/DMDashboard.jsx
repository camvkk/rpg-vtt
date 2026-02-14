import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

// Framer Motion variants
const containerVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { 
      duration: 0.3, 
      ease: 'easeOut',
      staggerChildren: 0.05
    }
  },
  exit: { 
    opacity: 0, 
    scale: 0.98,
    transition: { duration: 0.2 }
  }
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { 
    opacity: 1, 
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 25 }
  },
  exit: { 
    opacity: 0, 
    y: -10,
    transition: { duration: 0.2 }
  },
  hover: {
    y: -4,
    transition: { type: 'spring', stiffness: 400, damping: 10 }
  }
};

const tabVariants = {
  inactive: { opacity: 0.7, scale: 1 },
  active: { 
    opacity: 1, 
    scale: 1,
    transition: { type: 'spring', stiffness: 300, damping: 25 }
  }
};

const menuVariants = {
  hidden: { opacity: 0, y: -10, scale: 0.95 },
  visible: { 
    opacity: 1, 
    y: 0, 
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 }
  },
  exit: { 
    opacity: 0, 
    y: -10, 
    scale: 0.95,
    transition: { duration: 0.15 }
  }
};

export default function DMDashboard({ isOpen, onClose }) {
  const { state, actions } = useGame();
  const { player, players, allCharacters, campaign, npcs, systemData } = state;
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
        await actions.updateNPC(editingNPC.id, characterData);
      } else {
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
  const charactersArray = useMemo(() => {
    return allCharacters ? Array.from(allCharacters.entries()).map(([playerName, character]) => ({
      playerName,
      character,
      isOnline: players.some(p => p.name === playerName && p.is_connected !== false)
    })) : [];
  }, [allCharacters, players]);

  // Filter and sort characters
  const filteredCharacters = useMemo(() => {
    return charactersArray
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
            return aHP - bHP;
          case 'level':
            return (b.character.level || 0) - (a.character.level || 0);
          case 'name':
          default:
            return (a.character.name || '').localeCompare(b.character.name || '');
        }
      });
  }, [charactersArray, searchFilter, sortBy]);

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
      
      const correspondingToken = state.tokens.find(token => 
        token.name === character.name || 
        token.characterName === playerName ||
        token.playerId === playerName
      );
      
      if (correspondingToken) {
        await actions.updateToken(correspondingToken.id, {
          hp: updatedHP,
          conditions: character.conditions
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
      newConditions = conditions.filter(c => c.name !== conditionName);
    } else {
      const condition = CONDITIONS.find(c => c.name === conditionName);
      newConditions = [...conditions, condition];
    }
    
    const updatedCharacter = {
      ...character,
      conditions: newConditions
    };
    
    try {
      await actions.dmUpdateCharacter(campaign.id, playerName, updatedCharacter);
      
      const correspondingToken = state.tokens.find(token => 
        token.name === character.name || 
        token.characterName === playerName ||
        token.playerId === playerName
      );
      
      if (correspondingToken) {
        await actions.updateToken(correspondingToken.id, {
          conditions: newConditions,
          hp: character.hp
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

  // Create token from character
  const handleCreateTokenFromCharacter = async (playerName, character) => {
    try {
      const tokenData = {
        name: character.name || playerName,
        characterName: playerName,
        playerId: playerName,
        x: 5,
        y: 5,
        conditions: character.conditions || [],
        hp: character.hp || null,
        color: 0x3b82f6,
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
    <motion.div 
      className="dm-dashboard"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Header */}
      <motion.div 
        className="dm-dashboard-header"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="dm-dashboard-title">
          <h2>
            <motion.span 
              className="title-icon"
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
            >
              👥
            </motion.span>
            {' '}Painel do Mestre
          </h2>
          <span className="character-count">
            <motion.span
              key={filteredCharacters.length}
              initial={{ scale: 1.5, color: 'var(--color-primary)' }}
              animate={{ scale: 1, color: 'var(--color-text-dim)' }}
              transition={{ duration: 0.3 }}
            >
              {filteredCharacters.length}
            </motion.span>
            {' '}personagem{filteredCharacters.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="dm-dashboard-controls">
          <AnimatePresence mode="wait">
            {viewMode === 'detail' && (
              <motion.button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setViewMode('overview');
                  setSelectedCharacter(null);
                  setSelectedPlayerName(null);
                  setIsEditing(false);
                }}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                ← Voltar
              </motion.button>
            )}
          </AnimatePresence>
          <motion.button 
            className="btn btn-ghost btn-sm" 
            onClick={onClose}
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
          >
            ✕
          </motion.button>
        </div>
      </motion.div>

      {/* Tab Navigation */}
      <motion.div 
        className="dm-dashboard-tabs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        <motion.button
          className={`dm-tab ${viewMode === 'overview' || viewMode === 'detail' ? 'active' : ''}`}
          onClick={() => setViewMode('overview')}
          variants={tabVariants}
          animate={viewMode === 'overview' || viewMode === 'detail' ? 'active' : 'inactive'}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          👥 Personagens dos Jogadores
          {viewMode === 'overview' || viewMode === 'detail' ? (
            <motion.div
              className="tab-indicator"
              layoutId="tabIndicator"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          ) : null}
        </motion.button>
        <motion.button
          className={`dm-tab ${viewMode === 'npcs' ? 'active' : ''}`}
          onClick={() => setViewMode('npcs')}
          variants={tabVariants}
          animate={viewMode === 'npcs' ? 'active' : 'inactive'}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          🎭 NPCs/Personagens do Mestre ({npcs?.length || 0})
          {viewMode === 'npcs' ? (
            <motion.div
              className="tab-indicator"
              layoutId="tabIndicator"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          ) : null}
        </motion.button>
      </motion.div>

      {/* Content */}
      <div className="dm-dashboard-content">
        <AnimatePresence mode="wait">
          {/* NPCs Tab */}
          {viewMode === 'npcs' && (
            <motion.div 
              key="npcs"
              className="dm-npcs-section"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {/* NPC Controls */}
              <div className="dm-dashboard-filters">
                <div className="filter-row">
                  <motion.button
                    className="btn btn-primary"
                    onClick={() => {
                      setEditingNPC(null);
                      setShowNPCWizard(true);
                    }}
                    whileHover={{ scale: 1.02, boxShadow: '0 0 20px var(--color-primary)' }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <motion.span
                      animate={{ rotate: [0, 180, 360] }}
                      transition={{ duration: 0.5, delay: 0 }}
                    >
                      ➕
                    </motion.span>
                    {' '}Criar NPC/Personagem
                  </motion.button>
                </div>
              </div>

              {/* NPCs Grid */}
              <motion.div 
                className="dm-characters dm-characters-grid"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {(!npcs || npcs.length === 0) ? (
                  <motion.div 
                    className="dm-no-characters"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <motion.p
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      🎭 Nenhum NPC criado ainda
                    </motion.p>
                    <span>Clique em "Criar NPC/Personagem" para adicionar NPCs com fichas completas.</span>
                  </motion.div>
                ) : (
                  <AnimatePresence>
                    {npcs.map((npc, index) => (
                      <NPCCard
                        key={npc.id}
                        npc={npc}
                        index={index}
                        onEdit={() => {
                          setEditingNPC(npc);
                          setShowNPCWizard(true);
                        }}
                        onDelete={() => handleDeleteNPC(npc.id)}
                        onCreateToken={() => handleCreateTokenFromNPC(npc)}
                        onViewDetails={() => {
                          setSelectedCharacter(npc);
                          setSelectedPlayerName(`NPC: ${npc.name}`);
                          setViewMode('detail');
                        }}
                        getHPPercentage={getHPPercentage}
                        getHPColor={getHPColor}
                      />
                    ))}
                  </AnimatePresence>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Overview Tab */}
          {viewMode === 'overview' && (
            <motion.div
              key="overview"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              {/* Controls */}
              <div className="dm-dashboard-filters">
                <div className="filter-row">
                  <motion.input
                    type="text"
                    placeholder="🔍 Buscar personagem, jogador, classe..."
                    className="input dm-search"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    whileFocus={{ boxShadow: '0 0 0 3px rgba(226, 183, 20, 0.2)' }}
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
                    <motion.button
                      className={`btn btn-sm ${displayMode === 'card' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setDisplayMode('card')}
                      title="Visualização em Cards"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      ▦
                    </motion.button>
                    <motion.button
                      className={`btn btn-sm ${displayMode === 'list' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setDisplayMode('list')}
                      title="Visualização em Lista"
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                    >
                      ☰
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Characters Grid/List */}
              <motion.div 
                className={`dm-characters ${displayMode === 'list' ? 'dm-characters-list' : 'dm-characters-grid'}`}
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {filteredCharacters.length === 0 ? (
                  <motion.div 
                    className="dm-no-characters"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                  >
                    <motion.p
                      animate={{ y: [0, -5, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      📝 Nenhum personagem encontrado
                    </motion.p>
                    <span>Os jogadores precisam criar e salvar seus personagens primeiro.</span>
                  </motion.div>
                ) : (
                  <AnimatePresence>
                    {filteredCharacters.map(({ playerName, character, isOnline }, index) => (
                      <CharacterCard
                        key={playerName}
                        playerName={playerName}
                        character={character}
                        isOnline={isOnline}
                        displayMode={displayMode}
                        index={index}
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
                    ))}
                  </AnimatePresence>
                )}
              </motion.div>
            </motion.div>
          )}

          {/* Detail View */}
          {viewMode === 'detail' && (
            <motion.div 
              key="detail"
              className="dm-character-detail"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              {selectedCharacter && (
                <>
                  <motion.div 
                    className="detail-header"
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="detail-player-info">
                      <span className="detail-player-name">
                        <motion.span
                          animate={{ 
                            scale: [1, 1.2, 1],
                            opacity: [0.7, 1, 0.7]
                          }}
                          transition={{ duration: 2, repeat: Infinity }}
                        >
                          {players.find(p => p.name === selectedPlayerName)?.is_connected !== false ? '🟢' : '🔴'}
                        </motion.span>
                        {' '}{selectedPlayerName}
                      </span>
                      <h3>{selectedCharacter.name}</h3>
                    </div>
                    <div className="detail-actions">
                      <motion.button
                        className={`btn btn-sm ${isEditing ? 'btn-accent' : 'btn-secondary'}`}
                        onClick={() => setIsEditing(!isEditing)}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {isEditing ? '👁️ Visualizar' : '✏️ Editar'}
                      </motion.button>
                    </div>
                  </motion.div>
                  
                  <motion.div 
                    className="detail-charsheet"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                  >
                    <CharSheet
                      character={selectedCharacter}
                      isEditable={isEditing}
                      onUpdateCharacter={handleCharacterUpdate}
                      onRollDice={handleDiceRoll}
                      system={campaign.system || 'dnd5e'}
                      systemData={state.systemData}
                    />
                  </motion.div>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* NPC Character Wizard Modal */}
      <CharacterWizard
        isOpen={showNPCWizard}
        onClose={() => {
          setShowNPCWizard(false);
          setEditingNPC(null);
        }}
        onCreateCharacter={handleCreateNPC}
        system={campaign.system || 'dnd5e'}
        systemData={systemData}
        mode="npc"
        existingCharacter={editingNPC}
      />
    </motion.div>
  );
}

// Character Card Component with animations
function CharacterCard({
  playerName,
  character,
  isOnline,
  displayMode,
  index,
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
      <motion.div 
        className="character-card character-card-list"
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        whileHover="hover"
        layout
        custom={index}
        transition={{ delay: index * 0.03 }}
      >
        <div className="card-header-list">
          <div className="player-status">
            <motion.span 
              className={`online-indicator ${isOnline ? 'online' : 'offline'}`}
              animate={isOnline ? { scale: [1, 1.2, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {isOnline ? '🟢' : '🔴'}
            </motion.span>
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
              <motion.div
                className="hp-fill"
                initial={{ width: 0 }}
                animate={{ width: `${hpPercentage}%` }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                style={{ backgroundColor: hpColor }}
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
      </motion.div>
    );
  }

  return (
    <motion.div 
      className="character-card"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover="hover"
      layout
      custom={index}
      transition={{ delay: index * 0.05 }}
    >
      {/* Header */}
      <div className="card-header">
        <div className="player-status">
          <motion.span 
            className={`online-indicator ${isOnline ? 'online' : 'offline'}`}
            animate={isOnline ? { 
              scale: [1, 1.3, 1],
              boxShadow: ['0 0 0px #51cf66', '0 0 10px #51cf66', '0 0 0px #51cf66']
            } : {}}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {isOnline ? '🟢' : '🔴'}
          </motion.span>
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
              <motion.span 
                className="temp-hp"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
              >
                {' '}(+{character.hp.temp})
              </motion.span>
            )}
          </span>
          <span className="ac-text">🛡️ {character.ac || 10}</span>
        </div>
        <div className="hp-bar">
          <motion.div
            className="hp-fill"
            initial={{ width: 0 }}
            animate={{ width: `${hpPercentage}%` }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.05 }}
            style={{ backgroundColor: hpColor }}
          />
        </div>
      </div>

      {/* Stats */}
      {character.attributes && (
        <motion.div 
          className="stats-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + index * 0.05 }}
        >
          {Object.entries(character.attributes).map(([stat, value], statIndex) => (
            <motion.div 
              key={stat} 
              className="stat-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 + statIndex * 0.05 }}
              whileHover={{ scale: 1.1, y: -2 }}
            >
              <span className="stat-name">{stat.toUpperCase()}</span>
              <span className="stat-value">{value}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Conditions */}
      <AnimatePresence>
        {character.conditions && character.conditions.length > 0 && (
          <motion.div 
            className="conditions-section"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            {character.conditions.map((condition, condIndex) => (
              <motion.span 
                key={condIndex} 
                className="condition-badge"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ delay: condIndex * 0.05 }}
                whileHover={{ scale: 1.1 }}
              >
                {condition.icon} {condition.name}
              </motion.span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
    </motion.div>
  );
}

// Quick Actions Component with animations
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
        <motion.button 
          className="action-btn" 
          onClick={() => setShowHPInput(!showHPInput)} 
          title="Modificar HP"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          ❤️
        </motion.button>
        <motion.button 
          className="action-btn" 
          onClick={() => setShowConditionsMenu(!showConditionsMenu)} 
          title="Condições"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          ⚔️
        </motion.button>
        <motion.button 
          className="action-btn" 
          onClick={() => setShowTestsMenu(!showTestsMenu)} 
          title="Pedir Teste"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          🎲
        </motion.button>
        <motion.button 
          className="action-btn" 
          onClick={onCreateToken} 
          title="Criar Token no Mapa"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          🎭
        </motion.button>
        <motion.button 
          className="action-btn" 
          onClick={onViewDetails} 
          title="Ver Ficha"
          whileHover={{ scale: 1.15 }}
          whileTap={{ scale: 0.9 }}
        >
          👁️
        </motion.button>

        {/* HP Input */}
        <AnimatePresence>
          {showHPInput && (
            <motion.div 
              className="action-popup hp-popup"
              variants={menuVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Conditions Menu */}
        <AnimatePresence>
          {showConditionsMenu && (
            <ConditionsMenu
              character={character}
              onConditionToggle={onConditionToggle}
              onClose={() => setShowConditionsMenu(false)}
            />
          )}
        </AnimatePresence>

        {/* Tests Menu */}
        <AnimatePresence>
          {showTestsMenu && (
            <TestsMenu
              character={character}
              onRequestTest={onRequestTest}
              onClose={() => setShowTestsMenu(false)}
            />
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="quick-actions">
      <div className="action-group">
        <motion.button
          className="action-btn hp-btn"
          onClick={() => setShowHPInput(!showHPInput)}
          title="Curar/Dano"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          ❤️ HP
        </motion.button>
        
        <AnimatePresence>
          {showHPInput && (
            <motion.form 
              className="hp-input-form" 
              onSubmit={handleHPSubmit}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              <input
                type="number"
                placeholder="±"
                value={hpInput}
                onChange={(e) => setHpInput(e.target.value)}
                className="hp-input"
                autoFocus
              />
              <motion.button 
                type="submit" 
                className="hp-apply"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                ✓
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </div>

      <motion.button
        className="action-btn condition-btn"
        onClick={() => setShowConditionsMenu(!showConditionsMenu)}
        title="Condições"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        ⚔️ Condição
      </motion.button>

      <motion.button
        className="action-btn test-btn"
        onClick={() => setShowTestsMenu(!showTestsMenu)}
        title="Pedir Teste"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        🎲 Teste
      </motion.button>

      <motion.button
        className="action-btn token-btn"
        onClick={onCreateToken}
        title="Criar Token no Mapa"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        🎭 Token
      </motion.button>

      <motion.button
        className="action-btn view-btn"
        onClick={onViewDetails}
        title="Ver Ficha Completa"
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
      >
        👁️ Ficha
      </motion.button>

      {/* Conditions Dropdown */}
      <AnimatePresence>
        {showConditionsMenu && (
          <ConditionsMenu
            character={character}
            onConditionToggle={onConditionToggle}
            onClose={() => setShowConditionsMenu(false)}
          />
        )}
      </AnimatePresence>

      {/* Tests Dropdown */}
      <AnimatePresence>
        {showTestsMenu && (
          <TestsMenu
            character={character}
            onRequestTest={onRequestTest}
            onClose={() => setShowTestsMenu(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Conditions Menu Component with animations
function ConditionsMenu({ character, onConditionToggle, onClose }) {
  const activeConditions = character.conditions || [];

  return (
    <motion.div 
      className="conditions-menu"
      variants={menuVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="menu-header">
        <span>Condições</span>
        <motion.button 
          onClick={onClose} 
          className="menu-close"
          whileHover={{ scale: 1.2, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          ✕
        </motion.button>
      </div>
      <div className="menu-content">
        {CONDITIONS.map((condition, index) => {
          const isActive = activeConditions.some(c => c.name === condition.name);
          return (
            <motion.button
              key={condition.name}
              className={`condition-item ${isActive ? 'active' : ''}`}
              onClick={() => onConditionToggle(condition.name)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
              whileHover={{ x: 5, backgroundColor: 'var(--bg-surface-light)' }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="condition-icon">{condition.icon}</span>
              <span className="condition-name">{condition.name}</span>
              {isActive && (
                <motion.span 
                  className="condition-check"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                >
                  ✓
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}

// Tests Menu Component with animations
function TestsMenu({ character, onRequestTest, onClose }) {
  return (
    <motion.div 
      className="tests-menu"
      variants={menuVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="menu-header">
        <span>Pedir Testes</span>
        <motion.button 
          onClick={onClose} 
          className="menu-close"
          whileHover={{ scale: 1.2, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
        >
          ✕
        </motion.button>
      </div>
      <div className="menu-content">
        <div className="menu-section">
          <h5>Salvaguardas</h5>
          {SAVES.map((save, index) => (
            <motion.button
              key={save}
              className="test-item"
              onClick={() => onRequestTest('save', save)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.02 }}
              whileHover={{ x: 5, backgroundColor: 'var(--bg-surface-light)' }}
              whileTap={{ scale: 0.98 }}
            >
              💾 {save}
            </motion.button>
          ))}
        </div>
        
        <div className="menu-section">
          <h5>Perícias</h5>
          {Object.keys(SKILLS).map((skill, index) => (
            <motion.button
              key={skill}
              className="test-item"
              onClick={() => onRequestTest('skill', skill)}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12 + index * 0.02 }}
              whileHover={{ x: 5, backgroundColor: 'var(--bg-surface-light)' }}
              whileTap={{ scale: 0.98 }}
            >
              🎯 {skill}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// NPC Card Component with animations
function NPCCard({ npc, index, onEdit, onDelete, onCreateToken, onViewDetails, getHPPercentage, getHPColor }) {
  const hpPercentage = getHPPercentage(npc);
  const hpColor = getHPColor(hpPercentage);

  return (
    <motion.div 
      className="character-card npc-card"
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      whileHover="hover"
      layout
      custom={index}
      transition={{ delay: index * 0.05 }}
    >
      {/* Header */}
      <div className="card-header npc-header">
        <div className="player-status">
          <motion.span 
            className="npc-indicator"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 2 }}
          >
            🎭
          </motion.span>
          <span className="player-name">NPC</span>
        </div>
      </div>

      <div className="card-divider"></div>

      {/* Character Info */}
      <div className="character-info">
        <h4 className="character-name">{npc.name || 'Sem Nome'}</h4>
        <div className="character-details">
          {npc.race && npc.class ? (
            <span>{npc.race} {npc.class}</span>
          ) : (
            <span>{npc.class || npc.race || 'Tipo não definido'}</span>
          )}
          {npc.level && <span>Nv.{npc.level}</span>}
        </div>
      </div>

      {/* HP Bar */}
      {npc.hp && (
        <div className="hp-section">
          <div className="hp-info">
            <span className="hp-text">
              ❤️ {npc.hp.current || 0}/{npc.hp.max || 0}
            </span>
            <span className="ac-text">🛡️ {npc.ac || 10}</span>
          </div>
          <div className="hp-bar">
            <motion.div
              className="hp-fill"
              initial={{ width: 0 }}
              animate={{ width: `${hpPercentage}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.05 }}
              style={{ backgroundColor: hpColor }}
            />
          </div>
        </div>
      )}

      {/* Stats */}
      {npc.attributes && (
        <motion.div 
          className="stats-section"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 + index * 0.05 }}
        >
          {Object.entries(npc.attributes).map(([stat, value], statIndex) => (
            <motion.div 
              key={stat} 
              className="stat-badge"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3 + statIndex * 0.05 }}
              whileHover={{ scale: 1.1, y: -2 }}
            >
              <span className="stat-name">{stat.toUpperCase()}</span>
              <span className="stat-value">{value}</span>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Actions */}
      <div className="card-actions npc-actions">
        <motion.button 
          className="action-btn edit-btn" 
          onClick={onEdit} 
          title="Editar NPC"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          ✏️ Editar
        </motion.button>
        <motion.button 
          className="action-btn token-btn" 
          onClick={onCreateToken} 
          title="Colocar no Mapa"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          🗺️ Mapa
        </motion.button>
        <motion.button 
          className="action-btn view-btn" 
          onClick={onViewDetails} 
          title="Ver Ficha"
          whileHover={{ scale: 1.05, y: -2 }}
          whileTap={{ scale: 0.95 }}
        >
          👁️ Ficha
        </motion.button>
        <motion.button 
          className="action-btn delete-btn" 
          onClick={onDelete} 
          title="Deletar NPC"
          whileHover={{ scale: 1.1, backgroundColor: 'var(--color-accent)' }}
          whileTap={{ scale: 0.9 }}
        >
          🗑️
        </motion.button>
      </div>
    </motion.div>
  );
}
