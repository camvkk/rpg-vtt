// Compact reference cards for races, classes and backgrounds (reached from "Tudo" search).
import type { BackgroundData, ClassData, NamedText, RaceData } from '@shared/data5e/types.ts';
import { ABILITY_SHORT, SKILL_NAME } from '@shared/rules5e.ts';
import { RichText, StatTile } from './parts.tsx';

function Entries({ list }: { list: NamedText[] }) {
  return (
    <div className="cmp-lore__entries">
      {list.map((t, i) => (
        <RichText key={i} text={t.text} leadIns={false} prefix={<strong className="cmp-sb__entry-name">{t.name}. </strong>} />
      ))}
    </div>
  );
}

const SIZE_PT: Record<string, string> = { tiny: 'Miúdo', small: 'Pequeno', medium: 'Médio', large: 'Grande', huge: 'Enorme', gargantuan: 'Imenso' };

export function RaceCard({ race }: { race: RaceData }) {
  const bonuses = Object.entries(race.abilityBonuses)
    .map(([k, v]) => `${ABILITY_SHORT[k as keyof typeof ABILITY_SHORT]} +${v}`)
    .join(', ');
  return (
    <article className="cmp-card">
      <h2 className="cmp-card__title">{race.name}</h2>
      <div className="cmp-card__sub">Raça</div>
      <div className="cmp-tiles">
        <StatTile label="Tamanho">{SIZE_PT[race.size] ?? race.size}</StatTile>
        <StatTile label="Deslocamento">{race.speed} pés</StatTile>
        <StatTile label="Atributos">{bonuses || (race.choiceBonuses ? 'À escolha' : '—')}</StatTile>
        <StatTile label="Visão no escuro">{race.darkvision ? `${race.darkvision} pés` : '—'}</StatTile>
      </div>
      <RichText text={race.description} className="cmp-card__body" />
      <Entries list={race.traits} />
      {race.subraces.map((s) => (
        <section key={s.id} className="cmp-lore__sub">
          <h3 className="cmp-sb__section-title">{s.name}</h3>
          <RichText text={s.description} />
          <Entries list={s.traits} />
        </section>
      ))}
    </article>
  );
}

export function ClassCard({ cls }: { cls: ClassData }) {
  return (
    <article className="cmp-card">
      <h2 className="cmp-card__title">{cls.name}</h2>
      <div className="cmp-card__sub">Classe · {cls.subclassLabel}</div>
      <div className="cmp-tiles">
        <StatTile label="Dado de vida">d{cls.hitDie}</StatTile>
        <StatTile label="Salvaguardas">{cls.saves.map((a) => ABILITY_SHORT[a]).join(', ')}</StatTile>
        <StatTile label="Armaduras" wide>{cls.armorProfs || '—'}</StatTile>
        <StatTile label="Armas" wide>{cls.weaponProfs || '—'}</StatTile>
      </div>
      <RichText text={cls.description} className="cmp-card__body" />
      <h3 className="cmp-sb__section-title">Características</h3>
      <div className="cmp-lore__entries">
        {cls.features.map((f, i) => (
          <RichText key={i} text={f.text} leadIns={false} prefix={<strong className="cmp-sb__entry-name">{f.level}º · {f.name}. </strong>} />
        ))}
      </div>
      {cls.subclasses.map((s) => (
        <section key={s.id} className="cmp-lore__sub">
          <h3 className="cmp-sb__section-title">{s.name}</h3>
          <RichText text={s.description} />
          {s.features.map((f, i) => (
            <RichText key={i} text={f.text} leadIns={false} prefix={<strong className="cmp-sb__entry-name">{f.level}º · {f.name}. </strong>} />
          ))}
        </section>
      ))}
    </article>
  );
}

export function BackgroundCard({ bg }: { bg: BackgroundData }) {
  return (
    <article className="cmp-card">
      <h2 className="cmp-card__title">{bg.name}</h2>
      <div className="cmp-card__sub">Antecedente</div>
      <div className="cmp-tiles">
        <StatTile label="Perícias" wide>{bg.skillProfs.map((s) => SKILL_NAME[s]).join(', ') || '—'}</StatTile>
        {bg.toolProfs && <StatTile label="Ferramentas" wide>{bg.toolProfs}</StatTile>}
        {bg.languages && <StatTile label="Idiomas" wide>{bg.languages}</StatTile>}
      </div>
      <RichText text={bg.description} className="cmp-card__body" />
      {bg.equipment && <RichText text={`Equipamento. ${bg.equipment}`} />}
      <Entries list={[bg.feature]} />
    </article>
  );
}
