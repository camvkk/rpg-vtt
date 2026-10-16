// Compêndio: instant accent-insensitive search over monsters, spells, items, conditions and quick rules,
// with per-category filters, a virtualised result list and an in-panel detail stack (or a modal).
import './compendium.css';
import {
  useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent,
} from 'react';
import {
  ArrowLeft, BookOpen, Gem, GripVertical, HeartCrack, Layers, MapPin, Maximize2, ScrollText, Search, Shield,
  Skull, SlidersHorizontal, Sparkles, Users, X, type LucideIcon,
} from 'lucide-react';
import type { ItemCategory, SpellSchool } from '@shared/data5e/types.ts';
import { SPELLS } from '@shared/data5e/spells/index.ts';
import { ITEMS, ITEM_CATEGORY_NAMES, RARITY_COLORS } from '@shared/data5e/items.ts';
import { CONDITIONS } from '@shared/data5e/conditions.ts';
import { CLASSES } from '@shared/data5e/classes.ts';
import { formatCr } from '@shared/data5e/tables.ts';
import { setDragPayload } from '../../engine/api.ts';
import { useIsDM } from '../../store/hooks.ts';
import { Empty, IconButton, Modal } from '../../ui/index.tsx';
import { ConditionCard, ConditionIcon } from './ConditionCard.tsx';
import { ItemCard } from './ItemCard.tsx';
import { BackgroundCard, ClassCard, RaceCard } from './LoreCard.tsx';
import { MonsterStatblock, placeMonsterOnMap } from './MonsterStatblock.tsx';
import { RULE_SECTIONS, RuleSectionCard, RulesReference, ruleMatches } from './RulesReference.tsx';
import { SpellCard } from './SpellCard.tsx';
import { CR_STEPS, matchRange, monsterTypeBase, norm, SCHOOL_COLOR, SCHOOL_NAME } from './format.ts';
import { ITEM_ICON } from './parts.tsx';
import { entryKey, getEntry, getIndex, KIND_LABEL, MONSTERS, rankEntries, type Entry, type EntryRef } from './search.ts';

type Cat = 'all' | 'monster' | 'spell' | 'item' | 'condition' | 'rules';

const CATS: { value: Cat; label: string; icon: LucideIcon }[] = [
  { value: 'all', label: 'Tudo', icon: Layers },
  { value: 'monster', label: 'Monstros', icon: Skull },
  { value: 'spell', label: 'Magias', icon: Sparkles },
  { value: 'item', label: 'Itens', icon: Gem },
  { value: 'condition', label: 'Condições', icon: HeartCrack },
  { value: 'rules', label: 'Regras', icon: BookOpen },
];

const COUNT_WORD: Record<Cat, [string, string]> = {
  all: ['resultado', 'resultados'],
  monster: ['monstro', 'monstros'],
  spell: ['magia', 'magias'],
  item: ['item', 'itens'],
  condition: ['condição', 'condições'],
  rules: ['tópico', 'tópicos'],
};

const ITEM_CAT_PLURAL: Record<ItemCategory, string> = {
  weapon: 'Armas', armor: 'Armaduras', shield: 'Escudos', gear: 'Equipamento', tool: 'Ferramentas', pack: 'Pacotes',
  potion: 'Poções', ammunition: 'Munição', focus: 'Focos', magic: 'Mágicos', mount: 'Montarias', treasure: 'Tesouros',
};

const KIND_ICON: Partial<Record<Entry['kind'], LucideIcon>> = { race: Users, class: Shield, background: ScrollText };

const ROW_H = 52;
const OVERSCAN = 8;
const RECENT_KEY = 'vtt.compendium.recent';
const MAX_CR_INDEX = CR_STEPS.length - 1;

// ---------------------------------------------------------------------------
// Recents (per-browser convenience)
// ---------------------------------------------------------------------------

function loadRecents(): EntryRef[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is EntryRef => !!x && typeof x === 'object' && typeof (x as EntryRef).kind === 'string' && typeof (x as EntryRef).id === 'string')
      .filter((x) => !!getEntry(x.kind, x.id))
      .slice(0, 8);
  } catch {
    return [];
  }
}

