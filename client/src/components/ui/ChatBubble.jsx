import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';
import Bubble from './Bubble';

const ChatBubble = ({
  initialPosition = { x: 100, y: window.innerHeight - 500 },
  onMinimize,
}) => {
  const { state, actions } = useGame();
  const { chat, player, connected } = state;
  const [messageInput, setMessageInput] = useState('');
  const [hoveredMessage, setHoveredMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (!messageInput.trim() || !connected) return;

    const msg = messageInput.trim();
    
    // Handle dice commands
    if (msg.startsWith('/roll ') || msg.startsWith('/r ')) {
      const notation = msg.replace(/^\/(roll|r)\s+/, '');
      actions.rollDice(notation);
    } else if (msg.startsWith('/w ') || msg.startsWith('/whisper ')) {
      const parts = msg.replace(/^\/(w|whisper)\s+/, '').split(' ');
      const target = parts[0];
      const content = parts.slice(1).join(' ');
      if (target && content) {
        actions.sendMessage(content, true, target);
      }
    } else {
      actions.sendMessage(msg);
    }
    
    setMessageInput('');
  }, [messageInput, connected, actions]);

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderMessage = (message, index) => {
    const isOwn = message.authorId === player.id;
    const isSystem = message.type === 'system' || message.type === 'join' || message.type === 'leave';
    const isDiceResult = message.type === 'dice_result';
    const isWhisper = message.type === 'whisper';

    // System messages
    if (isSystem) {
      return (
        <motion.div
          key={message.id || index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#718096',
            padding: '4px 8px',
            fontStyle: 'italic',
          }}
        >
          {message.type === 'join' && `➕ ${message.author} entrou`}
          {message.type === 'leave' && `➖ ${message.author} saiu`}
          {message.type === 'system' && message.content}
        </motion.div>
      );
    }

    // Dice results
    if (isDiceResult) {
      const hasCrit = message.breakdown?.individual?.some(d => d.roll === 20 || d.value === 20);
      const hasFumble = message.breakdown?.individual?.some(d => d.roll === 1 || d.value === 1);

      return (
        <motion.div
          key={message.id || index}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          style={{
            marginBottom: 8,
            padding: '8px 12px',
            borderRadius: 12,
            background: hasCrit 
              ? 'rgba(241,196,15,0.15)'
              : hasFumble
                ? 'rgba(231,76,60,0.15)'
                : 'rgba(226,183,20,0.1)',
            border: `1px solid ${hasCrit ? '#f1c40f' : hasFumble ? '#e74c3c' : '#e2b71444'}`,
            boxShadow: hasCrit || hasFumble 
              ? `0 0 12px ${hasCrit ? '#f1c40f33' : '#e74c3c33'}`
              : 'none',
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 8,
            marginBottom: 4,
          }}>
            <span style={{ fontSize: '0.85rem' }}>🎲</span>
            <span style={{ fontWeight: 600, color: '#e2b714', fontSize: '0.85rem' }}>
              {message.author}
            </span>
            <span style={{ fontSize: '0.65rem', color: '#718096' }}>
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          
          {message.rollContext && (
            <div style={{
              fontSize: '0.8rem',
              color: '#c79dff',
              fontStyle: 'italic',
              marginBottom: 4,
            }}>
              ⚔️ {message.rollContext}
            </div>
          )}
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: '#a0aec0', fontFamily: 'monospace' }}>
              {message.formula}
            </span>
            <span style={{ color: '#718096' }}>→</span>
            <motion.span
              initial={{ scale: 1.5 }}
              animate={{ scale: 1 }}
              style={{
                fontSize: '1.2rem',
                fontWeight: 800,
                color: hasCrit ? '#f1c40f' : hasFumble ? '#e74c3c' : '#e2e8f0',
              }}
            >
              {message.total}
            </motion.span>
            
            {/* Mini dice display */}
            {message.breakdown?.individual && (
              <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                {message.breakdown.individual.map((die, i) => (
                  <span
                    key={i}
                    style={{
                      padding: '1px 4px',
                      borderRadius: 4,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      background: die.dropped
                        ? '#4a5568'
                        : die.roll === 20 || die.value === 20
                          ? '#f1c40f'
                          : die.roll === 1 || die.value === 1
                            ? '#e74c3c'
                            : '#2d3748',
                      color: '#fff',
                      textDecoration: die.dropped ? 'line-through' : 'none',
                      opacity: die.dropped ? 0.5 : 1,
                    }}
                  >
                    {die.roll || die.value}
                  </span>
                ))}
              </div>
            )}
          </div>
          
          {hasCrit && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                marginTop: 4,
                fontSize: '0.75rem',
                color: '#f1c40f',
                fontWeight: 700,
              }}
            >
              ✨ CRÍTICO!
            </motion.div>
          )}
          {hasFumble && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                marginTop: 4,
                fontSize: '0.75rem',
                color: '#e74c3c',
                fontWeight: 700,
              }}
            >
              💀 FALHA CRÍTICA!
            </motion.div>
          )}
        </motion.div>
      );
    }

    // Whisper messages
    if (isWhisper) {
      return (
        <motion.div
          key={message.id || index}
          initial={{ opacity: 0, x: isOwn ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          style={{
            marginBottom: 6,
            padding: '6px 10px',
            borderRadius: 10,
            background: 'rgba(199,125,255,0.1)',
            borderLeft: '3px solid #c79dff',
            marginLeft: isOwn ? 'auto' : 0,
            marginRight: isOwn ? 0 : 'auto',
            maxWidth: '85%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
            <span style={{ fontWeight: 600, color: '#c79dff', fontSize: '0.8rem' }}>
              {message.author} → {message.target}
            </span>
            <span style={{ fontSize: '0.6rem', color: '#718096' }}>
              {formatTimestamp(message.timestamp)}
            </span>
          </div>
          <div style={{ fontSize: '0.85rem', color: '#e2e8f0', fontStyle: 'italic' }}>
            {message.content}
          </div>
        </motion.div>
      );
    }

    // Regular messages
    return (
      <motion.div
        key={message.id || index}
        initial={{ opacity: 0, y: 10, x: isOwn ? 10 : -10 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        onHoverStart={() => setHoveredMessage(message.id)}
        onHoverEnd={() => setHoveredMessage(null)}
        style={{
          marginBottom: 6,
          padding: '6px 10px',
          borderRadius: 12,
          background: isOwn ? 'rgba(226,183,20,0.15)' : 'rgba(45,55,72,0.6)',
          border: isOwn ? '1px solid #e2b71433' : '1px solid rgba(255,255,255,0.05)',
          marginLeft: isOwn ? 'auto' : 0,
          marginRight: isOwn ? 0 : 'auto',
          maxWidth: '85%',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontWeight: 600,
            color: isOwn ? '#e2b714' : '#a0aec0',
            fontSize: '0.8rem',
          }}>
            {message.author}
          </span>
          <span style={{ fontSize: '0.6rem', color: '#718096' }}>
            {formatTimestamp(message.timestamp)}
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#e2e8f0', wordBreak: 'break-word' }}>
          {message.content}
        </div>
        
        {/* Delete button for own messages */}
        <AnimatePresence>
          {hoveredMessage === message.id && isOwn && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => actions.deleteMessage?.(message.id)}
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 18,
                height: 18,
                borderRadius: 4,
                border: 'none',
                background: 'rgba(255,107,107,0.2)',
                color: '#ff6b6b',
                fontSize: '0.65rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    );
  };

  return (
    <Bubble
      id="chat-bubble"
      title="Chat"
      icon="💬"
      initialPosition={initialPosition}
      onMinimize={onMinimize}
      minWidth={320}
      minHeight={400}
      maxWidth={450}
      accentColor="#c79dff"
    >
      <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100%',
        minHeight: 350,
      }}>
        {/* Connection status */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          marginBottom: 8,
          padding: '4px 8px',
          background: connected ? 'rgba(46,204,113,0.1)' : 'rgba(231,76,60,0.1)',
          borderRadius: 6,
          border: `1px solid ${connected ? '#2ecc7133' : '#e74c3c33'}`,
        }}>
          <div style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: connected ? '#2ecc71' : '#e74c3c',
            boxShadow: `0 0 8px ${connected ? '#2ecc71' : '#e74c3c'}`,
          }} />
          <span style={{
            fontSize: '0.7rem',
            color: connected ? '#2ecc71' : '#e74c3c',
            fontWeight: 500,
          }}>
            {connected ? 'Conectado' : 'Desconectado'}
          </span>
        </div>

        {/* Messages area */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          paddingRight: 4,
          marginBottom: 8,
        }}>
          {chat.length === 0 ? (
            <div style={{
              textAlign: 'center',
              color: '#718096',
              fontSize: '0.8rem',
              padding: 20,
              fontStyle: 'italic',
            }}>
              💬 Use /roll 1d20 para dados
            </div>
          ) : (
            chat.filter(m => !m.hidden || player.isDM).map((m, i) => renderMessage(m, i))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 6 }}>
          <input
            ref={inputRef}
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={connected ? "/roll 1d20+5 ou mensagem..." : "Conectando..."}
            disabled={!connected}
            style={{
              flex: 1,
              padding: '10px 12px',
              border: '1px solid #4a5568',
              borderRadius: 10,
              background: 'rgba(45,55,72,0.6)',
              color: '#e2e8f0',
              fontSize: '0.9rem',
              outline: 'none',
              transition: 'border-color 0.2s',
            }}
            onFocus={(e) => e.target.style.borderColor = '#c79dff'}
            onBlur={(e) => e.target.style.borderColor = '#4a5568'}
          />
          <motion.button
            type="submit"
            disabled={!connected || !messageInput.trim()}
            style={{
              padding: '10px 16px',
              border: 'none',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #c79dff, #9b59b6)',
              color: '#fff',
              fontWeight: 600,
              cursor: !connected || !messageInput.trim() ? 'not-allowed' : 'pointer',
              opacity: !connected || !messageInput.trim() ? 0.5 : 1,
            }}
            whileHover={connected && messageInput.trim() ? { scale: 1.05 } : {}}
            whileTap={connected && messageInput.trim() ? { scale: 0.95 } : {}}
          >
            ➤
          </motion.button>
        </form>

        {/* Quick commands hint */}
        <div style={{
          marginTop: 6,
          display: 'flex',
          gap: 8,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}>
          {['/roll', '/w'].map(cmd => (
            <span
              key={cmd}
              style={{
                fontSize: '0.65rem',
                color: '#718096',
                padding: '2px 6px',
                background: 'rgba(255,255,255,0.05)',
                borderRadius: 4,
                cursor: 'pointer',
              }}
              onClick={() => {
                setMessageInput(cmd + ' ');
                inputRef.current?.focus();
              }}
            >
              {cmd}
            </span>
          ))}
        </div>
      </div>
    </Bubble>
  );
};

export default ChatBubble;
