// Character sheet for the campaign's custom system (imported by the DM). Stat/skill values live in
// Character.custom; HP, defense, race, class/level, inventory and notes reuse the regular fields so tokens,
// combat and the roster keep working. Every roll goes through `roll.custom` (computed server side).
import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  Backpack, BookMarked, Dices, Eye, EyeOff, HeartPulse, ListChecks, NotebookPen, Plus, ScrollText, Search, Sparkles,
  Swords, Trash2, WandSparkles,
} from 'lucide-react';
import type { Character, CustomEntry, CustomSheet as SheetData, CustomSystem, ID, InventoryItem } from '@shared/types.ts';
import { computeStats } from '@shared/rules5e.ts';
import {
  customLevel, customRaceBonus, customStatBase, findCustomClass, findCustomRace, newCustomSheet, prettyFormula, statModifier,
} from '@shared/customSystem.ts';
import { getPref, setPref } from '../../net/session.ts';
import { useGame } from '../../store/game.ts';
import { useUi } from '../../store/ui.ts';
import { Button, Empty, IconButton } from '../../ui/index.tsx';
import {
  DraftInput, DraftTextarea, norm, NumInput, patchCharacter, Portrait, rollCustom, Section, signed, uid, useCanControl,
  useLiveCharacter, useSheetPrefs,
} from './common.tsx';
import { RollHint } from './SheetAbilities.tsx';
import './character.css';
import './custom-sheet.css';

type Tab = 'main' | 'skills' | 'actions' | 'items' | 'notes';

const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'main', label: 'Ficha', icon: <HeartPulse /> },
  { id: 'skills', label: 'Perícias', icon: <ListChecks /> },
  { id: 'actions', label: 'Ações', icon: <Swords /> },
  { id: 'items', label: 'Itens', icon: <Backpack /> },
  { id: 'notes', label: 'Notas', icon: <ScrollText /> },
];
const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

/** Hit die stored on ClassLevel must stay within the 5e schema (d4–d20). */
export function classHitDie(faces: number): number {
  return Math.min(20, Math.max(4, faces || 8));
}

/** Edit Character.custom from the freshest state, filling defaults for keys the sheet never touched. */
function patchSheet(id: ID, system: CustomSystem, fn: (s: SheetData) => SheetData): void {
  void patchCharacter(id, (cur) => ({ custom: fn(newCustomSheet(system, cur.custom)) }));
}

export function CustomCharacterSheet({ characterId, system, mode, headerActions }: {
  characterId: ID;
  system: CustomSystem;
  mode: 'embedded' | 'window';
  headerActions?: ReactNode;
}) {
  const c = useLiveCharacter(characterId);
  const canEdit = useCanControl(c);
  const prefKey = mode === 'embedded' ? 'csheet.tab' : `csheet.tab.${characterId}`;
  const [tab, setTabState] = useState<Tab>(() => {
    const saved = getPref<string>(prefKey, 'main');
    return (TAB_IDS.has(saved) ? saved : 'main') as Tab;
  });
  const setTab = (t: Tab) => {
    setTabState(t);
    setPref(prefKey, t);
  };

  if (!c) {
    return (
      <div className="cs cs--empty">
        <Empty icon={<ScrollText />} title="Ficha indisponível">Este personagem não existe mais ou não está visível para você.</Empty>
      </div>
    );
  }

  const props = { c, system, canEdit };
  return (
    <div className={`cs cs--${mode} csx`} data-ro={canEdit ? undefined : 'true'}>
      <Header {...props} mode={mode} extra={headerActions} />
      <div className="cs-tabs csx-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-active={tab === t.id ? 'true' : undefined}
            className="cs-tab"
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="cs-body" key={tab}>
        {tab === 'main' && <MainTab {...props} />}
        {tab === 'skills' && <SkillsTab {...props} />}
        {tab === 'actions' && <ActionsTab {...props} />}
        {tab === 'items' && <ItemsTab {...props} />}
        {tab === 'notes' && <NotesTab {...props} />}
      </div>
    </div>
  );
}

