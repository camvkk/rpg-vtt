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
  const [rollStartTime, setRollStartTime] = useState(null); // timestamp when roll was initiated
  const trayIdRef = useRef(0);
  const lastProcessedResultRef = useRef(null); // prevent processing same result twice

  // Listen for dice results from server to sync with our pending roll
  useEffect(() => {
    if (!rolling || !rollStartTime || !state.chat?.length) return;
    
    // Find dice results that arrived AFTER we started rolling
    const diceResults = state.chat.filter(msg => msg.type === 'dice_result');
    
    // Get the most recent result
    const recentDiceResult = diceResults[diceResults.length - 1];
    
    if (!recentDiceResult) return;
    
    // Check if this is a NEW result (not one we already processed)
    const resultId = recentDiceResult.id || recentDiceResult.timestamp;
    if (lastProcessedResultRef.current === resultId) return;
    
    // Check if this result arrived after we started rolling
    // Use timestamp from result or assume it's new if no timestamp
    const resultTime = recentDiceResult.timestamp ? new Date(recentDiceResult.timestamp).getTime() : Date.now();
    
    // Allow 2 second window for server latency
    if (resultTime < rollStartTime - 2000) return;
    
    // Mark as processed
    lastProcessedResultRef.current = resultId;
    
    // Get individual dice values from server
    const serverIndividual = recentDiceResult.breakdown?.individual || 
                             recentDiceResult.rollDetails?.individual || 
                             [];
    
    // Filter to only kept dice (not dropped by advantage/disadvantage)
    const keptServerRolls = serverIndividual.filter(r => r.kept !== false && !r.dropped);
    
    // Build dice results matching the tray
    const displayDice = tray.map((dieInfo, i) => {
      let value = 0;
      
      if (keptServerRolls[i] !== undefined) {
        const serverRoll = keptServerRolls[i];
        value = serverRoll.value || serverRoll.roll || (typeof serverRoll === 'number' ? serverRoll : 0);
      }
      
      // Fallback for single die: calculate from total minus modifier
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
      dice: displayDice, 
      total: recentDiceResult.total, 
      formula: recentDiceResult.formula || pendingRoll || '',
      rollContext: recentDiceResult.rollContext || '',
      timestamp: recentDiceResult.timestamp || new Date().toISOString() 
    };
    
    setResults(rollData);
    setRolling(false);
    setPendingRoll(null);
    setRollStartTime(null);
    setHistory(prev => [rollData, ...prev].slice(0, 10));
  }, [state.chat, rolling, rollStartTime, tray, modifier, pendingRoll]);

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
    
    // Mark the start time BEFORE changing state
    const startTime = Date.now();
    
    setRolling(true);
    setResults(null);
    setRollStartTime(startTime);

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
      setRollStartTime(null);
    }

    // Timeout fallback - if server doesn't respond in 5s, stop rolling animation
    setTimeout(() => {
      setRolling(prev => {
        if (prev) {
          setPendingRoll(null);
          setRollStartTime(null);
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
