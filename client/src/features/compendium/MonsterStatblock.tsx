// Classic 5e statblock, dark-parchment variant. Rolls through the server when bound to a token.
import { useState, type ReactNode } from 'react';
import { Crosshair, Dices, GripVertical, MapPin, Minus, Plus, Shapes, Swords, Target } from 'lucide-react';
import type { Monster, MonsterAction, NamedText } from '@shared/data5e/types.ts';
import type { Ability, SkillId, Token } from '@shared/types.ts';
import { ABILITY_LIST, ABILITY_NAME, ABILITY_SHORT, DAMAGE_TYPE_COLOR, mod, SIZE_CELLS, SKILL_NAME } from '@shared/rules5e.ts';
import { crToXp, formatCr, proficiencyBonusForCr } from '@shared/data5e/tables.ts';
import { engineApi, setDragPayload } from '../../engine/api.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { canControl, getViewScene, useIsDM, useSelectedTokens, useViewSceneId } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, toast, Toggle } from '../../ui/index.tsx';
import { AREA_NAME, damageText, fmtNum, monsterTypeLine, signed } from './format.ts';
import { DiceChip, revealMapOnMobile, RichText, rollFormula, type RollCtx } from './parts.tsx';

const SAVE_SHORT: Record<Ability, string> = { str: 'For', dex: 'Des', con: 'Con', int: 'Int', wis: 'Sab', cha: 'Car' };

/** Finds the scene holding a token id (stable string selector). */
function useTokenScene(tokenId: string | null | undefined): string | null {
  return useGame((s) => {
    if (!tokenId || !s.state) return null;
    for (const sc of Object.values(s.state.scenes)) if (sc.tokens[tokenId]) return sc.id;
    return null;
  });
}

