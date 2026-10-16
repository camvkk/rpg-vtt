// Core domain model shared by server and client.
// Conventions:
// - World coordinates are pixels. A scene's grid defines `size` px per cell and `units` feet per cell.
// - Token x/y is the top-left of its footprint; `size` is the footprint in cells.
// - All UI-facing text is PT-BR; identifiers are English.

export type ID = string;
export type Role = 'dm' | 'player';

export interface Point {
  x: number;
  y: number;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export interface PlayerInfo {
  id: ID;
  name: string;
  role: Role;
  color: string;
  avatar: string | null;
  /** Character this player is currently playing, if any. */
  characterId: ID | null;
  joinedAt: number;
}

/** Runtime presence (not persisted). */
export interface Presence {
  playerId: ID;
  online: boolean;
  lastSeen: number;
}

// ---------------------------------------------------------------------------
// Scenes and map objects
// ---------------------------------------------------------------------------

export type GridType = 'square' | 'hex-pointy' | 'hex-flat' | 'none';
export type DiagonalRule = '5e' | '5-10-5' | 'euclidean';

export interface GridConfig {
  type: GridType;
  /** Pixels per cell. */
  size: number;
  /** Offset of the grid origin in px (to align with a map image). */
  offsetX: number;
  offsetY: number;
  /** Feet per cell. */
  units: number;
  color: string;
  opacity: number;
  visible: boolean;
  snap: boolean;
  diagonals: DiagonalRule;
}

export interface MapConfig {
  url: string | null;
  /** Scene size in px. When an image is set this matches the image size × scale. */
  width: number;
  height: number;
  scale: number;
  background: string;
}

export interface LightingConfig {
  /** 0 = full daylight, 1 = pitch black. */
  darkness: number;
  /** When true, tokens see everything within line of sight regardless of darkness. */
  globalLight: boolean;
}

export type FogMode = 'off' | 'dynamic' | 'manual';

export type Shape =
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'circle'; x: number; y: number; r: number }
  | { kind: 'poly'; points: number[] };

export interface FogArea {
  id: ID;
  /** reveal = visible to players, hide = explicitly re-covered. Applied in order. */
  op: 'reveal' | 'hide';
  shape: Shape;
}

export interface FogConfig {
  /**
   * off: players see the whole map.
   * dynamic: players see what their tokens see (walls + vision + light), explored areas dimmed.
   * manual: players see only DM-revealed areas.
   * Manual reveal areas are honoured in dynamic mode as well.
   */
  mode: FogMode;
  areas: FogArea[];
  /** Remember explored areas on each player's client. */
  exploration: boolean;
}

export type WeatherType = 'none' | 'rain' | 'storm' | 'snow' | 'fog' | 'embers' | 'ash' | 'leaves' | 'sandstorm';

export interface WeatherConfig {
  type: WeatherType;
  /** 0..1 */
  intensity: number;
  /** Wind direction in degrees (0 = right, 90 = down). */
  wind: number;
}

export type Disposition = 'friendly' | 'neutral' | 'hostile' | 'secret';
export type Visibility = 'always' | 'owner' | 'dm' | 'hover';

export type LightAnimation = 'none' | 'torch' | 'pulse' | 'flicker' | 'magic';

export interface LightEmission {
  /** Bright radius in feet. */
  bright: number;
  /** Dim radius in feet (outer). */
  dim: number;
  color: string;
  /** 0..1 strength of the color tint. */
  intensity: number;
  animation: LightAnimation;
}

export interface VisionConfig {
  enabled: boolean;
  /** Maximum sight range in feet (0 = unlimited). */
  range: number;
  /** Darkvision radius in feet. */
  darkvision: number;
}

export interface HitPoints {
  cur: number;
  max: number;
  temp: number;
}

export interface Token {
  id: ID;
  name: string;
  x: number;
  y: number;
  /** Footprint in cells (0.5 tiny, 1 small/medium, 2 large, 3 huge, 4 gargantuan). */
  size: number;
  rotation: number;
  img: string | null;
  color: string;
  /** Linked character sheet. Linked tokens read HP/AC/conditions from the sheet. */
  characterId: ID | null;
  /** Compendium monster this token was created from. */
  monsterId: string | null;
  /** Players allowed to control this token. DM always can. */
  ownerIds: ID[];
  hidden: boolean;
  locked: boolean;
  disposition: Disposition;
  /** Unlinked tokens keep their own HP/AC. */
  hp: HitPoints | null;
  ac: number | null;
  conditions: string[];
  vision: VisionConfig;
  light: LightEmission | null;
  showName: Visibility;
  showHp: Visibility;
  elevation: number;
  /** Aura ring in feet (0 = none), e.g. Paladin aura. */
  aura: { radius: number; color: string } | null;
  /** Set by the server projection when the viewer only gets a bucketed HP percentage (hp.max = 100). */
  hpMasked?: boolean;
}

