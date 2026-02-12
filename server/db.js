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
  `);

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
      map_url: row.map_url,
      initiative: row.initiative ? JSON.parse(row.initiative) : null,
      ambiance: row.ambiance
    };
  } catch (error) {
    console.error('Error loading room state:', error);
    throw error;
  }
}

// Save on process exit
process.on('exit', () => saveDb());
process.on('SIGINT', () => { saveDb(); process.exit(0); });

module.exports = { db: null, initDatabase, query, run, get, saveRoomState, loadRoomState };
