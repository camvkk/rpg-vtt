// Equipment / magic item card with inventory + attack shortcuts for the player's character.
import { Check, Coins, PackagePlus, Plus, Swords, Weight } from 'lucide-react';
import type { ItemData } from '@shared/data5e/types.ts';
import type { Attack, Character, InventoryItem } from '@shared/types.ts';
import { DAMAGE_TYPE_COLOR } from '@shared/rules5e.ts';
import { ITEM_CATEGORY_NAMES, RARITY_COLORS } from '@shared/data5e/items.ts';
import { act } from '../../net/socket.ts';
import { useMyCharacter } from '../../store/hooks.ts';
import { Button, toast } from '../../ui/index.tsx';
import { armorAcText, armorTypeName, damageText, fmtWeight, norm, weaponKindText } from './format.ts';
import { DiceChip, ITEM_ICON, newShortId, RichText, StatTile, type RollCtx } from './parts.tsx';

const PROPERTY_TIPS: Record<string, string> = {
  acuidade: 'Use Força ou Destreza no ataque e no dano',
  leve: 'Ideal para combater com duas armas',
  arremesso: 'Pode ser arremessada para um ataque à distância',
  'duas mãos': 'Exige as duas mãos para atacar',
  pesada: 'Criaturas Pequenas têm desvantagem nos ataques',
  alcance: 'Acrescenta 5 pés ao seu alcance',
  munição: 'Gasta munição a cada ataque; recupere metade após a luta',
  recarga: 'Só um disparo por ação, ação bônus ou reação',
  especial: 'Regras especiais na descrição',
  versátil: 'Pode ser usada com uma ou duas mãos',
};

function itemKindLine(item: ItemData): string {
  if (item.weapon) return weaponKindText(item.weapon);
  if (item.armor) return armorTypeName(item.armor.type);
  return ITEM_CATEGORY_NAMES[item.category] ?? item.category;
}

function isProficient(c: Character, item: ItemData): boolean {
  const w = item.weapon;
  if (!w) return false;
  const text = norm(c.proficiencies.weapons);
  if (!text) return true;
  if (text.includes(norm(item.name)) || text.includes(norm(item.nameEn))) return true;
  return w.category === 'simple' ? /simples|simple/.test(text) : /marcia|martial/.test(text);
}

export function weaponAttack(c: Character, item: ItemData): Attack | null {
  const w = item.weapon;
  if (!w) return null;
  const props = w.properties;
  const hasDamage = w.damage.type !== 'none' && w.damage.formula !== '0';
  const notes = props
    .map((p) => (p === 'versátil' && w.versatile ? `versátil (${w.versatile} + mod)` : p))
    .join(', ');
  return {
    id: newShortId(),
    name: item.name,
    ability: props.includes('acuidade') ? 'finesse' : w.type === 'ranged' ? 'dex' : 'str',
    proficient: isProficient(c, item),
    bonus: 0,
    damage: hasDamage ? [{ formula: `${w.damage.formula}+@mod`, type: w.damage.type }] : [],
    range: (w.range ?? (props.includes('alcance') ? '10 pés' : '5 pés')).slice(0, 60),
    critOn: 20,
    notes: notes.slice(0, 2000),
    save: null,
  };
}

export async function addItemToCharacter(c: Character, item: ItemData): Promise<boolean> {
  const existing = c.inventory.find((i) => i.ref === item.id);
  let inventory: InventoryItem[];
  if (existing) {
    inventory = c.inventory.map((i) => (i.id === existing.id ? { ...i, qty: i.qty + 1 } : i));
  } else {
    const entry: InventoryItem = {
      id: newShortId(),
      ref: item.id,
      name: item.name,
      qty: 1,
      weight: item.weight,
      equipped: false,
      attuned: false,
      notes: '',
      armor: item.armor ? { base: item.armor.base, dexCap: item.armor.dexCap, type: item.armor.type } : null,
    };
    inventory = [...c.inventory, entry];
  }
  const res = await act('character.update', { id: c.id, patch: { inventory } });
  if (res.ok) toast(existing ? `${item.name}: agora ${existing.qty + 1} no inventário.` : `${item.name} adicionado ao inventário.`, 'success');
  return res.ok;
}

export async function addWeaponAttack(c: Character, item: ItemData): Promise<boolean> {
  const atk = weaponAttack(c, item);
  if (!atk) return false;
  const res = await act('character.update', { id: c.id, patch: { attacks: [...c.attacks, atk] } });
  if (res.ok) toast(`Ataque "${item.name}" criado na ficha de ${c.name}.`, 'success');
  return res.ok;
}