function saveRecents(list: EntryRef[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

// ---------------------------------------------------------------------------
// Static filter options (computed once per load)
// ---------------------------------------------------------------------------

interface FilterOpts { types: string[]; tags: string[]; itemCats: ItemCategory[]; classes: { id: string; name: string }[] }
let filterOpts: FilterOpts | null = null;

function getFilterOpts(): FilterOpts {
  if (!filterOpts) {
    const byPt = (a: string, b: string) => a.localeCompare(b, 'pt-BR');
    filterOpts = {
      types: [...new Set(MONSTERS.map((m) => monsterTypeBase(m.type)))].sort(byPt),
      tags: [...new Set(MONSTERS.flatMap((m) => m.tags))].sort(byPt),
      itemCats: (Object.keys(ITEM_CATEGORY_NAMES) as ItemCategory[]).filter((c) => ITEMS.some((i) => i.category === c)),
      classes: CLASSES.filter((c) => c.spellcasting || SPELLS.some((s) => s.classes.includes(c.id))).map((c) => ({ id: c.id, name: c.name })),
    };
  }
  return filterOpts;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function CompendiumPanel() {
  const isDM = useIsDM();
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query);
  const q = norm(deferred);
  const [cat, setCat] = useState<Cat>('all');
  const [showFilters, setShowFilters] = useState(true);

  // Monster filters
  const [crMin, setCrMin] = useState(0);
  const [crMax, setCrMax] = useState(MAX_CR_INDEX);
  const [mType, setMType] = useState('');
  const [mTag, setMTag] = useState('');
  const [mSort, setMSort] = useState<'name' | 'cr'>('name');
  // Spell filters
  const [sLevel, setSLevel] = useState<number | null>(null);
  const [sClass, setSClass] = useState('');
  const [sSchool, setSSchool] = useState<SpellSchool | ''>('');
  // Item filters
  const [iCat, setICat] = useState<ItemCategory | ''>('');

  const [stack, setStack] = useState<EntryRef[]>([]);
  const [modal, setModal] = useState<EntryRef | null>(null);
  const [recents, setRecents] = useState<EntryRef[]>(loadRecents);
  const [active, setActive] = useState(0);

  const opts = getFilterOpts();

  const results: Entry[] = useMemo(() => {
    const idx = getIndex();
    const entries = (kind: Entry['kind'], ids: string[]) =>
      ids.map((id) => idx.byKey.get(entryKey(kind, id))).filter((e): e is Entry => !!e);
    switch (cat) {
      case 'all':
        return q ? rankEntries(idx.all, q) : [];
      case 'monster': {
        const lo = CR_STEPS[Math.min(crMin, crMax)]!;
        const hi = CR_STEPS[Math.max(crMin, crMax)]!;
        let list = MONSTERS.filter((m) => m.cr >= lo && m.cr <= hi
          && (!mType || monsterTypeBase(m.type) === mType)
          && (!mTag || m.tags.includes(mTag)));
        list = [...list].sort(mSort === 'cr'
          ? (a, b) => a.cr - b.cr || a.name.localeCompare(b.name, 'pt-BR')
          : (a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        return rankEntries(entries('monster', list.map((m) => m.id)), q);
      }
      case 'spell': {
        const list = SPELLS.filter((s) => (sLevel === null || s.level === sLevel)
          && (!sClass || s.classes.includes(sClass))
          && (!sSchool || s.school === sSchool));
        return rankEntries(entries('spell', list.map((s) => s.id)), q);
      }
      case 'item': {
        const list = ITEMS.filter((i) => !iCat || i.category === iCat);
        return rankEntries(entries('item', list.map((i) => i.id)), q);
      }
      case 'condition':
        return rankEntries(entries('condition', CONDITIONS.map((c) => c.id)), q);
      case 'rules':
        return [];
    }
  }, [cat, q, crMin, crMax, mType, mTag, mSort, sLevel, sClass, sSchool, iCat]);

  const filterCount = cat === 'monster'
    ? Number(crMin !== 0 || crMax !== MAX_CR_INDEX) + Number(!!mType) + Number(!!mTag)
    : cat === 'spell'
      ? Number(sLevel !== null) + Number(!!sClass) + Number(!!sSchool)
      : cat === 'item' ? Number(!!iCat) : 0;

  const clearFilters = () => {
    setCrMin(0); setCrMax(MAX_CR_INDEX); setMType(''); setMTag('');
    setSLevel(null); setSClass(''); setSSchool('');
    setICat('');
  };

  // ---- navigation -------------------------------------------------------
  const remember = useCallback((ref: EntryRef) => {
    setRecents((cur) => {
      const next = [ref, ...cur.filter((r) => !(r.kind === ref.kind && r.id === ref.id))].slice(0, 8);
      saveRecents(next);
      return next;
    });
  }, []);

  const openFresh = useCallback((ref: EntryRef) => {
    setStack([ref]);
    remember(ref);
  }, [remember]);

  const push = useCallback((ref: EntryRef) => {
    setStack((s) => [...s, ref]);
    remember(ref);
  }, [remember]);

  const back = () => setStack((s) => s.slice(0, -1));

  // ---- virtual list ------------------------------------------------------
  const bodyRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  const raf = useRef(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setView({ top: el.scrollTop, height: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = 0;
    setView((v) => ({ ...v, top: 0 }));
    setActive(0);
  }, [results, cat]);

  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = bodyRef.current;
      if (el) setView({ top: el.scrollTop, height: el.clientHeight });
    });
  };
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const ensureVisible = (i: number) => {
    const el = bodyRef.current;
    if (!el) return;
    const top = i * ROW_H;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ROW_H > el.scrollTop + el.clientHeight) el.scrollTop = top + ROW_H - el.clientHeight;
  };

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      const next = Math.max(0, Math.min(results.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(next);
      ensureVisible(next);
    } else if (e.key === 'Enter') {
      const hit = results[active];
      if (hit) openFresh(hit);
    } else if (e.key === 'Escape') {
      if (query) {
        e.stopPropagation();
        setQuery('');
      } else {
        e.currentTarget.blur();
      }
    }
  };

  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && stack.length && !modal) {
      e.stopPropagation();
      back();
    }
  };

  const start = Math.max(0, Math.floor(view.top / ROW_H) - OVERSCAN);
  const end = Math.min(results.length, Math.ceil((view.top + view.height) / ROW_H) + OVERSCAN);
  const top = stack[stack.length - 1];
  const mode: 'landing' | 'rules' | 'list' = cat === 'rules' ? 'rules' : cat === 'all' && !q ? 'landing' : 'list';
  const rulesCount = cat === 'rules' ? RULE_SECTIONS.filter((s) => ruleMatches(s, q)).length : 0;
  const countWord = COUNT_WORD[cat];
  const shownCount = mode === 'rules' ? rulesCount : results.length;
  const hasFilters = cat === 'monster' || cat === 'spell' || cat === 'item';

  return (
    <div className="cmp" onKeyDown={onRootKey}>
      <div className="cmp-head" inert={!!top}>
        <div className="cmp-search">
          <Search className="cmp-search__icon" aria-hidden />
          <input
            ref={searchRef}
            className="input cmp-search__input"
            placeholder={cat === 'all' ? 'Buscar monstros, magias, itens, regras…' : `Buscar ${CATS.find((c) => c.value === cat)!.label.toLowerCase()}…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKey}
            spellCheck={false}
            aria-label="Buscar no compêndio"
            role="combobox"
            aria-expanded={mode === 'list'}
            aria-controls="cmp-results"
          />
          {query && (
            <button type="button" className="cmp-search__clear" aria-label="Limpar busca" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
              <X />
            </button>
          )}
          {hasFilters && (
            <IconButton
              icon={<SlidersHorizontal />}
              label={showFilters ? 'Ocultar filtros' : 'Mostrar filtros'}
              size="sm"
              active={showFilters || filterCount > 0}
              onClick={() => setShowFilters((v) => !v)}
              className="cmp-search__filter"
            />
          )}
        </div>

        <div className="cmp-cats" role="tablist" aria-label="Categorias">
          {CATS.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.value}
                type="button"
                role="tab"
                aria-selected={cat === c.value}
                data-active={cat === c.value ? 'true' : undefined}
                className="cmp-cat"
                onClick={() => setCat(c.value)}
              >
                <Icon />
                <span>{c.label}</span>
              </button>
            );
          })}
        </div>

        {hasFilters && showFilters && (
          <div className="cmp-filters">
            {cat === 'monster' && (
              <>
                <div className="cmp-frow">
                  <span className="cmp-flabel">ND</span>
                  <select className="select cmp-select" value={crMin} onChange={(e) => setCrMin(Number(e.target.value))} aria-label="ND mínimo">
                    {CR_STEPS.map((cr, i) => <option key={cr} value={i}>{formatCr(cr)}</option>)}
                  </select>
                  <span className="u-dim">–</span>
                  <select className="select cmp-select" value={crMax} onChange={(e) => setCrMax(Number(e.target.value))} aria-label="ND máximo">
                    {CR_STEPS.map((cr, i) => <option key={cr} value={i}>{formatCr(cr)}</option>)}
                  </select>
                  <span className="u-grow" />
                  <div className="segmented cmp-seg" role="radiogroup" aria-label="Ordenar">
                    <button type="button" data-active={mSort === 'name' ? 'true' : undefined} onClick={() => setMSort('name')}>A–Z</button>
                    <button type="button" data-active={mSort === 'cr' ? 'true' : undefined} onClick={() => setMSort('cr')}>ND</button>
                  </div>
                </div>
                <div className="cmp-frow">
                  <select className="select cmp-select u-grow" value={mType} onChange={(e) => setMType(e.target.value)} aria-label="Tipo">
                    <option value="">Todos os tipos</option>
                    {opts.types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="select cmp-select u-grow" value={mTag} onChange={(e) => setMTag(e.target.value)} aria-label="Tag">
                    <option value="">Todas as tags</option>
                    {opts.tags.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </>
            )}
            {cat === 'spell' && (
              <>
                <div className="cmp-levels" role="radiogroup" aria-label="Nível">
                  <button type="button" className="cmp-lvl" data-active={sLevel === null ? 'true' : undefined} onClick={() => setSLevel(null)}>Todos</button>
                  {Array.from({ length: 10 }, (_, l) => (
                    <button
                      key={l}
                      type="button"
                      className="cmp-lvl"
                      data-active={sLevel === l ? 'true' : undefined}
                      data-tip={l === 0 ? 'Truques' : `${l}º nível`}
                      onClick={() => setSLevel(sLevel === l ? null : l)}
                    >
                      {l === 0 ? 'T' : l}
                    </button>
                  ))}
                </div>
                <div className="cmp-frow">
                  <select className="select cmp-select u-grow" value={sClass} onChange={(e) => setSClass(e.target.value)} aria-label="Classe">
                    <option value="">Todas as classes</option>
                    {opts.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <select className="select cmp-select u-grow" value={sSchool} onChange={(e) => setSSchool(e.target.value as SpellSchool | '')} aria-label="Escola">
                    <option value="">Todas as escolas</option>
                    {(Object.keys(SCHOOL_NAME) as SpellSchool[]).map((s) => <option key={s} value={s}>{SCHOOL_NAME[s]}</option>)}
                  </select>
                </div>
              </>
            )}
            {cat === 'item' && (
              <div className="cmp-chips">
                <button type="button" className="chip" data-active={!iCat ? 'true' : undefined} onClick={() => setICat('')}>Todos</button>
                {opts.itemCats.map((c) => (
                  <button key={c} type="button" className="chip" data-active={iCat === c ? 'true' : undefined} onClick={() => setICat(iCat === c ? '' : c)}>
                    {ITEM_CAT_PLURAL[c]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {mode !== 'landing' && (
          <div className="cmp-meta">
            <span>{shownCount} {shownCount === 1 ? countWord[0] : countWord[1]}</span>
            {filterCount > 0 && <button type="button" className="cmp-linkbtn" onClick={clearFilters}>Limpar filtros</button>}
            {isDM && (cat === 'monster' || cat === 'all') && mode === 'list' && (
              <span className="cmp-meta__hint"><GripVertical /> arraste para o mapa</span>
            )}
          </div>
        )}
      </div>

      <div className="cmp-body" ref={bodyRef} onScroll={onScroll} inert={!!top}>
        {mode === 'landing' && (
          <Landing recents={recents} onCat={setCat} onOpen={openFresh} isDM={isDM} />
        )}
        {mode === 'rules' && <RulesReference query={q} onOpenCondition={(id) => openFresh({ kind: 'condition', id })} />}
        {mode === 'list' && (results.length > 0 ? (
          <div id="cmp-results" role="listbox" aria-label="Resultados" className="cmp-vlist" style={{ height: results.length * ROW_H }}>
            {results.slice(start, end).map((e, k) => {
              const i = start + k;
              return (
                <Row
                  key={entryKey(e.kind, e.id)}
                  entry={e}
                  q={q}
                  active={i === active}
                  showKind={cat === 'all'}
                  isDM={isDM}
                  onOpen={openFresh}
                  style={{ transform: `translateY(${i * ROW_H}px)` }}
                />
              );
            })}
          </div>
        ) : (
          <Empty icon={<Search />} title="Nada encontrado">
            {filterCount > 0 ? 'Tente afrouxar os filtros.' : 'Tente outro nome, em português ou inglês.'}
          </Empty>
        ))}
      </div>

      {top && (
        <div className="cmp-detail" key={`${stack.length}:${top.kind}:${top.id}`}>
          <div className="cmp-detail__bar">
            <IconButton icon={<ArrowLeft />} label={stack.length > 1 ? 'Voltar' : 'Voltar à lista'} size="sm" onClick={back} />
            <span className="cmp-detail__crumb">
              {stack.length > 1 && <span className="u-dim">{getEntry(stack[stack.length - 2]!.kind, stack[stack.length - 2]!.id)?.name} › </span>}
              {KIND_LABEL[top.kind]}
            </span>
            <span className="u-grow" />
            <IconButton icon={<Maximize2 />} label="Abrir em janela" size="sm" className="cmp-wide-only" onClick={() => setModal(top)} />
            <IconButton icon={<X />} label="Fechar" size="sm" onClick={() => setStack([])} />
          </div>
          <div className="cmp-detail__body">
            <Detail refx={top} onOpen={push} />
          </div>
        </div>
      )}

      {modal && (
        <Modal title={getEntry(modal.kind, modal.id)?.name ?? 'Compêndio'} size="wide" onClose={() => setModal(null)}>
          <div className="cmp-modal">
            <Detail refx={modal} onOpen={(r) => { remember(r); setModal(r); }} />
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail switch
// ---------------------------------------------------------------------------

function Detail({ refx, onOpen }: { refx: EntryRef; onOpen: (ref: EntryRef) => void }) {
  const idx = getIndex();
  const openCondition = (id: string) => onOpen({ kind: 'condition', id });
  switch (refx.kind) {
    case 'monster': {
      const m = idx.monsters.get(refx.id);
      if (m) return <MonsterStatblock monster={m} />;
      break;
    }
    case 'spell': {
      const s = idx.spells.get(refx.id);
      if (s) return <SpellCard spell={s} />;
      break;
    }
    case 'item': {
      const it = idx.items.get(refx.id);
      if (it) return <ItemCard item={it} />;
      break;
    }
    case 'condition': {
      const c = idx.conditions.get(refx.id);
      if (c) return <ConditionCard condition={c} />;
      break;
    }
    case 'rule': {
      const r = idx.rules.get(refx.id);
      if (r) return <RuleSectionCard section={r} onOpenCondition={openCondition} />;
      break;
    }
    case 'race': {
      const r = idx.races.get(refx.id);
      if (r) return <RaceCard race={r} />;
      break;
    }
    case 'class': {
      const c = idx.classes.get(refx.id);
      if (c) return <ClassCard cls={c} />;
      break;
    }
    case 'background': {
      const b = idx.backgrounds.get(refx.id);
      if (b) return <BackgroundCard bg={b} />;
      break;
    }
  }
  return <Empty title="Verbete não encontrado" />;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function Highlight({ text, q }: { text: string; q: string }) {
  const r = q ? matchRange(text, q) : null;
  if (!r) return <>{text}</>;
  return (
    <>
      {text.slice(0, r[0])}
      <mark className="cmp-mark">{text.slice(r[0], r[1])}</mark>
      {text.slice(r[1])}
    </>
  );
}

function crTier(cr: number): number {
  if (cr < 1) return 0;
  if (cr < 5) return 1;
  if (cr < 11) return 2;
  if (cr < 17) return 3;
  return 4;
}

function RowIcon({ entry }: { entry: Entry }) {
  const idx = getIndex();
  switch (entry.kind) {
    case 'monster': {
      const m = idx.monsters.get(entry.id);
      const cr = m ? formatCr(m.cr) : '?';
      return (
        <span className="cmp-medal" data-tier={m ? crTier(m.cr) : 0} data-long={cr.length > 2 ? 'true' : undefined} aria-label={`ND ${cr}`}>
          {cr}
        </span>
      );
    }
    case 'spell': {
      const s = idx.spells.get(entry.id);
      return (
        <span className="cmp-medal cmp-medal--spell" style={{ ['--school-c' as string]: s ? SCHOOL_COLOR[s.school] : undefined } as CSSProperties}>
          {s ? (s.level === 0 ? 'T' : s.level) : '?'}
        </span>
      );
    }
    case 'item': {
      const it = idx.items.get(entry.id);
      const Icon = it ? ITEM_ICON[it.category] ?? Gem : Gem;
      const color = it?.rarity ? RARITY_COLORS[it.rarity] : undefined;
      return (
        <span className="cmp-ico" style={color ? ({ ['--ico-c' as string]: color } as CSSProperties) : undefined}>
          <Icon />
        </span>
      );
    }
    case 'condition': {
      const c = idx.conditions.get(entry.id);
      return c ? <ConditionIcon condition={c} /> : <span className="cmp-ico" />;
    }
    case 'rule': {
      const r = idx.rules.get(entry.id);
      const Icon = r?.icon ?? BookOpen;
      return <span className="cmp-ico cmp-ico--rule"><Icon /></span>;
    }
    default: {
      const Icon = KIND_ICON[entry.kind] ?? BookOpen;
      return <span className="cmp-ico cmp-ico--lore"><Icon /></span>;
    }
  }
}

function Row({ entry, q, active, showKind, isDM, onOpen, style }: {
  entry: Entry;
  q: string;
  active?: boolean;
  showKind?: boolean;
  isDM: boolean;
  onOpen: (ref: EntryRef) => void;
  style?: CSSProperties;
}) {
  const idx = getIndex();
  const monster = entry.kind === 'monster' ? idx.monsters.get(entry.id) : undefined;
  const spell = entry.kind === 'spell' ? idx.spells.get(entry.id) : undefined;
  const draggable = isDM && !!monster;
  return (
    <div
      role="option"
      aria-selected={!!active}
      className="cmp-row"
      data-active={active ? 'true' : undefined}
      style={style}
      onClick={() => onOpen({ kind: entry.kind, id: entry.id })}
      draggable={draggable}
      onDragStart={draggable ? (e) => setDragPayload(e, { kind: 'monster', id: entry.id }) : undefined}
    >
      <RowIcon entry={entry} />
      <div className="cmp-row__text">
        <div className="cmp-row__name"><Highlight text={entry.name} q={q} /></div>
        <div className="cmp-row__sub">{entry.sub}</div>
      </div>
      {spell && (spell.concentration || spell.ritual) && (
        <span className="cmp-row__marks">
          {spell.concentration && <span className="cmp-mini" data-tip="Concentração">C</span>}
          {spell.ritual && <span className="cmp-mini cmp-mini--dm" data-tip="Ritual">R</span>}
        </span>
      )}
      {showKind && <span className="cmp-row__kind">{KIND_LABEL[entry.kind]}</span>}
      {draggable && monster && (
        <button
          type="button"
          className="cmp-row__quick"
          data-tip="Colocar 1 no mapa"
          aria-label={`Colocar ${monster.name} no mapa`}
          onClick={(e) => {
            e.stopPropagation();
            void placeMonsterOnMap(monster);
          }}
        >
          <MapPin />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Landing (Tudo, no query)
// ---------------------------------------------------------------------------

function Landing({ recents, onCat, onOpen, isDM }: {
  recents: EntryRef[];
  onCat: (c: Cat) => void;
  onOpen: (ref: EntryRef) => void;
  isDM: boolean;
}) {
  const cards: { cat: Cat; label: string; count: number; icon: LucideIcon; hint: string }[] = [
    { cat: 'monster', label: 'Monstros', count: MONSTERS.length, icon: Skull, hint: 'Fichas, ataques e ND' },
    { cat: 'spell', label: 'Magias', count: SPELLS.length, icon: Sparkles, hint: 'Truques ao 9º nível' },
    { cat: 'item', label: 'Itens', count: ITEMS.length, icon: Gem, hint: 'Armas, armaduras e tesouros' },
    { cat: 'condition', label: 'Condições', count: CONDITIONS.length, icon: HeartCrack, hint: 'Efeitos e marcadores' },
    { cat: 'rules', label: 'Regras', count: RULE_SECTIONS.length, icon: BookOpen, hint: 'Referência rápida' },
  ];
  const recentEntries = recents.map((r) => getEntry(r.kind, r.id)).filter((e): e is Entry => !!e);
  return (
    <div className="cmp-landing">
      <div className="cmp-hero">
        <div className="cmp-hero__title">Compêndio</div>
        <div className="cmp-hero__sub">Regras e criaturas do SRD 5.1, em português</div>
      </div>

      <div className="cmp-catgrid">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <button key={c.cat} type="button" className="cmp-catcard" onClick={() => onCat(c.cat)}>
              <Icon className="cmp-catcard__icon" />
              <span className="cmp-catcard__label">{c.label}</span>
              <span className="cmp-catcard__count">{c.count}</span>
              <span className="cmp-catcard__hint">{c.hint}</span>
            </button>
          );
        })}
      </div>

      {recentEntries.length > 0 && (
        <section className="cmp-section">
          <div className="section-title">Vistos recentemente</div>
          <div className="cmp-staticlist">
            {recentEntries.map((e) => (
              <Row key={entryKey(e.kind, e.id)} entry={e} q="" isDM={isDM} onOpen={onOpen} showKind />
            ))}
          </div>
        </section>
      )}

      <section className="cmp-section">
        <div className="section-title">Condições</div>
        <div className="cmp-chips cmp-chips--wrap">
          {CONDITIONS.filter((c) => c.official).map((c) => (
            <button key={c.id} type="button" className="chip cmp-cond-chip" onClick={() => onOpen({ kind: 'condition', id: c.id })}>
              <ConditionIcon condition={c} size="sm" />
              {c.name}
            </button>
          ))}
        </div>
      </section>

      <p className="cmp-tip">
        {isDM
          ? 'Dica: arraste um monstro da lista direto para o mapa, ou use o botão de alfinete para colocá-lo no centro da tela.'
          : 'Dica: clique nos dados (como 2d6) em qualquer texto para rolá-los no chat.'}
      </p>
    </div>
  );
}
