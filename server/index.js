const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Import our modules
const { 
  initDatabase, 
  saveRoomState, 
  loadRoomState,
  createCampaign,
  getCampaign,
  updateCampaignLastActive,
  saveCharacter,
  getCharacter,
  getChatHistory,
  updateCampaignDocs,
  generateCampaignId,
  saveChatMessage,
  saveSystemData,
  getSystemData
} = require('./db');
const roomManager = require('./rooms');
const { TokenManager, MapManager, FogManager, AmbianceManager, getGameState } = require('./game-state');
const { rollDice, formatRollResult, getRollType } = require('./dice');
const crypto = require('crypto');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const OpenAI = require('openai');

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

// Configure multer for file uploads
const upload = multer({ 
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        const allowedExts = ['.txt', '.md', '.pdf', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado. Use .txt, .md, .pdf, ou .docx'));
        }
    }
});

// Initialize OpenAI (lazy — only when API key is available)
let openai = null;
function getOpenAI() {
    if (!openai && process.env.OPENAI_API_KEY) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

// Document upload endpoint
app.post('/api/upload-system-doc', upload.single('document'), async (req, res) => {
    try {
        let extractedText = '';
        
        if (req.file) {
            // File upload
            const file = req.file;
            const ext = path.extname(file.originalname).toLowerCase();
            
            switch (ext) {
                case '.txt':
                case '.md':
                    extractedText = file.buffer.toString('utf-8');
                    break;
                    
                case '.pdf':
                    const pdfData = await pdfParse(file.buffer);
                    extractedText = pdfData.text;
                    break;
                    
                case '.docx':
                    const docxResult = await mammoth.extractRawText({ buffer: file.buffer });
                    extractedText = docxResult.value;
                    break;
                    
                default:
                    throw new Error('Tipo de arquivo não suportado');
            }
        } else if (req.body.text) {
            // Raw text upload (from paste area)
            extractedText = req.body.text;
        } else {
            throw new Error('Nenhum arquivo ou texto fornecido');
        }
        
        res.json({
            success: true,
            text: extractedText,
            filename: req.file ? req.file.originalname : 'texto-colado.txt'
        });
        
    } catch (error) {
        console.error('Error processing document:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

// System parsing endpoint
app.post('/api/parse-system', async (req, res) => {
    try {
        const { campaignId, documents } = req.body;
        
        if (!campaignId || !documents || !Array.isArray(documents) || documents.length === 0) {
            throw new Error('campaignId e documentos são obrigatórios');
        }
        
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('Chave da OpenAI não configurada no servidor');
        }
        
        // Combine all documents into a single text
        const combinedText = documents.map(doc => `=== ${doc.name} ===\n${doc.text}`).join('\n\n');
        
        // Create prompt for OpenAI
        const prompt = `Você é um parser de sistemas de RPG. Dados estes documentos descrevendo um sistema de RPG customizado, extraia e estruture TODAS as mecânicas do jogo em JSON.

Formato de saída:
{
  "systemName": "Nome do sistema",
  "description": "Breve descrição",
  "races": [
    { "name": "...", "description": "...", "traits": ["..."], "statModifiers": { "str": 1, ... } }
  ],
  "classes": [
    { "name": "...", "description": "...", "hitDie": "d8", "primaryStats": ["str"], "features": [{ "name": "...", "level": 1, "description": "..." }], "proficiencies": ["..."] }
  ],
  "stats": [
    { "key": "str", "name": "Força", "description": "..." }
  ],
  "skills": [
    { "name": "...", "linkedStat": "str", "description": "..." }
  ],
  "equipment": [
    { "name": "...", "type": "weapon|armor|item", "description": "...", "damage": "1d8", "properties": ["..."] }
  ],
  "spells": [
    { "name": "...", "level": 0, "school": "...", "description": "...", "damage": "...", "range": "..." }
  ],
  "rules": [
    { "name": "...", "description": "..." }
  ],
  "customMechanics": [
    { "name": "...", "description": "...", "diceFormula": "..." }
  ]
}

Inclua apenas seções que estão presentes nos documentos. Se uma seção não for descrita, omita-a.
Parse no mesmo idioma dos documentos.

Documentos:
${combinedText}`;

        // Call OpenAI API
        const ai = getOpenAI();
        if (!ai) throw new Error('Chave da OpenAI não configurada no servidor');
        const response = await ai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            max_tokens: 4000,
            temperature: 0.3
        });
        
        const parsedSystem = JSON.parse(response.choices[0].message.content);
        
        // Save to database
        await saveSystemData(campaignId, parsedSystem, documents);
        
        console.log(`🤖 System parsed for campaign ${campaignId}: ${parsedSystem.systemName || 'Sistema Customizado'}`);
        
        res.json({
            success: true,
            systemData: parsedSystem
        });
        
    } catch (error) {
        console.error('Error parsing system:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
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
            const { dmName, system = 'dnd5e' } = data;
            const room = await roomManager.createRoom(dmName, system);
            
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

    // ── Campaign Management ──
    
    // Create campaign
    socket.on('campaign:create', async (data, callback) => {
        try {
            const { name, dmPassword, system = 'dnd5e', customRules } = data;
            
            // Generate unique 8-char campaign ID
            let campaignId;
            let attempts = 0;
            
            while (attempts < 10) {
                campaignId = generateCampaignId();
                const existing = await getCampaign(campaignId);
                if (!existing) break;
                attempts++;
            }
            
            if (attempts >= 10) {
                throw new Error('Failed to generate unique campaign ID');
            }
            
            // Create campaign in database
            await createCampaign(campaignId, name, dmPassword, system, customRules);
            
            // Create a room for the campaign with the campaign ID as the code
            const dmName = data.dmName || 'Mestre';
            const room = await roomManager.createRoomWithCode(dmName, system, campaignId);
            
            // Auto-join the DM into the socket room
            socket.join(room.id);
            await roomManager.updatePlayerSocket(room.dm_id, socket.id);
            connectedPlayers.set(socket.id, {
                id: room.dm_id,
                roomId: room.id,
                name: dmName,
                isDM: true,
                campaignId: campaignId
            });
            
            // Initialize initiative tracker
            initiativeTrackers.set(room.id, { players: [], currentTurn: 0, active: false });
            
            console.log(`📚 Campaign created: ${campaignId} - ${name}`);
            
            const roomDetails = await roomManager.getRoomDetails(room.id);
            const gameState = await getGameState(room.id);
            const campaign_obj = await getCampaign(campaignId);
            
            callback({
                success: true,
                campaignId,
                isDM: true,
                campaign: {
                    id: campaignId,
                    name: name,
                    system: system,
                    googleDocsUrl: null
                },
                room: {
                    ...roomDetails,
                    code: campaignId,
                    gameState
                },
                character: null,
                chatHistory: []
            });
            
        } catch (error) {
            console.error('Error creating campaign:', error);
            callback({
                success: false,
                error: error.message
            });
        }
    });
    
    // Join campaign
    socket.on('campaign:join', async (data, callback) => {
        try {
            const { campaignId, playerName, dmPassword } = data;
            
            // Get campaign
            const campaign = await getCampaign(campaignId);
            if (!campaign) {
                throw new Error('Campanha não encontrada');
            }
            
            let isDM = false;
            
            // Check if DM password provided
            if (dmPassword) {
                const hashedPassword = crypto.createHash('sha256').update(dmPassword).digest('hex');
                if (hashedPassword === campaign.dm_password) {
                    isDM = true;
                } else {
                    throw new Error('Senha do mestre incorreta');
                }
            }
            
            // Join the room using campaign ID as room code
            const joinResult = await roomManager.joinRoom(campaignId, playerName);
            
            // Join socket room
            socket.join(joinResult.room_id);
            
            // Update player socket
            await roomManager.updatePlayerSocket(joinResult.player_id, socket.id);
            connectedPlayers.set(socket.id, {
                id: joinResult.player_id,
                roomId: joinResult.room_id,
                name: playerName,
                isDM: isDM,
                campaignId: campaignId
            });
            
            // Load persisted room state
            const persistedState = await loadRoomState(joinResult.room_id);
            
            // Load initiative tracker
            if (!initiativeTrackers.has(joinResult.room_id)) {
                initiativeTrackers.set(joinResult.room_id, persistedState.initiative || {
                    players: [],
                    currentTurn: 0,
                    active: false
                });
            }
            
            // Load player's character if exists
            const character = await getCharacter(campaignId, playerName);
            
            // Load chat history
            const chatHistory = await getChatHistory(campaignId, 100);
            
            // Load system data if campaign uses custom system
            let systemData = null;
            if (campaign.system === 'custom') {
                const systemResult = await getSystemData(campaignId);
                systemData = systemResult?.systemData || null;
            }
            
            // Update campaign last active
            await updateCampaignLastActive(campaignId);
            
            console.log(`📚 ${playerName} joined campaign ${campaignId} ${isDM ? '(DM)' : '(Player)'}`);
            
            // Get room state
            const roomDetails = await roomManager.getRoomDetails(joinResult.room_id);
            const gameState = await getGameState(joinResult.room_id);
            
            callback({
                success: true,
                campaign: {
                    id: campaign.id,
                    name: campaign.name,
                    system: campaign.system,
                    customRules: campaign.custom_rules,
                    googleDocsUrl: campaign.google_docs_url,
                    systemData: systemData
                },
                room: {
                    ...roomDetails,
                    gameState,
                    playerId: joinResult.player_id
                },
                character,
                chatHistory,
                isDM
            });
            
            // Broadcast player joined to others
            socket.to(joinResult.room_id).emit('room:joined', {
                playerId: joinResult.player_id,
                playerName,
                isDM
            });
            
            // Send updated room state to all
            io.to(joinResult.room_id).emit('room:state', {
                ...roomDetails,
                gameState
            });
            
        } catch (error) {
            console.error('Error joining campaign:', error);
            callback({
                success: false,
                error: error.message
            });
        }
    });
    
    // Save character
    socket.on('campaign:save-character', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.campaignId) throw new Error('Not in a campaign');
            
            const { campaignId, playerName, characterData } = data;
            
            // Verify campaign access
            if (campaignId !== player.campaignId) {
                throw new Error('Access denied');
            }
            
            await saveCharacter(campaignId, playerName, characterData);
            
            console.log(`💾 Character saved: ${playerName} in campaign ${campaignId}`);
            
            // Broadcast character update to all players in room
            io.to(player.roomId).emit('character:updated', { playerName, characterData });
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error saving character:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Get all characters in campaign (DM only)
    socket.on('campaign:get-all-characters', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM || !player.campaignId) {
                throw new Error('Only DM can get all characters');
            }
            
            const { campaignId } = data;
            
            // Verify campaign access
            if (campaignId !== player.campaignId) {
                throw new Error('Access denied');
            }
            
            const { getCampaignCharacters } = require('./db');
            const characters = await getCampaignCharacters(campaignId);
            
            console.log(`📋 DM retrieved ${characters.length} characters from campaign ${campaignId}`);
            
            if (callback) callback({ 
                success: true, 
                characters: characters.map(c => ({
                    playerName: c.playerName,
                    character: c.character
                }))
            });
        } catch (error) {
            console.error('Error getting all characters:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // DM update character (modify any player's character)
    socket.on('campaign:dm-update-character', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM || !player.campaignId) {
                throw new Error('Only DM can update other characters');
            }
            
            const { campaignId, playerName, characterData } = data;
            
            // Verify campaign access
            if (campaignId !== player.campaignId) {
                throw new Error('Access denied');
            }
            
            await saveCharacter(campaignId, playerName, characterData);
            
            console.log(`👑 DM updated character: ${playerName} in campaign ${campaignId}`);
            
            // Broadcast character update to all players in room
            io.to(player.roomId).emit('character:updated', { playerName, characterData });
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error DM updating character:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Set Google Docs URL
    socket.on('campaign:set-docs', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM || !player.campaignId) {
                throw new Error('Only DM can set docs URL');
            }
            
            const { campaignId, url } = data;
            
            // Verify campaign access
            if (campaignId !== player.campaignId) {
                throw new Error('Access denied');
            }
            
            await updateCampaignDocs(campaignId, url);
            
            console.log(`📄 Google Docs updated: ${campaignId} -> ${url}`);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('campaign:docs-updated', { url });
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error setting docs URL:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // System management
    socket.on('system:upload-text', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM || !player.campaignId) {
                throw new Error('Only DM can upload system documents');
            }
            
            const { text, filename } = data;
            
            if (callback) callback({
                success: true,
                text: text,
                filename: filename || 'documento-texto.txt'
            });
        } catch (error) {
            console.error('Error uploading text:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    socket.on('system:get', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.campaignId) {
                throw new Error('Not in a campaign');
            }
            
            const { campaignId } = data;
            
            // Verify campaign access
            if (campaignId !== player.campaignId) {
                throw new Error('Access denied');
            }
            
            const systemData = await getSystemData(campaignId);
            
            if (callback) callback({
                success: true,
                systemData: systemData?.systemData || null,
                parsedAt: systemData?.parsedAt || null
            });
        } catch (error) {
            console.error('Error getting system:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Broadcast system parsed event (called from HTTP endpoint)
    socket.on('system:broadcast-parsed', async (data) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM || !player.campaignId) {
                throw new Error('Only DM can broadcast system updates');
            }
            
            const { systemData } = data;
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('system:parsed', { systemData });
            
            console.log(`📖 System broadcasted to room ${player.roomId}`);
        } catch (error) {
            console.error('Error broadcasting system:', error);
        }
    });
    
    // Token management
    socket.on('token:add', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            // Enhanced token data can include conditions and HP from character sheet
            const tokenData = {
                name: data.name,
                x: data.x || 0,
                y: data.y || 0,
                color: data.color || null,
                size: data.size || 'medium',
                imageUrl: data.imageUrl || null,
                conditions: data.conditions || [], // Array of condition objects {name, icon}
                hp: data.hp || null, // HP data: { current, max, temp }
                characterName: data.characterName || null, // Link to character
                playerId: data.playerId || null, // Link to player
                ...data // Allow other token properties
            };
            
            const token = await TokenManager.addToken(player.roomId, player.id, tokenData);
            
            console.log(`🎭 Token added: ${token.name} in room ${player.roomId} (conditions: ${(token.conditions || []).length}, HP: ${token.hp ? `${token.hp.current}/${token.hp.max}` : 'N/A'})`);
            
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
            
            // Enhanced update data can include conditions and HP
            const allowedUpdates = {
                name: updates.name,
                x: updates.x,
                y: updates.y,
                color: updates.color,
                size: updates.size,
                imageUrl: updates.imageUrl,
                conditions: updates.conditions || [], // Condition indicators
                hp: updates.hp || null, // HP data: { current, max, temp }
                ...updates // Allow any other updates while preserving structure
            };
            
            const token = await TokenManager.updateToken(tokenId, player.id, allowedUpdates);
            
            console.log(`🎭 Token updated: ${token.name} (conditions: ${(token.conditions || []).length}, HP: ${token.hp ? `${token.hp.current}/${token.hp.max}` : 'N/A'})`);
            
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
            
            // Save to campaign chat history if in a campaign and not secret
            if (player.campaignId && !isSecret) {
                try {
                    const diceContent = `🎲 ${notation} = ${rollResult.total}`;
                    await saveChatMessage(player.campaignId, player.name, diceContent, 'dice');
                } catch (err) {
                    console.error('Error saving dice roll to campaign:', err);
                }
            }
            
            if (isSecret && player.isDM) {
                // Send only to DM
                socket.emit('dice:result', rollResult);
            } else {
                // Broadcast to entire room
                io.to(player.roomId).emit('dice:result', rollResult);
            }
            
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
            
            // Save to campaign chat history if in a campaign
            if (player.campaignId && !isWhisper) {
                try {
                    await saveChatMessage(player.campaignId, player.name, message, 'message');
                } catch (err) {
                    console.error('Error saving chat to campaign:', err);
                }
            }
            
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
            
            // Save initiative to persistence
            await saveRoomState(player.roomId, 'initiative', tracker);
            
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
            
            // Save drawing to persistence
            const persistedState = await loadRoomState(player.roomId);
            const allDrawings = persistedState.drawings || [];
            allDrawings.push(drawData);
            await saveRoomState(player.roomId, 'drawings', allDrawings);
            
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
            
            // Clear drawings in persistence
            await saveRoomState(player.roomId, 'drawings', []);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('draw:clear');
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing drawings:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Wall events
    socket.on('wall:add', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can add walls');
            
            const { x1, y1, x2, y2 } = data;
            const wallData = {
                id: uuidv4(),
                x1, y1, x2, y2,
                timestamp: Date.now()
            };
            
            console.log(`🧱 Wall added in room ${player.roomId}: (${x1}, ${y1}) to (${x2}, ${y2})`);
            
            // Save wall to persistence
            const persistedState = await loadRoomState(player.roomId);
            const allWalls = persistedState.walls || [];
            allWalls.push(wallData);
            await saveRoomState(player.roomId, 'walls', allWalls);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('wall:add', wallData);
            
            if (callback) callback({ success: true, wallData });
        } catch (error) {
            console.error('Error adding wall:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('wall:remove', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can remove walls');
            
            const { wallId } = data;
            
            console.log(`🧱 Wall removed in room ${player.roomId}: ${wallId}`);
            
            // Remove wall from persistence
            const persistedState = await loadRoomState(player.roomId);
            const allWalls = (persistedState.walls || []).filter(w => w.id !== wallId);
            await saveRoomState(player.roomId, 'walls', allWalls);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('wall:remove', { wallId });
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error removing wall:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('wall:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can clear walls');
            
            console.log(`🧹 Walls cleared in room ${player.roomId}`);
            
            // Clear walls in persistence
            await saveRoomState(player.roomId, 'walls', []);
            
            // Broadcast to all players in room
            io.to(player.roomId).emit('wall:clear');
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing walls:', error);
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