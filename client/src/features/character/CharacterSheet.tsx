// Character sheet (D&D 5e). Used embedded in the sidebar and inside floating windows.
import { memo, useMemo, useState, type ReactNode } from 'react';
import {
  Backpack, Dices, Eye, EyeOff, HeartPulse, ScrollText, Star, Swords, WandSparkles,
} from 'lucide-react';
import type { Character, ID } from '@shared/types.ts';
import { computeStats, type CharacterStats } from '@shared/rules5e.ts';
import { getPref, setPref } from '../../net/session.ts';
import { useGame } from '../../store/game.ts';
import { useUi } from '../../store/ui.ts';
import { Empty } from '../../ui/index.tsx';
import {
  classLine, patchCharacter, Portrait, rollInitiative, signed, useCanControl, useLiveCharacter, useSheetPrefs,
} from './common.tsx';
import { MainTab } from './SheetMain.tsx';
import { AbilitiesTab } from './SheetAbilities.tsx';
import { CombatTab } from './SheetCombat.tsx';
import { SpellsTab } from './SheetSpells.tsx';
import { InventoryTab } from './SheetInventory.tsx';
import { TraitsTab } from './SheetTraits.tsx';
import './character.css';

export type SheetTab = 'main' | 'abilities' | 'combat' | 'spells' | 'inventory' | 'traits';

