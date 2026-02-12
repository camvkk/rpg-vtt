import React, { useState } from 'react';

const Initiative = ({ 
  combatants = [], 
  currentTurn = 0,
  isInCombat = false,
  isDM = false,
  onNextTurn = () => {},
  onRollInitiative = () => {},
  onAddCombatant = () => {},
  onRemoveCombatant = () => {},
  onUpdateCombatant = () => {},
  onStartCombat = () => {},
  onEndCombat = () => {}
}) => {
  const [newCombatantName, setNewCombatantName] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  // Available conditions with icons
  const conditions = [
    { id: 'blinded', name: 'Blinded', icon: '👁️', color: '#666' },
    { id: 'charmed', name: 'Charmed', icon: '💝', color: '#ff69b4' },
    { id: 'deafened', name: 'Deafened', icon: '🔇', color: '#8b4513' },
    { id: 'frightened', name: 'Frightened', icon: '😨', color: '#800080' },
    { id: 'grappled', name: 'Grappled', icon: '🤝', color: '#cd853f' },
    { id: 'incapacitated', name: 'Incapacitated', icon: '💤', color: '#708090' },
    { id: 'invisible', name: 'Invisible', icon: '👻', color: '#d3d3d3' },
    { id: 'paralyzed', name: 'Paralyzed', icon: '⚡', color: '#ffd700' },
    { id: 'petrified', name: 'Petrified', icon: '🗿', color: '#696969' },
    { id: 'poisoned', name: 'Poisoned', icon: '🟢', color: '#32cd32' },
    { id: 'prone', name: 'Prone', icon: '🔽', color: '#ff4500' },
    { id: 'restrained', name: 'Restrained', icon: '⛓️', color: '#2f4f4f' },
    { id: 'stunned', name: 'Stunned', icon: '💫', color: '#ffa500' },
    { id: 'unconscious', name: 'Unconscious', icon: '💀', color: '#8b0000' }
  ];

  const handleAddCombatant = () => {
    if (!newCombatantName.trim()) return;

    const newCombatant = {
      id: Date.now(),
      name: newCombatantName.trim(),
      initiative: 10,
      hp: { current: 100, max: 100, temp: 0 },
      ac: 15,
      conditions: [],
      isNPC: true
    };

    onAddCombatant(newCombatant);
    setNewCombatantName('');
    setShowAddForm(false);
  };

  const handleRemoveCombatant = (combatantId) => {
    if (confirm('Remove this combatant from initiative?')) {
      onRemoveCombatant(combatantId);
    }
  };

  const handleInitiativeChange = (combatantId, newInitiative) => {
    const value = parseInt(newInitiative) || 0;
    onUpdateCombatant(combatantId, { initiative: Math.max(0, Math.min(30, value)) });
  };

  const handleHPChange = (combatantId, change) => {
    const combatant = combatants.find(c => c.id === combatantId);
    if (!combatant) return;

    const newHP = Math.max(0, Math.min(
      combatant.hp.max + (combatant.hp.temp || 0),
      combatant.hp.current + change
    ));

    onUpdateCombatant(combatantId, { 
      hp: { ...combatant.hp, current: newHP }
    });
  };

  const handleConditionToggle = (combatantId, conditionId) => {
    const combatant = combatants.find(c => c.id === combatantId);
    if (!combatant) return;

    const hasCondition = combatant.conditions.includes(conditionId);
    const newConditions = hasCondition
      ? combatant.conditions.filter(id => id !== conditionId)
      : [...combatant.conditions, conditionId];

    onUpdateCombatant(combatantId, { conditions: newConditions });
  };

  const getHPPercentage = (hp) => {
    const total = hp.max + (hp.temp || 0);
    return total > 0 ? (hp.current / total) * 100 : 0;
  };

  const getHPColor = (percentage) => {
    if (percentage > 75) return 'var(--color-success)';
    if (percentage > 50) return '#ffd700';
    if (percentage > 25) return '#ff9f43';
    return 'var(--color-accent)';
  };

  const sortedCombatants = [...combatants].sort((a, b) => b.initiative - a.initiative);

  return (
    <div style={{
      background: 'var(--surface-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-md)'
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
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-fantasy)',
          color: 'var(--color-primary)',
          fontSize: '1.1rem'
        }}>
          ⚔️ Initiative
        </h3>
        {isInCombat && (
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--color-accent)',
            fontWeight: '600'
          }}>
            Round {Math.floor(currentTurn / combatants.length) + 1}
          </div>
        )}
      </div>

      {/* Combat Controls */}
      {isDM && (
        <div style={{
          padding: 'var(--spacing-md)',
          borderBottom: '1px solid var(--border-color)',
          background: 'var(--surface-light)'
        }}>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexWrap: 'wrap' }}>
            {!isInCombat ? (
              <>
                <button
                  onClick={onRollInitiative}
                  disabled={combatants.length === 0}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary)',
                    color: 'var(--bg-primary)',
                    fontWeight: '600',
                    cursor: combatants.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: combatants.length === 0 ? 0.6 : 1,
                    fontSize: '0.8rem'
                  }}
                >
                  🎲 Roll Initiative
                </button>
                <button
                  onClick={onStartCombat}
                  disabled={combatants.length === 0}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    border: '1px solid var(--color-accent)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-accent)',
                    color: 'white',
                    fontWeight: '600',
                    cursor: combatants.length === 0 ? 'not-allowed' : 'pointer',
                    opacity: combatants.length === 0 ? 0.6 : 1,
                    fontSize: '0.8rem'
                  }}
                >
                  ⚔️ Start Combat
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onNextTurn}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    border: '1px solid var(--color-primary)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary)',
                    color: 'var(--bg-primary)',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  ➡️ Next Turn
                </button>
                <button
                  onClick={onEndCombat}
                  style={{
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    border: '1px solid var(--color-success)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-success)',
                    color: 'white',
                    fontWeight: '600',
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  🏆 End Combat
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Combatants List */}
      <div style={{
        maxHeight: '400px',
        overflowY: 'auto',
        padding: combatants.length === 0 ? 'var(--spacing-lg)' : 0
      }}>
        {combatants.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontStyle: 'italic'
          }}>
            No combatants yet. Add characters to start initiative tracking.
          </div>
        ) : (
          sortedCombatants.map((combatant, index) => {
            const isCurrentTurn = isInCombat && index === currentTurn % sortedCombatants.length;
            const hpPercentage = getHPPercentage(combatant.hp);
            
            return (
              <div
                key={combatant.id}
                style={{
                  padding: 'var(--spacing-md)',
                  borderBottom: '1px solid var(--border-color)',
                  background: isCurrentTurn ? 'rgba(226, 183, 20, 0.1)' : 'transparent',
                  border: isCurrentTurn ? '2px solid var(--color-primary)' : '2px solid transparent',
                  animation: isCurrentTurn ? 'pulse 2s infinite' : 'none'
                }}
              >
                {/* Combatant Header */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 'var(--spacing-sm)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                    {/* Initiative */}
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: isCurrentTurn ? 'var(--color-primary)' : 'var(--surface-light)',
                      color: isCurrentTurn ? 'var(--bg-primary)' : 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: '700',
                      fontSize: '1rem',
                      border: '2px solid var(--border-color)'
                    }}>
                      {isDM ? (
                        <input
                          type="number"
                          value={combatant.initiative}
                          onChange={(e) => handleInitiativeChange(combatant.id, e.target.value)}
                          style={{
                            width: '30px',
                            height: '30px',
                            textAlign: 'center',
                            background: 'transparent',
                            border: 'none',
                            color: 'inherit',
                            fontSize: '0.8rem',
                            fontWeight: '700'
                          }}
                        />
                      ) : (
                        combatant.initiative
                      )}
                    </div>

                    {/* Name and AC */}
                    <div>
                      <div style={{
                        fontWeight: '600',
                        color: isCurrentTurn ? 'var(--color-primary)' : 'var(--text-primary)',
                        fontSize: '0.9rem'
                      }}>
                        {combatant.name}
                      </div>
                      <div style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-dim)'
                      }}>
                        AC {combatant.ac}
                      </div>
                    </div>
                  </div>

                  {/* Remove button (DM only) */}
                  {isDM && (
                    <button
                      onClick={() => handleRemoveCombatant(combatant.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-accent)',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        padding: 'var(--spacing-xs)'
                      }}
                      title="Remove combatant"
                    >
                      ❌
                    </button>
                  )}
                </div>

                {/* HP Bar */}
                <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    marginBottom: 'var(--spacing-xs)'
                  }}>
                    <span style={{ color: 'var(--text-dim)' }}>HP</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
                      {isDM && (
                        <>
                          <button
                            onClick={() => handleHPChange(combatant.id, -5)}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: 'var(--color-accent)',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            -
                          </button>
                          <button
                            onClick={() => handleHPChange(combatant.id, 5)}
                            style={{
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              background: 'var(--color-success)',
                              color: 'white',
                              border: 'none',
                              cursor: 'pointer',
                              fontSize: '0.7rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            +
                          </button>
                        </>
                      )}
                      <span style={{ color: 'var(--text-primary)', fontWeight: '600' }}>
                        {combatant.hp.current}/{combatant.hp.max}
                        {combatant.hp.temp > 0 && ` (+${combatant.hp.temp})`}
                      </span>
                    </div>
                  </div>
                  <div style={{
                    height: '6px',
                    background: 'var(--surface-light)',
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${hpPercentage}%`,
                      background: getHPColor(hpPercentage),
                      transition: 'all var(--transition-normal)'
                    }} />
                  </div>
                </div>

                {/* Conditions */}
                {isDM && (
                  <div>
                    <div style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-dim)',
                      marginBottom: 'var(--spacing-xs)'
                    }}>
                      Conditions:
                    </div>
                    <div style={{
                      display: 'flex',
                      gap: 'var(--spacing-xs)',
                      flexWrap: 'wrap'
                    }}>
                      {conditions.map((condition) => {
                        const isActive = combatant.conditions.includes(condition.id);
                        return (
                          <button
                            key={condition.id}
                            onClick={() => handleConditionToggle(combatant.id, condition.id)}
                            title={condition.name}
                            style={{
                              width: '24px',
                              height: '24px',
                              borderRadius: 'var(--radius-sm)',
                              border: `1px solid ${isActive ? condition.color : 'var(--border-color)'}`,
                              background: isActive ? condition.color : 'var(--surface-light)',
                              color: isActive ? 'white' : 'var(--text-dim)',
                              cursor: 'pointer',
                              fontSize: '0.6rem',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'all var(--transition-fast)',
                              opacity: isActive ? 1 : 0.6
                            }}
                          >
                            {condition.icon}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Add Combatant (DM only) */}
      {isDM && (
        <div style={{
          padding: 'var(--spacing-md)',
          borderTop: '1px solid var(--border-color)',
          background: 'var(--surface-light)'
        }}>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                width: '100%',
                padding: 'var(--spacing-sm)',
                border: '1px dashed var(--border-color)',
                borderRadius: 'var(--radius-md)',
                background: 'transparent',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                fontSize: '0.8rem',
                transition: 'all var(--transition-fast)'
              }}
            >
              ➕ Add Combatant
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              <input
                type="text"
                value={newCombatantName}
                onChange={(e) => setNewCombatantName(e.target.value)}
                placeholder="Combatant name"
                autoFocus
                style={{
                  flex: 1,
                  padding: 'var(--spacing-sm)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '0.8rem'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCombatant();
                  if (e.key === 'Escape') setShowAddForm(false);
                }}
              />
              <button
                onClick={handleAddCombatant}
                disabled={!newCombatantName.trim()}
                style={{
                  padding: 'var(--spacing-sm)',
                  border: '1px solid var(--color-success)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-success)',
                  color: 'white',
                  cursor: !newCombatantName.trim() ? 'not-allowed' : 'pointer',
                  opacity: !newCombatantName.trim() ? 0.6 : 1,
                  fontSize: '0.8rem'
                }}
              >
                Add
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: 'var(--spacing-sm)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--surface-primary)',
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  fontSize: '0.8rem'
                }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Initiative;