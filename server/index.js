const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Import our modules
const { initDatabase, saveRoomState, loadRoomState } = require('./db');
const roomManager = require('./rooms');
const { TokenManager, MapManager, FogManager, AmbianceManager, getGameState } = require('./game-state');
const { rollDice, formatRollResult, getRollType } = require('./dice');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configure CORS
const io = socketIo(server, {
    cors: {
        origin: ["http://localhost:3000", "http://localhost:5173", /\.trycloudflare\.com$/, /\.vercel\.app$/, /\.onrender\.com$/],
        methods: ["GET", "POST"],
        credentials: true
    },
    maxHttpBufferSize: 10e6, // 10MB for map uploads via socket
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/public', express.static('public'));

// Map upload endpoint (HTTP — more reliable than socket for large files)
const fs = require('fs');
const path = require('path');
const mapsDir = path.join(__dirname, 'public', 'maps');
if (!fs.existsSync(mapsDir)) fs.mkdirSync(mapsDir, { recursive: true });

app.post('/api/upload-map', express.raw({ type: 'image/*', limit: '10mb' }), (req, res) => {
    const ext = (req.headers['content-type'] || 'image/png').split('/')[1] || 'png';
    const filename = `map-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(mapsDir, filename), req.body);
    res.json({ success: true, url: `/public/maps/${filename}` });
});

// Token image upload endpoint
const tokensDir = path.join(__dirname, 'public', 'tokens');
if (!fs.existsSync(tokensDir)) fs.mkdirSync(tokensDir, { recursive: true });

app.post('/api/upload-token', express.raw({ type: 'image/*', limit: '2mb' }), (req, res) => {
    const ext = (req.headers['content-type'] || 'image/png').split('/')[1] || 'png';
    const filename = `token-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(tokensDir, filename), req.body);
    res.json({ success: true, url: `/public/tokens/${filename}` });
});

// Health check endpoints
app.get('/', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'RPG VTT Backend',
        version: '1.0.0',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.get('/api/rooms', async (req, res) => {
    try {
        const rooms = await roomManager.listActiveRooms();
        res.json({
            success: true,
            rooms,
            count: rooms.length
        });
    } catch (error) {
        console.error('Error listing rooms:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list rooms'
        });
    }
});

// Store connected players
const connectedPlayers = new Map();

// Initialize tracker for initiative
const initiativeTrackers = new Map(); // roomId -> { players: [], currentTurn: 0, active: false }

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Client → Server events
    
    // Create room
    socket.on('room:create', async (data, callback) => {
        try {
            const { dmName } = data;
            const room = await roomManager.createRoom(dmName);
            
            // Join socket room
            socket.join(room.id);
            
            // Update player socket
            await roomManager.updatePlayerSocket(room.dm_id, socket.id);
            connectedPlayers.set(socket.id, {
                id: room.dm_id,
                roomId: room.id,
                name: dmName,
                isDM: true
            });
            
            // Initialize initiative tracker (load from persistence if exists)
            const persistedState = await loadRoomState(room.id);
            initiativeTrackers.set(room.id, persistedState.initiative || {
                players: [],
                currentTurn: 0,
                active: false
            });
            
            console.log(`🏠 Room created: ${room.code} by ${dmName}`);
            
            // Get initial room state
            const roomDetails = await roomManager.getRoomDetails(room.id);
            const gameState = await getGameState(room.id);
            
            callback({
                success: true,
                room: {
                    ...roomDetails,
                    gameState
                }
            });
            
            // Broadcast to room
            socket.to(room.id).emit('room:state', {
                ...roomDetails,
                gameState
            });
            
        } catch (error) {
            console.error('Error creating room:', error);
            callback({
                success: false,
                error: error.message
            });
        }
    });
    
    // Join room
    socket.on('room:join', async (data, callback) => {
        try {
            const { code, playerName, avatar } = data;
            const joinResult = await roomManager.joinRoom(code, playerName, avatar);
            
            // Join socket room
            socket.join(joinResult.room_id);
            
            // Update player socket
            await roomManager.updatePlayerSocket(joinResult.player_id, socket.id);
            connectedPlayers.set(socket.id, {
                id: joinResult.player_id,
                roomId: joinResult.room_id,
                name: playerName,
                isDM: false
            });
            
            console.log(`👤 ${playerName} joined room ${code}`);
            
            // Load initiative tracker if not already in memory
            if (!initiativeTrackers.has(joinResult.room_id)) {
                const persistedState = await loadRoomState(joinResult.room_id);
                initiativeTrackers.set(joinResult.room_id, persistedState.initiative || {
                    players: [],
                    currentTurn: 0,
                    active: false
                });
            }
            
            // Get room state
            const roomDetails = await roomManager.getRoomDetails(joinResult.room_id);
            const gameState = await getGameState(joinResult.room_id);
            
            callback({
                success: true,
                room: {
                    ...roomDetails,
                    gameState,
                    playerId: joinResult.player_id
                }
            });
            
            // Broadcast player joined to others
            socket.to(joinResult.room_id).emit('room:joined', {
                playerId: joinResult.player_id,
                playerName,
                avatar
            });
            
            // Send updated room state to all
            io.to(joinResult.room_id).emit('room:state', {
                ...roomDetails,
                gameState
            });
            
        } catch (error) {
            console.error('Error joining room:', error);
            callback({
                success: false,
                error: error.message
            });
        }
    });
    
    // Token management
    socket.on('token:add', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const token = await TokenManager.addToken(player.roomId, player.id, data);
            
            console.log(`🎭 Token added: ${token.name} in room ${player.roomId}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('token:add', token);
            
            callback({ success: true, token });
        } catch (error) {
            console.error('Error adding token:', error);
            callback({ success: false, error: error.message });
        }
    });
    
    socket.on('token:move', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { tokenId, x, y } = data;
            const result = await TokenManager.moveToken(tokenId, player.id, x, y);
            
            // Broadcast to others (not self)
            socket.to(player.roomId).emit('token:move', result);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error moving token:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('token:update', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { tokenId, updates } = data;
            const token = await TokenManager.updateToken(tokenId, player.id, updates);
            
            // Broadcast to room
            io.to(player.roomId).emit('token:update', token);
            
            if (callback) callback({ success: true, token });
        } catch (error) {
            console.error('Error updating token:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('token:remove', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { tokenId } = data;
            const result = await TokenManager.removeToken(tokenId, player.id);
            
            // Broadcast to room
            io.to(player.roomId).emit('token:remove', result);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error removing token:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Map management
    socket.on('map:set', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { mapUrl } = data;
            const result = await MapManager.setActiveMap(player.roomId, player.id, mapUrl);
            
            console.log(`🗺️ Map changed in room ${player.roomId}: ${mapUrl}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('map:update', result);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error setting map:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Fog of War
    socket.on('fog:reveal', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { x, y, radius } = data;
            const result = await FogManager.revealArea(player.roomId, player.id, x, y, radius);
            
            // Broadcast to room
            io.to(player.roomId).emit('fog:reveal', result);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error revealing fog:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('fog:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const result = await FogManager.clearAllFog(player.roomId, player.id);
            
            // Broadcast to room
            io.to(player.roomId).emit('fog:clear', result);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing fog:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Dice rolling
    socket.on('dice:roll', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { notation, isSecret = false } = data;
            const rollResult = rollDice(notation, player.name);
            rollResult.playerId = player.id;
            rollResult.isSecret = isSecret;
            rollResult.type = getRollType(notation);
            
            console.log(`🎲 ${player.name} rolled: ${notation} = ${rollResult.total}`);
            
            if (isSecret && player.isDM) {
                // Send only to DM
                socket.emit('dice:result', rollResult);
            } else {
                // Broadcast to entire room
                io.to(player.roomId).emit('dice:result', rollResult);
            }
            
            // Save to chat as system message
            // TODO: Implement chat message storage
            
            if (callback) callback({ success: true, result: rollResult });
        } catch (error) {
            console.error('Error rolling dice:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Chat messages
    socket.on('chat:send', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { message, isWhisper = false, targetPlayer = null } = data;
            
            const chatMessage = {
                id: uuidv4(),
                playerId: player.id,
                playerName: player.name,
                message,
                isWhisper,
                targetPlayer,
                timestamp: new Date().toISOString()
            };
            
            console.log(`💬 ${player.name}: ${message}`);
            
            if (isWhisper && targetPlayer) {
                // Send to target and sender only
                // Find target socket
                const targetSocket = [...connectedPlayers.entries()]
                    .find(([_, p]) => p.id === targetPlayer)?.[0];
                
                if (targetSocket) {
                    io.to(targetSocket).emit('chat:message', chatMessage);
                    socket.emit('chat:message', chatMessage);
                }
            } else {
                // Broadcast to entire room
                io.to(player.roomId).emit('chat:message', chatMessage);
            }
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error sending chat:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Initiative tracking
    socket.on('initiative:roll', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { playerId: targetPlayerId, modifier = 0 } = data;
            const rollResult = rollDice(`1d20+${modifier}`, player.name);
            
            // Get or create initiative tracker
            let tracker = initiativeTrackers.get(player.roomId);
            if (!tracker) {
                tracker = { players: [], currentTurn: 0, active: false };
                initiativeTrackers.set(player.roomId, tracker);
            }
            
            // Add/update player initiative
            const existingIndex = tracker.players.findIndex(p => p.playerId === (targetPlayerId || player.id));
            const initiativeEntry = {
                playerId: targetPlayerId || player.id,
                playerName: targetPlayerId ? 
                    [...connectedPlayers.values()].find(p => p.id === targetPlayerId)?.name || 'Unknown' :
                    player.name,
                initiative: rollResult.total,
                conditions: []
            };
            
            if (existingIndex >= 0) {
                tracker.players[existingIndex] = initiativeEntry;
            } else {
                tracker.players.push(initiativeEntry);
            }
            
            // Sort by initiative (highest first)
            tracker.players.sort((a, b) => b.initiative - a.initiative);
            
            console.log(`⚡ Initiative: ${initiativeEntry.playerName} rolled ${rollResult.total}`);
            
            // Save initiative to persistence
            await saveRoomState(player.roomId, 'initiative', tracker);
            
            // Broadcast updated initiative
            io.to(player.roomId).emit('initiative:update', tracker);
            
            if (callback) callback({ success: true, rollResult, tracker });
        } catch (error) {
            console.error('Error rolling initiative:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('initiative:next', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can advance initiative');
            
            const tracker = initiativeTrackers.get(player.roomId);
            if (!tracker || tracker.players.length === 0) {
                throw new Error('No initiative tracker active');
            }
            
            tracker.currentTurn = (tracker.currentTurn + 1) % tracker.players.length;
            tracker.active = true;
            
            console.log(`⏭️ Initiative advanced to: ${tracker.players[tracker.currentTurn]?.playerName}`);
            
            // Save initiative to persistence
            await saveRoomState(player.roomId, 'initiative', tracker);
            
            // Broadcast updated initiative
            io.to(player.roomId).emit('initiative:update', tracker);
            
            if (callback) callback({ success: true, tracker });
        } catch (error) {
            console.error('Error advancing initiative:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('initiative:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can clear initiative');
            
            const tracker = { players: [], currentTurn: 0, active: false };
            initiativeTrackers.set(player.roomId, tracker);
            
            console.log(`🗑️ Initiative cleared in room ${player.roomId}`);
            
            // Broadcast updated initiative
            io.to(player.roomId).emit('initiative:update', tracker);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing initiative:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Ambiance control
    socket.on('ambiance:set', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { trackUrl } = data;
            const result = await AmbianceManager.setTrack(player.roomId, player.id, trackUrl);
            
            console.log(`🎵 Ambiance changed in room ${player.roomId}: ${trackUrl}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('ambiance:change', result);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error setting ambiance:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Draw events
    socket.on('draw:add', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can draw on map');
            
            const { type, points, color, strokeWidth } = data;
            const drawData = {
                id: uuidv4(),
                type, // 'line' or 'circle'
                points, // Array of {x, y} points
                color: color || '#ff6b6b',
                strokeWidth: strokeWidth || 3,
                timestamp: Date.now()
            };
            
            console.log(`✏️ Draw added in room ${player.roomId}: ${type} with ${points.length} points`);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('draw:add', drawData);
            
            if (callback) callback({ success: true, drawData });
        } catch (error) {
            console.error('Error adding draw:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('draw:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can clear drawings');
            
            console.log(`🧹 Drawings cleared in room ${player.roomId}`);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('draw:clear');
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing drawings:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Handle disconnection
    socket.on('disconnect', async () => {
        console.log(`🔌 Client disconnected: ${socket.id}`);
        
        const player = connectedPlayers.get(socket.id);
        if (player) {
            try {
                // Mark player as disconnected
                await roomManager.leaveRoom(player.id);
                
                // Notify room
                socket.to(player.roomId).emit('room:left', {
                    playerId: player.id,
                    playerName: player.name
                });
                
                console.log(`👤 ${player.name} left room`);
            } catch (error) {
                console.error('Error handling disconnect:', error);
            }
            
            connectedPlayers.delete(socket.id);
        }
    });
});

// Start server
const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        // Initialize database
        await initDatabase();
        
        server.listen(PORT, () => {
            console.log(`🎲 RPG VTT Server running on port ${PORT}`);
            console.log(`🌐 Health check: http://localhost:${PORT}/`);
            console.log(`📊 Rooms API: http://localhost:${PORT}/api/rooms`);
        });
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

startServer();