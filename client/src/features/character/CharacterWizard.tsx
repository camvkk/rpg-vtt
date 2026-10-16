// Character creation wizard (D&D 5e, level 1): identity → race → class → background → abilities → skills →
// equipment → spells (casters) → review. Builds a complete sheet and creates it on the server.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Check, Coins, Dices, Feather, Footprints, Heart, ImagePlus, MapPin, Moon, Package,
  RefreshCw, ScrollText, Shield, Sparkles, Star, Swords, User, WandSparkles, X,
} from 'lucide-react';
import type {
  Ability, AbilityScores, Attack, Character, Feature, ID, InventoryItem, KnownSpell, ProfLevel, SkillId,
} from '@shared/types.ts';
import type { BackgroundData, ClassData, ItemData, RaceData, SpellData } from '@shared/data5e/types.ts';
import {
  ABILITY_LIST, ABILITY_NAME, ABILITY_SHORT, attackAbilityMod, attackToHit, characterVars, computeStats, mod, resolveFormula,
  SKILL_NAME,
} from '@shared/rules5e.ts';
import { RACES, RACES_BY_ID, resolveRace, type ResolvedRace } from '@shared/data5e/races.ts';
import { CLASSES, CLASSES_BY_ID, classFeaturesUpTo } from '@shared/data5e/classes.ts';
import { BACKGROUNDS, BACKGROUNDS_BY_ID } from '@shared/data5e/backgrounds.ts';
import { ITEMS } from '@shared/data5e/items.ts';
import { SPELLS_BY_ID, spellsForClass } from '@shared/data5e/spells/index.ts';
import { ALIGNMENTS, SKILL_IDS } from '@shared/data5e/skills.ts';
import { CANTRIPS_KNOWN, POINT_BUY, SPELLS_KNOWN, STANDARD_ARRAY, spellSlotsFor } from '@shared/data5e/tables.ts';
import { createCharacter } from '@shared/defaults.ts';
import { roll as localRoll } from '@shared/dice.ts';
import { assetUrl } from '../../net/api.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useUi } from '../../store/ui.ts';
import { Button, confirmDialog, IconButton, Modal, Segmented, Spinner, toast } from '../../ui/index.tsx';
import {
  anyOptions, buildItemIndex, featureFrom, inventoryFromItem, parseEquipment, slotsFor, weaponAttack, weaponProficient,
  type EquipEntry,
} from './build.ts';
import { norm, placeOnMap, signed, uid, uploadPortrait } from './common.tsx';
import './character.css';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

type Method = 'standard' | 'pointbuy' | 'roll';
type StepId = 'identity' | 'race' | 'class' | 'background' | 'abilities' | 'skills' | 'equipment' | 'spells' | 'review';

interface WizardState {
  name: string;
  portrait: string | null;
  alignment: string;
  kind: 'pc' | 'npc';
  ownerId: ID | null;
  raceId: string | null;
  subraceId: string | null;
  raceBonus: Ability[];
  classId: string | null;
  subclassId: string | null;
  backgroundId: string | null;
  method: Method;
  standard: Partial<Record<Ability, number>>;
  pointbuy: Record<Ability, number>;
  rolls: (number | null)[];
  rollAssign: Partial<Record<Ability, number>>;
  classSkills: SkillId[];
  raceSkills: SkillId[];
  equipMode: 'kit' | 'gold';
  equipChoice: number[];
  equipAny: Record<string, string>;
  gold: number | null;
  cantrips: string[];
  spells: string[];
  prepared: string[];
}

const INITIAL: WizardState = {
  name: '',
  portrait: null,
  alignment: '',
  kind: 'pc',
  ownerId: null,
  raceId: null,
  subraceId: null,
  raceBonus: [],
  classId: null,
  subclassId: null,
  backgroundId: null,
  method: 'standard',
  standard: {},
  pointbuy: { str: 8, dex: 8, con: 8, int: 8, wis: 8, cha: 8 },
  rolls: [null, null, null, null, null, null],
  rollAssign: {},
  classSkills: [],
  raceSkills: [],
  equipMode: 'kit',
  equipChoice: [],
  equipAny: {},
  gold: null,
  cantrips: [],
  spells: [],
  prepared: [],
};

type SetState = (patch: Partial<WizardState> | ((s: WizardState) => Partial<WizardState>)) => void;

interface SpellRules {
  cantrips: number;
  spells: number;
  mode: 'known' | 'prepared' | 'spellbook';
  prepared: number;
}

interface EquipOption {
  text: string;
  entries: EquipEntry[];
}

interface Derived {
  raceData: RaceData | null;
  race: ResolvedRace | null;
  cls: ClassData | null;
  bg: BackgroundData | null;
  base: Record<Ability, number | null>;
  bonus: Record<Ability, number>;
  final: Record<Ability, number | null>;
  mods: Record<Ability, number>;
  pointsLeft: number;
  fixedSkills: { skill: SkillId; from: string }[];
  classSkillOptions: SkillId[];
  classSkillNeed: number;
  raceSkillNeed: number;
  spellRules: SpellRules | null;
  equipGroups: EquipOption[][];
  bgEquip: EquipEntry[];
}

const ITEM_INDEX = buildItemIndex(ITEMS);
const ITEMS_BY_ID_LOCAL = new Map(ITEMS.map((i) => [i.id, i]));

function abilityPriority(cls: ClassData | null): Ability[] {
  const order: Ability[] = [...(cls?.primaryAbility ?? []), 'con', 'dex', 'wis', 'str', 'cha', 'int'];
  return order.filter((a, i) => order.indexOf(a) === i);
}

function spellRulesFor(cls: ClassData | null, mods: Record<Ability, number>): SpellRules | null {
  if (!cls?.spellcasting) return null;
  const cantrips = CANTRIPS_KNOWN[cls.id]?.[1] ?? 0;
  const abilityMod = mods[cls.spellcasting.ability];
  if (cls.id === 'wizard') return { cantrips, spells: 6, mode: 'spellbook', prepared: Math.max(1, abilityMod + 1) };
  const firstSlots = spellSlotsFor([{ id: cls.id, level: 1 }], CLASSES);
  const hasSlots = Object.keys(firstSlots.slots).length > 0 || !!firstSlots.pact;
  if (cls.spellcasting.prepares) {
    if (!hasSlots) return cantrips ? { cantrips, spells: 0, mode: 'prepared', prepared: 0 } : null;
    const n = Math.max(1, abilityMod + 1);
    return { cantrips, spells: n, mode: 'prepared', prepared: n };
  }
  const known = hasSlots ? SPELLS_KNOWN[cls.id]?.[1] ?? 0 : 0;
  if (!cantrips && !known) return null;
  return { cantrips, spells: known, mode: 'known', prepared: known };
}

