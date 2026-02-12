import React, { useState, useMemo } from 'react';

const CharSheet = ({ 
  character = null,
  isEditable = false,
  isCollapsed = false,
  onToggleCollapse = () => {},
  onUpdateCharacter = () => {},
  onRollDice = () => {},
  system = 'dnd5e',
  systemData = null
}) => {
  const [activeSection, setActiveSection] = useState('stats');

  // Get default character based on system
  const getDefaultCharacter = (system) => {
    switch (system) {
      case 'dnd5e':
        return {
          id: 'char1',
          name: 'Novo Personagem',
          class: 'Fighter',
          level: 1,
          race: 'Human',
          alignment: 'Lawful Good',
          attributes: {
            str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8
          },
          hp: { current: 10, max: 10, temp: 0 },
          ac: 16,
          speed: 30,
          proficiencyBonus: 2,
          skills: {
            athletics: { proficient: true },
            intimidation: { proficient: true }
          },
          savingThrows: {
            str: { proficient: true },
            con: { proficient: true }
          },
          attacks: [
            { name: 'Longsword', bonus: '+5', damage: '1d8+3', type: 'Slashing' }
          ],
          features: [
            'Fighting Style: Dueling',
            'Second Wind'
          ],
          notes: 'A brave warrior ready for adventure.'
        };
      
      case 'generic':
        return {
          id: 'char1',
          name: 'Novo Personagem',
          hp: { current: 10, max: 10, temp: 0 },
          customStats: {},
          notes: ''
        };
      
      case 'custom':
        const customChar = {
          id: 'char1',
          name: 'Novo Personagem',
          hp: { current: 10, max: 10, temp: 0 },
          customStats: {},
          race: '',
          class: '',
          level: 1,
          systemRules: '',
          notes: ''
        };
        
        // Initialize custom stats from system data
        if (systemData?.stats) {
          systemData.stats.forEach(stat => {
            customChar.customStats[stat.key] = 10; // Default value
          });
        }
        
        return customChar;
      
      default:
        return getDefaultCharacter('dnd5e');
    }
  };

  const defaultCharacter = getDefaultCharacter(system);

  const char = character || defaultCharacter;

  // Calculate ability modifiers
  const getModifier = (score) => Math.floor((score - 10) / 2);

  const modifiers = useMemo(() => {
    const mods = {};
    if (system === 'custom' && char.customStats) {
      Object.keys(char.customStats).forEach(stat => {
        mods[stat] = getModifier(char.customStats[stat]);
      });
    } else if (char.attributes) {
      Object.keys(char.attributes).forEach(attr => {
        mods[attr] = getModifier(char.attributes[attr]);
      });
    }
    return mods;
  }, [char.attributes, char.customStats, system]);

  // D&D 5e skills list
  const skills = {
    athletics: 'str',
    acrobatics: 'dex',
    sleightOfHand: 'dex',
    stealth: 'dex',
    arcana: 'int',
    history: 'int',
    investigation: 'int',
    nature: 'int',
    religion: 'int',
    animalHandling: 'wis',
    insight: 'wis',
    medicine: 'wis',
    perception: 'wis',
    survival: 'wis',
    deception: 'cha',
    intimidation: 'cha',
    performance: 'cha',
    persuasion: 'cha'
  };

  const skillNames = {
    athletics: 'Athletics',
    acrobatics: 'Acrobatics',
    sleightOfHand: 'Sleight of Hand',
    stealth: 'Stealth',
    arcana: 'Arcana',
    history: 'History',
    investigation: 'Investigation',
    nature: 'Nature',
    religion: 'Religion',
    animalHandling: 'Animal Handling',
    insight: 'Insight',
    medicine: 'Medicine',
    perception: 'Perception',
    survival: 'Survival',
    deception: 'Deception',
    intimidation: 'Intimidation',
    performance: 'Performance',
    persuasion: 'Persuasion'
  };

  const handleAttributeChange = (attr, value) => {
    if (!isEditable) return;
    const newValue = Math.max(1, Math.min(20, parseInt(value) || 1));
    onUpdateCharacter({
      ...char,
      attributes: { ...char.attributes, [attr]: newValue }
    });
  };

  const handleSkillProficiencyToggle = (skill) => {
    if (!isEditable) return;
    const newSkills = {
      ...char.skills,
      [skill]: { proficient: !char.skills[skill]?.proficient }
    };
    onUpdateCharacter({ ...char, skills: newSkills });
  };

  const handleSavingThrowToggle = (save) => {
    if (!isEditable) return;
    const newSaves = {
      ...char.savingThrows,
      [save]: { proficient: !char.savingThrows[save]?.proficient }
    };
    onUpdateCharacter({ ...char, savingThrows: newSaves });
  };

  const handleHPChange = (delta) => {
    if (!isEditable) return;
    const newHP = Math.max(0, Math.min(char.hp.current + delta, char.hp.max + (char.hp.temp || 0)));
    onUpdateCharacter({ ...char, hp: { ...char.hp, current: newHP } });
  };

  const createNewCharacter = () => {
    if (!isEditable) return;
    const blankCharacter = getBlankCharacter(system);
    onUpdateCharacter(blankCharacter);
  };

  const getBlankCharacter = (system) => {
    const baseChar = {
      id: 'char_' + Date.now(),
      name: '',
      hp: { current: 8, max: 8, temp: 0 },
      notes: ''
    };

    switch (system) {
      case 'dnd5e':
        return {
          ...baseChar,
          class: '',
          level: 1,
          race: '',
          alignment: '',
          attributes: {
            str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10
          },
          ac: 10,
          speed: 30,
          proficiencyBonus: 2,
          skills: {},
          savingThrows: {},
          attacks: [],
          features: []
        };
      
      case 'generic':
        return {
          ...baseChar,
          customStats: {}
        };
      
      case 'custom':
        return {
          ...baseChar,
          customStats: {},
          systemRules: ''
        };
      
      default:
        return getBlankCharacter('dnd5e');
    }
  };

  const addCustomStat = () => {
    if (!isEditable) return;
    const newStats = { ...char.customStats };
    const newKey = `stat_${Date.now()}`;
    newStats[newKey] = { name: '', value: '' };
    onUpdateCharacter({ ...char, customStats: newStats });
  };

  const updateCustomStat = (key, field, value) => {
    if (!isEditable) return;
    const newStats = { ...char.customStats };
    newStats[key] = { ...newStats[key], [field]: value };
    onUpdateCharacter({ ...char, customStats: newStats });
  };

  const removeCustomStat = (key) => {
    if (!isEditable) return;
    const newStats = { ...char.customStats };
    delete newStats[key];
    onUpdateCharacter({ ...char, customStats: newStats });
  };

  const rollSkill = (skillKey) => {
    const abilityMod = modifiers[skills[skillKey]];
    const profBonus = char.skills[skillKey]?.proficient ? char.proficiencyBonus : 0;
    const totalBonus = abilityMod + profBonus;
    
    onRollDice({
      type: 'skill_check',
      notation: `1d20${totalBonus >= 0 ? '+' : ''}${totalBonus}`,
      skill: skillNames[skillKey],
      character: char.name
    });
  };

  const rollSavingThrow = (saveKey) => {
    const abilityMod = modifiers[saveKey];
    const profBonus = char.savingThrows[saveKey]?.proficient ? char.proficiencyBonus : 0;
    const totalBonus = abilityMod + profBonus;
    
    onRollDice({
      type: 'saving_throw',
      notation: `1d20${totalBonus >= 0 ? '+' : ''}${totalBonus}`,
      save: saveKey.toUpperCase(),
      character: char.name
    });
  };

  const rollAttack = (attack) => {
    onRollDice({
      type: 'attack',
      notation: `1d20${attack.bonus}`,
      attack: attack.name,
      character: char.name
    });
  };

  const rollDamage = (attack) => {
    onRollDice({
      type: 'damage',
      notation: attack.damage,
      attack: attack.name,
      character: char.name
    });
  };

  const getHPPercentage = () => {
    const total = char.hp.max + (char.hp.temp || 0);
    return total > 0 ? (char.hp.current / total) * 100 : 0;
  };

  const getHPColor = (percentage) => {
    if (percentage > 75) return 'var(--color-success)';
    if (percentage > 50) return '#ffd700';
    if (percentage > 25) return '#ff9f43';
    return 'var(--color-accent)';
  };

  if (isCollapsed) {
    return (
      <div style={{
        width: '40px',
        background: 'var(--surface-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--spacing-sm)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--spacing-sm)'
      }}>
        <button
          onClick={onToggleCollapse}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--color-primary)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            transform: 'rotate(90deg)'
          }}
          title="Expand character sheet"
        >
          📋
        </button>
        <div style={{
          writingMode: 'vertical-lr',
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          textAlign: 'center'
        }}>
          {char.name}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      width: '350px',
      background: 'var(--surface-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)',
      height: 'fit-content',
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface-light)',
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ flex: 1 }}>
          {isEditable ? (
            <input
              type="text"
              value={char.name}
              onChange={(e) => onUpdateCharacter({ ...char, name: e.target.value })}
              placeholder="Nome do Personagem"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--color-primary)',
                fontFamily: 'var(--font-fantasy)',
                fontSize: '1.1rem',
                fontWeight: '600',
                width: '100%'
              }}
            />
          ) : (
            <h3 style={{
              margin: 0,
              fontFamily: 'var(--font-fantasy)',
              color: 'var(--color-primary)',
              fontSize: '1.1rem'
            }}>
              📋 {char.name}
            </h3>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
          {isEditable && (
            <button
              onClick={createNewCharacter}
              style={{
                background: 'var(--color-secondary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                padding: '4px 8px',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontWeight: '600'
              }}
              title="Criar nova ficha em branco"
            >
              🆕 Nova Ficha
            </button>
          )}
          <button
            onClick={onToggleCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: 'var(--spacing-xs)'
            }}
            title="Collapse character sheet"
          >
            ◀
          </button>
        </div>
      </div>

      {/* Character Info */}
      <div style={{
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 'var(--spacing-sm)',
          fontSize: '0.8rem'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
            <span style={{ color: 'var(--text-dim)', minWidth: '35px' }}>Classe:</span>
            {isEditable ? (
              <input
                type="text"
                value={char.class}
                onChange={(e) => onUpdateCharacter({ ...char, class: e.target.value })}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 4px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{char.class}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
            <span style={{ color: 'var(--text-dim)', minWidth: '35px' }}>Nível:</span>
            {isEditable ? (
              <input
                type="number"
                min="1"
                max="20"
                value={char.level}
                onChange={(e) => onUpdateCharacter({ ...char, level: parseInt(e.target.value) || 1 })}
                style={{
                  width: '50px',
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 4px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{char.level}</span>
            )}
          </div>
        </div>
        <div style={{ 
          marginTop: 'var(--spacing-sm)', 
          display: 'grid', 
          gridTemplateColumns: '1fr 1fr', 
          gap: 'var(--spacing-sm)',
          fontSize: '0.8rem' 
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
            <span style={{ color: 'var(--text-dim)', minWidth: '35px' }}>Raça:</span>
            {isEditable ? (
              <input
                type="text"
                value={char.race}
                onChange={(e) => onUpdateCharacter({ ...char, race: e.target.value })}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 4px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{char.race}</span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
            <span style={{ color: 'var(--text-dim)', minWidth: '40px' }}>Tendência:</span>
            {isEditable ? (
              <input
                type="text"
                value={char.alignment}
                onChange={(e) => onUpdateCharacter({ ...char, alignment: e.target.value })}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '2px 4px',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
              />
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{char.alignment}</span>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      {system === 'dnd5e' && (
        <div style={{
          display: 'flex',
          background: 'var(--surface-light)',
          borderBottom: '1px solid var(--border-color)'
        }}>
          {[
            { id: 'stats', label: 'Atributos', icon: '⚡' },
            { id: 'skills', label: 'Perícias', icon: '🎯' },
            { id: 'combat', label: 'Combate', icon: '⚔️' },
            { id: 'features', label: 'Traços', icon: '✨' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              style={{
                flex: 1,
                padding: 'var(--spacing-sm)',
                border: 'none',
                background: activeSection === tab.id ? 'var(--color-primary)' : 'transparent',
                color: activeSection === tab.id ? 'var(--bg-primary)' : 'var(--text-dim)',
                fontSize: '0.7rem',
                cursor: 'pointer',
                transition: 'all var(--transition-fast)'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--spacing-md)'
      }}>
        {/* D&D 5e System */}
        {system === 'dnd5e' && (
          <>
            {/* Stats Section */}
            {activeSection === 'stats' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {/* Attributes */}
                <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Atributos
              </h4>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 'var(--spacing-sm)'
              }}>
                {Object.keys(char.attributes).map((attr) => (
                  <div
                    key={attr}
                    style={{
                      background: 'var(--surface-light)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      padding: 'var(--spacing-sm)',
                      textAlign: 'center'
                    }}
                  >
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-dim)',
                      textTransform: 'uppercase',
                      marginBottom: 'var(--spacing-xs)'
                    }}>
                      {attr}
                    </div>
                    {isEditable ? (
                      <input
                        type="number"
                        value={char.attributes[attr]}
                        onChange={(e) => handleAttributeChange(attr, e.target.value)}
                        style={{
                          width: '40px',
                          textAlign: 'center',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-primary)',
                          fontSize: '1.2rem',
                          fontWeight: '600',
                          marginBottom: 'var(--spacing-xs)'
                        }}
                      />
                    ) : (
                      <div style={{
                        fontSize: '1.2rem',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        marginBottom: 'var(--spacing-xs)'
                      }}>
                        {char.attributes[attr]}
                      </div>
                    )}
                    <div style={{
                      fontSize: '0.9rem',
                      color: 'var(--color-primary)',
                      fontWeight: '500'
                    }}>
                      {modifiers[attr] >= 0 ? '+' : ''}{modifiers[attr]}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* HP */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Pontos de Vida
              </h4>
              <div style={{
                background: 'var(--surface-light)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-md)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-sm)'
                }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                    <span>{char.hp.current}/</span>
                    {isEditable ? (
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={char.hp.max}
                        onChange={(e) => onUpdateCharacter({ 
                          ...char, 
                          hp: { ...char.hp, max: parseInt(e.target.value) || 1 }
                        })}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '1.2rem',
                          fontWeight: '600',
                          width: '50px',
                          textAlign: 'center',
                          padding: '2px'
                        }}
                      />
                    ) : (
                      <span>{char.hp.max}</span>
                    )}
                    {char.hp.temp > 0 && (
                      <span style={{ color: 'var(--color-secondary)' }}>
                        {' '}(+{char.hp.temp})
                      </span>
                    )}
                  </div>
                  {isEditable && (
                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                      <button 
                        onClick={() => handleHPChange(-1)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: 'var(--color-accent)', color: 'white',
                          border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                        }}>-</button>
                      <button 
                        onClick={() => handleHPChange(1)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: 'var(--color-success)', color: 'white',
                          border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                        }}>+</button>
                    </div>
                  )}
                </div>
                <div style={{
                  height: '8px',
                  background: 'var(--surface-primary)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${getHPPercentage()}%`,
                    background: getHPColor(getHPPercentage()),
                    transition: 'all var(--transition-normal)'
                  }} />
                </div>
              </div>
            </div>

            {/* Other Stats */}
            <div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 'var(--spacing-sm)'
              }}>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-sm)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>CA</div>
                  {isEditable ? (
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={char.ac}
                      onChange={(e) => onUpdateCharacter({ ...char, ac: parseInt(e.target.value) || 10 })}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-primary)',
                        fontSize: '1.2rem',
                        fontWeight: '600',
                        textAlign: 'center',
                        width: '100%'
                      }}
                    />
                  ) : (
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {char.ac}
                    </div>
                  )}
                </div>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-sm)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Velocidade</div>
                  {isEditable ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                      <input
                        type="number"
                        min="0"
                        max="120"
                        step="5"
                        value={char.speed}
                        onChange={(e) => onUpdateCharacter({ ...char, speed: parseInt(e.target.value) || 30 })}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-primary)',
                          fontSize: '1.2rem',
                          fontWeight: '600',
                          textAlign: 'center',
                          width: '60px'
                        }}
                      />
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>pés</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                      {char.speed} pés
                    </div>
                  )}
                </div>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-sm)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Iniciativa</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                    +{modifiers.dex}
                  </div>
                </div>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-sm)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Proficiência</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                    +{char.proficiencyBonus}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Skills Section */}
        {activeSection === 'skills' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {/* Saving Throws */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Salvaguardas
              </h4>
              {Object.keys(char.attributes).map((save) => {
                const mod = modifiers[save];
                const profBonus = char.savingThrows[save]?.proficient ? char.proficiencyBonus : 0;
                const total = mod + profBonus;
                
                return (
                  <div
                    key={save}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-sm)',
                      padding: 'var(--spacing-sm)',
                      borderBottom: '1px solid var(--border-color)',
                      fontSize: '0.85rem'
                    }}
                  >
                    {isEditable && (
                      <input
                        type="checkbox"
                        checked={char.savingThrows[save]?.proficient || false}
                        onChange={() => handleSavingThrowToggle(save)}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                    )}
                    <div style={{ flex: 1, textTransform: 'capitalize' }}>{save}</div>
                    <div style={{ 
                      fontWeight: '600',
                      color: char.savingThrows[save]?.proficient ? 'var(--color-primary)' : 'var(--text-primary)'
                    }}>
                      {total >= 0 ? '+' : ''}{total}
                    </div>
                    <button
                      onClick={() => rollSavingThrow(save)}
                      style={{
                        background: 'var(--color-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                    >
                      🎲
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Skills */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Perícias
              </h4>
              {Object.keys(skills).map((skill) => {
                const abilityMod = modifiers[skills[skill]];
                const profBonus = char.skills[skill]?.proficient ? char.proficiencyBonus : 0;
                const total = abilityMod + profBonus;
                
                return (
                  <div
                    key={skill}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--spacing-sm)',
                      padding: 'var(--spacing-sm)',
                      borderBottom: '1px solid var(--border-color)',
                      fontSize: '0.85rem'
                    }}
                  >
                    {isEditable && (
                      <input
                        type="checkbox"
                        checked={char.skills[skill]?.proficient || false}
                        onChange={() => handleSkillProficiencyToggle(skill)}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      {skillNames[skill]}
                      <span style={{ 
                        color: 'var(--text-dim)', 
                        fontSize: '0.7rem',
                        marginLeft: 'var(--spacing-xs)'
                      }}>
                        ({skills[skill].toUpperCase()})
                      </span>
                    </div>
                    <div style={{ 
                      fontWeight: '600',
                      color: char.skills[skill]?.proficient ? 'var(--color-primary)' : 'var(--text-primary)'
                    }}>
                      {total >= 0 ? '+' : ''}{total}
                    </div>
                    <button
                      onClick={() => rollSkill(skill)}
                      style={{
                        background: 'var(--color-primary)',
                        color: 'var(--bg-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        padding: '2px 6px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                    >
                      🎲
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Combat Section */}
        {activeSection === 'combat' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <h4 style={{
              margin: 0,
              fontFamily: 'var(--font-fantasy)',
              color: 'var(--color-primary)',
              fontSize: '0.9rem'
            }}>
              Ataques
            </h4>
            {char.attacks.map((attack, index) => (
              <div
                key={index}
                style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-md)'
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-sm)'
                }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{attack.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{attack.type}</div>
                </div>
                <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
                  <button
                    onClick={() => rollAttack(attack)}
                    style={{
                      flex: 1,
                      padding: 'var(--spacing-sm)',
                      background: 'var(--color-accent)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    🎯 Attack {attack.bonus}
                  </button>
                  <button
                    onClick={() => rollDamage(attack)}
                    style={{
                      flex: 1,
                      padding: 'var(--spacing-sm)',
                      background: '#ff9f43',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    💥 Damage {attack.damage}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Features Section */}
        {activeSection === 'features' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Traços e Características
              </h4>
              {char.features.map((feature, index) => (
                <div
                  key={index}
                  style={{
                    padding: 'var(--spacing-sm)',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--spacing-sm)',
                    fontSize: '0.8rem'
                  }}
                >
                  {feature}
                </div>
              ))}
            </div>
            
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Anotações
              </h4>
              {isEditable ? (
                <textarea
                  value={char.notes}
                  onChange={(e) => onUpdateCharacter({ ...char, notes: e.target.value })}
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: 'var(--spacing-sm)',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <div style={{
                  padding: 'var(--spacing-sm)',
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap'
                }}>
                  {char.notes}
                </div>
              )}
            </div>
          </div>
        )}
        </>
        )}

        {/* Generic System */}
        {(system === 'generic' || system === 'custom') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
            {/* HP */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Pontos de Vida
              </h4>
              <div style={{
                background: 'var(--surface-light)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-md)'
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 'var(--spacing-sm)'
                }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                    <span>{char.hp.current}/</span>
                    {isEditable ? (
                      <input
                        type="number"
                        min="1"
                        max="999"
                        value={char.hp.max}
                        onChange={(e) => onUpdateCharacter({ 
                          ...char, 
                          hp: { ...char.hp, max: parseInt(e.target.value) || 1 }
                        })}
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-primary)',
                          fontSize: '1.2rem',
                          fontWeight: '600',
                          width: '50px',
                          textAlign: 'center',
                          padding: '2px'
                        }}
                      />
                    ) : (
                      <span>{char.hp.max}</span>
                    )}
                  </div>
                  {isEditable && (
                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                      <button 
                        onClick={() => handleHPChange(-1)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: 'var(--color-accent)', color: 'white',
                          border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                        }}>-</button>
                      <button 
                        onClick={() => handleHPChange(1)}
                        style={{
                          width: '24px', height: '24px', borderRadius: '50%',
                          background: 'var(--color-success)', color: 'white',
                          border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                        }}>+</button>
                    </div>
                  )}
                </div>
                <div style={{
                  height: '8px',
                  background: 'var(--surface-primary)',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${getHPPercentage()}%`,
                    background: getHPColor(getHPPercentage()),
                    transition: 'all var(--transition-normal)'
                  }} />
                </div>
              </div>
            </div>

            {/* Custom Stats */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--spacing-sm)' }}>
                <h4 style={{
                  margin: 0,
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '0.9rem'
                }}>
                  Atributos Customizados
                </h4>
                {isEditable && (
                  <button
                    onClick={addCustomStat}
                    style={{
                      background: 'var(--color-success)',
                      color: 'white',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: '0.7rem'
                    }}
                  >
                    + Adicionar
                  </button>
                )}
              </div>

              {char.customStats && Object.keys(char.customStats).length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  {Object.entries(char.customStats).map(([key, stat]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-sm)',
                        padding: 'var(--spacing-sm)',
                        background: 'var(--surface-light)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)'
                      }}
                    >
                      {isEditable ? (
                        <>
                          <input
                            type="text"
                            placeholder="Nome do atributo"
                            value={stat.name}
                            onChange={(e) => updateCustomStat(key, 'name', e.target.value)}
                            style={{
                              flex: 1,
                              background: 'transparent',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '4px 8px',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem'
                            }}
                          />
                          <input
                            type="text"
                            placeholder="Valor"
                            value={stat.value}
                            onChange={(e) => updateCustomStat(key, 'value', e.target.value)}
                            style={{
                              width: '80px',
                              background: 'transparent',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              padding: '4px 8px',
                              color: 'var(--text-primary)',
                              fontSize: '0.8rem',
                              textAlign: 'center'
                            }}
                          />
                          <button
                            onClick={() => removeCustomStat(key)}
                            style={{
                              background: 'var(--color-accent)',
                              color: 'white',
                              border: 'none',
                              borderRadius: 'var(--radius-sm)',
                              padding: '4px 6px',
                              cursor: 'pointer',
                              fontSize: '0.7rem'
                            }}
                          >
                            🗑️
                          </button>
                        </>
                      ) : (
                        <>
                          <div style={{ flex: 1, fontWeight: '600' }}>{stat.name}</div>
                          <div style={{ fontWeight: '600', textAlign: 'center', minWidth: '80px' }}>
                            {stat.value}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{
                  padding: 'var(--spacing-md)',
                  textAlign: 'center',
                  color: 'var(--text-dim)',
                  fontStyle: 'italic'
                }}>
                  Nenhum atributo personalizado adicionado
                </div>
              )}
            </div>

            {/* Free-form Dice Roller */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Rolagem de Dados
              </h4>
              <div style={{
                display: 'flex',
                gap: 'var(--spacing-sm)',
                flexWrap: 'wrap'
              }}>
                {['1d4', '1d6', '1d8', '1d10', '1d12', '1d20', '2d6', '3d6'].map((dice) => (
                  <button
                    key={dice}
                    onClick={() => onRollDice({ notation: dice })}
                    style={{
                      padding: 'var(--spacing-sm)',
                      background: 'var(--color-primary)',
                      color: 'var(--bg-primary)',
                      border: 'none',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: '600'
                    }}
                  >
                    🎲 {dice}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom System Rules (only for custom system) */}
            {system === 'custom' && (
              <div>
                <h4 style={{
                  margin: '0 0 var(--spacing-sm) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '0.9rem'
                }}>
                  Regras do Sistema
                </h4>
                {isEditable ? (
                  <textarea
                    value={char.systemRules || ''}
                    onChange={(e) => onUpdateCharacter({ ...char, systemRules: e.target.value })}
                    placeholder="Descreva as regras especiais deste sistema..."
                    style={{
                      width: '100%',
                      minHeight: '100px',
                      padding: 'var(--spacing-sm)',
                      background: 'var(--surface-light)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: '0.8rem',
                      resize: 'vertical'
                    }}
                  />
                ) : (
                  <div style={{
                    padding: 'var(--spacing-sm)',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8rem',
                    whiteSpace: 'pre-wrap',
                    minHeight: '60px'
                  }}>
                    {char.systemRules || 'Nenhuma regra especial definida.'}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                Anotações
              </h4>
              {isEditable ? (
                <textarea
                  value={char.notes || ''}
                  onChange={(e) => onUpdateCharacter({ ...char, notes: e.target.value })}
                  placeholder="Suas anotações do personagem..."
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: 'var(--spacing-sm)',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    resize: 'vertical'
                  }}
                />
              ) : (
                <div style={{
                  padding: 'var(--spacing-sm)',
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  whiteSpace: 'pre-wrap',
                  minHeight: '60px'
                }}>
                  {char.notes || 'Nenhuma anotação.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom System (with System Data) */}
        {system === 'custom' && systemData && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
            {/* System Info */}
            <div style={{
              background: 'var(--surface-light)',
              border: '1px solid rgba(226, 183, 20, 0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--spacing-lg)',
              textAlign: 'center'
            }}>
              <h3 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '1.2rem'
              }}>
                📖 {systemData.systemName || 'Sistema Customizado'}
              </h3>
              {systemData.description && (
                <p style={{
                  color: 'var(--text-dim)',
                  fontSize: '0.9rem',
                  margin: 0,
                  lineHeight: 1.5
                }}>
                  {systemData.description}
                </p>
              )}
            </div>

            {/* Character Info */}
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
              {/* Character Basic Info */}
              <div style={{ flex: 1, minWidth: '250px' }}>
                <h4 style={{
                  margin: '0 0 var(--spacing-sm) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '0.9rem'
                }}>
                  Informações Básicas
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                  {systemData.races && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                      <span style={{ color: 'var(--text-dim)', minWidth: '40px' }}>Raça:</span>
                      {isEditable ? (
                        <select
                          value={char.race || ''}
                          onChange={(e) => {
                            const selectedRace = systemData.races.find(r => r.name === e.target.value);
                            const newChar = { ...char, race: e.target.value };
                            // Apply race stat modifiers
                            if (selectedRace?.statModifiers) {
                              Object.keys(selectedRace.statModifiers).forEach(stat => {
                                if (newChar.customStats[stat] !== undefined) {
                                  newChar.customStats[stat] = (newChar.customStats[stat] || 10) + selectedRace.statModifiers[stat];
                                }
                              });
                            }
                            onUpdateCharacter(newChar);
                          }}
                          style={{
                            flex: 1,
                            background: 'var(--surface-light)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.8rem'
                          }}
                        >
                          <option value="">Selecionar raça...</option>
                          {systemData.races.map(race => (
                            <option key={race.name} value={race.name}>{race.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color: 'var(--text-primary)' }}>
                          {char.race || 'Não selecionada'}
                        </span>
                      )}
                    </div>
                  )}

                  {systemData.classes && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                      <span style={{ color: 'var(--text-dim)', minWidth: '40px' }}>Classe:</span>
                      {isEditable ? (
                        <select
                          value={char.class || ''}
                          onChange={(e) => onUpdateCharacter({ ...char, class: e.target.value })}
                          style={{
                            flex: 1,
                            background: 'var(--surface-light)',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 8px',
                            color: 'var(--text-primary)',
                            fontSize: '0.8rem'
                          }}
                        >
                          <option value="">Selecionar classe...</option>
                          {systemData.classes.map(cls => (
                            <option key={cls.name} value={cls.name}>{cls.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ color: 'var(--text-primary)' }}>
                          {char.class || 'Não selecionada'}
                        </span>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    <span style={{ color: 'var(--text-dim)', minWidth: '40px' }}>Nível:</span>
                    {isEditable ? (
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={char.level || 1}
                        onChange={(e) => onUpdateCharacter({ ...char, level: parseInt(e.target.value) || 1 })}
                        style={{
                          width: '60px',
                          background: 'var(--surface-light)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '4px 8px',
                          color: 'var(--text-primary)',
                          fontSize: '0.8rem',
                          textAlign: 'center'
                        }}
                      />
                    ) : (
                      <span style={{ color: 'var(--text-primary)' }}>
                        {char.level || 1}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* HP */}
              <div style={{ flex: 1, minWidth: '200px' }}>
                <h4 style={{
                  margin: '0 0 var(--spacing-sm) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '0.9rem'
                }}>
                  Pontos de Vida
                </h4>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-md)'
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 'var(--spacing-sm)'
                  }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', display: 'flex', alignItems: 'center', gap: 'var(--spacing-xs)' }}>
                      <span>{char.hp.current}/</span>
                      {isEditable ? (
                        <input
                          type="number"
                          min="1"
                          max="999"
                          value={char.hp.max}
                          onChange={(e) => onUpdateCharacter({ 
                            ...char, 
                            hp: { ...char.hp, max: parseInt(e.target.value) || 1 }
                          })}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-primary)',
                            fontSize: '1.2rem',
                            fontWeight: '600',
                            width: '50px',
                            textAlign: 'center',
                            padding: '2px'
                          }}
                        />
                      ) : (
                        <span>{char.hp.max}</span>
                      )}
                    </div>
                    {isEditable && (
                      <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                        <button 
                          onClick={() => onUpdateCharacter({ 
                            ...char, 
                            hp: { ...char.hp, current: Math.max(0, char.hp.current - 1) }
                          })}
                          style={{
                            width: '24px', height: '24px', borderRadius: '50%',
                            background: 'var(--color-accent)', color: 'white',
                            border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                          }}>-</button>
                        <button 
                          onClick={() => onUpdateCharacter({ 
                            ...char, 
                            hp: { ...char.hp, current: Math.min(char.hp.max, char.hp.current + 1) }
                          })}
                          style={{
                            width: '24px', height: '24px', borderRadius: '50%',
                            background: 'var(--color-success)', color: 'white',
                            border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                          }}>+</button>
                      </div>
                    )}
                  </div>
                  <div style={{
                    height: '8px',
                    background: 'var(--surface-primary)',
                    borderRadius: '4px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${Math.max(0, Math.min(100, (char.hp.current / char.hp.max) * 100))}%`,
                      background: char.hp.current > char.hp.max * 0.5 ? 'var(--color-success)' : 
                                 char.hp.current > char.hp.max * 0.25 ? '#ffa726' : 'var(--color-accent)',
                      transition: 'all var(--transition-normal)'
                    }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Custom System Stats */}
            {systemData.stats && (
              <div>
                <h4 style={{
                  margin: '0 0 var(--spacing-md) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '1rem'
                }}>
                  ⚡ Atributos do Sistema
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                  gap: 'var(--spacing-md)'
                }}>
                  {systemData.stats.map((stat) => (
                    <div
                      key={stat.key}
                      style={{
                        background: 'var(--surface-light)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--spacing-md)',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-dim)',
                        marginBottom: 'var(--spacing-xs)',
                        fontWeight: '600'
                      }}>
                        {stat.name || stat.key.toUpperCase()}
                      </div>
                      {isEditable ? (
                        <input
                          type="number"
                          value={char.customStats?.[stat.key] || 10}
                          onChange={(e) => {
                            const newStats = { ...char.customStats };
                            newStats[stat.key] = parseInt(e.target.value) || 10;
                            onUpdateCharacter({ ...char, customStats: newStats });
                          }}
                          style={{
                            width: '50px',
                            textAlign: 'center',
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-primary)',
                            fontSize: '1.5rem',
                            fontWeight: '700',
                            marginBottom: 'var(--spacing-xs)'
                          }}
                        />
                      ) : (
                        <div style={{
                          fontSize: '1.5rem',
                          fontWeight: '700',
                          color: 'var(--text-primary)',
                          marginBottom: 'var(--spacing-xs)'
                        }}>
                          {char.customStats?.[stat.key] || 10}
                        </div>
                      )}
                      <div style={{
                        fontSize: '1rem',
                        color: 'var(--color-primary)',
                        fontWeight: '600'
                      }}>
                        {modifiers[stat.key] >= 0 ? '+' : ''}{modifiers[stat.key] || 0}
                      </div>
                      <button
                        onClick={() => onRollDice({ 
                          notation: `1d20${modifiers[stat.key] >= 0 ? '+' : ''}${modifiers[stat.key] || 0}`,
                          type: 'stat_check',
                          stat: stat.name || stat.key
                        })}
                        style={{
                          marginTop: 'var(--spacing-sm)',
                          padding: '4px 8px',
                          background: 'var(--color-primary)',
                          color: 'var(--bg-primary)',
                          border: 'none',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontSize: '0.7rem',
                          fontWeight: '600'
                        }}
                      >
                        🎲 Teste
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Skills */}
            {systemData.skills && systemData.skills.length > 0 && (
              <div>
                <h4 style={{
                  margin: '0 0 var(--spacing-md) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '1rem'
                }}>
                  🎯 Perícias do Sistema
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--spacing-sm)'
                }}>
                  {systemData.skills.map((skill, index) => {
                    const linkedStatMod = modifiers[skill.linkedStat] || 0;
                    return (
                      <div
                        key={index}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: 'var(--spacing-sm)',
                          background: 'var(--surface-light)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '0.8rem' }}>{skill.name}</div>
                          <div style={{ 
                            color: 'var(--text-dim)', 
                            fontSize: '0.7rem' 
                          }}>
                            ({skill.linkedStat?.toUpperCase()})
                          </div>
                        </div>
                        <div style={{ 
                          fontWeight: '600',
                          color: 'var(--text-primary)',
                          marginRight: 'var(--spacing-sm)',
                          minWidth: '30px',
                          textAlign: 'center'
                        }}>
                          {linkedStatMod >= 0 ? '+' : ''}{linkedStatMod}
                        </div>
                        <button
                          onClick={() => onRollDice({
                            notation: `1d20${linkedStatMod >= 0 ? '+' : ''}${linkedStatMod}`,
                            type: 'skill_check',
                            skill: skill.name
                          })}
                          style={{
                            background: 'var(--color-primary)',
                            color: 'var(--bg-primary)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            padding: '4px 8px',
                            cursor: 'pointer',
                            fontSize: '0.7rem'
                          }}
                        >
                          🎲
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Equipment */}
            {systemData.equipment && systemData.equipment.length > 0 && (
              <div>
                <h4 style={{
                  margin: '0 0 var(--spacing-md) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '1rem'
                }}>
                  ⚔️ Equipamentos Disponíveis
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                  gap: 'var(--spacing-md)'
                }}>
                  {systemData.equipment.slice(0, 12).map((item, index) => (
                    <div
                      key={index}
                      style={{
                        background: 'var(--surface-light)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--spacing-md)'
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: 'var(--spacing-sm)'
                      }}>
                        <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{item.name}</div>
                        <span style={{ 
                          fontSize: '0.7rem', 
                          color: 'var(--text-dim)',
                          textTransform: 'capitalize',
                          background: 'var(--surface-primary)',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)'
                        }}>
                          {item.type}
                        </span>
                      </div>
                      <p style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-dim)',
                        margin: '0 0 var(--spacing-sm) 0',
                        lineHeight: 1.4
                      }}>
                        {item.description}
                      </p>
                      {item.damage && (
                        <div style={{
                          display: 'flex',
                          gap: 'var(--spacing-sm)',
                          marginTop: 'var(--spacing-sm)'
                        }}>
                          <button
                            onClick={() => onRollDice({
                              notation: item.damage,
                              type: 'damage',
                              weapon: item.name
                            })}
                            style={{
                              flex: 1,
                              padding: 'var(--spacing-sm)',
                              background: '#ff9f43',
                              color: 'white',
                              border: 'none',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >
                            💥 {item.damage}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Custom Mechanics */}
            {systemData.customMechanics && systemData.customMechanics.length > 0 && (
              <div>
                <h4 style={{
                  margin: '0 0 var(--spacing-md) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '1rem'
                }}>
                  ⚙️ Mecânicas Especiais
                </h4>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: 'var(--spacing-md)'
                }}>
                  {systemData.customMechanics.map((mechanic, index) => (
                    <div
                      key={index}
                      style={{
                        background: 'var(--surface-light)',
                        border: '1px solid var(--border-color)',
                        borderRadius: 'var(--radius-md)',
                        padding: 'var(--spacing-md)',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{
                        fontWeight: '600',
                        fontSize: '0.9rem',
                        marginBottom: 'var(--spacing-sm)',
                        color: 'var(--text-primary)'
                      }}>
                        {mechanic.name}
                      </div>
                      <p style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-dim)',
                        margin: '0 0 var(--spacing-md) 0',
                        lineHeight: 1.4
                      }}>
                        {mechanic.description}
                      </p>
                      {mechanic.diceFormula && (
                        <button
                          onClick={() => onRollDice({
                            notation: mechanic.diceFormula,
                            type: 'custom_mechanic',
                            mechanic: mechanic.name
                          })}
                          style={{
                            padding: 'var(--spacing-sm) var(--spacing-md)',
                            background: 'var(--color-secondary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: '600'
                          }}
                        >
                          🎲 {mechanic.diceFormula}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rules Reference */}
            {systemData.rules && systemData.rules.length > 0 && (
              <div>
                <h4 style={{
                  margin: '0 0 var(--spacing-md) 0',
                  fontFamily: 'var(--font-fantasy)',
                  color: 'var(--color-primary)',
                  fontSize: '1rem'
                }}>
                  📋 Regras do Sistema
                </h4>
                <details style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--spacing-md)'
                }}>
                  <summary style={{
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: '600',
                    color: 'var(--color-primary)',
                    marginBottom: 'var(--spacing-sm)'
                  }}>
                    Ver Regras ({systemData.rules.length} regras)
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                    {systemData.rules.map((rule, index) => (
                      <div
                        key={index}
                        style={{
                          background: 'var(--surface-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-md)',
                          padding: 'var(--spacing-md)'
                        }}
                      >
                        <h5 style={{
                          margin: '0 0 var(--spacing-sm) 0',
                          color: 'var(--color-primary)',
                          fontSize: '0.9rem'
                        }}>
                          {rule.name}
                        </h5>
                        <p style={{
                          fontSize: '0.8rem',
                          color: 'var(--text-dim)',
                          margin: 0,
                          lineHeight: 1.5,
                          whiteSpace: 'pre-wrap'
                        }}>
                          {rule.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* Notes */}
            <div>
              <h4 style={{
                margin: '0 0 var(--spacing-sm) 0',
                fontFamily: 'var(--font-fantasy)',
                color: 'var(--color-primary)',
                fontSize: '0.9rem'
              }}>
                📝 Anotações do Personagem
              </h4>
              {isEditable ? (
                <textarea
                  value={char.notes || ''}
                  onChange={(e) => onUpdateCharacter({ ...char, notes: e.target.value })}
                  placeholder="Suas anotações sobre o personagem..."
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: 'var(--spacing-md)',
                    background: 'var(--surface-light)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--text-primary)',
                    fontSize: '0.9rem',
                    resize: 'vertical',
                    lineHeight: 1.6
                  }}
                />
              ) : (
                <div style={{
                  padding: 'var(--spacing-md)',
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-lg)',
                  fontSize: '0.9rem',
                  whiteSpace: 'pre-wrap',
                  minHeight: '100px',
                  lineHeight: 1.6
                }}>
                  {char.notes || 'Nenhuma anotação registrada.'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CharSheet;