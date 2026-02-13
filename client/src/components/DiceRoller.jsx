import React, { useState, useCallback, useRef } from 'react';
import { useGame } from '../contexts/GameContext';
import '../styles/DiceRoller.css';

// Dice types with colors and Unicode-friendly labels
const DICE_TYPES = [
  { sides: 4,  label: 'd4',  icon: '▲', color: '#e74c3c' },
  { sides: 6,  label: 'd6',  icon: '⬡', color: '#e67e22' },
  { sides: 8,  label: 'd8',  icon: '◆', color: '#2ecc71' },
  { sides: 10, label: 'd10', icon: '◈', color: '#3498db' },
  { sides: 12, label: 'd12', icon: '⬠', color: '#9b59b6' },
  { sides: 20, label: 'd20', icon: '✦', color: '#f1c40f' },
];

// Roll context presets
const ROLL_CONTEXTS = [
  { id: 'attack', label: 'Ataque', icon: '⚔️' },
  { id: 'damage', label: 'Dano', icon: '💥' },
  { id: 'skill', label: 'Perícia', icon: '🎯' },
  { id: 'save', label: 'Salvaguarda', icon: '🛡️' },
  { id: 'other', label: 'Outro', icon: '🎲' },
];

function rollSingleDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function buildFormula(tray, modifier) {
  const groups = {};
  tray.forEach(d => {
    groups[d.sides] = (groups[d.sides] || 0) + 1;
  });
  const parts = Object.entries(groups)
    .sort((a, b) => Number(b[0]) - Number(a[0]))
    .map(([sides, count]) => `${count}d${sides}`);
  if (modifier > 0) parts.push(`+${modifier}`);
  else if (modifier < 0) parts.push(`${modifier}`);
  return parts.join(' + ') || '0';
}

