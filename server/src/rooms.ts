// Room registry + campaign creation + join flow.
import { createCampaign, sceneFromBuiltin } from '../../shared/src/defaults.ts';
import type { CreateCampaignRequest, JoinRequest, JoinResponse } from '../../shared/src/protocol.ts';
import type { PlayerInfo } from '../../shared/src/types.ts';
import { newCode, newId, normalize, PLAYER_COLORS } from '../../shared/src/util.ts';
import { hashPassword, newSessionToken, verifyPassword } from './auth.ts';
import { aiEnabled } from './config.ts';
import { Room, type VttSocket } from './room.ts';
import * as store from './store.ts';

const rooms = new Map<string, Room>(); // by code
const passwordHashes = new Map<string, string | null>(); // campaignId → hash

export function getRoom(code: string): Room | null {
  const c = code.toUpperCase();
  let room = rooms.get(c);
  if (room) return room;
  const loaded = store.loadCampaignByCode(c);
  if (!loaded) return null;
  room = new Room(loaded.state);
  passwordHashes.set(room.id, loaded.row.dm_password);
  rooms.set(c, room);
  return room;
}

export function allRooms(): Room[] {
  return [...rooms.values()];
}

/** Save and unload rooms nobody is connected to. */
export function sweepRooms(idleMs = 15 * 60_000): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.socketCount === 0 && now - room.lastActivity > idleMs) {
      room.save();
      rooms.delete(code);
    }
  }
}

export function saveAll(): void {
  for (const room of rooms.values()) if (room.dirty) room.save();
}

function cleanName(s: string, max = 40): string {
  return s.replace(/[\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function createCampaignFromRequest(req: CreateCampaignRequest): { code: string; token: string } {
  const name = cleanName(req.name, 80) || 'Nova Campanha';
  const dmName = cleanName(req.dmName) || 'Mestre';
  let code = newCode();
  for (let i = 0; store.codeExists(code) && i < 20; i++) code = newCode(i > 10 ? 7 : 6);
  const state = createCampaign({ id: newId(16), code, name });
  if (req.starter && req.starter !== 'blank') {
    const scene = sceneFromBuiltin(req.starter);
    if (scene) {
      state.scenes = { [scene.id]: scene };
      state.sceneOrder = [scene.id];
      state.activeSceneId = scene.id;
      if (scene.ambience) state.audio.ambience = { [scene.ambience]: { volume: 0.6 } };
    }
  }
  const dm: PlayerInfo = {
    id: newId(), name: dmName, role: 'dm', color: '#e0a84f', avatar: null, characterId: null, joinedAt: Date.now(),
  };
  state.players[dm.id] = dm;
  const pw = req.dmPassword?.trim() ? hashPassword(req.dmPassword.trim()) : null;
  store.insertCampaign(state, pw);
  const token = newSessionToken();
  store.createSession(token, state.id, dm.id);
  return { code, token };
}

function pickColor(room: Room): string {
  const used = new Set(Object.values(room.state.players).map((p) => p.color));
  return PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[Object.keys(room.state.players).length % PLAYER_COLORS.length]!;
}

export function joinRoom(socket: VttSocket, req: JoinRequest): JoinResponse {
  const code = String(req.code ?? '').toUpperCase().trim();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) return { ok: false, error: 'Código de mesa inválido.' };
  const room = getRoom(code);
  if (!room) return { ok: false, error: 'Mesa não encontrada. Confira o código.' };

  let player: PlayerInfo | undefined;
  let token: string | null = null;

  // 1) Session token
  if (req.token) {
    const session = store.findSession(String(req.token));
    if (session && session.campaign_id === room.id) {
      player = room.state.players[session.player_id];
      if (player) token = String(req.token);
    }
  }

  const name = cleanName(String(req.name ?? ''));
  // 2) DM password
  if (!player && req.dmPassword) {
    const hash = passwordHashes.get(room.id) ?? null;
    if (!verifyPassword(String(req.dmPassword), hash)) return { ok: false, error: 'Senha do Mestre incorreta.' };
    const dms = Object.values(room.state.players).filter((p) => p.role === 'dm');
    player = dms.find((p) => normalize(p.name) === normalize(name)) ?? dms[0];
    if (!player) {
      const dm: PlayerInfo = {
        id: newId(), name: name || 'Mestre', role: 'dm', color: '#e0a84f', avatar: null, characterId: null, joinedAt: Date.now(),
      };
      room.mutate((d) => {
        d.players[dm.id] = dm;
      });
      player = room.state.players[dm.id];
    }
  }

  // 3) Name (players)
  if (!player) {
    if (!name) return { ok: false, error: 'Digite seu nome.' };
    const existing = Object.values(room.state.players).find((p) => normalize(p.name) === normalize(name));
    if (existing) {
      if (existing.role === 'dm') return { ok: false, error: 'Esse é o nome do Mestre. Use a senha do Mestre para entrar.' };
      if (room.isOnline(existing.id)) return { ok: false, error: 'Já tem alguém conectado com esse nome.' };
      player = existing;
    } else {
      if (Object.keys(room.state.players).length >= 40) return { ok: false, error: 'A mesa está cheia.' };
      const p: PlayerInfo = {
        id: newId(), name, role: 'player', color: pickColor(room), avatar: null, characterId: null, joinedAt: Date.now(),
      };
      room.mutate((d) => {
        d.players[p.id] = p;
      });
      room.postSystem(`${p.name} entrou na mesa.`);
      player = room.state.players[p.id];
    }
  }
  if (!player) return { ok: false, error: 'Não foi possível entrar.' };

  if (!token) {
    token = newSessionToken();
    store.createSession(token, room.id, player.id);
  }
  socket.data.campaignId = room.id;
  socket.data.playerId = player.id;
  socket.data.role = player.role;
  room.attach(socket);
  const viewer = { id: player.id, role: player.role };
  return {
    ok: true,
    me: player,
    token,
    state: room.snapshotFor(viewer),
    chat: room.chatFor(viewer),
    presence: room.presence(),
    serverTime: Date.now(),
    aiEnabled: aiEnabled() && player.role === 'dm',
  };
}

export function roomOfSocket(socket: VttSocket): Room | null {
  const id = socket.data.campaignId;
  if (!id) return null;
  for (const r of rooms.values()) if (r.id === id) return r;
  return null;
}

export function setCampaignPassword(room: Room, password: string | null): void {
  const hash = password ? hashPassword(password) : null;
  store.setDmPassword(room.id, hash);
  passwordHashes.set(room.id, hash);
}
