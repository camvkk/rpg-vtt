import { useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

/**
 * Socket.io hook for RPG VTT real-time communication
 */
export const useSocket = (url = 'http://localhost:3001', options = {}) => {
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());

  // Initialize socket connection
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(url, {
        transports: ['websocket', 'polling'],
        timeout: 5000,
        retries: 3,
        ...options
      });

      // Connection event handlers
      socketRef.current.on('connect', () => {
        console.log('🔗 Connected to VTT server');
      });

      socketRef.current.on('disconnect', (reason) => {
        console.log('🔌 Disconnected from VTT server:', reason);
      });

      socketRef.current.on('connect_error', (error) => {
        console.error('❌ Connection error:', error);
      });

      socketRef.current.on('reconnect', (attemptNumber) => {
        console.log('🔄 Reconnected to VTT server (attempt', attemptNumber, ')');
      });
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [url]);

  // Subscribe to socket events
  const on = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback);
      
      // Store listener reference for cleanup
      if (!listenersRef.current.has(event)) {
        listenersRef.current.set(event, []);
      }
      listenersRef.current.get(event).push(callback);
    }
  }, []);

  // Unsubscribe from socket events
  const off = useCallback((event, callback) => {
    if (socketRef.current) {
      socketRef.current.off(event, callback);
      
      // Remove from listeners reference
      const eventListeners = listenersRef.current.get(event);
      if (eventListeners) {
        const index = eventListeners.indexOf(callback);
        if (index > -1) {
          eventListeners.splice(index, 1);
        }
      }
    }
  }, []);

  // Emit events to server
  const emit = useCallback((event, data, callback) => {
    if (socketRef.current && socketRef.current.connected) {
      return socketRef.current.emit(event, data, callback);
    } else {
      console.warn('⚠️ Cannot emit - socket not connected:', event);
      return false;
    }
  }, []);

  // Emit with promise wrapper
  const emitWithAck = useCallback((event, data) => {
    return new Promise((resolve, reject) => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.timeout(5000).emit(event, data, (err, response) => {
          if (err) {
            reject(err);
          } else {
            resolve(response);
          }
        });
      } else {
        reject(new Error('Socket not connected'));
      }
    });
  }, []);

  // Get connection status
  const isConnected = useCallback(() => {
    return socketRef.current?.connected || false;
  }, []);

  // Get socket ID
  const getSocketId = useCallback(() => {
    return socketRef.current?.id || null;
  }, []);

  // Cleanup listeners on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        // Remove all registered listeners
        listenersRef.current.forEach((callbacks, event) => {
          callbacks.forEach(callback => {
            socketRef.current.off(event, callback);
          });
        });
        listenersRef.current.clear();
      }
    };
  }, []);

  return {
    socket: socketRef.current,
    on,
    off,
    emit,
    emitWithAck,
    isConnected,
    getSocketId
  };
};

/**
 * Hook specifically for VTT game events
 */
export const useGameSocket = () => {
  const { on, off, emit, emitWithAck, isConnected, getSocketId } = useSocket();

  // Room management
  const createRoom = useCallback((playerName, options = {}) => {
    return emitWithAck('room:create', { playerName, ...options });
  }, [emitWithAck]);

  const joinRoom = useCallback((roomCode, playerName, options = {}) => {
    return emitWithAck('room:join', { roomCode, playerName, ...options });
  }, [emitWithAck]);

  const leaveRoom = useCallback(() => {
    return emit('room:leave');
  }, [emit]);

  // Token operations
  const moveToken = useCallback((tokenId, x, y) => {
    return emit('token:move', { tokenId, x, y });
  }, [emit]);

  const addToken = useCallback((tokenData) => {
    return emit('token:add', tokenData);
  }, [emit]);

  const updateToken = useCallback((tokenId, updates) => {
    return emit('token:update', { tokenId, ...updates });
  }, [emit]);

  const removeToken = useCallback((tokenId) => {
    return emit('token:remove', { tokenId });
  }, [emit]);

  // Map operations
  const uploadMap = useCallback((mapData) => {
    return emitWithAck('map:upload', mapData);
  }, [emitWithAck]);

  const updateMapSettings = useCallback((settings) => {
    return emit('map:settings', settings);
  }, [emit]);

  // Fog of War
  const revealFog = useCallback((areas) => {
    return emit('fog:reveal', { areas });
  }, [emit]);

  const hideFog = useCallback((areas) => {
    return emit('fog:hide', { areas });
  }, [emit]);

  // Dice rolling
  const rollDice = useCallback((diceExpression, options = {}) => {
    return emit('dice:roll', { expression: diceExpression, ...options });
  }, [emit]);

  // Chat
  const sendMessage = useCallback((message, type = 'chat') => {
    return emit('chat:send', { message, type });
  }, [emit]);

  // Initiative
  const rollInitiative = useCallback((tokenId, bonus = 0) => {
    return emit('initiative:roll', { tokenId, bonus });
  }, [emit]);

  const nextTurn = useCallback(() => {
    return emit('initiative:next');
  }, [emit]);

  return {
    // Connection status
    isConnected,
    getSocketId,
    
    // Event listeners
    on,
    off,
    
    // Room management
    createRoom,
    joinRoom,
    leaveRoom,
    
    // Token operations
    moveToken,
    addToken,
    updateToken,
    removeToken,
    
    // Map operations
    uploadMap,
    updateMapSettings,
    
    // Fog of War
    revealFog,
    hideFog,
    
    // Dice & Chat
    rollDice,
    sendMessage,
    
    // Initiative
    rollInitiative,
    nextTurn
  };
};

export default useSocket;