export default function DiceRoller() {
  const { actions } = useGame();
  const [open, setOpen] = useState(false);
  const [tray, setTray] = useState([]); // [{id, sides, label, color, icon}]
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [results, setResults] = useState(null); // {dice: [{sides, value, isCrit, isFumble}], total, formula}
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [rollContext, setRollContext] = useState(''); // e.g., "Ataque com Espada Longa"
  const [contextType, setContextType] = useState('other'); // attack, damage, skill, save, other
  const trayIdRef = useRef(0);

  // Listen for dice results from other players via chat
  // (already handled by GameContext DICE_RESULT reducer)

  const addDie = useCallback((diceType) => {
    setTray(prev => [...prev, { ...diceType, id: ++trayIdRef.current }]);
    setResults(null);
  }, []);

  const removeDie = useCallback((id) => {
    setTray(prev => prev.filter(d => d.id !== id));
  }, []);

  const clearTray = useCallback(() => {
    setTray([]);
    setModifier(0);
    setResults(null);
    setRollContext('');
    setContextType('other');
  }, []);

  const handleRoll = useCallback(async () => {
    if (tray.length === 0 || rolling) return;
    setRolling(true);
    setResults(null);

    // Wait for animation
    await new Promise(r => setTimeout(r, 1500));

    const diceResults = tray.map(d => {
      const value = rollSingleDie(d.sides);
      return {
        sides: d.sides,
        value,
        roll: value, // Alias for compatibility
        color: d.color,
        icon: d.icon,
        label: d.label,
        isCrit: d.sides === 20 && value === 20,
        isFumble: d.sides === 20 && value === 1,
        kept: true,
        dropped: false,
      };
    });

    const total = diceResults.reduce((sum, d) => sum + d.value, 0) + modifier;
    const formula = buildFormula(tray, modifier);

    // Build roll context string
    const contextLabel = ROLL_CONTEXTS.find(c => c.id === contextType);
    const fullContext = rollContext.trim() 
      ? `${contextLabel?.label || ''}: ${rollContext}`.trim()
      : (contextType !== 'other' ? contextLabel?.label : '');

    const rollData = { 
      dice: diceResults, 
      total, 
      formula, 
      rollContext: fullContext,
      rollDetails: {
        individual: diceResults,
        modifier: modifier,
        formula: formula
      },
      timestamp: new Date().toISOString() 
    };
    setResults(rollData);
    setRolling(false);

    // Add to history (keep last 10)
    setHistory(prev => [rollData, ...prev].slice(0, 10));

    // Broadcast via socket with context
    try {
      const notationWithContext = fullContext 
        ? `${formula} ${fullContext}`
        : formula;
      actions.rollDice(notationWithContext);
    } catch (e) {
      console.error('Failed to broadcast dice roll:', e);
    }

    // Clear context after roll
    setRollContext('');
  }, [tray, modifier, rolling, actions, rollContext, contextType]);

  const hasCrit = results?.dice.some(d => d.isCrit);
  const hasFumble = results?.dice.some(d => d.isFumble);

  return (
    <>
      {/* Toggle Button — rendered inline in right panel */}
      {!open && (
        <button className="dice-toggle-btn" onClick={() => setOpen(true)} title="Abrir Bandeja de Dados">
          🎲
        </button>
      )}

      {/* Dice Tray Panel */}
      {open && (
        <div className={`dice-tray-panel ${hasCrit ? 'crit-glow' : ''} ${hasFumble ? 'fumble-shake' : ''}`}>
          {/* Header */}
          <div className="dice-tray-header">
            <h3>🎲 Bandeja de Dados</h3>
            <div className="dice-tray-header-actions">
              <button
                className="dice-tray-history-btn"
                onClick={() => setShowHistory(!showHistory)}
                title="Histórico"
              >
                📜
              </button>
              <button className="dice-tray-close" onClick={() => setOpen(false)}>✕</button>
            </div>
          </div>

          {/* Dice Type Buttons */}
          <div className="dice-type-buttons">
            {DICE_TYPES.map(dt => (
              <button
                key={dt.sides}
                className="dice-type-btn"
                style={{ '--dice-color': dt.color }}
                onClick={() => addDie(dt)}
                disabled={rolling}
                title={`Adicionar ${dt.label}`}
              >
                <span className="dice-type-icon">{dt.icon}</span>
                <span className="dice-type-label">{dt.label}</span>
              </button>
            ))}
          </div>

          {/* Current Tray */}
          <div className="dice-tray-current">
            {tray.length === 0 ? (
              <div className="dice-tray-empty">Clique nos dados acima para adicionar</div>
            ) : (
              <>
                <div className="dice-tray-formula">{buildFormula(tray, modifier)}</div>
                <div className="dice-tray-dice">
                  {tray.map(d => (
                    <button
                      key={d.id}
                      className={`dice-in-tray ${rolling ? 'dice-rolling' : ''}`}
                      style={{ '--dice-color': d.color }}
                      onClick={() => !rolling && removeDie(d.id)}
                      title="Clique para remover"
                    >
                      {d.icon}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Roll Context Type */}
          <div className="dice-context-row">
            {ROLL_CONTEXTS.map(ctx => (
              <button
                key={ctx.id}
                className={`dice-context-btn ${contextType === ctx.id ? 'active' : ''}`}
                onClick={() => setContextType(ctx.id)}
                disabled={rolling}
                title={ctx.label}
              >
                <span>{ctx.icon}</span>
              </button>
            ))}
          </div>

          {/* Roll Context Input */}
          <div className="dice-context-input-row">
            <input
              type="text"
              className="dice-context-input"
              placeholder={`Descrição (ex: Espada Longa, Furtividade...)`}
              value={rollContext}
              onChange={(e) => setRollContext(e.target.value)}
              disabled={rolling}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tray.length > 0) {
                  handleRoll();
                }
              }}
            />
          </div>

          {/* Modifier */}
          <div className="dice-modifier-row">
            <span className="dice-modifier-label">Modificador:</span>
            <button className="dice-mod-btn" onClick={() => setModifier(m => m - 1)} disabled={rolling}>−</button>
            <span className="dice-modifier-value">{modifier >= 0 ? `+${modifier}` : modifier}</span>
            <button className="dice-mod-btn" onClick={() => setModifier(m => m + 1)} disabled={rolling}>+</button>
            <button className="dice-clear-btn" onClick={clearTray} disabled={rolling} title="Limpar bandeja">🗑️</button>
          </div>

          {/* Roll Button */}
          <button
            className={`dice-roll-btn ${rolling ? 'rolling' : ''}`}
            onClick={handleRoll}
            disabled={tray.length === 0 || rolling}
          >
            {rolling ? '🎲 Rolando...' : '⚔️ Rolar!'}
          </button>

          {/* Results */}
          {results && (
            <div className={`dice-results ${hasCrit ? 'dice-results-crit' : ''} ${hasFumble ? 'dice-results-fumble' : ''}`}>
              <div className="dice-results-individual">
                {results.dice.map((d, i) => (
                  <div
                    key={i}
                    className={`dice-result-die ${d.isCrit ? 'crit' : ''} ${d.isFumble ? 'fumble' : ''}`}
                    style={{ '--dice-color': d.color }}
                  >
                    <span className="dice-result-value">{d.value}</span>
                    <span className="dice-result-label">{d.label}</span>
                  </div>
                ))}
              </div>
              <div className="dice-results-total">
                {hasCrit && <span className="dice-crit-label">✨ CRÍTICO! ✨</span>}
                {hasFumble && <span className="dice-fumble-label">💀 FALHA CRÍTICA! 💀</span>}
                <span className="dice-total-number">{results.total}</span>
              </div>
            </div>
          )}

          {/* History */}
          {showHistory && history.length > 0 && (
            <div className="dice-history">
              <div className="dice-history-title">Últimas Rolagens</div>
              {history.map((h, i) => (
                <div key={i} className="dice-history-item">
                  {h.rollContext && (
                    <span className="dice-history-context">{h.rollContext}</span>
                  )}
                  <div className="dice-history-main">
                    <span className="dice-history-formula">{h.formula}</span>
                    <span className="dice-history-arrow">→</span>
                    <span className="dice-history-total">{h.total}</span>
                    <span className="dice-history-detail">
                      [{h.dice.map(d => d.value).join(', ')}]
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
