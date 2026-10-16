// "Itens" tab: currency, carrying capacity, inventory (equip / attune / armor for auto AC), SRD item picker.
import { memo, useMemo, useState } from 'react';
import {
  Check, ChevronDown, Gem, Minus, Package, PackagePlus, Plus, Search, Shield, ShieldHalf, Swords, Trash2, Weight, X,
} from 'lucide-react';
import type { Character, Currency, ID, InventoryItem } from '@shared/types.ts';
import type { ItemCategory, ItemData } from '@shared/data5e/types.ts';
import { encumbrance } from '@shared/data5e/tables.ts';
import { Button, confirmDialog, IconButton, Spinner, toast } from '../../ui/index.tsx';
import {
  DraftInput, DraftTextarea, norm, NumInput, patchCharacter, Section, uid, useItemsModule, type TabProps,
} from './common.tsx';
import { inventoryFromItem, weaponAttack, weaponProficient } from './build.ts';
import { weaponProfText } from './SheetCombat.tsx';

const COINS: { key: keyof Currency; label: string; name: string; gp: number }[] = [
  { key: 'pp', label: 'PL', name: 'Platina', gp: 10 },
  { key: 'gp', label: 'PO', name: 'Ouro', gp: 1 },
  { key: 'ep', label: 'PE', name: 'Electro', gp: 0.5 },
  { key: 'sp', label: 'PP', name: 'Prata', gp: 0.1 },
  { key: 'cp', label: 'PC', name: 'Cobre', gp: 0.01 },
];

const ENC_LABEL = {
  none: 'Carga leve',
  encumbered: 'Dentro da capacidade · regra variante: sobrecarregado (−10 pés)',
  heavy: 'Dentro da capacidade · regra variante: muito sobrecarregado (−20 pés, desvantagem)',
  over: 'Acima da capacidade de carga!',
} as const;

function armorLabel(a: NonNullable<InventoryItem['armor']>): string {
  if (a.type === 'shield') return `+${a.base || 2} CA`;
  if (a.type === 'heavy') return `CA ${a.base}`;
  if (a.dexCap === null) return `CA ${a.base} + DES`;
  return `CA ${a.base} + DES (máx ${a.dexCap})`;
}