/** Drops the auto-generated stat sentence of mundane weapons/armor (already shown as tiles). */
function extraDescription(item: ItemData): string {
  const d = item.description.trim();
  if (item.armor && item.armor.type !== 'shield' && /^Armadura (leve|média|pesada)\./.test(d)) return '';
  if (item.weapon) return d.replace(/^Arma (simples|marcial) (corpo a corpo|à distância)\. Dano: [^.]*\.( Propriedades: [^.]*\.)?\s*/, '');
  return d;
}

export function ItemCard({ item }: { item: ItemData }) {
  const me = useMyCharacter();
  const Icon = ITEM_ICON[item.category] ?? PackagePlus;
  const rarityColor = item.rarity ? RARITY_COLORS[item.rarity] : undefined;
  const owned = me?.inventory.find((i) => i.ref === item.id);
  const hasAttack = !!me?.attacks.some((a) => a.name === item.name);
  const ctx: RollCtx = { label: item.name, speaker: me?.name ?? null };
  const w = item.weapon;
  const a = item.armor;
  const description = extraDescription(item);

  return (
    <article className="cmp-card cmp-item" style={rarityColor ? { ['--rarity-c' as string]: rarityColor } : undefined}>
      <header className="cmp-item__head">
        <div className="cmp-item__frame" aria-hidden><Icon /></div>
        <div className="u-grow">
          <h2 className="cmp-card__title">{item.name}</h2>
          <div className="cmp-card__sub">
            {itemKindLine(item)}
            <span className="cmp-card__en"> · {item.nameEn}</span>
          </div>
          {(item.rarity || item.attunement) && (
            <div className="cmp-badges">
              {item.rarity && <span className="badge cmp-rarity">{item.rarity}</span>}
              {item.attunement && <span className="badge badge--dm" data-tip="Requer sintonização (descanso curto)">Sintonia</span>}
            </div>
          )}
        </div>
      </header>

      <div className="cmp-tiles">
        {w && (
          <StatTile label="Dano">
            {w.damage.type === 'none'
              ? 'Especial'
              : <DiceChip formula={w.damage.formula} ctx={{ ...ctx, label: `${item.name} — dano` }} color={DAMAGE_TYPE_COLOR[w.damage.type]}>{damageText(w.damage)}</DiceChip>}
          </StatTile>
        )}
        {w?.versatile && (
          <StatTile label="Duas mãos">
            <DiceChip formula={w.versatile} ctx={{ ...ctx, label: `${item.name} — dano (duas mãos)` }} color={DAMAGE_TYPE_COLOR[w.damage.type]}>
              {damageText({ formula: w.versatile, type: w.damage.type })}
            </DiceChip>
          </StatTile>
        )}
        {w && <StatTile label="Alcance">{w.range ?? (w.properties.includes('alcance') ? '10 pés' : '5 pés')}</StatTile>}
        {a && <StatTile label={a.type === 'shield' ? 'Bônus de CA' : 'Classe de Armadura'}>{armorAcText(a)}</StatTile>}
        {a?.strength && <StatTile label="Força mínima">{a.strength}</StatTile>}
        {a && a.type !== 'shield' && (
          <StatTile label="Furtividade">{a.stealthDisadvantage ? <span className="u-danger">Desvantagem</span> : '—'}</StatTile>
        )}
        <StatTile label="Custo"><Coins /> {item.cost || '—'}</StatTile>
        <StatTile label="Peso"><Weight /> {fmtWeight(item.weight)}</StatTile>
      </div>

      {w && w.properties.length > 0 && (
        <div className="cmp-props">
          {w.properties.map((p) => (
            <span key={p} className="cmp-tag cmp-tag--prop" data-tip={PROPERTY_TIPS[p]}>{p}</span>
          ))}
        </div>
      )}

      {description && <RichText text={description} roll={ctx} className="cmp-card__body" />}

      {me && (
        <div className="cmp-actions">
          <Button
            size="sm"
            variant={owned ? 'default' : 'primary'}
            icon={owned ? <Plus /> : <PackagePlus />}
            onClick={() => void addItemToCharacter(me, item)}
            data-tip={`Inventário de ${me.name}`}
          >
            {owned ? `Mais um (${owned.qty})` : 'Adicionar ao inventário'}
          </Button>
          {w && (
            <Button
              size="sm"
              variant="arcane"
              icon={hasAttack ? <Check /> : <Swords />}
              disabled={hasAttack}
              onClick={() => void addWeaponAttack(me, item)}
              data-tip={hasAttack ? 'Já existe um ataque com este nome' : 'Cria um ataque na ficha com o dano desta arma'}
            >
              {hasAttack ? 'Ataque criado' : 'Criar ataque'}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
