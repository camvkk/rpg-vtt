// "Magias" tab: spellcasting stats, slot trackers, known/prepared spells, casting with upcast, SRD spell picker.
import { memo, useMemo, useState } from 'react';
import {
  BookOpen, Check, Plus, RefreshCw, Search, Settings2, Sparkles, Trash2, WandSparkles, X,
} from 'lucide-react';
import type { Ability, Character, ID, KnownSpell, Spellcasting } from '@shared/types.ts';
import type { SpellData } from '@shared/data5e/types.ts';
import { ABILITY_NAME, DAMAGE_TYPE_COLOR, DAMAGE_TYPE_NAME } from '@shared/rules5e.ts';
import { CLASSES_BY_ID } from '@shared/data5e/classes.ts';
import { act } from '../../net/socket.ts';
import { Button, confirmDialog, Empty, IconButton, Popover, Segmented, Spinner, Toggle } from '../../ui/index.tsx';
import {
  castSpell, DraftInput, DraftTextarea, norm, NumInput, patchCharacter, Pips, signed, uid, useSpellsModule, type TabProps,
} from './common.tsx';
import { casterAbility, classPrepares, slotsFor } from './build.ts';

const ABILITIES: Ability[] = ['int', 'wis', 'cha', 'str', 'dex', 'con'];
const SCHOOL: Record<string, string> = {
  abjuration: 'Abjuração', conjuration: 'Conjuração', divination: 'Adivinhação', enchantment: 'Encantamento',
  evocation: 'Evocação', illusion: 'Ilusão', necromancy: 'Necromancia', transmutation: 'Transmutação',
};

export function levelLabel(l: number): string {
  return l === 0 ? 'Truques' : `${l}º nível`;
}

export function SpellsTab(props: TabProps) {
  if (!props.c.spellcasting) return <NoSpellcasting c={props.c} canEdit={props.canEdit} />;
  return <SpellcastingView {...props} sc={props.c.spellcasting} />;
}

function NoSpellcasting({ c, canEdit }: { c: Character; canEdit: boolean }) {
  const enable = () => {
    const { slots, pact } = slotsFor(c.classes, null);
    void patchCharacter(c.id, { spellcasting: { ability: casterAbility(c.classes) ?? 'int', slots, pact, spells: [] } });
  };
  return (
    <div className="cs-stack">
      <Empty icon={<WandSparkles />} title="Sem conjuração">
        {canEdit ? 'Este personagem ainda não conjura magias.' : 'Este personagem não conjura magias.'}
      </Empty>
      {canEdit && <Button variant="arcane" icon={<Sparkles />} onClick={enable}>Habilitar conjuração</Button>}
    </div>
  );
}