export function InventoryTab({ c, stats, canEdit }: TabProps) {
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<ID | null>(null);
  const [offer, setOffer] = useState<ItemData | null>(null);
  const items = useItemsModule(c.inventory.some((i) => i.ref) || adding);
  const attuned = c.inventory.filter((i) => i.attuned).length;
  const enc = encumbrance(c.abilities.str, stats.carried);
  const cap = Math.max(1, stats.carryCapacity);
  const pct = Math.min(1, stats.carried / cap);

  const createAttack = (item: ItemData) => {
    const atk = weaponAttack(item, weaponProficient(item, weaponProfText(c)));
    void patchCharacter(c.id, (cur) => ({ attacks: [...cur.attacks, atk] }));
    toast(`Ataque "${item.name}" criado na aba Combate.`, 'success', 2600);
    setOffer(null);
  };

  return (
    <div className="cs-stack">
      <div className="cs-coins">
        {COINS.map((coin) => (
          <label key={coin.key} className={`cs-coin cs-coin--${coin.key}`} data-tip={coin.name}>
            <span className="cs-coin__label">{coin.label}</span>
            <NumInput
              className="cs-coin__input"
              value={c.currency[coin.key]}
              min={0}
              max={1e9}
              relative
              readOnly={!canEdit}
              aria-label={coin.name}
              onCommit={(v) => void patchCharacter(c.id, (cur) => ({ currency: { ...cur.currency, [coin.key]: v } }))}
            />
          </label>
        ))}
      </div>
      <div className="cs-carry" data-enc={enc}>
        <div className="cs-carry__top">
          <span className="cs-label"><Weight /> Carga</span>
          <span className="u-tabular u-sm">{stats.carried.toLocaleString('pt-BR')} / {cap} lb</span>
        </div>
        <div className="cs-carry__bar">
          <i style={{ width: `${pct * 100}%` }} />
          <b style={{ left: `${(1 / 3) * 100}%` }} />
          <b style={{ left: `${(2 / 3) * 100}%` }} />
        </div>
        <div className="u-xs u-muted">{ENC_LABEL[enc]}</div>
      </div>

      <Section
        title="Equipamento"
        icon={<Package />}
        right={<span className="badge" data-tip="Itens em sintonia (máximo 3)" data-over={attuned > 3 ? 'true' : undefined}><Gem /> {attuned}/3</span>}
      >
        {offer && (
          <div className="cs-offer">
            <Swords />
            <span className="u-grow"><strong>{offer.name}</strong> adicionada. Criar o ataque correspondente?</span>
            <button type="button" className="btn btn--primary btn--sm" onClick={() => createAttack(offer)}>Criar</button>
            <IconButton size="sm" icon={<X />} label="Agora não" onClick={() => setOffer(null)} />
          </div>
        )}
        {c.inventory.length === 0 && <div className="cs-empty-line">Mochila vazia.</div>}
        <div className="cs-items">
          {c.inventory.map((it) => (
            <ItemRow
              key={it.id}
              cid={c.id}
              it={it}
              data={it.ref && items ? items.ITEMS_BY_ID[it.ref] ?? null : null}
              canEdit={canEdit}
              open={expanded === it.id}
              onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
              onCreateAttack={createAttack}
            />
          ))}
        </div>
        {canEdit && (adding ? (
          <ItemPicker
            c={c}
            onClose={() => setAdding(false)}
            onAdded={(item, invId) => {
              if (item?.weapon) setOffer(item);
              if (!item && invId) setExpanded(invId);
            }}
          />
        ) : (
          <Button block icon={<PackagePlus />} onClick={() => setAdding(true)}>Adicionar item</Button>
        ))}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item row
// ---------------------------------------------------------------------------

const ItemRow = memo(function ItemRow({ cid, it, data, canEdit, open, onToggle, onCreateAttack }: {
  cid: ID;
  it: InventoryItem;
  data: ItemData | null;
  canEdit: boolean;
  open: boolean;
  onToggle: () => void;
  onCreateAttack: (item: ItemData) => void;
}) {
  const upd = (fn: (x: InventoryItem) => Partial<InventoryItem>) => patchCharacter(cid, (cur) => ({
    inventory: cur.inventory.map((x) => (x.id === it.id ? { ...x, ...fn(x) } : x)),
  }));
  const toggleEquip = () => patchCharacter(cid, (cur) => {
    const target = cur.inventory.find((x) => x.id === it.id);
    if (!target) return null;
    const equip = !target.equipped;
    const isShield = target.armor?.type === 'shield';
    const isBody = !!target.armor && !isShield;
    return {
      inventory: cur.inventory.map((x) => {
        if (x.id === it.id) return { ...x, equipped: equip };
        // Only one body armor and one shield at a time.
        if (equip && isBody && x.equipped && x.armor && x.armor.type !== 'shield') return { ...x, equipped: false };
        if (equip && isShield && x.equipped && x.armor?.type === 'shield') return { ...x, equipped: false };
        return x;
      }),
    };
  });
  const remove = async () => {
    if (await confirmDialog('Remover item', `Remover "${it.name}" do inventário?`, { danger: true, ok: 'Remover' })) {
      void patchCharacter(cid, (cur) => ({ inventory: cur.inventory.filter((x) => x.id !== it.id) }));
    }
  };
  const weapon = data?.weapon;
  const canAttune = data?.attunement || it.attuned;
  const sub: string[] = [];
  if (it.armor) sub.push(armorLabel(it.armor));
  if (weapon) sub.push(`${weapon.damage.formula} ${weapon.properties.includes('acuidade') ? '· acuidade' : ''}`.trim());
  if (data?.rarity) sub.push(data.rarity);
  const equipIcon = it.armor ? (it.armor.type === 'shield' ? <ShieldHalf /> : <Shield />) : weapon ? <Swords /> : <Check />;

  return (
    <div className="cs-item" data-open={open ? 'true' : undefined} data-equipped={it.equipped ? 'true' : undefined}>
      <div className="cs-item__line">
        <button
          type="button"
          className="cs-equip"
          data-on={it.equipped ? 'true' : undefined}
          disabled={!canEdit}
          aria-pressed={it.equipped}
          data-tip={it.equipped ? 'Equipado' : 'Equipar'}
          onClick={() => void toggleEquip()}
        >
          {equipIcon}
        </button>
        <button type="button" className="cs-item__name" onClick={onToggle} aria-expanded={open}>
          <span className="u-ellipsis">{it.name}</span>
          {it.qty !== 1 && <span className="cs-item__qty">×{it.qty}</span>}
          {sub.length > 0 && <span className="cs-item__sub u-ellipsis">{sub.join(' · ')}</span>}
        </button>
        {canAttune && (
          <button
            type="button"
            className="cs-attune"
            data-on={it.attuned ? 'true' : undefined}
            disabled={!canEdit}
            data-tip={it.attuned ? 'Em sintonia' : 'Sintonizar'}
            onClick={() => void upd((x) => ({ attuned: !x.attuned }))}
          >
            <Gem />
          </button>
        )}
        <span className="cs-item__w u-tabular">{it.weight ? `${+(it.weight * it.qty).toFixed(2)} lb` : '—'}</span>
        <ChevronDown className="cs-item__chev" onClick={onToggle} />
      </div>
      {open && (
        <div className="cs-item__details">
          {data?.description && <p className="cs-item__desc">{data.description}</p>}
          {canEdit ? (
            <>
              <div className="cs-fields">
                <label className="cs-mini-field cs-mini-field--grow">
                  <span>Nome</span>
                  <DraftInput className="input input--sm" value={it.name} maxLength={120} onCommit={(v) => void upd(() => ({ name: v || it.name }))} />
                </label>
                <div className="cs-mini-field">
                  <span>Quantidade</span>
                  <div className="cs-stepper">
                    <button type="button" className="icon-btn icon-btn--sm" disabled={it.qty <= 0} onClick={() => void upd((x) => ({ qty: Math.max(0, x.qty - 1) }))} aria-label="Menos"><Minus /></button>
                    <NumInput className="input input--num input--sm cs-stepper__input" value={it.qty} min={0} max={1_000_000} onCommit={(v) => void upd(() => ({ qty: v }))} />
                    <button type="button" className="icon-btn icon-btn--sm" onClick={() => void upd((x) => ({ qty: x.qty + 1 }))} aria-label="Mais"><Plus /></button>
                  </div>
                </div>
              </div>
              <div className="cs-fields">
                <label className="cs-mini-field">
                  <span>Peso (lb, unid.)</span>
                  <DraftInput
                    className="input input--num input--sm"
                    inputMode="decimal"
                    value={String(it.weight)}
                    onCommit={(v) => {
                      const n = Number(v.replace(',', '.'));
                      if (Number.isFinite(n) && n >= 0) void upd(() => ({ weight: Math.min(100_000, n) }));
                    }}
                  />
                </label>
                <label className="cs-mini-field cs-mini-field--grow">
                  <span>Armadura</span>
                  <select
                    className="select input--sm"
                    value={it.armor?.type ?? ''}
                    onChange={(e) => {
                      const t = e.target.value as '' | 'light' | 'medium' | 'heavy' | 'shield';
                      void upd((x) => ({
                        armor: t
                          ? { type: t, base: x.armor?.base ?? (t === 'shield' ? 2 : 11), dexCap: t === 'light' || t === 'shield' ? null : t === 'medium' ? 2 : 0 }
                          : null,
                      }));
                    }}
                  >
                    <option value="">Não é armadura</option>
                    <option value="light">Leve</option>
                    <option value="medium">Média</option>
                    <option value="heavy">Pesada</option>
                    <option value="shield">Escudo</option>
                  </select>
                </label>
                {it.armor && (
                  <label className="cs-mini-field">
                    <span>{it.armor.type === 'shield' ? 'Bônus' : 'CA base'}</span>
                    <NumInput className="input input--num input--sm" value={it.armor.base} min={0} max={30} onCommit={(v) => void upd((x) => ({ armor: x.armor ? { ...x.armor, base: v } : null }))} />
                  </label>
                )}
              </div>
              <div className="u-row u-wrap">
                <label className="u-row u-xs u-muted">
                  <input type="checkbox" checked={it.attuned} onChange={(e) => void upd(() => ({ attuned: e.target.checked }))} /> Em sintonia
                </label>
              </div>
              <label className="cs-mini-field cs-mini-field--wide">
                <span>Notas</span>
                <DraftTextarea className="textarea cs-textarea--sm" value={it.notes} maxLength={4000} rows={2} onCommit={(v) => void upd(() => ({ notes: v }))} />
              </label>
              <div className="cs-editor__foot">
                {weapon && data && <button type="button" className="btn btn--sm" onClick={() => onCreateAttack(data)}><Swords /> Criar ataque</button>}
                <button type="button" className="btn btn--danger btn--sm" onClick={() => void remove()}><Trash2 /> Remover</button>
              </div>
            </>
          ) : (
            it.notes && <p className="cs-item__desc">{it.notes}</p>
          )}
        </div>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// Item picker
// ---------------------------------------------------------------------------

const CATEGORIES: { value: 'all' | ItemCategory; label: string }[] = [
  { value: 'all', label: 'Todas as categorias' },
  { value: 'weapon', label: 'Armas' },
  { value: 'armor', label: 'Armaduras' },
  { value: 'shield', label: 'Escudos' },
  { value: 'gear', label: 'Equipamento' },
  { value: 'tool', label: 'Ferramentas' },
  { value: 'pack', label: 'Pacotes' },
  { value: 'ammunition', label: 'Munição' },
  { value: 'focus', label: 'Focos' },
  { value: 'potion', label: 'Poções' },
  { value: 'magic', label: 'Itens mágicos' },
];

function ItemPicker({ c, onClose, onAdded }: { c: Character; onClose: () => void; onAdded: (item: ItemData | null, invId?: ID) => void }) {
  const mod = useItemsModule();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | ItemCategory>('all');
  const results = useMemo(() => {
    if (!mod) return [];
    const nq = norm(q);
    let list = mod.ITEMS;
    if (cat !== 'all') list = list.filter((i) => i.category === cat || (cat === 'shield' && i.armor?.type === 'shield'));
    if (nq) list = list.filter((i) => norm(i.name).includes(nq) || norm(i.nameEn).includes(nq));
    return list.slice(0, 80);
  }, [mod, q, cat]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of c.inventory) if (it.ref) m.set(it.ref, (m.get(it.ref) ?? 0) + it.qty);
    return m;
  }, [c.inventory]);

  const add = (item: ItemData) => {
    const stackable = !item.weapon && !item.armor && !item.rarity;
    void patchCharacter(c.id, (cur) => {
      const existing = stackable ? cur.inventory.find((x) => x.ref === item.id) : undefined;
      if (existing) return { inventory: cur.inventory.map((x) => (x.id === existing.id ? { ...x, qty: x.qty + 1 } : x)) };
      return { inventory: [...cur.inventory, inventoryFromItem(item)] };
    });
    onAdded(item);
  };
  const addCustom = () => {
    const id = uid();
    void patchCharacter(c.id, (cur) => ({
      inventory: [...cur.inventory, { id, ref: null, name: 'Novo item', qty: 1, weight: 0, equipped: false, attuned: false, notes: '', armor: null }],
    }));
    onAdded(null, id);
    onClose();
  };

  return (
    <div className="cs-picker">
      <div className="cs-picker__head">
        <div className="cs-search">
          <Search />
          <input className="input input--sm" autoFocus placeholder="Buscar item (PT ou EN)…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <IconButton size="sm" icon={<X />} label="Fechar busca" onClick={onClose} />
      </div>
      <div className="cs-picker__filters">
        <select className="select input--sm" value={cat} onChange={(e) => setCat(e.target.value as 'all' | ItemCategory)} aria-label="Categoria">
          {CATEGORIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className="cs-picker__list">
        {!mod && <div className="u-center u-p-3"><Spinner /></div>}
        {mod && results.length === 0 && <div className="cs-empty-line">Nenhum item encontrado.</div>}
        {results.map((it) => {
          const n = counts.get(it.id) ?? 0;
          const meta = [mod?.ITEM_CATEGORY_NAMES[it.category], it.rarity ?? it.cost, it.weight ? `${it.weight} lb` : null].filter(Boolean).join(' · ');
          return (
            <div key={it.id} className="cs-pick" data-has={n ? 'true' : undefined}>
              <div className="u-grow">
                <div className="cs-pick__name u-ellipsis">{it.name}{n > 0 && <span className="cs-item__qty">×{n}</span>}</div>
                <div className="cs-pick__meta u-ellipsis">{meta}</div>
              </div>
              <button type="button" className="icon-btn icon-btn--sm" aria-label="Adicionar" data-tip="Adicionar" onClick={() => add(it)}>
                <Plus />
              </button>
            </div>
          );
        })}
      </div>
      <div className="cs-picker__foot">
        <button type="button" className="btn btn--ghost btn--sm" onClick={addCustom}><PackagePlus /> Item personalizado</button>
      </div>
    </div>
  );
}
