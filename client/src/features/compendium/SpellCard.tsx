// Spell card: header with school sigil, casting stats, description, upcasting and sheet/template actions.
import type { ReactNode } from 'react';
import { BookPlus, Check, Clock, Hourglass, Ruler, Shapes, Sparkles, Target } from 'lucide-react';
import type { SpellData } from '@shared/data5e/types.ts';
import type { Ability, Character, Spellcasting } from '@shared/types.ts';
import { ABILITY_NAME, DAMAGE_TYPE_COLOR } from '@shared/rules5e.ts';
import { CLASSES, CLASSES_BY_ID } from '@shared/data5e/classes.ts';
import { spellSlotsFor } from '@shared/data5e/tables.ts';
import { act } from '../../net/socket.ts';
import { useMyCharacter } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, toast } from '../../ui/index.tsx';
import { areaText, damageText, SCHOOL_COLOR, SCHOOL_NAME, spellLevelLabel } from './format.ts';
import { DiceChip, newShortId, revealMapOnMobile, RichText, SCHOOL_ICON, StatTile, type RollCtx } from './parts.tsx';

/** Spellcasting ability for a character, preferring a class that has this spell on its list. */
function castingAbility(c: Character, spell?: SpellData): Ability {
  const casters = c.classes
    .map((k) => ({ k, data: CLASSES_BY_ID[k.id] }))
    .filter((x) => x.data?.spellcasting);
  const match = spell ? casters.find((x) => spell.classes.includes(x.k.id)) : undefined;
  const pick = match ?? casters.sort((a, b) => b.k.level - a.k.level)[0];
  if (pick?.data?.spellcasting) return pick.data.spellcasting.ability;
  // No caster class: use the best mental ability.
  const mental: Ability[] = ['int', 'wis', 'cha'];
  return mental.sort((a, b) => c.abilities[b] - c.abilities[a])[0]!;
}

function emptySpellcasting(c: Character, spell?: SpellData): Spellcasting {
  const { slots, pact } = spellSlotsFor(c.classes, CLASSES);
  return {
    ability: castingAbility(c, spell),
    slots: Object.fromEntries(Object.entries(slots).filter(([, n]) => n > 0).map(([lvl, n]) => [lvl, { max: n, used: 0 }])),
    pact: pact ? { max: pact.count, used: 0, level: pact.level } : null,
    spells: [],
  };
}

export async function addSpellToCharacter(c: Character, spell: SpellData): Promise<boolean> {
  const sc = c.spellcasting ?? emptySpellcasting(c, spell);
  if (sc.spells.some((s) => s.ref === spell.id)) {
    toast(`${spell.name} já está na ficha de ${c.name}.`, 'info');
    return false;
  }
  const next: Spellcasting = {
    ...sc,
    spells: [...sc.spells, { id: newShortId(), ref: spell.id, name: spell.name, level: spell.level, prepared: true, notes: '' }],
  };
  const res = await act('character.update', { id: c.id, patch: { spellcasting: next } });
  if (res.ok) toast(`${spell.name} adicionada à ficha de ${c.name}.`, 'success');
  return res.ok;
}

export function spellTemplateAction(spell: SpellData) {
  return () => {
    const a = spell.area;
    if (!a) return;
    const dmg = spell.damage?.[0]?.type;
    const ui = useUi.getState();
    ui.setToolOpts('template', {
      kind: a.kind,
      size: a.size,
      width: a.width ?? 5,
      spellId: spell.id,
      label: spell.name,
      ...(dmg && DAMAGE_TYPE_COLOR[dmg] ? { color: DAMAGE_TYPE_COLOR[dmg] } : {}),
    });
    ui.setTool('template');
    revealMapOnMobile();
    toast(`${areaText(a)} — clique no mapa para posicionar.`, 'info');
  };
}

