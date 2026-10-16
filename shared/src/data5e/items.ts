// Equipment and magic items (PT-BR). SRD 5.1, CC-BY-4.0.
// Costs use PT-BR coins: pc (cobre), pp (prata), pe (electro), po (ouro), pl (platina).
// `weapon.damage.formula` is the weapon die only — add the ability modifier (@mod) when building attacks.
import type { DamageType } from '../types.ts';
import type { ItemCategory, ItemData } from './types.ts';

type Rarity = NonNullable<ItemData['rarity']>;

const DAMAGE_PT: Record<DamageType, string> = {
  acid: 'ácido', bludgeoning: 'contundente', cold: 'frio', fire: 'fogo', force: 'energia',
  lightning: 'elétrico', necrotic: 'necrótico', piercing: 'perfurante', poison: 'veneno',
  psychic: 'psíquico', radiant: 'radiante', slashing: 'cortante', thunder: 'trovejante',
  healing: 'cura', none: 'nenhum',
};

/** Suggested price ranges by rarity (DMG). */
export const RARITY_PRICE: Record<Rarity, string> = {
  comum: '50–100 po',
  incomum: '101–500 po',
  raro: '501–5.000 po',
  'muito raro': '5.001–50.000 po',
  lendário: '50.001+ po',
  artefato: 'inestimável',
};

export const RARITY_COLORS: Record<Rarity, string> = {
  comum: '#c8c8c8',
  incomum: '#4caf50',
  raro: '#42a5f5',
  'muito raro': '#ab47bc',
  lendário: '#ff9800',
  artefato: '#e53935',
};

interface WeaponOpts {
  versatile?: string;
  range?: string;
  note?: string;
}

function weapon(
  id: string,
  name: string,
  nameEn: string,
  category: 'simple' | 'martial',
  type: 'melee' | 'ranged',
  cost: string,
  weight: number,
  formula: string,
  damageType: DamageType,
  properties: string[],
  opts: WeaponOpts = {},
): ItemData {
  const cat = category === 'simple' ? 'Arma simples' : 'Arma marcial';
  const kind = type === 'melee' ? 'corpo a corpo' : 'à distância';
  const props = properties
    .map((p) => {
      if ((p === 'arremesso' || p === 'munição') && opts.range) return `${p} (${opts.range})`;
      if (p === 'versátil' && opts.versatile) return `${p} (${opts.versatile})`;
      return p;
    })
    .join(', ');
  const dmg = damageType === 'none' ? 'sem dano' : `${formula} ${DAMAGE_PT[damageType]}`;
  const description = `${cat} ${kind}. Dano: ${dmg}.${props ? ` Propriedades: ${props}.` : ''}${opts.note ? ` ${opts.note}` : ''}`;
  const item: ItemData = {
    id,
    name,
    nameEn,
    category: 'weapon',
    cost,
    weight,
    description,
    weapon: { category, type, damage: { formula, type: damageType }, properties },
  };
  if (opts.versatile) item.weapon!.versatile = opts.versatile;
  if (opts.range) item.weapon!.range = opts.range;
  return item;
}

function armor(
  id: string,
  name: string,
  nameEn: string,
  type: 'light' | 'medium' | 'heavy',
  cost: string,
  weight: number,
  base: number,
  strength?: number,
  stealthDisadvantage?: boolean,
): ItemData {
  const dexCap = type === 'light' ? null : type === 'medium' ? 2 : 0;
  const label = type === 'light' ? 'Armadura leve' : type === 'medium' ? 'Armadura média' : 'Armadura pesada';
  const ac = type === 'light' ? `${base} + mod. de Destreza` : type === 'medium' ? `${base} + mod. de Destreza (máx. 2)` : `${base}`;
  const parts = [`${label}. CA ${ac}.`];
  if (strength) parts.push(`Requer Força ${strength}; caso contrário, seu deslocamento é reduzido em 10 pés.`);
  if (stealthDisadvantage) parts.push('Desvantagem em testes de Destreza (Furtividade).');
  const item: ItemData = {
    id,
    name,
    nameEn,
    category: 'armor',
    cost,
    weight,
    description: parts.join(' '),
    armor: { type, base, dexCap },
  };
  if (strength) item.armor!.strength = strength;
  if (stealthDisadvantage) item.armor!.stealthDisadvantage = true;
  return item;
}

function item(
  category: ItemCategory,
  id: string,
  name: string,
  nameEn: string,
  cost: string,
  weight: number,
  description: string,
): ItemData {
  return { id, name, nameEn, category, cost, weight, description };
}

function magic(
  id: string,
  name: string,
  nameEn: string,
  rarity: Rarity,
  attunement: boolean,
  description: string,
  weight = 0,
  category: ItemCategory = 'magic',
  cost?: string,
): ItemData {
  return { id, name, nameEn, category, cost: cost ?? RARITY_PRICE[rarity], weight, description, rarity, attunement };
}

