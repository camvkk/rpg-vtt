import { useMemo, useState } from 'react';
import {
  ChevronsDown, ChevronsUp, Crosshair, Dices, EyeOff, Flag, Hourglass, Sparkles, Sword, Target, Trash2, X, Zap,
} from 'lucide-react';
import { MONSTERS_BY_ID } from '@shared/data5e/monsters/index.ts';
import { SPELLS_BY_ID } from '@shared/data5e/spells/index.ts';
import {
  ABILITY_LIST, ABILITY_NAME, ABILITY_SHORT, attackToHit, computeStats, SKILL_LIST, SKILL_NAME,
} from '@shared/rules5e.ts';
import type { Ability, SkillId } from '@shared/types.ts';
import { signed } from '@shared/util.ts';
import { prettyFormula } from '@shared/customSystem.ts';
import { act, sendFx } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { useActiveCustomSystem, useIsDM, useMyCharacter, useSelectedTokens, useViewSceneId } from '../store/hooks.ts';
import { useUi, type RollMode } from '../store/ui.ts';
import { IconButton, Popover, toast } from '../ui/index.tsx';

const DICE = [4, 6, 8, 10, 12, 20, 100];

function DieIcon({ sides }: { sides: number }) {
  // Minimal polyhedral glyphs
  const paths: Record<number, string> = {
    4: 'M12 3 21 19H3z',
    6: 'M5 5h14v14H5z',
    8: 'M12 2 21 12 12 22 3 12z',
    10: 'M12 2 21 10 12 22 3 10z',
    12: 'M12 2 20.5 8.2 17.3 18.2H6.7L3.5 8.2z',
    20: 'M12 2 20.7 7v10L12 22 3.3 17V7z',
    100: 'M12 2 21 10 12 22 3 10z',
  };
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
      <path d={paths[sides]} />
    </svg>
  );
}

function rollMode(e: React.MouseEvent): RollMode {
  if (e.shiftKey) return 'adv';
  if (e.ctrlKey || e.metaKey) return 'dis';
  return useUi.getState().rollMode;
}

export function Hotbar() {
  const mode = useUi((s) => s.rollMode);
  const setMode = useUi((s) => s.setRollMode);
  const isDM = useIsDM();
  const [pool, setPool] = useState<Record<number, number>>({});
  const [bonus, setBonus] = useState(0);
  const [secret, setSecret] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const poolFormula = useMemo(() => {
    const parts = DICE.filter((d) => pool[d]).map((d) => `${pool[d]}d${d === 100 ? '%' : d}`);
    if (!parts.length) return '';
    return `${parts.join('+')}${bonus ? signed(bonus) : ''}`;
  }, [pool, bonus]);

  const rollPool = (e?: React.MouseEvent) => {
    if (!poolFormula) return;
    void act('roll.formula', { formula: poolFormula, mode: e ? rollMode(e) : mode, visibility: secret ? 'gm' : 'public' });
    setPool({});
    setBonus(0);
  };

  return (
    <div className="hotbar" data-collapsed={collapsed ? 'true' : undefined}>
      <div className="hotbar__main panel">
        <div className="hotbar__mode" role="radiogroup" aria-label="Modo de rolagem">
          <button type="button" data-active={mode === 'adv' ? 'true' : undefined} data-tip="Vantagem (Shift+clique)" onClick={() => setMode(mode === 'adv' ? 'normal' : 'adv')}>
            <ChevronsUp />
          </button>
          <button type="button" data-active={mode === 'dis' ? 'true' : undefined} data-tip="Desvantagem (Ctrl+clique)" onClick={() => setMode(mode === 'dis' ? 'normal' : 'dis')}>
            <ChevronsDown />
          </button>
        </div>
        <div className="hotbar__dice">
          {DICE.map((d) => (
            <button
              key={d}
              type="button"
              className="die-btn"
              data-sides={d}
              data-tip={`d${d} — clique adiciona, duplo clique rola`}
              onClick={() => setPool((p) => ({ ...p, [d]: Math.min(30, (p[d] ?? 0) + 1) }))}
              onDoubleClick={(e) => {
                setPool({});
                void act('roll.formula', { formula: `1d${d}`, mode: d === 20 ? rollMode(e) : 'normal', visibility: secret ? 'gm' : 'public' });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setPool((p) => ({ ...p, [d]: Math.max(0, (p[d] ?? 0) - 1) }));
              }}
            >
              <DieIcon sides={d} />
              <span>{d === 100 ? '%' : d}</span>
              {pool[d] ? <span className="die-btn__count">{pool[d]}</span> : null}
            </button>
          ))}
        </div>
        {poolFormula && (
          <div className="hotbar__pool">
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Menos" onClick={() => setBonus((b) => b - 1)}>−</button>
            <span className="u-mono u-gold hotbar__formula">{poolFormula}</span>
            <button type="button" className="icon-btn icon-btn--sm" aria-label="Mais" onClick={() => setBonus((b) => b + 1)}>+</button>
            <button type="button" className="btn btn--primary btn--sm" onClick={rollPool}><Dices /> Rolar</button>
            <IconButton size="sm" icon={<X />} label="Limpar" onClick={() => { setPool({}); setBonus(0); }} />
          </div>
        )}
        {isDM && (
          <IconButton size="sm" icon={<EyeOff />} label={secret ? 'Rolagens secretas: ligado' : 'Rolagens secretas: desligado'} active={secret} dm onClick={() => setSecret((s) => !s)} />
        )}
        <span className="hotbar__sep" />
        <QuickActions />
        <TurnControls />
        <IconButton size="sm" className="hotbar__collapse" icon={collapsed ? <ChevronsUp /> : <ChevronsDown />} label={collapsed ? 'Mostrar barra' : 'Recolher barra'} onClick={() => setCollapsed((c) => !c)} />
      </div>
      <TargetsBar />
    </div>
  );
}

