// "Principal" tab: hit points, death saves, conditions, exhaustion, hit dice & rests, defenses, identity & classes.
import { memo, useState } from 'react';
import {
  Brain, ChevronsUp, Coffee, Dices, HeartPulse, IdCard, Minus, Moon, Pencil, Plus, ShieldHalf, ShieldPlus, Skull,
  SlidersHorizontal, Trash2, X,
} from 'lucide-react';
import type { Character, ClassLevel } from '@shared/types.ts';
import { hpStatus, mod, type CharacterStats } from '@shared/rules5e.ts';
import { CONDITIONS, CONDITIONS_BY_ID } from '@shared/data5e/conditions.ts';
import { CLASSES, CLASSES_BY_ID } from '@shared/data5e/classes.ts';
import { ALIGNMENTS } from '@shared/data5e/skills.ts';
import { levelForXp, xpForNextLevel } from '@shared/data5e/tables.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { Button, confirmDialog, IconButton, Popover, Segmented, toast } from '../../ui/index.tsx';
import {
  conditionIcon, DraftInput, EXHAUSTION_EFFECTS, findCharacterToken, NumInput, patchCharacter, Pips, Portrait, rollFormula,
  Section, signed, type TabProps,
} from './common.tsx';
import { averageHpGain, levelUpPatch } from './build.ts';

export function MainTab({ c, stats, canEdit }: TabProps) {
  const down = c.hp.cur <= 0 && c.hp.max > 0;
  return (
    <div className="cs-stack">
      <HpCard c={c} canEdit={canEdit} />
      {down && <DeathSaves c={c} canEdit={canEdit} />}
      <StatusCard c={c} canEdit={canEdit} />
      <RestCard c={c} stats={stats} canEdit={canEdit} />
      <DefenseSection c={c} canEdit={canEdit} />
      <IdentitySection c={c} stats={stats} canEdit={canEdit} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hit points
// ---------------------------------------------------------------------------

/** Uses the linked token when it is on the map (server rules + chat log), otherwise applies it to the sheet (same server rules). */
function applyHpChange(c: Character, op: 'damage' | 'heal' | 'temp', amount: number): void {
  if (amount <= 0) return;
  const tok = findCharacterToken(c.id);
  if (tok) {
    void act('token.hp', { sceneId: tok.sceneId, ids: [tok.token.id], op, amount });
    return;
  }
  void act('character.hp', { id: c.id, op, amount });
}

const HpCard = memo(function HpCard({ c, canEdit }: { c: Character; canEdit: boolean }) {
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState(false);
  const status = hpStatus(c.hp.cur, c.hp.max);
  const pct = c.hp.max > 0 ? Math.max(0, Math.min(1, c.hp.cur / c.hp.max)) : 0;
  const tempPct = c.hp.max > 0 ? Math.min(1, c.hp.temp / c.hp.max) : 0;
  const tone = c.hp.cur <= 0 ? 'down' : pct <= 0.25 ? 'low' : pct <= 0.5 ? 'mid' : 'ok';
  const parsed = Number.parseInt(amount.replace(/[^\d]/g, ''), 10);
  const valid = Number.isFinite(parsed) && parsed > 0;
  const apply = (op: 'damage' | 'heal' | 'temp') => {
    if (!valid) return;
    applyHpChange(c, op, Math.min(parsed, 100_000));
    setAmount('');
  };
  const setHp = (patch: Partial<Character['hp']>) => patchCharacter(c.id, (cur) => {
    const hp = { ...cur.hp, ...patch };
    if (hp.cur > hp.max) hp.cur = hp.max;
    return { hp };
  });

  return (
    <section className="cs-card cs-hp" data-tone={tone}>
      <div className="cs-card__head">
        <span className="cs-label"><HeartPulse /> Pontos de vida</span>
        <span className="cs-hp__status" style={{ color: status.color }}>{status.label}</span>
        {canEdit && <IconButton size="sm" icon={<Pencil />} label="Editar PV" active={editing} onClick={() => setEditing(!editing)} />}
      </div>
      <div className="cs-hp__nums">
        <span className="cs-hp__cur" key={c.hp.cur}>{c.hp.cur}</span>
        <span className="cs-hp__max">/ {c.hp.max}</span>
        {c.hp.temp > 0 && <span className="cs-hp__temp"><ShieldPlus /> {c.hp.temp} temp.</span>}
      </div>
      <div className="cs-hp__bar">
        <i className="cs-hp__fill" style={{ width: `${pct * 100}%` }} />
        {tempPct > 0 && <i className="cs-hp__tempbar" style={{ width: `${tempPct * 100}%` }} />}
      </div>
      {editing && canEdit && (
        <div className="cs-hp__edit">
          <label className="cs-mini-field"><span>Atual</span><NumInput value={c.hp.cur} min={-100} max={100000} onCommit={(v) => setHp({ cur: v })} /></label>
          <label className="cs-mini-field"><span>Máximo</span><NumInput value={c.hp.max} min={0} max={100000} onCommit={(v) => setHp({ max: v })} /></label>
          <label className="cs-mini-field"><span>Temporários</span><NumInput value={c.hp.temp} min={0} max={100000} onCommit={(v) => setHp({ temp: v })} /></label>
        </div>
      )}
      {canEdit && (
        <div className="cs-hp__quick">
          <button type="button" className="btn btn--danger btn--sm" disabled={!valid} onClick={() => apply('damage')} data-tip="Aplicar dano (Enter)">
            <Minus /> Dano
          </button>
          <input
            className="input input--num input--sm cs-hp__input"
            placeholder="PV"
            inputMode="numeric"
            aria-label="Quantidade de PV"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d+-]/g, '').slice(0, 7))}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (amount.trim().startsWith('+')) apply('heal');
              else apply('damage');
            }}
          />
          <button type="button" className="btn btn--success btn--sm" disabled={!valid} onClick={() => apply('heal')} data-tip="Curar (ou digite +N e Enter)">
            <Plus /> Curar
          </button>
          <button type="button" className="btn btn--sm cs-hp__tempbtn" disabled={!valid} onClick={() => apply('temp')} data-tip="Conceder PV temporários">
            <ShieldPlus /> Temp.
          </button>
        </div>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
// Death saves
// ---------------------------------------------------------------------------

function Marks({ value, tone, onSet, disabled, label }: { value: number; tone: 'success' | 'danger'; onSet: (n: number) => void; disabled: boolean; label: string }) {
  return (
    <span className={`cs-marks cs-marks--${tone}`} role="group" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <button
          key={i}
          type="button"
          className="cs-mark"
          data-on={i < value ? 'true' : undefined}
          disabled={disabled}
          aria-label={`${label} ${i + 1}`}
          onClick={() => onSet(value === i + 1 ? i : i + 1)}
        />
      ))}
    </span>
  );
}