// ---------------------------------------------------------------------------
// Weapons
// ---------------------------------------------------------------------------
const WEAPONS: ItemData[] = [
  // Simple melee
  weapon('club', 'Clava', 'Club', 'simple', 'melee', '1 pp', 2, '1d4', 'bludgeoning', ['leve']),
  weapon('dagger', 'Adaga', 'Dagger', 'simple', 'melee', '2 po', 1, '1d4', 'piercing', ['acuidade', 'leve', 'arremesso'], { range: '20/60 pés' }),
  weapon('greatclub', 'Clava Grande', 'Greatclub', 'simple', 'melee', '2 pp', 10, '1d8', 'bludgeoning', ['duas mãos']),
  weapon('handaxe', 'Machadinha', 'Handaxe', 'simple', 'melee', '5 po', 2, '1d6', 'slashing', ['leve', 'arremesso'], { range: '20/60 pés' }),
  weapon('javelin', 'Azagaia', 'Javelin', 'simple', 'melee', '5 pp', 2, '1d6', 'piercing', ['arremesso'], { range: '30/120 pés' }),
  weapon('light-hammer', 'Martelo Leve', 'Light Hammer', 'simple', 'melee', '2 po', 2, '1d4', 'bludgeoning', ['leve', 'arremesso'], { range: '20/60 pés' }),
  weapon('mace', 'Maça', 'Mace', 'simple', 'melee', '5 po', 4, '1d6', 'bludgeoning', []),
  weapon('quarterstaff', 'Bordão', 'Quarterstaff', 'simple', 'melee', '2 pp', 4, '1d6', 'bludgeoning', ['versátil'], { versatile: '1d8' }),
  weapon('sickle', 'Foice', 'Sickle', 'simple', 'melee', '1 po', 2, '1d4', 'slashing', ['leve']),
  weapon('spear', 'Lança', 'Spear', 'simple', 'melee', '1 po', 3, '1d6', 'piercing', ['arremesso', 'versátil'], { range: '20/60 pés', versatile: '1d8' }),
  // Simple ranged
  weapon('light-crossbow', 'Besta Leve', 'Light Crossbow', 'simple', 'ranged', '25 po', 5, '1d8', 'piercing', ['munição', 'recarga', 'duas mãos'], { range: '80/320 pés' }),
  weapon('dart', 'Dardo', 'Dart', 'simple', 'ranged', '5 pc', 0.25, '1d4', 'piercing', ['acuidade', 'arremesso'], { range: '20/60 pés' }),
  weapon('shortbow', 'Arco Curto', 'Shortbow', 'simple', 'ranged', '25 po', 2, '1d6', 'piercing', ['munição', 'duas mãos'], { range: '80/320 pés' }),
  weapon('sling', 'Funda', 'Sling', 'simple', 'ranged', '1 pp', 0, '1d4', 'bludgeoning', ['munição'], { range: '30/120 pés' }),
  // Martial melee
  weapon('battleaxe', 'Machado de Batalha', 'Battleaxe', 'martial', 'melee', '10 po', 4, '1d8', 'slashing', ['versátil'], { versatile: '1d10' }),
  weapon('flail', 'Mangual', 'Flail', 'martial', 'melee', '10 po', 2, '1d8', 'bludgeoning', []),
  weapon('glaive', 'Glaive', 'Glaive', 'martial', 'melee', '20 po', 6, '1d10', 'slashing', ['pesada', 'alcance', 'duas mãos']),
  weapon('greataxe', 'Machado Grande', 'Greataxe', 'martial', 'melee', '30 po', 7, '1d12', 'slashing', ['pesada', 'duas mãos']),
  weapon('greatsword', 'Espada Grande', 'Greatsword', 'martial', 'melee', '50 po', 6, '2d6', 'slashing', ['pesada', 'duas mãos']),
  weapon('halberd', 'Alabarda', 'Halberd', 'martial', 'melee', '20 po', 6, '1d10', 'slashing', ['pesada', 'alcance', 'duas mãos']),
  weapon('lance', 'Lança de Montaria', 'Lance', 'martial', 'melee', '10 po', 6, '1d12', 'piercing', ['alcance', 'especial'], {
    note: 'Especial: você tem desvantagem ao atacar um alvo a até 5 pés. Requer as duas mãos quando você não está montado.',
  }),
  weapon('longsword', 'Espada Longa', 'Longsword', 'martial', 'melee', '15 po', 3, '1d8', 'slashing', ['versátil'], { versatile: '1d10' }),
  weapon('maul', 'Malho', 'Maul', 'martial', 'melee', '10 po', 10, '2d6', 'bludgeoning', ['pesada', 'duas mãos']),
  weapon('morningstar', 'Maça Estrela', 'Morningstar', 'martial', 'melee', '15 po', 4, '1d8', 'piercing', []),
  weapon('pike', 'Pique', 'Pike', 'martial', 'melee', '5 po', 18, '1d10', 'piercing', ['pesada', 'alcance', 'duas mãos']),
  weapon('rapier', 'Rapieira', 'Rapier', 'martial', 'melee', '25 po', 2, '1d8', 'piercing', ['acuidade']),
  weapon('scimitar', 'Cimitarra', 'Scimitar', 'martial', 'melee', '25 po', 3, '1d6', 'slashing', ['acuidade', 'leve']),
  weapon('shortsword', 'Espada Curta', 'Shortsword', 'martial', 'melee', '10 po', 2, '1d6', 'piercing', ['acuidade', 'leve']),
  weapon('trident', 'Tridente', 'Trident', 'martial', 'melee', '5 po', 4, '1d6', 'piercing', ['arremesso', 'versátil'], { range: '20/60 pés', versatile: '1d8' }),
  weapon('war-pick', 'Picareta de Guerra', 'War Pick', 'martial', 'melee', '5 po', 2, '1d8', 'piercing', []),
  weapon('warhammer', 'Martelo de Guerra', 'Warhammer', 'martial', 'melee', '15 po', 2, '1d8', 'bludgeoning', ['versátil'], { versatile: '1d10' }),
  weapon('whip', 'Chicote', 'Whip', 'martial', 'melee', '2 po', 3, '1d4', 'slashing', ['acuidade', 'alcance']),
  // Martial ranged
  weapon('blowgun', 'Zarabatana', 'Blowgun', 'martial', 'ranged', '10 po', 1, '1', 'piercing', ['munição', 'recarga'], { range: '25/100 pés' }),
  weapon('hand-crossbow', 'Besta de Mão', 'Hand Crossbow', 'martial', 'ranged', '75 po', 3, '1d6', 'piercing', ['munição', 'leve', 'recarga'], { range: '30/120 pés' }),
  weapon('heavy-crossbow', 'Besta Pesada', 'Heavy Crossbow', 'martial', 'ranged', '50 po', 18, '1d10', 'piercing', ['munição', 'pesada', 'recarga', 'duas mãos'], { range: '100/400 pés' }),
  weapon('longbow', 'Arco Longo', 'Longbow', 'martial', 'ranged', '50 po', 2, '1d8', 'piercing', ['munição', 'pesada', 'duas mãos'], { range: '150/600 pés' }),
  weapon('net', 'Rede', 'Net', 'martial', 'ranged', '1 po', 3, '0', 'none', ['especial', 'arremesso'], {
    range: '5/15 pés',
    note: 'Especial: uma criatura Grande ou menor atingida fica impedida até se libertar (ação, teste de Força CD 10, ou causar 5 de dano cortante à rede, CA 10). Não afeta criaturas amorfas nem Enormes ou maiores. Ao atacar com a rede, você faz apenas um ataque, mesmo que normalmente pudesse fazer mais.',
  }),
];

// ---------------------------------------------------------------------------
// Armor
// ---------------------------------------------------------------------------
const ARMOR: ItemData[] = [
  armor('padded', 'Acolchoada', 'Padded Armor', 'light', '5 po', 8, 11, undefined, true),
  armor('leather', 'Armadura de Couro', 'Leather Armor', 'light', '10 po', 10, 11),
  armor('studded-leather', 'Couro Batido', 'Studded Leather Armor', 'light', '45 po', 13, 12),
  armor('hide', 'Gibão de Peles', 'Hide Armor', 'medium', '10 po', 12, 12),
  armor('chain-shirt', 'Camisão de Malha', 'Chain Shirt', 'medium', '50 po', 20, 13),
  armor('scale-mail', 'Brunea', 'Scale Mail', 'medium', '50 po', 45, 14, undefined, true),
  armor('breastplate', 'Peitoral', 'Breastplate', 'medium', '400 po', 20, 14),
  armor('half-plate', 'Meia-Armadura', 'Half Plate', 'medium', '750 po', 40, 15, undefined, true),
  armor('ring-mail', 'Cota de Anéis', 'Ring Mail', 'heavy', '30 po', 40, 14, undefined, true),
  armor('chain-mail', 'Cota de Malha', 'Chain Mail', 'heavy', '75 po', 55, 16, 13, true),
  armor('splint', 'Cota de Talas', 'Splint Armor', 'heavy', '200 po', 60, 17, 15, true),
  armor('plate', 'Armadura de Placas', 'Plate Armor', 'heavy', '1.500 po', 65, 18, 15, true),
  {
    id: 'shield',
    name: 'Escudo',
    nameEn: 'Shield',
    category: 'shield',
    cost: '10 po',
    weight: 6,
    description: 'Escudo de madeira ou metal carregado em uma mão. Aumenta sua CA em 2. Você só pode se beneficiar de um escudo por vez.',
    armor: { type: 'shield', base: 2, dexCap: null },
  },
];

// ---------------------------------------------------------------------------
// Ammunition
// ---------------------------------------------------------------------------
const AMMUNITION: ItemData[] = [
  item('ammunition', 'arrows', 'Flechas (20)', 'Arrows (20)', '1 po', 1, 'Munição para arcos. Após a batalha, você pode recuperar metade da munição gasta gastando um minuto procurando.'),
  item('ammunition', 'crossbow-bolts', 'Virotes (20)', 'Crossbow Bolts (20)', '1 po', 1.5, 'Munição para bestas. Após a batalha, você pode recuperar metade da munição gasta.'),
  item('ammunition', 'sling-bullets', 'Balas de Funda (20)', 'Sling Bullets (20)', '4 pc', 1.5, 'Munição para fundas.'),
  item('ammunition', 'blowgun-needles', 'Agulhas de Zarabatana (50)', 'Blowgun Needles (50)', '1 po', 1, 'Munição para zarabatanas.'),
];