interface Props {
  c: Character;
  system: CustomSystem;
  canEdit: boolean;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const Header = memo(function Header({ c, system, canEdit, mode, extra }: Props & { mode: 'embedded' | 'window'; extra?: ReactNode }) {
  const isDM = useGame((s) => s.me?.role === 'dm');
  const secret = useSheetPrefs((s) => s.secret);
  const rollMode = useUi((s) => s.rollMode);
  const ac = useMemo(() => computeStats(c).ac, [c]);
  const cls = c.classes[0];
  const sub = [c.race, cls?.name].filter(Boolean).join(' · ');
  const hpPct = c.hp.max > 0 ? Math.max(0, Math.min(1, c.hp.cur / c.hp.max)) : 0;
  const hpTone = c.hp.cur <= 0 ? 'down' : hpPct <= 0.25 ? 'low' : hpPct <= 0.5 ? 'mid' : 'ok';
  const res = system.resources[0];
  const resVal = res ? c.custom?.resources[res.key] ?? { cur: res.max, max: res.max } : null;

  return (
    <header className="cs-head">
      <div className="cs-head__id">
        {mode === 'embedded' && <Portrait c={c} canEdit={canEdit} />}
        <div className="u-grow">
          {mode === 'embedded' && <h2 className="cs-head__name u-ellipsis">{c.name || 'Sem nome'}</h2>}
          <div className="cs-head__sub u-ellipsis" data-tip={sub || undefined}>{sub || 'Personagem sem classe'}</div>
          <div className="cs-head__badges">
            <span className="badge badge--gold" data-tip="Sistema customizado da mesa"><BookMarked size={11} /> {system.name}</span>
            {c.kind === 'npc' && <span className="badge badge--dm">PdM</span>}
            {rollMode !== 'normal' && (
              <span className={`badge ${rollMode === 'adv' ? 'badge--success' : 'badge--danger'}`}>
                {rollMode === 'adv' ? 'Vantagem' : 'Desvantagem'}
              </span>
            )}
          </div>
        </div>
        <div className="cs-head__actions">
          {isDM && (
            <button
              type="button"
              className="cs-secret"
              data-on={secret ? 'true' : undefined}
              data-tip={secret ? 'Rolagens secretas (só o Mestre vê)' : 'Rolagens públicas'}
              onClick={() => useSheetPrefs.getState().setSecret(!secret)}
            >
              {secret ? <EyeOff /> : <Eye />}
            </button>
          )}
          {extra}
        </div>
      </div>
      <div className="cs-vitals csx-vitals" data-count={res ? 4 : 3}>
        <div className="cs-vital cs-vital--ac" data-tip={system.defenseName}>
          <span className="cs-vital__label u-ellipsis">{system.defenseName.slice(0, 7)}</span>
          <span className="cs-vital__value">{ac}</span>
        </div>
        <div className="cs-vital cs-vital--hp" data-tone={hpTone} data-tip={system.hpName}>
          <span className="cs-vital__label">{system.hpName}</span>
          <span className="cs-vital__value">
            {c.hp.cur}
            <small>/{c.hp.max}</small>
            {c.hp.temp > 0 && <em>+{c.hp.temp}</em>}
          </span>
          <span className="cs-vital__bar"><i style={{ width: `${hpPct * 100}%` }} /></span>
        </div>
        <div className="cs-vital" data-tip="Nível">
          <span className="cs-vital__label">Nível</span>
          <span className="cs-vital__value">{customLevel(c)}</span>
        </div>
        {res && resVal && (
          <div className="cs-vital" data-tip={res.description || res.name}>
            <span className="cs-vital__label u-ellipsis">{res.name}</span>
            <span className="cs-vital__value">{resVal.cur}<small>/{resVal.max}</small></span>
          </div>
        )}
      </div>
    </header>
  );
});

// ---------------------------------------------------------------------------
// Ficha: identity, stats, vitals, resources
// ---------------------------------------------------------------------------

function MainTab({ c, system, canEdit }: Props) {
  const race = findCustomRace(system, c.race);
  const cls = c.classes[0];
  const sysClass = cls ? findCustomClass(system, cls.name) ?? system.classes.find((k) => k.key === cls.id) : undefined;
  const ac = useMemo(() => computeStats(c).ac, [c]);

  const setClass = (key: string) => {
    const k = system.classes.find((x) => x.key === key);
    void patchCharacter(c.id, (cur) => ({
      classes: k ? [{ id: k.key, name: k.name.slice(0, 60), level: cur.classes[0]?.level ?? 1, subclass: '', hitDie: classHitDie(k.hitDie) }] : [],
    }));
  };
  const setLevel = (level: number) => {
    void patchCharacter(c.id, (cur) => {
      const first = cur.classes[0] ?? { id: 'custom', name: '', level: 1, subclass: '', hitDie: 8 };
      return { classes: [{ ...first, level }, ...cur.classes.slice(1)] };
    });
  };

  return (
    <div className="cs-stack">
      <div className="cs-fields">
        <label className="cs-mini-field cs-mini-field--grow">
          <span>Raça</span>
          {!canEdit ? (
            <span className="cs-mini-field__static">{c.race || '—'}</span>
          ) : system.races.length ? (
            <select className="select" value={race?.key ?? (c.race ? '__other' : '')} onChange={(e) => {
              const r = system.races.find((x) => x.key === e.target.value);
              if (e.target.value !== '__other') void patchCharacter(c.id, { race: r?.name.slice(0, 80) ?? '' });
            }}>
              <option value="">—</option>
              {system.races.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
              {!race && c.race && <option value="__other">{c.race}</option>}
            </select>
          ) : (
            <DraftInput value={c.race} maxLength={80} onCommit={(v) => void patchCharacter(c.id, { race: v })} />
          )}
        </label>
        <label className="cs-mini-field cs-mini-field--grow">
          <span>Classe</span>
          {!canEdit ? (
            <span className="cs-mini-field__static">{cls?.name || '—'}</span>
          ) : system.classes.length ? (
            <select className="select" value={sysClass?.key ?? (cls?.name ? '__other' : '')} onChange={(e) => e.target.value !== '__other' && setClass(e.target.value)}>
              <option value="">—</option>
              {system.classes.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
              {!sysClass && cls?.name && <option value="__other">{cls.name}</option>}
            </select>
          ) : (
            <DraftInput value={cls?.name ?? ''} maxLength={60} onCommit={(v) => void patchCharacter(c.id, (cur) => {
              const first = cur.classes[0] ?? { id: 'custom', name: '', level: 1, subclass: '', hitDie: 8 };
              return { classes: v.trim() ? [{ ...first, name: v.trim() }] : [] };
            })} />
          )}
        </label>
        <label className="cs-mini-field">
          <span>Nível</span>
          {canEdit ? <NumInput value={customLevel(c)} min={1} max={20} onCommit={setLevel} /> : <span className="cs-mini-field__static">{customLevel(c)}</span>}
        </label>
      </div>

      {system.stats.length > 0 && (
        <>
          <div className="cs-abilities csx-stats">
            {system.stats.map((st) => (
              <StatCard
                key={st.key}
                cid={c.id}
                system={system}
                statKey={st.key}
                base={customStatBase(system, c, st.key)}
                bonus={customRaceBonus(system, c, st.key)}
                canEdit={canEdit}
              />
            ))}
          </div>
          {canEdit && <RollHint />}
        </>
      )}

      <Section title={`${system.hpName} e ${system.defenseName}`} icon={<HeartPulse />}>
        <div className="cs-fields">
          <label className="cs-mini-field">
            <span>{system.hpName}</span>
            {canEdit
              ? <NumInput value={c.hp.cur} min={-10_000} max={100_000} relative data-tip="Digite +5 ou -3 para somar" onCommit={(v) => void patchCharacter(c.id, (cur) => ({ hp: { ...cur.hp, cur: Math.min(v, cur.hp.max) } }))} />
              : <span className="cs-mini-field__static">{c.hp.cur}</span>}
          </label>
          <label className="cs-mini-field">
            <span>Máximo</span>
            {canEdit
              ? <NumInput value={c.hp.max} min={0} max={100_000} onCommit={(v) => void patchCharacter(c.id, (cur) => ({ hp: { ...cur.hp, max: v, cur: Math.min(cur.hp.cur, v) } }))} />
              : <span className="cs-mini-field__static">{c.hp.max}</span>}
          </label>
          <label className="cs-mini-field">
            <span>Temporário</span>
            {canEdit
              ? <NumInput value={c.hp.temp} min={0} max={100_000} onCommit={(v) => void patchCharacter(c.id, (cur) => ({ hp: { ...cur.hp, temp: v } }))} />
              : <span className="cs-mini-field__static">{c.hp.temp}</span>}
          </label>
          <label className="cs-mini-field">
            <span>{system.defenseName}</span>
            {canEdit
              ? <NumInput value={ac} min={0} max={60} onCommit={(v) => void patchCharacter(c.id, { ac: { mode: 'manual', value: v, bonus: 0 } })} />
              : <span className="cs-mini-field__static">{ac}</span>}
          </label>
        </div>
      </Section>

      {system.resources.length > 0 && (
        <Section title="Recursos" icon={<Sparkles />}>
          <div className="csx-resources">
            {system.resources.map((r) => {
              const v = c.custom?.resources[r.key] ?? { cur: r.max, max: r.max };
              const setRes = (next: { cur: number; max: number }) =>
                patchSheet(c.id, system, (s) => ({ ...s, resources: { ...s.resources, [r.key]: next } }));
              return (
                <div key={r.key} className="csx-res" data-tip={r.description || undefined}>
                  <span className="csx-res__name u-ellipsis">{r.name}</span>
                  {canEdit ? (
                    <>
                      <IconButton size="sm" icon={<span className="csx-step">−</span>} label="Gastar 1" onClick={() => setRes({ ...v, cur: v.cur - 1 })} />
                      <NumInput className="input input--num input--sm csx-res__num" value={v.cur} min={-10_000} max={100_000} relative aria-label={`${r.name} atual`} onCommit={(n) => setRes({ ...v, cur: n })} />
                      <span className="u-dim">/</span>
                      <NumInput className="input input--num input--sm csx-res__num" value={v.max} min={0} max={100_000} aria-label={`${r.name} máximo`} onCommit={(n) => setRes({ cur: Math.min(v.cur, n), max: n })} />
                      <IconButton size="sm" icon={<Plus />} label="Recuperar 1" onClick={() => setRes({ ...v, cur: Math.min(v.max, v.cur + 1) })} />
                    </>
                  ) : (
                    <span className="u-tabular">{v.cur}/{v.max}</span>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}
    </div>
  );
}

const StatCard = memo(function StatCard({ cid, system, statKey, base, bonus, canEdit }: {
  cid: ID;
  system: CustomSystem;
  statKey: string;
  base: number;
  bonus: number;
  canEdit: boolean;
}) {
  const st = system.stats.find((s) => s.key === statKey)!;
  const value = base + bonus;
  const showMod = system.modifier !== 'value';
  const roll = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (canEdit) rollCustom(cid, 'stat', st.key, e);
  };
  const tip = [`${canEdit ? 'Teste de ' : ''}${st.name}`, bonus ? `${signed(bonus)} da raça` : '', st.description].filter(Boolean).join(' — ');
  return (
    <div
      className="cs-ability csx-stat"
      role="button"
      tabIndex={canEdit ? 0 : -1}
      aria-disabled={!canEdit}
      data-tip={tip}
      onClick={roll}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) roll(e);
      }}
    >
      <span className="cs-ability__short">{st.short}</span>
      <span className="cs-ability__mod">{showMod ? signed(statModifier(system.modifier, value)) : value}</span>
      <span className="csx-stat__name u-ellipsis">{st.name}</span>
      <span className="cs-ability__score" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <NumInput
            className="cs-ability__input"
            value={base}
            min={st.min}
            max={st.max}
            aria-label={`Valor de ${st.name}`}
            onCommit={(v) => patchSheet(cid, system, (s) => ({ ...s, stats: { ...s.stats, [st.key]: v } }))}
          />
        ) : (
          <span className="u-tabular">{base}</span>
        )}
      </span>
      {bonus !== 0 && <span className="csx-stat__bonus">{signed(bonus)}</span>}
      {canEdit && <Dices className="cs-ability__die" />}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Perícias
// ---------------------------------------------------------------------------

function SkillsTab({ c, system, canEdit }: Props) {
  const [q, setQ] = useState('');
  const cls = c.classes[0];
  const sysClass = cls ? findCustomClass(system, cls.name) ?? system.classes.find((k) => k.key === cls.id) : undefined;
  const classSkills = new Set(sysClass?.skills ?? []);
  const statShort = Object.fromEntries(system.stats.map((s) => [s.key, s.short]));
  const nq = norm(q);
  const skills = system.skills.filter((s) => !nq || norm(`${s.name} ${s.description}`).includes(nq));

  if (!system.skills.length) {
    return <div className="cs-empty-line">Este sistema não tem perícias.</div>;
  }
  return (
    <div className="cs-stack">
      <div className="u-row u-gap-3">
        <div className="cs-search">
          <Search />
          <input className="input input--sm" placeholder="Buscar perícia…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      {canEdit && <RollHint />}
      <div className="u-xs u-dim">Teste: <code className="csx-formula">{prettyFormula(system.skillFormula, system)}</code> · o número é o valor da perícia na ficha.</div>
      <div className="cs-skills">
        {skills.map((sk) => {
          const value = c.custom?.skills[sk.key] ?? 0;
          const roll = (e: React.MouseEvent | React.KeyboardEvent) => canEdit && rollCustom(c.id, 'skill', sk.key, e);
          return (
            <div
              key={sk.key}
              className="cs-row csx-skill"
              role="button"
              tabIndex={canEdit ? 0 : -1}
              aria-disabled={!canEdit}
              data-tip={sk.description || undefined}
              onClick={roll}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.target === e.currentTarget) roll(e);
              }}
            >
              <span className="cs-prof" data-level={classSkills.has(sk.key) ? 1 : 0} aria-label={classSkills.has(sk.key) ? 'Perícia da classe' : undefined} />
              <span className="cs-row__name">{sk.name}</span>
              <span className="cs-row__ab">{sk.stat ? statShort[sk.stat] : ''}</span>
              <span className="cs-row__value" onClick={(e) => e.stopPropagation()}>
                {canEdit ? (
                  <NumInput
                    className="input input--num input--sm csx-skill__input"
                    value={value}
                    min={-1000}
                    max={1000}
                    aria-label={`Valor de ${sk.name}`}
                    onCommit={(v) => patchSheet(c.id, system, (s) => {
                      const next = { ...s.skills };
                      if (v) next[sk.key] = v;
                      else delete next[sk.key];
                      return { ...s, skills: next };
                    })}
                  />
                ) : (
                  value
                )}
              </span>
            </div>
          );
        })}
        {!skills.length && <div className="cs-empty-line">Nada encontrado para “{q}”.</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ações: mechanics, powers and equipment with rolls
// ---------------------------------------------------------------------------

function ActionsTab({ c, system, canEdit }: Props) {
  const [q, setQ] = useState('');
  const nq = norm(q);
  const filter = (list: CustomEntry[]) => list.filter((e) => !nq || norm(`${e.name} ${e.tag} ${e.detail} ${e.description}`).includes(nq));
  const groups: { kind: 'mechanic' | 'power' | 'equipment'; title: string; icon: ReactNode; list: CustomEntry[] }[] = [
    { kind: 'mechanic', title: 'Mecânicas', icon: <Sparkles />, list: filter(system.mechanics) },
    { kind: 'power', title: 'Poderes e magias', icon: <WandSparkles />, list: filter(system.powers) },
    { kind: 'equipment', title: 'Equipamento', icon: <Swords />, list: filter(system.equipment.filter((e) => e.formula)) },
  ];
  const any = groups.some((g) => g.list.length);
  return (
    <div className="cs-stack">
      <div className="cs-search">
        <Search />
        <input className="input input--sm" placeholder="Buscar mecânica, poder, arma…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {canEdit && <RollHint />}
      {groups.map((g) => g.list.length > 0 && (
        <Section key={g.kind} title={<>{g.title} <span className="u-dim u-xs">{g.list.length}</span></>} icon={g.icon} collapsible={!nq} prefKey={`csx.${g.kind}`}>
          <div className="csx-entries">
            {g.list.map((e) => <EntryRow key={e.key} cid={c.id} kind={g.kind} entry={e} system={system} canEdit={canEdit} />)}
          </div>
        </Section>
      ))}
      {!any && <div className="cs-empty-line">{nq ? `Nada encontrado para “${q}”.` : 'O sistema não tem mecânicas, poderes ou armas com rolagem.'}</div>}
    </div>
  );
}

const EntryRow = memo(function EntryRow({ cid, kind, entry, system, canEdit }: {
  cid: ID;
  kind: 'mechanic' | 'power' | 'equipment';
  entry: CustomEntry;
  system: CustomSystem;
  canEdit: boolean;
}) {
  const rollable = canEdit && !!entry.formula;
  const roll = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (rollable) rollCustom(cid, kind, entry.key, e);
  };
  return (
    <div
      className="csx-entry"
      role={rollable ? 'button' : undefined}
      tabIndex={rollable ? 0 : -1}
      aria-disabled={!rollable}
      onClick={roll}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) roll(e);
      }}
    >
      <div className="csx-entry__head">
        <span className="csx-entry__name">{entry.name}</span>
        {entry.tag && <span className="badge">{entry.tag}</span>}
        <span className="u-grow" />
        {entry.formula && (
          <span className="csx-entry__roll">
            <code className="csx-formula">{prettyFormula(entry.formula, system)}</code>
            {rollable && <Dices />}
          </span>
        )}
      </div>
      {entry.detail && <div className="csx-entry__detail">{entry.detail}</div>}
      {entry.description && <p className="csx-entry__desc" data-tip={entry.description.length > 160 ? entry.description : undefined}>{entry.description}</p>}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Itens
// ---------------------------------------------------------------------------

function ItemsTab({ c, system, canEdit }: Props) {
  const [pick, setPick] = useState('');
  const [free, setFree] = useState('');
  const byKey = useMemo(() => new Map(system.equipment.map((e) => [e.key, e])), [system.equipment]);
  const add = (item: Pick<InventoryItem, 'name' | 'ref' | 'notes'>) => {
    void patchCharacter(c.id, (cur) => ({
      inventory: [...cur.inventory, { id: uid(), qty: 1, weight: 0, equipped: false, attuned: false, armor: null, ...item }].slice(0, 500),
    }));
  };
  const update = (id: ID, patch: Partial<InventoryItem>) =>
    void patchCharacter(c.id, (cur) => ({ inventory: cur.inventory.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const remove = (id: ID) => void patchCharacter(c.id, (cur) => ({ inventory: cur.inventory.filter((i) => i.id !== id) }));

  return (
    <div className="cs-stack">
      {canEdit && (
        <div className="csx-add">
          {system.equipment.length > 0 && (
            <div className="u-row">
              <select className="select" value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Item do sistema">
                <option value="">Item do sistema…</option>
                {system.equipment.map((e) => <option key={e.key} value={e.key}>{e.name}{e.tag ? ` (${e.tag})` : ''}</option>)}
              </select>
              <Button size="sm" icon={<Plus />} disabled={!pick} onClick={() => {
                const e = byKey.get(pick);
                if (e) add({ name: e.name.slice(0, 120), ref: `sys:${e.key}`, notes: [e.detail, e.description].filter(Boolean).join('\n').slice(0, 4_000) });
                setPick('');
              }}>Adicionar</Button>
            </div>
          )}
          <form className="u-row" onSubmit={(e) => {
            e.preventDefault();
            if (!free.trim()) return;
            add({ name: free.trim().slice(0, 120), ref: null, notes: '' });
            setFree('');
          }}>
            <input className="input input--sm" placeholder="Outro item…" value={free} maxLength={120} onChange={(e) => setFree(e.target.value)} />
            <Button size="sm" type="submit" icon={<Plus />} disabled={!free.trim()}>Adicionar</Button>
          </form>
        </div>
      )}
      {c.inventory.length === 0 && <div className="cs-empty-line">Mochila vazia.</div>}
      <div className="csx-items">
        {c.inventory.map((it) => {
          const entry = it.ref?.startsWith('sys:') ? byKey.get(it.ref.slice(4)) : undefined;
          return (
            <div key={it.id} className="csx-item">
              <div className="csx-item__head">
                {canEdit ? (
                  <NumInput className="input input--num input--sm csx-item__qty" value={it.qty} min={0} max={1_000_000} aria-label="Quantidade" onCommit={(v) => update(it.id, { qty: v })} />
                ) : (
                  <span className="csx-item__qty u-tabular">{it.qty}×</span>
                )}
                <span className="csx-item__name u-ellipsis" data-tip={it.notes || undefined}>{it.name}</span>
                {entry?.tag && <span className="badge">{entry.tag}</span>}
                {entry?.formula && (
                  <button
                    type="button"
                    className="csx-item__roll"
                    disabled={!canEdit}
                    data-tip={`Rolar ${prettyFormula(entry.formula, system)}`}
                    onClick={(e) => rollCustom(c.id, 'equipment', entry.key, e)}
                  >
                    <Dices /> <code>{prettyFormula(entry.formula, system)}</code>
                  </button>
                )}
                {canEdit && <IconButton size="sm" danger icon={<Trash2 />} label="Remover item" onClick={() => remove(it.id)} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notas: race traits, class features, notes, backstory
// ---------------------------------------------------------------------------

function NotesTab({ c, system, canEdit }: Props) {
  const race = findCustomRace(system, c.race);
  const cls = c.classes[0];
  const sysClass = cls ? findCustomClass(system, cls.name) ?? system.classes.find((k) => k.key === cls.id) : undefined;
  return (
    <div className="cs-stack">
      {race && (race.traits.length > 0 || race.description) && (
        <Section title={`Raça: ${race.name}`} icon={<BookMarked />} collapsible prefKey="csx.race">
          {race.description && <p className="csx-entry__desc">{race.description}</p>}
          {race.traits.length > 0 && <ul className="csx-bullets">{race.traits.map((t) => <li key={t}>{t}</li>)}</ul>}
        </Section>
      )}
      {sysClass && (sysClass.features.length > 0 || sysClass.description) && (
        <Section title={`Classe: ${sysClass.name}`} icon={<Swords />} collapsible prefKey="csx.class">
          {sysClass.description && <p className="csx-entry__desc">{sysClass.description}</p>}
          {sysClass.features.length > 0 && <ul className="csx-bullets">{sysClass.features.map((f) => <li key={f}>{f}</li>)}</ul>}
        </Section>
      )}
      <Section title="Anotações" icon={<NotebookPen />}>
        {canEdit
          ? <DraftTextarea value={c.notes} maxLength={40_000} placeholder="Habilidades, poderes conhecidos, contatos…" onCommit={(v) => void patchCharacter(c.id, { notes: v })} />
          : <p className="csx-entry__desc">{c.notes || '—'}</p>}
      </Section>
      <Section title="História" icon={<ScrollText />} collapsible prefKey="csx.backstory">
        {canEdit
          ? <DraftTextarea className="textarea cs-flavor" value={c.backstory} maxLength={40_000} placeholder="De onde veio, o que busca…" onCommit={(v) => void patchCharacter(c.id, { backstory: v })} />
          : <p className="csx-entry__desc cs-flavor">{c.backstory || '—'}</p>}
      </Section>
    </div>
  );
}
