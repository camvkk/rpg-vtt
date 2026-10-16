// "Atributos" tab: ability scores, saving throws, skills (proficiency / expertise) and passive senses.
import { memo } from 'react';
import { Dices, Ear, Eye, Search, ShieldCheck, Target } from 'lucide-react';
import type { Ability, ID, ProfLevel, SkillId } from '@shared/types.ts';
import { ABILITY_LIST, ABILITY_NAME, ABILITY_SHORT, SKILL_ABILITY, SKILL_NAME } from '@shared/rules5e.ts';
import { SKILL_IDS, SKILLS } from '@shared/data5e/skills.ts';
import { Toggle } from '../../ui/index.tsx';
import { NumInput, patchCharacter, rollCheck, Section, signed, type TabProps } from './common.tsx';

export function AbilitiesTab({ c, stats, canEdit }: TabProps) {
  return (
    <div className="cs-stack">
      <div className="cs-abilities">
        {ABILITY_LIST.map((a) => (
          <AbilityCard key={a} cid={c.id} a={a} score={c.abilities[a]} modv={stats.mods[a]} canEdit={canEdit} />
        ))}
      </div>
      {canEdit && <RollHint />}
      <Section title="Salvaguardas" icon={<ShieldCheck />}>
        <div className="cs-saves">
          {ABILITY_LIST.map((a) => (
            <SaveRow key={a} cid={c.id} a={a} value={stats.saves[a]} prof={c.saveProfs.includes(a)} canEdit={canEdit} />
          ))}
        </div>
      </Section>
      <Section
        title="Perícias"
        icon={<Target />}
        right={(
          <span data-tip="Pau para Toda Obra: soma metade da proficiência em testes sem proficiência">
            <Toggle
              checked={c.jackOfAllTrades}
              disabled={!canEdit}
              label={<span className="u-xs">Pau p/ toda obra</span>}
              onChange={(v) => void patchCharacter(c.id, { jackOfAllTrades: v })}
            />
          </span>
        )}
      >
        <div className="cs-skills">
          {SKILL_IDS.map((s) => (
            <SkillRow key={s} cid={c.id} skill={s} value={stats.skills[s]} prof={c.skills[s] ?? 0} canEdit={canEdit} />
          ))}
        </div>
      </Section>
      <Section title="Sentidos passivos" icon={<Eye />}>
        <div className="cs-passives">
          <div className="cs-passive"><Eye /><span className="cs-passive__v">{stats.passive.perception}</span><span className="cs-passive__l">Percepção</span></div>
          <div className="cs-passive"><Search /><span className="cs-passive__v">{stats.passive.investigation}</span><span className="cs-passive__l">Investigação</span></div>
          <div className="cs-passive"><Ear /><span className="cs-passive__v">{stats.passive.insight}</span><span className="cs-passive__l">Intuição</span></div>
        </div>
        {c.senses.darkvision > 0 && <div className="u-xs u-muted u-mt-2">Visão no escuro: {c.senses.darkvision} pés.</div>}
      </Section>
    </div>
  );
}

export function RollHint() {
  return (
    <div className="cs-rollhint">
      <Dices /> Clique para rolar · <kbd className="kbd">Shift</kbd> vantagem · <kbd className="kbd">Ctrl</kbd> desvantagem
    </div>
  );
}

