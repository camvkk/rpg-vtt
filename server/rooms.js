const { v4: uuidv4 } = require('uuid');
const { query, run, get } = require('./db');

// Generate 6-character room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Create a new room
async function createRoom(dmName) {
    const roomId = uuidv4();
    const code = generateRoomCode();
    
    try {
        // Check if code already exists (retry if needed)
        let attempts = 0;
        let finalCode = code;
        
        while (attempts < 10) {
            const existing = await get('SELECT id FROM rooms WHERE code = ?', [finalCode]);
            if (!existing) break;
            
            finalCode = generateRoomCode();
            attempts++;
        }

        if (attempts >= 10) {
            throw new Error('Failed to generate unique room code');
        }

        // Create room
        await run(`
            INSERT INTO rooms (id, code, dm_name)
            VALUES (?, ?, ?)
        `, [roomId, finalCode, dmName]);

        // Add DM as player
        const dmId = uuidv4();
        await run(`
            INSERT INTO players (id, room_id, name, is_dm, is_connected)
            VALUES (?, ?, ?, 1, 1)
        `, [dmId, roomId, dmName]);

        return {
            id: roomId,
            code: finalCode,
            dm_name: dmName,
            dm_id: dmId
        };
    } catch (error) {
        console.error('Error creating room:', error);
        throw error;
    }
}

// Join an existing room
async function joinRoom(code, playerName, avatar = null) {
    try {
        // Find room by code
        const room = await get(`
            SELECT id, dm_name, is_active 
            FROM rooms 
            WHERE code = ? AND is_active = 1
        `, [code]);

        if (!room) {
            throw new Error('Room not found or inactive');
        }

        // Check if player name already exists in room
        const existingPlayer = await get(`
            SELECT id FROM players 
            WHERE room_id = ? AND name = ? AND is_connected = 1
        `, [room.id, playerName]);

        if (existingPlayer) {
            throw new Error('Player name already taken in this room');
        }

        // Add player to room
        const playerId = uuidv4();
        await run(`
            INSERT INTO players (id, room_id, name, avatar, is_connected)
            VALUES (?, ?, ?, ?, 1)
        `, [playerId, room.id, playerName, avatar]);

        return {
            room_id: room.id,
            player_id: playerId,
            dm_name: room.dm_name
        };
    } catch (error) {
        console.error('Error joining room:', error);
        throw error;
    }
}

// Leave room (disconnect player)
async function leaveRoom(playerId) {
    try {
        await run(`
            UPDATE players 
            SET is_connected = 0, socket_id = NULL
            WHERE id = ?
        `, [playerId]);
        
        return true;
    } catch (error) {
        console.error('Error leaving room:', error);
        throw error;
    }
}

// Get all players in a room
async function getRoomPlayers(roomId) {
    try {
        const players = await query(`
            SELECT id, name, avatar, is_dm, is_connected, joined_at
            FROM players 
            WHERE room_id = ? AND is_connected = 1
            ORDER BY is_dm DESC, joined_at ASC
        `, [roomId]);

        return players;
    } catch (error) {
        console.error('Error getting room players:', error);
        throw error;
    }
}

// Get room details
async function getRoomDetails(roomId) {
    try {
        const room = await get(`
            SELECT id, code, dm_name, created_at, current_map, ambiance_track, initiative_turn
            FROM rooms 
            WHERE id = ? AND is_active = 1
        `, [roomId]);

        if (!room) {
            throw new Error('Room not found');
        }

        const players = await getRoomPlayers(roomId);
        
        return {
            ...room,
            players
        };
    } catch (error) {
        console.error('Error getting room details:', error);
        throw error;
    }
}

// Get room by code
async function getRoomByCode(code) {
    try {
        const room = await get(`
            SELECT id, code, dm_name, is_active
            FROM rooms 
            WHERE code = ?
        `, [code]);

        return room;
    } catch (error) {
        console.error('Error getting room by code:', error);
        throw error;
    }
}

// Update player socket ID
async function updatePlayerSocket(playerId, socketId) {
    try {
        await run(`
            UPDATE players 
            SET socket_id = ?
            WHERE id = ?
        `, [socketId, playerId]);
        
        return true;
    } catch (error) {
        console.error('Error updating player socket:', error);
        throw error;
    }
}

// Get player by socket ID
async function getPlayerBySocket(socketId) {
    try {
        const player = await get(`
            SELECT p.*, r.code as room_code
            FROM players p
            JOIN rooms r ON p.room_id = r.id
            WHERE p.socket_id = ? AND p.is_connected = 1
        `, [socketId]);

        return player;
    } catch (error) {
        console.error('Error getting player by socket:', error);
        throw error;
    }
}

// Close room (set as inactive)
async function closeRoom(roomId) {
    try {
        await run(`
            UPDATE rooms 
            SET is_active = 0
            WHERE id = ?
        `, [roomId]);

        // Disconnect all players
        await run(`
            UPDATE players 
            SET is_connected = 0, socket_id = NULL
            WHERE room_id = ?
        `, [roomId]);
        
        return true;
    } catch (error) {
        console.error('Error closing room:', error);
        throw error;
    }
}

// List all active rooms (for debugging)
async function listActiveRooms() {
    try {
        const rooms = await query(`
            SELECT r.id, r.code, r.dm_name, r.created_at,
                   COUNT(p.id) as player_count
            FROM rooms r
            LEFT JOIN players p ON r.id = p.room_id AND p.is_connected = 1
            WHERE r.is_active = 1
            GROUP BY r.id, r.code, r.dm_name, r.created_at
            ORDER BY r.created_at DESC
        `);

        return rooms;
    } catch (error) {
        console.error('Error listing active rooms:', error);
        throw error;
    }
}

module.exports = {
    createRoom,
    joinRoom,
    leaveRoom,
    getRoomPlayers,
    getRoomDetails,
    getRoomByCode,
    updatePlayerSocket,
    getPlayerBySocket,
    closeRoom,
    listActiveRooms,
    generateRoomCode
};