function derive(st: WizardState): Derived {
  const raceData = st.raceId ? RACES_BY_ID[st.raceId] ?? null : null;
  const race = st.raceId ? resolveRace(st.raceId, st.subraceId) : null;
  const cls = st.classId ? CLASSES_BY_ID[st.classId] ?? null : null;
  const bg = st.backgroundId ? BACKGROUNDS_BY_ID[st.backgroundId] ?? null : null;

  const base = {} as Record<Ability, number | null>;
  for (const a of ABILITY_LIST) {
    if (st.method === 'standard') base[a] = st.standard[a] ?? null;
    else if (st.method === 'pointbuy') base[a] = st.pointbuy[a];
    else {
      const idx = st.rollAssign[a];
      base[a] = idx === undefined ? null : st.rolls[idx] ?? null;
    }
  }
  const bonus = {} as Record<Ability, number>;
  for (const a of ABILITY_LIST) bonus[a] = race?.abilityBonuses[a] ?? 0;
  if (race?.choiceBonuses) for (const a of st.raceBonus) bonus[a] += race.choiceBonuses.amount;
  const final = {} as Record<Ability, number | null>;
  const mods = {} as Record<Ability, number>;
  for (const a of ABILITY_LIST) {
    final[a] = base[a] === null ? null : Math.min(20, base[a]! + bonus[a]);
    mods[a] = mod(final[a] ?? 10);
  }
  let spent = 0;
  for (const a of ABILITY_LIST) spent += POINT_BUY.costs[st.pointbuy[a]] ?? 0;

  const fixedSkills: { skill: SkillId; from: string }[] = [];
  for (const s of bg?.skillProfs ?? []) fixedSkills.push({ skill: s, from: bg!.name });
  for (const s of race?.skillProfs ?? []) if (!fixedSkills.some((x) => x.skill === s)) fixedSkills.push({ skill: s, from: race!.name });
  const fixedSet = new Set(fixedSkills.map((x) => x.skill));
  const classSkillOptions = (cls?.skillChoices.from ?? []).filter((s) => !fixedSet.has(s));
  const classSkillNeed = Math.min(cls?.skillChoices.count ?? 0, classSkillOptions.length);

  const equipGroups = (cls?.startingEquipment ?? []).map((group) => group.map((text) => ({ text, entries: parseEquipment(text, ITEM_INDEX) })));
  // Background "à sua escolha" items (holy symbol, instrument...) resolve to the first matching item.
  const bgEquip = (bg ? parseEquipment(bg.equipment, ITEM_INDEX) : []).map((e): EquipEntry => {
    if (e.kind !== 'any') return e;
    const item = anyOptions(e.filter, ITEMS)[0];
    return item ? { kind: 'item', item, qty: 1 } : { kind: 'custom', name: e.label, qty: 1 };
  });

  return {
    raceData, race, cls, bg, base, bonus, final, mods,
    pointsLeft: POINT_BUY.total - spent,
    fixedSkills, classSkillOptions, classSkillNeed,
    raceSkillNeed: race?.skillChoices ?? 0,
    spellRules: spellRulesFor(cls, mods),
    equipGroups, bgEquip,
  };
}

