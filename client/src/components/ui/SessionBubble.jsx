import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';
import Bubble from './Bubble';

/**
 * SessionBubble - Painel de Jogadores & Cenas como Bubble arrastável
 * Substitui o antigo leftPanel FloatingWindow
 */
export default function SessionBubble({ initialPosition = { x: 16, y: 80 } }) {
  const { state } = useGame();
  const { players, player: currentPlayer } = state;
  const [activeTab, setActiveTab] = useState('players');

  const tabs = [
    { id: 'players', icon: '👥', label: 'Jogadores' },
    { id: 'scenes', icon: '🗺️', label: 'Cenas' },
  ];

  const connectedPlayers = players.filter(p => p.is_connected !== false);

  return (
    <Bubble
      id="session"
      title="Sessão"
      icon="🎮"
      initialPosition={initialPosition}
      minWidth={300}
      minHeight={250}
      accentColor="#6366f1"
    >
      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: 4,
        marginBottom: 12,
        background: 'var(--bg-surface-light)',
        borderRadius: 8,
        padding: 4,
      }}>
        {tabs.map(tab => (
          <motion.button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              flex: 1,
              padding: '8px 12px',
              border: 'none',
              borderRadius: 6,
              background: activeTab === tab.id ? 'var(--color-primary)' : 'transparent',
              color: activeTab === tab.id ? 'white' : 'var(--color-text-dim)',
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              transition: 'background 0.2s',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </motion.button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === 'players' && (
          <motion.div
            key="players"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
            }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Online
              </span>
              <span style={{ 
                fontSize: '0.75rem', 
                background: 'var(--color-success)', 
                color: 'white',
                padding: '2px 8px',
                borderRadius: 10,
                fontWeight: 600,
              }}>
                {connectedPlayers.length}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {connectedPlayers.map((p, i) => {
                const isMe = p.id === currentPlayer.id || p.name === currentPlayer.name;
                const color = getPlayerColor(p.name);
                
                return (
                  <motion.div
                    key={p.id || i}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      background: isMe ? `${color}15` : 'var(--bg-surface-light)',
                      borderRadius: 8,
                      border: isMe ? `1px solid ${color}40` : '1px solid transparent',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${color}33, ${color}66)`,
                      border: `2px solid ${color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      color: color,
                    }}>
                      {p.name?.[0]?.toUpperCase() || '?'}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: 600, 
                        fontSize: '0.9rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}>
                        {p.name}
                        {isMe && (
                          <span style={{ 
                            fontSize: '0.65rem', 
                            background: color,
                            color: 'white',
                            padding: '1px 6px',
                            borderRadius: 4,
                          }}>
                            você
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-dim)' }}>
                        {p.is_dm ? '👑 Mestre' : '🎭 Jogador'}
                      </div>
                    </div>

                    {/* Status */}
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 8px #10b981',
                      }}
                    />
                  </motion.div>
                );
              })}

              {connectedPlayers.length === 0 && (
                <div style={{ 
                  textAlign: 'center', 
                  padding: 20, 
                  color: 'var(--color-text-dim)',
                  fontSize: '0.85rem',
                }}>
                  Nenhum jogador conectado
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeTab === 'scenes' && (
          <motion.div
            key="scenes"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            style={{
              textAlign: 'center',
              padding: 20,
              color: 'var(--color-text-dim)',
              fontSize: '0.85rem',
            }}
          >
            <span style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }}>🗺️</span>
            Use o Dock inferior para gerenciar cenas
          </motion.div>
        )}
      </AnimatePresence>
    </Bubble>
  );
}

// Helper: gera cor baseada no nome
function getPlayerColor(name) {
  const colors = [
    '#e2b714', '#c77dff', '#51cf66', '#74c0fc', '#ff6b6b',
    '#ffd43b', '#63e6be', '#ff922b', '#e599f7', '#20c997',
  ];
  const hash = (name || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