export function MonsterStatblock({ monster, tokenId }: { monster: Monster; tokenId?: string | null }) {
  const isDM = useIsDM();
  const viewSceneId = useViewSceneId();
  const selected = useSelectedTokens();
  const targetCount = useUi((s) => s.targets.length);

  // Token that rolls: explicit prop, else the single selected token created from this monster.
  const boundSceneId = useTokenScene(tokenId);
  const boundToken = useGame((s) => (tokenId && boundSceneId ? s.state?.scenes[boundSceneId]?.tokens[tokenId] ?? null : null));
  const sel = selected.length === 1 ? selected[0]! : null;
  const autoToken = !tokenId && sel && sel.monsterId === monster.id && canControl(sel) ? sel : null;
  const roller: Token | null = boundToken ?? autoToken;
  const rollSceneId = boundToken ? boundSceneId : viewSceneId;

  const freeCtx = (label: string): RollCtx => ({ label: `${monster.name} — ${label}`, speaker: monster.name, gm: isDM });

  const rollCheck = (kind: 'ability' | 'save' | 'skill', key: string, bonus: number, label: string) => {
    if (roller) {
      void act('roll.check', { tokenId: roller.id, kind, key, mode: useUi.getState().rollMode });
    } else {
      rollFormula(`1d20${signed(bonus)}`, freeCtx(label));
    }
  };

  const rollAction = (index: number, bonusAction: boolean) => {
    if (!roller) return;
    const ui = useUi.getState();
    void act('roll.attack', {
      tokenId: roller.id,
      sceneId: rollSceneId ?? undefined,
      actionIndex: index,
      bonusAction: bonusAction || undefined,
      targets: ui.targets,
      mode: ui.rollMode,
    });
  };

  const xp = monster.xp || crToXp(monster.cr);
  const saves = ABILITY_LIST.filter((a) => monster.saves[a] !== undefined);
  const skills = (Object.keys(monster.skills) as SkillId[]).filter((k) => monster.skills[k] !== undefined);

  return (
    <div className="cmp-sbwrap">
      <article className="cmp-sb">
        <header
          className="cmp-sb__head"
          draggable={isDM}
          onDragStart={isDM ? (e) => setDragPayload(e, { kind: 'monster', id: monster.id }) : undefined}
          data-tip={isDM ? 'Arraste para o mapa' : undefined}
        >
          {isDM && <GripVertical className="cmp-sb__grip" aria-hidden />}
          <div className="u-grow">
            <h2 className="cmp-sb__name">{monster.name}</h2>
            <div className="cmp-sb__type">{monsterTypeLine(monster)}</div>
          </div>
          <div className="cmp-sb__seal" aria-label={`Nível de desafio ${formatCr(monster.cr)}`}>
            <span>ND</span>
            <strong>{formatCr(monster.cr)}</strong>
          </div>
        </header>

        {roller && (
          <div className="cmp-sb__bound">
            <Crosshair />
            <span className="u-grow u-ellipsis">Rolando como <strong>{roller.name}</strong></span>
            {targetCount > 0 && <span className="badge badge--danger"><Target /> {targetCount} {targetCount === 1 ? 'alvo' : 'alvos'}</span>}
          </div>
        )}

        <Rule />
        <div className="cmp-sb__block">
          <Prop label="Classe de Armadura">
            {monster.ac}{monster.acNote ? ` (${monster.acNote})` : ''}
          </Prop>
          <Prop label="Pontos de Vida">
            {monster.hp}
            {monster.hpFormula && (
              <>
                {' ('}
                <DiceChip formula={monster.hpFormula} ctx={freeCtx('Pontos de vida')} tip="Rolar pontos de vida" />
                {')'}
              </>
            )}
          </Prop>
          <Prop label="Deslocamento">{monster.speed}</Prop>
        </div>
        <Rule />

        <div className="cmp-sb__abilities">
          {ABILITY_LIST.map((a) => {
            const score = monster.abilities[a];
            const m = mod(score);
            return (
              <button
                key={a}
                type="button"
                className="cmp-sb__ab"
                data-tip={`Teste de ${ABILITY_NAME[a]}`}
                onClick={() => rollCheck('ability', a, m, `Teste de ${ABILITY_NAME[a]}`)}
              >
                <span className="cmp-sb__ab-k">{ABILITY_SHORT[a]}</span>
                <span className="cmp-sb__ab-v">{score}</span>
                <span className="cmp-sb__ab-m">{signed(m)}</span>
              </button>
            );
          })}
        </div>
        <Rule />

        <div className="cmp-sb__block">
          {saves.length > 0 && (
            <Prop label="Salvaguardas">
              {saves.map((a, i) => (
                <Sep key={a} i={i}>
                  <button type="button" className="cmp-sb__link" data-tip={`Salvaguarda de ${ABILITY_NAME[a]}`} onClick={() => rollCheck('save', a, monster.saves[a]!, `Salvaguarda de ${ABILITY_NAME[a]}`)}>
                    {SAVE_SHORT[a]} {signed(monster.saves[a]!)}
                  </button>
                </Sep>
              ))}
            </Prop>
          )}
          {skills.length > 0 && (
            <Prop label="Perícias">
              {skills.map((k, i) => (
                <Sep key={k} i={i}>
                  <button type="button" className="cmp-sb__link" data-tip={`Teste de ${SKILL_NAME[k]}`} onClick={() => rollCheck('skill', k, monster.skills[k]!, `Teste de ${SKILL_NAME[k]}`)}>
                    {SKILL_NAME[k] ?? k} {signed(monster.skills[k]!)}
                  </button>
                </Sep>
              ))}
            </Prop>
          )}
          {monster.vulnerabilities && <Prop label="Vulnerabilidades a Dano">{monster.vulnerabilities}</Prop>}
          {monster.resistances && <Prop label="Resistências a Dano">{monster.resistances}</Prop>}
          {monster.immunities && <Prop label="Imunidades a Dano">{monster.immunities}</Prop>}
          {monster.conditionImmunities && <Prop label="Imunidades a Condição">{monster.conditionImmunities}</Prop>}
          <Prop label="Sentidos">{monster.senses || `Percepção passiva ${monster.passivePerception}`}</Prop>
          <Prop label="Idiomas">{monster.languages || '—'}</Prop>
          <div className="cmp-sb__cr-row">
            <Prop label="Nível de Desafio">{formatCr(monster.cr)} ({fmtNum(xp)} XP)</Prop>
            <Prop label="Proficiência">{signed(proficiencyBonusForCr(monster.cr))}</Prop>
          </div>
        </div>
        <Rule />

        {monster.traits.length > 0 && (
          <div className="cmp-sb__traits">
            {monster.traits.map((t, i) => <Trait key={i} item={t} ctx={freeCtx(t.name)} />)}
          </div>
        )}

        <ActionList title="Ações" list={monster.actions} bonus={false} roller={roller} onRoll={rollAction} freeCtx={freeCtx} isDM={isDM} />
        <ActionList title="Ações Bônus" list={monster.bonusActions} bonus roller={roller} onRoll={rollAction} freeCtx={freeCtx} isDM={isDM} />

        {monster.reactions.length > 0 && (
          <Section title="Reações">
            {monster.reactions.map((t, i) => <Trait key={i} item={t} ctx={freeCtx(t.name)} />)}
          </Section>
        )}

        {monster.legendary.length > 0 && (
          <Section title="Ações Lendárias">
            <p className="cmp-sb__legend-intro">
              {monster.name} pode realizar {monster.legendaryCount || 3} ações lendárias, escolhidas entre as opções abaixo.
              Apenas uma opção pode ser usada por vez, e somente no final do turno de outra criatura.
              As ações lendárias gastas são recuperadas no início do turno de {monster.name}.
            </p>
            {monster.legendary.map((t, i) => <Trait key={i} item={t} ctx={freeCtx(t.name)} />)}
          </Section>
        )}

        {monster.tags.length > 0 && (
          <div className="cmp-sb__tags">
            {monster.tags.map((t) => <span key={t} className="cmp-tag">{t}</span>)}
          </div>
        )}
        <div className="cmp-sb__foot">{monster.nameEn} · SRD 5.1</div>
      </article>
      {isDM && <PlaceOnMap monster={monster} />}
    </div>
  );
}

