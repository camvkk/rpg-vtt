import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';

// ── Condições D&D 5e ──
const CONDITIONS_LIST = [
  { id: 'blinded', name: 'Cego', icon: '👁️', color: '#666' },
  { id: 'charmed', name: 'Encantado', icon: '💝', color: '#ff69b4' },
  { id: 'deafened', name: 'Surdo', icon: '🔇', color: '#8b4513' },
  { id: 'frightened', name: 'Amedrontado', icon: '😨', color: '#800080' },
  { id: 'grappled', name: 'Agarrado', icon: '🤝', color: '#cd853f' },
  { id: 'incapacitated', name: 'Incapacitado', icon: '💤', color: '#708090' },
  { id: 'invisible', name: 'Invisível', icon: '👻', color: '#d3d3d3' },
  { id: 'paralyzed', name: 'Paralisado', icon: '⚡', color: '#ffd700' },
  { id: 'petrified', name: 'Petrificado', icon: '🗿', color: '#696969' },
  { id: 'poisoned', name: 'Envenenado', icon: '🟢', color: '#32cd32' },
  { id: 'prone', name: 'Caído', icon: '🔽', color: '#ff4500' },
  { id: 'restrained', name: 'Contido', icon: '⛓️', color: '#2f4f4f' },
  { id: 'stunned', name: 'Atordoado', icon: '💫', color: '#ffa500' },
  { id: 'unconscious', name: 'Inconsciente', icon: '💀', color: '#8b0000' },
  { id: 'blessed', name: 'Abençoado', icon: '✨', color: '#ffd700' },
  { id: 'concentrating', name: 'Concentração', icon: '🧠', color: '#4169e1' },
  { id: 'hexed', name: 'Amaldiçoado', icon: '🔮', color: '#9400d3' },
];

const getConditionInfo = (id) => CONDITIONS_LIST.find(c => c.id === id) || { id, name: id, icon: '❓', color: '#888' };

const getHPPercentage = (hp) => {
  if (!hp || hp.max <= 0) return 100;
  return Math.max(0, Math.min(100, (hp.current / hp.max) * 100));
};

const getHPColor = (pct) => {
  if (pct > 60) return '#10b981';
  if (pct > 30) return '#f59e0b';
  return '#ef4444';
};

