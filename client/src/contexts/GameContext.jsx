import { createContext, useContext, useReducer, useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

// ── State shape ──
const initialState = {
  // Connection
  connected: false,
  socketId: null,

  // Room
  room: { id: null, code: null, dmName: null, status: 'lobby', system: 'dnd5e' },
  player: { id: null, name: '', isDM: false },
  players: [],

  // Campaign
  campaign: { id: null, name: null, googleDocsUrl: null, system: 'dnd5e' },
  character: null,
  allCharacters: new Map(), // Map of playerName -> characterData (for DM dashboard)
  systemData: null,

  // Map
  map: { url: null, width: 2000, height: 2000 },

  // Grid config
  gridConfig: { gridType: 'square', gridSize: 40, snapEnabled: true, gridVisible: true },

  // Tokens (array for simplicity — Map doesn't serialize in reducer)
  tokens: [],

  // Fog of war revealed areas (rects, polygons, circles)
  fogAreas: [],
  fogEnabled: false,

  // Doors on walls
  doors: [],

  // Drawings on the map
  drawings: [],

  // Walls for dynamic lighting
  walls: [],

  // Initiative
  initiative: { active: false, currentTurn: 0, players: [] },

  // Chat messages
  chat: [],

  // Ambiance
  ambiance: { trackUrl: null, isPlaying: false },

  // AoE Effects
  aoeEffects: [],

  // Scenes
  scenes: [],

  // Journal
  journal: [],

  // Jukebox
  jukebox: {
    playlists: [],
    currentTrack: null,
    isPlaying: false,
    volume: 0.7,
  },

  // UI
  ui: {
    activeTool: 'select',
    selectedTokenId: null,
    leftPanel: true,
    rightPanel: true,
    aoeConfig: {
      shape: 'circle',
      radius: 20,
      length: 30,
      width: 5,
      angle: 60,
      color: 'damage',
      spellName: ''
    }
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
        room: { id: room.id, code: room.code, dmName: room.dm_name, status: 'playing', system: room.system || 'dnd5e' },
        player: { id: player.id, name: player.name, isDM: player.isDM },
        players: players || [],
        tokens: gs?.tokens || [],
        fogAreas: gs?.fog || [],
        fogEnabled: gs?.fogEnabled !== undefined ? gs.fogEnabled : false,
        drawings: gs?.drawings || [],
        walls: gs?.walls || [],
        doors: gs?.doors || [],
        aoeEffects: gs?.aoeEffects || [],
        ambiance: { trackUrl: gs?.ambiance || null, isPlaying: false },
        map: { ...state.map, url: gs?.map || null },
        gridConfig: gs?.gridConfig || state.gridConfig,
        loading: false,
        error: null,
      };
    }

    case 'CAMPAIGN_JOINED': {
      const { campaign, room, player, players, gameState: gs, character, chatHistory, isDM } = action.payload;
      return {
        ...state,
        campaign: { 
          id: campaign.id, 
          name: campaign.name, 
          googleDocsUrl: campaign.googleDocsUrl,
          system: campaign.system
        },
        systemData: campaign.systemData || null,
        room: { id: room.id, code: room.code, dmName: room.dm_name, status: 'playing', system: room.system || campaign.system },
        player: { id: player.id, name: player.name, isDM: isDM },
        players: players || [],
        character: character,
        tokens: gs?.tokens || [],
        fogAreas: gs?.fog || [],
        fogEnabled: gs?.fogEnabled !== undefined ? gs.fogEnabled : false,
        drawings: gs?.drawings || [],
        walls: gs?.walls || [],
        doors: gs?.doors || [],
        aoeEffects: gs?.aoeEffects || [],
        ambiance: { trackUrl: gs?.ambiance || null, isPlaying: false },
        map: { ...state.map, url: gs?.map || null },
        gridConfig: gs?.gridConfig || state.gridConfig,
        chat: chatHistory || [],
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
        walls: d.gameState?.walls || state.walls,
        doors: d.gameState?.doors || state.doors,
        aoeEffects: d.gameState?.aoeEffects || state.aoeEffects,
        map: { ...state.map, url: d.gameState?.map || state.map.url },
      };
    }

    case 'PLAYER_JOINED':
      return { ...state, players: [...state.players, action.payload] };

    case 'PLAYER_LEFT':
      return { ...state, players: state.players.filter(p => p.id !== action.payload.playerId) };

    case 'LEAVE_ROOM':
      return { ...initialState, connected: state.connected, socketId: state.socketId };

    // Campaign
    case 'CAMPAIGN_DOCS_UPDATED':
      return { ...state, campaign: { ...state.campaign, googleDocsUrl: action.payload.url } };

    case 'CHARACTER_UPDATED':
      return { ...state, character: action.payload };

    case 'ALL_CHARACTERS_LOADED': {
      const allCharacters = new Map();
      action.payload.forEach(({ playerName, character }) => {
        allCharacters.set(playerName, character);
      });
      return { ...state, allCharacters };
    }

    case 'CHARACTER_UPDATED_BROADCAST': {
      const { playerName, characterData } = action.payload;
      const newAllCharacters = new Map(state.allCharacters);
      newAllCharacters.set(playerName, characterData);
      
      // Also update current character if it's the same player
      const newCharacter = (state.player.name === playerName) ? characterData : state.character;
      
      return { 
        ...state, 
        character: newCharacter,
        allCharacters: newAllCharacters 
      };
    }

    case 'SYSTEM_PARSED':
      return { ...state, systemData: action.payload.systemData };

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

    case 'FOG_HIDE':
      return { ...state, fogAreas: state.fogAreas.filter(a => a.id !== action.payload.areaId) };

    case 'FOG_RESET':
      return { ...state, fogAreas: [] };

    case 'FOG_CLEAR':
      return { ...state, fogAreas: [{ id: 'clear-all', type: 'circle', x: 0, y: 0, radius: 9999 }] };

    case 'FOG_SYNC':
      return { ...state, fogAreas: action.payload };

    case 'FOG_TOGGLE':
      return { ...state, fogEnabled: action.payload };

    // Doors
    case 'DOOR_ADD':
      return { ...state, doors: [...state.doors, action.payload] };

    case 'DOOR_UPDATE': {
      const doorUpdate = action.payload;
      return { ...state, doors: state.doors.map(d => d.id === doorUpdate.id ? { ...d, ...doorUpdate } : d) };
    }

    case 'DOOR_REMOVE':
      return { ...state, doors: state.doors.filter(d => d.id !== action.payload.doorId) };

    case 'DOOR_CLEAR':
      return { ...state, doors: [] };

    // Drawings
    case 'DRAW_ADD':
      return { ...state, drawings: [...state.drawings, action.payload] };

    case 'DRAW_CLEAR':
      return { ...state, drawings: [] };

    // Walls
    case 'WALL_ADD':
      return { ...state, walls: [...state.walls, action.payload] };

    case 'WALL_REMOVE':
      return { ...state, walls: state.walls.filter(w => w.id !== action.payload.wallId) };

    case 'WALL_CLEAR':
      return { ...state, walls: [] };

    // AoE Effects
    case 'AOE_ADD':
      return { ...state, aoeEffects: [...state.aoeEffects, action.payload] };

    case 'AOE_REMOVE':
      return { ...state, aoeEffects: state.aoeEffects.filter(aoe => aoe.id !== action.payload.aoeId) };

    case 'AOE_CLEAR':
      return { ...state, aoeEffects: [] };

    // Chat
    case 'CHAT_MESSAGE':
      return { ...state, chat: [...state.chat, action.payload] };

    case 'DICE_RESULT':
      return { ...state, chat: [...state.chat, action.payload] };

    // Initiative
    case 'INITIATIVE_UPDATE':
      return { ...state, initiative: action.payload };

    // Ambiance
    case 'AMBIANCE_CHANGE':
      return { ...state, ambiance: { ...state.ambiance, ...action.payload } };

    // UI
    case 'SET_GRID_CONFIG':
      return { ...state, gridConfig: { ...state.gridConfig, ...action.payload } };

    case 'SET_ACTIVE_TOOL':
      return { ...state, ui: { ...state.ui, activeTool: action.payload } };

    case 'SELECT_TOKEN':
      return { ...state, ui: { ...state.ui, selectedTokenId: action.payload } };

    case 'TOGGLE_LEFT_PANEL':
      return { ...state, ui: { ...state.ui, leftPanel: !state.ui.leftPanel } };

    case 'TOGGLE_RIGHT_PANEL':
      return { ...state, ui: { ...state.ui, rightPanel: !state.ui.rightPanel } };

    case 'SET_AOE_CONFIG':
      return { ...state, ui: { ...state.ui, aoeConfig: { ...state.ui.aoeConfig, ...action.payload } } };

    // Scenes
    case 'SCENES_LOADED':
      return { ...state, scenes: action.payload };

    case 'SCENE_ACTIVATED': {
      const scene = action.payload;
      if (!scene) return state;
      return {
        ...state,
        map: { ...state.map, url: scene.mapUrl || null },
        tokens: scene.tokens || [],
        fogAreas: scene.fog || [],
        walls: scene.walls || [],
        drawings: scene.drawings || [],
        aoeEffects: scene.aoeEffects || [],
        gridConfig: scene.gridConfig || state.gridConfig,
      };
    }

    // Journal
    case 'JOURNAL_LOADED':
      return { ...state, journal: action.payload };

    // Jukebox
    case 'JUKEBOX_PLAYLISTS':
      return { ...state, jukebox: { ...state.jukebox, playlists: action.payload } };

    case 'JUKEBOX_PLAY':
      return { ...state, jukebox: { ...state.jukebox, currentTrack: action.payload, isPlaying: true } };

    case 'JUKEBOX_STOP':
      return { ...state, jukebox: { ...state.jukebox, isPlaying: false, currentTrack: null } };

    case 'JUKEBOX_VOLUME':
      return { ...state, jukebox: { ...state.jukebox, volume: action.payload.volume } };

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

  // ── Session persistence helpers ──
  const saveSessionData = useCallback((roomCode, playerName, isDM) => {
    const sessionData = {
      roomCode,
      playerName,
      isDM,
      timestamp: Date.now()
    };
    sessionStorage.setItem('rpgvtt-session', JSON.stringify(sessionData));
  }, []);

  const getSessionData = useCallback(() => {
    try {
      const stored = sessionStorage.getItem('rpgvtt-session');
      if (stored) {
        const data = JSON.parse(stored);
        // Check if session is less than 24 hours old
        if (Date.now() - data.timestamp < 24 * 60 * 60 * 1000) {
          return data;
        }
      }
    } catch (e) {
      console.error('Error loading session data:', e);
    }
    return null;
  }, []);

  const clearSessionData = useCallback(() => {
    sessionStorage.removeItem('rpgvtt-session');
  }, []);

  // ── Auto-reconnect state ──
  const [reconnectAttempted, setReconnectAttempted] = useState(false);

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
      
      // Try to auto-reconnect to saved session
      if (!reconnectAttempted) {
        setReconnectAttempted(true);
        const sessionData = getSessionData();
        if (sessionData && sessionData.roomCode) {
          dispatch({ type: 'SET_LOADING', payload: true });
          dispatch({ type: 'SET_ERROR', payload: 'Reconectando à sessão anterior...' });
          
          // Attempt to rejoin the room
          setTimeout(async () => {
            try {
              if (sessionData.isDM) {
                // For DMs, we can't auto-rejoin since rooms are created fresh
                // Just clear the session data and show a message
                clearSessionData();
                dispatch({ type: 'SET_ERROR', payload: 'Sessão anterior expirou. Crie uma nova sala.' });
              } else {
                // For players, try to rejoin
                const res = await new Promise((resolve, reject) => {
                  socket.timeout(8000).emit('room:join', { 
                    code: sessionData.roomCode, 
                    playerName: sessionData.playerName 
                  }, (err, response) => err ? reject(err) : resolve(response));
                });
                
                if (res.success) {
                  dispatch({
                    type: 'ROOM_JOINED',
                    payload: {
                      room: res.room,
                      player: { id: res.room.playerId, name: sessionData.playerName, isDM: false },
                      players: res.room.players || [],
                      gameState: res.room.gameState,
                    },
                  });
                  dispatch({ type: 'SET_ERROR', payload: null });
                } else {
                  clearSessionData();
                  dispatch({ type: 'SET_ERROR', payload: 'Não foi possível reconectar. A sala pode ter expirado.' });
                }
              }
            } catch (error) {
              clearSessionData();
              dispatch({ type: 'SET_ERROR', payload: 'Falha na reconexão automática.' });
            } finally {
              dispatch({ type: 'SET_LOADING', payload: false });
              // Clear error after 5 seconds
              setTimeout(() => {
                dispatch({ type: 'SET_ERROR', payload: null });
              }, 5000);
            }
          }, 1000);
        }
      }
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
    socket.on('fog:hide', (data) => dispatch({ type: 'FOG_HIDE', payload: data }));
    socket.on('fog:reset', () => dispatch({ type: 'FOG_RESET' }));
    socket.on('fog:clear', () => dispatch({ type: 'FOG_CLEAR' }));
    socket.on('fog:sync', (data) => dispatch({ type: 'FOG_SYNC', payload: data }));
    socket.on('fog:toggle', (data) => dispatch({ type: 'FOG_TOGGLE', payload: data.enabled }));

    // Doors
    socket.on('door:add', (data) => dispatch({ type: 'DOOR_ADD', payload: data }));
    socket.on('door:update', (data) => dispatch({ type: 'DOOR_UPDATE', payload: data }));
    socket.on('door:remove', (data) => dispatch({ type: 'DOOR_REMOVE', payload: data }));
    socket.on('door:clear', () => dispatch({ type: 'DOOR_CLEAR' }));

    // Chat & Dice
    socket.on('chat:message', (data) => dispatch({ type: 'CHAT_MESSAGE', payload: {
      id: data.id,
      author: data.playerName,
      authorId: data.playerId,
      content: data.message,
      type: data.isWhisper ? 'whisper' : 'message',
      target: data.targetPlayer,
      timestamp: data.timestamp,
    } }));
    socket.on('dice:result', (data) => dispatch({ type: 'DICE_RESULT', payload: {
      id: data.id || Date.now().toString(),
      author: data.playerName,
      authorId: data.playerId,
      type: 'dice_result',
      formula: data.notation || data.formula,
      total: data.total,
      breakdown: data.breakdown || { individual: (data.rolls || []).map(r => ({ roll: r, kept: true, dropped: false })) },
      timestamp: data.timestamp || new Date().toISOString(),
    } }));

    // Initiative
    socket.on('initiative:update', (data) => dispatch({ type: 'INITIATIVE_UPDATE', payload: data }));

    // Ambiance
    socket.on('ambiance:change', (data) => dispatch({ type: 'AMBIANCE_CHANGE', payload: data }));

    // Drawings
    socket.on('draw:add', (data) => dispatch({ type: 'DRAW_ADD', payload: data }));
    socket.on('draw:clear', () => dispatch({ type: 'DRAW_CLEAR' }));

    // Walls
    socket.on('wall:add', (data) => dispatch({ type: 'WALL_ADD', payload: data }));
    socket.on('wall:remove', (data) => dispatch({ type: 'WALL_REMOVE', payload: data }));
    socket.on('wall:clear', () => dispatch({ type: 'WALL_CLEAR' }));

    // AoE Effects
    socket.on('aoe:add', (data) => dispatch({ type: 'AOE_ADD', payload: data }));
    socket.on('aoe:remove', (data) => dispatch({ type: 'AOE_REMOVE', payload: data }));
    socket.on('aoe:clear', () => dispatch({ type: 'AOE_CLEAR' }));

    // Grid config
    socket.on('grid:config', (data) => dispatch({ type: 'SET_GRID_CONFIG', payload: data }));

    // Campaign events
    socket.on('campaign:docs-updated', (data) => dispatch({ type: 'CAMPAIGN_DOCS_UPDATED', payload: data }));
    socket.on('character:updated', (data) => dispatch({ type: 'CHARACTER_UPDATED_BROADCAST', payload: data }));

    // System events
    socket.on('system:parsed', (data) => dispatch({ type: 'SYSTEM_PARSED', payload: data }));

    // Scene events
    socket.on('scene:list', (data) => dispatch({ type: 'SCENES_LOADED', payload: data }));
    socket.on('scene:activated', (data) => dispatch({ type: 'SCENE_ACTIVATED', payload: data }));

    // Journal events
    socket.on('journal:updated', (data) => dispatch({ type: 'JOURNAL_LOADED', payload: data }));

    // Jukebox events
    socket.on('jukebox:playlists', (data) => dispatch({ type: 'JUKEBOX_PLAYLISTS', payload: data }));
    socket.on('jukebox:play', (data) => dispatch({ type: 'JUKEBOX_PLAY', payload: data }));
    socket.on('jukebox:stop', () => dispatch({ type: 'JUKEBOX_STOP' }));
    socket.on('jukebox:volume', (data) => dispatch({ type: 'JUKEBOX_VOLUME', payload: data }));

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
      socket.timeout(15000).emit(event, data, (err, response) => {
        if (err) reject(err);
        else resolve(response);
      });
    });
  }, []);

  // Character auto-save (debounced)
  const characterSaveTimeoutRef = useRef(null);
  
  const saveCharacterDebounced = useCallback((campaignId, playerName, characterData) => {
    if (characterSaveTimeoutRef.current) {
      clearTimeout(characterSaveTimeoutRef.current);
    }
    
    characterSaveTimeoutRef.current = setTimeout(async () => {
      try {
        await emit('campaign:save-character', { campaignId, playerName, characterData });
      } catch (error) {
        console.error('Auto-save failed:', error);
      }
    }, 30000); // 30 second debounce
  }, [emit]);

  // ── Actions ──
  const actions = {
    createRoom: async (dmName, system = 'dnd5e') => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await emit('room:create', { dmName, system });
        if (!res.success) throw new Error(res.error);
        
        // Save session data
        saveSessionData(res.room.code, dmName, true);
        
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
        
        // Save session data
        saveSessionData(code, playerName, false);
        
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
      clearSessionData();
      dispatch({ type: 'LEAVE_ROOM' });
    },

    // Campaigns
    createCampaign: async (name, dmPassword, system = 'dnd5e', systemData = null) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await emit('campaign:create', { name, dmPassword, system, systemData });
        if (!res.success) throw new Error(res.error);
        
        // Server auto-joins DM, dispatch full state
        saveSessionData(res.campaignId, 'Mestre', true);
        dispatch({
          type: 'CAMPAIGN_JOINED',
          payload: {
            campaign: res.campaign,
            room: res.room,
            player: { id: res.room.dm_id || res.room.players?.find(p => p.is_dm)?.id, name: 'Mestre', isDM: true },
            players: res.room.players || [],
            gameState: res.room.gameState,
            character: res.character,
            chatHistory: res.chatHistory || [],
            isDM: true
          },
        });
        return res;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
        throw err;
      }
    },

    joinCampaign: async (campaignId, playerName, dmPassword = null) => {
      dispatch({ type: 'SET_LOADING', payload: true });
      try {
        const res = await emit('campaign:join', { campaignId, playerName, dmPassword });
        if (!res.success) throw new Error(res.error);
        
        // Save session data
        saveSessionData(campaignId, playerName, res.isDM);
        
        dispatch({
          type: 'CAMPAIGN_JOINED',
          payload: {
            campaign: res.campaign,
            room: res.room,
            player: { id: res.room.playerId, name: playerName, isDM: res.isDM },
            players: res.room.players || [],
            gameState: res.room.gameState,
            character: res.character,
            chatHistory: res.chatHistory,
            isDM: res.isDM
          },
        });
        return res;
      } catch (err) {
        dispatch({ type: 'SET_ERROR', payload: err.message });
        throw err;
      }
    },

    updateCharacter: (characterData) => {
      dispatch({ type: 'CHARACTER_UPDATED', payload: characterData });
      
      // Auto-save if in a campaign
      if (state.campaign.id && state.player.name) {
        saveCharacterDebounced(state.campaign.id, state.player.name, characterData);
      }
    },

    saveCharacter: async (campaignId, playerName, characterData) => {
      return emit('campaign:save-character', { campaignId, playerName, characterData });
    },

    // DM Dashboard actions
    getAllCharacters: async (campaignId) => {
      try {
        const res = await emit('campaign:get-all-characters', { campaignId });
        if (res.success) {
          dispatch({ type: 'ALL_CHARACTERS_LOADED', payload: res.characters });
        }
        return res;
      } catch (error) {
        console.error('Error getting all characters:', error);
        throw error;
      }
    },

    dmUpdateCharacter: async (campaignId, playerName, characterData) => {
      return emit('campaign:dm-update-character', { campaignId, playerName, characterData });
    },

    setGoogleDocs: async (campaignId, url) => {
      return emit('campaign:set-docs', { campaignId, url });
    },

    // System management
    getSystemData: async (campaignId) => {
      return emit('system:get', { campaignId });
    },

    uploadSystemText: async (text, filename) => {
      return emit('system:upload-text', { text, filename });
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
    revealFogArea: (area) => emit('fog:reveal', area),
    hideFogArea: (areaId) => emit('fog:hide', { areaId }),
    resetFog: () => emit('fog:reset', {}),
    clearFog: () => emit('fog:clear', {}),
    toggleFog: (enabled) => emit('fog:toggle', { enabled }),

    // Doors
    addDoor: (doorData) => emit('door:add', doorData),
    updateDoor: (doorId, updates) => emit('door:update', { doorId, ...updates }),
    removeDoor: (doorId) => emit('door:remove', { doorId }),
    clearDoors: () => emit('door:clear', {}),

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

    // Drawings
    addDraw: (type, points, color, strokeWidth) => emit('draw:add', { type, points, color, strokeWidth }),
    clearDrawings: () => emit('draw:clear', {}),

    // Walls
    addWall: (x1, y1, x2, y2) => emit('wall:add', { x1, y1, x2, y2 }),
    removeWall: (wallId) => emit('wall:remove', { wallId }),
    clearWalls: () => emit('wall:clear', {}),

    // AoE Effects
    addAoE: (aoeData) => emit('aoe:add', aoeData),
    removeAoE: (aoeId) => emit('aoe:remove', { aoeId }),
    clearAoE: () => emit('aoe:clear', {}),

    // Grid config
    setGridConfig: (config) => {
      dispatch({ type: 'SET_GRID_CONFIG', payload: config });
      emit('grid:config', config);
    },

    // Scenes
    listScenes: () => emit('scene:list', {}),
    saveScene: (scene) => emit('scene:save', scene),
    deleteScene: (sceneId) => emit('scene:delete', { sceneId }),
    activateScene: (sceneId) => emit('scene:activate', { sceneId }),
    saveCurrentScene: () => emit('scene:save-current', {}),

    // Journal
    listJournal: () => emit('journal:list', {}),
    saveJournalEntry: (entry) => emit('journal:save', entry),
    deleteJournalEntry: (entryId) => emit('journal:delete', { entryId }),

    // Jukebox
    listPlaylists: () => emit('jukebox:list', {}),
    savePlaylist: (playlist) => emit('jukebox:save-playlist', playlist),
    deletePlaylist: (playlistId) => emit('jukebox:delete-playlist', { playlistId }),
    jukeboxPlay: (trackData) => emit('jukebox:play', trackData),
    jukeboxStop: () => emit('jukebox:stop', {}),
    jukeboxVolume: (volume) => emit('jukebox:volume', { volume }),

    // UI (local only)
    setActiveTool: (tool) => dispatch({ type: 'SET_ACTIVE_TOOL', payload: tool }),
    selectToken: (id) => dispatch({ type: 'SELECT_TOKEN', payload: id }),
    toggleLeftPanel: () => dispatch({ type: 'TOGGLE_LEFT_PANEL' }),
    toggleRightPanel: () => dispatch({ type: 'TOGGLE_RIGHT_PANEL' }),
    setAoEConfig: (config) => dispatch({ type: 'SET_AOE_CONFIG', payload: config }),
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
