// Persistence: campaigns (JSON state), sessions, chat log, assets.
import { STATE_VERSION } from '../../shared/src/defaults.ts';
import type { CampaignState, ChatMessage, ID } from '../../shared/src/types.ts';
import { hashToken } from './auth.ts';
import { getDb } from './db.ts';

export interface CampaignRow {
  id: string;
  code: string;
  name: string;
  dm_password: string | null;
  state: string;
  created_at: number;
  updated_at: number;
}

export function insertCampaign(state: CampaignState, dmPasswordHash: string | null): void {
  const now = Date.now();
  getDb()
    .prepare('INSERT INTO campaigns (id, code, name, dm_password, state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(state.id, state.code, state.name, dmPasswordHash, JSON.stringify(state), now, now);
}

export function codeExists(code: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM campaigns WHERE code = ?').get(code);
}

export function loadCampaignByCode(code: string): { row: CampaignRow; state: CampaignState } | null {
  const row = getDb().prepare('SELECT * FROM campaigns WHERE code = ?').get(code) as CampaignRow | undefined;
  if (!row) return null;
  const state = migrateState(JSON.parse(row.state) as CampaignState);
  return { row, state };
}

export function campaignSummary(code: string): { name: string; players: number; hasPassword: boolean } | null {
  const row = getDb().prepare('SELECT name, state, dm_password FROM campaigns WHERE code = ?').get(code) as
    | { name: string; state: string; dm_password: string | null }
    | undefined;
  if (!row) return null;
  let players = 0;
  try {
    players = Object.keys((JSON.parse(row.state) as CampaignState).players ?? {}).length;
  } catch {
    players = 0;
  }
  return { name: row.name, players, hasPassword: !!row.dm_password };
}

export function saveCampaignState(state: CampaignState): void {
  getDb()
    .prepare('UPDATE campaigns SET state = ?, name = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(state), state.name, Date.now(), state.id);
}

export function setDmPassword(campaignId: ID, hash: string | null): void {
  getDb().prepare('UPDATE campaigns SET dm_password = ? WHERE id = ?').run(hash, campaignId);
}

/** Forward-compatible migrations of the stored JSON state. */
function migrateState(state: CampaignState): CampaignState {
  if (!state.version) state.version = 1;
  // future: if (state.version < 2) { ... }
  state.version = STATE_VERSION;
  return state;
}

// Sessions ---------------------------------------------------------------------

export function createSession(token: string, campaignId: ID, playerId: ID): void {
  const now = Date.now();
  getDb()
    .prepare('INSERT INTO sessions (token_hash, campaign_id, player_id, created_at, last_used) VALUES (?, ?, ?, ?, ?)')
    .run(hashToken(token), campaignId, playerId, now, now);
}

export function findSession(token: string): { campaign_id: string; player_id: string } | null {
  const row = getDb()
    .prepare('SELECT campaign_id, player_id FROM sessions WHERE token_hash = ?')
    .get(hashToken(token)) as { campaign_id: string; player_id: string } | undefined;
  if (row) getDb().prepare('UPDATE sessions SET last_used = ? WHERE token_hash = ?').run(Date.now(), hashToken(token));
  return row ?? null;
}

export function deleteSessionsForPlayer(campaignId: ID, playerId: ID): void {
  getDb().prepare('DELETE FROM sessions WHERE campaign_id = ? AND player_id = ?').run(campaignId, playerId);
}

// Chat -------------------------------------------------------------------------

export function insertChat(campaignId: ID, m: ChatMessage): void {
  getDb().prepare('INSERT INTO chat (id, campaign_id, ts, data) VALUES (?, ?, ?, ?)').run(m.id, campaignId, m.ts, JSON.stringify(m));
}

export function updateChat(m: ChatMessage): void {
  getDb().prepare('UPDATE chat SET data = ? WHERE id = ?').run(JSON.stringify(m), m.id);
}

export function deleteChat(id: ID): void {
  getDb().prepare('DELETE FROM chat WHERE id = ?').run(id);
}

export function clearChat(campaignId: ID): void {
  getDb().prepare('DELETE FROM chat WHERE campaign_id = ?').run(campaignId);
}

export function recentChat(campaignId: ID, limit: number, before = Number.MAX_SAFE_INTEGER): ChatMessage[] {
  const rows = getDb()
    .prepare('SELECT data FROM chat WHERE campaign_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?')
    .all(campaignId, before, limit) as { data: string }[];
  return rows.map((r) => JSON.parse(r.data) as ChatMessage).reverse();
}

export function getChat(id: ID): ChatMessage | null {
  const row = getDb().prepare('SELECT data FROM chat WHERE id = ?').get(id) as { data: string } | undefined;
  return row ? (JSON.parse(row.data) as ChatMessage) : null;
}

// Assets -----------------------------------------------------------------------

export function insertAsset(a: { id: string; campaignId: ID; kind: string; mime: string; size: number; file: string }): void {
  getDb()
    .prepare('INSERT INTO assets (id, campaign_id, kind, mime, size, file, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(a.id, a.campaignId, a.kind, a.mime, a.size, a.file, Date.now());
}

export function campaignAssetBytes(campaignId: ID): number {
  const row = getDb().prepare('SELECT COALESCE(SUM(size), 0) AS total FROM assets WHERE campaign_id = ?').get(campaignId) as { total: number };
  return Number(row.total);
}
