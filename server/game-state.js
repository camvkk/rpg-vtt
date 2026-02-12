const { v4: uuidv4 } = require('uuid');
const { query, run, get, saveRoomState, loadRoomState } = require('./db');

// Token management
const TokenManager = {
    // Add token to map
    async addToken(roomId, ownerId, tokenData) {
        const tokenId = uuidv4();
        const {
            name,
            x = 0,
            y = 0,
            image_url = null,
            size = 1,
            hp_current = 100,
            hp_max = 100
        } = tokenData;

        try {
            await run(`
                INSERT INTO tokens (id, room_id, owner_id, name, x, y, image_url, size, hp_current, hp_max)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [tokenId, roomId, ownerId, name, x, y, image_url, size, hp_current, hp_max]);

            const token = await get(`
                SELECT t.*, p.name as owner_name
                FROM tokens t
                LEFT JOIN players p ON t.owner_id = p.id
                WHERE t.id = ?
            `, [tokenId]);

            // Save updated tokens to room state
            const allTokens = await this.getRoomTokens(roomId);
            await saveRoomState(roomId, 'tokens', allTokens);

            return token;
        } catch (error) {
            console.error('Error adding token:', error);
            throw error;
        }
    },

    // Move token
    async moveToken(tokenId, playerId, x, y) {
        try {
            // Verify token ownership or DM permission
            const token = await get(`
                SELECT t.*, p.is_dm
                FROM tokens t
                JOIN players p ON p.room_id = t.room_id
                WHERE t.id = ? AND (t.owner_id = ? OR p.is_dm = 1) AND p.id = ?
            `, [tokenId, playerId, playerId]);

            if (!token) {
                throw new Error('Token not found or no permission to move');
            }

            await run(`
                UPDATE tokens 
                SET x = ?, y = ?
                WHERE id = ?
            `, [x, y, tokenId]);

            // Save updated tokens to room state
            const allTokens = await this.getRoomTokens(token.room_id);
            await saveRoomState(token.room_id, 'tokens', allTokens);

            return { tokenId, x, y };
        } catch (error) {
            console.error('Error moving token:', error);
            throw error;
        }
    },

    // Update token properties
    async updateToken(tokenId, playerId, updates) {
        try {
            // Verify ownership or DM permission
            const token = await get(`
                SELECT t.*, p.is_dm
                FROM tokens t
                JOIN players p ON p.room_id = t.room_id
                WHERE t.id = ? AND (t.owner_id = ? OR p.is_dm = 1) AND p.id = ?
            `, [tokenId, playerId, playerId]);

            if (!token) {
                throw new Error('Token not found or no permission to update');
            }

            const allowedFields = ['name', 'hp_current', 'hp_max', 'conditions', 'is_visible', 'initiative'];
            const updateFields = [];
            const updateValues = [];

            for (const [field, value] of Object.entries(updates)) {
                if (allowedFields.includes(field)) {
                    updateFields.push(`${field} = ?`);
                    updateValues.push(typeof value === 'object' ? JSON.stringify(value) : value);
                }
            }

            if (updateFields.length === 0) {
                throw new Error('No valid fields to update');
            }

            updateValues.push(tokenId);

            await run(`
                UPDATE tokens 
                SET ${updateFields.join(', ')}
                WHERE id = ?
            `, updateValues);

            // Return updated token
            const updatedToken = await get(`
                SELECT t.*, p.name as owner_name
                FROM tokens t
                LEFT JOIN players p ON t.owner_id = p.id
                WHERE t.id = ?
            `, [tokenId]);

            // Save updated tokens to room state
            const allTokens = await this.getRoomTokens(token.room_id);
            await saveRoomState(token.room_id, 'tokens', allTokens);

            return updatedToken;
        } catch (error) {
            console.error('Error updating token:', error);
            throw error;
        }
    },

    // Remove token
    async removeToken(tokenId, playerId) {
        try {
            // Verify ownership or DM permission
            const token = await get(`
                SELECT t.*, p.is_dm
                FROM tokens t
                JOIN players p ON p.room_id = t.room_id
                WHERE t.id = ? AND (t.owner_id = ? OR p.is_dm = 1) AND p.id = ?
            `, [tokenId, playerId, playerId]);

            if (!token) {
                throw new Error('Token not found or no permission to remove');
            }

            await run('DELETE FROM tokens WHERE id = ?', [tokenId]);

            // Save updated tokens to room state
            const allTokens = await this.getRoomTokens(token.room_id);
            await saveRoomState(token.room_id, 'tokens', allTokens);

            return { tokenId };
        } catch (error) {
            console.error('Error removing token:', error);
            throw error;
        }
    },

    // Get all tokens in room
    async getRoomTokens(roomId) {
        try {
            const tokens = await query(`
                SELECT t.*, p.name as owner_name
                FROM tokens t
                LEFT JOIN players p ON t.owner_id = p.id
                WHERE t.room_id = ?
                ORDER BY t.created_at ASC
            `, [roomId]);

            // Parse conditions JSON
            return tokens.map(token => ({
                ...token,
                conditions: token.conditions ? JSON.parse(token.conditions) : []
            }));
        } catch (error) {
            console.error('Error getting room tokens:', error);
            throw error;
        }
    }
};

// Map management
const MapManager = {
    // Set active map
    async setActiveMap(roomId, playerId, mapUrl) {
        try {
            // Verify DM permission
            const player = await get(`
                SELECT is_dm FROM players 
                WHERE id = ? AND room_id = ? AND is_dm = 1
            `, [playerId, roomId]);

            if (!player) {
                throw new Error('Only DM can change maps');
            }

            await run(`
                UPDATE rooms 
                SET current_map = ?
                WHERE id = ?
            `, [mapUrl, roomId]);

            // Save updated map to room state
            await saveRoomState(roomId, 'map_url', mapUrl);

            return { url: mapUrl };
        } catch (error) {
            console.error('Error setting active map:', error);
            throw error;
        }
    },

    // Get current map
    async getCurrentMap(roomId) {
        try {
            const room = await get(`
                SELECT current_map 
                FROM rooms 
                WHERE id = ?
            `, [roomId]);

            return room?.current_map || null;
        } catch (error) {
            console.error('Error getting current map:', error);
            throw error;
        }
    }
};

// Fog of War management
const FogManager = {
    // Reveal fog area
    async revealArea(roomId, playerId, x, y, radius) {
        try {
            // Verify DM permission
            const player = await get(`
                SELECT is_dm FROM players 
                WHERE id = ? AND room_id = ? AND is_dm = 1
            `, [playerId, roomId]);

            if (!player) {
                throw new Error('Only DM can reveal fog of war');
            }

            const revealId = uuidv4();
            await run(`
                INSERT INTO fog_of_war (id, room_id, x, y, radius)
                VALUES (?, ?, ?, ?, ?)
            `, [revealId, roomId, x, y, radius]);

            // Save updated fog to room state
            const allFog = await this.getRevealedAreas(roomId);
            await saveRoomState(roomId, 'fog', allFog);

            return { revealId, x, y, radius };
        } catch (error) {
            console.error('Error revealing fog area:', error);
            throw error;
        }
    },

    // Get revealed areas
    async getRevealedAreas(roomId) {
        try {
            const areas = await query(`
                SELECT x, y, radius, revealed_at
                FROM fog_of_war
                WHERE room_id = ?
                ORDER BY revealed_at ASC
            `, [roomId]);

            return areas;
        } catch (error) {
            console.error('Error getting revealed areas:', error);
            throw error;
        }
    },

    // Clear all fog (reveal everything)
    async clearAllFog(roomId, playerId) {
        try {
            // Verify DM permission
            const player = await get(`
                SELECT is_dm FROM players 
                WHERE id = ? AND room_id = ? AND is_dm = 1
            `, [playerId, roomId]);

            if (!player) {
                throw new Error('Only DM can clear fog of war');
            }

            await run('DELETE FROM fog_of_war WHERE room_id = ?', [roomId]);
            
            // Add a large reveal area to represent "all clear"
            const revealId = uuidv4();
            await run(`
                INSERT INTO fog_of_war (id, room_id, x, y, radius)
                VALUES (?, ?, 0, 0, 9999)
            `, [revealId, roomId]);

            // Save updated fog to room state
            const allFog = await this.getRevealedAreas(roomId);
            await saveRoomState(roomId, 'fog', allFog);

            return { cleared: true };
        } catch (error) {
            console.error('Error clearing fog:', error);
            throw error;
        }
    }
};

// Ambiance management
const AmbianceManager = {
    // Set ambiance track
    async setTrack(roomId, playerId, trackUrl) {
        try {
            // Verify DM permission
            const player = await get(`
                SELECT is_dm FROM players 
                WHERE id = ? AND room_id = ? AND is_dm = 1
            `, [playerId, roomId]);

            if (!player) {
                throw new Error('Only DM can control ambiance');
            }

            await run(`
                UPDATE rooms 
                SET ambiance_track = ?
                WHERE id = ?
            `, [trackUrl, roomId]);

            // Save updated ambiance to room state
            await saveRoomState(roomId, 'ambiance', trackUrl);

            return { trackUrl };
        } catch (error) {
            console.error('Error setting ambiance track:', error);
            throw error;
        }
    },

    // Get current track
    async getCurrentTrack(roomId) {
        try {
            const room = await get(`
                SELECT ambiance_track 
                FROM rooms 
                WHERE id = ?
            `, [roomId]);

            return room?.ambiance_track || null;
        } catch (error) {
            console.error('Error getting current track:', error);
            throw error;
        }
    }
};

// Get complete game state
async function getGameState(roomId) {
    try {
        // Load from both existing tables and room_state persistence
        const [tokens, currentMap, revealedAreas, currentTrack, persistedState] = await Promise.all([
            TokenManager.getRoomTokens(roomId),
            MapManager.getCurrentMap(roomId),
            FogManager.getRevealedAreas(roomId),
            AmbianceManager.getCurrentTrack(roomId),
            loadRoomState(roomId)
        ]);

        // Prefer room_state tokens (rich client format) over DB tokens (flat format)
        const stateTokens = persistedState.tokens || [];
        return {
            tokens: stateTokens.length > 0 ? stateTokens : tokens,
            map: currentMap || persistedState.map_url,
            fog: revealedAreas.length > 0 ? revealedAreas : (persistedState.fog || []),
            ambiance: currentTrack || persistedState.ambiance,
            drawings: persistedState.drawings || [],
            walls: persistedState.walls || [],
            aoeEffects: persistedState.aoe_effects || [],
            gridConfig: persistedState.grid_config || null,
            initiative: persistedState.initiative || { players: [], currentTurn: 0, active: false }
        };
    } catch (error) {
        console.error('Error getting game state:', error);
        throw error;
    }
}

module.exports = {
    TokenManager,
    MapManager,
    FogManager,
    AmbianceManager,
    getGameState
};