function DeathSaves({ c, canEdit }: { c: Character; canEdit: boolean }) {
  const ds = c.deathSaves;
  const dead = ds.fail >= 3 || c.conditions.includes('dead');
  const stable = !dead && ds.success >= 3;
  const set = (key: 'success' | 'fail', n: number) => patchCharacter(c.id, (cur) => ({ deathSaves: { ...cur.deathSaves, [key]: n } }));
  return (
    <section className="cs-card cs-death" data-state={dead ? 'dead' : stable ? 'stable' : 'dying'}>
      <div className="cs-card__head">
        <span className="cs-label"><Skull /> Testes contra a morte</span>
        {dead ? <span className="badge badge--danger">Morto</span> : stable ? <span className="badge badge--success">Estável</span> : <span className="badge">Caído</span>}
      </div>
      <div className="cs-death__rows">
        <div className="cs-death__row">
          <span>Sucessos</span>
          <Marks value={ds.success} tone="success" disabled={!canEdit} label="Sucesso" onSet={(n) => set('success', n)} />
        </div>
        <div className="cs-death__row">
          <span>Falhas</span>
          <Marks value={ds.fail} tone="danger" disabled={!canEdit} label="Falha" onSet={(n) => set('fail', n)} />
        </div>
      </div>
      {canEdit && (
        <Button
          block
          variant={dead || stable ? 'default' : 'danger'}
          icon={<Dices />}
          disabled={dead || stable}
          onClick={() => void act('character.deathSave', { id: c.id })}
        >
          Teste de morte
        </Button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Conditions, concentration, exhaustion
// ---------------------------------------------------------------------------

const PICKABLE_CONDITIONS = CONDITIONS.filter((x) => x.id !== 'exhaustion');

const StatusCard = memo(function StatusCard({ c, canEdit }: { c: Character; canEdit: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const toggle = (id: string) => patchCharacter(c.id, (cur) => {
    const has = cur.conditions.includes(id);
    const patch: Partial<Character> = { conditions: has ? cur.conditions.filter((x) => x !== id) : [...cur.conditions, id] };
    if (id === 'concentrating' && has) patch.concentration = null;
    return patch;
  });
  const concentrating = c.concentration !== null || c.conditions.includes('concentrating');
  const endConcentration = () => patchCharacter(c.id, (cur) => ({
    concentration: null,
    conditions: cur.conditions.filter((x) => x !== 'concentrating'),
  }));
  const conds = c.conditions.filter((x) => x !== 'concentrating');

  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <span className="cs-label">Condições</span>
        {canEdit && (
          <button type="button" className="chip" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}>
            <Plus /> Adicionar
          </button>
        )}
      </div>
      {concentrating && (
        <div className="cs-conc">
          <Brain />
          <span className="u-grow u-ellipsis">Concentrando{c.concentration ? <> em <strong>{c.concentration}</strong></> : null}</span>
          {canEdit && <button type="button" className="btn btn--ghost btn--sm" onClick={endConcentration}>Encerrar</button>}
        </div>
      )}
      <div className="cs-conds">
        {conds.length === 0 && !concentrating && <span className="u-dim u-xs">Nenhuma condição ativa.</span>}
        {conds.map((id) => {
          const d = CONDITIONS_BY_ID[id];
          return (
            <button
              key={id}
              type="button"
              className="cs-cond"
              style={{ '--cond': d?.color ?? '#9a9284' } as React.CSSProperties}
              data-tip={d?.rules[0] ? (d.rules[0].length > 90 ? `${d.rules[0].slice(0, 88)}…` : d.rules[0]) : undefined}
              disabled={!canEdit}
              onClick={() => toggle(id)}
            >
              {d ? conditionIcon(d.icon) : null}
              <span>{d?.name ?? id}</span>
              {canEdit && <X className="cs-cond__x" />}
            </button>
          );
        })}
      </div>
      <div className="cs-exh">
        <span className="cs-label">Exaustão</span>
        <span className="cs-exh__pips" role="group" aria-label="Exaustão">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              className="cs-exh__pip"
              data-on={n <= c.exhaustion ? 'true' : undefined}
              disabled={!canEdit}
              data-tip={`${n}: ${EXHAUSTION_EFFECTS[n]}`}
              onClick={() => patchCharacter(c.id, { exhaustion: c.exhaustion === n ? n - 1 : n })}
            >
              {n}
            </button>
          ))}
        </span>
      </div>
      {c.exhaustion > 0 && <div className="cs-exh__effect">{EXHAUSTION_EFFECTS.slice(1, c.exhaustion + 1).join(' · ')}</div>}
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="bottom" className="cs-pop cs-cond-pop">
          <div className="menu__label">Condições oficiais</div>
          <div className="cs-cond-grid">
            {PICKABLE_CONDITIONS.filter((d) => d.official).map((d) => (
              <CondToggle key={d.id} id={d.id} on={c.conditions.includes(d.id)} onToggle={toggle} />
            ))}
          </div>
          <div className="menu__label">Marcadores</div>
          <div className="cs-cond-grid">
            {PICKABLE_CONDITIONS.filter((d) => !d.official).map((d) => (
              <CondToggle key={d.id} id={d.id} on={c.conditions.includes(d.id)} onToggle={toggle} />
            ))}
          </div>
        </Popover>
      )}
    </section>
  );
});

