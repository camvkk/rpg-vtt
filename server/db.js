const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Ensure data directory
const dbDir = path.join(__dirname, 'data');
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const dbPath = path.join(dbDir, 'rpg-vtt.db');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      dm_name TEXT NOT NULL,
      system TEXT DEFAULT 'dnd5e',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1,
      current_map TEXT DEFAULT NULL,
      ambiance_track TEXT DEFAULT NULL,
      initiative_turn INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT DEFAULT NULL,
      is_dm INTEGER DEFAULT 0,
      socket_id TEXT,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_connected INTEGER DEFAULT 1,
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );
    CREATE TABLE IF NOT EXISTS tokens (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      owner_id TEXT,
      name TEXT NOT NULL,
      x INTEGER DEFAULT 0,
      y INTEGER DEFAULT 0,
      image_url TEXT DEFAULT NULL,
      size INTEGER DEFAULT 1,
      hp_current INTEGER DEFAULT 100,
      hp_max INTEGER DEFAULT 100,
      conditions TEXT DEFAULT '[]',
      initiative INTEGER DEFAULT NULL,
      is_visible INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );
    CREATE TABLE IF NOT EXISTS maps (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      width INTEGER DEFAULT 1000,
      height INTEGER DEFAULT 1000,
      grid_size INTEGER DEFAULT 50,
      is_active INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      player_id TEXT,
      player_name TEXT NOT NULL,
      message TEXT NOT NULL,
      message_type TEXT DEFAULT 'chat',
      is_whisper INTEGER DEFAULT 0,
      target_player TEXT DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );
    CREATE TABLE IF NOT EXISTS fog_of_war (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      radius INTEGER NOT NULL,
      revealed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );
    CREATE TABLE IF NOT EXISTS room_state (
      room_id TEXT PRIMARY KEY,
      tokens TEXT,
      fog TEXT,
      drawings TEXT,
      map_url TEXT,
      initiative TEXT,
      ambiance TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES rooms (id)
    );
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,          -- 8-char unique code (permanent link)
      name TEXT NOT NULL,            -- "A Maldição de Strahd"
      dm_password TEXT NOT NULL,     -- hashed password for DM access
      system TEXT DEFAULT 'dnd5e',   -- dnd5e | generic | custom
      custom_rules TEXT,             -- for "custom" system
      google_docs_url TEXT,          -- optional Google Docs link
      created_at TEXT DEFAULT (datetime('now')),
      last_active TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS campaign_characters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      player_name TEXT NOT NULL,     -- how the player identifies themselves
      character_data TEXT NOT NULL,  -- JSON blob of the full character sheet
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE(campaign_id, player_name)
    );
    CREATE TABLE IF NOT EXISTS campaign_chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'message',   -- message | dice | system
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE TABLE IF NOT EXISTS campaign_system (
      campaign_id TEXT PRIMARY KEY,
      system_data TEXT NOT NULL,      -- JSON: parsed system (races, classes, equipment, etc)
      raw_documents TEXT,             -- JSON array of original document texts (for re-parsing)
      parsed_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE TABLE IF NOT EXISTS campaign_scenes (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      map_url TEXT,
      grid_config TEXT,
      tokens TEXT DEFAULT '[]',
      fog TEXT DEFAULT '[]',
      walls TEXT DEFAULT '[]',
      drawings TEXT DEFAULT '[]',
      aoe_effects TEXT DEFAULT '[]',
      is_active INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE TABLE IF NOT EXISTS campaign_journal (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      image_url TEXT,
      shared_with TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
    CREATE TABLE IF NOT EXISTS campaign_playlists (
      id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      tracks TEXT DEFAULT '[]',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
    );
  `);

  // Migrations — add columns to existing tables (safe to run multiple times)
  const migrations = [
    "ALTER TABLE rooms ADD COLUMN system TEXT DEFAULT 'dnd5e'",
    "ALTER TABLE room_state ADD COLUMN walls TEXT",
    "ALTER TABLE room_state ADD COLUMN aoe_effects TEXT",
    "ALTER TABLE room_state ADD COLUMN grid_config TEXT",
  ];
  for (const sql of migrations) {
    try { db.run(sql); } catch (e) { /* column already exists — ignore */ }
  }

  // Auto-save every 30s
  setInterval(() => saveDb(), 30000);

  console.log('✅ Database initialized successfully');
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('DB save error:', err);
  }
}

// ── Query helpers (return Promises for compat) ──

function query(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return Promise.resolve(rows);
  } catch (err) {
    return Promise.reject(err);
  }
}

function run(sql, params = []) {
  try {
    db.run(sql, params);
    // sql.js doesn't expose lastInsertRowid easily, so we query it
    const result = db.exec('SELECT last_insert_rowid() as id, changes() as changes');
    const row = result[0]?.values[0] || [0, 0];
    return Promise.resolve({ id: row[0], changes: row[1] });
  } catch (err) {
    return Promise.reject(err);
  }
}

function get(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length) stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return Promise.resolve(row);
  } catch (err) {
    return Promise.reject(err);
  }
}

// Room state persistence helpers
async function saveRoomState(roomId, field, value) {
  try {
    const jsonValue = typeof value === 'object' ? JSON.stringify(value) : value;
    
    // Insert or update room_state
    await run(`
      INSERT INTO room_state (room_id, ${field}, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(room_id) DO UPDATE SET 
        ${field} = ?,
        updated_at = CURRENT_TIMESTAMP
    `, [roomId, jsonValue, jsonValue]);
    
    return true;
  } catch (error) {
    console.error('Error saving room state:', error);
    throw error;
  }
}

async function loadRoomState(roomId) {
  try {
    const row = await get('SELECT * FROM room_state WHERE room_id = ?', [roomId]);
    if (!row) {
      return {
        tokens: null,
        fog: null,
        drawings: null,
        walls: null,
        aoe_effects: null,
        grid_config: null,
        map_url: null,
        initiative: null,
        ambiance: null
      };
    }

    // Parse JSON fields
    return {
      tokens: row.tokens ? JSON.parse(row.tokens) : null,
      fog: row.fog ? JSON.parse(row.fog) : null,
      drawings: row.drawings ? JSON.parse(row.drawings) : null,
      walls: row.walls ? JSON.parse(row.walls) : null,
      aoe_effects: row.aoe_effects ? JSON.parse(row.aoe_effects) : null,
      grid_config: row.grid_config ? JSON.parse(row.grid_config) : null,
      map_url: row.map_url,
      initiative: row.initiative ? JSON.parse(row.initiative) : null,
      ambiance: row.ambiance
    };
  } catch (error) {
    console.error('Error loading room state:', error);
    throw error;
  }
}

// ── Campaign helper functions ──

// Create campaign
async function createCampaign(id, name, dmPassword, system = 'dnd5e', customRules = null) {
  try {
    const crypto = require('crypto');
    const hashedPassword = crypto.createHash('sha256').update(dmPassword).digest('hex');
    
    await run(`
      INSERT INTO campaigns (id, name, dm_password, system, custom_rules, created_at, last_active)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `, [id, name, hashedPassword, system, customRules]);
    
    return true;
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw error;
  }
}

// Get campaign by ID
async function getCampaign(id) {
  try {
    const campaign = await get(`
      SELECT * FROM campaigns WHERE id = ?
    `, [id]);
    
    return campaign;
  } catch (error) {
    console.error('Error getting campaign:', error);
    throw error;
  }
}

// Update campaign last active timestamp
async function updateCampaignLastActive(id) {
  try {
    await run(`
      UPDATE campaigns 
      SET last_active = datetime('now')
      WHERE id = ?
    `, [id]);
    
    return true;
  } catch (error) {
    console.error('Error updating campaign last active:', error);
    throw error;
  }
}

// Save character (UPSERT)
async function saveCharacter(campaignId, playerName, characterData) {
  try {
    const jsonData = JSON.stringify(characterData);
    
    await run(`
      INSERT INTO campaign_characters (campaign_id, player_name, character_data, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(campaign_id, player_name) DO UPDATE SET 
        character_data = ?,
        updated_at = datetime('now')
    `, [campaignId, playerName, jsonData, jsonData]);
    
    return true;
  } catch (error) {
    console.error('Error saving character:', error);
    throw error;
  }
}

// Get character
async function getCharacter(campaignId, playerName) {
  try {
    const row = await get(`
      SELECT character_data FROM campaign_characters 
      WHERE campaign_id = ? AND player_name = ?
    `, [campaignId, playerName]);
    
    if (!row) return null;
    
    return JSON.parse(row.character_data);
  } catch (error) {
    console.error('Error getting character:', error);
    throw error;
  }
}

// Get all characters in campaign
async function getCampaignCharacters(campaignId) {
  try {
    const rows = await query(`
      SELECT player_name, character_data, updated_at 
      FROM campaign_characters 
      WHERE campaign_id = ?
      ORDER BY updated_at DESC
    `, [campaignId]);
    
    return rows.map(row => ({
      playerName: row.player_name,
      character: JSON.parse(row.character_data),
      updatedAt: row.updated_at
    }));
  } catch (error) {
    console.error('Error getting campaign characters:', error);
    throw error;
  }
}

// Save chat message
async function saveChatMessage(campaignId, author, content, type = 'message') {
  try {
    await run(`
      INSERT INTO campaign_chat_history (campaign_id, author, content, type, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `, [campaignId, author, content, type]);
    
    return true;
  } catch (error) {
    console.error('Error saving chat message:', error);
    throw error;
  }
}

// Get chat history
async function getChatHistory(campaignId, limit = 100) {
  try {
    const rows = await query(`
      SELECT author, content, type, created_at 
      FROM campaign_chat_history 
      WHERE campaign_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `, [campaignId, limit]);
    
    return rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error('Error getting chat history:', error);
    throw error;
  }
}

// Update campaign Google Docs URL
async function updateCampaignDocs(campaignId, url) {
  try {
    await run(`
      UPDATE campaigns 
      SET google_docs_url = ?
      WHERE id = ?
    `, [url, campaignId]);
    
    return true;
  } catch (error) {
    console.error('Error updating campaign docs:', error);
    throw error;
  }
}

// Generate 8-character campaign ID
function generateCampaignId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Save on process exit
process.on('exit', () => saveDb());
process.on('SIGINT', () => { saveDb(); process.exit(0); });

// ── Campaign System helper functions ──

// Save system data for a campaign
async function saveSystemData(campaignId, systemData, rawDocuments = []) {
  try {
    const jsonSystemData = JSON.stringify(systemData);
    const jsonRawDocuments = JSON.stringify(rawDocuments);
    
    await run(`
      INSERT INTO campaign_system (campaign_id, system_data, raw_documents, parsed_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(campaign_id) DO UPDATE SET 
        system_data = ?,
        raw_documents = ?,
        parsed_at = datetime('now')
    `, [campaignId, jsonSystemData, jsonRawDocuments, jsonSystemData, jsonRawDocuments]);
    
    return true;
  } catch (error) {
    console.error('Error saving system data:', error);
    throw error;
  }
}

// Get system data for a campaign
async function getSystemData(campaignId) {
  try {
    const row = await get(`
      SELECT system_data, raw_documents, parsed_at 
      FROM campaign_system 
      WHERE campaign_id = ?
    `, [campaignId]);
    
    if (!row) return null;
    
    return {
      systemData: JSON.parse(row.system_data),
      rawDocuments: row.raw_documents ? JSON.parse(row.raw_documents) : [],
      parsedAt: row.parsed_at
    };
  } catch (error) {
    console.error('Error getting system data:', error);
    throw error;
  }
}

// ── Scene helper functions ──

async function getScenes(campaignId) {
  const rows = await query('SELECT * FROM campaign_scenes WHERE campaign_id = ? ORDER BY sort_order ASC', [campaignId]);
  return rows.map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    name: r.name,
    mapUrl: r.map_url,
    gridConfig: r.grid_config ? JSON.parse(r.grid_config) : null,
    tokens: r.tokens ? JSON.parse(r.tokens) : [],
    fog: r.fog ? JSON.parse(r.fog) : [],
    walls: r.walls ? JSON.parse(r.walls) : [],
    drawings: r.drawings ? JSON.parse(r.drawings) : [],
    aoeEffects: r.aoe_effects ? JSON.parse(r.aoe_effects) : [],
    isActive: !!r.is_active,
    sortOrder: r.sort_order,
  }));
}

async function saveScene(scene) {
  await run(`
    INSERT INTO campaign_scenes (id, campaign_id, name, map_url, grid_config, tokens, fog, walls, drawings, aoe_effects, is_active, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = ?, map_url = ?, grid_config = ?, tokens = ?, fog = ?, walls = ?, drawings = ?, aoe_effects = ?, is_active = ?, sort_order = ?
  `, [
    scene.id, scene.campaignId, scene.name, scene.mapUrl || null,
    scene.gridConfig ? JSON.stringify(scene.gridConfig) : null,
    JSON.stringify(scene.tokens || []), JSON.stringify(scene.fog || []),
    JSON.stringify(scene.walls || []), JSON.stringify(scene.drawings || []),
    JSON.stringify(scene.aoeEffects || []), scene.isActive ? 1 : 0, scene.sortOrder || 0,
    // UPDATE values
    scene.name, scene.mapUrl || null,
    scene.gridConfig ? JSON.stringify(scene.gridConfig) : null,
    JSON.stringify(scene.tokens || []), JSON.stringify(scene.fog || []),
    JSON.stringify(scene.walls || []), JSON.stringify(scene.drawings || []),
    JSON.stringify(scene.aoeEffects || []), scene.isActive ? 1 : 0, scene.sortOrder || 0,
  ]);
}

async function deleteScene(sceneId) {
  await run('DELETE FROM campaign_scenes WHERE id = ?', [sceneId]);
}

async function setActiveScene(campaignId, sceneId) {
  await run('UPDATE campaign_scenes SET is_active = 0 WHERE campaign_id = ?', [campaignId]);
  await run('UPDATE campaign_scenes SET is_active = 1 WHERE id = ? AND campaign_id = ?', [sceneId, campaignId]);
}

// ── Journal helper functions ──

async function getJournalEntries(campaignId) {
  const rows = await query('SELECT * FROM campaign_journal WHERE campaign_id = ? ORDER BY updated_at DESC', [campaignId]);
  return rows.map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    title: r.title,
    content: r.content,
    imageUrl: r.image_url,
    sharedWith: r.shared_with ? JSON.parse(r.shared_with) : [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

async function saveJournalEntry(entry) {
  await run(`
    INSERT INTO campaign_journal (id, campaign_id, title, content, image_url, shared_with, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      title = ?, content = ?, image_url = ?, shared_with = ?, updated_at = datetime('now')
  `, [
    entry.id, entry.campaignId, entry.title, entry.content || '',
    entry.imageUrl || null, JSON.stringify(entry.sharedWith || []),
    entry.title, entry.content || '', entry.imageUrl || null, JSON.stringify(entry.sharedWith || []),
  ]);
}

async function deleteJournalEntry(entryId) {
  await run('DELETE FROM campaign_journal WHERE id = ?', [entryId]);
}

// ── Playlist helper functions ──

async function getPlaylists(campaignId) {
  const rows = await query('SELECT * FROM campaign_playlists WHERE campaign_id = ? ORDER BY sort_order ASC', [campaignId]);
  return rows.map(r => ({
    id: r.id,
    campaignId: r.campaign_id,
    name: r.name,
    tracks: r.tracks ? JSON.parse(r.tracks) : [],
    sortOrder: r.sort_order,
  }));
}

async function savePlaylist(playlist) {
  await run(`
    INSERT INTO campaign_playlists (id, campaign_id, name, tracks, sort_order)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = ?, tracks = ?, sort_order = ?
  `, [
    playlist.id, playlist.campaignId, playlist.name,
    JSON.stringify(playlist.tracks || []), playlist.sortOrder || 0,
    playlist.name, JSON.stringify(playlist.tracks || []), playlist.sortOrder || 0,
  ]);
}

async function deletePlaylist(playlistId) {
  await run('DELETE FROM campaign_playlists WHERE id = ?', [playlistId]);
}

module.exports = { 
  db: null, 
  initDatabase, 
  query, 
  run, 
  get, 
  saveRoomState, 
  loadRoomState,
  createCampaign,
  getCampaign,
  updateCampaignLastActive,
  saveCharacter,
  getCharacter,
  getCampaignCharacters,
  saveChatMessage,
  getChatHistory,
  updateCampaignDocs,
  generateCampaignId,
  saveSystemData,
  getSystemData,
  // Scenes
  getScenes,
  saveScene,
  deleteScene,
  setActiveScene,
  // Journal
  getJournalEntries,
  saveJournalEntry,
  deleteJournalEntry,
  // Playlists
  getPlaylists,
  savePlaylist,
  deletePlaylist,
};