// ---------------------------------------------------------------------------
// Spellcasting focuses
// ---------------------------------------------------------------------------
const FOCUSES: ItemData[] = [
  item('focus', 'component-pouch', 'Bolsa de Componentes', 'Component Pouch', '25 po', 2, 'Pequena bolsa de couro à prova d’água com compartimentos para os componentes materiais e objetos especiais necessários para conjurar magias (exceto componentes com custo especificado).'),
  item('focus', 'arcane-focus-crystal', 'Foco Arcano: Cristal', 'Arcane Focus: Crystal', '10 po', 1, 'Foco arcano para bruxos, feiticeiros e magos; substitui componentes materiais sem custo.'),
  item('focus', 'arcane-focus-orb', 'Foco Arcano: Orbe', 'Arcane Focus: Orb', '20 po', 3, 'Foco arcano para bruxos, feiticeiros e magos; substitui componentes materiais sem custo.'),
  item('focus', 'arcane-focus-rod', 'Foco Arcano: Bastão', 'Arcane Focus: Rod', '10 po', 2, 'Foco arcano para bruxos, feiticeiros e magos; substitui componentes materiais sem custo.'),
  item('focus', 'arcane-focus-staff', 'Foco Arcano: Cajado', 'Arcane Focus: Staff', '5 po', 4, 'Foco arcano; também pode ser usado como bordão.'),
  item('focus', 'arcane-focus-wand', 'Foco Arcano: Varinha', 'Arcane Focus: Wand', '10 po', 1, 'Foco arcano para bruxos, feiticeiros e magos; substitui componentes materiais sem custo.'),
  item('focus', 'druidic-focus-sprig', 'Foco Druídico: Ramo de Visco', 'Druidic Focus: Sprig of Mistletoe', '1 po', 0, 'Foco druídico; substitui componentes materiais sem custo das magias de druida.'),
  item('focus', 'druidic-focus-totem', 'Foco Druídico: Totem', 'Druidic Focus: Totem', '1 po', 0, 'Totem com penas, pelos, ossos e dentes de animais sagrados; serve como foco druídico.'),
  item('focus', 'druidic-focus-staff', 'Foco Druídico: Cajado de Madeira', 'Druidic Focus: Wooden Staff', '5 po', 4, 'Cajado de uma árvore viva; foco druídico que também pode ser usado como bordão.'),
  item('focus', 'druidic-focus-wand', 'Foco Druídico: Varinha de Teixo', 'Druidic Focus: Yew Wand', '10 po', 1, 'Foco druídico.'),
  item('focus', 'holy-symbol-amulet', 'Símbolo Sagrado: Amuleto', 'Holy Symbol: Amulet', '5 po', 1, 'Representação de uma divindade. Clérigos e paladinos podem usá-lo como foco de conjuração, segurando-o, usando-o à vista ou exibindo-o no escudo.'),
  item('focus', 'holy-symbol-emblem', 'Símbolo Sagrado: Emblema', 'Holy Symbol: Emblem', '5 po', 0, 'Símbolo sagrado gravado ou incrustado em um escudo ou vestimenta; foco de conjuração divina.'),
  item('focus', 'holy-symbol-reliquary', 'Símbolo Sagrado: Relicário', 'Holy Symbol: Reliquary', '5 po', 2, 'Pequena caixa com um fragmento de relíquia sagrada; foco de conjuração divina.'),
];

