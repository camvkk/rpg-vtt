import { SYSTEM_DOC_LIMITS, type ClientFx, type SystemDocument, type SystemParseRequest } from '../../shared/src/protocol.ts';
import { parseCustomSystem, runAi } from './ai.ts';
import { aiEnabled } from './config.ts';
import { RateLimiter } from './ratelimit.ts';
import type { VttServer, VttSocket } from './room.ts';
import { joinRoom, roomOfSocket } from './rooms.ts';
import * as store from './store.ts';

const joinLimiter = new RateLimiter(12, 60_000);
const fxLimiter = new RateLimiter(60, 5_000);
const aiLimiter = new RateLimiter(12, 60_000);
const systemLimiter = new RateLimiter(6, 10 * 60_000);
/** Rooms with a system import running (one at a time: it is slow and expensive). */
const parsing = new Set<string>();

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

/** Validate an importer request; returns the cleaned documents or a PT-BR error. */
export function systemDocsFrom(req: SystemParseRequest | undefined): SystemDocument[] | string {
  const docs = Array.isArray(req?.documents) ? req.documents : [];
  if (!docs.length) return 'Adicione pelo menos um documento.';
  if (docs.length > SYSTEM_DOC_LIMITS.maxDocs) return `No máximo ${SYSTEM_DOC_LIMITS.maxDocs} documentos por vez.`;
  const out: SystemDocument[] = [];
  let total = 0;
  for (const d of docs) {
    const text = typeof d?.text === 'string' ? d.text.trim() : '';
    if (!text) continue;
    if (text.length > SYSTEM_DOC_LIMITS.maxDocChars) return `"${String(d.name).slice(0, 60)}" é longo demais.`;
    total += text.length;
    out.push({ name: (typeof d.name === 'string' ? d.name.trim() : '').slice(0, 120) || `Documento ${out.length + 1}`, text });
  }
  if (!out.length) return 'Os documentos estão vazios.';
  if (total > SYSTEM_DOC_LIMITS.maxTotalChars) return 'Os documentos somados são grandes demais — envie menos de uma vez.';
  return out;
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

    socket.on('system.parse', (requestId, req, ack) => {
      if (typeof ack !== 'function') return;
      const room = roomOfSocket(socket);
      if (!room || socket.data.role !== 'dm') {
        ack({ ok: false, error: 'Apenas o Mestre pode importar um sistema.' });
        return;
      }
      if (!aiEnabled()) {
        ack({ ok: false, error: 'IA desligada: configure MOONSHOT_API_KEY ou OPENROUTER_API_KEY no servidor.' });
        return;
      }
      const docs = systemDocsFrom(req);
      if (typeof docs === 'string') {
        ack({ ok: false, error: docs });
        return;
      }
      if (parsing.has(room.id)) {
        ack({ ok: false, error: 'Já existe um sistema sendo processado nesta mesa.' });
        return;
      }
      if (!systemLimiter.take(room.id)) {
        ack({ ok: false, error: 'Muitas importações seguidas. Espere alguns minutos.' });
        return;
      }
      // Keep the documents so the DM can re-process later (even from another device).
      store.saveSystemSources(room.id, docs);
      parsing.add(room.id);
      const id = String(requestId).slice(0, 40);
      parseCustomSystem(docs, typeof req.instructions === 'string' ? req.instructions : '', (p) => socket.emit('system.progress', id, p))
        .then(ack)
        .catch((err: unknown) => ack({ ok: false, error: err instanceof Error ? err.message : 'Falha ao processar o sistema.' }))
        .finally(() => parsing.delete(room.id));
    });

    socket.on('disconnect', () => {
      const room = roomOfSocket(socket);
      room?.detach(socket);
    });
  });
}