function CondToggle({ id, on, onToggle }: { id: string; on: boolean; onToggle: (id: string) => void }) {
  const d = CONDITIONS_BY_ID[id]!;
  return (
    <button
      type="button"
      className="cs-cond-opt"
      data-on={on ? 'true' : undefined}
      style={{ '--cond': d.color } as React.CSSProperties}
      onClick={() => onToggle(id)}
    >
      {conditionIcon(d.icon)}
      <span className="u-ellipsis">{d.name}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Hit dice & rests
// ---------------------------------------------------------------------------

const RestCard = memo(function RestCard({ c, stats, canEdit }: { c: Character; stats: CharacterStats; canEdit: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [spend, setSpend] = useState(1);
  const total = stats.hitDiceTotal;
  const avail = Math.max(0, total - c.hitDiceUsed);
  const dice = stats.hitDice.length ? stats.hitDice.map((d) => `${d.count}d${d.die}`).join(' + ') : `${total}d8`;
  const bigDie = stats.hitDice[0]?.die ?? 8;
  const resource = (delta: number) => void act('character.resource', { id: c.id, kind: 'hitDie', key: 'hd', delta });
  const longRest = async () => {
    const ok = await confirmDialog('Descanso longo', 'Recupera todos os PV, metade dos dados de vida, espaços de magia, usos de características e reduz 1 nível de exaustão.', { ok: 'Descansar' });
    if (ok) void act('character.rest', { id: c.id, kind: 'long' });
  };
  return (
    <section className="cs-card">
      <div className="cs-card__head">
        <span className="cs-label">Dados de vida</span>
        <span className="u-xs u-muted u-tabular">{dice}</span>
      </div>
      <div className="cs-hd">
        <Pips
          total={total}
          filled={avail}
          tone="azure"
          disabled={!canEdit}
          label="Dados de vida"
          onSpend={() => resource(1)}
          onRestore={() => resource(-1)}
        />
        <span className="u-tabular u-sm u-muted">{avail}/{total} disponíveis</span>
      </div>
      {canEdit && (
        <div className="cs-rest">
          <Button
            icon={<Coffee />}
            onClick={(e) => {
              setSpend(Math.min(1, avail));
              setAnchor(anchor ? null : e.currentTarget);
            }}
          >
            Descanso curto
          </Button>
          <Button icon={<Moon />} onClick={() => void longRest()}>Descanso longo</Button>
        </div>
      )}
      {anchor && (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} placement="bottom" className="cs-pop">
          <div className="cs-pop__title">Descanso curto</div>
          <p className="u-xs u-muted">Gaste dados de vida para recuperar PV. Cada dado: 1d{bigDie} {signed(stats.mods.con)}.</p>
          <div className="cs-stepper">
            <button type="button" className="icon-btn icon-btn--sm" disabled={spend <= 0} onClick={() => setSpend(spend - 1)} aria-label="Menos"><Minus /></button>
            <span className="cs-stepper__val u-tabular">{spend}</span>
            <button type="button" className="icon-btn icon-btn--sm" disabled={spend >= avail} onClick={() => setSpend(spend + 1)} aria-label="Mais"><Plus /></button>
            <span className="u-xs u-dim">de {avail}</span>
          </div>
          <Button
            block
            variant="primary"
            icon={<Coffee />}
            onClick={() => {
              void act('character.rest', { id: c.id, kind: 'short', hitDice: spend });
              setAnchor(null);
            }}
          >
            Descansar{spend > 0 ? ` e gastar ${spend}` : ''}
          </Button>
        </Popover>
      )}
    </section>
  );
});

// ---------------------------------------------------------------------------
// Defenses & movement
// ---------------------------------------------------------------------------

const DefenseSection = memo(function DefenseSection({ c, canEdit }: { c: Character; canEdit: boolean }) {
  return (
    <Section title="Defesa e movimento" icon={<ShieldHalf />} collapsible defaultOpen={false} prefKey="defense">
      <div className="cs-fields">
        <div className="cs-mini-field cs-mini-field--wide">
          <span>Classe de armadura</span>
          {canEdit ? (
            <Segmented
              value={c.ac.mode}
              options={[
                { value: 'auto', label: 'Automática', tip: 'Calculada pela armadura equipada e atributos' },
                { value: 'manual', label: 'Manual' },
              ]}
              onChange={(v) => patchCharacter(c.id, (cur) => ({ ac: { ...cur.ac, mode: v } }))}
            />
          ) : <span className="u-sm">{c.ac.mode === 'auto' ? 'Automática' : 'Manual'}</span>}
        </div>
        {c.ac.mode === 'manual' && (
          <label className="cs-mini-field">
            <span>CA base</span>
            <NumInput value={c.ac.value} min={0} max={60} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, (cur) => ({ ac: { ...cur.ac, value: v } }))} />
          </label>
        )}
        <label className="cs-mini-field">
          <span>Bônus de CA</span>
          <NumInput value={c.ac.bonus} min={-20} max={20} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, (cur) => ({ ac: { ...cur.ac, bonus: v } }))} />
        </label>
        <label className="cs-mini-field">
          <span>Deslocamento</span>
          <NumInput value={c.speed} min={0} max={1000} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { speed: v })} />
        </label>
        <label className="cs-mini-field">
          <span>Bônus iniciativa</span>
          <NumInput value={c.initiativeBonus} min={-20} max={30} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { initiativeBonus: v })} />
        </label>
        <label className="cs-mini-field">
          <span>Visão no escuro</span>
          <NumInput value={c.senses.darkvision} min={0} max={10000} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { senses: { darkvision: v } })} />
        </label>
      </div>
    </Section>
  );
});

