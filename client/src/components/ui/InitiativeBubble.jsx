import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';
import Bubble from './Bubble';

// D&D 5e Conditions
const CONDITIONS = [
  { id: 'blinded', name: 'Cego', icon: '👁️', color: '#666' },
  { id: 'charmed', name: 'Encantado', icon: '💝', color: '#ff69b4' },
  { id: 'frightened', name: 'Amedrontado', icon: '😨', color: '#800080' },
  { id: 'paralyzed', name: 'Paralisado', icon: '⚡', color: '#ffd700' },
  { id: 'poisoned', name: 'Envenenado', icon: '🟢', color: '#32cd32' },
  { id: 'prone', name: 'Caído', icon: '🔽', color: '#ff4500' },
  { id: 'stunned', name: 'Atordoado', icon: '💫', color: '#ffa500' },
  { id: 'unconscious', name: 'Inconsciente', icon: '💀', color: '#8b0000' },
  { id: 'concentrating', name: 'Concentração', icon: '🧠', color: '#4169e1' },
];

const getCondition = (id) => CONDITIONS.find(c => c.id === id) || { id, name: id, icon: '❓', color: '#888' };

const getHPColor = (pct) => {
  if (pct > 60) return '#2ecc71';
  if (pct > 30) return '#f1c40f';
  return '#e74c3c';
};