// ---------------------------------------------------------------------------
// Adventuring gear
// ---------------------------------------------------------------------------
const GEAR: ItemData[] = [
  item('gear', 'acid-vial', 'Ácido (frasco)', 'Acid (vial)', '25 po', 1, 'Com uma ação, espirre o conteúdo em uma criatura a até 5 pés ou arremesse o frasco a até 20 pés, estilhaçando-o. Faça um ataque à distância (arma improvisada); se acertar, o alvo sofre 2d6 de dano ácido.'),
  item('gear', 'alchemists-fire', 'Fogo Alquímico (frasco)', "Alchemist's Fire (flask)", '50 po', 1, 'Líquido que entra em combustão ao contato com o ar. Com uma ação, arremesse-o a até 20 pés (ataque à distância, arma improvisada). Se acertar, o alvo sofre 1d4 de dano de fogo no início de cada turno até alguém usar uma ação e passar em um teste de Destreza CD 10 para apagar as chamas.'),
  item('gear', 'antitoxin', 'Antitoxina (frasco)', 'Antitoxin (vial)', '50 po', 0, 'Quem beber este líquido tem vantagem em salvaguardas contra veneno por 1 hora. Não beneficia mortos-vivos nem constructos.'),
  item('gear', 'holy-water', 'Água Benta (frasco)', 'Holy Water (flask)', '25 po', 1, 'Com uma ação, espirre o conteúdo em uma criatura a até 5 pés ou arremesse o frasco a até 20 pés. Se o alvo for um corruptor ou morto-vivo, sofre 2d6 de dano radiante.'),
  item('gear', 'backpack', 'Mochila', 'Backpack', '2 po', 5, 'Comporta 1 pé cúbico ou 30 libras de equipamento. Itens também podem ser amarrados do lado de fora.'),
  item('gear', 'ball-bearings', 'Rolamentos (bolsa com 1.000)', 'Ball Bearings (bag of 1,000)', '1 po', 2, 'Com uma ação, espalhe-os em uma área quadrada de 10 pés. Uma criatura que entrar na área faz uma salvaguarda de Destreza CD 10 ou cai derrubada. Quem se move à metade do deslocamento não precisa fazer o teste.'),
  item('gear', 'bedroll', 'Saco de Dormir', 'Bedroll', '1 po', 7, 'Para dormir ao relento com algum conforto.'),
  item('gear', 'bell', 'Sino', 'Bell', '1 po', 0, 'Pequeno sino de metal, útil para alarmes improvisados.'),
  item('gear', 'blanket', 'Cobertor', 'Blanket', '5 pp', 3, 'Cobertor de lã grossa.'),
  item('gear', 'block-and-tackle', 'Bloco e Polia', 'Block and Tackle', '1 po', 5, 'Conjunto de polias com cabo e gancho. Permite içar até quatro vezes o peso que você normalmente conseguiria.'),
  item('gear', 'book', 'Livro', 'Book', '25 po', 5, 'Pode conter poesia, relatos históricos, informações sobre um campo de conhecimento, diagramas de engenhocas gnômicas ou praticamente qualquer coisa que possa ser escrita.'),
  item('gear', 'bottle-glass', 'Garrafa de Vidro', 'Bottle, glass', '2 po', 2, 'Comporta 1,5 litro (1/2 galão) de líquido.'),
  item('gear', 'bucket', 'Balde', 'Bucket', '5 pc', 2, 'Comporta 3 galões de líquido ou 1/2 pé cúbico de sólidos.'),
  item('gear', 'caltrops', 'Estrepes (bolsa com 20)', 'Caltrops (bag of 20)', '1 po', 2, 'Com uma ação, espalhe-os em uma área quadrada de 5 pés. Uma criatura que entrar na área faz uma salvaguarda de Destreza CD 15 ou para de se mover e sofre 1 de dano perfurante; até recuperar 1 PV, seu deslocamento é reduzido em 10 pés. Quem se move à metade do deslocamento não precisa fazer o teste.'),
  item('gear', 'candle', 'Vela', 'Candle', '1 pc', 0, 'Por 1 hora, emite luz plena em um raio de 5 pés e penumbra por mais 5 pés.'),
  item('gear', 'case-crossbow-bolt', 'Estojo de Virotes', 'Case, Crossbow Bolt', '1 po', 1, 'Estojo de madeira que comporta até 20 virotes.'),
  item('gear', 'case-map-or-scroll', 'Estojo de Mapas ou Pergaminhos', 'Case, Map or Scroll', '1 po', 1, 'Tubo de couro que comporta até dez folhas de papel ou cinco folhas de pergaminho enroladas.'),
  item('gear', 'chain', 'Corrente (10 pés)', 'Chain (10 feet)', '5 po', 10, 'Tem 10 pontos de vida. Pode ser rompida com um teste de Força CD 20.'),
  item('gear', 'chalk', 'Giz (1 pedaço)', 'Chalk (1 piece)', '1 pc', 0, 'Útil para marcar caminhos e deixar sinais.'),
  item('gear', 'chest', 'Baú', 'Chest', '5 po', 25, 'Comporta 12 pés cúbicos ou 300 libras de equipamento.'),
  item('gear', 'climbers-kit', 'Kit de Escalada', "Climber's Kit", '25 po', 12, 'Inclui pítons especiais, botas com cravos, luvas e um arnês. Com uma ação, você pode se ancorar: não cai mais de 25 pés do ponto de ancoragem nem se afasta mais de 25 pés dele sem desfazê-la.'),
  item('gear', 'clothes-common', 'Roupas Comuns', 'Clothes, Common', '5 pp', 3, 'Conjunto de roupas simples do dia a dia.'),
  item('gear', 'clothes-costume', 'Traje', 'Clothes, Costume', '5 po', 4, 'Traje para apresentações artísticas.'),
  item('gear', 'clothes-fine', 'Roupas Finas', 'Clothes, Fine', '15 po', 6, 'Roupas elegantes, adequadas à nobreza e a ocasiões formais.'),
  item('gear', 'clothes-travelers', 'Roupas de Viajante', "Clothes, Traveler's", '2 po', 4, 'Roupas resistentes para longas jornadas.'),
  item('gear', 'crowbar', 'Pé de Cabra', 'Crowbar', '2 po', 5, 'Concede vantagem em testes de Força em que a alavanca do pé de cabra possa ser aplicada.'),
  item('gear', 'fishing-tackle', 'Equipamento de Pesca', 'Fishing Tackle', '1 po', 4, 'Vara de madeira, linha de seda, boias de cortiça, anzóis de aço, chumbadas, iscas e uma rede estreita.'),
  item('gear', 'flask', 'Frasco ou Caneca', 'Flask or Tankard', '2 pc', 1, 'Comporta 1 quartilho (cerca de meio litro) de líquido.'),
  item('gear', 'grappling-hook', 'Gancho de Escalada', 'Grappling Hook', '2 po', 4, 'Gancho de ferro para prender uma corda a bordas, janelas e ameias.'),
  item('gear', 'hammer', 'Martelo', 'Hammer', '1 po', 3, 'Martelo de ferramenta, útil para fixar pítons e cravos.'),
  item('gear', 'sledgehammer', 'Marreta', 'Hammer, Sledge', '2 po', 10, 'Martelo pesado para quebrar pedra e madeira.'),
  item('gear', 'healers-kit', 'Kit de Primeiros Socorros', "Healer's Kit", '5 po', 3, 'Bolsa de couro com bandagens, unguentos e talas. Tem dez usos. Com uma ação, gaste um uso para estabilizar uma criatura com 0 pontos de vida, sem precisar de um teste de Sabedoria (Medicina).'),
  item('gear', 'hourglass', 'Ampulheta', 'Hourglass', '25 po', 1, 'Marca a passagem do tempo.'),
  item('gear', 'hunting-trap', 'Armadilha de Caça', 'Hunting Trap', '5 po', 25, 'Com uma ação, arme-a. Uma criatura que pisar nela faz uma salvaguarda de Destreza CD 13 ou sofre 1d4 de dano perfurante e para de se mover; seu deslocamento fica 0 até se libertar (ação, teste de Força CD 13; cada falha causa 1 de dano perfurante).'),
  item('gear', 'ink', 'Tinta (frasco de 30 ml)', 'Ink (1 ounce bottle)', '10 po', 0, 'Tinta escura para escrita.'),
  item('gear', 'ink-pen', 'Caneta-Tinteiro', 'Ink Pen', '2 pc', 0, 'Pena ou caneta de madeira para escrever com tinta.'),
  item('gear', 'jug', 'Jarro ou Moringa', 'Jug or Pitcher', '2 pc', 4, 'Comporta 1 galão de líquido.'),
  item('gear', 'ladder', 'Escada (10 pés)', 'Ladder (10-foot)', '1 pp', 25, 'Escada de madeira de 10 pés.'),
  item('gear', 'lamp', 'Lamparina', 'Lamp', '5 pp', 1, 'Emite luz plena em um raio de 15 pés e penumbra por mais 30 pés. Queima por 6 horas com um frasco de óleo.'),
  item('gear', 'lantern-bullseye', 'Lanterna Furta-Fogo', 'Lantern, Bullseye', '10 po', 2, 'Emite luz plena em um cone de 60 pés e penumbra por mais 60 pés. Queima por 6 horas com um frasco de óleo.'),
  item('gear', 'lantern-hooded', 'Lanterna Coberta', 'Lantern, Hooded', '5 po', 2, 'Emite luz plena em um raio de 30 pés e penumbra por mais 30 pés. Queima por 6 horas com um frasco de óleo. Com uma ação, abaixe a cobertura para reduzir a luz a penumbra em 5 pés.'),
  item('gear', 'lock', 'Cadeado', 'Lock', '10 po', 1, 'Vem com uma chave. Sem ela, uma criatura proficiente com ferramentas de ladrão pode abri-lo com um teste de Destreza CD 15.'),
  item('gear', 'magnifying-glass', 'Lupa', 'Magnifying Glass', '100 po', 0, 'Permite acender fogo sob luz solar intensa (1 minuto) e concede vantagem em testes para avaliar ou inspecionar um objeto pequeno ou muito detalhado.'),
  item('gear', 'manacles', 'Algemas', 'Manacles', '2 po', 6, 'Prendem uma criatura Pequena ou Média. Escapar exige um teste de Destreza CD 20; quebrá-las, Força CD 20. Abrir sem a chave: ferramentas de ladrão, Destreza CD 15. Têm 15 pontos de vida.'),
  item('gear', 'mess-kit', 'Kit de Refeição', 'Mess Kit', '2 pp', 1, 'Caixa de lata com copo e talheres simples; as metades servem de panela e prato.'),
  item('gear', 'mirror-steel', 'Espelho de Aço', 'Mirror, Steel', '5 po', 0.5, 'Pequeno espelho de aço polido, útil para olhar por cantos e sinalizar.'),
  item('gear', 'oil-flask', 'Óleo (frasco)', 'Oil (flask)', '1 pp', 1, 'Combustível para lamparinas e lanternas. Com uma ação, espirre-o em uma criatura a até 5 pés ou arremesse-o a até 20 pés; se o alvo sofrer dano de fogo antes de o óleo secar (1 minuto), sofre 5 de dano de fogo adicional. Também pode cobrir uma área de 5 pés que, acesa, queima por 2 rodadas causando 5 de dano de fogo.'),
  item('gear', 'paper', 'Papel (uma folha)', 'Paper (one sheet)', '2 pp', 0, 'Folha de papel para escrita.'),
  item('gear', 'parchment', 'Pergaminho (uma folha)', 'Parchment (one sheet)', '1 pp', 0, 'Folha de pergaminho para escrita.'),
  item('gear', 'perfume', 'Perfume (frasco)', 'Perfume (vial)', '5 po', 0, 'Pequeno frasco de perfume.'),
  item('gear', 'miners-pick', 'Picareta de Minerador', "Pick, Miner's", '2 po', 10, 'Ferramenta para escavar rocha e terra.'),
  item('gear', 'piton', 'Píton', 'Piton', '5 pc', 0.25, 'Cravo de metal usado em escaladas para fixar cordas.'),
  item('gear', 'poison-basic', 'Veneno Básico (frasco)', 'Poison, Basic (vial)', '100 po', 0, 'Com uma ação, aplique o veneno em uma arma cortante ou perfurante ou em até três munições. Por 1 minuto, uma criatura atingida faz uma salvaguarda de Constituição CD 10 ou sofre 1d4 de dano de veneno. Depois de aplicado, o veneno seca.'),
  item('gear', 'pole', 'Vara (10 pés)', 'Pole (10-foot)', '5 pc', 7, 'Vara de madeira de 10 pés, ideal para cutucar o desconhecido.'),
  item('gear', 'pot-iron', 'Pote de Ferro', 'Pot, Iron', '2 po', 10, 'Comporta 1 galão de líquido.'),
  item('gear', 'pouch', 'Algibeira', 'Pouch', '5 pp', 1, 'Bolsa de tecido ou couro que comporta até 20 balas de funda ou 50 agulhas de zarabatana, entre outras coisas (1/5 de pé cúbico ou 6 libras).'),
  item('gear', 'quiver', 'Aljava', 'Quiver', '1 po', 1, 'Comporta até 20 flechas.'),
  item('gear', 'ram-portable', 'Aríete Portátil', 'Ram, Portable', '4 po', 35, 'Concede +4 em testes de Força para arrombar portas. Outro personagem ajudando concede vantagem no teste.'),
  item('gear', 'rations', 'Rações (1 dia)', 'Rations (1 day)', '5 pp', 2, 'Comida seca e compacta adequada para viagens longas: carne-seca, frutas secas, biscoitos duros e nozes.'),
  item('gear', 'robes', 'Manto', 'Robes', '1 po', 4, 'Vestes longas, usadas por sacerdotes, estudiosos e conjuradores.'),
  item('gear', 'rope-hempen', 'Corda de Cânhamo (50 pés)', 'Rope, Hempen (50 feet)', '1 po', 10, 'Tem 2 pontos de vida e pode ser rompida com um teste de Força CD 17.'),
  item('gear', 'rope-silk', 'Corda de Seda (50 pés)', 'Rope, Silk (50 feet)', '10 po', 5, 'Tem 2 pontos de vida e pode ser rompida com um teste de Força CD 17.'),
  item('gear', 'sack', 'Saco', 'Sack', '1 pc', 0.5, 'Comporta 1 pé cúbico ou 30 libras de equipamento.'),
  item('gear', 'scale-merchants', 'Balança de Mercador', "Scale, Merchant's", '5 po', 3, 'Pequena balança com pesos de até 2 libras, para pesar mercadorias e metais preciosos.'),
  item('gear', 'sealing-wax', 'Cera de Lacre', 'Sealing Wax', '5 pp', 0, 'Cera para lacrar cartas e documentos.'),
  item('gear', 'shovel', 'Pá', 'Shovel', '2 po', 5, 'Ferramenta para cavar.'),
  item('gear', 'signal-whistle', 'Apito de Sinalização', 'Signal Whistle', '5 pc', 0, 'Apito agudo, audível a grande distância.'),
  item('gear', 'signet-ring', 'Anel de Sinete', 'Signet Ring', '5 po', 0, 'Anel com um brasão, usado para selar documentos.'),
  item('gear', 'soap', 'Sabão', 'Soap', '2 pc', 0, 'Barra de sabão.'),
  item('gear', 'spellbook', 'Grimório', 'Spellbook', '50 po', 3, 'Livro com capa de couro e 100 páginas de pergaminho em branco, essencial para magos registrarem suas magias.'),
  item('gear', 'iron-spikes', 'Cravos de Ferro (10)', 'Spikes, Iron (10)', '1 po', 5, 'Cravos de ferro para travar portas ou fixar cordas.'),
  item('gear', 'spyglass', 'Luneta', 'Spyglass', '1.000 po', 1, 'Objetos vistos através dela são ampliados para o dobro do tamanho.'),
  item('gear', 'tent', 'Barraca (duas pessoas)', 'Tent, two-person', '2 po', 20, 'Abrigo de lona simples e portátil para duas pessoas.'),
  item('gear', 'tinderbox', 'Estojo de Pederneira', 'Tinderbox', '5 pp', 1, 'Pederneira, aço e isca para acender fogo. Acender uma tocha, lamparina ou fogueira com isca exposta leva uma ação; outros fogos levam 1 minuto.'),
  item('gear', 'torch', 'Tocha', 'Torch', '1 pc', 1, 'Queima por 1 hora, emitindo luz plena em um raio de 20 pés e penumbra por mais 20 pés. Usada como arma improvisada, causa 1 de dano de fogo.'),
  item('gear', 'vial', 'Frasco de Vidro', 'Vial', '1 po', 0, 'Comporta 4 onças (cerca de 120 ml) de líquido.'),
  item('gear', 'waterskin', 'Odre', 'Waterskin', '2 pp', 5, 'Comporta 4 quartilhos (cerca de 2 litros) de líquido. Peso indicado com o odre cheio.'),
  item('gear', 'whetstone', 'Pedra de Amolar', 'Whetstone', '1 pc', 1, 'Mantém lâminas afiadas.'),
  item('gear', 'abacus', 'Ábaco', 'Abacus', '2 po', 2, 'Instrumento para cálculos.'),
];

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const ARTISAN_NOTE = 'Ferramentas de artesão: a proficiência permite somar o bônus de proficiência a testes feitos com elas no seu ofício.';
const TOOLS: ItemData[] = [
  item('tool', 'alchemists-supplies', 'Suprimentos de Alquimista', "Alchemist's Supplies", '50 po', 8, ARTISAN_NOTE),
  item('tool', 'brewers-supplies', 'Suprimentos de Cervejeiro', "Brewer's Supplies", '20 po', 9, ARTISAN_NOTE),
  item('tool', 'calligraphers-supplies', 'Suprimentos de Calígrafo', "Calligrapher's Supplies", '10 po', 5, ARTISAN_NOTE),
  item('tool', 'carpenters-tools', 'Ferramentas de Carpinteiro', "Carpenter's Tools", '8 po', 6, ARTISAN_NOTE),
  item('tool', 'cartographers-tools', 'Ferramentas de Cartógrafo', "Cartographer's Tools", '15 po', 6, ARTISAN_NOTE),
  item('tool', 'cobblers-tools', 'Ferramentas de Sapateiro', "Cobbler's Tools", '5 po', 5, ARTISAN_NOTE),
  item('tool', 'cooks-utensils', 'Utensílios de Cozinheiro', "Cook's Utensils", '1 po', 8, ARTISAN_NOTE),
  item('tool', 'glassblowers-tools', 'Ferramentas de Vidreiro', "Glassblower's Tools", '30 po', 5, ARTISAN_NOTE),
  item('tool', 'jewelers-tools', 'Ferramentas de Joalheiro', "Jeweler's Tools", '25 po', 2, ARTISAN_NOTE),
  item('tool', 'leatherworkers-tools', 'Ferramentas de Coureiro', "Leatherworker's Tools", '5 po', 5, ARTISAN_NOTE),
  item('tool', 'masons-tools', 'Ferramentas de Pedreiro', "Mason's Tools", '10 po', 8, ARTISAN_NOTE),
  item('tool', 'painters-supplies', 'Suprimentos de Pintor', "Painter's Supplies", '10 po', 5, ARTISAN_NOTE),
  item('tool', 'potters-tools', 'Ferramentas de Oleiro', "Potter's Tools", '10 po', 3, ARTISAN_NOTE),
  item('tool', 'smiths-tools', 'Ferramentas de Ferreiro', "Smith's Tools", '20 po', 8, ARTISAN_NOTE),
  item('tool', 'tinkers-tools', 'Ferramentas de Funileiro', "Tinker's Tools", '50 po', 10, ARTISAN_NOTE),
  item('tool', 'weavers-tools', 'Ferramentas de Tecelão', "Weaver's Tools", '1 po', 5, ARTISAN_NOTE),
  item('tool', 'woodcarvers-tools', 'Ferramentas de Entalhador', "Woodcarver's Tools", '1 po', 5, ARTISAN_NOTE),
  item('tool', 'disguise-kit', 'Kit de Disfarce', 'Disguise Kit', '25 po', 3, 'Cosméticos, tinta de cabelo e pequenos adereços para criar disfarces. A proficiência permite somar o bônus de proficiência a testes para criar um disfarce visual.'),
  item('tool', 'forgery-kit', 'Kit de Falsificação', 'Forgery Kit', '15 po', 5, 'Papéis, tintas, lacres e ferramentas para criar falsificações convincentes de documentos.'),
  item('tool', 'dice-set', 'Jogo de Dados', 'Dice Set', '1 pp', 0, 'Kit de jogo. A proficiência permite somar o bônus de proficiência a testes para jogar.'),
  item('tool', 'playing-card-set', 'Baralho', 'Playing Card Set', '5 pp', 0, 'Kit de jogo. A proficiência permite somar o bônus de proficiência a testes para jogar.'),
  item('tool', 'herbalism-kit', 'Kit de Herbalismo', 'Herbalism Kit', '5 po', 3, 'Tesouras, almofariz e pilão, bolsas e frascos para identificar e aplicar ervas. A proficiência é necessária para criar antitoxinas e poções de cura.'),
  item('tool', 'navigators-tools', 'Ferramentas de Navegador', "Navigator's Tools", '25 po', 2, 'Sextante, compasso, réguas, papel e tinta para traçar rotas e evitar perder-se no mar.'),
  item('tool', 'poisoners-kit', 'Kit de Envenenador', "Poisoner's Kit", '50 po', 2, 'Frascos, produtos químicos e equipamentos para criar e aplicar venenos.'),
  item('tool', 'thieves-tools', 'Ferramentas de Ladrão', "Thieves' Tools", '25 po', 1, 'Lima pequena, gazuas, espelho de cabo de metal, tesoura e alicate. A proficiência permite somar o bônus de proficiência a testes para desarmar armadilhas e abrir fechaduras.'),
  item('tool', 'bagpipes', 'Gaita de Foles', 'Bagpipes', '30 po', 6, 'Instrumento musical.'),
  item('tool', 'drum', 'Tambor', 'Drum', '6 po', 3, 'Instrumento musical.'),
  item('tool', 'dulcimer', 'Saltério', 'Dulcimer', '25 po', 10, 'Instrumento musical.'),
  item('tool', 'flute', 'Flauta', 'Flute', '2 po', 1, 'Instrumento musical.'),
  item('tool', 'lute', 'Alaúde', 'Lute', '35 po', 2, 'Instrumento musical.'),
  item('tool', 'lyre', 'Lira', 'Lyre', '30 po', 2, 'Instrumento musical.'),
  item('tool', 'horn', 'Trompa', 'Horn', '3 po', 2, 'Instrumento musical.'),
  item('tool', 'pan-flute', 'Flauta de Pã', 'Pan Flute', '12 po', 2, 'Instrumento musical.'),
  item('tool', 'shawm', 'Charamela', 'Shawm', '2 po', 1, 'Instrumento musical.'),
  item('tool', 'viol', 'Viola', 'Viol', '30 po', 1, 'Instrumento musical.'),
];