const TABS: { id: SheetTab; label: string; icon: ReactNode }[] = [
  { id: 'main', label: 'Principal', icon: <HeartPulse /> },
  { id: 'abilities', label: 'Atributos', icon: <Dices /> },
  { id: 'combat', label: 'Combate', icon: <Swords /> },
  { id: 'spells', label: 'Magias', icon: <WandSparkles /> },
  { id: 'inventory', label: 'Itens', icon: <Backpack /> },
  { id: 'traits', label: 'Traços', icon: <ScrollText /> },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

export function CharacterSheet({ characterId, mode, headerActions }: {
  characterId: ID;
  mode: 'embedded' | 'window';
  /** Extra buttons rendered in the sheet header (e.g. the panel's character menu). */
  headerActions?: ReactNode;
}) {
  const c = useLiveCharacter(characterId);
  const stats = useMemo(() => (c ? computeStats(c) : null), [c]);
  const canEdit = useCanControl(c);
  const prefKey = mode === 'embedded' ? 'sheet.tab' : `sheet.tab.${characterId}`;
  const [tab, setTabState] = useState<SheetTab>(() => {
    const saved = getPref<string>(prefKey, 'main');
    return (TAB_IDS.has(saved) ? saved : 'main') as SheetTab;
  });
  const setTab = (t: SheetTab) => {
    setTabState(t);
    setPref(prefKey, t);
  };

  if (!c || !stats) {
    return (
      <div className="cs cs--empty">
        <Empty icon={<ScrollText />} title="Ficha indisponível">Este personagem não existe mais ou não está visível para você.</Empty>
      </div>
    );
  }

  return (
    <div className={`cs cs--${mode}`} data-ro={canEdit ? undefined : 'true'}>
      <SheetHeader c={c} stats={stats} canEdit={canEdit} mode={mode} onTab={setTab} extra={headerActions} />
      <div className="cs-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-active={tab === t.id ? 'true' : undefined}
            className="cs-tab"
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className="cs-body" key={tab}>
        {tab === 'main' && <MainTab c={c} stats={stats} canEdit={canEdit} />}
        {tab === 'abilities' && <AbilitiesTab c={c} stats={stats} canEdit={canEdit} />}
        {tab === 'combat' && <CombatTab c={c} stats={stats} canEdit={canEdit} />}
        {tab === 'spells' && <SpellsTab c={c} stats={stats} canEdit={canEdit} />}
        {tab === 'inventory' && <InventoryTab c={c} stats={stats} canEdit={canEdit} />}
        {tab === 'traits' && <TraitsTab c={c} stats={stats} canEdit={canEdit} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

const SheetHeader = memo(function SheetHeader({ c, stats, canEdit, mode, onTab, extra }: {
  c: Character;
  stats: CharacterStats;
  canEdit: boolean;
  mode: 'embedded' | 'window';
  onTab: (t: SheetTab) => void;
  extra?: ReactNode;
}) {
  const isDM = useGame((s) => s.me?.role === 'dm');
  const secret = useSheetPrefs((s) => s.secret);
  const rollMode = useUi((s) => s.rollMode);
  const sub = [c.race, classLine(c), c.background].filter(Boolean).join(' · ');
  const hpPct = c.hp.max > 0 ? Math.max(0, Math.min(1, c.hp.cur / c.hp.max)) : 0;
  const hpTone = c.hp.cur <= 0 ? 'down' : hpPct <= 0.25 ? 'low' : hpPct <= 0.5 ? 'mid' : 'ok';
  const armor = c.inventory.find((i) => i.equipped && i.armor && i.armor.type !== 'shield');
  const shield = c.inventory.some((i) => i.equipped && i.armor?.type === 'shield');
  const acTip = c.ac.mode === 'manual'
    ? `CA manual${c.ac.bonus ? ` (${signed(c.ac.bonus)})` : ''}`
    : `CA automática: ${armor ? armor.name : 'sem armadura'}${shield ? ' + escudo' : ''}${c.ac.bonus ? ` ${signed(c.ac.bonus)}` : ''}`;

  return (
    <header className="cs-head">
      <div className="cs-head__id">
        {mode === 'embedded' && <Portrait c={c} canEdit={canEdit} />}
        <div className="u-grow">
          {mode === 'embedded' && <h2 className="cs-head__name u-ellipsis">{c.name || 'Sem nome'}</h2>}
          <div className="cs-head__sub u-ellipsis" data-tip={sub || undefined}>{sub || 'Personagem sem classe'}</div>
          <div className="cs-head__badges">
            <span className="badge badge--gold">Nível {stats.level}</span>
            {c.kind === 'npc' && <span className="badge badge--dm">PdM</span>}
            {rollMode !== 'normal' && (
              <span className={`badge ${rollMode === 'adv' ? 'badge--success' : 'badge--danger'}`}>
                {rollMode === 'adv' ? 'Vantagem' : 'Desvantagem'}
              </span>
            )}
            {c.conditions.includes('dead') && <span className="badge badge--danger">Morto</span>}
          </div>
        </div>
        <div className="cs-head__actions">
          <button
            type="button"
            className="cs-inspire"
            data-on={c.inspiration ? 'true' : undefined}
            disabled={!canEdit}
            data-tip={c.inspiration ? 'Inspiração (clique para gastar)' : 'Sem inspiração'}
            aria-pressed={c.inspiration}
            onClick={() => patchCharacter(c.id, { inspiration: !c.inspiration })}
          >
            <Star />
          </button>
          {isDM && (
            <button
              type="button"
              className="cs-secret"
              data-on={secret ? 'true' : undefined}
              data-tip={secret ? 'Rolagens secretas (só o Mestre vê)' : 'Rolagens públicas'}
              onClick={() => useSheetPrefs.getState().setSecret(!secret)}
            >
              {secret ? <EyeOff /> : <Eye />}
            </button>
          )}
          {extra}
        </div>
      </div>
      <div className="cs-vitals">
        <div className="cs-vital cs-vital--ac" data-tip={acTip}>
          <span className="cs-vital__label">CA</span>
          <span className="cs-vital__value">{stats.ac}</span>
        </div>
        <button type="button" className="cs-vital cs-vital--hp" data-tone={hpTone} onClick={() => onTab('main')} data-tip="Pontos de vida">
          <span className="cs-vital__label">PV</span>
          <span className="cs-vital__value">
            {c.hp.cur}
            <small>/{c.hp.max}</small>
            {c.hp.temp > 0 && <em>+{c.hp.temp}</em>}
          </span>
          <span className="cs-vital__bar"><i style={{ width: `${hpPct * 100}%` }} /></span>
        </button>
        <button
          type="button"
          className="cs-vital cs-vital--roll"
          disabled={!canEdit}
          onClick={(e) => rollInitiative(c, stats.initiative, e)}
          data-tip="Rolar iniciativa"
        >
          <span className="cs-vital__label">Inic.</span>
          <span className="cs-vital__value">{signed(stats.initiative)}</span>
        </button>
        <div className="cs-vital" data-tip={c.senses.darkvision ? `Visão no escuro ${c.senses.darkvision} pés` : undefined}>
          <span className="cs-vital__label">Desl.</span>
          <span className="cs-vital__value">{c.speed}<small>pés</small></span>
        </div>
        <div className="cs-vital" data-tip="Bônus de proficiência">
          <span className="cs-vital__label">Prof.</span>
          <span className="cs-vital__value">+{stats.prof}</span>
        </div>
      </div>
    </header>
  );
});