const InitiativeBubble = ({
  initialPosition = { x: 16, y: 100 },
  onMinimize,
}) => {
  const { state, actions } = useGame();
  const { initiative, player, tokens } = state;
  const isDM = player.isDM;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newCombatant, setNewCombatant] = useState({ name: '', hp: 20, ac: 10, mod: 0 });
  const [hpModal, setHpModal] = useState(null);
  const [hpAmount, setHpAmount] = useState('');
  const [conditionPicker, setConditionPicker] = useState(null);
  const hpInputRef = useRef(null);

  const combatants = initiative.combatants || [];
  const currentTurn = initiative.currentTurn || 0;
  const round = initiative.round || 1;
  const isActive = initiative.active || false;

  useEffect(() => {
    if (hpModal && hpInputRef.current) {
      hpInputRef.current.focus();
    }
  }, [hpModal]);

  const handleAddCombatant = () => {
    if (!newCombatant.name.trim()) return;
    actions.initiativeAddCombatant({
      name: newCombatant.name.trim(),
      hp: { current: newCombatant.hp, max: newCombatant.hp },
      ac: newCombatant.ac,
      initiativeMod: newCombatant.mod,
      isNPC: true,
    });
    setNewCombatant({ name: '', hp: 20, ac: 10, mod: 0 });
    setShowAddForm(false);
  };

  const handleHPSubmit = () => {
    if (!hpModal || !hpAmount) return;
    const amount = parseInt(hpAmount) || 0;
    if (amount <= 0) { setHpModal(null); return; }
    if (hpModal.mode === 'damage') {
      actions.initiativeDealDamage(hpModal.id, amount);
    } else {
      actions.initiativeHeal(hpModal.id, amount);
    }
    setHpModal(null);
    setHpAmount('');
  };

  const CombatantCard = ({ combatant, index }) => {
    const isCurrent = isActive && index === currentTurn;
    const hpPct = combatant.hp ? Math.max(0, (combatant.hp.current / combatant.hp.max) * 100) : 100;
    const isDown = combatant.hp && combatant.hp.current <= 0;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -20 }}
        animate={{ 
          opacity: isDown ? 0.6 : 1, 
          x: 0,
          scale: isCurrent ? 1.02 : 1,
        }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        style={{
          position: 'relative',
          padding: '10px 12px',
          borderRadius: 12,
          background: isCurrent 
            ? 'linear-gradient(135deg, rgba(226,183,20,0.15), rgba(226,183,20,0.05))'
            : 'rgba(45,55,72,0.4)',
          border: isCurrent ? '2px solid #e2b714' : '1px solid rgba(255,255,255,0.08)',
          boxShadow: isCurrent ? '0 0 20px rgba(226,183,20,0.2)' : 'none',
          marginBottom: 6,
          overflow: 'hidden',
        }}
      >
        {/* Turn indicator */}
        {isCurrent && (
          <motion.div
            layoutId="turn-indicator"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              background: '#e2b714',
              borderRadius: '4px 0 0 4px',
            }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
          />
        )}

        {/* Main row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Avatar */}
          <motion.div
            style={{
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: combatant.color || '#4a5568',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#fff',
              border: isCurrent ? '2px solid #e2b714' : '2px solid #2d3748',
              flexShrink: 0,
            }}
            animate={isCurrent ? { 
              boxShadow: ['0 0 0 0 rgba(226,183,20,0.4)', '0 0 0 8px rgba(226,183,20,0)', '0 0 0 0 rgba(226,183,20,0.4)']
            } : {}}
            transition={{ repeat: Infinity, duration: 2 }}
          >
            {combatant.name?.[0]?.toUpperCase() || '?'}
          </motion.div>

          {/* Name & AC */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 600,
              fontSize: '0.9rem',
              color: isCurrent ? '#e2b714' : '#e2e8f0',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {combatant.name}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#718096' }}>
              CA {combatant.ac || '?'}
            </div>
          </div>

          {/* Initiative */}
          <motion.div
            style={{
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: isCurrent ? '#e2b714' : '#2d3748',
              color: isCurrent ? '#1a1a2e' : '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '0.95rem',
              border: '2px solid #4a5568',
              flexShrink: 0,
            }}
            whileHover={{ scale: 1.1 }}
          >
            {isDM ? (
              <input
                type="number"
                value={combatant.initiative ?? 0}
                onChange={(e) => actions.initiativeUpdateCombatant(combatant.id, { initiative: parseInt(e.target.value) || 0 })}
                style={{
                  width: '100%',
                  height: '100%',
                  textAlign: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  fontSize: 'inherit',
                  fontWeight: 'inherit',
                }}
              />
            ) : (
              combatant.initiative ?? '—'
            )}
          </motion.div>

          {/* Remove button (DM only) */}
          {isDM && (
            <motion.button
              onClick={() => actions.initiativeRemoveCombatant(combatant.id)}
              style={{
                width: 24,
                height: 24,
                borderRadius: 6,
                border: 'none',
                background: 'rgba(255,107,107,0.1)',
                color: '#ff6b6b',
                cursor: 'pointer',
                fontSize: '0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              whileHover={{ scale: 1.1, background: 'rgba(255,107,107,0.2)' }}
              whileTap={{ scale: 0.9 }}
            >
              ✕
            </motion.button>
          )}
        </div>

        {/* HP Bar */}
        {combatant.hp && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.7rem', color: '#718096' }}>HP</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {isDM && (
                  <>
                    <motion.button
                      onClick={() => { setHpModal({ id: combatant.id, mode: 'damage' }); setHpAmount(''); }}
                      style={{
                        padding: '2px 6px',
                        border: 'none',
                        borderRadius: 4,
                        background: 'rgba(231,76,60,0.15)',
                        color: '#e74c3c',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      ⚔
                    </motion.button>
                    <motion.button
                      onClick={() => { setHpModal({ id: combatant.id, mode: 'heal' }); setHpAmount(''); }}
                      style={{
                        padding: '2px 6px',
                        border: 'none',
                        borderRadius: 4,
                        background: 'rgba(46,204,113,0.15)',
                        color: '#2ecc71',
                        fontSize: '0.7rem',
                        cursor: 'pointer',
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      💚
                    </motion.button>
                  </>
                )}
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: getHPColor(hpPct) }}>
                  {combatant.hp.current}/{combatant.hp.max}
                </span>
              </div>
            </div>
            <div style={{
              height: 6,
              background: '#2d3748',
              borderRadius: 3,
              overflow: 'hidden',
            }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${hpPct}%` }}
                transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                style={{
                  height: '100%',
                  background: getHPColor(hpPct),
                  borderRadius: 3,
                }}
              />
            </div>
          </div>
        )}

        {/* Death saves */}
        {isDown && combatant.deathSaves && (
          <div style={{ marginTop: 8, padding: '6px 8px', background: 'rgba(0,0,0,0.3)', borderRadius: 6 }}>
            <div style={{ fontSize: '0.7rem', color: '#a0aec0', marginBottom: 4 }}>Testes de Morte</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: '0.7rem', color: '#2ecc71' }}>✓</span>
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    onClick={() => isDM && actions.initiativeDeathSave(combatant.id, true)}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: i < (combatant.deathSaves.successes || 0) ? '#2ecc71' : '#2d3748',
                      border: '1px solid #4a5568',
                      cursor: isDM ? 'pointer' : 'default',
                    }}
                    whileHover={isDM ? { scale: 1.2 } : {}}
                  />
                ))}
              </div>
              <div style={{ width: 1, background: '#4a5568' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <span style={{ fontSize: '0.7rem', color: '#e74c3c' }}>✗</span>
                {[0, 1, 2].map(i => (
                  <motion.div
                    key={i}
                    onClick={() => isDM && actions.initiativeDeathSave(combatant.id, false)}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      background: i < (combatant.deathSaves.failures || 0) ? '#e74c3c' : '#2d3748',
                      border: '1px solid #4a5568',
                      cursor: isDM ? 'pointer' : 'default',
                    }}
                    whileHover={isDM ? { scale: 1.2 } : {}}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Conditions */}
        {combatant.conditions && combatant.conditions.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {combatant.conditions.map(cond => {
              const info = getCondition(cond.id);
              return (
                <motion.div
                  key={cond.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  style={{
                    padding: '2px 6px',
                    borderRadius: 6,
                    background: `${info.color}22`,
                    border: `1px solid ${info.color}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: '0.7rem',
                  }}
                >
                  <span>{info.icon}</span>
                  {cond.duration && <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{cond.duration}</span>}
                  {isDM && (
                    <button
                      onClick={() => actions.initiativeRemoveCondition(combatant.id, cond.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#a0aec0',
                        cursor: 'pointer',
                        padding: 0,
                        fontSize: '0.65rem',
                      }}
                    >
                      ×
                    </button>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}

        {/* Add condition button */}
        {isDM && (
          <motion.button
            onClick={() => setConditionPicker(conditionPicker === combatant.id ? null : combatant.id)}
            style={{
              marginTop: 6,
              padding: '3px 8px',
              border: '1px dashed #4a5568',
              borderRadius: 6,
              background: 'transparent',
              color: '#718096',
              fontSize: '0.7rem',
              cursor: 'pointer',
              width: '100%',
            }}
            whileHover={{ borderColor: '#718096', color: '#a0aec0' }}
          >
            + Condição
          </motion.button>
        )}

        {/* Condition picker */}
        <AnimatePresence>
          {conditionPicker === combatant.id && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                marginTop: 8,
                padding: 8,
                background: 'rgba(0,0,0,0.4)',
                borderRadius: 8,
              }}
            >
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 4,
              }}>
                {CONDITIONS.map(cond => {
                  const hasIt = combatant.conditions?.some(c => c.id === cond.id);
                  return (
                    <motion.button
                      key={cond.id}
                      onClick={() => {
                        if (!hasIt) {
                          actions.initiativeAddCondition(combatant.id, cond.id, 1);
                          setConditionPicker(null);
                        }
                      }}
                      disabled={hasIt}
                      style={{
                        padding: '4px',
                        border: `1px solid ${cond.color}`,
                        borderRadius: 6,
                        background: hasIt ? '#2d3748' : `${cond.color}22`,
                        color: '#e2e8f0',
                        fontSize: '0.65rem',
                        cursor: hasIt ? 'not-allowed' : 'pointer',
                        opacity: hasIt ? 0.4 : 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 2,
                      }}
                      whileHover={!hasIt ? { scale: 1.05 } : {}}
                      whileTap={!hasIt ? { scale: 0.95 } : {}}
                    >
                      <span style={{ fontSize: '0.9rem' }}>{cond.icon}</span>
                      <span>{cond.name}</span>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <Bubble
      id="initiative-bubble"
      title="Iniciativa"
      icon="⚔️"
      initialPosition={initialPosition}
      onMinimize={onMinimize}
      minWidth={300}
      minHeight={400}
      maxWidth={380}
      accentColor="#e2b714"
    >
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 10 }}>
        {/* Round indicator */}
        {isActive && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            style={{
              textAlign: 'center',
              padding: '6px 12px',
              background: 'linear-gradient(135deg, #e2b71422, #e2b71411)',
              borderRadius: 20,
              border: '1px solid #e2b71444',
            }}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#e2b714' }}>
              ⚔️ Rodada {round}
            </span>
          </motion.div>
        )}

        {/* Controls */}
        <div style={{ display: 'flex', gap: 6 }}>
          {!isActive ? (
            <>
              {isDM && (
                <>
                  <motion.button
                    onClick={() => actions.initiativeRollAll()}
                    disabled={combatants.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 8,
                      background: combatants.length === 0 ? '#2d3748' : 'linear-gradient(135deg, #3498db, #2980b9)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: combatants.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: combatants.length === 0 ? 0.5 : 1,
                    }}
                    whileHover={combatants.length > 0 ? { scale: 1.02 } : {}}
                    whileTap={combatants.length > 0 ? { scale: 0.98 } : {}}
                  >
                    🎲 Rolar Todas
                  </motion.button>
                  <motion.button
                    onClick={() => actions.initiativeStartCombat()}
                    disabled={combatants.length === 0}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 8,
                      background: combatants.length === 0 ? '#2d3748' : 'linear-gradient(135deg, #e74c3c, #c0392b)',
                      color: '#fff',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: combatants.length === 0 ? 'not-allowed' : 'pointer',
                      opacity: combatants.length === 0 ? 0.5 : 1,
                    }}
                    whileHover={combatants.length > 0 ? { scale: 1.02 } : {}}
                    whileTap={combatants.length > 0 ? { scale: 0.98 } : {}}
                  >
                    ⚔️ Iniciar
                  </motion.button>
                </>
              )}
              {!isDM && (
                <motion.button
                  onClick={() => actions.initiativeRollOwn()}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #3498db, #2980b9)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    cursor: 'pointer',
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  🎲 Rolar Minha Iniciativa
                </motion.button>
              )}
            </>
          ) : (
            isDM && (
              <>
                <motion.button
                  onClick={() => actions.initiativeNextTurn()}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #e2b714, #f39c12)',
                    color: '#1a1a2e',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  ➡️ Próximo
                </motion.button>
                <motion.button
                  onClick={() => actions.initiativeClearAll()}
                  style={{
                    padding: '8px 12px',
                    border: 'none',
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #2ecc71, #27ae60)',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  🏆 Fim
                </motion.button>
              </>
            )
          )}
        </div>

        {/* Combatants list */}
        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 4 }}>
          {combatants.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: 24,
              color: '#718096',
              fontSize: '0.85rem',
              fontStyle: 'italic',
            }}>
              {isDM ? 'Adicione combatentes abaixo' : 'Aguardando o Mestre...'}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {combatants.map((c, i) => (
                <CombatantCard key={c.id} combatant={c} index={i} />
              ))}
            </AnimatePresence>
          )}
        </div>

        {/* Add combatant (DM) */}
        {isDM && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
            <AnimatePresence mode="wait">
              {!showAddForm ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{ display: 'flex', gap: 6 }}
                >
                  <motion.button
                    onClick={() => setShowAddForm(true)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px dashed #4a5568',
                      borderRadius: 8,
                      background: 'transparent',
                      color: '#718096',
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                    whileHover={{ borderColor: '#718096', color: '#a0aec0' }}
                  >
                    ➕ Adicionar
                  </motion.button>
                  {tokens.length > 0 && (
                    <motion.button
                      onClick={() => actions.initiativeAddFromTokens()}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: '1px dashed #4a5568',
                        borderRadius: 8,
                        background: 'transparent',
                        color: '#718096',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                      whileHover={{ borderColor: '#718096', color: '#a0aec0' }}
                    >
                      🎭 Do Mapa
                    </motion.button>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                >
                  <input
                    type="text"
                    placeholder="Nome"
                    value={newCombatant.name}
                    onChange={(e) => setNewCombatant({ ...newCombatant, name: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCombatant()}
                    autoFocus
                    style={{
                      padding: '8px 10px',
                      border: '1px solid #4a5568',
                      borderRadius: 8,
                      background: 'rgba(45,55,72,0.5)',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['hp', 'ac', 'mod'].map((field) => (
                      <label key={field} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: '0.65rem', color: '#a0aec0', textTransform: 'uppercase' }}>
                          {field === 'mod' ? 'Mod' : field.toUpperCase()}
                        </span>
                        <input
                          type="number"
                          value={newCombatant[field]}
                          onChange={(e) => setNewCombatant({ ...newCombatant, [field]: parseInt(e.target.value) || 0 })}
                          style={{
                            padding: '6px 8px',
                            border: '1px solid #4a5568',
                            borderRadius: 6,
                            background: 'rgba(45,55,72,0.5)',
                            color: '#e2e8f0',
                            fontSize: '0.85rem',
                            textAlign: 'center',
                          }}
                        />
                      </label>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <motion.button
                      onClick={handleAddCombatant}
                      disabled={!newCombatant.name.trim()}
                      style={{
                        flex: 1,
                        padding: '8px',
                        border: 'none',
                        borderRadius: 8,
                        background: newCombatant.name.trim() ? 'linear-gradient(135deg, #2ecc71, #27ae60)' : '#2d3748',
                        color: '#fff',
                        fontWeight: 600,
                        fontSize: '0.85rem',
                        cursor: newCombatant.name.trim() ? 'pointer' : 'not-allowed',
                        opacity: newCombatant.name.trim() ? 1 : 0.5,
                      }}
                      whileHover={newCombatant.name.trim() ? { scale: 1.02 } : {}}
                      whileTap={newCombatant.name.trim() ? { scale: 0.98 } : {}}
                    >
                      Adicionar
                    </motion.button>
                    <motion.button
                      onClick={() => setShowAddForm(false)}
                      style={{
                        padding: '8px 16px',
                        border: '1px solid #4a5568',
                        borderRadius: 8,
                        background: 'transparent',
                        color: '#a0aec0',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                      whileHover={{ borderColor: '#718096' }}
                    >
                      ✕
                    </motion.button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* HP Modal */}
      <AnimatePresence>
        {hpModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setHpModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2000,
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'linear-gradient(135deg, #1a1a2e, #16213e)',
                border: `2px solid ${hpModal.mode === 'damage' ? '#e74c3c' : '#2ecc71'}`,
                borderRadius: 16,
                padding: 20,
                minWidth: 220,
                boxShadow: `0 8px 32px ${hpModal.mode === 'damage' ? 'rgba(231,76,60,0.3)' : 'rgba(46,204,113,0.3)'}`,
              }}
            >
              <div style={{
                textAlign: 'center',
                fontSize: '1rem',
                fontWeight: 700,
                color: hpModal.mode === 'damage' ? '#e74c3c' : '#2ecc71',
                marginBottom: 12,
              }}>
                {hpModal.mode === 'damage' ? '⚔️ Dano' : '💚 Cura'}
              </div>
              <input
                ref={hpInputRef}
                type="number"
                value={hpAmount}
                onChange={(e) => setHpAmount(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleHPSubmit()}
                placeholder="Quantidade"
                min="0"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #4a5568',
                  borderRadius: 8,
                  background: 'rgba(45,55,72,0.5)',
                  color: '#e2e8f0',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                  marginBottom: 12,
                }}
              />
              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {[5, 10, 15, 20].map(v => (
                  <motion.button
                    key={v}
                    onClick={() => setHpAmount(String(v))}
                    style={{
                      flex: 1,
                      padding: '6px',
                      border: '1px solid #4a5568',
                      borderRadius: 6,
                      background: '#2d3748',
                      color: '#e2e8f0',
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {v}
                  </motion.button>
                ))}
              </div>
              <motion.button
                onClick={handleHPSubmit}
                style={{
                  width: '100%',
                  padding: '10px',
                  border: 'none',
                  borderRadius: 8,
                  background: hpModal.mode === 'damage' 
                    ? 'linear-gradient(135deg, #e74c3c, #c0392b)'
                    : 'linear-gradient(135deg, #2ecc71, #27ae60)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {hpModal.mode === 'damage' ? 'Causar Dano' : 'Curar'}
              </motion.button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Bubble>
  );
};

export default InitiativeBubble;
