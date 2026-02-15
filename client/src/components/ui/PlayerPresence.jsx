import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';
import './PlayerPresence.css';

/**
 * PlayerPresence - Mostra avatares dos players conectados (Owlbear Rodeo style)
 * Posicionado no canto superior direito, mostra quem está online e suas ações
 */
export default function PlayerPresence() {
  const { state } = useGame();
  const { players, player: currentPlayer, tokens } = state;
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [draggingPlayers, setDraggingPlayers] = useState(new Map());

  // Filtra apenas jogadores conectados (exceto DM se preferir)
  const connectedPlayers = useMemo(() => {
    return players.filter(p => p.is_connected !== false);
  }, [players]);

  // Detecta quem está arrastando tokens
  useEffect(() => {
    const newDragging = new Map();
    tokens.forEach(token => {
      if (token.isDragging && token.draggedBy) {
        newDragging.set(token.draggedBy, token.name || 'Token');
      }
    });
    setDraggingPlayers(newDragging);
  }, [tokens]);

  // Gera cor baseada no nome do player
  const getPlayerColor = (name) => {
    const colors = [
      '#e2b714', // gold
      '#c77dff', // purple
      '#51cf66', // green
      '#74c0fc', // blue
      '#ff6b6b', // red
      '#ffd43b', // yellow
      '#63e6be', // teal
      '#ff922b', // orange
      '#e599f7', // pink
      '#20c997', // cyan
    ];
    if (!name) return colors[0];
    const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
  };

  // Gera iniciais do nome
  const getInitials = (name) => {
    if (!name) return '?';
    const words = name.trim().split(' ');
    if (words.length === 1) {
      return name.substring(0, 2).toUpperCase();
    }
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  };

  const avatarVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: { 
      scale: 1, 
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 20 }
    },
    exit: { 
      scale: 0, 
      opacity: 0,
      transition: { duration: 0.2 }
    },
    hover: { 
      scale: 1.1,
      transition: { type: 'spring', stiffness: 400, damping: 10 }
    },
  };

  const tooltipVariants = {
    hidden: { opacity: 0, y: 10, scale: 0.95 },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      transition: { type: 'spring', stiffness: 300, damping: 25 }
    },
  };

  const pulseAnimation = {
    scale: [1, 1.15, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  };

  if (connectedPlayers.length === 0) return null;

  return (
    <motion.div 
      className="player-presence"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      drag
      dragMomentum={false}
      dragElastic={0.1}
      whileDrag={{ scale: 1.02, cursor: 'grabbing' }}
      style={{ cursor: 'grab' }}
    >
      <div className="presence-header">
        <span className="presence-count">
          <motion.span 
            className="presence-dot"
            animate={pulseAnimation}
          />
          {connectedPlayers.length} online
        </span>
      </div>

      <div className="presence-avatars">
        <AnimatePresence mode="popLayout">
          {connectedPlayers.map((p) => {
            const isDragging = draggingPlayers.has(p.id);
            const dragTarget = draggingPlayers.get(p.id);
            const isMe = p.id === currentPlayer.id || p.name === currentPlayer.name;
            const color = getPlayerColor(p.name);

            return (
              <motion.div
                key={p.id || p.name}
                className={`presence-avatar-wrapper ${isMe ? 'is-me' : ''}`}
                variants={avatarVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                whileHover="hover"
                layout
                onMouseEnter={() => setExpandedPlayerId(p.id)}
                onMouseLeave={() => setExpandedPlayerId(null)}
              >
                <motion.div
                  className={`presence-avatar ${isDragging ? 'is-dragging' : ''} ${p.is_dm ? 'is-dm' : ''}`}
                  style={{ 
                    '--player-color': color,
                    borderColor: color,
                  }}
                >
                  {/* Avatar image ou iniciais */}
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.name} className="avatar-image" />
                  ) : (
                    <span className="avatar-initials" style={{ color }}>
                      {getInitials(p.name)}
                    </span>
                  )}

                  {/* Indicador de DM */}
                  {p.is_dm && (
                    <motion.span 
                      className="dm-badge"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: 'spring' }}
                    >
                      ⚔️
                    </motion.span>
                  )}

                  {/* Indicador de ação (arrastando) */}
                  {isDragging && (
                    <motion.span 
                      className="action-indicator"
                      animate={{ rotate: [0, 10, -10, 0] }}
                      transition={{ duration: 0.5, repeat: Infinity }}
                    >
                      ✋
                    </motion.span>
                  )}
                </motion.div>

                {/* Tooltip expandido */}
                <AnimatePresence>
                  {expandedPlayerId === p.id && (
                    <motion.div
                      className="presence-tooltip"
                      variants={tooltipVariants}
                      initial="hidden"
                      animate="visible"
                      exit="hidden"
                    >
                      <span className="tooltip-name">{p.name}</span>
                      {p.is_dm && <span className="tooltip-role">Mestre</span>}
                      {isDragging && (
                        <span className="tooltip-action">
                          Movendo: {dragTarget}
                        </span>
                      )}
                      {isMe && <span className="tooltip-you">(você)</span>}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