// ── Main Component ──
const InitiativeTracker = () => {
  const { state, actions } = useGame();
  const { initiative, player, tokens } = state;
  const isDM = player.isDM;

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newHP, setNewHP] = useState(20);
  const [newAC, setNewAC] = useState(10);
  const [newMod, setNewMod] = useState(0);
  const [hpPopup, setHpPopup] = useState(null); // { combatantId, mode: 'damage'|'heal' }
  const [hpAmount, setHpAmount] = useState('');
  const [conditionPopup, setConditionPopup] = useState(null); // combatantId
  const [conditionDuration, setConditionDuration] = useState(1);
  const [deathSavePopup, setDeathSavePopup] = useState(null); // combatantId
  const [dragIdx, setDragIdx] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const hpInputRef = useRef(null);
  const notifTimeouts = useRef([]);

  const combatants = initiative.combatants || [];
  const currentTurn = initiative.currentTurn || 0;
  const round = initiative.round || 1;
  const isActive = initiative.active || false;

  // Listen for notifications from initiative updates
  useEffect(() => {
    if (initiative._notifications && initiative._notifications.length > 0) {
      const newNotifs = initiative._notifications.map((n, i) => ({
        id: Date.now() + i,
        text: n,
      }));
      setNotifications(prev => [...prev, ...newNotifs]);
      newNotifs.forEach(n => {
        const t = setTimeout(() => {
          setNotifications(prev => prev.filter(x => x.id !== n.id));
        }, 4000);
        notifTimeouts.current.push(t);
      });
    }
  }, [initiative._notifications]);

  useEffect(() => {
    return () => notifTimeouts.current.forEach(clearTimeout);
  }, []);

  // Focus HP input when popup opens
  useEffect(() => {
    if (hpPopup && hpInputRef.current) {
      hpInputRef.current.focus();
    }
  }, [hpPopup]);

  // ── Handlers ──
  const handleRollAll = () => actions.initiativeRollAll();
  const handleNextTurn = () => actions.initiativeNextTurn();
  const handleStartCombat = () => actions.initiativeStartCombat();
  const handleEndCombat = () => actions.initiativeClearAll();

  const handleAddCombatant = () => {
    if (!newName.trim()) return;
    actions.initiativeAddCombatant({
      name: newName.trim(),
      hp: { current: newHP, max: newHP },
      ac: newAC,
      initiativeMod: newMod,
      isNPC: true,
    });
    setNewName('');
    setNewHP(20);
    setNewAC(10);
    setNewMod(0);
    setShowAddForm(false);
  };

  const handleRemove = (id) => {
    if (confirm('Remover este combatente?')) {
      actions.initiativeRemoveCombatant(id);
    }
  };

  const handleInitiativeEdit = (id, val) => {
    const v = parseInt(val) || 0;
    actions.initiativeUpdateCombatant(id, { initiative: Math.max(-10, Math.min(40, v)) });
  };

  const handleHPSubmit = () => {
    if (!hpPopup || !hpAmount) return;
    const amount = parseInt(hpAmount) || 0;
    if (amount <= 0) { setHpPopup(null); return; }
    if (hpPopup.mode === 'damage') {
      actions.initiativeDealDamage(hpPopup.combatantId, amount);
    } else {
      actions.initiativeHeal(hpPopup.combatantId, amount);
    }
    setHpPopup(null);
    setHpAmount('');
  };

  const handleAddCondition = (combatantId, conditionId) => {
    actions.initiativeAddCondition(combatantId, conditionId, conditionDuration);
    setConditionPopup(null);
    setConditionDuration(1);
  };

  const handleRemoveCondition = (combatantId, conditionId) => {
    actions.initiativeRemoveCondition(combatantId, conditionId);
  };

  const handleDeathSave = (combatantId, success) => {
    actions.initiativeDeathSave(combatantId, success);
  };

  const handleRollOwn = () => {
    actions.initiativeRollOwn();
  };

  // Drag reorder
  const handleDragStart = (idx) => setDragIdx(idx);
  const handleDragOver = (e, idx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    actions.initiativeReorder(dragIdx, idx);
    setDragIdx(idx);
  };
  const handleDragEnd = () => setDragIdx(null);

  // Link token to combatant
  const getTokenForCombatant = (c) => {
    if (c.tokenId) return tokens.find(t => t.id === c.tokenId);
    return tokens.find(t => t.name === c.name);
  };

  return (
    <div style={styles.panel}>
      {/* Notifications */}
      <div style={styles.notifContainer}>
        {notifications.map(n => (
          <div key={n.id} style={styles.notification}>
            {n.text}
          </div>
        ))}
      </div>

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerIcon}>⚔️</span>
          <h3 style={styles.headerTitle}>Iniciativa</h3>
        </div>
        {isActive && (
          <div style={styles.roundBadge}>
            Rodada {round}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {!isActive ? (
          <div style={styles.controlRow}>
            {isDM && (
              <>
                <button onClick={handleRollAll} disabled={combatants.length === 0} style={{...styles.btn, ...styles.btnPrimary, opacity: combatants.length === 0 ? 0.5 : 1}}>
                  🎲 Rolar Todas
                </button>
                <button onClick={handleStartCombat} disabled={combatants.length === 0} style={{...styles.btn, ...styles.btnDanger, opacity: combatants.length === 0 ? 0.5 : 1}}>
                  ⚔️ Iniciar
                </button>
              </>
            )}
            {!isDM && (
              <button onClick={handleRollOwn} style={{...styles.btn, ...styles.btnPrimary}}>
                🎲 Rolar Minha Iniciativa
              </button>
            )}
          </div>
        ) : (
          <div style={styles.controlRow}>
            {isDM && (
              <>
                <button onClick={handleNextTurn} style={{...styles.btn, ...styles.btnGold}}>
                  ➡️ Próximo Turno
                </button>
                <button onClick={handleEndCombat} style={{...styles.btn, ...styles.btnSuccess}}>
                  🏆 Encerrar
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Combatants List */}
      <div style={styles.list}>
        {combatants.length === 0 ? (
          <div style={styles.empty}>
            Nenhum combatente. {isDM ? 'Adicione personagens ou tokens.' : 'Aguardando o Mestre.'}
          </div>
        ) : (
          combatants.map((c, idx) => {
            const isCurrent = isActive && idx === currentTurn;
            const hpPct = getHPPercentage(c.hp);
            const hpColor = getHPColor(hpPct);
            const isUnconscious = c.hp && c.hp.current <= 0;
            const token = getTokenForCombatant(c);

            return (
              <div
                key={c.id}
                draggable={isDM && !isActive}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                style={{
                  ...styles.combatant,
                  ...(isCurrent ? styles.combatantActive : {}),
                  ...(dragIdx === idx ? { opacity: 0.5 } : {}),
                }}
              >
                {/* Current turn indicator */}
                {isCurrent && <div style={styles.turnIndicator} />}

                {/* Top row: avatar, name, initiative, remove */}
                <div style={styles.combatantTop}>
                  {/* Avatar */}
                  <div style={{
                    ...styles.avatar,
                    backgroundColor: token?.color || c.color || '#4a5568',
                    backgroundImage: token?.imageUrl ? `url(${token.imageUrl})` : 'none',
                    backgroundSize: 'cover',
                    border: isCurrent ? '2px solid #e2b714' : '2px solid #555',
                  }}>
                    {!token?.imageUrl && (c.name?.[0]?.toUpperCase() || '?')}
                  </div>

                  {/* Name + AC */}
                  <div style={styles.nameBlock}>
                    <div style={{ ...styles.name, color: isCurrent ? '#e2b714' : '#e2e8f0' }}>
                      {c.name}
                    </div>
                    <div style={styles.acLabel}>CA {c.ac || '?'}</div>
                  </div>

                  {/* Initiative value */}
                  <div style={{
                    ...styles.initCircle,
                    background: isCurrent ? '#e2b714' : '#2d3748',
                    color: isCurrent ? '#1a1a2e' : '#e2e8f0',
                  }}>
                    {isDM ? (
                      <input
                        type="number"
                        value={c.initiative ?? 0}
                        onChange={(e) => handleInitiativeEdit(c.id, e.target.value)}
                        style={styles.initInput}
                      />
                    ) : (
                      <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>{c.initiative ?? '—'}</span>
                    )}
                  </div>

                  {isDM && (
                    <button onClick={() => handleRemove(c.id)} style={styles.removeBtn} title="Remover">✕</button>
                  )}
                </div>

                {/* HP Bar */}
                {c.hp && (
                  <div style={styles.hpSection}>
                    <div style={styles.hpHeader}>
                      <span style={styles.hpLabel}>HP</span>
                      <div style={styles.hpActions}>
                        {isDM && (
                          <>
                            <button onClick={() => { setHpPopup({ combatantId: c.id, mode: 'damage' }); setHpAmount(''); }} style={styles.hpBtn} title="Dano">
                              <span style={{ color: '#ef4444' }}>⚔</span>
                            </button>
                            <button onClick={() => { setHpPopup({ combatantId: c.id, mode: 'heal' }); setHpAmount(''); }} style={styles.hpBtn} title="Curar">
                              <span style={{ color: '#10b981' }}>💚</span>
                            </button>
                          </>
                        )}
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e2e8f0' }}>
                          {c.hp.current}/{c.hp.max}
                        </span>
                      </div>
                    </div>
                    <div style={styles.hpBarBg}>
                      <div style={{
                        ...styles.hpBarFill,
                        width: `${hpPct}%`,
                        background: hpColor,
                      }} />
                    </div>
                  </div>
                )}

                {/* Death Saves (at 0 HP) */}
                {isUnconscious && c.deathSaves && (
                  <div style={styles.deathSaves}>
                    <span style={{ fontSize: '0.7rem', color: '#a0aec0' }}>Testes de Morte:</span>
                    <div style={styles.deathSaveRow}>
                      <span style={{ color: '#10b981', fontSize: '0.75rem' }}>✓</span>
                      {[0, 1, 2].map(i => (
                        <div key={`s${i}`} style={{
                          ...styles.deathDot,
                          background: i < (c.deathSaves.successes || 0) ? '#10b981' : '#2d3748',
                          cursor: isDM ? 'pointer' : 'default',
                        }} onClick={() => isDM && handleDeathSave(c.id, true)} />
                      ))}
                      <span style={{ margin: '0 4px', color: '#4a5568' }}>|</span>
                      <span style={{ color: '#ef4444', fontSize: '0.75rem' }}>✗</span>
                      {[0, 1, 2].map(i => (
                        <div key={`f${i}`} style={{
                          ...styles.deathDot,
                          background: i < (c.deathSaves.failures || 0) ? '#ef4444' : '#2d3748',
                          cursor: isDM ? 'pointer' : 'default',
                        }} onClick={() => isDM && handleDeathSave(c.id, false)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Conditions */}
                {c.conditions && c.conditions.length > 0 && (
                  <div style={styles.conditionsRow}>
                    {c.conditions.map((cond) => {
                      const info = getConditionInfo(cond.id);
                      return (
                        <div key={cond.id} style={{
                          ...styles.condBadge,
                          borderColor: info.color,
                          background: `${info.color}22`,
                        }} title={`${info.name}${cond.duration ? ` (${cond.duration} rodadas)` : ''}`}>
                          <span>{info.icon}</span>
                          {cond.duration && <span style={styles.condDuration}>{cond.duration}</span>}
                          {isDM && (
                            <button onClick={() => handleRemoveCondition(c.id, cond.id)} style={styles.condRemove}>×</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Add condition button (DM) */}
                {isDM && (
                  <button onClick={() => setConditionPopup(conditionPopup === c.id ? null : c.id)} style={styles.addCondBtn}>
                    + Condição
                  </button>
                )}

                {/* Condition picker popup */}
                {conditionPopup === c.id && (
                  <div style={styles.condPopup}>
                    <div style={styles.condPopupHeader}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>Adicionar Condição</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <label style={{ fontSize: '0.7rem', color: '#a0aec0' }}>Duração:</label>
                        <input type="number" min="0" value={conditionDuration} onChange={e => setConditionDuration(parseInt(e.target.value) || 0)}
                          style={{ width: 36, padding: '2px 4px', background: '#2d3748', border: '1px solid #4a5568', borderRadius: 4, color: '#e2e8f0', fontSize: '0.7rem', textAlign: 'center' }} />
                        <span style={{ fontSize: '0.65rem', color: '#718096' }}>rodadas (0=∞)</span>
                      </div>
                    </div>
                    <div style={styles.condGrid}>
                      {CONDITIONS_LIST.map(cond => {
                        const already = c.conditions?.some(x => x.id === cond.id);
                        return (
                          <button key={cond.id} onClick={() => !already && handleAddCondition(c.id, cond.id)}
                            disabled={already}
                            style={{
                              ...styles.condOption,
                              opacity: already ? 0.3 : 1,
                              borderColor: cond.color,
                            }}
                            title={cond.name}>
                            <span>{cond.icon}</span>
                            <span style={{ fontSize: '0.6rem' }}>{cond.name}</span>
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

      {/* Add combatant (DM) */}
      {isDM && (
        <div style={styles.footer}>
          {!showAddForm ? (
            <button onClick={() => setShowAddForm(true)} style={styles.addBtn}>
              ➕ Adicionar Combatente
            </button>
          ) : (
            <div style={styles.addForm}>
              <input type="text" placeholder="Nome" value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddCombatant()}
                autoFocus style={styles.input} />
              <div style={styles.addFormRow}>
                <label style={styles.miniLabel}>HP
                  <input type="number" value={newHP} onChange={e => setNewHP(parseInt(e.target.value) || 1)} style={{...styles.input, width: 50}} />
                </label>
                <label style={styles.miniLabel}>CA
                  <input type="number" value={newAC} onChange={e => setNewAC(parseInt(e.target.value) || 10)} style={{...styles.input, width: 50}} />
                </label>
                <label style={styles.miniLabel}>Mod
                  <input type="number" value={newMod} onChange={e => setNewMod(parseInt(e.target.value) || 0)} style={{...styles.input, width: 50}} />
                </label>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={handleAddCombatant} disabled={!newName.trim()} style={{...styles.btn, ...styles.btnSuccess, flex: 1, opacity: newName.trim() ? 1 : 0.5}}>Adicionar</button>
                <button onClick={() => setShowAddForm(false)} style={{...styles.btn, flex: 0}}>Cancelar</button>
              </div>
            </div>
          )}
          {/* Add from tokens on map */}
          {tokens.length > 0 && !showAddForm && (
            <button onClick={() => actions.initiativeAddFromTokens()} style={{...styles.addBtn, marginTop: 4, borderColor: '#4a5568'}}>
              🎭 Adicionar Tokens do Mapa
            </button>
          )}
        </div>
      )}

      {/* HP Popup */}
      {hpPopup && (
        <div style={styles.hpPopupOverlay} onClick={() => setHpPopup(null)}>
          <div style={styles.hpPopupBox} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 8 }}>
              {hpPopup.mode === 'damage' ? '⚔️ Causar Dano' : '💚 Curar'}
            </div>
            <input ref={hpInputRef} type="number" value={hpAmount} onChange={e => setHpAmount(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleHPSubmit()}
              placeholder="Quantidade" min="0" style={{...styles.input, width: '100%', textAlign: 'center', fontSize: '1.1rem'}} />
            <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
              {[5, 10, 15, 20].map(v => (
                <button key={v} onClick={() => setHpAmount(String(v))} style={{...styles.btn, flex: 1, fontSize: '0.75rem'}}>{v}</button>
              ))}
            </div>
            <button onClick={handleHPSubmit} style={{
              ...styles.btn,
              width: '100%', marginTop: 8,
              ...(hpPopup.mode === 'damage' ? styles.btnDanger : styles.btnSuccess),
            }}>
              {hpPopup.mode === 'damage' ? 'Causar Dano' : 'Curar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Styles ──
const styles = {
  panel: {
    position: 'fixed',
    right: 16,
    top: 60,
    width: 300,
    maxHeight: 'calc(100vh - 80px)',
    background: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid #2d3748',
    borderRadius: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    zIndex: 100,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  notifContainer: {
    position: 'absolute',
    top: -8,
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    zIndex: 200,
    pointerEvents: 'none',
  },
  notification: {
    background: 'linear-gradient(135deg, #e2b714, #d4a017)',
    color: '#1a1a2e',
    padding: '6px 12px',
    borderRadius: 8,
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
    animation: 'slideDown 0.3s ease-out',
    boxShadow: '0 4px 12px rgba(226,183,20,0.4)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid #2d3748',
    background: 'rgba(45,55,72,0.5)',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  headerIcon: { fontSize: '1rem' },
  headerTitle: {
    margin: 0,
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#e2b714',
    fontFamily: '"Cinzel", "Georgia", serif',
  },
  roundBadge: {
    background: '#e2b714',
    color: '#1a1a2e',
    padding: '2px 10px',
    borderRadius: 12,
    fontSize: '0.7rem',
    fontWeight: 700,
  },
  controls: {
    padding: '6px 8px',
    borderBottom: '1px solid #2d3748',
  },
  controlRow: {
    display: 'flex',
    gap: 4,
  },
  btn: {
    padding: '5px 10px',
    border: '1px solid #4a5568',
    borderRadius: 6,
    background: '#2d3748',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontWeight: 600,
    transition: 'all 0.15s',
    flex: 1,
  },
  btnPrimary: { background: '#3182ce', borderColor: '#3182ce', color: '#fff' },
  btnDanger: { background: '#e53e3e', borderColor: '#e53e3e', color: '#fff' },
  btnSuccess: { background: '#38a169', borderColor: '#38a169', color: '#fff' },
  btnGold: { background: '#e2b714', borderColor: '#e2b714', color: '#1a1a2e' },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: 4,
  },
  empty: {
    padding: 16,
    textAlign: 'center',
    color: '#718096',
    fontSize: '0.8rem',
    fontStyle: 'italic',
  },
  combatant: {
    position: 'relative',
    padding: '8px 10px',
    marginBottom: 4,
    borderRadius: 8,
    background: '#1e2a3a',
    border: '1px solid #2d3748',
    transition: 'all 0.2s',
  },
  combatantActive: {
    background: 'rgba(226,183,20,0.08)',
    border: '1px solid #e2b714',
    boxShadow: '0 0 12px rgba(226,183,20,0.2), inset 0 0 12px rgba(226,183,20,0.05)',
  },
  turnIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderRadius: '3px 0 0 3px',
    background: '#e2b714',
    animation: 'pulse 2s infinite',
  },
  combatantTop: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontWeight: 700,
    fontSize: '0.8rem',
    flexShrink: 0,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontWeight: 600,
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  acLabel: {
    fontSize: '0.65rem',
    color: '#718096',
  },
  initCircle: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    border: '2px solid #4a5568',
    flexShrink: 0,
  },
  initInput: {
    width: 28,
    height: 28,
    textAlign: 'center',
    background: 'transparent',
    border: 'none',
    color: 'inherit',
    fontSize: '0.8rem',
    fontWeight: 700,
  },
  removeBtn: {
    background: 'none',
    border: 'none',
    color: '#718096',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: 2,
  },
  hpSection: { marginTop: 6 },
  hpHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 3,
  },
  hpLabel: { fontSize: '0.65rem', color: '#718096' },
  hpActions: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  hpBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    padding: '0 2px',
  },
  hpBarBg: {
    height: 5,
    background: '#2d3748',
    borderRadius: 3,
    overflow: 'hidden',
  },
  hpBarFill: {
    height: '100%',
    borderRadius: 3,
    transition: 'all 0.3s',
  },
  deathSaves: {
    marginTop: 6,
    padding: '4px 6px',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 4,
  },
  deathSaveRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  deathDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    border: '1px solid #4a5568',
  },
  conditionsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 3,
    marginTop: 6,
  },
  condBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '1px 5px',
    borderRadius: 4,
    border: '1px solid',
    fontSize: '0.7rem',
  },
  condDuration: {
    fontSize: '0.6rem',
    fontWeight: 700,
    color: '#e2e8f0',
  },
  condRemove: {
    background: 'none',
    border: 'none',
    color: '#a0aec0',
    cursor: 'pointer',
    fontSize: '0.7rem',
    padding: 0,
    marginLeft: 1,
  },
  addCondBtn: {
    marginTop: 4,
    background: 'none',
    border: '1px dashed #4a5568',
    borderRadius: 4,
    color: '#718096',
    cursor: 'pointer',
    fontSize: '0.65rem',
    padding: '2px 6px',
    width: '100%',
  },
  condPopup: {
    marginTop: 6,
    padding: 8,
    background: '#1a1a2e',
    border: '1px solid #4a5568',
    borderRadius: 8,
  },
  condPopupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    color: '#e2e8f0',
    flexWrap: 'wrap',
    gap: 4,
  },
  condGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 3,
  },
  condOption: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 1,
    padding: '3px 2px',
    border: '1px solid',
    borderRadius: 4,
    background: 'rgba(45,55,72,0.5)',
    color: '#e2e8f0',
    cursor: 'pointer',
    fontSize: '0.7rem',
  },
  footer: {
    padding: 8,
    borderTop: '1px solid #2d3748',
  },
  addBtn: {
    width: '100%',
    padding: '6px 8px',
    border: '1px dashed #4a5568',
    borderRadius: 6,
    background: 'transparent',
    color: '#718096',
    cursor: 'pointer',
    fontSize: '0.75rem',
  },
  addForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  addFormRow: {
    display: 'flex',
    gap: 6,
  },
  miniLabel: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
    fontSize: '0.65rem',
    color: '#a0aec0',
    flex: 1,
  },
  input: {
    padding: '5px 8px',
    border: '1px solid #4a5568',
    borderRadius: 6,
    background: '#2d3748',
    color: '#e2e8f0',
    fontSize: '0.8rem',
  },
  hpPopupOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 300,
  },
  hpPopupBox: {
    background: '#1a1a2e',
    border: '1px solid #4a5568',
    borderRadius: 12,
    padding: 16,
    width: 220,
  },
};

// CSS animation injection
if (typeof document !== 'undefined') {
  const styleEl = document.getElementById('initiative-tracker-styles') || (() => {
    const el = document.createElement('style');
    el.id = 'initiative-tracker-styles';
    document.head.appendChild(el);
    return el;
  })();
  styleEl.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    @keyframes slideDown {
      from { transform: translateY(-10px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&display=swap');
  `;
}

export default InitiativeTracker;
