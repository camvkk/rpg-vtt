// Mirror of the server state for this viewer + chat + presence.
import { create } from 'zustand';
import { applyOps } from '@shared/projection.ts';
import type { JoinOk, PatchOp } from '@shared/protocol.ts';
import type { CampaignState, ChatMessage, ID, PlayerInfo, Presence } from '@shared/types.ts';

export type ConnStatus = 'idle' | 'connecting' | 'online' | 'reconnecting' | 'offline';

interface GameStore {
  status: ConnStatus;
  code: string | null;
  token: string | null;
  me: PlayerInfo | null;
  state: CampaignState | null;
  presence: Record<ID, Presence>;
  chat: ChatMessage[];
  chatComplete: boolean;
  aiEnabled: boolean;
  serverOffset: number;

  setStatus(s: ConnStatus): void;
  joined(res: JoinOk, code: string): void;
  applyPatch(ops: PatchOp[]): void;
  snapshot(state: CampaignState): void;
  addChat(m: ChatMessage): void;
  updateChat(m: ChatMessage): void;
  removeChat(id: ID): void;
  clearChat(): void;
  prependChat(msgs: ChatMessage[]): void;
  setPresence(list: Presence[]): void;
  setMe(me: PlayerInfo): void;
  leave(): void;
}

const CHAT_LIMIT = 600;

export const useGame = create<GameStore>((set, get) => ({
  status: 'idle',
  code: null,
  token: null,
  me: null,
  state: null,
  presence: {},
  chat: [],
  chatComplete: false,
  aiEnabled: false,
  serverOffset: 0,

  setStatus: (status) => set({ status }),
  joined: (res, code) => {
    const presence: Record<ID, Presence> = {};
    for (const p of res.presence) presence[p.playerId] = p;
    set({
      status: 'online',
      code,
      token: res.token,
      me: res.me,
      state: res.state,
      chat: res.chat,
      chatComplete: res.chat.length < 150,
      presence,
      aiEnabled: res.aiEnabled,
      serverOffset: res.serverTime - Date.now(),
    });
  },
  applyPatch: (ops) => {
    const s = get().state;
    if (!s) return;
    const next = applyOps(s, ops);
    const me = get().me;
    const meNext = me ? next.players[me.id] : undefined;
    set(meNext && meNext !== me ? { state: next, me: meNext } : { state: next });
  },
  snapshot: (state) => {
    const me = get().me;
    set({ state, me: me ? state.players[me.id] ?? me : me });
  },
  addChat: (m) => {
    const chat = get().chat;
    if (chat.some((x) => x.id === m.id)) return;
    const next = [...chat, m];
    set({ chat: next.length > CHAT_LIMIT ? next.slice(next.length - CHAT_LIMIT) : next });
  },
  updateChat: (m) => set({ chat: get().chat.map((x) => (x.id === m.id ? m : x)) }),
  removeChat: (id) => set({ chat: get().chat.filter((x) => x.id !== id) }),
  clearChat: () => set({ chat: [], chatComplete: true }),
  prependChat: (msgs) => {
    const known = new Set(get().chat.map((m) => m.id));
    set({ chat: [...msgs.filter((m) => !known.has(m.id)), ...get().chat], chatComplete: msgs.length < 100 });
  },
  setPresence: (list) => {
    const presence: Record<ID, Presence> = {};
    for (const p of list) presence[p.playerId] = p;
    set({ presence });
  },
  setMe: (me) => set({ me }),
  leave: () => set({ status: 'idle', code: null, token: null, me: null, state: null, chat: [], presence: {} }),
}));

export const serverNow = () => Date.now() + useGame.getState().serverOffset;
