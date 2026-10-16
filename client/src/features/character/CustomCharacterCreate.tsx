// Character creation for a custom system: name, race, class, starting stats, HP and defense.
// Replaces the D&D wizard while the campaign uses the DM's imported system.
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import type { CustomSystem, ID } from '@shared/types.ts';
import { newCustomSheet } from '@shared/customSystem.ts';
import { act } from '../../net/socket.ts';
import { useIsDM } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, Field, Modal, Spinner, toast } from '../../ui/index.tsx';
import { NumInput } from './common.tsx';
import { classHitDie } from './CustomSheet.tsx';
import './character.css';
import './custom-sheet.css';

export default function CustomCharacterCreate({ system, onClose }: { system: CustomSystem; onClose: () => void }) {
  const isDM = useIsDM();
  const [name, setName] = useState('');
  const [raceKey, setRaceKey] = useState(system.races[0]?.key ?? '');
  const [classKey, setClassKey] = useState(system.classes[0]?.key ?? '');
  const [stats, setStats] = useState<Record<string, number>>(() => Object.fromEntries(system.stats.map((s) => [s.key, s.default])));
  const [hpOverride, setHp] = useState<number | null>(null);
  const [defense, setDefense] = useState(10);
  const [busy, setBusy] = useState(false);
  const race = system.races.find((r) => r.key === raceKey);
  const cls = system.classes.find((k) => k.key === classKey);
  const hp = hpOverride ?? (cls?.hitDie || 10);

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const res = await act('character.create', {
      character: {
        name: name.trim().slice(0, 120) || 'Aventureiro',
        race: race?.name.slice(0, 80) ?? '',
        classes: cls ? [{ id: cls.key, name: cls.name.slice(0, 60), level: 1, subclass: '', hitDie: classHitDie(cls.hitDie) }] : [],
        hp: { cur: hp, max: hp, temp: 0 },
        ac: { mode: 'manual', value: defense, bonus: 0 },
        custom: { ...newCustomSheet(system), stats },
      },
    });
    setBusy(false);
    if (!res.ok) return;
    const id = (res.result as { id?: ID } | undefined)?.id;
    if (!id) return;
    if (!isDM) void act('player.update', { characterId: id }, { quiet: true });
    toast(<>Ficha de <strong>{name.trim() || 'Aventureiro'}</strong> criada.</>, 'success');
    onClose();
    if (isDM) useUi.getState().openSheet(id);
  };

  return (
    <Modal
      title={`Novo personagem — ${system.name}`}
      icon={<Sparkles />}
      onClose={onClose}
      size="wide"
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={busy ? <Spinner /> : <Sparkles />} disabled={busy} onClick={() => void create()}>Criar personagem</Button>
        </>
      )}
    >
      <div className="csx-create">
        <Field label="Nome">
          <input className="input input--lg" autoFocus maxLength={120} placeholder="Nome do personagem" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        {(system.races.length > 0 || system.classes.length > 0) && (
          <div className="csx-create__pick">
            {system.races.length > 0 && (
              <div className="u-col u-gap-1">
                <Field label="Raça">
                  <select className="select" value={raceKey} onChange={(e) => setRaceKey(e.target.value)}>
                    <option value="">—</option>
                    {system.races.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                  </select>
                </Field>
                {race?.description && <p className="csx-create__blurb">{race.description}</p>}
              </div>
            )}
            {system.classes.length > 0 && (
              <div className="u-col u-gap-1">
                <Field label="Classe">
                  <select className="select" value={classKey} onChange={(e) => setClassKey(e.target.value)}>
                    <option value="">—</option>
                    {system.classes.map((k) => <option key={k.key} value={k.key}>{k.name}</option>)}
                  </select>
                </Field>
                {cls?.description && <p className="csx-create__blurb">{cls.description}</p>}
              </div>
            )}
          </div>
        )}

        {system.stats.length > 0 && (
          <div className="u-col u-gap-1">
            <div className="section-title">Atributos</div>
            <div className="csx-create__stats">
              {system.stats.map((s) => {
                const bonus = race?.statBonuses[s.key] ?? 0;
                return (
                  <label key={s.key} className="csx-create__stat" data-tip={s.description || undefined}>
                    <span>{s.short} · {s.name}</span>
                    <NumInput value={stats[s.key] ?? s.default} min={s.min} max={s.max} onCommit={(v) => setStats((cur) => ({ ...cur, [s.key]: v }))} />
                    {bonus !== 0 && <em>{bonus > 0 ? `+${bonus}` : bonus} da raça</em>}
                  </label>
                );
              })}
            </div>
            <span className="u-xs u-dim">Faixa de cada atributo segundo o sistema; bônus de raça são somados na ficha.</span>
          </div>
        )}

        <div className="csx-create__vitals">
          <Field label={`${system.hpName} (máx.)`} hint={cls?.hitDie ? `Sugestão da classe: d${cls.hitDie}` : undefined}>
            <NumInput value={hp} min={1} max={100_000} onCommit={(v) => setHp(v)} />
          </Field>
          <Field label={system.defenseName}>
            <NumInput value={defense} min={0} max={60} onCommit={(v) => setDefense(v)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