function SpellcastingView({ c, stats, canEdit, sc }: TabProps & { sc: Spellcasting }) {
  const [adding, setAdding] = useState(false);
  const [editSlots, setEditSlots] = useState(false);
  const [expanded, setExpanded] = useState<ID | null>(null);
  const [onlyPrepared, setOnlyPrepared] = useState(false);
  const mod = useSpellsModule();
  const prepares = classPrepares(c.classes);
  const spell = stats.spell;

  const groups = useMemo(() => {
    const map = new Map<number, KnownSpell[]>();
    for (const s of sc.spells) {
      if (onlyPrepared && prepares && s.level > 0 && !s.prepared) continue;
      const list = map.get(s.level) ?? [];
      list.push(s);
      map.set(s.level, list);
    }
    for (const lvl of Object.keys(sc.slots)) if ((sc.slots[lvl]?.max ?? 0) > 0 && !map.has(Number(lvl))) map.set(Number(lvl), []);
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [sc.spells, sc.slots, onlyPrepared, prepares]);

  const preparedCount = sc.spells.filter((s) => s.level > 0 && s.prepared).length;

  return (
    <div className="cs-stack">
      <div className="cs-spellhead">
        <label className="cs-mini-field">
          <span>Atributo</span>
          <select
            className="select input--sm"
            value={sc.ability}
            disabled={!canEdit}
            onChange={(e) => void patchCharacter(c.id, (cur) => (cur.spellcasting ? { spellcasting: { ...cur.spellcasting, ability: e.target.value as Ability } } : null))}
          >
            {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAME[a]}</option>)}
          </select>
        </label>
        <div className="cs-spellstat" data-tip="Bônus de ataque mágico">
          <span>Ataque</span>
          <strong>{signed(spell?.attack ?? 0)}</strong>
        </div>
        <div className="cs-spellstat" data-tip="CD de resistência das magias">
          <span>CD</span>
          <strong>{spell?.dc ?? 10}</strong>
        </div>
        {prepares && (
          <div className="cs-spellstat" data-tip="Magias preparadas (sugerido: mod. + nível)">
            <span>Prep.</span>
            <strong>{preparedCount}</strong>
          </div>
        )}
      </div>

      {sc.pact && (
        <div className="cs-slotrow cs-slotrow--pact">
          <span className="cs-slotrow__label">Pacto <small>{sc.pact.level}º nível</small></span>
          <Pips
            total={sc.pact.max}
            filled={sc.pact.max - sc.pact.used}
            tone="arcane"
            disabled={!canEdit}
            label="Espaços de pacto"
            onSpend={() => void act('character.resource', { id: c.id, kind: 'pact', key: 'pact', delta: 1 })}
            onRestore={() => void act('character.resource', { id: c.id, kind: 'pact', key: 'pact', delta: -1 })}
          />
          <span className="u-xs u-muted u-tabular">{sc.pact.max - sc.pact.used}/{sc.pact.max}</span>
        </div>
      )}

      <div className="u-row u-between">
        {prepares ? (
          <Segmented
            value={onlyPrepared ? 'prep' : 'all'}
            options={[{ value: 'all', label: 'Todas' }, { value: 'prep', label: 'Preparadas' }]}
            onChange={(v) => setOnlyPrepared(v === 'prep')}
          />
        ) : <span />}
        {canEdit && <IconButton size="sm" icon={<Settings2 />} label="Editar espaços de magia" active={editSlots} onClick={() => setEditSlots(!editSlots)} />}
      </div>

      {editSlots && canEdit && <SlotEditor c={c} sc={sc} />}

      {groups.length === 0 && <div className="cs-empty-line">Nenhuma magia conhecida ainda.</div>}
      {groups.map(([lvl, list]) => (
        <SpellGroup
          key={lvl}
          c={c}
          sc={sc}
          level={lvl}
          spells={list}
          canEdit={canEdit}
          prepares={prepares}
          data={mod?.SPELLS_BY_ID ?? null}
          expanded={expanded}
          onExpand={(id) => setExpanded(expanded === id ? null : id)}
        />
      ))}

      {canEdit && (adding
        ? <SpellPicker c={c} sc={sc} prepares={prepares} onClose={() => setAdding(false)} />
        : <Button block variant="arcane" icon={<Plus />} onClick={() => setAdding(true)}>Adicionar magia</Button>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

function SlotEditor({ c, sc }: { c: Character; sc: Spellcasting }) {
  const setMax = (lvl: number, max: number) => patchCharacter(c.id, (cur) => {
    if (!cur.spellcasting) return null;
    const slots = { ...cur.spellcasting.slots };
    if (max <= 0) delete slots[String(lvl)];
    else slots[String(lvl)] = { max, used: Math.min(slots[String(lvl)]?.used ?? 0, max) };
    return { spellcasting: { ...cur.spellcasting, slots } };
  });
  const setPact = (patch: Partial<{ max: number; level: number }>) => patchCharacter(c.id, (cur) => {
    if (!cur.spellcasting) return null;
    const prev = cur.spellcasting.pact ?? { max: 0, used: 0, level: 1 };
    const next = { ...prev, ...patch };
    next.used = Math.min(next.used, next.max);
    return { spellcasting: { ...cur.spellcasting, pact: next.max > 0 ? next : null } };
  });
  const recalc = () => patchCharacter(c.id, (cur) => (cur.spellcasting ? { spellcasting: { ...cur.spellcasting, ...slotsFor(cur.classes, cur.spellcasting) } } : null));
  const disable = async () => {
    if (await confirmDialog('Remover conjuração', 'Remover espaços e a lista de magias desta ficha?', { danger: true, ok: 'Remover' })) {
      void patchCharacter(c.id, { spellcasting: null });
    }
  };
  return (
    <div className="cs-editor">
      <div className="cs-label">Espaços de magia (máximo por nível)</div>
      <div className="cs-slotgrid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
          <label key={l} className="cs-mini-field">
            <span>{l}º</span>
            <NumInput className="input input--num input--sm" value={sc.slots[String(l)]?.max ?? 0} min={0} max={20} onCommit={(v) => void setMax(l, v)} />
          </label>
        ))}
      </div>
      <div className="cs-fields">
        <label className="cs-mini-field">
          <span>Pacto: espaços</span>
          <NumInput className="input input--num input--sm" value={sc.pact?.max ?? 0} min={0} max={20} onCommit={(v) => void setPact({ max: v })} />
        </label>
        <label className="cs-mini-field">
          <span>Pacto: nível</span>
          <NumInput className="input input--num input--sm" value={sc.pact?.level ?? 1} min={1} max={9} onCommit={(v) => void setPact({ level: v })} />
        </label>
      </div>
      <div className="cs-editor__foot">
        <button type="button" className="btn btn--sm" onClick={() => void recalc()}><RefreshCw /> Recalcular pelas classes</button>
        <button type="button" className="btn btn--danger btn--sm" onClick={() => void disable()}><Trash2 /> Remover</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spell list
// ---------------------------------------------------------------------------

const SpellGroup = memo(function SpellGroup({ c, sc, level, spells, canEdit, prepares, data, expanded, onExpand }: {
  c: Character;
  sc: Spellcasting;
  level: number;
  spells: KnownSpell[];
  canEdit: boolean;
  prepares: boolean;
  data: Record<string, SpellData> | null;
  expanded: ID | null;
  onExpand: (id: ID) => void;
}) {
  const slot = level > 0 ? sc.slots[String(level)] : undefined;
  return (
    <div className="cs-spellgroup">
      <div className="cs-spellgroup__head">
        <span className="cs-spellgroup__title">{levelLabel(level)}</span>
        {slot && slot.max > 0 && (
          <>
            <Pips
              total={slot.max}
              filled={slot.max - slot.used}
              tone="arcane"
              disabled={!canEdit}
              label={`Espaços de ${level}º nível`}
              onSpend={() => void act('character.resource', { id: c.id, kind: 'slot', key: String(level), delta: 1 })}
              onRestore={() => void act('character.resource', { id: c.id, kind: 'slot', key: String(level), delta: -1 })}
            />
            <span className="u-xs u-muted u-tabular">{slot.max - slot.used}/{slot.max}</span>
          </>
        )}
      </div>
      {spells.length === 0 && <div className="cs-empty-line cs-empty-line--sm">Nenhuma magia deste nível.</div>}
      {spells.map((s) => (
        <SpellRow
          key={s.id}
          c={c}
          sc={sc}
          s={s}
          d={s.ref && data ? data[s.ref] ?? null : null}
          canEdit={canEdit}
          prepares={prepares}
          open={expanded === s.id}
          onToggle={() => onExpand(s.id)}
        />
      ))}
    </div>
  );
});

function SpellRow({ c, sc, s, d, canEdit, prepares, open, onToggle }: {
  c: Character;
  sc: Spellcasting;
  s: KnownSpell;
  d: SpellData | null;
  canEdit: boolean;
  prepares: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const updSpell = (fn: (k: KnownSpell) => Partial<KnownSpell>) => patchCharacter(c.id, (cur) => (cur.spellcasting
    ? { spellcasting: { ...cur.spellcasting, spells: cur.spellcasting.spells.map((k) => (k.id === s.id ? { ...k, ...fn(k) } : k)) } }
    : null));
  const remove = async () => {
    if (await confirmDialog('Remover magia', `Remover "${s.name}" da lista?`, { danger: true, ok: 'Remover' })) {
      void patchCharacter(c.id, (cur) => (cur.spellcasting
        ? { spellcasting: { ...cur.spellcasting, spells: cur.spellcasting.spells.filter((k) => k.id !== s.id) } }
        : null));
    }
  };
  const cast = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (s.level === 0) {
      void castSpell(c.id, s.id, 0, false, e);
      return;
    }
    setAnchor(anchor ? null : e.currentTarget);
  };
  const dmg = d?.damage?.[0];
  const meta = d ? [d.castingTime, d.range].filter(Boolean).join(' · ') : s.notes ? 'Personalizada' : '';
  const unprepared = prepares && s.level > 0 && !s.prepared;
  return (
    <div className="cs-spell" data-open={open ? 'true' : undefined} data-unprepared={unprepared ? 'true' : undefined}>
      <div className="cs-spell__line">
        {prepares && s.level > 0 && (
          <button
            type="button"
            className="cs-prep"
            data-on={s.prepared ? 'true' : undefined}
            disabled={!canEdit}
            data-tip={s.prepared ? 'Preparada' : 'Não preparada'}
            aria-pressed={s.prepared}
            onClick={() => void updSpell((k) => ({ prepared: !k.prepared }))}
          />
        )}
        <button type="button" className="cs-spell__name" onClick={onToggle} aria-expanded={open}>
          <span className="u-ellipsis">{s.name}</span>
          {d?.concentration && <span className="cs-tag" data-tip="Concentração">C</span>}
          {d?.ritual && <span className="cs-tag" data-tip="Ritual">R</span>}
        </button>
        {dmg && (
          <span className="cs-dmg cs-spell__dmg" style={{ '--dmg': DAMAGE_TYPE_COLOR[dmg.type] } as React.CSSProperties}>
            {dmg.formula.replace(/\+?@mod/, '+mod')}
          </span>
        )}
        {d?.heal && <span className="cs-dmg cs-spell__dmg" style={{ '--dmg': DAMAGE_TYPE_COLOR.healing } as React.CSSProperties}>{d.heal.replace(/\+?@mod/, '+mod')}</span>}
        {canEdit && (
          <button type="button" className="cs-cast" onClick={cast} data-tip={s.level === 0 ? 'Usar truque' : 'Conjurar (escolha o espaço)'}>
            <WandSparkles />
          </button>
        )}
      </div>
      {meta && !open && <div className="cs-spell__meta">{meta}</div>}
      {open && <SpellDetails s={s} d={d} canEdit={canEdit} onRemove={() => void remove()} updSpell={updSpell} />}
      {anchor && <CastPopover c={c} sc={sc} s={s} anchor={anchor} unprepared={unprepared} onClose={() => setAnchor(null)} />}
    </div>
  );
}

function SpellDetails({ s, d, canEdit, onRemove, updSpell }: {
  s: KnownSpell;
  d: SpellData | null;
  canEdit: boolean;
  onRemove: () => void;
  updSpell: (fn: (k: KnownSpell) => Partial<KnownSpell>) => Promise<boolean>;
}) {
  return (
    <div className="cs-spell__details">
      {d ? (
        <>
          <div className="cs-spell__school">{d.level === 0 ? `Truque de ${SCHOOL[d.school] ?? d.school}` : `${SCHOOL[d.school] ?? d.school} de ${d.level}º nível`}</div>
          <dl className="cs-spell__facts">
            <div><dt>Tempo</dt><dd>{d.castingTime}</dd></div>
            <div><dt>Alcance</dt><dd>{d.range}</dd></div>
            <div><dt>Componentes</dt><dd>{[d.components.v && 'V', d.components.s && 'S', d.components.m && `M (${d.components.m})`].filter(Boolean).join(', ')}</dd></div>
            <div><dt>Duração</dt><dd>{d.concentration ? `Concentração, ${d.duration}` : d.duration}</dd></div>
          </dl>
          {(d.damage?.length || d.save || d.attack) && (
            <div className="cs-spell__auto">
              {d.attack && <span className="badge badge--info">Ataque mágico</span>}
              {d.save && <span className="badge badge--dm">Salvaguarda de {ABILITY_NAME[d.save]}{d.half ? ' (metade)' : ''}</span>}
              {d.damage?.map((x, i) => <span key={i} className="badge">{x.formula.replace(/\+?@mod/, '+mod')} {DAMAGE_TYPE_NAME[x.type]}</span>)}
              {d.upcast && <span className="badge badge--gold">+{d.upcast}/nível</span>}
            </div>
          )}
          <p className="cs-spell__desc">{d.description}</p>
          {d.higherLevels && <p className="cs-spell__desc"><strong>Em níveis superiores.</strong> {d.higherLevels}</p>}
        </>
      ) : s.ref ? (
        <div className="u-center u-p-3"><Spinner /></div>
      ) : canEdit ? (
        <div className="cs-fields">
          <label className="cs-mini-field cs-mini-field--grow">
            <span>Nome</span>
            <DraftInput className="input input--sm" value={s.name} maxLength={120} onCommit={(v) => void updSpell(() => ({ name: v || s.name }))} />
          </label>
          <label className="cs-mini-field">
            <span>Nível</span>
            <NumInput className="input input--num input--sm" value={s.level} min={0} max={9} onCommit={(v) => void updSpell(() => ({ level: v }))} />
          </label>
        </div>
      ) : null}
      {(canEdit || s.notes) && (
        <label className="cs-mini-field cs-mini-field--wide">
          <span>{d ? 'Anotações' : 'Descrição'}</span>
          <DraftTextarea className="textarea cs-textarea--sm" value={s.notes} maxLength={4000} rows={2} readOnly={!canEdit} onCommit={(v) => void updSpell(() => ({ notes: v }))} />
        </label>
      )}
      {canEdit && (
        <div className="cs-editor__foot">
          <button type="button" className="btn btn--danger btn--sm" onClick={onRemove}><Trash2 /> Remover</button>
        </div>
      )}
    </div>
  );
}

function CastPopover({ c, sc, s, anchor, unprepared, onClose }: {
  c: Character;
  sc: Spellcasting;
  s: KnownSpell;
  anchor: HTMLElement;
  unprepared: boolean;
  onClose: () => void;
}) {
  const options: { level: number; avail: number; max: number; pact: boolean }[] = [];
  for (let l = Math.max(1, s.level); l <= 9; l++) {
    const slot = sc.slots[String(l)];
    if (slot && slot.max > 0) options.push({ level: l, avail: slot.max - slot.used, max: slot.max, pact: false });
  }
  if (sc.pact && sc.pact.level >= s.level) options.push({ level: sc.pact.level, avail: sc.pact.max - sc.pact.used, max: sc.pact.max, pact: true });
  const go = (level: number, consume: boolean, e: React.MouseEvent) => {
    void castSpell(c.id, s.id, level, consume, e);
    onClose();
  };
  return (
    <Popover anchor={anchor} onClose={onClose} placement="bottom" className="cs-pop cs-castpop">
      <div className="cs-pop__title"><WandSparkles /> {s.name}</div>
      {unprepared && <div className="cs-hint cs-hint--warn">Magia não preparada.</div>}
      {options.length === 0 && <div className="u-xs u-muted">Nenhum espaço de magia de {s.level}º nível ou superior.</div>}
      <div className="cs-castpop__opts">
        {options.map((o) => (
          <button
            key={`${o.pact ? 'p' : 's'}${o.level}`}
            type="button"
            className="cs-castopt"
            disabled={o.avail <= 0}
            onClick={(e) => go(o.level, true, e)}
          >
            <span className="cs-castopt__lvl">{o.level}º</span>
            <span className="u-grow">{o.pact ? 'Espaço de pacto' : o.level > s.level ? 'Elevado' : 'Espaço'}</span>
            <span className="u-xs u-muted u-tabular">{o.avail}/{o.max}</span>
          </button>
        ))}
      </div>
      <button type="button" className="btn btn--ghost btn--sm btn--block" onClick={(e) => go(s.level, false, e)}>
        Conjurar sem gastar espaço
      </button>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Spell picker (SRD)
// ---------------------------------------------------------------------------

function SpellPicker({ c, sc, prepares, onClose }: {
  c: Character;
  sc: Spellcasting;
  prepares: boolean;
  onClose: () => void;
}) {
  const mod = useSpellsModule();
  const [q, setQ] = useState('');
  const [level, setLevel] = useState(-1);
  const casterClasses = useMemo(() => c.classes.map((k) => k.id).filter((id) => CLASSES_BY_ID[id]?.spellcasting), [c.classes]);
  const [mine, setMine] = useState(casterClasses.length > 0);
  const known = useMemo(() => new Set(sc.spells.map((s) => s.ref).filter(Boolean)), [sc.spells]);
  const maxSlot = Math.max(0, ...Object.entries(sc.slots).filter(([, v]) => v.max > 0).map(([k]) => Number(k)), sc.pact?.level ?? 0);

  const results = useMemo(() => {
    if (!mod) return [];
    const nq = norm(q);
    let list = mod.SPELLS;
    if (mine && casterClasses.length) list = list.filter((s) => s.classes.some((x) => casterClasses.includes(x)));
    if (level >= 0) list = list.filter((s) => s.level === level);
    if (nq) list = list.filter((s) => norm(s.name).includes(nq) || norm(s.nameEn).includes(nq));
    return list.slice(0, 80);
  }, [mod, q, level, mine, casterClasses]);

  const add = (s: SpellData) => {
    void patchCharacter(c.id, (cur) => (cur.spellcasting
      ? {
          spellcasting: {
            ...cur.spellcasting,
            spells: [...cur.spellcasting.spells, { id: uid(), ref: s.id, name: s.name, level: s.level, prepared: !prepares || s.level === 0, notes: '' }],
          },
        }
      : null));
  };
  const addCustom = () => {
    void patchCharacter(c.id, (cur) => (cur.spellcasting
      ? { spellcasting: { ...cur.spellcasting, spells: [...cur.spellcasting.spells, { id: uid(), ref: null, name: 'Magia personalizada', level: 1, prepared: true, notes: '' }] } }
      : null));
  };

  return (
    <div className="cs-picker">
      <div className="cs-picker__head">
        <div className="cs-search">
          <Search />
          <input className="input input--sm" autoFocus placeholder="Buscar magia (PT ou EN)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <IconButton size="sm" icon={<X />} label="Fechar busca" onClick={onClose} />
      </div>
      <div className="cs-picker__filters">
        <select className="select input--sm" value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Nível">
          <option value={-1}>Todos os níveis</option>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => <option key={l} value={l}>{levelLabel(l)}{l > 0 && l <= maxSlot ? ' ✓' : ''}</option>)}
        </select>
        {casterClasses.length > 0 && <Toggle checked={mine} onChange={setMine} label={<span className="u-xs">Só da minha classe</span>} />}
      </div>
      <div className="cs-picker__list">
        {!mod && <div className="u-center u-p-3"><Spinner /></div>}
        {mod && results.length === 0 && <div className="cs-empty-line">Nenhuma magia encontrada.</div>}
        {results.map((s) => {
          const has = known.has(s.id);
          return (
            <div key={s.id} className="cs-pick" data-has={has ? 'true' : undefined}>
              <div className="u-grow">
                <div className="cs-pick__name u-ellipsis">
                  {s.name}
                  {s.concentration && <span className="cs-tag">C</span>}
                  {s.ritual && <span className="cs-tag">R</span>}
                </div>
                <div className="cs-pick__meta u-ellipsis">{s.level === 0 ? 'Truque' : `${s.level}º nível`} · {SCHOOL[s.school] ?? s.school} · {s.nameEn}</div>
              </div>
              <button type="button" className="icon-btn icon-btn--sm" disabled={has} aria-label={has ? 'Já conhecida' : 'Adicionar'} data-tip={has ? 'Já está na lista' : 'Adicionar'} onClick={() => add(s)}>
                {has ? <Check /> : <Plus />}
              </button>
            </div>
          );
        })}
      </div>
      <div className="cs-picker__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={addCustom}><BookOpen /> Magia personalizada</button>
      </div>
    </div>
  );
}