export type WallKind = 'wall' | 'door' | 'window' | 'invisible' | 'ethereal';
export type DoorState = 'closed' | 'open' | 'locked';

export interface Wall {
  id: ID;
  /** Flat segment [x1, y1, x2, y2]. */
  c: [number, number, number, number];
  /**
   * wall: blocks sight + movement + light
   * door: like wall while closed/locked
   * window: blocks movement only
   * invisible: blocks movement only, never drawn for players
   * ethereal: blocks sight/light only
   */
  kind: WallKind;
  door: DoorState;
  /** Secret doors are shown to players as plain walls. */
  secret: boolean;
}

export interface LightSource extends LightEmission {
  id: ID;
  x: number;
  y: number;
  enabled: boolean;
  /** Hidden lights still illuminate, the DM just doesn't want the icon visible. */
  hidden: boolean;
}

export type DrawingKind = 'path' | 'line' | 'rect' | 'ellipse' | 'text' | 'poly';

export interface Drawing {
  id: ID;
  authorId: ID;
  kind: DrawingKind;
  /** Flat points (path/line/poly) relative to x,y. */
  points: number[];
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
  fillAlpha: number;
  /** below = under tokens, above = above tokens. */
  layer: 'below' | 'above';
  /** Only the DM sees it. */
  gmOnly: boolean;
}

export type TemplateKind = 'circle' | 'cone' | 'line' | 'square' | 'ring';

export interface Template {
  id: ID;
  authorId: ID;
  kind: TemplateKind;
  /** Origin in px. Circle/ring/square: center. Cone/line: apex/start. */
  x: number;
  y: number;
  /** Direction in degrees (cone/line). */
  angle: number;
  /** Size in feet: radius for circle/ring, length for cone/line, side for square. */
  size: number;
  /** Width in feet for line templates. */
  width: number;
  color: string;
  label: string;
  /** Compendium spell id when created from a spell. */
  spellId: string | null;
}

export interface MapNote {
  id: ID;
  x: number;
  y: number;
  label: string;
  icon: string;
  journalId: ID | null;
  hidden: boolean;
}

export interface Scene {
  id: ID;
  name: string;
  /** DM-only prep scene. */
  hidden: boolean;
  map: MapConfig;
  grid: GridConfig;
  lighting: LightingConfig;
  fog: FogConfig;
  weather: WeatherConfig;
  /** Ambience preset that auto-plays when the scene is activated (optional). */
  ambience: string | null;
  tokens: Record<ID, Token>;
  walls: Record<ID, Wall>;
  lights: Record<ID, LightSource>;
  drawings: Record<ID, Drawing>;
  templates: Record<ID, Template>;
  notes: Record<ID, MapNote>;
  /** Initial camera position for players. */
  view: { x: number; y: number; zoom: number } | null;
}

// ---------------------------------------------------------------------------
// Characters (D&D 5e)
// ---------------------------------------------------------------------------

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export type AbilityScores = Record<Ability, number>;

export type SkillId =
  | 'acrobatics' | 'animalHandling' | 'arcana' | 'athletics' | 'deception' | 'history'
  | 'insight' | 'intimidation' | 'investigation' | 'medicine' | 'nature' | 'perception'
  | 'performance' | 'persuasion' | 'religion' | 'sleightOfHand' | 'stealth' | 'survival';

/** 0 = none, 0.5 = half (Jack of All Trades applied separately), 1 = proficient, 2 = expertise. */
export type ProfLevel = 0 | 1 | 2;

export type DamageType =
  | 'acid' | 'bludgeoning' | 'cold' | 'fire' | 'force' | 'lightning' | 'necrotic'
  | 'piercing' | 'poison' | 'psychic' | 'radiant' | 'slashing' | 'thunder' | 'healing' | 'none';