// ---------------------------------------------------------------------------
// Identity & classes
// ---------------------------------------------------------------------------

const IdentitySection = memo(function IdentitySection({ c, stats, canEdit }: { c: Character; stats: CharacterStats; canEdit: boolean }) {
  const isDM = useGame((s) => s.me?.role === 'dm');
  const players = useGame((s) => s.state?.players);
  const xpLevel = levelForXp(c.xp);
  const next = xpForNextLevel(stats.level);
  const addClass = () => patchCharacter(c.id, (cur) => {
    const used = new Set(cur.classes.map((k) => k.id));
    const d = CLASSES.find((x) => !used.has(x.id)) ?? CLASSES[0]!;
    return { classes: [...cur.classes, { id: d.id, name: d.name, level: 1, subclass: '', hitDie: d.hitDie }] };
  });
  return (
    <Section title="Identidade e classes" icon={<IdCard />} collapsible defaultOpen={c.classes.length === 0} prefKey="identity">
      <div className="cs-identity">
        <Portrait c={c} canEdit={canEdit} size="lg" />
        <div className="cs-identity__fields">
          <label className="cs-mini-field cs-mini-field--wide">
            <span>Nome</span>
            <DraftInput value={c.name} maxLength={120} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { name: v.trim() || c.name })} />
          </label>
          <label className="cs-mini-field">
            <span>Raça</span>
            <DraftInput value={c.race} maxLength={80} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { race: v })} />
          </label>
          <label className="cs-mini-field">
            <span>Antecedente</span>
            <DraftInput value={c.background} maxLength={80} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { background: v })} />
          </label>
        </div>
      </div>
      <div className="cs-fields">
        <label className="cs-mini-field cs-mini-field--wide">
          <span>Tendência</span>
          <DraftInput list="cs-alignments" value={c.alignment} maxLength={60} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { alignment: v })} />
          <datalist id="cs-alignments">{ALIGNMENTS.map((a) => <option key={a} value={a} />)}</datalist>
        </label>
        <label className="cs-mini-field">
          <span>Experiência</span>
          <NumInput value={c.xp} min={0} max={10_000_000} readOnly={!canEdit} onCommit={(v) => patchCharacter(c.id, { xp: v })} />
        </label>
        <div className="cs-mini-field">
          <span>Próximo nível</span>
          <span className="cs-mini-field__static u-tabular">{next === null ? '—' : `${next.toLocaleString('pt-BR')} XP`}</span>
        </div>
      </div>
      {xpLevel > stats.level && c.xp > 0 && (
        <div className="cs-hint cs-hint--gold"><ChevronsUp /> A experiência já permite o nível {xpLevel}. Use o botão de subir de nível na classe.</div>
      )}
      {isDM && (
        <div className="cs-fields">
          <div className="cs-mini-field">
            <span>Tipo</span>
            <Segmented
              value={c.kind}
              options={[{ value: 'pc', label: 'Jogador' }, { value: 'npc', label: 'PdM' }]}
              onChange={(v) => patchCharacter(c.id, { kind: v })}
            />
          </div>
          <label className="cs-mini-field cs-mini-field--grow">
            <span>Dono</span>
            <select
              className="select input--sm"
              value={c.ownerId ?? ''}
              onChange={(e) => void act('character.assign', { id: c.id, ownerId: e.target.value || null })}
            >
              <option value="">Ninguém (Mestre)</option>
              {Object.values(players ?? {}).filter((p) => p.role === 'player').map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      <div className="cs-classes">
        <div className="cs-label">Classes</div>
        {c.classes.length === 0 && <div className="u-dim u-xs">Nenhuma classe. Adicione uma para calcular dados de vida e magias.</div>}
        {c.classes.map((k, i) => <ClassRow key={`${i}-${k.id}`} c={c} index={i} k={k} canEdit={canEdit} />)}
        {canEdit && c.classes.length < 6 && (
          <Button size="sm" variant="ghost" icon={<Plus />} onClick={() => void addClass()}>
            {c.classes.length ? 'Adicionar classe (multiclasse)' : 'Adicionar classe'}
          </Button>
        )}
      </div>
    </Section>
  );
});

