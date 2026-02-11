import { useState, useEffect, useCallback } from 'react';
import { useGameSocket } from './useSocket';

/**
 * Game State Hook - Manages the shared state of the VTT session
 */
export const useGameState = () => {
  // Socket connection
  const socket = useGameSocket();

  // Core game state
  const [gameState, setGameState] = useState({
    // Room information
    room: {
      code: null,
      dm: null,
      players: [],
      status: 'lobby' // 'lobby' | 'playing' | 'paused'
    },
    
    // Current player info
    player: {
      id: null,
      name: '',
      role: 'player', // 'dm' | 'player'
      isConnected: false
    },
    
    // Map state
    map: {
      background: null,
      width: 2000,
      height: 2000,
      gridSize: 40,
      gridVisible: true,
      zoom: 1,
      panX: 0,
      panY: 0
    },
    
    // Tokens on the map
    tokens: new Map(),
    
    // Fog of War
    fog: {
      revealed: [], // Array of revealed areas {x, y, width, height}
      brushSize: 2
    },
    
    // Initiative tracker
    initiative: {
      active: false,
      currentTurn: 0,
      round: 1,
      order: [] // Array of {tokenId, initiative, name}
    },
    
    // Chat and dice log
    chat: [],
    
    // UI state
    ui: {
      selectedToken: null,
      activeTool: 'select', // 'select' | 'move' | 'fog' | 'add-token'
      sidePanelOpen: true,
      chatPanelOpen: true
    }
  });

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Update game state helper
  const updateGameState = useCallback((updates) => {
    setGameState(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  // Update nested state helper
  const updateNestedState = useCallback((path, updates) => {
    setGameState(prev => ({
      ...prev,
      [path]: {
        ...prev[path],
        ...updates
      }
    }));
  }, []);

  // Socket event handlers
  useEffect(() => {
    // Room events
    socket.on('room:joined', (data) => {
      updateGameState({
        room: data.room,
        player: { ...gameState.player, ...data.player }
      });
      setIsLoading(false);
    });

    socket.on('room:state', (data) => {
      updateGameState(data);
      setIsLoading(false);
    });

    socket.on('room:player-joined', (player) => {
      updateNestedState('room', {
        players: [...gameState.room.players, player]
      });
    });

    socket.on('room:player-left', (playerId) => {
      updateNestedState('room', {
        players: gameState.room.players.filter(p => p.id !== playerId)
      });
    });

    // Token events
    socket.on('token:added', (token) => {
      setGameState(prev => {
        const newTokens = new Map(prev.tokens);
        newTokens.set(token.id, token);
        return { ...prev, tokens: newTokens };
      });
    });

    socket.on('token:moved', ({ tokenId, x, y }) => {
      setGameState(prev => {
        const newTokens = new Map(prev.tokens);
        const token = newTokens.get(tokenId);
        if (token) {
          newTokens.set(tokenId, { ...token, x, y });
        }
        return { ...prev, tokens: newTokens };
      });
    });

    socket.on('token:updated', ({ tokenId, updates }) => {
      setGameState(prev => {
        const newTokens = new Map(prev.tokens);
        const token = newTokens.get(tokenId);
        if (token) {
          newTokens.set(tokenId, { ...token, ...updates });
        }
        return { ...prev, tokens: newTokens };
      });
    });

    socket.on('token:removed', ({ tokenId }) => {
      setGameState(prev => {
        const newTokens = new Map(prev.tokens);
        newTokens.delete(tokenId);
        return { ...prev, tokens: newTokens };
      });
    });

    // Map events
    socket.on('map:updated', (mapData) => {
      updateNestedState('map', mapData);
    });

    // Fog of War events
    socket.on('fog:revealed', ({ areas }) => {
      updateNestedState('fog', {
        revealed: [...gameState.fog.revealed, ...areas]
      });
    });

    socket.on('fog:hidden', ({ areas }) => {
      // Remove specified areas from revealed fog
      updateNestedState('fog', {
        revealed: gameState.fog.revealed.filter(area => 
          !areas.some(hideArea => 
            area.x === hideArea.x && 
            area.y === hideArea.y &&
            area.width === hideArea.width &&
            area.height === hideArea.height
          )
        )
      });
    });

    // Chat and dice events
    socket.on('chat:message', (message) => {
      updateGameState({
        chat: [...gameState.chat, message]
      });
    });

    socket.on('dice:result', (result) => {
      const diceMessage = {
        id: Date.now(),
        type: 'dice',
        player: result.player,
        content: result.expression,
        result: result,
        timestamp: new Date()
      };
      
      updateGameState({
        chat: [...gameState.chat, diceMessage]
      });
    });

    // Initiative events
    socket.on('initiative:updated', (initiativeData) => {
      updateNestedState('initiative', initiativeData);
    });

    // Error handling
    socket.on('error', (errorData) => {
      setError(errorData.message);
      setIsLoading(false);
    });

    // Cleanup listeners
    return () => {
      socket.off('room:joined');
      socket.off('room:state');
      socket.off('room:player-joined');
      socket.off('room:player-left');
      socket.off('token:added');
      socket.off('token:moved');
      socket.off('token:updated');
      socket.off('token:removed');
      socket.off('map:updated');
      socket.off('fog:revealed');
      socket.off('fog:hidden');
      socket.off('chat:message');
      socket.off('dice:result');
      socket.off('initiative:updated');
      socket.off('error');
    };
  }, [socket, gameState, updateGameState, updateNestedState]);

  // Action creators
  const actions = {
    // Room actions
    createRoom: async (playerName) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await socket.createRoom(playerName);
        return result;
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
        throw err;
      }
    },

    joinRoom: async (roomCode, playerName) => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await socket.joinRoom(roomCode, playerName);
        return result;
      } catch (err) {
        setError(err.message);
        setIsLoading(false);
        throw err;
      }
    },

    leaveRoom: () => {
      socket.leaveRoom();
      setGameState(prevState => ({
        ...prevState,
        room: { code: null, dm: null, players: [], status: 'lobby' },
        player: { ...prevState.player, isConnected: false }
      }));
    },

    // Token actions
    addToken: (tokenData) => {
      socket.addToken(tokenData);
    },

    moveToken: (tokenId, x, y) => {
      socket.moveToken(tokenId, x, y);
    },

    updateToken: (tokenId, updates) => {
      socket.updateToken(tokenId, updates);
    },

    removeToken: (tokenId) => {
      socket.removeToken(tokenId);
    },

    // Map actions
    uploadMap: async (mapData) => {
      try {
        const result = await socket.uploadMap(mapData);
        return result;
      } catch (err) {
        setError(err.message);
        throw err;
      }
    },

    // Fog actions
    revealFog: (areas) => {
      socket.revealFog(areas);
    },

    hideFog: (areas) => {
      socket.hideFog(areas);
    },

    // Chat actions
    sendMessage: (message) => {
      socket.sendMessage(message);
    },

    // Dice actions
    rollDice: (expression, options = {}) => {
      socket.rollDice(expression, options);
    },

    // UI actions
    selectToken: (tokenId) => {
      updateNestedState('ui', { selectedToken: tokenId });
    },

    setActiveTool: (tool) => {
      updateNestedState('ui', { activeTool: tool });
    },

    toggleSidePanel: () => {
      updateNestedState('ui', { 
        sidePanelOpen: !gameState.ui.sidePanelOpen 
      });
    },

    toggleChatPanel: () => {
      updateNestedState('ui', { 
        chatPanelOpen: !gameState.ui.chatPanelOpen 
      });
    },

    // Map view actions
    setMapView: (zoom, panX, panY) => {
      updateNestedState('map', { zoom, panX, panY });
    }
  };

  // Computed values
  const computed = {
    isConnected: socket.isConnected(),
    isDM: gameState.player.role === 'dm',
    isInGame: gameState.room.status === 'playing',
    selectedToken: gameState.tokens.get(gameState.ui.selectedToken),
    tokensArray: Array.from(gameState.tokens.values()),
    currentPlayer: gameState.initiative.active 
      ? gameState.initiative.order[gameState.initiative.currentTurn]
      : null
  };

  return {
    // State
    gameState,
    isLoading,
    error,
    
    // Actions
    ...actions,
    
    // Computed values
    ...computed,
    
    // Direct socket access for advanced use
    socket
  };
};

export default useGameState;