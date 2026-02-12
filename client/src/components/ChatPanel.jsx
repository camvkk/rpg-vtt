import React, { useState, useRef, useEffect } from 'react';

const ChatPanel = ({ 
  messages = [], 
  onSendMessage = () => {},
  currentUser = { name: 'Player', id: 'player1' },
  isConnected = true 
}) => {
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!messageInput.trim() || !isConnected) return;

    const message = messageInput.trim();
    
    // Parse command or regular message
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
        case 'r':
          message.type = 'dice_command';
          message.diceNotation = args.join(' ');
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
          // Unknown command, treat as regular message
          break;
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

  const renderMessage = (message) => {
    const baseStyle = {
      marginBottom: 'var(--spacing-sm)',
      padding: 'var(--spacing-sm)',
      borderRadius: 'var(--radius-md)',
      fontSize: '0.85rem',
      lineHeight: 1.4
    };

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

      case 'whisper':
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--color-secondary)', fontWeight: '600', fontSize: '0.8rem' }}>
                {message.author} → {message.target}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
            <div style={{ marginTop: 'var(--spacing-xs)', color: 'var(--text-primary)' }}>
              {message.content}
            </div>
          </div>
        );

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ color: 'var(--color-primary)', fontWeight: '600', fontSize: '0.8rem' }}>
                🎲 {message.author}
              </span>
              <span style={{ color: 'var(--text-dim)', fontSize: '0.7rem' }}>
                {formatTimestamp(message.timestamp)}
              </span>
            </div>
            <div style={{ 
              marginTop: 'var(--spacing-xs)',
              fontFamily: 'monospace',
              fontSize: '0.9rem'
            }}>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
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
            </div>
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
        padding: 'var(--spacing-md)',
        overflowY: 'auto',
        maxHeight: '400px'
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: 'var(--text-dim)',
            fontStyle: 'italic',
            padding: 'var(--spacing-lg)',
            fontSize: '0.9rem'
          }}>
            Bem-vindo à aventura! Digite uma mensagem ou use comandos de dados como /roll 1d20
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{
        background: 'var(--surface-light)',
        padding: 'var(--spacing-md)',
        borderTop: '1px solid var(--border-color)'
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
          <input
            ref={inputRef}
            type="text"
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            placeholder={isConnected ? "Digite uma mensagem ou /roll 1d20..." : "Conectando..."}
            disabled={!isConnected}
            style={{
              flex: 1,
              padding: 'var(--spacing-sm) var(--spacing-md)',
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
              padding: 'var(--spacing-sm) var(--spacing-md)',
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
        
        {/* Help text */}
        <div style={{
          fontSize: '0.7rem',
          color: 'var(--text-dim)',
          marginTop: 'var(--spacing-sm)',
          textAlign: 'center'
        }}>
          Comandos: /roll 1d20+5, /w NomeJogador mensagem, /gmroll 1d20 (apenas Mestre)
        </div>
      </div>
    </div>
  );
};

export default ChatPanel;