// ---------------------------------------------------------------------------

function Rule() {
  return <div className="cmp-sb__rule" aria-hidden />;
}

function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="cmp-sb__prop">
      <span className="cmp-sb__prop-k">{label}</span> {children}
    </div>
  );
}

function Sep({ i, children }: { i: number; children: ReactNode }) {
  return <>{i > 0 && ', '}{children}</>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="cmp-sb__section">
      <h3 className="cmp-sb__section-title">{title}</h3>
      {children}
    </section>
  );
}

function Trait({ item, ctx }: { item: NamedText; ctx: RollCtx }) {
  return (
    <RichText
      className="cmp-sb__entry"
      text={item.text}
      roll={ctx}
      leadIns={false}
      prefix={<strong className="cmp-sb__entry-name">{item.name}. </strong>}
    />
  );
}

function rechargeLabel(r: string): string {
  return /^\d/.test(r) && !r.includes('/') ? `Recarga ${r.replace('-', '–')}` : r;
}

function ActionList({ title, list, bonus, roller, onRoll, freeCtx, isDM }: {
  title: string;
  list: MonsterAction[];
  bonus: boolean;
  roller: Token | null;
  onRoll: (index: number, bonus: boolean) => void;
  freeCtx: (label: string) => RollCtx;
  isDM: boolean;
}) {
  if (!list.length) return null;
  return (
    <Section title={title}>
      {list.map((a, i) => {
        const ctx = freeCtx(a.name);
        const recharge = a.recharge ? (
          <>
            {' ('}
            {/^\d/.test(a.recharge) && !a.recharge.includes('/')
              ? <DiceChip formula="1d6" ctx={{ ...ctx, label: `${ctx.label} (recarga)` }} tip="Rolar recarga (1d6)">{rechargeLabel(a.recharge)}</DiceChip>
              : a.recharge}
            {')'}
          </>
        ) : null;
        return (
          <div key={i} className="cmp-sb__action">
            <RichText
              className="cmp-sb__entry"
              text={a.text}
              roll={ctx}
              leadIns={false}
              prefix={<strong className="cmp-sb__entry-name">{a.name}{recharge}. </strong>}
            />
            {(a.attack || a.save) && (
              <ActionStrip action={a} roller={roller} onRoll={() => onRoll(i, bonus)} ctx={ctx} isDM={isDM} />
            )}
          </div>
        );
      })}
    </Section>
  );
}

