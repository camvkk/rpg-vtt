import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  const { state, actions } = useGame();
  const [tray, setTray] = useState([]); // [{id, sides, label, color, icon}]
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [results, setResults] = useState(null); // {dice: [{sides, value, isCrit, isFumble}], total, formula}
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [rollContext, setRollContext] = useState(''); // e.g., "Ataque com Espada Longa"
  const [contextType, setContextType] = useState('other'); // attack, damage, skill, save, other
  const [pendingRoll, setPendingRoll] = useState(null); // formula we're waiting for
  const trayIdRef = useRef(0);

  // Listen for dice results from server to sync with our pending roll
  useEffect(() => {
    if (!pendingRoll || !state.chat?.length) return;
    
    // Find the most recent dice result that matches our pending roll
    const recentDiceResult = state.chat
      .filter(msg => msg.type === 'dice_result')
      .find(msg => {
        // Match if it's our roll (same formula base, ignoring spaces)
        const msgFormula = (msg.formula || '').replace(/\s/g, '').toLowerCase();
        const pendingFormula = pendingRoll.replace(/\s/g, '').toLowerCase();
        // Simple check: both should have same dice notation at the start
        return msgFormula === pendingFormula || 
               msgFormula.includes(pendingFormula) || 
               pendingFormula.includes(msgFormula);
      });

    if (recentDiceResult && rolling) {
      // Parse the server result into our display format
      // Server sends rollDetails array with {results, keptResults, droppedResults}
      const serverRollDetails = recentDiceResult.rollDetails?.individual || 
                                recentDiceResult.breakdown?.individual || 
                                [];
      
      // Flatten all individual dice results from server
      // Each tray die corresponds to a result
      const diceResults = tray.map((dieInfo, i) => {
        // Try to find the corresponding server roll value
        let value = 0;
        
        if (Array.isArray(serverRollDetails) && serverRollDetails[i] !== undefined) {
          const serverRoll = serverRollDetails[i];
          value = serverRoll.value || serverRoll.roll || serverRoll || 0;
        }
        
        // Fallback: if we don't have individual values, calculate from total
        if (value === 0 && recentDiceResult.total && tray.length === 1) {
          value = recentDiceResult.total - modifier;
        }
        
        return {
          sides: dieInfo.sides,
          value: value,
          roll: value,
          color: dieInfo.color,
          icon: dieInfo.icon,
          label: dieInfo.label,
          isCrit: dieInfo.sides === 20 && value === 20,
          isFumble: dieInfo.sides === 20 && value === 1,
          kept: true,
          dropped: false,
        };
      });

      const rollData = { 
        dice: diceResults, 
        total: recentDiceResult.total, 
        formula: recentDiceResult.formula || pendingRoll,
        rollContext: recentDiceResult.rollContext || '',
        timestamp: new Date().toISOString() 
      };
      
      setResults(rollData);
      setRolling(false);
      setPendingRoll(null);
      setHistory(prev => [rollData, ...prev].slice(0, 10));
    }
  }, [state.chat, pendingRoll, rolling, tray, modifier]);

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

    const formula = buildFormula(tray, modifier);

    // Build roll context string
    const contextLabel = ROLL_CONTEXTS.find(c => c.id === contextType);
    const fullContext = rollContext.trim() 
      ? `${contextLabel?.label || ''}: ${rollContext}`.trim()
      : (contextType !== 'other' ? contextLabel?.label : '');

    const notationWithContext = fullContext 
      ? `${formula} ${fullContext}`
      : formula;

    // Set pending roll so we can match the server response
    setPendingRoll(formula);

    // Send to server - the server will roll and broadcast the result
    // Our useEffect will catch the result and update the UI
    try {
      actions.rollDice(notationWithContext);
    } catch (e) {
      console.error('Failed to send dice roll:', e);
      setRolling(false);
      setPendingRoll(null);
    }

    // Timeout fallback - if server doesn't respond in 5s, stop rolling animation
    setTimeout(() => {
      setRolling(prev => {
        if (prev) {
          setPendingRoll(null);
          return false;
        }
        return prev;
      });
    }, 5000);

    // Clear context after roll
    setRollContext('');
  }, [tray, modifier, rolling, actions, rollContext, contextType]);

  const hasCrit = results?.dice.some(d => d.isCrit);
  const hasFumble = results?.dice.some(d => d.isFumble);

  return (
    <div className={`dice-tray-content ${hasCrit ? 'crit-glow' : ''} ${hasFumble ? 'fumble-shake' : ''}`}>
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

      {/* History Toggle */}
      <button
        className="dice-history-toggle"
        onClick={() => setShowHistory(!showHistory)}
      >
        📜 {showHistory ? 'Ocultar' : 'Ver'} Histórico ({history.length})
      </button>

      {/* History */}
      {showHistory && history.length > 0 && (
        <div className="dice-history">
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
  );
}