// ---------------------------------------------------------------------------
// Equipment packs
// ---------------------------------------------------------------------------
const PACKS: ItemData[] = [
  item('pack', 'burglars-pack', 'Pacote de Assaltante', "Burglar's Pack", '16 po', 47.5, 'Mochila, bolsa com 1.000 rolamentos, 10 pés de barbante, sino, 5 velas, pé de cabra, martelo, 10 pítons, lanterna coberta, 2 frascos de óleo, 5 dias de rações, estojo de pederneira, odre e 50 pés de corda de cânhamo.'),
  item('pack', 'diplomats-pack', 'Pacote de Diplomata', "Diplomat's Pack", '39 po', 36, 'Baú, 2 estojos de mapas ou pergaminhos, roupas finas, vidro de tinta, caneta-tinteiro, lamparina, 2 frascos de óleo, 5 folhas de papel, frasco de perfume, cera de lacre e sabão.'),
  item('pack', 'dungeoneers-pack', 'Pacote de Explorador', "Dungeoneer's Pack", '12 po', 61.5, 'Mochila, pé de cabra, martelo, 10 pítons, 10 tochas, estojo de pederneira, 10 dias de rações, odre e 50 pés de corda de cânhamo.'),
  item('pack', 'entertainers-pack', 'Pacote de Artista', "Entertainer's Pack", '40 po', 38, 'Mochila, saco de dormir, 2 trajes, 5 velas, 5 dias de rações, odre e kit de disfarce.'),
  item('pack', 'explorers-pack', 'Pacote de Aventureiro', "Explorer's Pack", '10 po', 59, 'Mochila, saco de dormir, kit de refeição, estojo de pederneira, 10 tochas, 10 dias de rações, odre e 50 pés de corda de cânhamo.'),
  item('pack', 'priests-pack', 'Pacote de Sacerdote', "Priest's Pack", '19 po', 24, 'Mochila, cobertor, 10 velas, estojo de pederneira, caixa de esmolas, 2 blocos de incenso, incensário, vestimentas, 2 dias de rações e odre.'),
  item('pack', 'scholars-pack', 'Pacote de Estudioso', "Scholar's Pack", '40 po', 10, 'Mochila, livro de conhecimento, vidro de tinta, caneta-tinteiro, 10 folhas de pergaminho, saquinho de areia e faca pequena.'),
];