function ActionStrip({ action, roller, onRoll, ctx, isDM }: {
  action: MonsterAction;
  roller: Token | null;
  onRoll: () => void;
  ctx: RollCtx;
  isDM: boolean;
}) {
  const atk = action.attack;
  const save = action.save;
  const damage = atk?.damage ?? save?.damage ?? [];
  const area = save?.area;
  return (
    <div className="cmp-sb__strip">
      {roller ? (
        <Button size="sm" variant="primary" icon={atk ? <Swords /> : <Dices />} onClick={onRoll} data-tip={atk ? 'Atacar os alvos marcados' : 'Rolar efeito (alvos fazem a salvaguarda)'}>
          {atk ? `Atacar ${signed(atk.bonus)}` : `CD ${save!.dc} ${SAVE_SHORT[save!.ability]}`}
        </Button>
      ) : atk ? (
        <DiceChip formula={`1d20${signed(atk.bonus)}`} ctx={{ ...ctx, label: `${ctx.label} — ataque` }} tip="Rolar ataque">
          <Swords /> {signed(atk.bonus)}
        </DiceChip>
      ) : (
        <span className="cmp-chip-static"><Shapes /> CD {save!.dc} {SAVE_SHORT[save!.ability]}{save!.half ? ' · metade' : ''}</span>
      )}
      {damage.map((d, k) => (
        <DiceChip key={k} formula={d.formula} ctx={{ ...ctx, label: `${ctx.label} — dano` }} color={DAMAGE_TYPE_COLOR[d.type]} tip={`Rolar dano (${damageText(d)})`}>
          {damageText(d)}
        </DiceChip>
      ))}
      {atk?.reach && <span className="cmp-sb__reach">{atk.reach}</span>}
      {area && isDM && (
        <button
          type="button"
          className="cmp-chip-static cmp-chip-static--btn"
          data-tip="Usar como modelo de área no mapa"
          onClick={() => {
            const ui = useUi.getState();
            ui.setToolOpts('template', { kind: area.kind, size: area.size, width: area.width ?? 5, spellId: null, label: action.name });
            ui.setTool('template');
            revealMapOnMobile();
            toast(`${AREA_NAME[area.kind] ?? 'Área'} de ${area.size} pés pronta — clique no mapa.`, 'info');
          }}
        >
          <Shapes /> {AREA_NAME[area.kind] ?? area.kind} {area.size} pés
        </button>
      )}
    </div>
  );
}

/** DM: spawns `count` tokens of a monster centred on the current view (server spreads them in a row). */
export async function placeMonsterOnMap(monster: Monster, count = 1, rollHp = false): Promise<boolean> {
  const scene = getViewScene();
  if (!scene) {
    toast('Nenhuma cena aberta.', 'warning');
    return false;
  }
  const center = engineApi.viewCenter();
  const px = scene.grid.size * (SIZE_CELLS[monster.size] ?? 1);
  const x = center.x - px / 2 - ((count - 1) * px) / 2;
  const y = center.y - px / 2;
  const res = await act('token.create', {
    sceneId: scene.id,
    token: { x, y },
    fromMonster: monster.id,
    rollHp: rollHp || undefined,
    count,
  });
  if (res.ok) {
    const ids = (res.result as { ids?: string[] } | undefined)?.ids;
    if (ids?.length) useUi.getState().select(ids);
    toast(count > 1 ? `${count}× ${monster.name} colocados no mapa.` : `${monster.name} colocado no mapa.`, 'success');
  }
  return res.ok;
}

function PlaceOnMap({ monster }: { monster: Monster }) {
  const [count, setCount] = useState(1);
  const [rollHp, setRollHp] = useState(false);
  const [busy, setBusy] = useState(false);
  const hasScene = useGame((s) => !!s.state && Object.keys(s.state.scenes).length > 0);

  const place = async () => {
    setBusy(true);
    await placeMonsterOnMap(monster, count, rollHp);
    setBusy(false);
  };

  return (
    <div className="cmp-sb__place">
      <div className="cmp-stepper" role="group" aria-label="Quantidade">
        <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={count <= 1} aria-label="Menos"><Minus /></button>
        <span className="u-tabular">{count}×</span>
        <button type="button" onClick={() => setCount((c) => Math.min(8, c + 1))} disabled={count >= 8} aria-label="Mais"><Plus /></button>
      </div>
      <Toggle checked={rollHp} onChange={setRollHp} label="PV rolados" />
      <Button className="u-grow" variant="primary" icon={<MapPin />} onClick={place} disabled={busy || !hasScene}>
        Colocar no mapa
      </Button>
    </div>
  );
}
