// Types for the D&D 5e SRD 5.1 compendium (PT-BR). Content is CC-BY-4.0 (SRD 5.1).
import type { Ability, AbilityScores, DamagePart, SkillId, TemplateKind } from '../types.ts';

export type CreatureSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gargantuan';

export interface NamedText {
  name: string;
  text: string;
}

export interface MonsterAction {
  name: string;
  /** Full rules text in PT-BR. */
  text: string;
  /** Structured attack so the VTT can roll it with one click. */
  attack?: {
    kind: 'melee' | 'ranged' | 'melee-spell' | 'ranged-spell';
    bonus: number;
    /** e.g. "1,5 m" / "5 pés" / "24/96 m" — keep feet as in SRD: "5 ft" → "1,5 m (5 pés)" not required; use "5 pés". */
    reach: string;
    damage: DamagePart[];
  };
  /** Structured saving throw effect (breath weapons, etc.). */
  save?: {
    ability: Ability;
    dc: number;
    damage?: DamagePart[];
    half?: boolean;
    area?: { kind: TemplateKind; size: number; width?: number };
  };
  /** e.g. "5-6" for Recarga 5–6, "1/dia". */
  recharge?: string;
}

export interface Monster {
  /** kebab-case English id, e.g. "goblin", "adult-red-dragon". */
  id: string;
  name: string;
  nameEn: string;
  size: CreatureSize;
  /** PT-BR, e.g. "Humanoide (goblinoide)". */
  type: string;
  alignment: string;
  ac: number;
  acNote: string;
  hp: number;
  hpFormula: string;
  /** PT-BR string, e.g. "9 m (30 pés), escalada 9 m". Prefer feet: "30 pés, escalada 30 pés". */
  speed: string;
  /** Walking speed in feet, for movement measuring. */
  speedFt: number;
  abilities: AbilityScores;
  saves: Partial<Record<Ability, number>>;
  skills: Partial<Record<SkillId, number>>;
  vulnerabilities: string;
  resistances: string;
  immunities: string;
  conditionImmunities: string;
  senses: string;
  darkvision: number;
  passivePerception: number;
  languages: string;
  /** Challenge rating as a number (0.125, 0.25, 0.5, 1..30). */
  cr: number;
  xp: number;
  traits: NamedText[];
  actions: MonsterAction[];
  bonusActions: MonsterAction[];
  reactions: NamedText[];
  legendary: NamedText[];
  legendaryCount: number;
  /** Habitat / tags in PT-BR lowercase, e.g. ["floresta", "subterrâneo"]. */
  tags: string[];
}

export type SpellSchool =
  | 'abjuration' | 'conjuration' | 'divination' | 'enchantment'
  | 'evocation' | 'illusion' | 'necromancy' | 'transmutation';

export interface SpellData {
  id: string;
  name: string;
  nameEn: string;
  /** 0 = truque. */
  level: number;
  school: SpellSchool;
  castingTime: string;
  range: string;
  components: { v: boolean; s: boolean; m: string | null };
  duration: string;
  concentration: boolean;
  ritual: boolean;
  /** Class ids that can learn it (e.g. ["wizard", "sorcerer"]). */
  classes: string[];
  description: string;
  higherLevels: string;
  /** Structured effects so the VTT can automate. */
  attack?: 'melee' | 'ranged';
  save?: Ability;
  /** Half damage on successful save. */
  half?: boolean;
  damage?: DamagePart[];
  /** Extra dice per slot level above the base level, e.g. "1d6". Cantrips scale at 5/11/17. */
  upcast?: string;
  heal?: string;
  area?: { kind: TemplateKind; size: number; width?: number };
}

export type ItemCategory = 'weapon' | 'armor' | 'shield' | 'gear' | 'tool' | 'pack' | 'potion' | 'ammunition' | 'focus' | 'magic' | 'mount' | 'treasure';

export interface ItemData {
  id: string;
  name: string;
  nameEn: string;
  category: ItemCategory;
  /** e.g. "15 po". */
  cost: string;
  /** In pounds (lb) as in SRD. */
  weight: number;
  description: string;
  weapon?: {
    category: 'simple' | 'martial';
    type: 'melee' | 'ranged';
    damage: DamagePart;
    versatile?: string;
    /** PT-BR property names: "acuidade", "leve", "arremesso", "duas mãos", "pesada", "alcance", "munição", "recarga", "especial", "versátil". */
    properties: string[];
    range?: string;
  };
  armor?: {
    type: 'light' | 'medium' | 'heavy' | 'shield';
    base: number;
    dexCap: number | null;
    strength?: number;
    stealthDisadvantage?: boolean;
  };
  rarity?: 'comum' | 'incomum' | 'raro' | 'muito raro' | 'lendário' | 'artefato';
  attunement?: boolean;
}

export interface ConditionData {
  /** English id used across the app: blinded, charmed, deafened, exhaustion, frightened, grappled,
   * incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious.
   * Plus VTT helper markers: concentrating, dead, bleeding, blessed, hasted, marked, hidden, raging, inspired, dodging. */
  id: string;
  name: string;
  /** lucide-react icon name (PascalCase), e.g. "EyeOff". */
  icon: string;
  /** Hex color for token badges. */
  color: string;
  /** PT-BR rules bullets. */
  rules: string[];
  /** True for the 15 official SRD conditions. */
  official: boolean;
}

export interface RaceData {
  id: string;
  name: string;
  description: string;
  size: CreatureSize;
  speed: number;
  darkvision: number;
  abilityBonuses: Partial<AbilityScores>;
  /** e.g. Half-elf: +1 to two other abilities. */
  choiceBonuses: { count: number; amount: number } | null;
  traits: NamedText[];
  languages: string;
  skillProfs: SkillId[];
  /** Number of extra skills of choice (half-elf 2, human variant 1...). */
  skillChoices: number;
  subraces: Array<Omit<RaceData, 'subraces' | 'size' | 'description'> & { description: string }>;
}

export interface ClassFeature {
  level: number;
  name: string;
  text: string;
  /** Resource uses, if any (e.g. Second Wind 1/short). */
  uses?: { max: number | string; reset: 'short' | 'long' };
}

export interface ClassData {
  id: string;
  name: string;
  description: string;
  hitDie: number;
  primaryAbility: Ability[];
  saves: Ability[];
  armorProfs: string;
  weaponProfs: string;
  toolProfs: string;
  skillChoices: { count: number; from: SkillId[] };
  spellcasting: { ability: Ability; progression: 'full' | 'half' | 'third' | 'pact'; prepares: boolean } | null;
  features: ClassFeature[];
  subclassLevel: number;
  subclassLabel: string;
  subclasses: Array<{ id: string; name: string; description: string; features: ClassFeature[] }>;
  /** Starting equipment choices, PT-BR, each inner array is "choose one". */
  startingEquipment: string[][];
  /** Starting gold dice for "buy your own" option, e.g. "5d4×10". */
  startingGold: string;
}

export interface BackgroundData {
  id: string;
  name: string;
  description: string;
  skillProfs: SkillId[];
  toolProfs: string;
  languages: string;
  equipment: string;
  feature: NamedText;
}