// ---------------------------------------------------------------------------
// Mounts
// ---------------------------------------------------------------------------
const MOUNTS: ItemData[] = [
  item('mount', 'riding-horse', 'Cavalo de Montaria', 'Horse, Riding', '75 po', 0, 'Deslocamento 60 pés. Capacidade de carga 480 libras.'),
  item('mount', 'warhorse', 'Cavalo de Guerra', 'Warhorse', '400 po', 0, 'Deslocamento 60 pés. Capacidade de carga 540 libras. Treinado para o combate.'),
  item('mount', 'pony', 'Pônei', 'Pony', '30 po', 0, 'Deslocamento 40 pés. Capacidade de carga 225 libras.'),
  item('mount', 'mule', 'Mula', 'Mule', '8 po', 0, 'Deslocamento 40 pés. Capacidade de carga 420 libras.'),
  item('mount', 'camel', 'Camelo', 'Camel', '50 po', 0, 'Deslocamento 50 pés. Capacidade de carga 480 libras.'),
];

// ---------------------------------------------------------------------------
// Potions & magic items
// ---------------------------------------------------------------------------
const WAND_RECHARGE = 'Recupera 1d6 + 1 cargas gastas diariamente ao amanhecer. Se gastar a última carga, role um d20: com 1, a varinha se desfaz em cinzas.';

