// Socket.io client: join/rejoin with session token, typed actions, ephemeral fx, AI streaming.
import { io, type Socket } from 'socket.io-client';
import type { ActionPayload, ActionType } from '@shared/actions/index.ts';
import type {
  ActResponse, AiRequest, AiResponse, ClientFx, ClientToServerEvents, FxEvent, JoinRequest, JoinResponse,
  ServerToClientEvents, SystemParseProgress, SystemParseRequest, SystemParseResponse,
} from '@shared/protocol.ts';
import { toast } from '../ui/index.tsx';
import { useGame } from '../store/game.ts';
import { saveTable } from './session.ts';

type VttClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export const SERVER_URL: string = (import.meta.env.VITE_SERVER_URL as string | undefined) ?? '';

// ---------------------------------------------------------------------------
// FX bus (ephemeral events for the engine, dice, audio, UI)
// ---------------------------------------------------------------------------

type FxListener = (e: FxEvent) => void;
const fxListeners = new Set<FxListener>();
export function onFx(fn: FxListener): () => void {
  fxListeners.add(fn);
  return () => fxListeners.delete(fn);
}
export function emitLocalFx(e: FxEvent): void {
  for (const fn of fxListeners) fn(e);
}

const aiListeners = new Map<string, (chunk: string) => void>();
const systemListeners = new Map<string, (p: SystemParseProgress) => void>();

let socket: VttClientSocket | null = null;

export function getSocket(): VttClientSocket {
  if (socket) return socket;
  const s: VttClientSocket = io(SERVER_URL || undefined, {
    transports: ['websocket', 'polling'],
    reconnectionDelay: 600,
    reconnectionDelayMax: 4000,
  });
  socket = s;
  const game = useGame.getState;

  s.on('connect', () => {
    // Every (re)connection is a fresh socket on the server: re-attach it to the table we were in.
    const { code, token, me, state } = game();
    if (code && token && state) void join({ code, token, name: me?.name ?? '' }, true);
  });
  s.on('disconnect', () => {
    if (game().code) game().setStatus('reconnecting');
  });
  s.io.on('reconnect_failed', () => game().setStatus('offline'));

  s.on('patch', (ops) => game().applyPatch(ops));
  s.on('snapshot', (state) => game().snapshot(state));
  s.on('chat', (m) => game().addChat(m));
  s.on('chat.update', (m) => game().updateChat(m));
  s.on('chat.delete', (id) => game().removeChat(id));
  s.on('chat.clear', () => game().clearChat());
  s.on('presence', (p) => game().setPresence(p));
  s.on('me', (me) => game().setMe(me));
  s.on('fx', (e) => emitLocalFx(e));
  s.on('ai.chunk', (id, chunk) => aiListeners.get(id)?.(chunk));
  s.on('system.progress', (id, p) => systemListeners.get(id)?.(p));
  s.on('kicked', (reason) => {
    toast(reason || 'Você foi removido da mesa.', 'danger');
    game().leave();
  });
  return s;
}

export const JOIN_TIMEOUT = 'O servidor não respondeu. Tente de novo.';

export function join(req: JoinRequest, silent = false): Promise<JoinResponse> {
  const s = getSocket();
  if (!silent) useGame.getState().setStatus('connecting');
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ ok: false, error: JOIN_TIMEOUT }), 8_000);
    s.emit('join', req, (res) => {
      window.clearTimeout(timer);
      if (res.ok) {
        const code = req.code.toUpperCase();
        useGame.getState().joined(res, code);
        saveTable({
          code, name: res.state.name, token: res.token, playerName: res.me.name, role: res.me.role, lastJoined: Date.now(),
        });
        if (silent) toast('Conexão restabelecida.', 'success', 2000);
      } else if (!silent) {
        useGame.getState().setStatus('idle');
      } else {
        useGame.getState().setStatus('offline');
        toast(res.error, 'danger');
      }
      resolve(res);
    });
  });
}

function emitAct(type: string, payload: unknown): Promise<ActResponse> {
  const s = getSocket();
  return new Promise((resolve) => {
    s.timeout(10_000).emit('act', { type, payload }, (err: Error | null, res: ActResponse) => {
      resolve(err ? { ok: false, error: 'O servidor demorou para responder.' } : res);
    });
  });
}

/** Re-attach this socket to the table using the saved session token. */
async function rejoin(): Promise<boolean> {
  const { code, token, me } = useGame.getState();
  if (!code || !token) return false;
  const res = await join({ code, token, name: me?.name ?? '' }, true);
  return res.ok;
}

/** Dispatch a typed action. Errors are toasted unless `quiet`. */
export async function act<T extends ActionType>(type: T, payload: ActionPayload<T>, opts: { quiet?: boolean } = {}): Promise<ActResponse> {
  const s = getSocket();
  if (!s.connected) {
    // Give a reconnect in progress a moment before failing.
    await new Promise<void>((r) => {
      const t = window.setTimeout(r, 2500);
      s.once('connect', () => {
        window.clearTimeout(t);
        window.setTimeout(r, 300);
      });
    });
    if (!s.connected) {
      if (!opts.quiet) toast('Sem conexão com o servidor.', 'warning');
      return { ok: false, error: 'offline' };
    }
  }
  let out = await emitAct(type, payload);
  if (!out.ok && out.code === 'NO_ROOM' && (await rejoin())) out = await emitAct(type, payload);
  if (!out.ok && !opts.quiet) toast(out.error, 'danger');
  return out;
}

export function sendFx(e: ClientFx): void {
  const s = getSocket();
  if (s.connected) s.volatile.emit('fx', e);
}

export function loadOlderChat(): Promise<void> {
  const s = getSocket();
  const first = useGame.getState().chat[0];
  return new Promise((resolve) => {
    s.emit('chat.history', first?.ts ?? Date.now(), (msgs) => {
      useGame.getState().prependChat(msgs);
      resolve();
    });
  });
}

let aiSeq = 0;
export function askAi(req: AiRequest, onChunk: (chunk: string) => void): Promise<AiResponse> {
  const s = getSocket();
  const id = `ai${Date.now()}${aiSeq++}`;
  aiListeners.set(id, onChunk);
  return new Promise((resolve) => {
    s.timeout(180_000).emit('ai', id, req, (err: Error | null, res: AiResponse) => {
      aiListeners.delete(id);
      resolve(err ? { ok: false, error: 'O Oráculo não respondeu a tempo.' } : res);
    });
  });
}

let systemSeq = 0;
/** DM: send documents to the AI and get a parsed (unsaved) system back. Can take a few minutes. */
export function parseSystem(req: SystemParseRequest, onProgress: (p: SystemParseProgress) => void): Promise<SystemParseResponse> {
  const s = getSocket();
  const id = `sys${Date.now()}${systemSeq++}`;
  systemListeners.set(id, onProgress);
  return new Promise((resolve) => {
    s.timeout(420_000).emit('system.parse', id, req, (err: Error | null, res: SystemParseResponse) => {
      systemListeners.delete(id);
      resolve(err ? { ok: false, error: 'A IA não respondeu a tempo. Tente com menos documentos.' } : res);
    });
  });
}

if (import.meta.env.DEV) {
  // Dev tooling for scripted testing from the browser console.
  void import('../store/ui.ts').then(({ useUi }) => {
    Object.assign(window as unknown as Record<string, unknown>, { __act: act, __game: useGame, __ui: useUi, __sendFx: sendFx, __join: join });
  });
}

export function disconnectAndLeave(): void {
  useGame.getState().leave();
  socket?.disconnect();
  socket = null;
}
