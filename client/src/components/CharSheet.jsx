import React, { useState, useMemo } from 'react';

const CharSheet = ({ 
  character = null,
  isEditable = false,
  isCollapsed = false,
  onToggleCollapse = () => {},
  onUpdateCharacter = () => {},
  onRollDice = () => {}
}) => {
  const [activeSection, setActiveSection] = useState('stats');

  // Default character template
  const defaultCharacter = {
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

  const char = character || defaultCharacter;

  // Calculate ability modifiers
  const getModifier = (score) => Math.floor((score - 10) / 2);

  const modifiers = useMemo(() => {
    const mods = {};
    Object.keys(char.attributes).forEach(attr => {
      mods[attr] = getModifier(char.attributes[attr]);
    });
    return mods;
  }, [char.attributes]);

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
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Class:</span>
            <span style={{ marginLeft: 'var(--spacing-xs)', color: 'var(--text-primary)' }}>
              {char.class} {char.level}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--text-dim)' }}>Race:</span>
            <span style={{ marginLeft: 'var(--spacing-xs)', color: 'var(--text-primary)' }}>
              {char.race}
            </span>
          </div>
        </div>
        <div style={{ marginTop: 'var(--spacing-xs)', fontSize: '0.8rem' }}>
          <span style={{ color: 'var(--text-dim)' }}>Alignment:</span>
          <span style={{ marginLeft: 'var(--spacing-xs)', color: 'var(--text-primary)' }}>
            {char.alignment}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
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

      {/* Content Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: 'var(--spacing-md)'
      }}>
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
                  <div style={{ fontSize: '1.2rem', fontWeight: '600' }}>
                    {char.hp.current}/{char.hp.max}
                    {char.hp.temp > 0 && (
                      <span style={{ color: 'var(--color-secondary)' }}>
                        {' '}(+{char.hp.temp})
                      </span>
                    )}
                  </div>
                  {isEditable && (
                    <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
                      <button style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: 'var(--color-accent)', color: 'white',
                        border: 'none', cursor: 'pointer', fontSize: '0.8rem'
                      }}>-</button>
                      <button style={{
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
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>AC</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {char.ac}
                  </div>
                </div>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-sm)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Speed</div>
                  <div style={{ fontSize: '1.2rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                    {char.speed}ft
                  </div>
                </div>
                <div style={{
                  background: 'var(--surface-light)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--spacing-sm)',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Initiative</div>
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
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Proficiency</div>
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
      </div>
    </div>
  );
};

export default CharSheet;