const HIT_DICE = [6, 8, 10, 12];

function ClassRow({ c, index, k, canEdit }: { c: Character; index: number; k: ClassLevel; canEdit: boolean }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const data = CLASSES_BY_ID[k.id];
  const upd = (changes: Partial<ClassLevel>) => patchCharacter(c.id, (cur) => ({
    classes: cur.classes.map((x, i) => (i === index ? { ...x, ...changes } : x)),
  }));
  const remove = async () => {
    const ok = await confirmDialog('Remover classe', `Remover ${k.name || 'esta classe'} da ficha?`, { danger: true, ok: 'Remover' });
    if (ok) void patchCharacter(c.id, (cur) => ({ classes: cur.classes.filter((_x, i) => i !== index) }));
  };
  return (
    <div className="cs-class">
      <div className="cs-class__line">
        <select
          className="select input--sm u-grow"
          value={data ? k.id : '__custom'}
          disabled={!canEdit}
          aria-label="Classe"
          onChange={(e) => {
            const d = CLASSES_BY_ID[e.target.value];
            if (d) void upd({ id: d.id, name: d.name, hitDie: d.hitDie });
            else void upd({ id: 'custom', name: k.name || 'Classe' });
          }}
        >
          {CLASSES.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          <option value="__custom">Personalizada…</option>
        </select>
        <span className="cs-class__lvl">
          <span className="u-xs u-dim">Nv</span>
          <NumInput className="input input--num input--sm" value={k.level} min={1} max={20} readOnly={!canEdit} aria-label="Nível" onCommit={(v) => void upd({ level: v })} />
        </span>
        {canEdit && k.level < 20 && (
          <IconButton size="sm" icon={<ChevronsUp />} label="Subir de nível" onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
        )}
        {canEdit && <IconButton size="sm" danger icon={<Trash2 />} label="Remover classe" onClick={() => void remove()} />}
      </div>
      <div className="cs-class__line">
        {!data && (
          <DraftInput className="input input--sm" value={k.name} maxLength={60} placeholder="Nome da classe" readOnly={!canEdit} onCommit={(v) => void upd({ name: v })} />
        )}
        <DraftInput
          className="input input--sm u-grow"
          list={data ? `cs-sub-${k.id}` : undefined}
          value={k.subclass}
          maxLength={80}
          placeholder={data?.subclassLabel ?? 'Subclasse'}
          readOnly={!canEdit}
          onCommit={(v) => void upd({ subclass: v })}
        />
        {data && <datalist id={`cs-sub-${k.id}`}>{data.subclasses.map((s) => <option key={s.id} value={s.name} />)}</datalist>}
        <select className="select input--sm cs-class__hd" value={k.hitDie} disabled={!canEdit} aria-label="Dado de vida" onChange={(e) => void upd({ hitDie: Number(e.target.value) })}>
          {(HIT_DICE.includes(k.hitDie) ? HIT_DICE : [...HIT_DICE, k.hitDie]).map((d) => <option key={d} value={d}>d{d}</option>)}
        </select>
      </div>
      {anchor && <LevelUpPopover c={c} index={index} anchor={anchor} onClose={() => setAnchor(null)} />}
    </div>
  );
}

function LevelUpPopover({ c, index, anchor, onClose }: { c: Character; index: number; anchor: HTMLElement; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const k = c.classes[index];
  if (!k) return null;
  const con = mod(c.abilities.con);
  const avg = averageHpGain(k.hitDie, c.abilities.con);
  const apply = (gain: number) => {
    void patchCharacter(c.id, (cur) => levelUpPatch(cur, index, gain)).then((ok) => {
      if (ok) toast(`${c.name} agora é ${k.name} ${k.level + 1}! (+${gain} PV)`, 'success', 4500);
    });
    onClose();
  };
  const roll = async () => {
    setBusy(true);
    const total = await rollFormula(`1d${k.hitDie}`, `PV ao subir de nível (${k.name} ${k.level + 1})`, c.name);
    setBusy(false);
    if (total !== null) apply(Math.max(1, total + con));
  };
  return (
    <Popover anchor={anchor} onClose={onClose} placement="bottom" className="cs-pop">
      <div className="cs-pop__title"><ChevronsUp /> {k.name} {k.level} → {k.level + 1}</div>
      <p className="u-xs u-muted">Pontos de vida: d{k.hitDie} {signed(con)} (Constituição).</p>
      <div className="u-col">
        <Button block variant="primary" onClick={() => apply(avg)}>Usar a média: +{avg} PV</Button>
        <Button block icon={<Dices />} disabled={busy} onClick={() => void roll()}>Rolar 1d{k.hitDie}{signed(con)}</Button>
      </div>
      <p className="u-xs u-dim cs-pop__foot"><SlidersHorizontal /> Características, usos e espaços de magia são atualizados.</p>
    </Popover>
  );
}