export interface DamagePart {
  /** Dice formula, may reference @mod (e.g. "1d8+@mod"). */
  formula: string;
  type: DamageType;
}

export interface Attack {
  id: ID;
  name: string;
  /** Ability used for to-hit and damage. 'spell' uses spellcasting ability. 'none' adds nothing. */
  ability: Ability | 'spell' | 'none' | 'finesse';
  proficient: boolean;
  /** Extra to-hit bonus (magic weapon, fighting style...). */
  bonus: number;
  damage: DamagePart[];
  range: string;
  /** Crit range threshold (20 normally, 19 for Champion). */
  critOn: number;
  notes: string;
  /** If set, this is a save-based attack (no attack roll): targets roll this save. */
  save: { ability: Ability; dc: number | 'spell'; half: boolean } | null;
}

export interface ClassLevel {
  /** Compendium class id (e.g. "fighter") or custom. */
  id: string;
  name: string;
  level: number;
  subclass: string;
  hitDie: number;
}

export interface SpellSlot {
  max: number;
  used: number;
}

export interface KnownSpell {
  id: ID;
  /** Compendium spell id, or null for custom. */
  ref: string | null;
  name: string;
  level: number;
  prepared: boolean;
  /** Custom notes / overrides. */
  notes: string;
}

export interface Spellcasting {
  ability: Ability;
  slots: Record<string, SpellSlot>; // keys "1".."9"
  pact: SpellSlot & { level: number } | null;
  spells: KnownSpell[];
}

export interface InventoryItem {
  id: ID;
  ref: string | null;
  name: string;
  qty: number;
  weight: number;
  equipped: boolean;
  attuned: boolean;
  notes: string;
  /** Armor info so AC can be auto-computed. */
  armor: { base: number; dexCap: number | null; type: 'light' | 'medium' | 'heavy' | 'shield' } | null;
}

export interface Feature {
  id: ID;
  name: string;
  source: string;
  text: string;
  uses: { max: number; used: number; reset: 'short' | 'long' | 'dawn' | 'none' } | null;
}

