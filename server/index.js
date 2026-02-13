const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
  getSystemData,
  getScenes,
  saveScene,
  deleteScene,
  setActiveScene,
  getJournalEntries,
  saveJournalEntry,
  deleteJournalEntry,
  getPlaylists,
  savePlaylist,
  deletePlaylist,
} = require('./db');
const roomManager = require('./rooms');
const { TokenManager, MapManager, FogManager, AmbianceManager, getGameState } = require('./game-state');
const { rollDice, formatRollResult, getRollType } = require('./dice');
const crypto = require('crypto');
const multer = require('multer');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
// OpenAI replaced by Kimi K2.5 via OpenRouter (using fetch)

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
app.use('/public', express.static(path.join(__dirname, 'public')));

// Map upload endpoint (HTTP — more reliable than socket for large files)
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

// Audio upload endpoint
const audioDir = path.join(__dirname, 'public', 'audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

app.post('/api/upload-audio', express.raw({ type: 'audio/*', limit: '20mb' }), (req, res) => {
    const ct = req.headers['content-type'] || 'audio/mpeg';
    const ext = ct.includes('ogg') ? 'ogg' : ct.includes('wav') ? 'wav' : 'mp3';
    const filename = `audio-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(audioDir, filename), req.body);
    res.json({ success: true, url: `/public/audio/${filename}` });
});

// Journal image upload endpoint
const journalDir = path.join(__dirname, 'public', 'journal');
if (!fs.existsSync(journalDir)) fs.mkdirSync(journalDir, { recursive: true });

app.post('/api/upload-journal-image', express.raw({ type: 'image/*', limit: '5mb' }), (req, res) => {
    const ext = (req.headers['content-type'] || 'image/png').split('/')[1] || 'png';
    const filename = `journal-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(journalDir, filename), req.body);
    res.json({ success: true, url: `/public/journal/${filename}` });
});

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
        const allowedTypes = ['text/plain', 'text/markdown', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/csv', 'application/json'];
        const allowedExts = ['.txt', '.md', '.pdf', '.docx', '.csv', '.json'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedTypes.includes(file.mimetype) || allowedExts.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não suportado. Use .txt, .md, .pdf, ou .docx'));
        }
    }
});

