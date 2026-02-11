import { createContext, useContext, useReducer, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

// ── State shape ──
const initialState = {
  // Connection
  connected: false,
  socketId: null,

  // Room
  room: { id: null, code: null, dmName: null, status: 'lobby' },
  player: { id: null, name: '', isDM: false },
  players: [],

  // Map
  map: { url: null, width: 2000, height: 2000, gridSize: 40, gridVisible: true },

  // Tokens (array for simplicity — Map doesn't serialize in reducer)
  tokens: [],

  // Fog of war revealed areas
  fogAreas: [],

  // Initiative
  initiative: { active: false, currentTurn: 0, players: [] },

  // Chat messages
  chat: [],

  // Ambiance
  ambiance: { trackUrl: null, isPlaying: false },

  // UI
  ui: {
    activeTool: 'select',
    selectedTokenId: null,
    leftPanel: true,
    rightPanel: true,
  },

  // Loading / error
  loading: false,
  error: null,
};

// ── Reducer ──
function gameReducer(state, action) {
  switch (action.type) {
    case 'SET_CONNECTED':
      return { ...state, connected: action.payload.connected, socketId: action.payload.socketId ?? state.socketId };

    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };

    case 'ROOM_JOINED': {
      const { room, player, players, gameState: gs } = action.payload;
      return {
        ...state,
        room: { id: room.id, code: room.code, dmName: room.dm_name, status: 'playing' },
        player: { id: player.id, name: player.name, isDM: player.isDM },
        players: players || [],
        tokens: gs?.tokens || [],
        fogAreas: gs?.fog || [],
        ambiance: { trackUrl: gs?.ambiance || null, isPlaying: false },
        map: { ...state.map, url: gs?.map || null },
        loading: false,
        error: null,
      };
    }

    case 'ROOM_STATE': {
      const d = action.payload;
      return {
        ...state,
        players: d.players || state.players,
        tokens: d.gameState?.tokens || state.tokens,
        fogAreas: d.gameState?.fog || state.fogAreas,
        map: { ...state.map, url: d.gameState?.map || state.map.url },
      };
    }

    case 'PLAYER_JOINED':
      return { ...state, players: [...state.players, action.payload] };

    case 'PLAYER_LEFT':
      return { ...state, players: state.players.filter(p => p.id !== action.payload.playerId) };

    case 'LEAVE_ROOM':
      return { ...initialState, connected: state.connected, socketId: state.socketId };

    // Tokens
    case 'TOKEN_ADD':
      return { ...state, tokens: [...state.tokens, action.payload] };

    case 'TOKEN_MOVE': {
      const { tokenId, x, y } = action.payload;
      return { ...state, tokens: state.tokens.map(t => t.id === tokenId ? { ...t, x, y } : t) };
    }

    case 'TOKEN_UPDATE': {
      const updated = action.payload;
      return { ...state, tokens: state.tokens.map(t => t.id === updated.id ? { ...t, ...updated } : t) };
    }

    case 'TOKEN_REMOVE':
      return { ...state, tokens: state.tokens.filter(t => t.id !== action.payload.tokenId) };

    // Map
    case 'MAP_UPDATE':
      return { ...state, map: { ...state.map, ...action.payload } };

    // Fog
    case 'FOG_REVEAL':
      return { ...state, fogAreas: [...state.fogAreas, action.payload] };

    case 'FOG_CLEAR':
      return { ...state, fogAreas: [{ x: 0, y: 0, radius: 9999 }] };

    // Chat
    case 'CHAT_MESSAGE':
      return { ...state, chat: [...state.chat, action.payload] };

    case 'DICE_RESULT':
      return { ...state, chat: [...state.chat, { ...action.payload, type: 'dice' }] };

    // Initiative
    case 'INITIATIVE_UPDATE':
      return { ...state, initiative: action.payload };

    // Ambiance
    case 'AMBIANCE_CHANGE':
      return { ...state, ambiance: { ...state.ambiance, ...action.payload } };

    // UI
    case 'SET_ACTIVE_TOOL':
      return { ...state, ui: { ...state.ui, activeTool: action.payload } };

    case 'SELECT_TOKEN':
      return { ...state, ui: { ...state.ui, selectedTokenId: action.payload } };

    case 'TOGGLE_LEFT_PANEL':
      return { ...state, ui: { ...state.ui, leftPanel: !state.ui.leftPanel } };

    case 'TOGGLE_RIGHT_PANEL':
      return { ...state, ui: { ...state.ui, rightPanel: !state.ui.rightPanel } };

    default:
      return state;
  }
}

// ── Context ──
const GameContext = createContext(null);

// Auto-detect backend URL
const defaultServerUrl = (() => {
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (typeof window !== 'undefined') {
    const h = window.location.hostname;
    // Local dev
    if (h === 'localhost' || h === '127.0.0.1') return 'http://localhost:3001';
    // Tunnel or same-origin proxy
    return window.location.origin;
  }
  return 'http://localhost:3001';
})();