function TargetsBar() {
  const targets = useUi((s) => s.targets);
  const scene = useGame((s) => {
    const st = s.state;
    return st?.activeSceneId ? st.scenes[st.activeSceneId] : undefined;
  });
  const me = useGame((s) => s.me);
  if (!targets.length) return null;
  const names = targets.map((id) => scene?.tokens[id]?.name).filter(Boolean);
  return (
    <div className="hotbar__targets panel">
      <Target size={14} className="u-danger" />
      <span className="u-sm u-ellipsis">Alvos: <strong>{names.join(', ') || targets.length}</strong></span>
      <button type="button" className="icon-btn icon-btn--sm" aria-label="Limpar alvos" data-tip="Limpar alvos" onClick={() => {
        useUi.getState().setTargets([]);
        if (me) sendFx({ type: 'target', playerId: me.id, tokenIds: [] });
      }}><X /></button>
    </div>
  );
}

function QuickActions() {
  const selected = useSelectedTokens();
  const myChar = useMyCharacter();
  const characters = useGame((s) => s.state?.characters);
  const sceneId = useViewSceneId();
  const isDM = useIsDM();
  const system = useActiveCustomSystem();
  const [checkAnchor, setCheckAnchor] = useState<HTMLElement | null>(null);

  const single = selected.length === 1 ? selected[0]! : null;
  const linked = single?.characterId ? characters?.[single.characterId] : undefined;
  const character = linked ?? (single ? undefined : myChar ?? undefined);
  const monster = single && !linked && single.monsterId ? MONSTERS_BY_ID[single.monsterId] : undefined;
  const actorLabel = character?.name ?? monster?.name ?? single?.name;

  const targets = () => useUi.getState().targets;
  const items: { key: string; label: string; sub: string; icon: React.ReactNode; run: (e: React.MouseEvent) => void }[] = [];
  const custom = character && system ? system : null;
  const rollCustom = (kind: 'stat' | 'skill' | 'equipment' | 'mechanic', key: string, e: React.MouseEvent) => {
    if (!character) return;
    void act('roll.custom', {
      characterId: character.id, tokenId: single?.characterId === character.id ? single.id : undefined, kind, key, mode: rollMode(e),
    });
    setCheckAnchor(null);
  };
  if (custom && character) {
    // Custom system: the sheet's rollable items and the system's mechanics.
    const owned = new Set(character.inventory.map((i) => (i.ref?.startsWith('sys:') ? i.ref.slice(4) : '')));
    const short = (f: string) => {
      const p = prettyFormula(f, custom);
      return p.length <= 12 ? p : '';
    };
    for (const e of custom.equipment.filter((x) => x.formula && owned.has(x.key)).slice(0, 2)) {
      items.push({ key: `eq-${e.key}`, label: e.name, sub: short(e.formula!), icon: <Sword />, run: (ev) => rollCustom('equipment', e.key, ev) });
    }
    for (const m of custom.mechanics.filter((x) => x.formula).slice(0, 2)) {
      items.push({ key: `mc-${m.key}`, label: m.name, sub: short(m.formula!), icon: <Sparkles />, run: (ev) => rollCustom('mechanic', m.key, ev) });
    }
  } else if (character) {
    const st = computeStats(character);
    for (const a of character.attacks.slice(0, 6)) {
      items.push({
        key: a.id,
        label: a.name,
        sub: a.save ? `CD ${a.save.dc === 'spell' ? st.spell?.dc ?? '?' : a.save.dc}` : signed(attackToHit(character, a, st)),
        icon: <Sword />,
        run: (e) => void act('roll.attack', {
          characterId: character.id, tokenId: single?.characterId === character.id ? single.id : undefined, sceneId: sceneId ?? undefined,
          attackId: a.id, targets: targets(), mode: rollMode(e),
        }),
      });
    }
    const spells = (character.spellcasting?.spells ?? [])
      .filter((s) => (s.level === 0 || s.prepared) && s.ref && (SPELLS_BY_ID[s.ref]?.damage || SPELLS_BY_ID[s.ref]?.heal))
      .slice(0, 4);
    for (const s of spells) {
      items.push({
        key: s.id,
        label: s.name,
        sub: s.level === 0 ? 'truque' : `${s.level}º`,
        icon: <Sparkles />,
        run: (e) => void act('roll.spell', {
          characterId: character.id, knownSpellId: s.id, slotLevel: s.level, sceneId: sceneId ?? undefined,
          targets: targets(), mode: rollMode(e), consumeSlot: true,
        }),
      });
    }
  } else if (monster && single && isDM) {
    monster.actions.forEach((a, i) => {
      if (!a.attack && !a.save) return;
      items.push({
        key: `m${i}`,
        label: a.name,
        sub: a.attack ? signed(a.attack.bonus) : `CD ${a.save!.dc}`,
        icon: a.attack ? <Sword /> : <Zap />,
        run: (e) => void act('roll.attack', { tokenId: single.id, sceneId: sceneId ?? undefined, actionIndex: i, targets: targets(), mode: rollMode(e) }),
      });
    });
  }

  const canCheck = !!character || (!!monster && isDM);
  if (!items.length && !canCheck) {
    return <div className="hotbar__hint u-xs u-dim">{isDM ? 'Selecione um token para ver as ações' : 'Crie seu personagem na aba Personagem'}</div>;
  }
  const check = (kind: 'ability' | 'save' | 'skill', key: string, e: React.MouseEvent) => {
    void act('roll.check', {
      characterId: character?.id, tokenId: character ? undefined : single?.id, kind, key, mode: rollMode(e),
    });
    setCheckAnchor(null);
  };
  return (
    <div className="hotbar__actions">
      {actorLabel && <span className="hotbar__actor u-display u-ellipsis" data-tip={actorLabel}>{actorLabel}</span>}
      {items.map((it) => (
        <button key={it.key} type="button" className="action-chip" onClick={it.run} data-tip={`${it.label} — Shift: vantagem, Ctrl: desvantagem`}>
          {it.icon}
          <span className="u-ellipsis">{it.label}</span>
          <span className="action-chip__sub">{it.sub}</span>
        </button>
      ))}
      {canCheck && (
        <button type="button" className="action-chip action-chip--ghost" onClick={(e) => setCheckAnchor(e.currentTarget)}>
          <Crosshair /> Testes
        </button>
      )}
      {checkAnchor && (
        <Popover anchor={checkAnchor} onClose={() => setCheckAnchor(null)} placement="top">
          {custom ? (
            <div className="check-grid">
              {custom.stats.length > 0 && <div className="menu__label">Atributos</div>}
              <div className="check-grid__row">
                {custom.stats.map((st) => (
                  <button key={st.key} type="button" className="chip" data-tip={`Teste de ${st.name}`} onClick={(e) => rollCustom('stat', st.key, e)}>{st.short}</button>
                ))}
              </div>
              {custom.skills.length > 0 && <div className="menu__label">Perícias</div>}
              <div className="check-grid__skills">
                {custom.skills.map((sk) => (
                  <button key={sk.key} type="button" className="menu__item" onClick={(e) => rollCustom('skill', sk.key, e)}>{sk.name}</button>
                ))}
              </div>
            </div>
          ) : (
            <div className="check-grid">
              <div className="menu__label">Salvaguardas</div>
              <div className="check-grid__row">
                {ABILITY_LIST.map((a: Ability) => (
                  <button key={a} type="button" className="chip" data-tip={`Salvaguarda de ${ABILITY_NAME[a]}`} onClick={(e) => check('save', a, e)}>{ABILITY_SHORT[a]}</button>
                ))}
              </div>
              <div className="menu__label">Atributos</div>
              <div className="check-grid__row">
                {ABILITY_LIST.map((a: Ability) => (
                  <button key={a} type="button" className="chip" data-tip={`Teste de ${ABILITY_NAME[a]}`} onClick={(e) => check('ability', a, e)}>{ABILITY_SHORT[a]}</button>
                ))}
              </div>
              <div className="menu__label">Perícias</div>
              <div className="check-grid__skills">
                {SKILL_LIST.map((s: SkillId) => (
                  <button key={s} type="button" className="menu__item" onClick={(e) => check('skill', s, e)}>{SKILL_NAME[s]}</button>
                ))}
              </div>
            </div>
          )}
        </Popover>
      )}
    </div>
  );
}

function TurnControls() {
  const combat = useGame((s) => s.state?.combat ?? null);
  const me = useGame((s) => s.me);
  const isDM = useIsDM();
  if (!combat?.started || !me) return null;
  const cur = combat.turn >= 0 ? combat.combatants[combat.turn] : undefined;
  const mine = !!cur && cur.ownerIds.includes(me.id);
  if (!mine && !isDM) {
    return (
      <span className="hotbar__wait u-xs u-muted"><Hourglass size={13} /> Vez de {cur?.name ?? '???'}</span>
    );
  }
  return (
    <button
      type="button"
      className={`btn btn--sm ${mine ? 'btn--primary hotbar__endturn' : ''}`}
      onClick={() => act('combat.next', { expectedTurn: combat.turn }).then((r) => {
        if (r.ok && mine) toast('Turno encerrado.', 'success', 1400);
      })}
    >
      <Flag /> {mine ? 'Encerrar meu turno' : 'Próximo turno'}
    </button>
  );
}

export { Trash2 };
