// Zod schemas used to validate everything clients send. They mirror types.ts (checked with `satisfies`).
import { z } from 'zod';
import type {
  Attack, Character, Drawing, FogArea, GridConfig, LightEmission, LightSource, MapNote, Template, Token, Wall,
  JournalEntry, Track, Playlist, Shape,
} from './types.ts';

const id = z.string().min(1).max(64);
const name = z.string().max(120);
const longText = z.string().max(40_000);
const color = z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'cor inválida');
const coord = z.number().finite().min(-100_000).max(100_000);
const url = z.string().max(2_000).nullable();
const feet = z.number().finite().min(0).max(10_000);

export const zAbility = z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha']);
export const zSkill = z.enum([
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight', 'intimidation',
  'investigation', 'medicine', 'nature', 'perception', 'performance', 'persuasion', 'religion', 'sleightOfHand',
  'stealth', 'survival',
]);
export const zDamageType = z.enum([
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic',
  'radiant', 'slashing', 'thunder', 'healing', 'none',
]);
export const zVisibility = z.enum(['always', 'owner', 'dm', 'hover']);

export const zGrid = z.object({
  type: z.enum(['square', 'hex-pointy', 'hex-flat', 'none']),
  size: z.number().min(10).max(500),
  offsetX: coord,
  offsetY: coord,
  units: z.number().min(0.1).max(1000),
  color,
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
  snap: z.boolean(),
  diagonals: z.enum(['5e', '5-10-5', 'euclidean']),
}) satisfies z.ZodType<GridConfig>;

export const zLightEmission = z.object({
  bright: feet,
  dim: feet,
  color,
  intensity: z.number().min(0).max(1),
  animation: z.enum(['none', 'torch', 'pulse', 'flicker', 'magic']),
}) satisfies z.ZodType<LightEmission>;

export const zHp = z.object({
  cur: z.number().int().min(-10_000).max(100_000),
  max: z.number().int().min(0).max(100_000),
  temp: z.number().int().min(0).max(100_000),
});

export const zToken = z.object({
  id,
  name,
  x: coord,
  y: coord,
  size: z.number().min(0.25).max(10),
  rotation: z.number().finite(),
  img: url,
  color,
  characterId: id.nullable(),
  monsterId: z.string().max(80).nullable(),
  ownerIds: z.array(id).max(50),
  hidden: z.boolean(),
  locked: z.boolean(),
  disposition: z.enum(['friendly', 'neutral', 'hostile', 'secret']),
  hp: zHp.nullable(),
  ac: z.number().int().min(0).max(100).nullable(),
  conditions: z.array(z.string().max(40)).max(40),
  vision: z.object({ enabled: z.boolean(), range: feet, darkvision: feet }),
  light: zLightEmission.nullable(),
  showName: zVisibility,
  showHp: zVisibility,
  elevation: z.number().finite().min(-10_000).max(10_000),
  aura: z.object({ radius: feet, color }).nullable(),
}) satisfies z.ZodType<Token>;

export const zWall = z.object({
  id,
  c: z.tuple([coord, coord, coord, coord]),
  kind: z.enum(['wall', 'door', 'window', 'invisible', 'ethereal']),
  door: z.enum(['closed', 'open', 'locked']),
  secret: z.boolean(),
}) satisfies z.ZodType<Wall>;

export const zLightSource = zLightEmission.extend({
  id,
  x: coord,
  y: coord,
  enabled: z.boolean(),
  hidden: z.boolean(),
}) satisfies z.ZodType<LightSource>;

const flatPoints = z.array(coord).max(20_000);

export const zDrawing = z.object({
  id,
  authorId: id,
  kind: z.enum(['path', 'line', 'rect', 'ellipse', 'text', 'poly']),
  points: flatPoints,
  x: coord,
  y: coord,
  w: z.number().finite().min(-100_000).max(100_000),
  h: z.number().finite().min(-100_000).max(100_000),
  text: z.string().max(500),
  stroke: color,
  strokeWidth: z.number().min(0).max(200),
  fill: color.nullable(),
  fillAlpha: z.number().min(0).max(1),
  layer: z.enum(['below', 'above']),
  gmOnly: z.boolean(),
}) satisfies z.ZodType<Drawing>;

export const zTemplate = z.object({
  id,
  authorId: id,
  kind: z.enum(['circle', 'cone', 'line', 'square', 'ring']),
  x: coord,
  y: coord,
  angle: z.number().finite(),
  size: z.number().min(1).max(1000),
  width: z.number().min(1).max(200),
  color,
  label: z.string().max(80),
  spellId: z.string().max(80).nullable(),
}) satisfies z.ZodType<Template>;

export const zNote = z.object({
  id,
  x: coord,
  y: coord,
  label: z.string().max(120),
  icon: z.string().max(40),
  journalId: id.nullable(),
  hidden: z.boolean(),
}) satisfies z.ZodType<MapNote>;

export const zShape: z.ZodType<Shape> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('rect'), x: coord, y: coord, w: z.number().min(0).max(200_000), h: z.number().min(0).max(200_000) }),
  z.object({ kind: z.literal('circle'), x: coord, y: coord, r: z.number().min(0).max(100_000) }),
  z.object({ kind: z.literal('poly'), points: z.array(coord).min(6).max(4_000) }),
]);

export const zFogArea = z.object({
  id,
  op: z.enum(['reveal', 'hide']),
  shape: zShape,
}) satisfies z.ZodType<FogArea>;

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

