// "Combate" tab: attacks (roll / edit), current targets, limited-use resources.
import { memo, useMemo, useState } from 'react';
import { Copy, Crosshair, Pencil, Plus, Swords, Trash2, WandSparkles, Zap } from 'lucide-react';
import type { Ability, Attack, Character, DamagePart, DamageType, ID } from '@shared/types.ts';
import {
  ABILITY_NAME, ABILITY_SHORT, attackAbilityMod, attackSaveDc, attackToHit, characterVars, DAMAGE_TYPE_COLOR,
  DAMAGE_TYPE_NAME, resolveFormula, type CharacterStats,
} from '@shared/rules5e.ts';
import { act } from '../../net/socket.ts';
import { useScene } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { confirmDialog, IconButton, Toggle, toast } from '../../ui/index.tsx';
import {
  DraftInput, DraftTextarea, NumInput, patchCharacter, Pips, RESET_LABEL, rollAttack, Section, signed, uid,
  useItemsModule, type TabProps,
} from './common.tsx';
import { weaponAttack, weaponProficient } from './build.ts';
import { RollHint } from './SheetAbilities.tsx';

const DAMAGE_TYPES: DamageType[] = [
  'slashing', 'piercing', 'bludgeoning', 'fire', 'cold', 'lightning', 'thunder', 'acid', 'poison', 'necrotic', 'radiant',
  'force', 'psychic', 'healing', 'none',
];

const ABILITY_OPTIONS: { value: Attack['ability']; label: string }[] = [
  { value: 'str', label: 'Força' },
  { value: 'dex', label: 'Destreza' },
  { value: 'finesse', label: 'Acuidade (FOR ou DES)' },
  { value: 'con', label: 'Constituição' },
  { value: 'int', label: 'Inteligência' },
  { value: 'wis', label: 'Sabedoria' },
  { value: 'cha', label: 'Carisma' },
  { value: 'spell', label: 'Conjuração' },
  { value: 'none', label: 'Nenhum' },
];

const SAVE_ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export function weaponProfText(c: Character): string {
  const racial = c.features.filter((f) => /treinamento/i.test(f.name)).map((f) => f.text);
  return [c.proficiencies.weapons, ...racial].join(' ');
}