const AbilityCard = memo(function AbilityCard({ cid, a, score, modv, canEdit }: {
  cid: ID;
  a: Ability;
  score: number;
  modv: number;
  canEdit: boolean;
}) {
  const roll = (e: React.MouseEvent | React.KeyboardEvent) => {
    if (canEdit) rollCheck(cid, 'ability', a, e);
  };
  return (
    <div
      className="cs-ability"
      role="button"
      tabIndex={canEdit ? 0 : -1}
      aria-disabled={!canEdit}
      data-tip={canEdit ? `Teste de ${ABILITY_NAME[a]}` : ABILITY_NAME[a]}
      onClick={roll}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) roll(e);
      }}
    >
      <span className="cs-ability__short">{ABILITY_SHORT[a]}</span>
      <span className="cs-ability__mod">{signed(modv)}</span>
      <span className="cs-ability__score" onClick={(e) => e.stopPropagation()}>
        {canEdit ? (
          <NumInput className="cs-ability__input" value={score} min={1} max={30} aria-label={`Valor de ${ABILITY_NAME[a]}`} onCommit={(v) => void patchCharacter(cid, (cur) => ({ abilities: { ...cur.abilities, [a]: v } }))} />
        ) : (
          <span className="u-tabular">{score}</span>
        )}
      </span>
      {canEdit && <Dices className="cs-ability__die" />}
    </div>
  );
});

const SaveRow = memo(function SaveRow({ cid, a, value, prof, canEdit }: { cid: ID; a: Ability; value: number; prof: boolean; canEdit: boolean }) {
  return (
    <div
      className="cs-row"
      role="button"
      tabIndex={canEdit ? 0 : -1}
      aria-disabled={!canEdit}
      onClick={(e) => canEdit && rollCheck(cid, 'save', a, e)}
      onKeyDown={(e) => {
        if (canEdit && e.key === 'Enter' && e.target === e.currentTarget) rollCheck(cid, 'save', a, e);
      }}
    >
      <button
        type="button"
        className="cs-prof"
        data-level={prof ? 1 : 0}
        disabled={!canEdit}
        aria-label={prof ? 'Remover proficiência' : 'Marcar proficiência'}
        data-tip={prof ? 'Proficiente' : 'Sem proficiência'}
        onClick={(e) => {
          e.stopPropagation();
          void patchCharacter(cid, (cur) => ({
            saveProfs: cur.saveProfs.includes(a) ? cur.saveProfs.filter((x) => x !== a) : [...cur.saveProfs, a],
          }));
        }}
      />
      <span className="cs-row__name">{ABILITY_NAME[a]}</span>
      <span className="cs-row__value" data-prof={prof ? 1 : 0}>{signed(value)}</span>
    </div>
  );
});

const PROF_TIP: Record<ProfLevel, string> = { 0: 'Sem proficiência', 1: 'Proficiente', 2: 'Especialista (dobro)' };

const SkillRow = memo(function SkillRow({ cid, skill, value, prof, canEdit }: {
  cid: ID;
  skill: SkillId;
  value: number;
  prof: ProfLevel;
  canEdit: boolean;
}) {
  return (
    <div
      className="cs-row"
      role="button"
      tabIndex={canEdit ? 0 : -1}
      aria-disabled={!canEdit}
      onClick={(e) => canEdit && rollCheck(cid, 'skill', skill, e)}
      onKeyDown={(e) => {
        if (canEdit && e.key === 'Enter' && e.target === e.currentTarget) rollCheck(cid, 'skill', skill, e);
      }}
      title={SKILLS[skill].description}
    >
      <button
        type="button"
        className="cs-prof"
        data-level={prof}
        disabled={!canEdit}
        aria-label={PROF_TIP[prof]}
        data-tip={`${PROF_TIP[prof]} — clique para alternar`}
        onClick={(e) => {
          e.stopPropagation();
          void patchCharacter(cid, (cur) => {
            const curLevel = cur.skills[skill] ?? 0;
            const next = ((curLevel + 1) % 3) as ProfLevel;
            const skills = { ...cur.skills };
            if (next === 0) delete skills[skill];
            else skills[skill] = next;
            return { skills };
          });
        }}
      />
      <span className="cs-row__name">{SKILL_NAME[skill]}</span>
      <span className="cs-row__ab">{ABILITY_SHORT[SKILL_ABILITY[skill]]}</span>
      <span className="cs-row__value" data-prof={prof}>{signed(value)}</span>
    </div>
  );
});
