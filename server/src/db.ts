// SQLite via Node's built-in node:sqlite (no native dependencies). WAL mode + simple versioned migrations.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

const MIGRATIONS: string[] = [
  // 1 — initial schema
  `
  CREATE TABLE campaigns (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    dm_password TEXT,
    state TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_used INTEGER NOT NULL
  );
  CREATE INDEX sessions_player ON sessions(campaign_id, player_id);
  CREATE TABLE chat (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX chat_campaign_ts ON chat(campaign_id, ts);
  CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    file TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX assets_campaign ON assets(campaign_id);
  `,
  // 2 — source documents of the custom system importer (kept out of the campaign state: big and DM-only)
  `
  CREATE TABLE system_sources (
    campaign_id TEXT PRIMARY KEY,
    documents TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
];

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(config.dataDir, { recursive: true });
  db = new DatabaseSync(path.join(config.dataDir, 'vtt.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[version]!);
      version++;
      db.prepare('UPDATE schema_version SET version = ?').run(version);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
