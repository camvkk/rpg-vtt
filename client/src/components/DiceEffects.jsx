import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../contexts/GameContext';

// ═══════════════════════════════════════════════════
// 🎲 Dice Effects - Epic Nat 20 / Nat 1 Visuals
// ═══════════════════════════════════════════════════

const PARTICLE_COUNT = 50;
const EFFECT_DURATION = 2000; // ms

// Sound effects using Web Audio API
const playSound = (type) => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    if (type === 'crit') {
      // Epic ascending arpeggio for crit
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(880, audioContext.currentTime + 0.1);
      oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.2);
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } else {
      // Descending "fail" sound
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(300, audioContext.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0.2, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.4);
    }
  } catch (e) {
    // Audio not supported, fail silently
  }
};

// Particle component
const Particle = ({ type, index, total }) => {
  const angle = (index / total) * Math.PI * 2;
  const distance = 100 + Math.random() * 200;
  const size = 4 + Math.random() * 8;
  const delay = Math.random() * 0.3;
  
  const style = {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: type === 'crit' ? '50%' : '2px',
    background: type === 'crit' 
      ? `radial-gradient(circle, #ffd700, #ff8c00)`
      : `linear-gradient(135deg, #ff4444, #880000)`,
    boxShadow: type === 'crit'
      ? '0 0 10px #ffd700, 0 0 20px #ff8c00'
      : '0 0 5px #ff0000',
    transform: 'translate(-50%, -50%)',
    animation: `particle-${type} 1s ease-out ${delay}s forwards`,
    opacity: 0,
    '--angle': `${angle}rad`,
    '--distance': `${distance}px`,
    '--rotation': `${Math.random() * 720 - 360}deg`,
  };
  
  return <div style={style} />;
};

// Main effect overlay component
export default function DiceEffects() {
  const { state } = useGame();
  const [activeEffect, setActiveEffect] = useState(null); // 'crit' | 'fumble' | null
  const lastChatRef = useRef(null);
  const timeoutRef = useRef(null);
  
  // Watch for dice results in chat
  useEffect(() => {
    if (!state.chat?.length) return;
    
    // Get the most recent dice result
    const recentDice = [...state.chat]
      .filter(msg => msg.type === 'dice_result')
      .pop();
    
    if (!recentDice || recentDice === lastChatRef.current) return;
    lastChatRef.current = recentDice;
    
    // Check for nat 20 or nat 1 on d20
    const rolls = recentDice.rollDetails?.individual || recentDice.breakdown?.individual || [];
    const hasD20 = recentDice.formula?.toLowerCase().includes('d20');
    
    if (hasD20) {
      // Check if any d20 rolled a 20 or 1
      const d20Rolls = rolls.filter(r => {
        const sides = r.sides || r.die || 20;
        return sides === 20;
      });
      
      const hasCrit = d20Rolls.some(r => (r.value || r.roll || r) === 20) || 
                      recentDice.isCritical || 
                      recentDice.breakdown?.isCritical;
      const hasFumble = d20Rolls.some(r => (r.value || r.roll || r) === 1) ||
                        recentDice.isFumble ||
                        recentDice.breakdown?.isFumble;
      
      if (hasCrit) {
        triggerEffect('crit');
      } else if (hasFumble) {
        triggerEffect('fumble');
      }
    }
  }, [state.chat]);
  
  const triggerEffect = (type) => {
    // Clear any existing effect
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    setActiveEffect(type);
    playSound(type);
    
    // Auto-clear after duration
    timeoutRef.current = setTimeout(() => {
      setActiveEffect(null);
    }, EFFECT_DURATION);
  };
  
  if (!activeEffect) return null;
  
  const isCrit = activeEffect === 'crit';
  
  return (
    <div 
      className={`dice-effects-overlay ${activeEffect}`}
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {/* Screen flash */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: isCrit 
            ? 'radial-gradient(circle at center, rgba(255, 215, 0, 0.4), transparent 70%)'
            : 'radial-gradient(circle at center, rgba(255, 0, 0, 0.3), transparent 70%)',
          animation: 'flash 0.3s ease-out',
        }}
      />
      
      {/* Center burst text */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '4rem',
          fontWeight: 900,
          color: isCrit ? '#ffd700' : '#ff4444',
          textShadow: isCrit 
            ? '0 0 20px #ffd700, 0 0 40px #ff8c00, 0 0 60px #ff4500'
            : '0 0 20px #ff0000, 0 0 40px #880000',
          animation: 'burst-text 0.8s ease-out forwards',
          fontFamily: 'Georgia, serif',
          letterSpacing: '4px',
        }}
      >
        {isCrit ? '✨ CRÍTICO! ✨' : '💀 FALHA! 💀'}
      </div>
      
      {/* Particles */}
      {Array.from({ length: PARTICLE_COUNT }).map((_, i) => (
        <Particle key={i} type={activeEffect} index={i} total={PARTICLE_COUNT} />
      ))}
      
      {/* Screen shake applied via CSS class on body */}
      <style>{`
        @keyframes flash {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        @keyframes burst-text {
          0% { 
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          20% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) scale(1);
            opacity: 0;
          }
        }
        
        @keyframes particle-crit {
          0% {
            transform: translate(-50%, -50%) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: 
              translate(
                calc(-50% + cos(var(--angle)) * var(--distance)),
                calc(-50% + sin(var(--angle)) * var(--distance))
              )
              rotate(var(--rotation));
            opacity: 0;
          }
        }
        
        @keyframes particle-fumble {
          0% {
            transform: translate(-50%, -50%) rotate(0deg);
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            transform: 
              translate(
                calc(-50% + cos(var(--angle)) * var(--distance) * 0.5),
                calc(-50% + sin(var(--angle)) * var(--distance) * 0.5 + 100px)
              )
              rotate(var(--rotation));
            opacity: 0;
          }
        }
        
        .dice-effects-overlay.crit ~ *, 
        .dice-effects-overlay.crit {
          animation: screen-shake-crit 0.5s ease-out;
        }
        
        .dice-effects-overlay.fumble ~ *,
        .dice-effects-overlay.fumble {
          animation: screen-shake-fumble 0.6s ease-out;
        }
        
        @keyframes screen-shake-crit {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-5px, -5px); }
          20% { transform: translate(5px, 5px); }
          30% { transform: translate(-5px, 5px); }
          40% { transform: translate(5px, -5px); }
          50% { transform: translate(-3px, -3px); }
          60% { transform: translate(3px, 3px); }
          70% { transform: translate(-2px, 2px); }
          80% { transform: translate(2px, -2px); }
          90% { transform: translate(-1px, -1px); }
        }
        
        @keyframes screen-shake-fumble {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          10% { transform: translate(-8px, 0) rotate(-1deg); }
          20% { transform: translate(8px, 0) rotate(1deg); }
          30% { transform: translate(-6px, 0) rotate(-0.5deg); }
          40% { transform: translate(6px, 0) rotate(0.5deg); }
          50% { transform: translate(-4px, 0) rotate(-0.3deg); }
          60% { transform: translate(4px, 0) rotate(0.3deg); }
          70% { transform: translate(-2px, 0); }
          80% { transform: translate(2px, 0); }
          90% { transform: translate(-1px, 0); }
        }
      `}</style>
    </div>
  );
}