export interface Currency {
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

export interface Character {
  id: ID;
  kind: 'pc' | 'npc';
  /** Player who owns this sheet (PCs). NPC sheets are DM-only unless owned. */
  ownerId: ID | null;
  name: string;
  portrait: string | null;
  tokenImg: string | null;
  race: string;
  background: string;
  alignment: string;
  classes: ClassLevel[];
  xp: number;
  abilities: AbilityScores;
  saveProfs: Ability[];
  skills: Partial<Record<SkillId, ProfLevel>>;
  jackOfAllTrades: boolean;
  hp: HitPoints;
  hitDiceUsed: number;
  deathSaves: { success: number; fail: number };
  ac: { mode: 'auto' | 'manual'; value: number; bonus: number };
  speed: number;
  initiativeBonus: number;
  inspiration: boolean;
  exhaustion: number;
  conditions: string[];
  concentration: string | null;
  attacks: Attack[];
  spellcasting: Spellcasting | null;
  inventory: InventoryItem[];
  currency: Currency;
  features: Feature[];
  proficiencies: { armor: string; weapons: string; tools: string; languages: string };
  senses: { darkvision: number };
  personality: { traits: string; ideals: string; bonds: string; flaws: string };
  backstory: string;
  notes: string;
  /** For NPCs created from a compendium monster. */
  monsterId: string | null;
  /** Values for the campaign's custom system (null until the sheet is used with one). */
  custom: CustomSheet | null;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Custom systems (homebrew rules imported by the DM, parsed by the AI)
// ---------------------------------------------------------------------------
// Keys are ASCII identifiers ([a-z][a-z0-9_]*) so they can be used as dice variables: a stat "forca"
// is available as @forca in any formula of the system. Names/descriptions keep the document's language.

/** How a stat value becomes the modifier used in rolls (@atr / @<stat>). */
export type CustomModifierRule = 'value' | 'dnd' | 'half';

export interface CustomStat {
  key: string;
  name: string;
  /** Abbreviation shown on the sheet (e.g. "FOR"). */
  short: string;
  description: string;
  min: number;
  max: number;
  default: number;
}

export interface CustomSkill {
  key: string;
  name: string;
  /** Stat key used for the roll, null when the skill stands alone. */
  stat: string | null;
  description: string;
}

/** Extra tracked pools besides hit points (mana, sanity, stress...). */
export interface CustomResource {
  key: string;
  name: string;
  /** Starting maximum for new sheets. */
  max: number;
  description: string;
}

export interface CustomRace {
  key: string;
  name: string;
  description: string;
  /** Stat key → bonus added to the base value. */
  statBonuses: Record<string, number>;
  traits: string[];
}

export interface CustomClass {
  key: string;
  name: string;
  description: string;
  /** Hit die faces (0 = the system has no hit dice). */
  hitDie: number;
  primaryStats: string[];
  /** Skill keys the class favours. */
  skills: string[];
  features: string[];
}

/** Equipment, powers/spells and special mechanics share one shape: a named entry with an optional roll. */
export interface CustomEntry {
  key: string;
  name: string;
  /** Category (weapon, armor...) for items, level/circle for powers, empty otherwise. */
  tag: string;
  /** Cost / properties line (e.g. "2 PM", "versátil, pesada"). */
  detail: string;
  description: string;
  /** Dice formula with @variables, or null when nothing is rolled. */
  formula: string | null;
}

export interface CustomRule {
  name: string;
  description: string;
}

export interface CustomSystem {
  name: string;
  description: string;
  modifier: CustomModifierRule;
  /** Formula for stat checks. Variables: @atr (modifier), @valor (value), @nivel, @<stat>. */
  checkFormula: string;
  /** Formula for skill checks: same variables plus @pericia (the skill's value on the sheet). */
  skillFormula: string;
  /** Labels for the two numbers tokens use. */
  hpName: string;
  defenseName: string;
  stats: CustomStat[];
  skills: CustomSkill[];
  resources: CustomResource[];
  races: CustomRace[];
  classes: CustomClass[];
  equipment: CustomEntry[];
  powers: CustomEntry[];
  mechanics: CustomEntry[];
  rules: CustomRule[];
  /** Names of the documents it was imported from. */
  sources: string[];
  importedAt: number;
}

export interface CustomSheet {
  /** Base stat values (race bonuses are added on top). */
  stats: Record<string, number>;
  /** Skill values (ranks / bonus), used as @pericia. */
  skills: Record<string, number>;
  resources: Record<string, { cur: number; max: number }>;
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------

export interface Combatant {
  id: ID;
  tokenId: ID | null;
  characterId: ID | null;
  name: string;
  img: string | null;
  initiative: number | null;
  /** Tie-breaker / initiative modifier. */
  initBonus: number;
  hidden: boolean;
  defeated: boolean;
  /** Player that controls the combatant (for "your turn" prompts). */
  ownerIds: ID[];
}

export interface ConditionTimer {
  id: ID;
  /** Token or character the condition is on. */
  targetTokenId: ID | null;
  condition: string;
  /** Remaining rounds. Decremented at the start of the source's turn. */
  rounds: number;
  sourceCombatantId: ID | null;
}

export interface Combat {
  id: ID;
  sceneId: ID;
  started: boolean;
  round: number;
  /** Index into the sorted combatant order. */
  turn: number;
  combatants: Combatant[];
  timers: ConditionTimer[];
}

// ---------------------------------------------------------------------------
// Journal / handouts
// ---------------------------------------------------------------------------

export interface JournalEntry {
  id: ID;
  title: string;
  /** Markdown body. */
  body: string;
  img: string | null;
  folder: string;
  /** 'all' = every player, array = specific players, [] = DM only. */
  sharedWith: 'all' | ID[];
  authorId: ID;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Audio
// ---------------------------------------------------------------------------

export interface Track {
  id: ID;
  name: string;
  /** URL to an audio file, or "ambience:<preset>" for procedural ambiences. */
  src: string;
  loop: boolean;
  volume: number;
}

export interface Playlist {
  id: ID;
  name: string;
  tracks: Track[];
}

export interface AudioState {
  playlists: Record<ID, Playlist>;
  /** Currently playing music track (one at a time). */
  music: { trackId: ID; playlistId: ID | null; src: string; name: string; startedAt: number; loop: boolean; volume: number } | null;
  /** Ambience layers mixed under music, keyed by preset id. */
  ambience: Record<string, { volume: number }>;
  masterVolume: number;
}

// ---------------------------------------------------------------------------
// Campaign
// ---------------------------------------------------------------------------

export interface CampaignSettings {
  /** Players may draw on the map. */
  playerDrawing: boolean;
  /** Players may create area templates. */
  playerTemplates: boolean;
  /** Walls block player token movement. */
  wallsBlockMovement: boolean;
  /** Show NPC HP to players as a descriptive status instead of numbers. */
  hpStatusForPlayers: boolean;
  /** Automatically roll initiative for NPCs when combat starts. */
  autoRollNpcInitiative: boolean;
  /** Roll 3D dice animations. */
  dice3d: boolean;
  /** Rules used by character sheets: D&D 5e or the DM's imported system (CampaignState.customSystem). */
  system: 'dnd5e' | 'custom';
}

export interface CampaignState {
  version: number;
  id: ID;
  code: string;
  name: string;
  createdAt: number;
  players: Record<ID, PlayerInfo>;
  scenes: Record<ID, Scene>;
  sceneOrder: ID[];
  /** Scene that players are on. */
  activeSceneId: ID | null;
  characters: Record<ID, Character>;
  combat: Combat | null;
  journal: Record<ID, JournalEntry>;
  audio: AudioState;
  settings: CampaignSettings;
  /** Homebrew system imported by the DM (kept when switching back to 5e, cleared explicitly). */
  customSystem: CustomSystem | null;
}

// ---------------------------------------------------------------------------
// Dice + chat
// ---------------------------------------------------------------------------

export interface DieResult {
  sides: number;
  value: number;
  /** Discarded by keep/drop. */
  dropped: boolean;
  /** Produced by an explosion. */
  exploded: boolean;
  /** Rerolled away (the replacement follows). */
  rerolled: boolean;
}

export interface RollTerm {
  kind: 'dice' | 'number' | 'op' | 'paren';
  /** Source text of the term (e.g. "4d6kh3", "+", "5"). */
  text: string;
  dice?: DieResult[];
  value?: number;
  /** Optional flavor tag, e.g. "fogo" in 2d6[fogo]. */
  flavor?: string;
}

export interface RollResult {
  formula: string;
  terms: RollTerm[];
  total: number;
  /** True when the first d20 (kept) is a natural 20 / 1. */
  crit: boolean;
  fumble: boolean;
  /** d20 mode applied. */
  mode: 'normal' | 'adv' | 'dis';
}

export type ChatKind = 'text' | 'roll' | 'emote' | 'ooc' | 'narration' | 'system' | 'card';

export interface CardTarget {
  tokenId: ID | null;
  name: string;
  ac: number | null;
  /** Attack cards: hit result. Save cards: success. */
  outcome: 'hit' | 'miss' | 'crit' | 'success' | 'fail' | 'pending' | null;
  roll: RollResult | null;
  /** Damage applied so far, for the DM's reference. */
  applied: number | null;
}

export type ChatCard =
  | {
      type: 'attack';
      actorName: string;
      actorTokenId: ID | null;
      title: string;
      subtitle: string;
      toHit: RollResult | null;
      damage: { roll: RollResult; type: DamageType }[];
      targets: CardTarget[];
      save: { ability: Ability; dc: number; half: boolean } | null;
      description: string;
    }
  | {
      type: 'check';
      actorName: string;
      title: string;
      roll: RollResult;
      dc: number | null;
    }
  | {
      type: 'saveRequest';
      title: string;
      ability: Ability;
      dc: number;
      damage: { roll: RollResult; type: DamageType } | null;
      half: boolean;
      targets: CardTarget[];
    }
  | {
      type: 'spell';
      actorName: string;
      spellId: string | null;
      title: string;
      level: number;
      description: string;
    }
  | {
      type: 'deathSave';
      actorName: string;
      roll: RollResult;
      success: number;
      fail: number;
      result: 'success' | 'fail' | 'crit' | 'fumble';
    };

export interface ChatMessage {
  id: ID;
  ts: number;
  authorId: ID | null;
  authorName: string;
  /** Character/token speaking, for IC messages. */
  speaker: string | null;
  kind: ChatKind;
  text: string;
  roll: RollResult | null;
  card: ChatCard | null;
  /** Whisper recipients (player ids). Empty = public. */
  whisperTo: ID[];
  /** Only the DM (and author) can see it. */
  gmOnly: boolean;
  /** Secret rolls show to players as "rolagem secreta". */
  blind: boolean;
}