export function SpellCard({ spell }: { spell: SpellData }) {
  const me = useMyCharacter();
  const known = !!me?.spellcasting?.spells.some((s) => s.ref === spell.id);
  const onUseArea = spellTemplateAction(spell);
  const SchoolIcon = SCHOOL_ICON[spell.school] ?? Sparkles;
  const color = SCHOOL_COLOR[spell.school] ?? 'var(--gold-400)';
  const ctx: RollCtx = { label: spell.name, speaker: me?.name ?? null };
  const comps = [spell.components.v && 'V', spell.components.s && 'S', spell.components.m !== null && 'M'].filter(Boolean) as string[];

  return (
    <article className="cmp-card cmp-spell" style={{ ['--school-c' as string]: color }}>
      <header className="cmp-spell__head">
        <div className="cmp-spell__sigil" aria-hidden>
          <SchoolIcon />
          <span>{spell.level === 0 ? 'T' : spell.level}</span>
        </div>
        <div className="u-grow">
          <h2 className="cmp-card__title">{spell.name}</h2>
          <div className="cmp-card__sub">
            {spell.level === 0 ? `Truque de ${SCHOOL_NAME[spell.school]}` : `${SCHOOL_NAME[spell.school]} de ${spellLevelLabel(spell.level)}`}
            <span className="cmp-card__en"> · {spell.nameEn}</span>
          </div>
          {(spell.concentration || spell.ritual) && (
            <div className="cmp-badges">
              {spell.concentration && <span className="badge badge--info" data-tip="Exige concentração">Concentração</span>}
              {spell.ritual && <span className="badge badge--dm" data-tip="Pode ser conjurada como ritual (+10 minutos)">Ritual</span>}
            </div>
          )}
        </div>
      </header>

      <div className="cmp-tiles">
        <StatTile label="Conjuração"><Clock /> {spell.castingTime}</StatTile>
        <StatTile label="Alcance"><Ruler /> {spell.range}</StatTile>
        <StatTile label="Componentes">
          <span className="cmp-comps">
            {comps.map((c) => <span key={c} className="cmp-comp" data-tip={c === 'V' ? 'Verbal' : c === 'S' ? 'Somático' : 'Material'}>{c}</span>)}
          </span>
        </StatTile>
        <StatTile label="Duração"><Hourglass /> {spell.duration}</StatTile>
      </div>
      {spell.components.m && <div className="cmp-spell__material">Material: {spell.components.m}</div>}

      <SpellEffects spell={spell} ctx={ctx} />

      <RichText text={spell.description} roll={ctx} className="cmp-card__body" />

      {spell.higherLevels && (
        <div className="cmp-callout">
          <div className="cmp-callout__title">Em níveis superiores</div>
          <RichText text={spell.higherLevels} roll={ctx} leadIns={false} />
        </div>
      )}

      {spell.classes.length > 0 && (
        <div className="cmp-card__classes">
          <span className="cmp-card__label">Classes</span>
          <div className="cmp-badges">
            {spell.classes.map((id) => <span key={id} className="cmp-tag">{CLASSES_BY_ID[id]?.name ?? id}</span>)}
          </div>
        </div>
      )}

      {(me || spell.area) && (
        <div className="cmp-actions">
          {me && (
            <Button
              size="sm"
              variant={known ? 'default' : 'primary'}
              icon={known ? <Check /> : <BookPlus />}
              disabled={known}
              onClick={() => void addSpellToCharacter(me, spell)}
              data-tip={known ? undefined : `Adicionar à ficha de ${me.name}`}
            >
              {known ? 'Na ficha' : 'Adicionar à ficha'}
            </Button>
          )}
          {spell.area && (
            <Button size="sm" variant="arcane" icon={<Shapes />} onClick={onUseArea} data-tip={areaText(spell.area)}>
              Usar área
            </Button>
          )}
        </div>
      )}
    </article>
  );
}

/** Structured automation summary: attack/save, damage/heal dice, area. */
function SpellEffects({ spell, ctx }: { spell: SpellData; ctx: RollCtx }) {
  const parts: ReactNode[] = [];
  if (spell.attack) {
    parts.push(
      <span key="atk" className="cmp-chip-static"><Target /> Ataque mágico {spell.attack === 'melee' ? 'corpo a corpo' : 'à distância'}</span>,
    );
  }
  if (spell.save) {
    parts.push(
      <span key="save" className="cmp-chip-static">
        Salvaguarda de {ABILITY_NAME[spell.save]}{spell.half ? ' · metade' : ''}
      </span>,
    );
  }
  for (const [i, d] of (spell.damage ?? []).entries()) {
    parts.push(
      <DiceChip key={`d${i}`} formula={d.formula} ctx={{ ...ctx, label: `${ctx.label} — dano` }} color={DAMAGE_TYPE_COLOR[d.type]}>
        {damageText(d)}
      </DiceChip>,
    );
  }
  if (spell.heal) {
    parts.push(
      /\d+d\d+/.test(spell.heal)
        ? <DiceChip key="heal" formula={spell.heal.replace(/@\w+/g, '0')} ctx={{ ...ctx, label: `${ctx.label} — cura` }} color={DAMAGE_TYPE_COLOR.healing}>{spell.heal.replace(/@mod/g, 'mod')} cura</DiceChip>
        : <span key="heal" className="cmp-chip-static" style={{ color: DAMAGE_TYPE_COLOR.healing }}>{spell.heal} cura</span>,
    );
  }
  if (spell.upcast) parts.push(<span key="up" className="cmp-chip-static" data-tip="Por nível de espaço acima do base">+{spell.upcast}/nível</span>);
  if (spell.area) parts.push(<span key="area" className="cmp-chip-static"><Shapes /> {areaText(spell.area)}</span>);
  if (!parts.length) return null;
  return <div className="cmp-effects">{parts}</div>;
}
