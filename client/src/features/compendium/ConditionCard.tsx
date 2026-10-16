// Condition reference card (official 5e conditions + VTT helper markers).
import { Check, Plus } from 'lucide-react';
import type { ConditionData } from '@shared/data5e/types.ts';
import { act } from '../../net/socket.ts';
import { canControl, useSelectedTokens, useViewSceneId } from '../../store/hooks.ts';
import { useGame } from '../../store/game.ts';
import { Button } from '../../ui/index.tsx';
import { iconByName } from './parts.tsx';

export function ConditionIcon({ condition, size = 'md' }: { condition: ConditionData; size?: 'sm' | 'md' | 'lg' }) {
  const Icon = iconByName(condition.icon);
  return (
    <span className={`cmp-cond-ico cmp-cond-ico--${size}`} style={{ ['--cond-c' as string]: condition.color }}>
      <Icon />
    </span>
  );
}

export function ConditionCard({ condition }: { condition: ConditionData }) {
  const sceneId = useViewSceneId();
  const selected = useSelectedTokens().filter((t) => canControl(t));
  const characters = useGame((s) => s.state?.characters);
  const has = (tokenId: string): boolean => {
    const t = selected.find((x) => x.id === tokenId);
    if (!t) return false;
    const c = t.characterId ? characters?.[t.characterId] : undefined;
    return (c ? c.conditions : t.conditions).includes(condition.id);
  };
  const allHave = selected.length > 0 && selected.every((t) => has(t.id));

  const apply = () => {
    if (!sceneId || !selected.length) return;
    const ids = selected.map((t) => t.id);
    void act('token.conditions', allHave ? { sceneId, ids, remove: [condition.id] } : { sceneId, ids, add: [condition.id] });
  };

  return (
    <article className="cmp-card cmp-cond" style={{ ['--cond-c' as string]: condition.color }}>
      <header className="cmp-cond__head">
        <ConditionIcon condition={condition} size="lg" />
        <div className="u-grow">
          <h2 className="cmp-card__title">{condition.name}</h2>
          <div className="cmp-card__sub">{condition.official ? 'Condição oficial (SRD 5.1)' : 'Marcador da mesa virtual'}</div>
        </div>
      </header>
      <ul className="cmp-cond__rules">
        {condition.rules.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
      {selected.length > 0 && sceneId && (
        <div className="cmp-actions">
          <Button size="sm" variant={allHave ? 'default' : 'primary'} icon={allHave ? <Check /> : <Plus />} onClick={apply}>
            {allHave ? 'Remover dos selecionados' : `Aplicar a ${selected.length === 1 ? selected[0]!.name : `${selected.length} tokens`}`}
          </Button>
        </div>
      )}
    </article>
  );
}