function validate(step: StepId, st: WizardState, d: Derived): string | null {
  switch (step) {
    case 'identity':
      return st.name.trim() ? null : 'Dê um nome ao personagem.';
    case 'race':
      if (!d.raceData) return 'Escolha uma raça.';
      if (d.raceData.subraces.length && !st.subraceId) return 'Escolha uma sub-raça.';
      if (d.race?.choiceBonuses && st.raceBonus.length !== d.race.choiceBonuses.count) {
        return `Escolha ${d.race.choiceBonuses.count} atributos para o bônus racial.`;
      }
      return null;
    case 'class':
      if (!d.cls) return 'Escolha uma classe.';
      if (d.cls.subclassLevel === 1 && d.cls.subclasses.length && !st.subclassId) return `Escolha: ${d.cls.subclassLabel}.`;
      return null;
    case 'background':
      return d.bg ? null : 'Escolha um antecedente.';
    case 'abilities':
      if (st.method === 'pointbuy') return d.pointsLeft < 0 ? 'Você gastou mais pontos do que o permitido.' : null;
      if (st.method === 'roll' && st.rolls.some((r) => r === null)) return 'Role os seis valores de atributo.';
      return ABILITY_LIST.every((a) => d.base[a] !== null) ? null : 'Distribua um valor para cada atributo.';
    case 'skills':
      if (st.classSkills.length !== d.classSkillNeed) return `Escolha ${d.classSkillNeed} perícias da classe.`;
      if (st.raceSkills.length !== d.raceSkillNeed) return `Escolha ${d.raceSkillNeed} perícia(s) da raça.`;
      return null;
    case 'equipment':
      if (st.equipMode === 'gold') return st.gold === null ? 'Role ou informe o ouro inicial.' : null;
      for (let g = 0; g < d.equipGroups.length; g++) {
        const opt = d.equipGroups[g]![st.equipChoice[g] ?? 0];
        if (!opt) return 'Escolha uma opção em cada grupo.';
        for (let e = 0; e < opt.entries.length; e++) {
          if (opt.entries[e]!.kind === 'any' && !st.equipAny[`${g}:${st.equipChoice[g] ?? 0}:${e}`]) return 'Escolha os itens marcados.';
        }
      }
      return null;
    case 'spells': {
      const r = d.spellRules;
      if (!r) return null;
      if (st.cantrips.length !== r.cantrips) return `Escolha ${r.cantrips} truques.`;
      if (r.mode === 'known' && st.spells.length !== r.spells) return `Escolha ${r.spells} magias de 1º nível.`;
      if (r.mode === 'prepared' && r.spells > 0 && (st.spells.length < 1 || st.spells.length > r.spells)) return `Prepare de 1 a ${r.spells} magias.`;
      if (r.mode === 'spellbook') {
        if (st.spells.length !== r.spells) return `Escolha ${r.spells} magias para o grimório.`;
        const prepared = st.prepared.filter((x) => st.spells.includes(x));
        if (prepared.length < 1 || prepared.length > r.prepared) return `Prepare de 1 a ${r.prepared} magias do grimório.`;
      }
      return null;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Build the final character
// ---------------------------------------------------------------------------

function chosenEquipment(st: WizardState, d: Derived): EquipEntry[] {
  const out: EquipEntry[] = [];
  if (st.equipMode === 'kit') {
    d.equipGroups.forEach((group, g) => {
      const o = st.equipChoice[g] ?? 0;
      const opt = group[o];
      opt?.entries.forEach((entry, e) => {
        if (entry.kind === 'any') {
          const item = ITEMS_BY_ID_LOCAL.get(st.equipAny[`${g}:${o}:${e}`] ?? '');
          if (item) out.push({ kind: 'item', item, qty: 1 });
        } else out.push(entry);
      });
    });
  }
  out.push(...d.bgEquip);
  return out;
}

function buildCharacter(st: WizardState, d: Derived, isDM: boolean): Partial<Character> & { name: string } {
  const race = d.race!;
  const cls = d.cls!;
  const bg = d.bg!;
  const abilities = {} as AbilityScores;
  for (const a of ABILITY_LIST) abilities[a] = d.final[a] ?? 10;
  const mods = d.mods;
  const ctx = { level: 1, prof: 2, mods };
  const sub = cls.subclasses.find((s) => s.id === st.subclassId) ?? null;

  const skills: Partial<Record<SkillId, ProfLevel>> = {};
  for (const s of [...d.fixedSkills.map((x) => x.skill), ...st.classSkills, ...st.raceSkills]) skills[s] = 1;

  const features: Feature[] = [];
  const pushFeature = (f: Feature) => {
    if (!features.some((x) => x.name === f.name)) features.push(f);
  };
  for (const f of classFeaturesUpTo(cls.id, 1, st.subclassId)) {
    pushFeature(featureFrom(f, sub?.features.includes(f) ? sub.name : cls.name, ctx));
  }
  for (const t of race.traits) {
    if (/^(aumento no valor de habilidade|idiomas)$/i.test(t.name)) continue;
    pushFeature(featureFrom(t, race.name, ctx));
  }
  pushFeature(featureFrom(bg.feature, `Antecedente: ${bg.name}`, ctx));

  // Inventory
  const inventory: InventoryItem[] = [];
  const currency = { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 };
  // Subclasses like the Life Domain grant heavy armor at level 1.
  const subHeavy = !!sub?.features.some((f) => f.level <= 1 && /armaduras? pesadas?/i.test(f.text));
  const armorProfs = norm(`${cls.armorProfs}${subHeavy ? ', armaduras pesadas' : ''}`);
  const addItem = (item: ItemData, qty: number) => {
    const stack = !item.weapon && !item.armor;
    const existing = stack ? inventory.find((x) => x.ref === item.id) : undefined;
    if (existing) {
      existing.qty += qty;
      return;
    }
    const inv = inventoryFromItem(item, qty);
    if (item.category === 'pack') inv.notes = `Contém: ${item.description}`.slice(0, 4000);
    if (item.armor) {
      const proficient = item.armor.type === 'shield' ? armorProfs.includes('escudo')
        : armorProfs.includes('todas as armaduras')
          || armorProfs.includes(item.armor.type === 'light' ? 'leve' : item.armor.type === 'medium' ? 'media' : 'pesada');
      const slotTaken = inventory.some((x) => x.equipped && x.armor && (x.armor.type === 'shield') === (item.armor!.type === 'shield'));
      inv.equipped = proficient && !slotTaken;
    }
    inventory.push(inv);
  };
  for (const entry of chosenEquipment(st, d)) {
    if (entry.kind === 'item') addItem(entry.item, entry.qty);
    else if (entry.kind === 'custom') {
      inventory.push({ id: uid(), ref: null, name: entry.name, qty: entry.qty, weight: 0, equipped: false, attuned: false, notes: '', armor: null });
    } else if (entry.kind === 'coins') currency[entry.coin] += entry.amount;
  }
  if (st.equipMode === 'gold') currency.gp += st.gold ?? 0;

  // Attacks from weapons
  const profText = `${cls.weaponProfs} ${race.traits.map((t) => t.text).join(' ')}`;
  const attacks: Attack[] = [];
  for (const inv of inventory) {
    const item = inv.ref ? ITEMS_BY_ID_LOCAL.get(inv.ref) : undefined;
    if (!item?.weapon || attacks.some((a) => a.name === item.name)) continue;
    attacks.push(weaponAttack(item, weaponProficient(item, profText)));
  }

  // Spellcasting
  const classLevel = { id: cls.id, name: cls.name, level: 1, subclass: sub?.name ?? '', hitDie: cls.hitDie };
  let spellcasting: Character['spellcasting'] = null;
  if (cls.spellcasting) {
    const { slots, pact } = slotsFor([classLevel], null);
    const spells: KnownSpell[] = [];
    const add = (id: string, prepared: boolean) => {
      const s = SPELLS_BY_ID[id];
      if (s) spells.push({ id: uid(), ref: s.id, name: s.name, level: s.level, prepared, notes: '' });
    };
    for (const id of st.cantrips) add(id, true);
    const rules = d.spellRules;
    for (const id of st.spells) add(id, rules?.mode === 'spellbook' ? st.prepared.includes(id) : true);
    spellcasting = { ability: cls.spellcasting.ability, slots, pact, spells };
  }

  const hillDwarf = race.traits.some((t) => /robustez an[aã]/i.test(t.name));
  const hpMax = Math.max(1, cls.hitDie + mods.con + (hillDwarf ? 1 : 0));
  const clean = (s: string) => (/^nenhum/i.test(s.trim()) ? '' : s.trim());
  const join = (...parts: string[]) => parts.map(clean).filter(Boolean).join('; ').slice(0, 500);

  const out: Partial<Character> & { name: string } = {
    name: st.name.trim().slice(0, 120),
    portrait: st.portrait,
    race: race.name.replace(/\s*\(padrão\)\s*/i, '').slice(0, 80),
    background: bg.name.slice(0, 80),
    alignment: st.alignment.slice(0, 60),
    classes: [classLevel],
    abilities,
    saveProfs: [...cls.saves],
    skills,
    hp: { cur: hpMax, max: hpMax, temp: 0 },
    speed: race.speed,
    senses: { darkvision: race.darkvision },
    attacks,
    spellcasting,
    inventory,
    currency,
    features,
    proficiencies: {
      armor: join(`${cls.armorProfs}${subHeavy ? ', armaduras pesadas' : ''}`),
      weapons: join(cls.weaponProfs),
      tools: join(cls.toolProfs, bg.toolProfs),
      languages: join(race.languages, bg.languages),
    },
  };
  if (isDM) {
    out.kind = st.kind;
    out.ownerId = st.kind === 'pc' ? st.ownerId : null;
  }
  return out;
}


// ---------------------------------------------------------------------------
// Wizard shell
// ---------------------------------------------------------------------------

const STEP_META: Record<StepId, { label: string; icon: ReactNode }> = {
  identity: { label: 'Identidade', icon: <User /> },
  race: { label: 'Raça', icon: <Footprints /> },
  class: { label: 'Classe', icon: <Swords /> },
  background: { label: 'Antecedente', icon: <ScrollText /> },
  abilities: { label: 'Atributos', icon: <Dices /> },
  skills: { label: 'Perícias', icon: <Star /> },
  equipment: { label: 'Equipamento', icon: <Package /> },
  spells: { label: 'Magias', icon: <WandSparkles /> },
  review: { label: 'Revisão', icon: <Check /> },
};

export default function CharacterWizard({ onClose }: { onClose: () => void }) {
  const isDM = useGame((s) => s.me?.role === 'dm');
  const [st, setSt] = useState<WizardState>(() => ({ ...INITIAL, kind: 'pc' }));
  const [stepIdx, setStepIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: ID; name: string; portrait: string | null } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const set = useCallback<SetState>((patch) => setSt((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) })), []);
  const d = useMemo(() => derive(st), [st]);

  const steps = useMemo<StepId[]>(() => {
    const all: StepId[] = ['identity', 'race', 'class', 'background', 'abilities', 'skills', 'equipment', 'spells', 'review'];
    return all.filter((s) => s !== 'spells' || !!d.spellRules);
  }, [d.spellRules]);
  const idx = Math.min(stepIdx, steps.length - 1);
  const step = steps[idx]!;
  const errors = steps.map((s) => validate(s, st, d));
  const firstInvalid = errors.findIndex((e) => e !== null);
  const canReach = (i: number) => firstInvalid === -1 || i <= firstInvalid;
  const error = errors[idx];

  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [idx]);

  const go = (i: number) => {
    if (i < 0 || i >= steps.length || !canReach(i)) return;
    setStepIdx(i);
    bodyRef.current?.closest('.modal__body')?.scrollTo({ top: 0 });
  };

  const requestClose = async () => {
    if (created || (!st.name && !st.raceId && !st.classId)) {
      onClose();
      return;
    }
    if (await confirmDialog('Descartar personagem?', 'O progresso deste assistente será perdido.', { danger: true, ok: 'Descartar' })) onClose();
  };

  const finish = async () => {
    if (firstInvalid !== -1 || busy) return;
    setBusy(true);
    const character = buildCharacter(st, d, isDM);
    const res = await act('character.create', { character });
    setBusy(false);
    if (!res.ok) return;
    const id = (res.result as { id?: ID } | undefined)?.id;
    if (!id) return;
    if (!isDM) void act('player.update', { characterId: id }, { quiet: true });
    setCreated({ id, name: character.name, portrait: st.portrait });
  };

  if (created) {
    return (
      <Modal title="Personagem criado" icon={<Sparkles />} onClose={onClose} size="wide">
        <CreatedView created={created} isDM={isDM} onClose={onClose} />
      </Modal>
    );
  }

  const footer = (
    <div className="cw-foot">
      <Button variant="ghost" icon={<ArrowLeft />} disabled={idx === 0} onClick={() => go(idx - 1)}>Voltar</Button>
      <div className="cw-foot__msg">
        {error ? <span className="cw-foot__err">{error}</span> : <span className="u-dim">Passo {idx + 1} de {steps.length}</span>}
      </div>
      {step === 'review' ? (
        <Button variant="primary" icon={busy ? <Spinner /> : <Sparkles />} disabled={firstInvalid !== -1 || busy} onClick={() => void finish()}>
          Criar personagem
        </Button>
      ) : (
        <Button variant="primary" disabled={!!error} onClick={() => go(idx + 1)}>
          Próximo <ArrowRight />
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      title={st.name.trim() ? `Criar personagem — ${st.name.trim()}` : 'Criar personagem'}
      icon={<Sparkles />}
      onClose={() => void requestClose()}
      size="wide"
      dismissable={false}
      headerExtra={<IconButton icon={<X />} label="Fechar" onClick={() => void requestClose()} />}
      footer={footer}
    >
      <div className="cw" ref={bodyRef}>
        <nav className="cw-steps" aria-label="Etapas" ref={navRef}>
          {steps.map((s, i) => (
            <button
              key={s}
              type="button"
              className="cw-step"
              data-state={i === idx ? 'current' : errors[i] === null && i < idx ? 'done' : undefined}
              disabled={!canReach(i)}
              onClick={() => go(i)}
              aria-current={i === idx ? 'step' : undefined}
            >
              <span className="cw-step__dot">{errors[i] === null && i < idx ? <Check /> : i + 1}</span>
              <span className="cw-step__label">{STEP_META[s].label}</span>
            </button>
          ))}
        </nav>
        <div className="cw-content" key={step}>
          {step === 'identity' && <IdentityStep st={st} set={set} isDM={isDM} />}
          {step === 'race' && <RaceStep st={st} set={set} d={d} />}
          {step === 'class' && <ClassStep st={st} set={set} d={d} />}
          {step === 'background' && <BackgroundStep st={st} set={set} d={d} />}
          {step === 'abilities' && <AbilitiesStep st={st} set={set} d={d} />}
          {step === 'skills' && <SkillsStep st={st} set={set} d={d} />}
          {step === 'equipment' && <EquipmentStep st={st} set={set} d={d} />}
          {step === 'spells' && <SpellsStep st={st} set={set} d={d} />}
          {step === 'review' && <ReviewStep st={st} d={d} isDM={isDM} />}
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function StepIntro({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="cw-intro">
      <h3 className="cw-intro__title">{title}</h3>
      {children && <p className="cw-intro__text">{children}</p>}
    </div>
  );
}

function bonusText(b: Partial<AbilityScores>, choice?: { count: number; amount: number } | null): string {
  const parts = ABILITY_LIST.filter((a) => b[a]).map((a) => `${signed(b[a]!)} ${ABILITY_SHORT[a]}`);
  if (choice) parts.push(`${signed(choice.amount)} em ${choice.count} à escolha`);
  return parts.join(', ') || '—';
}

function OptionCard({ selected, onClick, title, meta, children, badge }: {
  selected: boolean;
  onClick: () => void;
  title: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <button type="button" className="cw-card" data-selected={selected ? 'true' : undefined} aria-pressed={selected} onClick={onClick}>
      <span className="cw-card__top">
        <span className="cw-card__title">{title}</span>
        {badge}
        {selected && <span className="cw-card__check"><Check /></span>}
      </span>
      {meta && <span className="cw-card__meta">{meta}</span>}
      {children && <span className="cw-card__desc">{children}</span>}
    </button>
  );
}

function Traits({ items }: { items: { name: string; text: string }[] }) {
  return (
    <div className="cw-traits">
      {items.map((t, i) => (
        <details key={`${t.name}-${i}`} className="cw-trait">
          <summary>{t.name}</summary>
          <p>{t.text}</p>
        </details>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

const IdentityStep = memo(function IdentityStep({ st, set, isDM }: { st: WizardState; set: SetState; isDM: boolean }) {
  const players = useGame((s) => s.state?.players);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    const url = await uploadPortrait(f);
    setBusy(false);
    if (url) set({ portrait: url });
  };
  const img = assetUrl(st.portrait);
  return (
    <div className="cw-identity">
      <button
        type="button"
        className="cw-portrait"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        {img ? <img src={img} alt="" /> : <span className="cw-portrait__ph"><ImagePlus /><span>Retrato</span></span>}
        {busy && <span className="cw-portrait__busy"><Spinner /></span>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </button>
      <div className="cw-identity__fields">
        <StepIntro title="Quem é você, aventureiro?">Todo herói começa com um nome. Você poderá mudar tudo depois na ficha.</StepIntro>
        <label className="field">
          <span className="field__label">Nome</span>
          <input className="input input--lg" autoFocus maxLength={120} placeholder="Ex.: Kaelen Sombraluz" value={st.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field__label">Tendência</span>
          <select className="select" value={st.alignment} onChange={(e) => set({ alignment: e.target.value })}>
            <option value="">— escolher depois —</option>
            {ALIGNMENTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        {isDM && (
          <div className="cw-row">
            <div className="field">
              <span className="field__label">Tipo</span>
              <Segmented value={st.kind} options={[{ value: 'pc', label: 'Personagem de jogador' }, { value: 'npc', label: 'PdM' }]} onChange={(v) => set({ kind: v })} />
            </div>
            {st.kind === 'pc' && (
              <label className="field u-grow">
                <span className="field__label">Jogador</span>
                <select className="select" value={st.ownerId ?? ''} onChange={(e) => set({ ownerId: e.target.value || null })}>
                  <option value="">Ninguém por enquanto</option>
                  {Object.values(players ?? {}).filter((p) => p.role === 'player').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const RaceStep = memo(function RaceStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const pick = (id: string) => {
    if (id === st.raceId) return;
    const r = RACES_BY_ID[id]!;
    set({ raceId: id, subraceId: r.subraces.length === 1 ? r.subraces[0]!.id : null, raceBonus: [], raceSkills: [] });
  };
  const race = d.raceData;
  const resolved = d.race;
  const choice = resolved?.choiceBonuses ?? null;
  const fixedBonus = resolved?.abilityBonuses ?? {};
  return (
    <div className="cw-split">
      <div>
        <StepIntro title="Escolha sua raça">Sua ancestralidade define atributos, sentidos e talentos naturais.</StepIntro>
        <div className="cw-grid">
          {RACES.map((r) => (
            <OptionCard
              key={r.id}
              selected={st.raceId === r.id}
              onClick={() => pick(r.id)}
              title={r.name}
              meta={<>{bonusText(r.abilityBonuses, r.choiceBonuses) === '—' ? 'Bônus pela variante' : bonusText(r.abilityBonuses, r.choiceBonuses)}</>}
              badge={r.darkvision ? <span className="badge" data-tip={`Visão no escuro ${r.darkvision} pés`}><Moon /></span> : undefined}
            >
              {r.description}
            </OptionCard>
          ))}
        </div>
      </div>
      {race && (
        <aside className="cw-detail">
          <h4 className="cw-detail__title">{race.name}</h4>
          <div className="cw-facts">
            <span><Footprints /> {resolved?.speed ?? race.speed} pés</span>
            <span><Moon /> {resolved?.darkvision ? `${resolved.darkvision} pés` : 'Sem visão no escuro'}</span>
            <span><Shield /> {race.size === 'small' ? 'Pequeno' : 'Médio'}</span>
          </div>
          {race.subraces.length > 0 && (
            <div className="cw-block">
              <div className="cw-label">Sub-raça</div>
              <div className="cw-subs">
                {race.subraces.map((s) => (
                  <OptionCard
                    key={s.id}
                    selected={st.subraceId === s.id}
                    onClick={() => set({ subraceId: s.id, raceBonus: [], raceSkills: [] })}
                    title={s.name}
                    meta={bonusText(s.abilityBonuses, s.choiceBonuses)}
                  >
                    {s.description}
                  </OptionCard>
                ))}
              </div>
            </div>
          )}
          <div className="cw-block">
            <div className="cw-label">Aumento de atributos</div>
            <div className="u-sm">{bonusText(fixedBonus)}</div>
            {choice && (
              <>
                <div className="u-xs u-muted u-mt-2">Escolha {choice.count} atributos para {signed(choice.amount)}:</div>
                <div className="cw-chips">
                  {ABILITY_LIST.map((a) => {
                    const on = st.raceBonus.includes(a);
                    const blocked = !on && ((fixedBonus[a] ?? 0) > 0 || st.raceBonus.length >= choice.count);
                    return (
                      <button
                        key={a}
                        type="button"
                        className="chip"
                        data-active={on ? 'true' : undefined}
                        disabled={blocked}
                        onClick={() => set((s) => ({ raceBonus: on ? s.raceBonus.filter((x) => x !== a) : [...s.raceBonus, a] }))}
                      >
                        {ABILITY_NAME[a]}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
          {resolved && (
            <div className="cw-block">
              <div className="cw-label">Traços</div>
              <Traits items={resolved.traits} />
              <div className="u-xs u-muted u-mt-2">Idiomas: {resolved.languages}</div>
            </div>
          )}
        </aside>
      )}
    </div>
  );
});

const ClassStep = memo(function ClassStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const pick = (id: string) => {
    if (id === st.classId) return;
    set({ classId: id, subclassId: null, classSkills: [], equipChoice: [], equipAny: {}, gold: null, cantrips: [], spells: [], prepared: [] });
  };
  const cls = d.cls;
  const lvl1 = cls ? classFeaturesUpTo(cls.id, 1, st.subclassId) : [];
  return (
    <div className="cw-split">
      <div>
        <StepIntro title="Escolha sua classe">Sua vocação: como você luta, sobrevive e molda o mundo.</StepIntro>
        <div className="cw-grid">
          {CLASSES.map((k) => (
            <OptionCard
              key={k.id}
              selected={st.classId === k.id}
              onClick={() => pick(k.id)}
              title={k.name}
              meta={<>d{k.hitDie} · {k.primaryAbility.map((a) => ABILITY_SHORT[a]).join('/')}</>}
              badge={k.spellcasting ? <span className="badge badge--dm" data-tip="Conjurador"><WandSparkles /></span> : undefined}
            >
              {k.description}
            </OptionCard>
          ))}
        </div>
      </div>
      {cls && (
        <aside className="cw-detail">
          <h4 className="cw-detail__title">{cls.name}</h4>
          <div className="cw-facts">
            <span><Heart /> d{cls.hitDie} · {cls.hitDie} + CON no 1º nível</span>
            <span><Shield /> Salvaguardas: {cls.saves.map((a) => ABILITY_NAME[a]).join(', ')}</span>
          </div>
          <dl className="cw-dl">
            <div><dt>Armaduras</dt><dd>{cls.armorProfs}</dd></div>
            <div><dt>Armas</dt><dd>{cls.weaponProfs}</dd></div>
            <div><dt>Ferramentas</dt><dd>{cls.toolProfs}</dd></div>
            <div><dt>Perícias</dt><dd>{cls.skillChoices.count} entre {cls.skillChoices.from.length === 18 ? 'todas' : cls.skillChoices.from.map((s) => SKILL_NAME[s]).join(', ')}</dd></div>
            {cls.spellcasting && <div><dt>Conjuração</dt><dd>{ABILITY_NAME[cls.spellcasting.ability]}{cls.spellcasting.prepares ? ' · prepara magias' : ''}</dd></div>}
          </dl>
          {cls.subclassLevel === 1 && cls.subclasses.length > 0 && (
            <div className="cw-block">
              <div className="cw-label">{cls.subclassLabel}</div>
              <div className="cw-subs">
                {cls.subclasses.map((s) => (
                  <OptionCard key={s.id} selected={st.subclassId === s.id} onClick={() => set({ subclassId: s.id })} title={s.name} badge={s.features.length ? <span className="badge badge--gold">SRD</span> : undefined}>
                    {s.description}
                  </OptionCard>
                ))}
              </div>
            </div>
          )}
          <div className="cw-block">
            <div className="cw-label">Características no 1º nível</div>
            <Traits items={lvl1} />
          </div>
        </aside>
      )}
    </div>
  );
});

const BackgroundStep = memo(function BackgroundStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const bg = d.bg;
  return (
    <div className="cw-split">
      <div>
        <StepIntro title="Escolha seu antecedente">Quem você era antes da aventura: perícias, ferramentas, idiomas e uma característica especial.</StepIntro>
        <div className="cw-grid">
          {BACKGROUNDS.map((b) => (
            <OptionCard
              key={b.id}
              selected={st.backgroundId === b.id}
              onClick={() => set((s) => ({
                backgroundId: b.id,
                classSkills: s.classSkills.filter((x) => !b.skillProfs.includes(x)),
                raceSkills: s.raceSkills.filter((x) => !b.skillProfs.includes(x)),
              }))}
              title={b.name}
              meta={b.skillProfs.map((s) => SKILL_NAME[s]).join(', ')}
            >
              {b.description}
            </OptionCard>
          ))}
        </div>
      </div>
      {bg && (
        <aside className="cw-detail">
          <h4 className="cw-detail__title">{bg.name}</h4>
          <p className="cw-detail__text">{bg.description}</p>
          <dl className="cw-dl">
            <div><dt>Perícias</dt><dd>{bg.skillProfs.map((s) => SKILL_NAME[s]).join(', ')}</dd></div>
            <div><dt>Ferramentas</dt><dd>{bg.toolProfs}</dd></div>
            <div><dt>Idiomas</dt><dd>{bg.languages}</dd></div>
            <div><dt>Equipamento</dt><dd>{bg.equipment}</dd></div>
          </dl>
          <div className="cw-block">
            <div className="cw-label">Característica</div>
            <Traits items={[bg.feature]} />
          </div>
        </aside>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

async function rollOne(label: string): Promise<number> {
  if (useGame.getState().status === 'online') {
    const res = await act('roll.formula', { formula: '4d6kh3', label }, { quiet: true });
    const total = res.ok ? (res.result as { total?: number } | undefined)?.total : undefined;
    if (typeof total === 'number') return total;
  }
  return localRoll('4d6kh3').total;
}

const AbilitiesStep = memo(function AbilitiesStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const [rolling, setRolling] = useState(false);
  const priority = abilityPriority(d.cls);

  const autoAssign = () => {
    if (st.method === 'standard') {
      const sorted = [...STANDARD_ARRAY].sort((a, b) => b - a);
      const standard: Partial<Record<Ability, number>> = {};
      priority.forEach((a, i) => (standard[a] = sorted[i]));
      set({ standard });
    } else if (st.method === 'roll') {
      const idxs = st.rolls.map((v, i) => ({ v: v ?? 0, i })).sort((a, b) => b.v - a.v);
      const rollAssign: Partial<Record<Ability, number>> = {};
      priority.forEach((a, i) => (rollAssign[a] = idxs[i]!.i));
      set({ rollAssign });
    } else {
      // A solid point-buy spread: 15/15/15/8/8/8 is too swingy; use 15/14/13/12/10/8 (27 points).
      const spread = [15, 14, 13, 12, 10, 8];
      const pointbuy = {} as Record<Ability, number>;
      priority.forEach((a, i) => (pointbuy[a] = spread[i]!));
      set({ pointbuy });
    }
  };

  const rollAll = async () => {
    setRolling(true);
    set({ rolls: [null, null, null, null, null, null], rollAssign: {} });
    const out: (number | null)[] = [null, null, null, null, null, null];
    for (let i = 0; i < 6; i++) {
      out[i] = await rollOne(`${st.name.trim() || 'Novo personagem'}: atributo ${i + 1}/6 (4d6, descarta o menor)`);
      set({ rolls: [...out] });
    }
    setRolling(false);
  };

  const assignStandard = (a: Ability, value: number | null) => set((s) => {
    const standard = { ...s.standard };
    const prevValue = standard[a];
    const other = ABILITY_LIST.find((b) => b !== a && standard[b] === value);
    if (value === null) delete standard[a];
    else standard[a] = value;
    if (other && value !== null) {
      if (prevValue !== undefined) standard[other] = prevValue;
      else delete standard[other];
    }
    return { standard };
  });
  const assignRoll = (a: Ability, index: number | null) => set((s) => {
    const rollAssign = { ...s.rollAssign };
    const prevIndex = rollAssign[a];
    const other = ABILITY_LIST.find((b) => b !== a && rollAssign[b] === index);
    if (index === null) delete rollAssign[a];
    else rollAssign[a] = index;
    if (other && index !== null) {
      if (prevIndex !== undefined) rollAssign[other] = prevIndex;
      else delete rollAssign[other];
    }
    return { rollAssign };
  });
  const bump = (a: Ability, delta: number) => set((s) => {
    const v = Math.max(POINT_BUY.min, Math.min(POINT_BUY.max, s.pointbuy[a] + delta));
    return { pointbuy: { ...s.pointbuy, [a]: v } };
  });

  const rolled = st.rolls.every((r) => r !== null);

  return (
    <div>
      <StepIntro title="Atributos">Defina os seis valores básicos. Os bônus raciais são aplicados automaticamente.</StepIntro>
      <div className="cw-row cw-row--between">
        <Segmented
          value={st.method}
          options={[
            { value: 'standard', label: 'Padrão', tip: '15, 14, 13, 12, 10, 8' },
            { value: 'pointbuy', label: 'Compra de pontos', tip: '27 pontos, valores de 8 a 15' },
            { value: 'roll', label: 'Rolar 4d6', tip: 'Rola 4d6 e descarta o menor, seis vezes' },
          ]}
          onChange={(v) => set({ method: v })}
        />
        <Button size="sm" variant="ghost" icon={<Sparkles />} disabled={st.method === 'roll' && !rolled} onClick={autoAssign}>
          Distribuir para {d.cls?.name ?? 'a classe'}
        </Button>
      </div>

      {st.method === 'pointbuy' && (
        <div className="cw-points" data-over={d.pointsLeft < 0 ? 'true' : undefined}>
          <Coins /> Pontos restantes: <strong className="u-tabular">{d.pointsLeft}</strong> / {POINT_BUY.total}
        </div>
      )}
      {st.method === 'roll' && (
        <div className="cw-rolls">
          <Button variant={rolled ? 'default' : 'primary'} icon={rolling ? <Spinner /> : rolled ? <RefreshCw /> : <Dices />} disabled={rolling} onClick={() => void rollAll()}>
            {rolled ? 'Rolar de novo' : 'Rolar os atributos'}
          </Button>
          <div className="cw-rolls__values">
            {st.rolls.map((r, i) => {
              const used = ABILITY_LIST.some((a) => st.rollAssign[a] === i);
              return <span key={i} className="cw-die" data-used={used ? 'true' : undefined} data-empty={r === null ? 'true' : undefined}>{r ?? '–'}</span>;
            })}
          </div>
        </div>
      )}

      <div className="cw-abil">
        <div className="cw-abil__head">
          <span>Atributo</span><span>Base</span><span>Raça</span><span>Total</span><span>Mod.</span>
        </div>
        {ABILITY_LIST.map((a) => {
          const total = d.final[a];
          const primary = d.cls?.primaryAbility.includes(a);
          return (
            <div key={a} className="cw-abil__row" data-primary={primary ? 'true' : undefined}>
              <span className="cw-abil__name">
                <strong>{ABILITY_SHORT[a]}</strong> {ABILITY_NAME[a]}
                {primary && <Star className="cw-abil__star" />}
              </span>
              <span className="cw-abil__base">
                {st.method === 'standard' && (
                  <select className="select input--sm" value={st.standard[a] ?? ''} onChange={(e) => assignStandard(a, e.target.value === '' ? null : Number(e.target.value))} aria-label={ABILITY_NAME[a]}>
                    <option value="">—</option>
                    {STANDARD_ARRAY.map((v) => {
                      const owner = ABILITY_LIST.find((b) => b !== a && st.standard[b] === v);
                      return <option key={v} value={v}>{v}{owner ? ` (${ABILITY_SHORT[owner]})` : ''}</option>;
                    })}
                  </select>
                )}
                {st.method === 'pointbuy' && (
                  <span className="cs-stepper">
                    <button type="button" className="icon-btn icon-btn--sm" disabled={st.pointbuy[a] <= POINT_BUY.min} onClick={() => bump(a, -1)} aria-label="Diminuir">−</button>
                    <span className="cs-stepper__val u-tabular">{st.pointbuy[a]}</span>
                    <button
                      type="button"
                      className="icon-btn icon-btn--sm"
                      disabled={st.pointbuy[a] >= POINT_BUY.max || (POINT_BUY.costs[st.pointbuy[a] + 1] ?? 99) - (POINT_BUY.costs[st.pointbuy[a]] ?? 0) > d.pointsLeft}
                      onClick={() => bump(a, 1)}
                      aria-label="Aumentar"
                    >
                      +
                    </button>
                    <span className="u-xs u-dim">{POINT_BUY.costs[st.pointbuy[a]]} pt</span>
                  </span>
                )}
                {st.method === 'roll' && (
                  <select className="select input--sm" disabled={!rolled} value={st.rollAssign[a] ?? ''} onChange={(e) => assignRoll(a, e.target.value === '' ? null : Number(e.target.value))} aria-label={ABILITY_NAME[a]}>
                    <option value="">—</option>
                    {st.rolls.map((v, i) => {
                      const owner = ABILITY_LIST.find((b) => b !== a && st.rollAssign[b] === i);
                      return <option key={i} value={i}>{v ?? '–'}{owner ? ` (${ABILITY_SHORT[owner]})` : ''}</option>;
                    })}
                  </select>
                )}
              </span>
              <span className="cw-abil__bonus">{d.bonus[a] ? signed(d.bonus[a]) : '—'}</span>
              <span className="cw-abil__total u-tabular">{total ?? '—'}</span>
              <span className="cw-abil__mod u-tabular" data-neg={d.mods[a] < 0 ? 'true' : undefined}>{total === null ? '—' : signed(d.mods[a])}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

const SkillsStep = memo(function SkillsStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const fixed = new Set(d.fixedSkills.map((x) => x.skill));
  const toggleClass = (s: SkillId) => set((cur) => {
    if (cur.classSkills.includes(s)) return { classSkills: cur.classSkills.filter((x) => x !== s) };
    if (cur.classSkills.length >= d.classSkillNeed) return {};
    return { classSkills: [...cur.classSkills, s], raceSkills: cur.raceSkills.filter((x) => x !== s) };
  });
  const toggleRace = (s: SkillId) => set((cur) => {
    if (cur.raceSkills.includes(s)) return { raceSkills: cur.raceSkills.filter((x) => x !== s) };
    if (cur.raceSkills.length >= d.raceSkillNeed) return {};
    return { raceSkills: [...cur.raceSkills, s] };
  });
  return (
    <div>
      <StepIntro title="Perícias">Escolha as perícias em que seu personagem é treinado.</StepIntro>
      {d.fixedSkills.length > 0 && (
        <div className="cw-block">
          <div className="cw-label">Já garantidas</div>
          <div className="cw-chips">
            {d.fixedSkills.map((x) => (
              <span key={x.skill} className="chip" data-active="true" data-tip={`Por ${x.from}`}>
                <Check /> {SKILL_NAME[x.skill]} <em className="u-dim">· {x.from}</em>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="cw-block">
        <div className="cw-label">
          {d.cls?.name ?? 'Classe'}: escolha {d.classSkillNeed}
          <span className="cw-count" data-done={st.classSkills.length === d.classSkillNeed ? 'true' : undefined}>{st.classSkills.length}/{d.classSkillNeed}</span>
        </div>
        <div className="cw-chips">
          {d.classSkillOptions.map((s) => {
            const on = st.classSkills.includes(s);
            return (
              <button key={s} type="button" className="chip" data-active={on ? 'true' : undefined} disabled={!on && st.classSkills.length >= d.classSkillNeed} onClick={() => toggleClass(s)}>
                {on && <Check />} {SKILL_NAME[s]}
              </button>
            );
          })}
        </div>
      </div>
      {d.raceSkillNeed > 0 && (
        <div className="cw-block">
          <div className="cw-label">
            {d.race?.name ?? 'Raça'}: escolha {d.raceSkillNeed} perícia(s) quaisquer
            <span className="cw-count" data-done={st.raceSkills.length === d.raceSkillNeed ? 'true' : undefined}>{st.raceSkills.length}/{d.raceSkillNeed}</span>
          </div>
          <div className="cw-chips">
            {SKILL_IDS.filter((s) => !fixed.has(s) && !st.classSkills.includes(s)).map((s) => {
              const on = st.raceSkills.includes(s);
              return (
                <button key={s} type="button" className="chip" data-active={on ? 'true' : undefined} disabled={!on && st.raceSkills.length >= d.raceSkillNeed} onClick={() => toggleRace(s)}>
                  {on && <Check />} {SKILL_NAME[s]}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

function entryLabel(e: EquipEntry): string {
  if (e.kind === 'item') return `${e.qty > 1 ? `${e.qty}× ` : ''}${e.item.name}`;
  if (e.kind === 'custom') return `${e.qty > 1 ? `${e.qty}× ` : ''}${e.name}`;
  if (e.kind === 'coins') return `${e.amount} ${e.coin === 'gp' ? 'po' : e.coin === 'sp' ? 'pp' : e.coin === 'cp' ? 'pc' : e.coin === 'ep' ? 'pe' : 'pl'}`;
  return e.label;
}

function goldFormula(text: string): { formula: string; mult: number } | null {
  const m = /(\d+)d(\d+)\s*(?:[×x*]\s*(\d+))?/i.exec(text);
  if (!m) return null;
  return { formula: `${m[1]}d${m[2]}`, mult: Number(m[3] ?? 1) };
}

const EquipmentStep = memo(function EquipmentStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const [rolling, setRolling] = useState(false);
  const cls = d.cls;
  const gf = cls ? goldFormula(cls.startingGold) : null;
  const rollGold = async () => {
    if (!gf) return;
    setRolling(true);
    let total: number | null = null;
    if (useGame.getState().status === 'online') {
      const res = await act('roll.formula', { formula: gf.formula, label: `${st.name.trim() || 'Personagem'}: ouro inicial (${cls!.startingGold})` }, { quiet: true });
      const t = res.ok ? (res.result as { total?: number } | undefined)?.total : undefined;
      if (typeof t === 'number') total = t;
    }
    if (total === null) total = localRoll(gf.formula).total;
    setRolling(false);
    set({ gold: total * gf.mult });
  };
  return (
    <div>
      <StepIntro title="Equipamento inicial">Escolha o equipamento da classe — ou role o ouro inicial e compre depois.</StepIntro>
      <Segmented
        value={st.equipMode}
        options={[
          { value: 'kit', label: 'Equipamento da classe', icon: <Package /> },
          { value: 'gold', label: `Ouro inicial${cls ? ` (${cls.startingGold})` : ''}`, icon: <Coins /> },
        ]}
        onChange={(v) => set({ equipMode: v })}
      />
      {st.equipMode === 'kit' ? (
        <div className="cw-equip">
          {d.equipGroups.map((group, g) => {
            const chosen = st.equipChoice[g] ?? 0;
            return (
              <div key={g} className="cw-equip__group">
                <div className="cw-label">{group.length > 1 ? `Escolha uma opção (${g + 1})` : `Incluído (${g + 1})`}</div>
                <div className="cw-equip__opts">
                  {group.map((opt, o) => (
                    <div key={o} className="cw-equip__opt" data-selected={chosen === o ? 'true' : undefined}>
                      <button
                        type="button"
                        className="cw-equip__pick"
                        disabled={group.length === 1}
                        onClick={() => set((s) => {
                          const equipChoice = [...s.equipChoice];
                          for (let i = 0; i < d.equipGroups.length; i++) equipChoice[i] ??= 0;
                          equipChoice[g] = o;
                          return { equipChoice };
                        })}
                      >
                        <span className="cw-radio" data-on={chosen === o ? 'true' : undefined} />
                        <span className="u-grow">{opt.text}</span>
                      </button>
                      {chosen === o && (
                        <div className="cw-equip__entries">
                          {opt.entries.map((e, i) => (e.kind === 'any' ? (
                            <select
                              key={i}
                              className="select input--sm"
                              value={st.equipAny[`${g}:${o}:${i}`] ?? ''}
                              data-missing={!st.equipAny[`${g}:${o}:${i}`] ? 'true' : undefined}
                              onChange={(ev) => set((s) => ({ equipAny: { ...s.equipAny, [`${g}:${o}:${i}`]: ev.target.value } }))}
                            >
                              <option value="">{e.label}: escolher…</option>
                              {anyOptions(e.filter, ITEMS).map((it) => (
                                <option key={it.id} value={it.id}>{it.name}{it.weapon ? ` (${it.weapon.damage.formula})` : ''}</option>
                              ))}
                            </select>
                          ) : (
                            <span key={i} className="chip" data-kind={e.kind}>{e.kind === 'item' && e.item.weapon ? <Swords /> : e.kind === 'item' && e.item.armor ? <Shield /> : null}{entryLabel(e)}</span>
                          )))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cw-gold">
          <Button variant="primary" icon={rolling ? <Spinner /> : <Dices />} disabled={rolling || !gf} onClick={() => void rollGold()}>
            Rolar {cls?.startingGold ?? 'ouro'}
          </Button>
          <label className="field">
            <span className="field__label">Ouro (po)</span>
            <input
              className="input input--num"
              inputMode="numeric"
              value={st.gold ?? ''}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value.replace(/\D/g, ''), 10);
                set({ gold: Number.isFinite(n) ? Math.min(100000, n) : null });
              }}
            />
          </label>
        </div>
      )}
      {d.bg && d.bgEquip.length > 0 && (
        <div className="cw-block">
          <div className="cw-label">Do antecedente ({d.bg.name})</div>
          <div className="cw-chips">
            {d.bgEquip.map((e, i) => <span key={i} className="chip" data-kind={e.kind}>{e.kind === 'coins' && <Coins />}{entryLabel(e)}</span>)}
          </div>
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Spells
// ---------------------------------------------------------------------------

const SpellsStep = memo(function SpellsStep({ st, set, d }: { st: WizardState; set: SetState; d: Derived }) {
  const cls = d.cls;
  const rules = d.spellRules;
  const all = useMemo(() => (cls ? spellsForClass(cls.id) : []), [cls]);
  const cantrips = all.filter((s) => s.level === 0);
  const firsts = all.filter((s) => s.level === 1);
  const [peek, setPeek] = useState<SpellData | null>(null);
  if (!rules || !cls) return null;
  const toggle = (key: 'cantrips' | 'spells', id: string, max: number) => set((s) => {
    const list = s[key];
    if (list.includes(id)) {
      const next = list.filter((x) => x !== id);
      return key === 'spells' ? { spells: next, prepared: s.prepared.filter((x) => x !== id) } : { [key]: next };
    }
    if (list.length >= max) return {};
    return { [key]: [...list, id] };
  });
  const togglePrepared = (id: string) => set((s) => {
    if (s.prepared.includes(id)) return { prepared: s.prepared.filter((x) => x !== id) };
    if (s.prepared.filter((x) => s.spells.includes(x)).length >= rules.prepared) return {};
    return { prepared: [...s.prepared, id] };
  });
  const spellTitle = rules.mode === 'spellbook' ? 'Grimório (1º nível)' : rules.mode === 'prepared' ? 'Magias preparadas (1º nível)' : 'Magias conhecidas (1º nível)';
  return (
    <div>
      <StepIntro title="Magias">
        {rules.mode === 'prepared' && `Como ${cls.name.toLowerCase()}, você prepara magias a cada dia: até ${rules.spells} (mod. de ${ABILITY_NAME[cls.spellcasting!.ability]} + nível).`}
        {rules.mode === 'known' && `Escolha os truques e as magias que ${st.name.trim() || 'seu personagem'} conhece.`}
        {rules.mode === 'spellbook' && `Escolha ${rules.spells} magias para o grimório e marque com a estrela até ${rules.prepared} preparadas.`}
      </StepIntro>
      {rules.cantrips > 0 && (
        <div className="cw-block">
          <div className="cw-label">
            Truques <span className="cw-count" data-done={st.cantrips.length === rules.cantrips ? 'true' : undefined}>{st.cantrips.length}/{rules.cantrips}</span>
          </div>
          <div className="cw-spells">
            {cantrips.map((s) => (
              <SpellChip key={s.id} s={s} on={st.cantrips.includes(s.id)} disabled={!st.cantrips.includes(s.id) && st.cantrips.length >= rules.cantrips} onToggle={() => toggle('cantrips', s.id, rules.cantrips)} onPeek={setPeek} />
            ))}
          </div>
        </div>
      )}
      {rules.spells > 0 && (
        <div className="cw-block">
          <div className="cw-label">
            {spellTitle}
            <span className="cw-count" data-done={(rules.mode === 'prepared' ? st.spells.length >= 1 : st.spells.length === rules.spells) ? 'true' : undefined}>{st.spells.length}/{rules.spells}</span>
            {rules.mode === 'spellbook' && <span className="cw-count">★ {st.prepared.filter((x) => st.spells.includes(x)).length}/{rules.prepared}</span>}
          </div>
          <div className="cw-spells">
            {firsts.map((s) => (
              <SpellChip
                key={s.id}
                s={s}
                on={st.spells.includes(s.id)}
                disabled={!st.spells.includes(s.id) && st.spells.length >= rules.spells}
                onToggle={() => toggle('spells', s.id, rules.spells)}
                onPeek={setPeek}
                star={rules.mode === 'spellbook' && st.spells.includes(s.id) ? { on: st.prepared.includes(s.id), toggle: () => togglePrepared(s.id) } : undefined}
              />
            ))}
          </div>
        </div>
      )}
      {peek && (
        <div className="cw-peek">
          <div className="cw-peek__head">
            <strong>{peek.name}</strong>
            <span className="u-xs u-muted">{peek.level === 0 ? 'Truque' : `${peek.level}º nível`} · {peek.castingTime} · {peek.range} · {peek.duration}</span>
          </div>
          <p>{peek.description}</p>
        </div>
      )}
    </div>
  );
});

function SpellChip({ s, on, disabled, onToggle, onPeek, star }: {
  s: SpellData;
  on: boolean;
  disabled: boolean;
  onToggle: () => void;
  onPeek: (s: SpellData) => void;
  star?: { on: boolean; toggle: () => void };
}) {
  const dmg = s.damage?.[0];
  return (
    <div className="cw-spell" data-on={on ? 'true' : undefined} data-disabled={disabled ? 'true' : undefined} onPointerEnter={() => onPeek(s)}>
      <button type="button" className="cw-spell__main" disabled={disabled} onClick={onToggle} onFocus={() => onPeek(s)}>
        <span className="cw-spell__check">{on && <Check />}</span>
        <span className="cw-spell__name u-ellipsis">{s.name}</span>
        {s.concentration && <span className="cs-tag">C</span>}
        {s.ritual && <span className="cs-tag">R</span>}
        {dmg && <span className="cw-spell__dmg">{dmg.formula.replace(/\+?@mod/, '')}</span>}
        {s.heal && <span className="cw-spell__dmg cw-spell__dmg--heal">cura</span>}
      </button>
      {star && (
        <button type="button" className="cw-spell__star" data-on={star.on ? 'true' : undefined} onClick={star.toggle} data-tip={star.on ? 'Preparada' : 'Preparar'} aria-pressed={star.on}>
          <Star />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

const ReviewStep = memo(function ReviewStep({ st, d, isDM }: { st: WizardState; d: Derived; isDM: boolean }) {
  const built = useMemo(() => buildCharacter(st, d, isDM), [st, d, isDM]);
  const full = useMemo(() => createCharacter(built), [built]);
  const stats = useMemo(() => computeStats(full), [full]);
  const img = assetUrl(st.portrait);
  return (
    <div className="cw-review">
      <div className="cw-review__hero">
        <span className="cw-review__portrait">{img ? <img src={img} alt="" /> : <Feather />}</span>
        <div className="u-grow">
          <h3 className="cw-review__name">{full.name}</h3>
          <div className="cw-review__sub">{full.race} · {full.classes[0]?.name} 1{full.classes[0]?.subclass ? ` (${full.classes[0].subclass})` : ''} · {full.background}{full.alignment ? ` · ${full.alignment}` : ''}</div>
        </div>
      </div>
      <div className="cw-review__vitals">
        <div><span>CA</span><strong>{stats.ac}</strong></div>
        <div><span>PV</span><strong>{full.hp.max}</strong></div>
        <div><span>Iniciativa</span><strong>{signed(stats.initiative)}</strong></div>
        <div><span>Desloc.</span><strong>{full.speed}</strong></div>
        <div><span>Prof.</span><strong>+{stats.prof}</strong></div>
        <div><span>Perc. passiva</span><strong>{stats.passive.perception}</strong></div>
      </div>
      <div className="cw-review__abil">
        {ABILITY_LIST.map((a) => (
          <div key={a} className="cw-review__ab">
            <span>{ABILITY_SHORT[a]}</span>
            <strong>{signed(stats.mods[a])}</strong>
            <em>{full.abilities[a]}</em>
          </div>
        ))}
      </div>
      <div className="cw-review__cols">
        <section>
          <div className="cw-label">Salvaguardas</div>
          <p className="u-sm">{full.saveProfs.map((a) => `${ABILITY_NAME[a]} ${signed(stats.saves[a])}`).join(' · ')}</p>
          <div className="cw-label">Perícias</div>
          <p className="u-sm">{(Object.keys(full.skills) as SkillId[]).sort((a, b) => SKILL_NAME[a].localeCompare(SKILL_NAME[b], 'pt-BR')).map((s) => `${SKILL_NAME[s]} ${signed(stats.skills[s])}`).join(' · ') || '—'}</p>
          <div className="cw-label">Ataques</div>
          {full.attacks.length === 0 && <p className="u-sm u-dim">Nenhum.</p>}
          {full.attacks.map((a) => {
            const vars = characterVars(full, stats, attackAbilityMod(full, a, stats));
            return (
              <div key={a.id} className="cw-review__atk">
                <span className="u-grow">{a.name}{a.proficient ? '' : ' (sem proficiência)'}</span>
                <strong>{signed(attackToHit(full, a, stats))}</strong>
                <span className="u-muted u-xs">{a.damage.map((x) => resolveFormula(x.formula, vars)).join(' + ')}</span>
              </div>
            );
          })}
        </section>
        <section>
          {full.spellcasting && full.spellcasting.spells.length > 0 && (
            <>
              <div className="cw-label"><BookOpen /> Magias · CD {stats.spell?.dc} · ataque {signed(stats.spell?.attack ?? 0)}</div>
              <p className="u-sm">{full.spellcasting.spells.map((s) => `${s.name}${s.level > 0 && !s.prepared ? ' (grimório)' : ''}`).join(' · ')}</p>
            </>
          )}
          <div className="cw-label">Equipamento</div>
          <p className="u-sm">{full.inventory.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ''}${i.name}${i.equipped && i.armor ? ' (equipado)' : ''}`).join(' · ') || '—'}</p>
          {(full.currency.gp > 0 || full.currency.sp > 0) && <p className="u-sm u-gold">{full.currency.gp} po{full.currency.sp ? ` · ${full.currency.sp} pp` : ''}</p>}
          <div className="cw-label">Características</div>
          <p className="u-sm">{full.features.map((f) => f.name).join(' · ')}</p>
          <div className="cw-label">Idiomas</div>
          <p className="u-sm">{full.proficiencies.languages || '—'}</p>
        </section>
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

function CreatedView({ created, isDM, onClose }: { created: { id: ID; name: string; portrait: string | null }; isDM: boolean; onClose: () => void }) {
  const [placed, setPlaced] = useState(false);
  const img = assetUrl(created.portrait);
  const openSheet = () => {
    if (isDM) useUi.getState().openSheet(created.id);
    else useUi.getState().openSidebar('character');
    onClose();
  };
  return (
    <div className="cw-done">
      <div className="cw-done__seal">{img ? <img src={img} alt="" /> : <Sparkles />}</div>
      <h3 className="cw-done__title">{created.name} está pronto para a aventura!</h3>
      <p className="u-muted u-sm">A ficha foi criada. Você pode ajustar qualquer detalhe a qualquer momento.</p>
      <div className="cw-done__actions">
        <Button
          variant="primary"
          size="lg"
          icon={<MapPin />}
          disabled={placed}
          onClick={() => void placeOnMap(created.id).then((ok) => {
            if (ok) {
              setPlaced(true);
              onClose();
            }
          })}
        >
          Colocar no mapa
        </Button>
        <Button size="lg" icon={<ScrollText />} onClick={openSheet}>Abrir ficha</Button>
        <Button size="lg" variant="ghost" onClick={() => { toast('Boa aventura!', 'success', 1800); onClose(); }}>Concluir</Button>
      </div>
    </div>
  );
}
