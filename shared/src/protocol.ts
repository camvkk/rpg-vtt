// Socket.io protocol between client and server.
import type { CampaignState, ChatMessage, ID, PlayerInfo, Presence, Role } from './types.ts';

/** A state patch op: set (v present) or delete (d) the value at path. Paths are entity roots. */
export interface PatchOp {
  p: string[];
  v?: unknown;
  d?: 1;
}

export interface JoinRequest {
  code: string;
  name: string;
  /** Session token from a previous join (localStorage). */
  token?: string;
  /** DM password to join/rejoin as DM. */
  dmPassword?: string;
}

export interface JoinOk {
  ok: true;
  me: PlayerInfo;
  token: string;
  state: CampaignState;
  chat: ChatMessage[];
  presence: Presence[];
  serverTime: number;
  aiEnabled: boolean;
}

export interface Fail {
  ok: false;
  error: string;
  /** Machine-readable reason, e.g. NO_ROOM when the socket must rejoin. */
  code?: 'NO_ROOM';
}

export type JoinResponse = JoinOk | Fail;

export interface ActRequest {
  type: string;
  payload: unknown;
}

export type ActResponse = { ok: true; result?: unknown } | Fail;

/** Ephemeral events relayed to the room (not persisted). */
export type FxEvent =
  | { type: 'dice3d'; messageId: ID; playerId: ID | null; color: string; dice: { sides: number; value: number }[]; crit: boolean; fumble: boolean }
  | { type: 'ping'; sceneId: ID; x: number; y: number; color: string; playerId: ID; pull: boolean }
  | { type: 'ruler'; sceneId: ID; playerId: ID; color: string; points: number[] | null; label: string }
  | { type: 'cursor'; sceneId: ID; playerId: ID; color: string; x: number; y: number }
  | { type: 'sfx'; id: string }
  | { type: 'handout'; journalId: ID }
  | { type: 'turn'; combatantId: ID; ownerIds: ID[]; name: string }
  | { type: 'toast'; text: string; tone: 'info' | 'success' | 'warning' | 'danger' }
  | { type: 'camera'; sceneId: ID; x: number; y: number; zoom: number | null }
  | { type: 'target'; playerId: ID; tokenIds: ID[] };

/** Events a client may relay directly (validated + rate limited server side). */
export type ClientFx = Extract<FxEvent, { type: 'ping' | 'ruler' | 'cursor' | 'target' }>;

export interface AiRequest {
  kind: 'npc' | 'scene' | 'encounter' | 'rules' | 'summary' | 'names' | 'loot' | 'free';
  prompt: string;
  /** Extra structured context (party levels, scene id, etc.). */
  context?: Record<string, unknown>;
}

export type AiResponse =
  | { ok: true; kind: AiRequest['kind']; text: string; data?: unknown }
  | Fail;

export interface ServerToClientEvents {
  patch: (ops: PatchOp[]) => void;
  snapshot: (state: CampaignState) => void;
  chat: (msg: ChatMessage) => void;
  'chat.update': (msg: ChatMessage) => void;
  'chat.delete': (id: ID) => void;
  'chat.clear': () => void;
  presence: (p: Presence[]) => void;
  fx: (e: FxEvent) => void;
  'ai.chunk': (requestId: string, text: string) => void;
  kicked: (reason: string) => void;
  me: (me: PlayerInfo) => void;
}

export interface ClientToServerEvents {
  join: (req: JoinRequest, ack: (res: JoinResponse) => void) => void;
  act: (req: ActRequest, ack: (res: ActResponse) => void) => void;
  fx: (e: ClientFx) => void;
  'chat.history': (before: number, ack: (msgs: ChatMessage[]) => void) => void;
  ai: (requestId: string, req: AiRequest, ack: (res: AiResponse) => void) => void;
}

export interface SocketData {
  campaignId: ID | null;
  playerId: ID | null;
  role: Role | null;
}

// HTTP API ------------------------------------------------------------------

export interface CreateCampaignRequest {
  name: string;
  dmName: string;
  dmPassword?: string;
  /** Start from a ready-made adventure scene. */
  starter?: 'blank' | 'tavern' | 'dungeon' | 'forest';
}

export type CreateCampaignResponse = { ok: true; code: string; token: string } | Fail;

export interface CampaignSummary {
  code: string;
  name: string;
  players: number;
  updatedAt: number;
}

export interface UploadResponse {
  ok: true;
  url: string;
  width?: number;
  height?: number;
}