const zDamagePart = z.object({ formula: z.string().max(80), type: zDamageType });

export const zAttack = z.object({
  id,
  name,
  ability: z.enum(['str', 'dex', 'con', 'int', 'wis', 'cha', 'spell', 'none', 'finesse']),
  proficient: z.boolean(),
  bonus: z.number().int().min(-50).max(50),
  damage: z.array(zDamagePart).max(8),
  range: z.string().max(60),
  critOn: z.number().int().min(2).max(20),
  notes: z.string().max(2_000),
  save: z.object({ ability: zAbility, dc: z.union([z.number().int().min(0).max(50), z.literal('spell')]), half: z.boolean() }).nullable(),
}) satisfies z.ZodType<Attack>;

const slot = z.object({ max: z.number().int().min(0).max(20), used: z.number().int().min(0).max(20) });

export const zCharacter = z.object({
  id,
  kind: z.enum(['pc', 'npc']),
  ownerId: id.nullable(),
  name,
  portrait: url,
  tokenImg: url,
  race: z.string().max(80),
  background: z.string().max(80),
  alignment: z.string().max(60),
  classes: z.array(z.object({
    id: z.string().max(40), name: z.string().max(60), level: z.number().int().min(1).max(20),
    subclass: z.string().max(80), hitDie: z.number().int().min(4).max(20),
  })).max(6),
  xp: z.number().int().min(0).max(10_000_000),
  abilities: z.object({
    str: z.number().int().min(1).max(30), dex: z.number().int().min(1).max(30), con: z.number().int().min(1).max(30),
    int: z.number().int().min(1).max(30), wis: z.number().int().min(1).max(30), cha: z.number().int().min(1).max(30),
  }),
  saveProfs: z.array(zAbility).max(6),
  skills: z.partialRecord(zSkill, z.union([z.literal(0), z.literal(1), z.literal(2)])),
  jackOfAllTrades: z.boolean(),
  hp: zHp,
  hitDiceUsed: z.number().int().min(0).max(40),
  deathSaves: z.object({ success: z.number().int().min(0).max(3), fail: z.number().int().min(0).max(3) }),
  ac: z.object({ mode: z.enum(['auto', 'manual']), value: z.number().int().min(0).max(60), bonus: z.number().int().min(-20).max(20) }),
  speed: z.number().int().min(0).max(1000),
  initiativeBonus: z.number().int().min(-20).max(30),
  inspiration: z.boolean(),
  exhaustion: z.number().int().min(0).max(6),
  conditions: z.array(z.string().max(40)).max(40),
  concentration: z.string().max(80).nullable(),
  attacks: z.array(zAttack).max(60),
  spellcasting: z.object({
    ability: zAbility,
    slots: z.record(z.string().max(2), slot),
    pact: slot.extend({ level: z.number().int().min(1).max(9) }).nullable(),
    spells: z.array(z.object({
      id, ref: z.string().max(80).nullable(), name, level: z.number().int().min(0).max(9),
      prepared: z.boolean(), notes: z.string().max(4_000),
    })).max(400),
  }).nullable(),
  inventory: z.array(z.object({
    id, ref: z.string().max(80).nullable(), name, qty: z.number().int().min(0).max(1_000_000),
    weight: z.number().min(0).max(100_000), equipped: z.boolean(), attuned: z.boolean(), notes: z.string().max(4_000),
    armor: z.object({
      base: z.number().int().min(0).max(30), dexCap: z.number().int().min(0).max(10).nullable(),
      type: z.enum(['light', 'medium', 'heavy', 'shield']),
    }).nullable(),
  })).max(500),
  currency: z.object({
    pp: z.number().int().min(0).max(1e9), gp: z.number().int().min(0).max(1e9), ep: z.number().int().min(0).max(1e9),
    sp: z.number().int().min(0).max(1e9), cp: z.number().int().min(0).max(1e9),
  }),
  features: z.array(z.object({
    id, name, source: z.string().max(80), text: longText,
    uses: z.object({
      max: z.number().int().min(0).max(100), used: z.number().int().min(0).max(100),
      reset: z.enum(['short', 'long', 'dawn', 'none']),
    }).nullable(),
  })).max(200),
  proficiencies: z.object({
    armor: z.string().max(500), weapons: z.string().max(500), tools: z.string().max(500), languages: z.string().max(500),
  }),
  senses: z.object({ darkvision: feet }),
  personality: z.object({
    traits: z.string().max(4_000), ideals: z.string().max(4_000), bonds: z.string().max(4_000), flaws: z.string().max(4_000),
  }),
  backstory: longText,
  notes: longText,
  monsterId: z.string().max(80).nullable(),
  createdAt: z.number(),
  updatedAt: z.number(),
}) satisfies z.ZodType<Character>;

export const zJournal = z.object({
  id,
  title: z.string().max(200),
  body: z.string().max(200_000),
  img: url,
  folder: z.string().max(80),
  sharedWith: z.union([z.literal('all'), z.array(id).max(50)]),
  authorId: id,
  updatedAt: z.number(),
}) satisfies z.ZodType<JournalEntry>;

export const zTrack = z.object({
  id,
  name,
  src: z.string().max(2_000),
  loop: z.boolean(),
  volume: z.number().min(0).max(1),
}) satisfies z.ZodType<Track>;

export const zPlaylist = z.object({
  id,
  name,
  tracks: z.array(zTrack).max(200),
}) satisfies z.ZodType<Playlist>;

export { id as zId, name as zName, color as zColor, coord as zCoord, feet as zFeet, url as zUrl };
