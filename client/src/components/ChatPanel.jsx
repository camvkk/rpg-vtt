import React, { useState, useRef, useEffect } from 'react';
import { findSpellByName } from '../utils/spellDatabase';

const ChatPanel = ({ 
  messages = [], 
  onSendMessage = () => {},
  onDeleteMessage = () => {},
  onHideMessage = () => {},
  currentUser = { name: 'Player', id: 'player1', isDM: false },
  isConnected = true,
  onSpellDetected = () => {}
}) => {
  const [messageInput, setMessageInput] = useState('');
  const [hoveredRoll, setHoveredRoll] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  const [openMenuId, setOpenMenuId] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !isConnected) return;

    const message = messageInput.trim();
    const messageData = parseMessage(message);
    
    onSendMessage(messageData);
    setMessageInput('');
  };

  const parseMessage = (input) => {
    const message = {
      id: Date.now(),
      author: currentUser.name,
      authorId: currentUser.id,
      timestamp: new Date(),
      content: input,
      type: 'message'
    };

    // Check for commands
    if (input.startsWith('/')) {
      const [command, ...args] = input.slice(1).split(' ');
      
      switch (command.toLowerCase()) {
        case 'roll':
        case 'r': {
          message.type = 'dice_command';
          message.diceNotation = args.join(' ');
          // Parse roll context from notation (e.g., "1d20+5 Ataque com Espada")
          const notationParts = message.diceNotation.match(/^([0-9d+\-*/\s]+)(.*)$/i);
          if (notationParts && notationParts[2]) {
            message.rollContext = notationParts[2].trim();
            message.diceNotation = notationParts[1].trim();
          }
          break;
        }
          
        case 'attack':
        case 'ataque':
        case 'atk':
          message.type = 'dice_command';
          message.rollContext = `Ataque: ${args.slice(1).join(' ') || 'Ataque'}`;
          message.diceNotation = args[0] || '1d20';
          break;
          
        case 'skill':
        case 'teste':
        case 'check':
          message.type = 'dice_command';
          message.rollContext = `Teste: ${args.slice(1).join(' ') || 'Teste de Perícia'}`;
          message.diceNotation = args[0] || '1d20';
          break;
          
        case 'save':
        case 'saving':
        case 'salvaguarda':
          message.type = 'dice_command';
          message.rollContext = `Salvaguarda: ${args.slice(1).join(' ') || 'Salvaguarda'}`;
          message.diceNotation = args[0] || '1d20';
          break;
          
        case 'damage':
        case 'dano':
        case 'dmg':
          message.type = 'dice_command';
          message.rollContext = `Dano: ${args.slice(1).join(' ') || 'Dano'}`;
          message.diceNotation = args[0] || '1d6';
          break;
          
        case 'gmroll':
        case 'gr':
          message.type = 'gm_dice_command';
          message.diceNotation = args.join(' ');
          break;
          
        case 'w':
        case 'whisper':
          if (args.length >= 2) {
            message.type = 'whisper';
            message.target = args[0];
            message.content = args.slice(1).join(' ');
          }
          break;
          
        default:
          break;
      }
    } else {
      // Check for spell names in regular messages
      const detectedSpell = findSpellByName(input);
      if (detectedSpell) {
        setTimeout(() => {
          onSpellDetected(detectedSpell);
        }, 100);
      }
    }

    return message;
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleRollHover = (e, message) => {
    if (!message.rollDetails && !message.breakdown) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setHoveredRoll(message);
  };

  const handleRollLeave = () => {
    setHoveredRoll(null);
  };

  const canDeleteMessage = (message) => {
    // DM can delete any message, players can only delete their own
    if (currentUser.isDM) return true;
    return message.authorId === currentUser.id;
  };

  const handleDeleteMessage = (messageId) => {
    onDeleteMessage(messageId);
    setOpenMenuId(null);
  };

  const handleHideMessage = (messageId) => {
    onHideMessage(messageId);
    setOpenMenuId(null);
  };

  // Message action menu component
  const MessageMenu = ({ message }) => {
    const isOpen = openMenuId === message.id;
    const canDelete = canDeleteMessage(message);
    
    if (!canDelete && !currentUser.isDM) return null;

    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(isOpen ? null : message.id);
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            padding: '2px 6px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.9rem',
            opacity: 0.5,
            transition: 'opacity 0.2s',
            lineHeight: 1
          }}
          className="message-menu-btn"
          title="Opções"
        >
          ⋯
        </button>
        
        {isOpen && (
          <div
            ref={menuRef}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              background: 'var(--surface-light)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
              zIndex: 100,
              minWidth: '120px',
              overflow: 'hidden'
            }}
          >
            {currentUser.isDM && (
              <button
                onClick={() => handleHideMessage(message.id)}
                style={{
                  width: '100%',
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'var(--surface-primary)'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
              >
                👁️ {message.hidden ? 'Mostrar' : 'Ocultar'}
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => handleDeleteMessage(message.id)}
                style={{
                  width: '100%',
                  padding: 'var(--spacing-sm) var(--spacing-md)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-accent)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-xs)',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = 'rgba(255,107,107,0.1)'}
                onMouseLeave={(e) => e.target.style.background = 'none'}
              >
                🗑️ Deletar
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // Roll details tooltip
  const RollTooltip = () => {
    if (!hoveredRoll) return null;

    const details = hoveredRoll.rollDetails || hoveredRoll.breakdown;
    if (!details) return null;

    const individual = details.individual || details.dice || [];
    const modifier = details.modifier || 0;

    return (
      <div
        style={{
          position: 'fixed',
          left: tooltipPosition.x,
          top: tooltipPosition.y,
          transform: 'translate(-50%, -100%)',
          background: 'var(--bg-primary)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--spacing-sm) var(--spacing-md)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          zIndex: 1000,
          pointerEvents: 'none',
          minWidth: '150px'
        }}
      >
        <div style={{ 
          fontSize: '0.75rem', 
          color: 'var(--color-primary)',
          fontWeight: '600',
          marginBottom: 'var(--spacing-xs)',
          textAlign: 'center'
        }}>
          🎲 Detalhes da Rolagem
        </div>
        
        {/* Individual dice */}
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '4px',
          justifyContent: 'center',
          marginBottom: 'var(--spacing-xs)'
        }}>
          {individual.map((die, idx) => (
            <span
              key={idx}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '24px',
                height: '24px',
                padding: '0 4px',
                background: die.dropped 
                  ? 'var(--text-dim)' 
                  : die.roll === 20 || die.value === 20
                    ? 'var(--color-success)'
                    : die.roll === 1 || die.value === 1
                      ? 'var(--color-accent)'
                      : 'var(--surface-light)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.7rem',
                fontWeight: '600',
                color: die.dropped ? 'var(--bg-primary)' : 'var(--text-primary)',
                textDecoration: die.dropped ? 'line-through' : 'none',
                opacity: die.dropped ? 0.6 : 1
              }}
            >
              {die.roll || die.value}
              {die.sides && <span style={{ fontSize: '0.6rem', opacity: 0.7, marginLeft: '2px' }}>d{die.sides}</span>}
            </span>
          ))}
        </div>
        
        {/* Modifier if present */}
        {modifier !== 0 && (
          <div style={{ 
            fontSize: '0.7rem', 
            color: 'var(--text-dim)', 
            textAlign: 'center' 
          }}>
            Modificador: <span style={{ color: modifier > 0 ? 'var(--color-success)' : 'var(--color-accent)' }}>
              {modifier > 0 ? '+' : ''}{modifier}
            </span>
          </div>
        )}
        
        {/* Kept dice info if any were dropped */}
        {individual.some(d => d.dropped) && (
          <div style={{ 
            fontSize: '0.65rem', 
            color: 'var(--text-dim)', 
            textAlign: 'center',
            marginTop: '4px',
            fontStyle: 'italic'
          }}>
            (dados riscados foram descartados)
          </div>
        )}
        
        {/* Arrow pointing down */}
        <div style={{
          position: 'absolute',
          bottom: '-6px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid var(--color-primary)'
        }} />
      </div>
    );
  };

  const renderMessage = (message) => {
    // Skip hidden messages for non-DMs
    if (message.hidden && !currentUser.isDM) return null;

    const baseStyle = {
      marginBottom: 'var(--spacing-sm)',
      padding: 'var(--spacing-sm)',
      borderRadius: 'var(--radius-md)',
      fontSize: '0.85rem',
      lineHeight: 1.4,
      position: 'relative',
      opacity: message.hidden ? 0.5 : 1
    };

    // Common header with menu
    const MessageHeader = ({ children, showMenu = true }) => (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'flex-start' 
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)', flex: 1 }}>
          {children}
        </div>
        {showMenu && <MessageMenu message={message} />}
      </div>
    );

    switch (message.type) {
      case 'system':
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'var(--surface-light)',
              color: 'var(--text-dim)',
              textAlign: 'center',
              fontStyle: 'italic',
              fontSize: '0.75rem'
            }}
          >
            {message.content}
          </div>
        );

      case 'whisper': {
        const isWhisperToMe = message.target === currentUser.name || message.authorId === currentUser.id;
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'rgba(199, 125, 255, 0.1)',
              borderLeft: '3px solid var(--color-secondary)',
              fontStyle: 'italic',
              opacity: isWhisperToMe ? 1 : 0.6
            }}
          >
            <MessageHeader>
              <span style={{ color: 'var(--color-secondary)', fontWeight: '600', fontSize: '0.8rem' }}>
                {message.author} → {message.target}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                {formatTimestamp(message.timestamp)}
              </span>
            </MessageHeader>
            <div style={{ marginTop: 'var(--spacing-xs)', color: 'var(--text-primary)' }}>
              {message.content}
            </div>
          </div>
        );
      }

      case 'dice_result':
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'var(--surface-light)',
              borderLeft: '4px solid var(--color-primary)',
              border: '1px solid var(--border-color)'
            }}
          >
            <MessageHeader>
              <span style={{ color: 'var(--color-primary)', fontWeight: '600', fontSize: '0.8rem' }}>
                🎲 {message.author}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                {formatTimestamp(message.timestamp)}
              </span>
            </MessageHeader>
            
            {/* Roll context (attack/skill/save type) */}
            {message.rollContext && (
              <div style={{
                marginTop: 'var(--spacing-xs)',
                fontSize: '0.8rem',
                color: 'var(--color-secondary)',
                fontWeight: '500',
                fontStyle: 'italic'
              }}>
                ⚔️ {message.rollContext}
              </div>
            )}
            
            <div 
              style={{ 
                marginTop: 'var(--spacing-xs)',
                fontFamily: 'monospace',
                fontSize: '0.9rem',
                cursor: (message.rollDetails || message.breakdown) ? 'help' : 'default'
              }}
              onMouseEnter={(e) => handleRollHover(e, message)}
              onMouseLeave={handleRollLeave}
            >
              <div style={{ marginBottom: 'var(--spacing-xs)', color: 'var(--text-dim)' }}>
                {message.formula}
              </div>
              
              {/* Individual dice results */}
              {message.breakdown && (
                <div style={{ 
                  display: 'flex', 
                  gap: 'var(--spacing-xs)', 
                  marginBottom: 'var(--spacing-xs)',
                  flexWrap: 'wrap'
                }}>
                  {message.breakdown.individual.map((die, index) => (
                    <span
                      key={index}
                      style={{
                        display: 'inline-block',
                        width: '24px',
                        height: '24px',
                        lineHeight: '24px',
                        textAlign: 'center',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.7rem',
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
                        opacity: die.dropped ? 0.6 : 1
                      }}
                    >
                      {die.roll}
                    </span>
                  ))}
                </div>
              )}
              
              <div style={{ 
                fontSize: '1.1rem', 
                fontWeight: '700', 
                color: 'var(--color-primary)',
                padding: 'var(--spacing-xs)',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-sm)',
                textAlign: 'center'
              }}>
                Total: {message.total}
              </div>
            </div>
          </div>
        );

      case 'combat_start':
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'rgba(255, 107, 107, 0.1)',
              borderLeft: '3px solid var(--color-accent)',
              textAlign: 'center',
              fontWeight: '600'
            }}
          >
            ⚔️ {message.content}
          </div>
        );

      case 'combat_end':
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'rgba(81, 207, 102, 0.1)',
              borderLeft: '3px solid var(--color-success)',
              textAlign: 'center',
              fontWeight: '600'
            }}
          >
            🏆 {message.content}
          </div>
        );

      case 'join':
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'rgba(81, 207, 102, 0.1)',
              color: 'var(--color-success)',
              textAlign: 'center',
              fontSize: '0.8rem'
            }}
          >
            ➕ {message.author} entrou na mesa
          </div>
        );

      case 'leave':
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: 'rgba(136, 136, 170, 0.1)',
              color: 'var(--text-dim)',
              textAlign: 'center',
              fontSize: '0.8rem'
            }}
          >
            ➖ {message.author} saiu da mesa
          </div>
        );

      default:
        return (
          <div
            key={message.id}
            style={{
              ...baseStyle,
              background: message.authorId === currentUser.id 
                ? 'rgba(226, 183, 20, 0.1)' 
                : 'var(--surface-light)',
              border: '1px solid var(--border-color)'
            }}
          >
            <MessageHeader>
              <span style={{ 
                color: message.authorId === currentUser.id ? 'var(--color-primary)' : 'var(--text-primary)', 
                fontWeight: '600',
                fontSize: '0.8rem'
              }}>
                {message.author}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                {formatTimestamp(message.timestamp)}
              </span>
            </MessageHeader>
            <div style={{ 
              marginTop: 'var(--spacing-xs)',
              color: 'var(--text-primary)',
              wordBreak: 'break-word'
            }}>
              {message.content}
            </div>
          </div>
        );
    }
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--surface-primary)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-lg)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        background: 'var(--surface-light)',
        padding: 'var(--spacing-md)',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <h3 style={{
          margin: 0,
          fontFamily: 'var(--font-fantasy)',
          color: 'var(--color-primary)',
          fontSize: '1.1rem'
        }}>
          💬 Chat
        </h3>
        <div style={{
          fontSize: '0.7rem',
          color: isConnected ? 'var(--color-success)' : 'var(--color-accent)',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-xs)'
        }}>
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: isConnected ? 'var(--color-success)' : 'var(--color-accent)'
          }} />
          {isConnected ? 'Conectado' : 'Desconectado'}
        </div>
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        padding: 'var(--spacing-sm)',
        overflowY: 'auto',
        maxHeight: '400px',
        minHeight: messages.length === 0 ? '80px' : 'auto'
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontStyle: 'italic',
            padding: 'var(--spacing-sm)',
            fontSize: '0.8rem'
          }}>
            💬 Use /roll 1d20 para dados
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        background: 'var(--surface-light)',
        padding: 'var(--spacing-sm)',
        borderTop: '1px solid var(--border-color)'
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
          <input
            ref={inputRef}
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={isConnected ? "/roll 1d20 ou mensagem..." : "Conectando..."}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: '10px var(--spacing-md)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-primary)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-body)'
            }}
          />
          <button
            type="submit"
            disabled={!isConnected || !messageInput.trim()}
            style={{
              padding: '10px var(--spacing-md)',
              border: '1px solid var(--color-primary)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-primary)',
              color: 'var(--bg-primary)',
              fontWeight: '600',
              cursor: !isConnected || !messageInput.trim() ? 'not-allowed' : 'pointer',
              opacity: !isConnected || !messageInput.trim() ? 0.6 : 1,
              transition: 'all var(--transition-fast)'
            }}
          >
            Enviar
          </button>
        </form>
        
        {/* Help text - compact */}
        <div style={{
          fontSize: '0.65rem',
          color: 'var(--text-dim)',
          marginTop: '4px',
          textAlign: 'center',
          lineHeight: 1.3
        }}>
          /roll /attack /skill /save /damage
        </div>
      </div>

      {/* Roll Tooltip */}
      <RollTooltip />

      {/* CSS for hover effects */}
      <style>{`
        .message-menu-btn:hover {
          opacity: 1 !important;
          background: var(--surface-light);
        }
      `}</style>
    </div>
  );
};

export default ChatPanel;
