import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';
import Bubble from './Bubble';

// Dice types with their visual configurations
const DICE_TYPES = [
  { sides: 4,  label: 'd4',  icon: '▲', color: '#e74c3c', gradient: 'linear-gradient(135deg, #e74c3c, #c0392b)' },
  { sides: 6,  label: 'd6',  icon: '⬡', color: '#e67e22', gradient: 'linear-gradient(135deg, #e67e22, #d35400)' },
  { sides: 8,  label: 'd8',  icon: '◆', color: '#2ecc71', gradient: 'linear-gradient(135deg, #2ecc71, #27ae60)' },
  { sides: 10, label: 'd10', icon: '◈', color: '#3498db', gradient: 'linear-gradient(135deg, #3498db, #2980b9)' },
  { sides: 12, label: 'd12', icon: '⬠', color: '#9b59b6', gradient: 'linear-gradient(135deg, #9b59b6, #8e44ad)' },
  { sides: 20, label: 'd20', icon: '✦', color: '#f1c40f', gradient: 'linear-gradient(135deg, #f1c40f, #f39c12)' },
];

// Roll context presets
const ROLL_CONTEXTS = [
  { id: 'attack', label: 'Ataque', icon: '⚔️' },
  { id: 'damage', label: 'Dano', icon: '💥' },
  { id: 'skill', label: 'Perícia', icon: '🎯' },
  { id: 'save', label: 'Salvaguarda', icon: '🛡️' },
  { id: 'other', label: 'Outro', icon: '🎲' },
];

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