export function GameProvider({ children, serverUrl = defaultServerUrl }) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const socketRef = useRef(null);

  // ── Socket lifecycle ──
  useEffect(() => {
    const socket = io(serverUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      dispatch({ type: 'SET_CONNECTED', payload: { connected: true, socketId: socket.id } });
    });
    socket.on('disconnect', () => {
      dispatch({ type: 'SET_CONNECTED', payload: { connected: false } });
    });
    socket.on('connect_error', (err) => {
      console.error('Socket connect error:', err.message);
    });

    // Room events
    socket.on('room:joined', (data) => dispatch({ type: 'PLAYER_JOINED', payload: data }));
    socket.on('room:state', (data) => dispatch({ type: 'ROOM_STATE', payload: data }));
    socket.on('room:left', (data) => dispatch({ type: 'PLAYER_LEFT', payload: data }));

    // Token events
    socket.on('token:add', (data) => dispatch({ type: 'TOKEN_ADD', payload: data }));
    socket.on('token:move', (data) => dispatch({ type: 'TOKEN_MOVE', payload: data }));
    socket.on('token:update', (data) => dispatch({ type: 'TOKEN_UPDATE', payload: data }));
    socket.on('token:remove', (data) => dispatch({ type: 'TOKEN_REMOVE', payload: data }));

    // Map
    socket.on('map:update', (data) => dispatch({ type: 'MAP_UPDATE', payload: data }));

    // Fog
    socket.on('fog:reveal', (data) => dispatch({ type: 'FOG_REVEAL', payload: data }));
    socket.on('fog:clear', () => dispatch({ type: 'FOG_CLEAR' }));

    // Chat & Dice
    socket.on('chat:message', (data) => dispatch({ type: 'CHAT_MESSAGE', payload: data }));
    socket.on('dice:result', (data) => dispatch({ type: 'DICE_RESULT', payload: data }));

    // Initiative
    socket.on('initiative:update', (data) => dispatch({ type: 'INITIATIVE_UPDATE', payload: data }));

    // Ambiance
    socket.on('ambiance:change', (data) => dispatch({ type: 'AMBIANCE_CHANGE', payload: data }));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [serverUrl]);

  // ── Emit helper ──
  const emit = useCallback((event, data) => {
    return new Promise((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket?.connected) return reject(new Error('Not connected'));
      socket.timeout(8000).emit(event, data, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }, []);

  // ── Actions ──
  const actions = {
    createRoom: async (dmName) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await emit('room:create', { dmName });
        if (!res.success) throw new Error(res.error);
        dispatch({
          type: 'ROOM_JOINED',
          payload: {
            room: res.room,
            player: { id: res.room.dm_id || res.room.players?.find(p => p.is_dm)?.id, name: dmName, isDM: true },
            players: res.room.players || [],
            gameState: res.room.gameState,
          },
        });
        return res;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
        throw err;
      }
    },

    joinRoom: async (code, playerName) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await emit('room:join', { code, playerName });
        if (!res.success) throw new Error(res.error);
        dispatch({
          type: 'ROOM_JOINED',
          payload: {
            room: res.room,
            player: { id: res.room.playerId, name: playerName, isDM: false },
            players: res.room.players || [],
            gameState: res.room.gameState,
          },
        });
        return res;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
        throw err;
      }
    },

    leaveRoom: () => {
      socketRef.current?.emit('room:leave');
      dispatch({ type: 'LEAVE_ROOM' });
    },

    // Tokens
    addToken: (data) => emit('token:add', data),
    moveToken: (tokenId, x, y) => emit('token:move', { tokenId, x, y }),
    updateToken: (tokenId, updates) => emit('token:update', { tokenId, updates }),
    removeToken: (tokenId) => emit('token:remove', { tokenId }),

    // Map
    setMap: (mapUrl) => emit('map:set', { mapUrl }),

    // Fog
    revealFog: (x, y, radius) => emit('fog:reveal', { x, y, radius }),
    clearFog: () => emit('fog:clear', {}),

    // Chat
    sendMessage: (message, isWhisper = false, targetPlayer = null) =>
      emit('chat:send', { message, isWhisper, targetPlayer }),

    // Dice
    rollDice: (notation, isSecret = false) =>
      emit('dice:roll', { notation, isSecret }),

    // Initiative
    rollInitiative: (playerId, modifier = 0) =>
      emit('initiative:roll', { playerId, modifier }),
    nextTurn: () => emit('initiative:next', {}),
    clearInitiative: () => emit('initiative:clear', {}),

    // Ambiance
    setAmbiance: (trackUrl) => emit('ambiance:set', { trackUrl }),

    // UI (local only)
    setActiveTool: (tool) => dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool }),
    selectToken: (id) => dispatch({ type: 'SELECT_TOKEN', payload: id }),
    toggleLeftPanel: () => dispatch({ type: 'TOGGLE_LEFT_PANEL' }),
    toggleRightPanel: () => dispatch({ type: 'TOGGLE_RIGHT_PANEL' }),
    clearError: () => dispatch({ type: 'SET_ERROR', payload: null }),
  };

  return (
    <GameContext.Provider value={{ state, actions }}>
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}

export default GameContext;
