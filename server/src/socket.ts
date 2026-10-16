import type { ClientFx } from '../../shared/src/protocol.ts';
import { runAi } from './ai.ts';
import { RateLimiter } from './ratelimit.ts';
import type { VttServer, VttSocket } from './room.ts';
import { joinRoom, roomOfSocket } from './rooms.ts';

const joinLimiter = new RateLimiter(12, 60_000);
const fxLimiter = new RateLimiter(60, 5_000);
const aiLimiter = new RateLimiter(12, 60_000);

function num(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6;
}

/** Validate client-relayed ephemeral events (cheap checks, no zod on the hot path). */
function validFx(e: ClientFx): boolean {
  if (!e || typeof e !== 'object') return false;
  switch (e.type) {
    case 'ping':
      return typeof e.sceneId === 'string' && num(e.x) && num(e.y);
    case 'cursor':
      return typeof e.sceneId === 'string' && num(e.x) && num(e.y);
    case 'ruler':
      return typeof e.sceneId === 'string' && (e.points === null || (Array.isArray(e.points) && e.points.length <= 64 && e.points.every(num)))
        && typeof e.label === 'string' && e.label.length < 60;
    case 'target':
      return Array.isArray(e.tokenIds) && e.tokenIds.length <= 30 && e.tokenIds.every((t) => typeof t === 'string');
    default:
      return false;
  }
}

export function registerSocketHandlers(io: VttServer): void {
  io.on('connection', (socket: VttSocket) => {
    socket.data.campaignId = null;
    socket.data.playerId = null;
    socket.data.role = null;
    const addr = (socket.handshake.headers['cf-connecting-ip'] as string) || socket.handshake.address;

    socket.on('join', (req, ack) => {
      if (typeof ack !== 'function') return;
      if (!joinLimiter.take(addr)) {
        ack({ ok: false, error: 'Muitas tentativas. Aguarde um minuto.' });
        return;
      }
      const previous = roomOfSocket(socket);
      if (previous) previous.detach(socket);
      try {
        ack(joinRoom(socket, req));
      } catch (e) {
        console.error('join failed', e);
        ack({ ok: false, error: 'Erro ao entrar na mesa.' });
      }
    });

    socket.on('act', (req, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOfSocket(socket);
      const pid = socket.data.playerId;
      const player = room && pid ? room.state.players[pid] : undefined;
      if (!room || !player) {
        ack({ ok: false, error: 'Você não está em uma mesa.', code: 'NO_ROOM' });
        return;
      }
      if (!req || typeof req.type !== 'string') {
        ack({ ok: false, error: 'Ação inválida.' });
        return;
      }
      try {
        ack(room.dispatch(player, socket.id, req.type, req.payload));
      } catch (e) {
        console.error(`[act ${req.type}] unexpected failure`, e);
        ack({ ok: false, error: 'Erro interno no servidor.' });
      }
    });

    socket.on('fx', (e) => {
      const room = roomOfSocket(socket);
      const pid = socket.data.playerId;
      const player = room && pid ? room.state.players[pid] : undefined;
      if (!room || !player || !fxLimiter.take(socket.id) || !validFx(e)) return;
      // Stamp identity server-side.
      const event = { ...e, playerId: player.id, color: player.color } as ClientFx;
      if (event.type === 'ping' && event.pull && player.role !== 'dm') event.pull = false;
      room.sendFx(event, 'all', socket.id);
    });

    socket.on('chat.history', (before, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOfSocket(socket);
      const viewer = room?.viewerOf(socket);
      ack(room && viewer ? room.chatFor(viewer, Number(before) || Date.now(), 100) : []);
    });

    socket.on('ai', (requestId, req, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOfSocket(socket);
      if (!room || socket.data.role !== 'dm') {
        ack({ ok: false, error: 'Apenas o Mestre pode usar o Oráculo.' });
        return;
      }
      if (!aiLimiter.take(room.id)) {
        ack({ ok: false, error: 'O Oráculo precisa respirar. Tente em instantes.' });
        return;
      }
      runAi(room, String(requestId).slice(0, 40), req, (chunk) => socket.emit('ai.chunk', String(requestId), chunk))
        .then(ack)
        .catch((err: unknown) => ack({ ok: false, error: err instanceof Error ? err.message : 'Falha no Oráculo.' }));
    });

    socket.on('disconnect', () => {
      const room = roomOfSocket(socket);
      room?.detach(socket);
    });
  });
}
