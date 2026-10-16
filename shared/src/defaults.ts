import type {
  AudioState, CampaignSettings, CampaignState, Character, GridConfig, ID, LightEmission, Scene, Token,
} from './types.ts';
import { newId } from './util.ts';

export const STATE_VERSION = 2;

export const DEFAULT_GRID: GridConfig = {
  type: 'square',
  size: 70,
  offsetX: 0,
  offsetY: 0,
  units: 5,
  color: '#000000',
  opacity: 0.25,
  visible: true,
  snap: true,
  diagonals: '5e',
};

export const DEFAULT_SETTINGS: CampaignSettings = {
  playerDrawing: true,
  playerTemplates: true,
  wallsBlockMovement: true,
  hpStatusForPlayers: true,
  autoRollNpcInitiative: true,
  dice3d: true,
  system: 'dnd5e',
};

export const DEFAULT_AUDIO: AudioState = {
  playlists: {},
  music: null,
  ambience: {},
  masterVolume: 0.8,
};

export const LIGHT_PRESETS: Record<string, { name: string; light: LightEmission }> = {
  candle: { name: 'Vela', light: { bright: 5, dim: 10, color: '#ffb35c', intensity: 0.5, animation: 'flicker' } },
  torch: { name: 'Tocha', light: { bright: 20, dim: 40, color: '#ff9b3d', intensity: 0.55, animation: 'torch' } },
  lamp: { name: 'Lampião', light: { bright: 15, dim: 45, color: '#ffc46b', intensity: 0.45, animation: 'flicker' } },
  hooded: { name: 'Lanterna furta-fogo', light: { bright: 30, dim: 60, color: '#ffd28a', intensity: 0.4, animation: 'none' } },
  light: { name: 'Magia Luz', light: { bright: 20, dim: 40, color: '#fff3d6', intensity: 0.3, animation: 'none' } },
  daylight: { name: 'Luz do Dia (magia)', light: { bright: 60, dim: 120, color: '#ffffff', intensity: 0.2, animation: 'none' } },
  moonlight: { name: 'Luar', light: { bright: 0, dim: 30, color: '#9db8ff', intensity: 0.5, animation: 'none' } },
  arcane: { name: 'Brilho arcano', light: { bright: 10, dim: 20, color: '#a78bfa', intensity: 0.7, animation: 'magic' } },
  hellfire: { name: 'Chama infernal', light: { bright: 10, dim: 25, color: '#ff3b2f', intensity: 0.75, animation: 'torch' } },
};

export function createScene(name: string, partial: Partial<Scene> = {}): Scene {
  return {
    id: newId(),
    name,
    hidden: false,
    map: { url: null, width: 30 * 70, height: 20 * 70, scale: 1, background: '#16141c' },
    grid: { ...DEFAULT_GRID },
    lighting: { darkness: 0, globalLight: true },
    fog: { mode: 'off', areas: [], exploration: true },
    weather: { type: 'none', intensity: 0.5, wind: 100 },
    ambience: null,
    tokens: {},
    walls: {},
    lights: {},
    drawings: {},
    templates: {},
    notes: {},
    view: null,
    ...partial,
  };
}

export function createToken(partial: Partial<Token> & { name: string; x: number; y: number }): Token {
  return {
    id: newId(),
    size: 1,
    rotation: 0,
    img: null,
    color: '#8b5cf6',
    characterId: null,
    monsterId: null,
    ownerIds: [],
    hidden: false,
    locked: false,
    disposition: 'hostile',
    hp: null,
    ac: null,
    conditions: [],
    vision: { enabled: false, range: 0, darkvision: 0 },
    light: null,
    showName: 'hover',
    showHp: 'owner',
    elevation: 0,
    aura: null,
    ...partial,
  };
}

export function createCharacter(partial: Partial<Character> & { name: string }): Character {
  const now = Date.now();
  return {
    id: newId(),
    kind: 'pc',
    ownerId: null,
    portrait: null,
    tokenImg: null,
    race: '',
    background: '',
    alignment: '',
    classes: [],
    xp: 0,
    abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    saveProfs: [],
    skills: {},
    jackOfAllTrades: false,
    hp: { cur: 10, max: 10, temp: 0 },
    hitDiceUsed: 0,
    deathSaves: { success: 0, fail: 0 },
    ac: { mode: 'auto', value: 10, bonus: 0 },
    speed: 30,
    initiativeBonus: 0,
    inspiration: false,
    exhaustion: 0,
    conditions: [],
    concentration: null,
    attacks: [],
    spellcasting: null,
    inventory: [],
    currency: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
    features: [],
    proficiencies: { armor: '', weapons: '', tools: '', languages: 'Comum' },
    senses: { darkvision: 0 },
    personality: { traits: '', ideals: '', bonds: '', flaws: '' },
    backstory: '',
    notes: '',
    monsterId: null,
    custom: null,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export const BUILTIN_MAPS: { id: string; name: string; url: string; width: number; height: number; gridSize: number; ambience: string; darkness: number }[] = [
  { id: 'tavern', name: 'Taverna do Javali Dourado', url: '/maps/builtin-tavern.jpg', width: 1656, height: 2160, gridSize: 72, ambience: 'tavern', darkness: 0.1 },
  { id: 'dungeon', name: 'Cripta das Sombras', url: '/maps/builtin-dungeon.jpg', width: 3080, height: 4620, gridSize: 140, ambience: 'crypt', darkness: 0.8 },
  { id: 'forest', name: 'Floresta ao Luar', url: '/maps/builtin-forest.jpg', width: 1584, height: 2376, gridSize: 72, ambience: 'night', darkness: 0.55 },
];

export function sceneFromBuiltin(id: string): Scene | null {
  const b = BUILTIN_MAPS.find((m) => m.id === id);
  if (!b) return null;
  return createScene(b.name, {
    map: { url: b.url, width: b.width, height: b.height, scale: 1, background: '#0b0a0f' },
    grid: { ...DEFAULT_GRID, size: b.gridSize, opacity: 0.12 },
    lighting: { darkness: b.darkness, globalLight: b.darkness < 0.3 },
    fog: { mode: b.darkness >= 0.3 ? 'dynamic' : 'off', areas: [], exploration: true },
    ambience: b.ambience,
  });
}

export function createCampaign(opts: { id: ID; code: string; name: string }): CampaignState {
  const scene = createScene('Primeira Cena');
  return {
    version: STATE_VERSION,
    id: opts.id,
    code: opts.code,
    name: opts.name,
    createdAt: Date.now(),
    players: {},
    scenes: { [scene.id]: scene },
    sceneOrder: [scene.id],
    activeSceneId: scene.id,
    characters: {},
    combat: null,
    journal: {},
    audio: structuredClone(DEFAULT_AUDIO),
    settings: { ...DEFAULT_SETTINGS },
    customSystem: null,
  };
}