export function CombatTab({ c, stats, canEdit }: TabProps) {
  const [editing, setEditing] = useState<ID | null>(null);
  const items = useItemsModule(canEdit && c.inventory.some((i) => i.ref));
  const addAttack = () => {
    const a: Attack = {
      id: uid(), name: 'Novo ataque', ability: 'str', proficient: true, bonus: 0,
      damage: [{ formula: '1d6+@mod', type: 'slashing' }], range: '5 pés', critOn: 20, notes: '', save: null,
    };
    void patchCharacter(c.id, (cur) => ({ attacks: [...cur.attacks, a] }));
    setEditing(a.id);
  };
  // Weapons in the inventory that have no matching attack yet.
  const orphanWeapons = useMemo(() => {
    if (!items) return [];
    const names = new Set(c.attacks.map((a) => a.name.toLowerCase()));
    const seen = new Set<string>();
    const out: { invId: ID; ref: string; name: string }[] = [];
    for (const it of c.inventory) {
      if (!it.ref || seen.has(it.ref)) continue;
      const data = items.ITEMS_BY_ID[it.ref];
      if (!data?.weapon || names.has(it.name.toLowerCase())) continue;
      seen.add(it.ref);
      out.push({ invId: it.id, ref: it.ref, name: it.name });
    }
    return out;
  }, [items, c.inventory, c.attacks]);

  const createFromWeapon = (ref: string, name: string) => {
    const data = items?.ITEMS_BY_ID[ref];
    if (!data) return;
    const atk = { ...weaponAttack(data, weaponProficient(data, weaponProfText(c))), name };
    void patchCharacter(c.id, (cur) => ({ attacks: [...cur.attacks, atk] }));
    toast(`Ataque "${name}" criado.`, 'success', 2200);
  };

  const resources = c.features.filter((f) => f.uses && f.uses.max > 0);

  return (
    <div className="cs-stack">
      <TargetsBar />
      {canEdit && <RollHint />}
      <Section
        title="Ataques"
        icon={<Swords />}
        right={canEdit ? <button type="button" className="chip" onClick={addAttack}><Plus /> Novo</button> : undefined}
      >
        {c.attacks.length === 0 && (
          <div className="cs-empty-line">Nenhum ataque ainda. Crie um ou adicione uma arma ao inventário.</div>
        )}
        <div className="cs-attacks">
          {c.attacks.map((a) => (
            <AttackRow
              key={a.id}
              c={c}
              stats={stats}
              atk={a}
              canEdit={canEdit}
              editing={editing === a.id}
              onEdit={() => setEditing(editing === a.id ? null : a.id)}
            />
          ))}
        </div>
        {canEdit && orphanWeapons.length > 0 && (
          <div className="cs-suggest">
            <span className="u-xs u-muted">Armas no inventário sem ataque:</span>
            <div className="u-row u-wrap u-gap-1">
              {orphanWeapons.map((w) => (
                <button key={w.invId} type="button" className="chip" onClick={() => createFromWeapon(w.ref, w.name)}>
                  <Plus /> {w.name}
                </button>
              ))}
            </div>
          </div>
        )}
      </Section>
      {resources.length > 0 && (
        <Section title="Recursos" icon={<Zap />}>
          <div className="cs-resources">
            {resources.map((f) => (
              <div key={f.id} className="cs-resource">
                <div className="u-grow">
                  <div className="cs-resource__name u-ellipsis">{f.name}</div>
                  <div className="u-xs u-dim">{RESET_LABEL[f.uses!.reset]}</div>
                </div>
                <Pips
                  total={f.uses!.max}
                  filled={f.uses!.max - f.uses!.used}
                  disabled={!canEdit}
                  label={f.name}
                  onSpend={() => void act('character.resource', { id: c.id, kind: 'feature', key: f.id, delta: 1 })}
                  onRestore={() => void act('character.resource', { id: c.id, kind: 'feature', key: f.id, delta: -1 })}
                />
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function TargetsBar() {
  const targets = useUi((s) => s.targets);
  const scene = useScene();
  const names = targets.map((id) => scene?.tokens[id]?.name).filter((n): n is string => !!n);
  return (
    <div className="cs-targets" data-has={names.length ? 'true' : undefined}>
      <Crosshair />
      {names.length ? (
        <span className="u-grow u-ellipsis">Alvos: <strong>{names.join(', ')}</strong></span>
      ) : (
        <span className="u-grow">Sem alvos — marque alvos no mapa para comparar com a CA.</span>
      )}
      {names.length > 0 && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => useUi.getState().setTargets([])}>Limpar</button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attack row + editor
// ---------------------------------------------------------------------------

export function damagePreview(c: Character, stats: CharacterStats, atk: Attack): { formula: string; type: DamageType }[] {
  const vars = characterVars(c, stats, attackAbilityMod(c, atk, stats));
  return atk.damage.filter((d) => d.formula.trim()).map((d) => ({ formula: resolveFormula(d.formula, vars), type: d.type }));
}

const AttackRow = memo(function AttackRow({ c, stats, atk, canEdit, editing, onEdit }: {
  c: Character;
  stats: CharacterStats;
  atk: Attack;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  const toHit = attackToHit(c, atk, stats);
  const dc = attackSaveDc(c, atk, stats);
  const dmg = damagePreview(c, stats, atk);
  const ranged = /\d+\s*\/\s*\d+/.test(atk.range) && !/arremesso/.test(atk.range);
  const icon = atk.ability === 'spell' || atk.save ? <WandSparkles /> : ranged ? <Crosshair /> : <Swords />;
  const roll = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (canEdit) rollAttack(c.id, atk.id, e);
  };
  return (
    <div className="cs-atk" data-editing={editing ? 'true' : undefined}>
      <div className="cs-atk__line">
        <div
          className="cs-atk__main"
          role="button"
          tabIndex={canEdit ? 0 : -1}
          aria-disabled={!canEdit}
          data-tip={canEdit ? (atk.save ? 'Usar (alvos fazem salvaguarda)' : 'Atacar os alvos marcados') : undefined}
          onClick={roll}
          onKeyDown={(e) => {
            if (e.key === 'Enter') roll(e);
          }}
        >
          <span className="cs-atk__icon">{icon}</span>
          <span className="cs-atk__info">
            <span className="cs-atk__name u-ellipsis">{atk.name || 'Ataque'}</span>
            <span className="cs-atk__meta">
              {dmg.length === 0 && <span className="u-dim">sem dano</span>}
              {dmg.map((d, i) => (
                <span key={i} className="cs-dmg" style={{ '--dmg': DAMAGE_TYPE_COLOR[d.type] } as React.CSSProperties}>
                  {d.formula} <small>{DAMAGE_TYPE_NAME[d.type]}</small>
                </span>
              ))}
              {atk.range && <span className="u-dim">· {atk.range}</span>}
            </span>
          </span>
          <span className="cs-atk__hit" data-save={atk.save ? 'true' : undefined}>
            {atk.save ? (
              <>
                <small>CD</small>
                {dc}
                <small>{ABILITY_SHORT[atk.save.ability]}</small>
              </>
            ) : (
              signed(toHit)
            )}
          </span>
        </div>
        {canEdit && <IconButton size="sm" icon={<Pencil />} label="Editar ataque" active={editing} onClick={onEdit} />}
      </div>
      {editing && canEdit && <AttackEditor cid={c.id} atk={atk} />}
    </div>
  );
});

function AttackEditor({ cid, atk }: { cid: ID; atk: Attack }) {
  const upd = (fn: (a: Attack) => Partial<Attack>) => patchCharacter(cid, (cur) => ({
    attacks: cur.attacks.map((a) => (a.id === atk.id ? { ...a, ...fn(a) } : a)),
  }));
  const updDamage = (i: number, changes: Partial<DamagePart>) => upd((a) => ({
    damage: a.damage.map((d, j) => (j === i ? { ...d, ...changes } : d)),
  }));
  const remove = async () => {
    if (await confirmDialog('Excluir ataque', `Excluir "${atk.name}"?`, { danger: true, ok: 'Excluir' })) {
      void patchCharacter(cid, (cur) => ({ attacks: cur.attacks.filter((a) => a.id !== atk.id) }));
    }
  };
  const duplicate = () => patchCharacter(cid, (cur) => ({
    attacks: [...cur.attacks, { ...atk, id: uid(), name: `${atk.name} (cópia)`.slice(0, 120), damage: atk.damage.map((d) => ({ ...d })) }],
  }));
  return (
    <div className="cs-editor">
      <label className="cs-mini-field cs-mini-field--wide">
        <span>Nome</span>
        <DraftInput className="input input--sm" value={atk.name} maxLength={120} onCommit={(v) => void upd(() => ({ name: v }))} />
      </label>
      <div className="cs-fields">
        <label className="cs-mini-field cs-mini-field--grow">
          <span>Atributo</span>
          <select className="select input--sm" value={atk.ability} onChange={(e) => void upd(() => ({ ability: e.target.value as Attack['ability'] }))}>
            {ABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label className="cs-mini-field">
          <span>Bônus extra</span>
          <NumInput className="input input--num input--sm" value={atk.bonus} min={-50} max={50} onCommit={(v) => void upd(() => ({ bonus: v }))} />
        </label>
        <div className="cs-mini-field">
          <span>Proficiente</span>
          <Toggle checked={atk.proficient} onChange={(v) => void upd(() => ({ proficient: v }))} />
        </div>
      </div>
      <div className="cs-mini-field cs-mini-field--wide">
        <span>Dano <em className="u-dim">(use @mod para o modificador)</em></span>
        {atk.damage.map((d, i) => (
          <div key={i} className="cs-dmg-row">
            <DraftInput className="input input--sm u-mono" value={d.formula} maxLength={80} placeholder="1d8+@mod" onCommit={(v) => void updDamage(i, { formula: v.trim() })} />
            <select className="select input--sm" value={d.type} onChange={(e) => void updDamage(i, { type: e.target.value as DamageType })}>
              {DAMAGE_TYPES.map((t) => <option key={t} value={t}>{DAMAGE_TYPE_NAME[t] || 'nenhum'}</option>)}
            </select>
            <IconButton size="sm" danger icon={<Trash2 />} label="Remover dano" onClick={() => void upd((a) => ({ damage: a.damage.filter((_x, j) => j !== i) }))} />
          </div>
        ))}
        {atk.damage.length < 8 && (
          <button type="button" className="chip" onClick={() => void upd((a) => ({ damage: [...a.damage, { formula: '1d6', type: a.damage[0]?.type ?? 'slashing' }] }))}>
            <Plus /> Dano adicional
          </button>
        )}
      </div>
      <div className="cs-fields">
        <label className="cs-mini-field cs-mini-field--grow">
          <span>Alcance</span>
          <DraftInput className="input input--sm" value={atk.range} maxLength={60} onCommit={(v) => void upd(() => ({ range: v }))} />
        </label>
        <label className="cs-mini-field">
          <span>Crítico em</span>
          <NumInput className="input input--num input--sm" value={atk.critOn} min={2} max={20} onCommit={(v) => void upd(() => ({ critOn: v }))} />
        </label>
      </div>
      <div className="cs-save-cfg">
        <Toggle
          checked={!!atk.save}
          label="Exige salvaguarda (sem jogada de ataque)"
          onChange={(v) => void upd(() => ({ save: v ? { ability: 'dex', dc: 'spell', half: true } : null }))}
        />
        {atk.save && (
          <div className="cs-fields">
            <label className="cs-mini-field cs-mini-field--grow">
              <span>Salvaguarda</span>
              <select className="select input--sm" value={atk.save.ability} onChange={(e) => void upd((a) => ({ save: a.save ? { ...a.save, ability: e.target.value as Ability } : null }))}>
                {SAVE_ABILITIES.map((ab) => <option key={ab} value={ab}>{ABILITY_NAME[ab]}</option>)}
              </select>
            </label>
            <label className="cs-mini-field">
              <span>CD</span>
              {atk.save.dc === 'spell' ? (
                <button type="button" className="btn btn--sm" onClick={() => void upd((a) => ({ save: a.save ? { ...a.save, dc: 13 } : null }))} data-tip="Usando a CD de magia — clique para fixar um valor">Magia</button>
              ) : (
                <NumInput className="input input--num input--sm" value={atk.save.dc} min={0} max={50} onCommit={(v) => void upd((a) => ({ save: a.save ? { ...a.save, dc: v } : null }))} />
              )}
            </label>
            <div className="cs-mini-field">
              <span>Metade</span>
              <Toggle checked={atk.save.half} onChange={(v) => void upd((a) => ({ save: a.save ? { ...a.save, half: v } : null }))} />
            </div>
          </div>
        )}
        {atk.save && atk.save.dc !== 'spell' && (
          <button type="button" className="chip" onClick={() => void upd((a) => ({ save: a.save ? { ...a.save, dc: 'spell' } : null }))}>Usar CD de magia</button>
        )}
      </div>
      <label className="cs-mini-field cs-mini-field--wide">
        <span>Notas</span>
        <DraftTextarea className="textarea cs-textarea--sm" value={atk.notes} maxLength={2000} rows={2} onCommit={(v) => void upd(() => ({ notes: v }))} />
      </label>
      <div className="cs-editor__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => void duplicate()}><Copy /> Duplicar</button>
        <button type="button" className="btn btn--danger btn--sm" onClick={() => void remove()}><Trash2 /> Excluir</button>
      </div>
    </div>
  );
}
