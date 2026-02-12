import React, { useState, useRef } from 'react';
import { parseDiceNotation, rollDice, formatDiceResult, getDicePresets, getDiceBreakdown, isValidDiceNotation } from '../utils/diceParser';

const DiceRoller = ({ onRoll = () => {}, disabled = false }) => {
  const [diceInput, setDiceInput] = useState('');
  const [isRolling, setIsRolling] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const inputRef = useRef(null);

  const presets = getDicePresets();

  const handleRoll = async (notation = diceInput) => {
    if (!notation.trim() || isRolling) return;

    const parsed = parseDiceNotation(notation);
    if (!parsed) {
      alert('Notação de dados inválida! Use formato como "2d20+5" ou "4d6kh3"');
      return;
    }

    setIsRolling(true);
    
    // Simulate dice rolling animation delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const result = rollDice(parsed);
    const breakdown = getDiceBreakdown(result);
    
    setLastResult(breakdown);
    setIsRolling(false);
    
    // Notify parent component
    onRoll({
      type: 'dice_roll',
      notation,
      result,
      breakdown,
      formatted: formatDiceResult(result)
    });
  };

  const handlePresetClick = (preset) => {
    handleRoll(preset.notation);
  };

  const handleInputSubmit = (e) => {
    e.preventDefault();
    handleRoll();
  };

  const handleInputChange = (e) => {
    setDiceInput(e.target.value);
  };

  const isValidInput = diceInput.trim() ? isValidDiceNotation(diceInput) : true;

  return (
    <div style={{
      background: 'var(--surface-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--spacing-md)',
      boxShadow: 'var(--shadow-md)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 'var(--spacing-md)',
        paddingBottom: 'var(--spacing-sm)',
        borderBottom: '1px solid var(--border-color)'
      }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-fantasy)',
          color: 'var(--color-primary)',
          fontSize: '1.1rem'
        }}>
          🎲 Dados
        </h3>
        {isRolling && (
          <div style={{
            color: 'var(--color-primary)',
            fontSize: '0.8rem',
            animation: 'pulse 1s infinite'
          }}>
            Rolando...
          </div>
        )}
      </div>

      {/* Dice Input */}
      <form onSubmit={handleInputSubmit} style={{ marginBottom: 'var(--spacing-md)' }}>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <input
            ref={inputRef}
            type="text"
            value={diceInput}
            onChange={handleInputChange}
            placeholder="/roll 2d20+5"
            disabled={disabled || isRolling}
            style={{
              flex: 1,
              padding: 'var(--spacing-sm) var(--spacing-md)',
              border: `1px solid ${!isValidInput ? 'var(--color-accent)' : 'var(--border-color)'}`,
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-light)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            disabled={disabled || isRolling || !diceInput.trim() || !isValidInput}
            style={{
              padding: 'var(--spacing-sm) var(--spacing-md)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: 'var(--bg-primary)',
              fontWeight: '600',
              cursor: disabled || isRolling ? 'not-allowed' : 'pointer',
              opacity: disabled || isRolling || !isValidInput ? 0.6 : 1,
              transition: 'all var(--transition-fast)'
            }}
          >
            Rolar
          </button>
        </div>
        {!isValidInput && diceInput.trim() && (
          <div style={{
            marginTop: 'var(--spacing-xs)',
            color: 'var(--color-accent)',
            fontSize: '0.75rem'
          }}>
            Notação inválida. Tente: 2d20+5, 4d6kh3, ou advantage
          </div>
        )}
      </form>

      {/* Quick Dice Presets */}
      <div style={{ marginBottom: 'var(--spacing-md)' }}>
        <div style={{
          fontSize: '0.8rem',
          color: 'var(--text-dim)',
          marginBottom: 'var(--spacing-sm)'
        }}>
          Dados Rápidos:
        </div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(50px, 1fr))',
          gap: 'var(--spacing-xs)'
        }}>
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => handlePresetClick(preset)}
              disabled={disabled || isRolling}
              style={{
                padding: 'var(--spacing-xs)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-light)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
                fontWeight: '600',
                cursor: disabled || isRolling ? 'not-allowed' : 'pointer',
                transition: 'all var(--transition-fast)',
                opacity: disabled || isRolling ? 0.6 : 1,
                ...(isRolling && {
                  animation: 'diceRoll 0.8s ease-in-out'
                })
              }}
              onMouseEnter={(e) => {
                if (!disabled && !isRolling) {
                  e.target.style.background = 'var(--color-primary)';
                  e.target.style.color = 'var(--bg-primary)';
                  e.target.style.borderColor = 'var(--color-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!disabled && !isRolling) {
                  e.target.style.background = 'var(--surface-light)';
                  e.target.style.color = 'var(--text-primary)';
                  e.target.style.borderColor = 'var(--border-color)';
                }
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Last Result Display */}
      {lastResult && (
        <div style={{
          background: 'var(--surface-light)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-md)',
          borderLeft: `4px solid var(--color-primary)`
        }}>
          <div style={{
            fontSize: '0.9rem',
            fontWeight: '600',
            color: 'var(--color-primary)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            {lastResult.formula}
          </div>

          {/* Individual Dice */}
          <div style={{
            display: 'flex',
            gap: 'var(--spacing-xs)',
            marginBottom: 'var(--spacing-sm)',
            flexWrap: 'wrap'
          }}>
            {lastResult.individual.map((die, index) => (
              <div
                key={index}
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: '600',
                  color: 'white',
                  background: die.dropped 
                    ? 'var(--text-dim)' 
                    : die.roll === 20 
                      ? 'var(--color-success)'
                      : die.roll === 1 
                        ? 'var(--color-accent)'
                        : 'var(--color-primary)',
                  textDecoration: die.dropped ? 'line-through' : 'none',
                  opacity: die.dropped ? 0.6 : 1,
                  boxShadow: die.kept ? 'var(--shadow-sm)' : 'none'
                }}
              >
                {die.roll}
              </div>
            ))}
          </div>

          {/* Calculation Breakdown */}
          <div style={{
            fontSize: '0.8rem',
            color: 'var(--text-dim)',
            marginBottom: 'var(--spacing-sm)'
          }}>
            {lastResult.individual
              .filter(die => !die.dropped)
              .map(die => die.roll)
              .join(' + ')}
            {lastResult.modifier !== 0 && ` ${lastResult.modifier >= 0 ? '+' : ''}${lastResult.modifier}`}
          </div>

          {/* Total */}
          <div style={{
            fontSize: '1.2rem',
            fontWeight: '700',
            color: 'var(--color-primary)',
            textAlign: 'center',
            padding: 'var(--spacing-sm)',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-sm)'
          }}>
            Total: {lastResult.total}
          </div>

          {/* Special Indicators */}
          {lastResult.advantage && (
            <div style={{
              marginTop: 'var(--spacing-sm)',
              fontSize: '0.7rem',
              color: 'var(--color-success)',
              textAlign: 'center'
            }}>
              ⚡ Vantagem
            </div>
          )}
          {lastResult.disadvantage && (
            <div style={{
              marginTop: 'var(--spacing-sm)',
              fontSize: '0.7rem',
              color: 'var(--color-accent)',
              textAlign: 'center'
            }}>
              💀 Desvantagem
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DiceRoller;