const DiceBubble = ({ 
  initialPosition = { x: window.innerWidth - 350, y: 100 },
  onMinimize,
}) => {
  const { state, actions } = useGame();
  const [tray, setTray] = useState([]);
  const [modifier, setModifier] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [results, setResults] = useState(null);
  const [rollContext, setRollContext] = useState('');
  const [contextType, setContextType] = useState('other');
  const [shakeIntensity, setShakeIntensity] = useState(0);
  const [holdingButton, setHoldingButton] = useState(null);
  const [rollStartTime, setRollStartTime] = useState(null);
  const [unseenRolls, setUnseenRolls] = useState(0);
  const isExpandedRef = useRef(false);
  const trayIdRef = useRef(0);
  const holdTimerRef = useRef(null);
  const lastProcessedResultRef = useRef(null);
  const lastSeenResultRef = useRef(null);
  const MIN_ROLL_ANIMATION_MS = 2200;
  
  // Track unseen dice rolls from others
  useEffect(() => {
    if (!state.latestDiceResult) return;
    const resultId = state.latestDiceResult.id || state.latestDiceResult.timestamp;
    if (lastSeenResultRef.current === resultId) return;
    lastSeenResultRef.current = resultId;
    
    // Se não é minha rolagem e bubble está minimizado, incrementa
    if (state.latestDiceResult.authorId !== state.player?.id && !isExpandedRef.current) {
      setUnseenRolls(prev => prev + 1);
    }
  }, [state.latestDiceResult, state.player?.id]);

  // Listen for dice results from server
  useEffect(() => {
    if (!rolling || !rollStartTime || !state.latestDiceResult) return;
    
    const recentDiceResult = state.latestDiceResult;
    const resultId = recentDiceResult.id || recentDiceResult.timestamp;
    if (lastProcessedResultRef.current === resultId) return;
    
    const resultTime = recentDiceResult.timestamp ? new Date(recentDiceResult.timestamp).getTime() : Date.now();
    if (resultTime < rollStartTime - 2000) return;
    
    lastProcessedResultRef.current = resultId;
    
    const serverIndividual = recentDiceResult.breakdown?.individual || 
                             recentDiceResult.rollDetails?.individual || [];
    const keptServerRolls = serverIndividual.filter(r => r.kept !== false && !r.dropped);
    
    const displayDice = tray.map((dieInfo, i) => {
      let value = 0;
      if (keptServerRolls[i] !== undefined) {
        const serverRoll = keptServerRolls[i];
        value = serverRoll.value || serverRoll.roll || (typeof serverRoll === 'number' ? serverRoll : 0);
      }
      if (value === 0 && recentDiceResult.total && tray.length === 1) {
        value = recentDiceResult.total - modifier;
      }
      return {
        ...dieInfo,
        value,
        isCrit: dieInfo.sides === 20 && value === 20,
        isFumble: dieInfo.sides === 20 && value === 1,
      };
    });

    const rollData = { 
      dice: displayDice, 
      total: recentDiceResult.total, 
      formula: recentDiceResult.formula || buildFormula(tray, modifier),
      rollContext: recentDiceResult.rollContext || '',
      timestamp: recentDiceResult.timestamp || new Date().toISOString() 
    };
    
    const elapsedMs = Date.now() - rollStartTime;
    const remainingMs = Math.max(0, MIN_ROLL_ANIMATION_MS - elapsedMs);
    
    setTimeout(() => {
      setResults(rollData);
      setRolling(false);
      setRollStartTime(null);
      setShakeIntensity(0);
    }, remainingMs);
  }, [state.latestDiceResult, rolling, rollStartTime, tray, modifier]);

  // Handle button hold for shake intensity
  const handleHoldStart = useCallback((diceType) => {
    setHoldingButton(diceType.sides);
    setShakeIntensity(0.5);
    
    holdTimerRef.current = setInterval(() => {
      setShakeIntensity(prev => Math.min(prev + 0.15, 3));
    }, 100);
  }, []);

  const handleHoldEnd = useCallback((diceType) => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    
    // Add die with intensity-based animation
    setTray(prev => [...prev, { ...diceType, id: ++trayIdRef.current, addedIntensity: shakeIntensity }]);
    setResults(null);
    setHoldingButton(null);
    setShakeIntensity(0);
  }, [shakeIntensity]);

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
    
    const startTime = Date.now();
    setRolling(true);
    setResults(null);
    setRollStartTime(startTime);
    setShakeIntensity(2); // Max shake during roll

    const formula = buildFormula(tray, modifier);
    const contextLabel = ROLL_CONTEXTS.find(c => c.id === contextType);
    const fullContext = rollContext.trim() 
      ? `${contextLabel?.label || ''}: ${rollContext}`.trim()
      : (contextType !== 'other' ? contextLabel?.label : '');

    const notationWithContext = fullContext 
      ? `${formula} ${fullContext}`
      : formula;

    try {
      actions.rollDice(notationWithContext);
    } catch (e) {
      console.error('Failed to send dice roll:', e);
      setRolling(false);
      setRollStartTime(null);
      setShakeIntensity(0);
    }

    // Timeout fallback
    setTimeout(() => {
      setRolling(prev => {
        if (prev) {
          setRollStartTime(null);
          setShakeIntensity(0);
          return false;
        }
        return prev;
      });
    }, 5000);

    setRollContext('');
  }, [tray, modifier, rolling, actions, rollContext, contextType]);

  const hasCrit = results?.dice.some(d => d.isCrit);
  const hasFumble = results?.dice.some(d => d.isFumble);

  return (
    <Bubble
      id="dice-bubble"
      title="Dados"
      icon="🎲"
      initialPosition={initialPosition}
      onMinimize={() => { isExpandedRef.current = false; onMinimize?.(); }}
      onExpand={() => { isExpandedRef.current = true; setUnseenRolls(0); }}
      badge={unseenRolls}
      minWidth={300}
      minHeight={380}
      accentColor="#f1c40f"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
        {/* Dice Type Buttons */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, 1fr)',
          gap: 6,
        }}>
          {DICE_TYPES.map(dt => (
            <motion.button
              key={dt.sides}
              onMouseDown={() => handleHoldStart(dt)}
              onMouseUp={() => handleHoldEnd(dt)}
              onMouseLeave={() => {
                if (holdingButton === dt.sides) {
                  handleHoldEnd(dt);
                }
              }}
              onTouchStart={() => handleHoldStart(dt)}
              onTouchEnd={() => handleHoldEnd(dt)}
              disabled={rolling}
              style={{
                aspectRatio: '1',
                border: 'none',
                borderRadius: 10,
                background: holdingButton === dt.sides ? dt.gradient : `${dt.color}22`,
                cursor: rolling ? 'not-allowed' : 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                transition: 'all 0.15s',
              }}
              whileHover={{ scale: 1.08, background: `${dt.color}44` }}
              whileTap={{ scale: 0.95 }}
              animate={holdingButton === dt.sides ? {
                x: [0, -shakeIntensity, shakeIntensity, -shakeIntensity, 0],
                transition: { repeat: Infinity, duration: 0.1 }
              } : {}}
            >
              <span style={{ fontSize: '1.3rem', color: dt.color }}>{dt.icon}</span>
              <span style={{ fontSize: '0.65rem', color: '#a0aec0', fontWeight: 600 }}>{dt.label}</span>
            </motion.button>
          ))}
        </div>

        {/* Current Tray */}
        <div style={{
          minHeight: 70,
          background: 'rgba(0,0,0,0.3)',
          borderRadius: 12,
          padding: '8px 12px',
          border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {tray.length === 0 ? (
            <div style={{
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#718096',
              fontSize: '0.8rem',
              fontStyle: 'italic',
            }}>
              Segure um dado para adicionar
            </div>
          ) : (
            <>
              <div style={{
                fontSize: '0.85rem',
                color: '#e2b714',
                fontWeight: 600,
                marginBottom: 6,
                fontFamily: 'monospace',
              }}>
                {buildFormula(tray, modifier)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                <AnimatePresence mode="popLayout">
                  {tray.map(d => (
                    <motion.button
                      key={d.id}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ 
                        scale: 1, 
                        rotate: 0,
                        x: rolling ? [0, -3 * shakeIntensity, 3 * shakeIntensity, -3 * shakeIntensity, 0] : 0,
                      }}
                      exit={{ scale: 0, rotate: 180 }}
                      transition={rolling ? { 
                        x: { repeat: Infinity, duration: 0.15 }
                      } : { type: 'spring', stiffness: 400, damping: 15 }}
                      onClick={() => !rolling && removeDie(d.id)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        border: 'none',
                        background: d.gradient,
                        color: '#fff',
                        fontSize: '1rem',
                        cursor: rolling ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: rolling ? `0 0 12px ${d.color}88` : `0 2px 8px ${d.color}44`,
                      }}
                      whileHover={!rolling ? { scale: 1.1 } : {}}
                      title="Clique para remover"
                    >
                      {d.icon}
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </>
          )}
        </div>

        {/* Roll Context Type */}
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {ROLL_CONTEXTS.map(ctx => (
            <motion.button
              key={ctx.id}
              onClick={() => setContextType(ctx.id)}
              disabled={rolling}
              style={{
                padding: '4px 8px',
                border: contextType === ctx.id ? '2px solid #e2b714' : '1px solid #4a5568',
                borderRadius: 8,
                background: contextType === ctx.id ? 'rgba(226,183,20,0.15)' : 'transparent',
                color: contextType === ctx.id ? '#e2b714' : '#a0aec0',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {ctx.icon}
            </motion.button>
          ))}
        </div>

        {/* Context Input */}
        <input
          type="text"
          placeholder={`Descrição (ex: Espada Longa...)`}
          value={rollContext}
          onChange={(e) => setRollContext(e.target.value)}
          disabled={rolling}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && tray.length > 0) {
              handleRoll();
            }
          }}
          style={{
            padding: '8px 12px',
            border: '1px solid #4a5568',
            borderRadius: 8,
            background: 'rgba(45,55,72,0.5)',
            color: '#e2e8f0',
            fontSize: '0.85rem',
          }}
        />

        {/* Modifier Row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}>
          <span style={{ color: '#a0aec0', fontSize: '0.8rem' }}>Modificador:</span>
          <motion.button
            onClick={() => setModifier(m => m - 1)}
            disabled={rolling}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1px solid #4a5568',
              background: '#2d3748',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
            whileHover={{ scale: 1.1, background: '#4a5568' }}
            whileTap={{ scale: 0.9 }}
          >
            −
          </motion.button>
          <span style={{
            minWidth: 40,
            textAlign: 'center',
            fontSize: '1.1rem',
            fontWeight: 700,
            color: modifier === 0 ? '#a0aec0' : modifier > 0 ? '#2ecc71' : '#e74c3c',
          }}>
            {modifier >= 0 ? `+${modifier}` : modifier}
          </span>
          <motion.button
            onClick={() => setModifier(m => m + 1)}
            disabled={rolling}
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '1px solid #4a5568',
              background: '#2d3748',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '1rem',
            }}
            whileHover={{ scale: 1.1, background: '#4a5568' }}
            whileTap={{ scale: 0.9 }}
          >
            +
          </motion.button>
          <motion.button
            onClick={clearTray}
            disabled={rolling}
            style={{
              padding: '4px 8px',
              border: '1px solid #4a5568',
              borderRadius: 6,
              background: 'transparent',
              color: '#718096',
              cursor: 'pointer',
              fontSize: '0.75rem',
            }}
            whileHover={{ scale: 1.05, color: '#ff6b6b' }}
            whileTap={{ scale: 0.95 }}
          >
            🗑️ Limpar
          </motion.button>
        </div>

        {/* Roll Button */}
        <motion.button
          onClick={handleRoll}
          disabled={tray.length === 0 || rolling}
          style={{
            padding: '12px',
            border: 'none',
            borderRadius: 12,
            background: rolling 
              ? 'linear-gradient(135deg, #e2b714, #f39c12)'
              : 'linear-gradient(135deg, #2ecc71, #27ae60)',
            color: '#fff',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: tray.length === 0 || rolling ? 'not-allowed' : 'pointer',
            opacity: tray.length === 0 ? 0.5 : 1,
            boxShadow: rolling ? '0 0 20px #e2b71466' : '0 4px 12px rgba(46,204,113,0.3)',
          }}
          animate={rolling ? {
            scale: [1, 1.02, 1],
            boxShadow: [
              '0 0 20px #e2b71466',
              '0 0 30px #e2b71488',
              '0 0 20px #e2b71466',
            ],
          } : {}}
          transition={rolling ? { repeat: Infinity, duration: 0.5 } : {}}
          whileHover={!rolling && tray.length > 0 ? { scale: 1.03 } : {}}
          whileTap={!rolling && tray.length > 0 ? { scale: 0.98 } : {}}
        >
          {rolling ? '🎲 Rolando...' : '⚔️ Rolar!'}
        </motion.button>

        {/* Results */}
        <AnimatePresence>
          {results && (
            <motion.div
              initial={{ scale: 0.5, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{
                padding: 12,
                background: hasCrit 
                  ? 'linear-gradient(135deg, rgba(241,196,15,0.2), rgba(243,156,18,0.1))'
                  : hasFumble
                    ? 'linear-gradient(135deg, rgba(231,76,60,0.2), rgba(192,57,43,0.1))'
                    : 'rgba(0,0,0,0.3)',
                borderRadius: 12,
                border: hasCrit 
                  ? '2px solid #f1c40f'
                  : hasFumble
                    ? '2px solid #e74c3c'
                    : '1px solid rgba(255,255,255,0.1)',
                boxShadow: hasCrit 
                  ? '0 0 24px rgba(241,196,15,0.4)'
                  : hasFumble
                    ? '0 0 24px rgba(231,76,60,0.4)'
                    : 'none',
              }}
            >
              {/* Individual dice results */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginBottom: 8 }}>
                {results.dice.map((d, i) => (
                  <motion.div
                    key={i}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: i * 0.1, type: 'spring', stiffness: 400 }}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: d.isCrit ? '#f1c40f' : d.isFumble ? '#e74c3c' : d.gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: '1rem',
                      fontWeight: 700,
                      boxShadow: d.isCrit || d.isFumble ? `0 0 16px ${d.isCrit ? '#f1c40f' : '#e74c3c'}88` : 'none',
                    }}
                  >
                    {d.value}
                  </motion.div>
                ))}
              </div>

              {/* Critical/Fumble label */}
              {hasCrit && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: 2, duration: 0.3 }}
                  style={{
                    textAlign: 'center',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#f1c40f',
                    marginBottom: 4,
                  }}
                >
                  ✨ CRÍTICO! ✨
                </motion.div>
              )}
              {hasFumble && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: 2, duration: 0.3 }}
                  style={{
                    textAlign: 'center',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: '#e74c3c',
                    marginBottom: 4,
                  }}
                >
                  💀 FALHA CRÍTICA! 💀
                </motion.div>
              )}

              {/* Total */}
              <motion.div
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ delay: results.dice.length * 0.1, type: 'spring', stiffness: 300 }}
                style={{
                  textAlign: 'center',
                  fontSize: '2rem',
                  fontWeight: 800,
                  color: hasCrit ? '#f1c40f' : hasFumble ? '#e74c3c' : '#e2e8f0',
                  textShadow: hasCrit 
                    ? '0 0 20px #f1c40f88'
                    : hasFumble
                      ? '0 0 20px #e74c3c88'
                      : '0 2px 4px rgba(0,0,0,0.5)',
                }}
              >
                {results.total}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Bubble>
  );
};

export default DiceBubble;