// Moonshot API helper for Kimi K2.5
async function callKimiK2(systemPrompt, userPrompt) {
    // Support both Moonshot direct API and OpenRouter
    const moonshotKey = process.env.MOONSHOT_API_KEY;
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    
    let apiUrl, apiKey, model, extraHeaders = {};
    
    if (moonshotKey) {
        apiUrl = 'https://api.moonshot.ai/v1/chat/completions';
        apiKey = moonshotKey;
        model = 'kimi-k2.5';
    } else if (openrouterKey) {
        apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
        apiKey = openrouterKey;
        model = 'moonshotai/kimi-k2.5';
        extraHeaders = { 'HTTP-Referer': 'https://rpg-vtt.vercel.app', 'X-Title': 'RPG VTT System Importer' };
    } else {
        throw new Error('MOONSHOT_API_KEY ou OPENROUTER_API_KEY não configurada no servidor');
    }
    
    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            ...extraHeaders
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            max_tokens: 16000,
            temperature: 1
        })
    });
    
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Kimi API error: ${response.status} - ${err}`);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da IA');
    
    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    let jsonStr = jsonMatch[1].trim();
    
    // Try to repair common JSON issues from LLM output
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        // Try to find the outermost { ... } or [ ... ]
        const firstBrace = jsonStr.indexOf('{');
        const firstBracket = jsonStr.indexOf('[');
        const start = (firstBrace >= 0 && (firstBracket < 0 || firstBrace < firstBracket)) ? firstBrace : firstBracket;
        if (start > 0) jsonStr = jsonStr.substring(start);
        
        // Remove trailing garbage after last } or ]
        const lastBrace = jsonStr.lastIndexOf('}');
        const lastBracket = jsonStr.lastIndexOf(']');
        const end = Math.max(lastBrace, lastBracket);
        if (end > 0) jsonStr = jsonStr.substring(0, end + 1);
        
        // Fix truncated JSON: close unclosed brackets/braces
        let openBraces = 0, openBrackets = 0;
        let inString = false, escaped = false;
        for (let i = 0; i < jsonStr.length; i++) {
            const c = jsonStr[i];
            if (escaped) { escaped = false; continue; }
            if (c === '\\') { escaped = true; continue; }
            if (c === '"') { inString = !inString; continue; }
            if (inString) continue;
            if (c === '{') openBraces++;
            else if (c === '}') openBraces--;
            else if (c === '[') openBrackets++;
            else if (c === ']') openBrackets--;
        }
        
        // Remove trailing comma before closing
        jsonStr = jsonStr.replace(/,\s*$/, '');
        
        // Close unclosed structures
        for (let i = 0; i < openBrackets; i++) jsonStr += ']';
        for (let i = 0; i < openBraces; i++) jsonStr += '}';
        
        try {
            return JSON.parse(jsonStr);
        } catch (e2) {
            console.error('JSON repair failed. Raw content:', content.substring(0, 500));
            throw new Error('Erro ao processar resposta da IA. O sistema é muito extenso — tente importar menos documentos por vez.');
        }
    }
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
                case '.csv':
                case '.json':
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

// Helper: fetch a single Google Drive file by ID
async function fetchGdriveFile(fileId, isGoogleDoc = false, isSpreadsheet = false, isPresentation = false) {
    let fetchUrl;
    if (isGoogleDoc) {
        fetchUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
    } else if (isSpreadsheet) {
        fetchUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
    } else if (isPresentation) {
        fetchUrl = `https://docs.google.com/presentation/d/${fileId}/export?format=txt`;
    } else {
        fetchUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
    }

    const response = await fetch(fetchUrl, { redirect: 'follow' });
    if (response.status === 401 || response.status === 403) {
        throw new Error('Arquivo não está compartilhado publicamente. Selecione "Qualquer pessoa com o link".');
    }
    if (!response.ok) {
        throw new Error(`Erro ao buscar arquivo: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/pdf')) {
        const buffer = Buffer.from(await response.arrayBuffer());
        const pdfData = await pdfParse(buffer);
        return pdfData.text;
    }
    return await response.text();
}

// Helper: list items in a public Google Drive folder using embeddedfolderview
async function scrapeGdriveFolder(folderId) {
    const embedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
    const resp = await fetch(embedUrl, { 
        headers: { 'User-Agent': 'Mozilla/5.0' },
        redirect: 'follow' 
    });
    const html = await resp.text();
    
    const items = [];
    const seenIds = new Set();
    let m;
    
    // Find subfolders
    const folderRegex = /folders\/([a-zA-Z0-9_-]{10,})/g;
    while ((m = folderRegex.exec(html)) !== null) {
        if (m[1] !== folderId && !seenIds.has(m[1])) {
            seenIds.add(m[1]);
            items.push({ id: m[1], mimeType: 'application/vnd.google-apps.folder', name: `folder-${m[1].slice(0,8)}` });
        }
    }
    
    // Find Google Docs
    const docRegex = /document\/d\/([a-zA-Z0-9_-]{10,})/g;
    while ((m = docRegex.exec(html)) !== null) {
        if (!seenIds.has(m[1])) { seenIds.add(m[1]); items.push({ id: m[1], mimeType: 'application/vnd.google-apps.document', name: `doc-${m[1].slice(0,8)}` }); }
    }
    
    // Find Sheets
    const sheetRegex = /spreadsheets\/d\/([a-zA-Z0-9_-]{10,})/g;
    while ((m = sheetRegex.exec(html)) !== null) {
        if (!seenIds.has(m[1])) { seenIds.add(m[1]); items.push({ id: m[1], mimeType: 'application/vnd.google-apps.spreadsheet', name: `sheet-${m[1].slice(0,8)}` }); }
    }
    
    // Find regular files  
    const fileRegex = /file\/d\/([a-zA-Z0-9_-]{10,})/g;
    while ((m = fileRegex.exec(html)) !== null) {
        if (!seenIds.has(m[1])) { seenIds.add(m[1]); items.push({ id: m[1], mimeType: 'application/octet-stream', name: `file-${m[1].slice(0,8)}` }); }
    }
    
    // Also check entry-ID pattern for items not caught above (e.g. docs with only entry refs)
    const entryRegex = /entry-([a-zA-Z0-9_-]{20,})/g;
    while ((m = entryRegex.exec(html)) !== null) {
        if (!seenIds.has(m[1])) {
            seenIds.add(m[1]);
            // Try as Google Doc first (most common in RPG folders)
            items.push({ id: m[1], mimeType: 'application/vnd.google-apps.document', name: `entry-${m[1].slice(0,8)}` });
        }
    }
    
    return items;
}

// Helper: recursively list all files in a Google Drive folder (max depth 3)
async function listGdriveFolder(folderId, depth = 0) {
    if (depth > 3) return []; // safety limit
    
    const items = await scrapeGdriveFolder(folderId);
    const files = [];
    
    for (const item of items) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
            // Recurse into subfolder
            const subFiles = await listGdriveFolder(item.id, depth + 1);
            files.push(...subFiles);
        } else {
            files.push(item);
        }
    }
    
    return files;
}

// Google Drive fetch endpoint
app.post('/api/fetch-gdrive', express.json(), async (req, res) => {
    try {
        const { url } = req.body;
        if (!url) throw new Error('URL não fornecida');

        // Check if it's a folder link
        const folderMatch = url.match(/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]+)/);
        if (folderMatch) {
            const folderId = folderMatch[1];
            const files = await listGdriveFolder(folderId);
            
            // Fetch each file's content
            const results = [];
            for (const file of files) {
                try {
                    const isDoc = file.mimeType === 'application/vnd.google-apps.document';
                    const isSheet = file.mimeType === 'application/vnd.google-apps.spreadsheet';
                    const isPres = file.mimeType === 'application/vnd.google-apps.presentation';
                    
                    let text;
                    if (isDoc) {
                        text = await fetchGdriveFile(file.id, true, false, false);
                    } else if (isSheet) {
                        text = await fetchGdriveFile(file.id, false, true, false);
                    } else if (isPres) {
                        text = await fetchGdriveFile(file.id, false, false, true);
                    } else {
                        // Try as generic file (PDF, txt, etc.)
                        text = await fetchGdriveFile(file.id);
                    }
                    
                    if (text && text.trim().length > 0) {
                        results.push({ name: file.name || `arquivo-${file.id.slice(0,8)}`, text });
                    }
                } catch (err) {
                    console.warn(`Skipping file ${file.name}: ${err.message}`);
                }
            }
            
            if (results.length === 0) {
                throw new Error('Nenhum arquivo com texto encontrado na pasta.');
            }
            
            // Return all files combined
            const combinedText = results.map(r => `=== ${r.name} ===\n${r.text}`).join('\n\n');
            return res.json({
                success: true,
                text: combinedText,
                filename: `pasta-drive-${results.length}-arquivos.txt`,
                fileCount: results.length,
                files: results.map(r => r.name)
            });
        }

        // Single file handling
        let fileId = null;
        let isGoogleDoc = false;
        let isSpreadsheet = false;
        let isPresentation = false;

        const docMatch = url.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
        const spreadsheetMatch = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
        const presentationMatch = url.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
        const fileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
        const openMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
        const idParamMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);

        if (docMatch) { fileId = docMatch[1]; isGoogleDoc = true; }
        else if (spreadsheetMatch) { fileId = spreadsheetMatch[1]; isSpreadsheet = true; }
        else if (presentationMatch) { fileId = presentationMatch[1]; isPresentation = true; }
        else if (fileMatch) { fileId = fileMatch[1]; }
        else if (openMatch) { fileId = openMatch[1]; }
        else if (idParamMatch) { fileId = idParamMatch[1]; }
        else {
            const genericMatch = url.match(/\/([a-zA-Z0-9_-]{20,})/);
            if (genericMatch) { fileId = genericMatch[1]; }
            else { throw new Error('URL do Google Drive não reconhecida.'); }
        }

        const extractedText = await fetchGdriveFile(fileId, isGoogleDoc, isSpreadsheet, isPresentation);

        if (!extractedText || extractedText.trim().length === 0) {
            throw new Error('Arquivo vazio ou não foi possível extrair texto.');
        }

        res.json({
            success: true,
            text: extractedText,
            filename: isGoogleDoc ? 'google-docs.txt' : isSpreadsheet ? 'google-sheets.csv' : isPresentation ? 'google-slides.txt' : 'google-drive-file.txt'
        });

    } catch (error) {
        console.error('Google Drive fetch error:', error);
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
        
        if (!documents || !Array.isArray(documents) || documents.length === 0) {
            throw new Error('Documentos são obrigatórios');
        }
        
        // Combine all documents into a single text (truncate to ~100k chars to fit in context window)
        let combinedText = documents.map(doc => `=== ${doc.name} ===\n${doc.text}`).join('\n\n');
        const MAX_CHARS = 100000;
        if (combinedText.length > MAX_CHARS) {
            console.warn(`Input text too long (${combinedText.length} chars), truncating to ${MAX_CHARS}`);
            combinedText = combinedText.substring(0, MAX_CHARS) + '\n\n[... texto truncado por limite de tamanho ...]';
        }
        
        // System prompt with full schema based on dnd5e.js format
        const systemPrompt = `Você é um parser especializado em sistemas de RPG de mesa. Extraia regras de texto livre e converta em JSON estruturado.

O JSON DEVE seguir este esquema (baseado no formato D&D 5e do nosso VTT):

{
  "systemName": "Nome do Sistema",
  "description": "Breve descrição",
  "races": [
    {
      "name": "Humano",
      "icon": "👤",
      "description": "Adaptáveis e ambiciosos...",
      "statBonuses": { "str": 1, "dex": 1, "con": 1, "int": 1, "wis": 1, "cha": 1 },
      "traits": ["Versatilidade: +1 em todos os atributos", "Perícia Adicional"]
    }
  ],
  "classes": [
    {
      "name": "Guerreiro",
      "icon": "⚔️",
      "hitDie": "d10",
      "description": "Mestre das armas e táticas de combate.",
      "primaryStats": ["Força", "Destreza"],
      "savingThrows": ["str", "con"],
      "skillsAvailable": 2,
      "classSkills": ["athletics", "intimidation", "perception", "survival"],
      "level1Features": ["Estilo de Luta", "Retomar Fôlego: 1d10 + nível"],
      "startingEquipment": {
        "choiceA": ["Cota de Malha", "Escudo", "Espada Longa"],
        "choiceB": ["Armadura de Couro", "Arco Longo"]
      }
    }
  ],
  "skills": {
    "athletics": { "name": "Atletismo", "ability": "str", "description": "Escalar, nadar, saltar" },
    "stealth": { "name": "Furtividade", "ability": "dex", "description": "Mover-se sem ser detectado" }
  },
  "backgrounds": [
    {
      "name": "Soldado",
      "skillProficiencies": ["athletics", "intimidation"],
      "description": "Você serviu em uma força militar.",
      "feature": "Posição Militar: autoridade sobre soldados."
    }
  ],
  "stats": [
    { "key": "str", "name": "Força", "short": "FOR" },
    { "key": "dex", "name": "Destreza", "short": "DEX" }
  ],
  "equipment": [
    { "name": "Espada Longa", "type": "weapon", "damage": "1d8", "properties": ["versátil"] }
  ],
  "spells": [
    { "name": "Bola de Fogo", "level": 3, "school": "Evocação", "description": "...", "damage": "8d6", "range": "150 pés" }
  ],
  "rules": [
    { "name": "Combate", "description": "Como funciona o combate neste sistema" }
  ],
  "customMechanics": [
    { "name": "Mecânica Especial", "description": "Como funciona", "diceFormula": "2d6+mod" }
  ]
}

REGRAS IMPORTANTES:
- Chaves em inglês camelCase, valores no idioma dos documentos
- "skills" é OBJETO (não array) com chaves camelCase
- Stat keys: str, dex, con, int, wis, cha (ou equivalentes)
- Inclua APENAS seções presentes nos documentos — omita o resto
- Retorne APENAS JSON válido, sem markdown, sem texto extra`;

        const parsedSystem = await callKimiK2(systemPrompt, `Analise estes documentos de RPG e extraia as regras:\n\n${combinedText}`);
        
        // Save to database only if not a preview
        if (campaignId !== 'preview') {
            await saveSystemData(campaignId, parsedSystem, documents);
            console.log(`🤖 System parsed for campaign ${campaignId}: ${parsedSystem.systemName || 'Sistema Customizado'}`);
        } else {
            console.log(`🤖 System parsed (preview): ${parsedSystem.systemName || 'Sistema Customizado'}`);
        }
        
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

// Campaign rules endpoints
app.post('/api/campaigns/:id/rules', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        const { systemData, rawDocuments = [] } = req.body;
        
        if (!systemData) {
            throw new Error('systemData é obrigatório');
        }
        
        // Verify campaign exists
        const campaign = await getCampaign(campaignId);
        if (!campaign) {
            throw new Error('Campanha não encontrada');
        }
        
        // Save system data
        await saveSystemData(campaignId, systemData, rawDocuments);
        
        console.log(`💾 System rules saved for campaign ${campaignId}`);
        
        res.json({
            success: true,
            message: 'Regras salvas com sucesso'
        });
        
    } catch (error) {
        console.error('Error saving campaign rules:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

app.get('/api/campaigns/:id/rules', async (req, res) => {
    try {
        const { id: campaignId } = req.params;
        
        // Verify campaign exists
        const campaign = await getCampaign(campaignId);
        if (!campaign) {
            throw new Error('Campanha não encontrada');
        }
        
        // Get system data
        const systemData = await getSystemData(campaignId);
        
        res.json({
            success: true,
            systemData: systemData?.systemData || null,
            rawDocuments: systemData?.rawDocuments || [],
            parsedAt: systemData?.parsedAt || null
        });
        
    } catch (error) {
        console.error('Error getting campaign rules:', error);
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
            const { name, dmPassword, system = 'dnd5e', customRules, systemData } = data;
            
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
            
            // Handle system data for custom systems
            let finalCustomRules = customRules;
            if (system === 'custom' && systemData) {
                if (typeof systemData === 'object' && systemData.systemName) {
                    // Parsed system data from lobby
                    await saveSystemData(campaignId, systemData, systemData.documents || []);
                    finalCustomRules = `Custom system: ${systemData.systemName || 'Sistema Customizado'}`;
                } else if (typeof systemData === 'object' && systemData.documents) {
                    // Documents to be parsed
                    finalCustomRules = `Documents uploaded: ${systemData.documents.length} files`;
                }
            }
            
            // Create campaign in database
            await createCampaign(campaignId, name, dmPassword, system, finalCustomRules);
            
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
                    googleDocsUrl: null,
                    systemData: (system === 'custom' && systemData?.systemName) ? systemData : null
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
            
            // Build rich token data (client format) — this is what gets broadcast and persisted
            const token = {
                id: data.id || uuidv4(),
                name: data.name,
                x: data.x || 0,
                y: data.y || 0,
                color: data.color || null,
                size: data.size || 'medium',
                imageUrl: data.imageUrl || null,
                conditions: data.conditions || [],
                hp: data.hp || null,
                lightRadius: data.lightRadius || 0,
                visionRadius: data.visionRadius || 0,
                characterName: data.characterName || null,
                ownerId: player.id,
                ownerName: player.name,
            };
            
            // Save to room_state persistence (rich format)
            const persistedState = await loadRoomState(player.roomId);
            const allTokens = persistedState.tokens || [];
            allTokens.push(token);
            await saveRoomState(player.roomId, 'tokens', allTokens);
            
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
            
            // Update in room_state persistence
            const persistedState = await loadRoomState(player.roomId);
            const allTokens = persistedState.tokens || [];
            const tokenIndex = allTokens.findIndex(t => t.id === tokenId);
            if (tokenIndex >= 0) {
                allTokens[tokenIndex].x = x;
                allTokens[tokenIndex].y = y;
                await saveRoomState(player.roomId, 'tokens', allTokens);
            }
            
            const result = { tokenId, x, y };
            
            // Broadcast to others (not self — client already updated optimistically)
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
            
            // Update in room_state persistence
            const persistedState = await loadRoomState(player.roomId);
            const allTokens = persistedState.tokens || [];
            const tokenIndex = allTokens.findIndex(t => t.id === tokenId);
            
            let updatedToken;
            if (tokenIndex >= 0) {
                allTokens[tokenIndex] = { ...allTokens[tokenIndex], ...updates, id: tokenId };
                updatedToken = allTokens[tokenIndex];
                await saveRoomState(player.roomId, 'tokens', allTokens);
            } else {
                updatedToken = { id: tokenId, ...updates };
            }
            
            console.log(`🎭 Token updated: ${updatedToken.name}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('token:update', updatedToken);
            
            if (callback) callback({ success: true, token: updatedToken });
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
            
            // Remove from room_state persistence
            const persistedState = await loadRoomState(player.roomId);
            const allTokens = (persistedState.tokens || []).filter(t => t.id !== tokenId);
            await saveRoomState(player.roomId, 'tokens', allTokens);
            
            // Broadcast to room
            io.to(player.roomId).emit('token:remove', { tokenId });
            
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

    // Map offset (reposition)
    socket.on('map:offset', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can reposition map');
            
            const { offsetX, offsetY } = data;
            
            // Save to room state
            const persistedState = await loadRoomState(player.roomId);
            await saveRoomState(player.roomId, 'map_offset', JSON.stringify({ offsetX, offsetY }));
            
            console.log(`🗺️ Map repositioned in room ${player.roomId}: offset(${offsetX}, ${offsetY})`);
            
            // Broadcast to room
            io.to(player.roomId).emit('map:update', { offsetX, offsetY });
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error setting map offset:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Fog of War
    socket.on('fog:reveal', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            // Support new area format (rect, polygon, circle) and legacy format
            const areaData = {
                id: data.id || uuidv4(),
                type: data.type || 'circle',
                x: data.x,
                y: data.y,
                radius: data.radius,
                width: data.width,
                height: data.height,
                points: data.points,
                source: data.source || 'gm', // 'gm' or 'token'
                tokenId: data.tokenId || null,
                explored: data.explored || false,
                timestamp: Date.now()
            };
            
            // Save to room_state persistence
            const persistedState = await loadRoomState(player.roomId);
            const allFog = persistedState.fog || [];
            allFog.push(areaData);
            await saveRoomState(player.roomId, 'fog', allFog);
            
            // Broadcast to room
            io.to(player.roomId).emit('fog:reveal', areaData);
            
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

    // Fog hide (re-fog an area)
    socket.on('fog:hide', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can hide fog areas');
            
            const { areaId } = data;
            
            // Remove area from persistence
            const persistedState = await loadRoomState(player.roomId);
            const allFog = (persistedState.fog || []).filter(a => a.id !== areaId);
            await saveRoomState(player.roomId, 'fog', allFog);
            
            io.to(player.roomId).emit('fog:hide', { areaId });
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error hiding fog:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Fog reset (re-fog everything)
    socket.on('fog:reset', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can reset fog');
            
            await saveRoomState(player.roomId, 'fog', []);
            
            io.to(player.roomId).emit('fog:reset');
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error resetting fog:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Fog toggle (enable/disable)
    socket.on('fog:toggle', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can toggle fog');
            
            const { enabled } = data;
            await saveRoomState(player.roomId, 'fogEnabled', enabled);
            
            io.to(player.roomId).emit('fog:toggle', { enabled });
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error toggling fog:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Door events
    socket.on('door:add', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can add doors');
            
            const doorData = {
                id: data.id || uuidv4(),
                x: data.x,
                y: data.y,
                wallId: data.wallId || null,
                x1: data.x1, y1: data.y1, x2: data.x2, y2: data.y2,
                state: data.state || 'closed', // open, closed, locked
                timestamp: Date.now()
            };
            
            const persistedState = await loadRoomState(player.roomId);
            const allDoors = persistedState.doors || [];
            allDoors.push(doorData);
            await saveRoomState(player.roomId, 'doors', allDoors);
            
            io.to(player.roomId).emit('door:add', doorData);
            if (callback) callback({ success: true, doorData });
        } catch (error) {
            console.error('Error adding door:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('door:update', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            const { doorId, ...updates } = data;
            
            const persistedState = await loadRoomState(player.roomId);
            const allDoors = persistedState.doors || [];
            const idx = allDoors.findIndex(d => d.id === doorId);
            if (idx >= 0) {
                allDoors[idx] = { ...allDoors[idx], ...updates, id: doorId };
                await saveRoomState(player.roomId, 'doors', allDoors);
            }
            
            io.to(player.roomId).emit('door:update', { id: doorId, ...updates });
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error updating door:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('door:remove', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can remove doors');
            
            const { doorId } = data;
            const persistedState = await loadRoomState(player.roomId);
            const allDoors = (persistedState.doors || []).filter(d => d.id !== doorId);
            await saveRoomState(player.roomId, 'doors', allDoors);
            
            io.to(player.roomId).emit('door:remove', { doorId });
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error removing door:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('door:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can clear doors');
            
            await saveRoomState(player.roomId, 'doors', []);
            io.to(player.roomId).emit('door:clear');
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing doors:', error);
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
    // ── Advanced Initiative Tracker ──
    
    // Helper: get or create tracker
    function getTracker(roomId) {
        let t = initiativeTrackers.get(roomId);
        if (!t) {
            t = { combatants: [], currentTurn: 0, round: 1, active: false };
            initiativeTrackers.set(roomId, t);
        }
        // Migrate old format
        if (t.players && !t.combatants) {
            t.combatants = t.players.map(p => ({
                id: p.playerId || uuidv4(),
                name: p.playerName || p.name || 'Unknown',
                initiative: p.initiative || 0,
                hp: p.hp || { current: 20, max: 20 },
                ac: p.ac || 10,
                conditions: (p.conditions || []).map(c => typeof c === 'string' ? { id: c, duration: 0 } : c),
                deathSaves: p.deathSaves || { successes: 0, failures: 0 },
                initiativeMod: p.initiativeMod || 0,
                tokenId: p.tokenId || null,
                isNPC: p.isNPC || false,
            }));
            delete t.players;
            if (!t.round) t.round = 1;
        }
        if (!t.combatants) t.combatants = [];
        if (!t.round) t.round = 1;
        return t;
    }
    
    async function broadcastTracker(roomId, tracker, notifications = []) {
        const payload = { ...tracker };
        if (notifications.length > 0) payload._notifications = notifications;
        await saveRoomState(roomId, 'initiative', tracker);
        io.to(roomId).emit('initiative:update', payload);
    }

    // Legacy roll (backwards compat)
    socket.on('initiative:roll', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            const { playerId: targetPlayerId, modifier = 0 } = data;
            const rollResult = rollDice(`1d20+${modifier}`, player.name);
            const tracker = getTracker(player.roomId);
            
            const id = targetPlayerId || player.id;
            const name = targetPlayerId ?
                ([...connectedPlayers.values()].find(p => p.id === targetPlayerId)?.name || 'Unknown') :
                player.name;
            
            const existing = tracker.combatants.findIndex(c => c.id === id);
            const entry = {
                id, name, initiative: rollResult.total,
                hp: { current: 20, max: 20 }, ac: 10,
                conditions: [], deathSaves: { successes: 0, failures: 0 },
                initiativeMod: modifier, tokenId: null, isNPC: false,
            };
            if (existing >= 0) {
                tracker.combatants[existing] = { ...tracker.combatants[existing], initiative: rollResult.total };
            } else {
                tracker.combatants.push(entry);
            }
            tracker.combatants.sort((a, b) => b.initiative - a.initiative);
            
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true, rollResult, tracker });
        } catch (error) {
            console.error('Error rolling initiative:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Roll all initiative (DM)
    socket.on('initiative:roll-all', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            
            for (const c of tracker.combatants) {
                const mod = c.initiativeMod || 0;
                const roll = rollDice(`1d20+${mod}`, c.name);
                c.initiative = roll.total;
            }
            tracker.combatants.sort((a, b) => b.initiative - a.initiative);
            
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error roll-all:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Roll own initiative (player)
    socket.on('initiative:roll-own', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Not authenticated');
            const tracker = getTracker(player.roomId);
            
            let c = tracker.combatants.find(x => x.name === player.name || x.id === player.id);
            if (!c) {
                c = {
                    id: player.id, name: player.name, initiative: 0,
                    hp: { current: 20, max: 20 }, ac: 10,
                    conditions: [], deathSaves: { successes: 0, failures: 0 },
                    initiativeMod: 0, tokenId: null, isNPC: false,
                };
                tracker.combatants.push(c);
            }
            const roll = rollDice(`1d20+${c.initiativeMod || 0}`, c.name);
            c.initiative = roll.total;
            tracker.combatants.sort((a, b) => b.initiative - a.initiative);
            
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error roll-own:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Start combat
    socket.on('initiative:start-combat', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            tracker.active = true;
            tracker.currentTurn = 0;
            tracker.round = 1;
            
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Next turn
    socket.on('initiative:next', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can advance initiative');
            const tracker = getTracker(player.roomId);
            if (tracker.combatants.length === 0) throw new Error('No combatants');
            
            tracker.active = true;
            const prevTurn = tracker.currentTurn;
            tracker.currentTurn = (tracker.currentTurn + 1) % tracker.combatants.length;
            
            // New round?
            if (tracker.currentTurn === 0 && prevTurn !== 0) {
                tracker.round = (tracker.round || 1) + 1;
            }
            
            // Decrement conditions on the NEW current combatant's turn start
            const current = tracker.combatants[tracker.currentTurn];
            const notifications = [];
            if (current && current.conditions) {
                current.conditions = current.conditions.filter(cond => {
                    if (cond.duration > 0) {
                        cond.duration -= 1;
                        if (cond.duration <= 0) {
                            const condName = cond.name || cond.id;
                            notifications.push(`${condName} expirou em ${current.name}!`);
                            return false;
                        }
                    }
                    return true;
                });
            }
            
            await broadcastTracker(player.roomId, tracker, notifications);
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error advancing initiative:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });
    
    // Clear initiative
    socket.on('initiative:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = { combatants: [], currentTurn: 0, round: 1, active: false };
            initiativeTrackers.set(player.roomId, tracker);
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Add combatant
    socket.on('initiative:add-combatant', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Not authenticated');
            const tracker = getTracker(player.roomId);
            
            const combatant = {
                id: data.id || uuidv4(),
                name: data.name,
                initiative: data.initiative || 0,
                hp: data.hp || { current: 20, max: 20 },
                ac: data.ac || 10,
                conditions: [],
                deathSaves: { successes: 0, failures: 0 },
                initiativeMod: data.initiativeMod || 0,
                tokenId: data.tokenId || null,
                isNPC: data.isNPC || false,
                color: data.color || null,
            };
            tracker.combatants.push(combatant);
            tracker.combatants.sort((a, b) => b.initiative - a.initiative);
            
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Remove combatant
    socket.on('initiative:remove-combatant', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const idx = tracker.combatants.findIndex(c => c.id === data.combatantId);
            if (idx >= 0) {
                tracker.combatants.splice(idx, 1);
                if (tracker.currentTurn >= tracker.combatants.length) {
                    tracker.currentTurn = 0;
                }
            }
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Update combatant (initiative value, etc)
    socket.on('initiative:update-combatant', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Not authenticated');
            const tracker = getTracker(player.roomId);
            const c = tracker.combatants.find(x => x.id === data.combatantId);
            if (c) {
                Object.assign(c, data.updates);
                if (data.updates.initiative !== undefined && !tracker.active) {
                    tracker.combatants.sort((a, b) => b.initiative - a.initiative);
                }
            }
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Deal damage
    socket.on('initiative:deal-damage', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const c = tracker.combatants.find(x => x.id === data.combatantId);
            const notifications = [];
            if (c && c.hp) {
                const oldHP = c.hp.current;
                c.hp.current = Math.max(0, c.hp.current - data.amount);
                if (c.hp.current <= 0 && oldHP > 0) {
                    // Auto-add unconscious
                    if (!c.conditions.some(x => x.id === 'unconscious')) {
                        c.conditions.push({ id: 'unconscious', name: 'Inconsciente', duration: 0 });
                    }
                    c.deathSaves = { successes: 0, failures: 0 };
                    notifications.push(`${c.name} caiu inconsciente!`);
                }
            }
            await broadcastTracker(player.roomId, tracker, notifications);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Heal
    socket.on('initiative:heal', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const c = tracker.combatants.find(x => x.id === data.combatantId);
            if (c && c.hp) {
                const wasDown = c.hp.current <= 0;
                c.hp.current = Math.min(c.hp.max, c.hp.current + data.amount);
                if (wasDown && c.hp.current > 0) {
                    c.conditions = c.conditions.filter(x => x.id !== 'unconscious');
                    c.deathSaves = { successes: 0, failures: 0 };
                }
            }
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Add condition
    socket.on('initiative:add-condition', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const c = tracker.combatants.find(x => x.id === data.combatantId);
            if (c) {
                if (!c.conditions.some(x => x.id === data.conditionId)) {
                    c.conditions.push({ id: data.conditionId, duration: data.duration || 0 });
                }
            }
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Remove condition
    socket.on('initiative:remove-condition', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const c = tracker.combatants.find(x => x.id === data.combatantId);
            if (c) {
                c.conditions = c.conditions.filter(x => x.id !== data.conditionId);
            }
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Death save
    socket.on('initiative:death-save', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const c = tracker.combatants.find(x => x.id === data.combatantId);
            const notifications = [];
            if (c) {
                if (!c.deathSaves) c.deathSaves = { successes: 0, failures: 0 };
                if (data.success) {
                    c.deathSaves.successes = Math.min(3, c.deathSaves.successes + 1);
                    if (c.deathSaves.successes >= 3) {
                        notifications.push(`${c.name} estabilizou!`);
                        c.hp.current = 1;
                        c.conditions = c.conditions.filter(x => x.id !== 'unconscious');
                        c.deathSaves = { successes: 0, failures: 0 };
                    }
                } else {
                    c.deathSaves.failures = Math.min(3, c.deathSaves.failures + 1);
                    if (c.deathSaves.failures >= 3) {
                        notifications.push(`${c.name} morreu! 💀`);
                    }
                }
            }
            await broadcastTracker(player.roomId, tracker, notifications);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Reorder (drag)
    socket.on('initiative:reorder', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            const { fromIdx, toIdx } = data;
            if (fromIdx >= 0 && fromIdx < tracker.combatants.length && toIdx >= 0 && toIdx < tracker.combatants.length) {
                const [moved] = tracker.combatants.splice(fromIdx, 1);
                tracker.combatants.splice(toIdx, 0, moved);
            }
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Add all tokens from map as combatants
    socket.on('initiative:add-from-tokens', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM');
            const tracker = getTracker(player.roomId);
            
            const persistedState = await loadRoomState(player.roomId);
            const mapTokens = persistedState.tokens || [];
            
            for (const token of mapTokens) {
                if (tracker.combatants.some(c => c.tokenId === token.id || c.name === token.name)) continue;
                tracker.combatants.push({
                    id: uuidv4(),
                    name: token.name,
                    initiative: 0,
                    hp: token.hp || { current: 20, max: 20 },
                    ac: 10,
                    conditions: [],
                    deathSaves: { successes: 0, failures: 0 },
                    initiativeMod: 0,
                    tokenId: token.id,
                    isNPC: true,
                    color: token.color || null,
                });
            }
            
            await broadcastTracker(player.roomId, tracker);
            if (callback) callback({ success: true });
        } catch (error) {
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
    
    // AoE events
    socket.on('aoe:add', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can add AoE');
            
            const aoeData = { ...data, id: data.id || uuidv4() };
            
            const persistedState = await loadRoomState(player.roomId);
            const allAoE = persistedState.aoe_effects || [];
            allAoE.push(aoeData);
            await saveRoomState(player.roomId, 'aoe_effects', allAoE);
            
            io.to(player.roomId).emit('aoe:add', aoeData);
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error adding AoE:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('aoe:remove', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can remove AoE');
            
            const { aoeId } = data;
            const persistedState = await loadRoomState(player.roomId);
            const allAoE = (persistedState.aoe_effects || []).filter(a => a.id !== aoeId);
            await saveRoomState(player.roomId, 'aoe_effects', allAoE);
            
            io.to(player.roomId).emit('aoe:remove', { aoeId });
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error removing AoE:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('aoe:clear', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player || !player.isDM) throw new Error('Only DM can clear AoE');
            
            await saveRoomState(player.roomId, 'aoe_effects', []);
            io.to(player.roomId).emit('aoe:clear');
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error clearing AoE:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Grid config
    socket.on('grid:config', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player) throw new Error('Player not authenticated');
            
            // Save grid config to room_state persistence
            await saveRoomState(player.roomId, 'grid_config', data);
            
            // Broadcast to all other players in room
            socket.to(player.roomId).emit('grid:config', data);
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error setting grid config:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ── Scene Management ──
    socket.on('scene:list', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.campaignId) throw new Error('Not in a campaign');
            const scenes = await getScenes(player.campaignId);
            // Send via callback AND broadcast to all in room for consistency
            socket.emit('scene:list', scenes);
            if (callback) callback({ success: true, scenes });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('scene:save', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can manage scenes');
            const scene = { ...data, campaignId: player.campaignId };
            await saveScene(scene);
            const scenes = await getScenes(player.campaignId);
            io.to(player.roomId).emit('scene:list', scenes);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('scene:delete', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can delete scenes');
            await deleteScene(data.sceneId);
            const scenes = await getScenes(player.campaignId);
            io.to(player.roomId).emit('scene:list', scenes);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('scene:activate', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can activate scenes');
            await setActiveScene(player.campaignId, data.sceneId);
            const scenes = await getScenes(player.campaignId);
            const activeScene = scenes.find(s => s.isActive);
            // Update room state with active scene's data
            if (activeScene) {
                if (activeScene.mapUrl) await saveRoomState(player.roomId, 'map_url', activeScene.mapUrl);
                await saveRoomState(player.roomId, 'tokens', activeScene.tokens || []);
                await saveRoomState(player.roomId, 'fog', activeScene.fog || []);
                await saveRoomState(player.roomId, 'walls', activeScene.walls || []);
                await saveRoomState(player.roomId, 'drawings', activeScene.drawings || []);
                await saveRoomState(player.roomId, 'aoe_effects', activeScene.aoeEffects || []);
                if (activeScene.gridConfig) await saveRoomState(player.roomId, 'grid_config', activeScene.gridConfig);
            }
            io.to(player.roomId).emit('scene:list', scenes);
            io.to(player.roomId).emit('scene:activated', activeScene);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Save current map state back to the active scene
    socket.on('scene:save-current', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM');
            const scenes = await getScenes(player.campaignId);
            let active = scenes.find(s => s.isActive);
            
            // If no active scene, just return success (nothing to save)
            if (!active) {
                if (callback) callback({ success: true, message: 'No active scene to save' });
                return;
            }
            
            const roomState = await loadRoomState(player.roomId);
            active.mapUrl = roomState.map_url || active.mapUrl;
            active.tokens = roomState.tokens || [];
            active.fog = roomState.fog || [];
            active.walls = roomState.walls || [];
            active.drawings = roomState.drawings || [];
            active.aoeEffects = roomState.aoe_effects || [];
            active.gridConfig = roomState.grid_config || active.gridConfig;
            await saveScene(active);
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error saving current scene:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ── Journal Management ──
    socket.on('journal:list', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.campaignId) throw new Error('Not in a campaign');
            let entries = await getJournalEntries(player.campaignId);
            // Players only see entries shared with them or all
            if (!player.isDM) {
                entries = entries.filter(e => 
                    e.sharedWith.includes('all') || e.sharedWith.includes(player.name)
                );
            }
            if (callback) callback({ success: true, entries });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('journal:save', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can manage journal');
            const entry = { ...data, campaignId: player.campaignId };
            await saveJournalEntry(entry);
            // Broadcast updated list to all
            const allEntries = await getJournalEntries(player.campaignId);
            io.to(player.roomId).emit('journal:updated', allEntries);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('journal:delete', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM');
            await deleteJournalEntry(data.entryId);
            const allEntries = await getJournalEntries(player.campaignId);
            io.to(player.roomId).emit('journal:updated', allEntries);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ── Jukebox / Playlist Management ──
    socket.on('jukebox:list', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.campaignId) throw new Error('Not in a campaign');
            const playlists = await getPlaylists(player.campaignId);
            if (callback) callback({ success: true, playlists });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('jukebox:save-playlist', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM');
            const playlist = { ...data, campaignId: player.campaignId };
            await savePlaylist(playlist);
            const playlists = await getPlaylists(player.campaignId);
            io.to(player.roomId).emit('jukebox:playlists', playlists);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('jukebox:delete-playlist', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM');
            await deletePlaylist(data.playlistId);
            const playlists = await getPlaylists(player.campaignId);
            io.to(player.roomId).emit('jukebox:playlists', playlists);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('jukebox:play', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM) throw new Error('Only DM can control jukebox');
            // Broadcast play command to all players
            io.to(player.roomId).emit('jukebox:play', data);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('jukebox:stop', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM) throw new Error('Only DM');
            io.to(player.roomId).emit('jukebox:stop');
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('jukebox:volume', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM) throw new Error('Only DM');
            io.to(player.roomId).emit('jukebox:volume', data);
            if (callback) callback({ success: true });
        } catch (error) {
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // ── NPC Management (DM only) ──
    socket.on('npc:list', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.campaignId) throw new Error('Not in a campaign');
            
            const persistedState = await loadRoomState(player.roomId);
            const npcs = persistedState.npcs || [];
            
            if (callback) callback({ success: true, npcs });
        } catch (error) {
            console.error('Error listing NPCs:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('npc:create', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can create NPCs');
            
            const npc = {
                id: data.id || uuidv4(),
                ...data,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            // Save to room state
            const persistedState = await loadRoomState(player.roomId);
            const npcs = persistedState.npcs || [];
            npcs.push(npc);
            await saveRoomState(player.roomId, 'npcs', npcs);
            
            console.log(`🎭 NPC created: ${npc.name} in campaign ${player.campaignId}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('npc:created', npc);
            
            if (callback) callback({ success: true, npc });
        } catch (error) {
            console.error('Error creating NPC:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('npc:update', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can update NPCs');
            
            const { npcId, updates } = data;
            
            const persistedState = await loadRoomState(player.roomId);
            const npcs = persistedState.npcs || [];
            const npcIndex = npcs.findIndex(n => n.id === npcId);
            
            if (npcIndex < 0) throw new Error('NPC not found');
            
            npcs[npcIndex] = { ...npcs[npcIndex], ...updates, id: npcId, updatedAt: Date.now() };
            await saveRoomState(player.roomId, 'npcs', npcs);
            
            console.log(`🎭 NPC updated: ${npcs[npcIndex].name}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('npc:updated', npcs[npcIndex]);
            
            if (callback) callback({ success: true, npc: npcs[npcIndex] });
        } catch (error) {
            console.error('Error updating NPC:', error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    socket.on('npc:delete', async (data, callback) => {
        try {
            const player = connectedPlayers.get(socket.id);
            if (!player?.isDM || !player?.campaignId) throw new Error('Only DM can delete NPCs');
            
            const { npcId } = data;
            
            const persistedState = await loadRoomState(player.roomId);
            const npcs = (persistedState.npcs || []).filter(n => n.id !== npcId);
            await saveRoomState(player.roomId, 'npcs', npcs);
            
            console.log(`🎭 NPC deleted: ${npcId}`);
            
            // Broadcast to room
            io.to(player.roomId).emit('npc:deleted', { npcId });
            
            if (callback) callback({ success: true });
        } catch (error) {
            console.error('Error deleting NPC:', error);
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