const MAGIC: ItemData[] = [
  // Potions
  magic('potion-of-healing', 'Poção de Cura', 'Potion of Healing', 'comum', false, 'Você recupera 2d4 + 2 pontos de vida ao beber esta poção. Beber ou administrar uma poção exige uma ação.', 0.5, 'potion', '50 po'),
  magic('potion-of-greater-healing', 'Poção de Cura Maior', 'Potion of Greater Healing', 'incomum', false, 'Você recupera 4d4 + 4 pontos de vida ao beber esta poção.', 0.5, 'potion'),
  magic('potion-of-superior-healing', 'Poção de Cura Superior', 'Potion of Superior Healing', 'raro', false, 'Você recupera 8d4 + 8 pontos de vida ao beber esta poção.', 0.5, 'potion'),
  magic('potion-of-supreme-healing', 'Poção de Cura Suprema', 'Potion of Supreme Healing', 'muito raro', false, 'Você recupera 10d4 + 20 pontos de vida ao beber esta poção.', 0.5, 'potion'),
  magic('potion-of-climbing', 'Poção de Escalada', 'Potion of Climbing', 'comum', false, 'Por 1 hora, você ganha deslocamento de escalada igual ao seu deslocamento de caminhada e tem vantagem em testes de Força (Atletismo) para escalar.', 0.5, 'potion'),
  magic('potion-of-hill-giant-strength', 'Poção de Força do Gigante da Colina', 'Potion of Hill Giant Strength', 'incomum', false, 'Por 1 hora, seu valor de Força passa a ser 21 (sem efeito se já for igual ou maior).', 0.5, 'potion'),
  magic('potion-of-heroism', 'Poção de Heroísmo', 'Potion of Heroism', 'raro', false, 'Por 1 hora, você ganha 10 pontos de vida temporários e fica sob o efeito da magia bênção (sem concentração).', 0.5, 'potion'),
  magic('potion-of-invisibility', 'Poção de Invisibilidade', 'Potion of Invisibility', 'muito raro', false, 'Você fica invisível por 1 hora, junto com o que estiver vestindo ou carregando. O efeito termina se você atacar ou conjurar uma magia.', 0.5, 'potion'),
  magic('potion-of-water-breathing', 'Poção de Respirar na Água', 'Potion of Water Breathing', 'incomum', false, 'Você pode respirar debaixo d’água por 1 hora.', 0.5, 'potion'),
  magic('potion-of-resistance', 'Poção de Resistência', 'Potion of Resistance', 'incomum', false, 'Por 1 hora, você tem resistência a um tipo de dano determinado pela poção (ácido, frio, fogo, energia, elétrico, necrótico, veneno, psíquico, radiante ou trovejante).', 0.5, 'potion'),
  magic('potion-of-speed', 'Poção de Velocidade', 'Potion of Speed', 'muito raro', false, 'Por 1 minuto, você recebe os efeitos da magia velocidade (sem precisar de concentração).', 0.5, 'potion'),
  magic('potion-of-flying', 'Poção de Voo', 'Potion of Flying', 'muito raro', false, 'Por 1 hora, você ganha deslocamento de voo igual ao seu deslocamento de caminhada e pode pairar. Se estiver no ar quando o efeito terminar, você cai.', 0.5, 'potion'),
  magic('potion-of-poison', 'Poção de Veneno', 'Potion of Poison', 'incomum', false, 'Parece uma poção de cura. Quem a beber sofre 3d6 de dano de veneno e faz uma salvaguarda de Constituição CD 13 ou fica envenenado; enquanto envenenado, sofre 3d6 de dano de veneno no início de cada turno e repete a salvaguarda no fim de cada turno.', 0.5, 'potion'),
  // Spell scroll
  magic('spell-scroll', 'Pergaminho de Magia', 'Spell Scroll', 'comum', false, 'Contém uma única magia. Se a magia estiver na sua lista de classe, você pode lê-la e conjurá-la sem componentes materiais; o pergaminho então se desfaz. Se for de nível superior ao que você conjura, faça um teste da sua habilidade de conjuração (CD 10 + nível da magia). Raridade/CD/ataque por nível: truque e 1º comum (CD 13, +5); 2º incomum (13, +5); 3º incomum (15, +7); 4º raro (15, +7); 5º raro (17, +9); 6º muito raro (17, +9); 7º muito raro (18, +10); 8º muito raro (18, +10); 9º lendário (19, +11).'),
  // Generic +N
  magic('weapon-plus-1', 'Arma +1', 'Weapon, +1', 'incomum', false, 'Você recebe +1 nas jogadas de ataque e de dano feitas com esta arma mágica.', 0),
  magic('weapon-plus-2', 'Arma +2', 'Weapon, +2', 'raro', false, 'Você recebe +2 nas jogadas de ataque e de dano feitas com esta arma mágica.', 0),
  magic('weapon-plus-3', 'Arma +3', 'Weapon, +3', 'muito raro', false, 'Você recebe +3 nas jogadas de ataque e de dano feitas com esta arma mágica.', 0),
  magic('ammunition-plus-1', 'Munição +1', 'Ammunition, +1', 'incomum', false, '+1 nas jogadas de ataque e de dano feitas com esta munição mágica. Ao atingir um alvo, ela deixa de ser mágica.', 0),
  magic('ammunition-plus-2', 'Munição +2', 'Ammunition, +2', 'raro', false, '+2 nas jogadas de ataque e de dano feitas com esta munição mágica. Ao atingir um alvo, ela deixa de ser mágica.', 0),
  magic('ammunition-plus-3', 'Munição +3', 'Ammunition, +3', 'muito raro', false, '+3 nas jogadas de ataque e de dano feitas com esta munição mágica. Ao atingir um alvo, ela deixa de ser mágica.', 0),
  magic('armor-plus-1', 'Armadura +1', 'Armor, +1', 'raro', false, 'Você recebe +1 na CA enquanto estiver usando esta armadura.', 0),
  magic('armor-plus-2', 'Armadura +2', 'Armor, +2', 'muito raro', false, 'Você recebe +2 na CA enquanto estiver usando esta armadura.', 0),
  magic('armor-plus-3', 'Armadura +3', 'Armor, +3', 'lendário', false, 'Você recebe +3 na CA enquanto estiver usando esta armadura.', 0),
  magic('shield-plus-1', 'Escudo +1', 'Shield, +1', 'incomum', false, 'Enquanto empunhar este escudo, você recebe +1 na CA, além do bônus normal do escudo.', 6),
  magic('shield-plus-2', 'Escudo +2', 'Shield, +2', 'raro', false, 'Enquanto empunhar este escudo, você recebe +2 na CA, além do bônus normal do escudo.', 6),
  magic('shield-plus-3', 'Escudo +3', 'Shield, +3', 'muito raro', false, 'Enquanto empunhar este escudo, você recebe +3 na CA, além do bônus normal do escudo.', 6),
  magic('adamantine-armor', 'Armadura de Adamante', 'Adamantine Armor', 'incomum', false, 'Armadura média ou pesada reforçada com adamante. Enquanto a usar, qualquer acerto crítico contra você se torna um acerto normal.', 0),
  magic('mithral-armor', 'Armadura de Mitral', 'Mithral Armor', 'incomum', false, 'Armadura média ou pesada feita de mitral. Se normalmente impõe desvantagem em Furtividade ou exige Força, esta versão não impõe.', 0),
  // Weapons
  magic('flame-tongue', 'Língua Flamejante', 'Flame Tongue', 'raro', true, 'Espada mágica. Com uma ação bônus, pronuncie a palavra de comando para que chamas envolvam a lâmina: ela emite luz plena em 40 pés e penumbra por mais 40 pés, e seus ataques causam 2d6 de dano de fogo extra. As chamas duram até você repetir o comando ou soltar a espada.', 3),
  magic('dagger-of-venom', 'Adaga Venenosa', 'Dagger of Venom', 'raro', false, '+1 nas jogadas de ataque e de dano. Com uma ação, cubra a lâmina de veneno por 1 minuto ou até atingir algo: a criatura atingida faz uma salvaguarda de Constituição CD 15 ou sofre 2d10 de dano de veneno e fica envenenada por 1 minuto. Recarrega ao amanhecer.', 1),
  magic('dragon-slayer', 'Matadora de Dragões', 'Dragon Slayer', 'raro', false, 'Espada mágica: +1 nas jogadas de ataque e de dano. Ao atingir um dragão, causa 3d6 de dano extra do tipo da arma.', 3),
  magic('holy-avenger', 'Vingadora Sagrada', 'Holy Avenger', 'lendário', true, 'Espada mágica (sintonia com um paladino): +3 nas jogadas de ataque e de dano. Contra corruptores e mortos-vivos, causa 2d10 de dano radiante extra. Enquanto a empunhar, emana uma aura de 10 pés (30 pés com paladino de 17º nível) em que você e criaturas amigas têm vantagem em salvaguardas contra magias e outros efeitos mágicos.', 3),
  magic('vorpal-sword', 'Espada Vorpal', 'Vorpal Sword', 'lendário', true, 'Espada cortante: +3 nas jogadas de ataque e de dano, ignora resistência a dano cortante. Com um 20 natural contra uma criatura com cabeça, você a decapita (se ela puder sobreviver sem cabeça ou for imune a dano cortante, sofre 6d8 de dano cortante extra).', 3),
  // Rings
  magic('ring-of-protection', 'Anel de Proteção', 'Ring of Protection', 'raro', true, 'Você recebe +1 na CA e nas salvaguardas enquanto usar este anel.'),
  magic('ring-of-resistance', 'Anel de Resistência', 'Ring of Resistance', 'raro', true, 'Você tem resistência a um tipo de dano enquanto usar este anel; a gema engastada indica o tipo (ácido, frio, fogo, energia, elétrico, necrótico, veneno, psíquico, radiante ou trovejante).'),
  magic('ring-of-invisibility', 'Anel de Invisibilidade', 'Ring of Invisibility', 'lendário', true, 'Com uma ação, você fica invisível, junto com o que estiver vestindo ou carregando, até o anel ser removido, você atacar, conjurar uma magia ou usar uma ação bônus para voltar a ser visível.'),
  magic('ring-of-feather-falling', 'Anel de Queda Suave', 'Ring of Feather Falling', 'raro', true, 'Quando você cai, desce 60 pés por rodada e não sofre dano de queda.'),
  magic('ring-of-jumping', 'Anel do Salto', 'Ring of Jumping', 'incomum', true, 'Com uma ação bônus, você pode conjurar a magia salto em si mesmo à vontade.'),
  magic('ring-of-water-walking', 'Anel de Andar na Água', 'Ring of Water Walking', 'incomum', false, 'Você pode ficar de pé e se mover sobre qualquer superfície líquida como se fosse chão firme.'),
  magic('ring-of-regeneration', 'Anel de Regeneração', 'Ring of Regeneration', 'muito raro', true, 'Enquanto tiver pelo menos 1 PV, você recupera 1d6 pontos de vida a cada 10 minutos. Partes do corpo perdidas regeneram em 1d6 + 1 dias.'),
  // Wondrous items
  magic('bag-of-holding', 'Bolsa Sem Fundo', 'Bag of Holding', 'incomum', false, 'O interior é maior que o exterior (2 pés de diâmetro na boca, 4 pés de profundidade): comporta até 500 libras, sem exceder 64 pés cúbicos, e sempre pesa 15 libras. Retirar um item exige uma ação. Se for sobrecarregada, perfurada ou rasgada, rompe-se e o conteúdo vai para o Plano Astral. Criaturas vivas dentro dela sufocam após 10 minutos. Colocá-la dentro de outro espaço extradimensional destrói ambos e abre um portal para o Plano Astral.', 15),
  magic('handy-haversack', 'Mochila Prática de Heward', "Heward's Handy Haversack", 'raro', false, 'Tem uma bolsa central (até 80 libras, 8 pés cúbicos) e duas laterais (até 20 libras, 2 pés cúbicos cada) e sempre pesa 5 libras. O item que você procura está sempre no topo: recuperá-lo exige uma ação.', 5),
  magic('cloak-of-protection', 'Capa de Proteção', 'Cloak of Protection', 'incomum', true, 'Você recebe +1 na CA e nas salvaguardas enquanto vestir esta capa.', 1),
  magic('cloak-of-elvenkind', 'Manto Élfico', 'Cloak of Elvenkind', 'incomum', true, 'Com o capuz levantado, testes de Sabedoria (Percepção) para vê-lo têm desvantagem e você tem vantagem em testes de Destreza (Furtividade) para se esconder. Levantar ou abaixar o capuz exige uma ação.', 1),
  magic('cloak-of-displacement', 'Capa de Deslocamento', 'Cloak of Displacement', 'raro', true, 'Projeta uma ilusão que o faz parecer estar próximo da sua real posição: jogadas de ataque contra você têm desvantagem. Ao sofrer dano, o efeito para até o início do seu próximo turno; também para se você estiver incapacitado, impedido ou incapaz de se mover.', 1),
  magic('cloak-of-the-manta-ray', 'Manto da Arraia', 'Cloak of the Manta Ray', 'incomum', false, 'Com o capuz levantado, você pode respirar debaixo d’água e tem deslocamento de natação de 60 pés.', 1),
  magic('boots-of-elvenkind', 'Botas Élficas', 'Boots of Elvenkind', 'incomum', false, 'Seus passos não fazem som, independentemente da superfície. Você tem vantagem em testes de Destreza (Furtividade) que dependam de se mover silenciosamente.', 1),
  magic('boots-of-speed', 'Botas da Velocidade', 'Boots of Speed', 'raro', true, 'Com uma ação bônus, bata os calcanhares para dobrar seu deslocamento de caminhada; ataques de oportunidade contra você têm desvantagem. Dura até 10 minutos (não precisam ser consecutivos) por descanso longo.', 1),
  magic('boots-of-striding-and-springing', 'Botas de Caminhar e Saltar', 'Boots of Striding and Springing', 'incomum', true, 'Seu deslocamento de caminhada passa a ser 30 pés, a menos que seja maior, e não é reduzido por carga ou armadura. Você pode saltar o triplo da distância normal.', 1),
  magic('winged-boots', 'Botas Aladas', 'Winged Boots', 'incomum', true, 'Enquanto usar estas botas, você tem deslocamento de voo igual ao seu deslocamento de caminhada e pode voar por até 4 horas (de uma vez ou em períodos menores, cada um consumindo no mínimo 1 minuto). Recuperam 2 horas de voo a cada 12 horas sem uso.', 1),
  magic('slippers-of-spider-climbing', 'Sapatilhas de Escalada Aranha', 'Slippers of Spider Climbing', 'incomum', true, 'Você pode se mover por superfícies verticais e de cabeça para baixo no teto, com as mãos livres, e tem deslocamento de escalada igual ao de caminhada. Não funcionam em superfícies escorregadias, como gelo ou óleo.', 0.5),
  magic('bracers-of-defense', 'Braçadeiras de Defesa', 'Bracers of Defense', 'raro', true, 'Enquanto não usar armadura nem escudo, você recebe +2 na CA.', 1),
  magic('gauntlets-of-ogre-power', 'Manoplas de Força do Ogro', 'Gauntlets of Ogre Power', 'incomum', true, 'Seu valor de Força passa a ser 19 enquanto usar estas manoplas (sem efeito se já for 19 ou maior).', 2),
  magic('belt-of-hill-giant-strength', 'Cinto de Força do Gigante da Colina', 'Belt of Hill Giant Strength', 'raro', true, 'Seu valor de Força passa a ser 21 enquanto usar este cinto (sem efeito se já for igual ou maior).', 1),
  magic('headband-of-intellect', 'Tiara do Intelecto', 'Headband of Intellect', 'incomum', true, 'Seu valor de Inteligência passa a ser 19 enquanto usar esta tiara (sem efeito se já for 19 ou maior).'),
  magic('amulet-of-health', 'Amuleto da Saúde', 'Amulet of Health', 'raro', true, 'Seu valor de Constituição passa a ser 19 enquanto usar este amuleto (sem efeito se já for 19 ou maior).'),
  magic('brooch-of-shielding', 'Broche de Proteção', 'Brooch of Shielding', 'incomum', true, 'Você tem resistência a dano de energia e imunidade ao dano da magia mísseis mágicos.'),
  magic('stone-of-good-luck', 'Pedra da Sorte', 'Stone of Good Luck (Luckstone)', 'incomum', true, 'Enquanto a carregar, você recebe +1 em testes de habilidade e salvaguardas.'),
  magic('goggles-of-night', 'Óculos Noturnos', 'Goggles of Night', 'incomum', false, 'Você tem visão no escuro com alcance de 60 pés. Se já tiver visão no escuro, o alcance aumenta em 60 pés.'),
  magic('helm-of-comprehending-languages', 'Elmo da Compreensão de Idiomas', 'Helm of Comprehending Languages', 'incomum', false, 'Enquanto usar este elmo, você pode usar uma ação para conjurar a magia compreender idiomas à vontade.', 3),
  magic('rope-of-climbing', 'Corda de Escalada', 'Rope of Climbing', 'incomum', false, '60 pés de corda de seda que suportam até 3.000 libras. Com uma ação, ordene que a ponta se mova até 10 pés por turno, se prenda, se solte, se enrole ou forme nós a cada 1 pé (vantagem em escaladas). CA 20, 20 PV; recupera 1 PV a cada 5 minutos.', 3),
  magic('immovable-rod', 'Bastão Imóvel', 'Immovable Rod', 'incomum', false, 'Com uma ação, aperte o botão para fixar o bastão no lugar, desafiando a gravidade. Suporta até 8.000 libras; uma criatura pode movê-lo 10 pés com uma ação e um teste de Força CD 30. Apertar o botão novamente o libera.', 2),
  magic('decanter-of-endless-water', 'Decantador de Água Infinita', 'Decanter of Endless Water', 'incomum', false, 'Com uma ação, destampe e diga a palavra de comando: "riacho" (1 galão de água doce ou salgada), "fonte" (5 galões) ou "gêiser" (30 galões em um jato de 30 pés de comprimento e 1 pé de largura; uma criatura atingida faz salvaguarda de Força CD 13 ou sofre 1d4 de dano contundente e cai derrubada).', 2),
  magic('dust-of-disappearance', 'Pó do Desaparecimento', 'Dust of Disappearance', 'incomum', false, 'Com uma ação, espalhe o pó no ar: você e cada criatura e objeto a até 10 pés ficam invisíveis por 2d4 minutos. O efeito termina para uma criatura que atacar ou conjurar uma magia. Uso único.'),
  magic('lantern-of-revealing', 'Lanterna da Revelação', 'Lantern of Revealing', 'incomum', false, 'Acesa, queima por 6 horas com 1 frasco de óleo, emitindo luz plena em 30 pés e penumbra por mais 30 pés. Criaturas e objetos invisíveis ficam visíveis enquanto estiverem na luz plena.', 2),
  // Wands
  magic('wand-of-magic-missiles', 'Varinha de Mísseis Mágicos', 'Wand of Magic Missiles', 'incomum', false, `Tem 7 cargas. Com uma ação, gaste 1 ou mais cargas para conjurar mísseis mágicos: 1 carga para a versão de 1º nível, +1 nível do espaço por carga adicional. ${WAND_RECHARGE}`, 1),
  magic('wand-of-fireballs', 'Varinha de Bolas de Fogo', 'Wand of Fireballs', 'raro', true, `Sintonia com um conjurador. Tem 7 cargas. Com uma ação, gaste 1 ou mais cargas para conjurar bola de fogo (CD 15): 1 carga para a versão de 3º nível, +1 nível do espaço por carga adicional. ${WAND_RECHARGE}`, 1),
  magic('wand-of-lightning-bolts', 'Varinha de Relâmpagos', 'Wand of Lightning Bolts', 'raro', true, `Sintonia com um conjurador. Tem 7 cargas. Com uma ação, gaste 1 ou mais cargas para conjurar relâmpago (CD 15): 1 carga para a versão de 3º nível, +1 nível do espaço por carga adicional. ${WAND_RECHARGE}`, 1),
  magic('wand-of-web', 'Varinha de Teia', 'Wand of Web', 'incomum', true, `Sintonia com um conjurador. Tem 7 cargas. Com uma ação, gaste 1 carga para conjurar teia (CD 15). ${WAND_RECHARGE}`, 1),
  magic('wand-of-magic-detection', 'Varinha de Detecção de Magia', 'Wand of Magic Detection', 'incomum', false, 'Tem 3 cargas. Com uma ação, gaste 1 carga para conjurar detectar magia. Recupera 1d3 cargas gastas diariamente ao amanhecer.', 1),
];

export const ITEMS: ItemData[] = [
  ...WEAPONS,
  ...ARMOR,
  ...AMMUNITION,
  ...FOCUSES,
  ...GEAR,
  ...TOOLS,
  ...PACKS,
  ...MOUNTS,
  ...MAGIC,
];

export const ITEMS_BY_ID: Record<string, ItemData> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export const ITEM_CATEGORY_NAMES: Record<ItemCategory, string> = {
  weapon: 'Arma',
  armor: 'Armadura',
  shield: 'Escudo',
  gear: 'Equipamento',
  tool: 'Ferramenta',
  pack: 'Pacote',
  potion: 'Poção',
  ammunition: 'Munição',
  focus: 'Foco de conjuração',
  magic: 'Item mágico',
  mount: 'Montaria',
  treasure: 'Tesouro',
};
