import { useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { SPELLS } from '@shared/data5e/spells/index.ts';
import { normalize } from '@shared/util.ts';
import { useUi } from '../store/ui.ts';

const DAMAGE_COLOR: Record<string, string> = {
  fire: '#ff7a2f', cold: '#7dd3fc', lightning: '#60a5fa', acid: '#a3e635', poison: '#86efac', necrotic: '#6ee7b7',
  radiant: '#fde047', thunder: '#818cf8', force: '#c084fc', psychic: '#f472b6',
};

/** Quick-pick a spell to configure the area template (Bola de Fogo → esfera de 20 pés). */
export function SpellTemplatePicker() {
  const [q, setQ] = useState('');
  const spellId = useUi((s) => s.toolOpts.template.spellId);
  const areaSpells = useMemo(() => SPELLS.filter((s) => s.area), []);
  const results = useMemo(() => {
    const n = normalize(q);
    if (!n) return [];
    return areaSpells.filter((s) => normalize(s.name).includes(n) || normalize(s.nameEn).includes(n)).slice(0, 6);
  }, [q, areaSpells]);
  const current = spellId ? areaSpells.find((s) => s.id === spellId) : undefined;
  return (
    <div className="u-col u-gap-1">
      <input className="input input--sm" placeholder="Magia (ex: Bola de Fogo)…" value={q} onChange={(e) => setQ(e.target.value)} />
      {current && !q && <div className="u-xs u-gold u-row"><Sparkles size={12} /> {current.name}</div>}
      {results.map((s) => (
        <button
          key={s.id}
          type="button"
          className="menu__item"
          onClick={() => {
            const a = s.area!;
            const dmg = s.damage?.[0]?.type;
            useUi.getState().setToolOpts('template', {
              kind: a.kind,
              size: a.size,
              width: a.width ?? 5,
              spellId: s.id,
              label: s.name,
              color: (dmg && DAMAGE_COLOR[dmg]) || useUi.getState().toolOpts.template.color,
            });
            setQ('');
          }}
        >
          <Sparkles />
          <span className="u-grow u-ellipsis">{s.name}</span>
          <span className="u-xs u-dim">{s.area!.size} pés</span>
        </button>
      ))}
    </div>
  );
}
