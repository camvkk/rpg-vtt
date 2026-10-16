// Races and subraces (PT-BR). Core races from SRD 5.1 (CC-BY-4.0); extra subraces from the PHB.
//
// Subrace semantics (used by `resolveRace`):
// - `speed` and `darkvision` on a subrace are the FINAL values (they replace the race's).
// - `abilityBonuses`, `traits`, `skillProfs` and `skillChoices` are ADDED to the race's.
// - `choiceBonuses` on a subrace replaces the race's when set.
// - `languages` on a subrace is appended to the race's (empty string = nothing extra).
import type { AbilityScores, DamageType, SkillId, TemplateKind, Ability } from '../types.ts';
import type { NamedText, RaceData } from './types.ts';

const DARKVISION_60: NamedText = {
  name: 'Visão no Escuro',
  text: 'Você enxerga na penumbra a até 60 pés como se fosse luz plena, e no escuro como se fosse penumbra. Não distingue cores no escuro, apenas tons de cinza.',
};

const FEY_ANCESTRY: NamedText = {
  name: 'Ancestralidade Feérica',
  text: 'Você tem vantagem em salvaguardas contra ficar enfeitiçado, e magia não pode colocá-lo para dormir.',
};

const ELF_WEAPON_TRAINING: NamedText = {
  name: 'Treinamento Élfico com Armas',
  text: 'Você tem proficiência com espada longa, espada curta, arco curto e arco longo.',
};

/** Draconic ancestries (Dragonborn breath weapon / Draconic Bloodline sorcerer). */
export const DRACONIC_ANCESTRIES: Array<{
  id: string;
  name: string;
  damageType: DamageType;
  area: { kind: TemplateKind; size: number; width?: number };
  save: Ability;
}> = [
  { id: 'black', name: 'Negro', damageType: 'acid', area: { kind: 'line', size: 30, width: 5 }, save: 'dex' },
  { id: 'blue', name: 'Azul', damageType: 'lightning', area: { kind: 'line', size: 30, width: 5 }, save: 'dex' },
  { id: 'brass', name: 'Latão', damageType: 'fire', area: { kind: 'line', size: 30, width: 5 }, save: 'dex' },
  { id: 'bronze', name: 'Bronze', damageType: 'lightning', area: { kind: 'line', size: 30, width: 5 }, save: 'dex' },
  { id: 'copper', name: 'Cobre', damageType: 'acid', area: { kind: 'line', size: 30, width: 5 }, save: 'dex' },
  { id: 'gold', name: 'Ouro', damageType: 'fire', area: { kind: 'cone', size: 15 }, save: 'dex' },
  { id: 'green', name: 'Verde', damageType: 'poison', area: { kind: 'cone', size: 15 }, save: 'con' },
  { id: 'red', name: 'Vermelho', damageType: 'fire', area: { kind: 'cone', size: 15 }, save: 'dex' },
  { id: 'silver', name: 'Prata', damageType: 'cold', area: { kind: 'cone', size: 15 }, save: 'con' },
  { id: 'white', name: 'Branco', damageType: 'cold', area: { kind: 'cone', size: 15 }, save: 'con' },
];

/** Dragonborn breath weapon damage dice by character level. */
export function breathWeaponDice(level: number): string {
  if (level >= 16) return '5d6';
  if (level >= 11) return '4d6';
  if (level >= 6) return '3d6';
  return '2d6';
}

export const RACES: RaceData[] = [
  // -------------------------------------------------------------------------
  {
    id: 'dwarf',
    name: 'Anão',
    description:
      'Ousados e resistentes, os anões são conhecidos como hábeis guerreiros, mineradores e trabalhadores da pedra e do metal. Vivem mais de 350 anos e valorizam o clã, a tradição e a honra.',
    size: 'medium',
    speed: 25,
    darkvision: 60,
    abilityBonuses: { con: 2 },
    choiceBonuses: null,
    traits: [
      {
        name: 'Deslocamento',
        text: 'Seu deslocamento base de caminhada é 25 pés. Seu deslocamento não é reduzido por usar armadura pesada.',
      },
      DARKVISION_60,
      {
        name: 'Resiliência Anã',
        text: 'Você tem vantagem em salvaguardas contra veneno e resistência a dano de veneno.',
      },
      {
        name: 'Treinamento Anão em Combate',
        text: 'Você tem proficiência com machado de batalha, machadinha, martelo leve e martelo de guerra.',
      },
      {
        name: 'Proficiência com Ferramentas',
        text: 'Você tem proficiência com um tipo de ferramenta de artesão à sua escolha: ferramentas de ferreiro, suprimentos de cervejeiro ou ferramentas de pedreiro.',
      },
      {
        name: 'Especialização em Rochas',
        text: 'Ao fazer um teste de Inteligência (História) relacionado à origem de um trabalho em pedra, você é considerado proficiente e adiciona o dobro do seu bônus de proficiência ao teste.',
      },
    ],
    languages: 'Comum e Anão',
    skillProfs: [],
    skillChoices: 0,
    subraces: [
      {
        id: 'hill-dwarf',
        name: 'Anão da Colina',
        description: 'Anões de sentidos aguçados, intuição profunda e resiliência notável.',
        speed: 25,
        darkvision: 60,
        abilityBonuses: { wis: 1 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Robustez Anã',
            text: 'Seu máximo de pontos de vida aumenta em 1, e aumenta em 1 novamente a cada nível que você ganhar.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
      {
        id: 'mountain-dwarf',
        name: 'Anão da Montanha',
        description: 'Anões fortes e resistentes, acostumados a uma vida difícil em terrenos acidentados.',
        speed: 25,
        darkvision: 60,
        abilityBonuses: { str: 2 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Treinamento Anão com Armaduras',
            text: 'Você tem proficiência com armaduras leves e médias.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'elf',
    name: 'Elfo',
    description:
      'Um povo mágico de graça sobrenatural, que vive no mundo sem pertencer inteiramente a ele. Elfos podem viver mais de 700 anos e apreciam a natureza, a magia, a arte e a música.',
    size: 'medium',
    speed: 30,
    darkvision: 60,
    abilityBonuses: { dex: 2 },
    choiceBonuses: null,
    traits: [
      DARKVISION_60,
      { name: 'Sentidos Aguçados', text: 'Você tem proficiência na perícia Percepção.' },
      FEY_ANCESTRY,
      {
        name: 'Transe',
        text: 'Elfos não precisam dormir. Em vez disso, meditam profundamente, semiconscientes, por 4 horas por dia, obtendo o mesmo benefício que um humano obtém com 8 horas de sono.',
      },
    ],
    languages: 'Comum e Élfico',
    skillProfs: ['perception'],
    skillChoices: 0,
    subraces: [
      {
        id: 'high-elf',
        name: 'Alto Elfo',
        description: 'Elfos de mente afiada e com domínio de ao menos o básico da magia arcana.',
        speed: 30,
        darkvision: 60,
        abilityBonuses: { int: 1 },
        choiceBonuses: null,
        traits: [
          ELF_WEAPON_TRAINING,
          {
            name: 'Truque',
            text: 'Você conhece um truque à sua escolha da lista de magias de mago. Inteligência é sua habilidade de conjuração para ele.',
          },
          {
            name: 'Idioma Adicional',
            text: 'Você pode falar, ler e escrever um idioma adicional à sua escolha.',
          },
        ],
        languages: 'um idioma adicional à sua escolha',
        skillProfs: [],
        skillChoices: 0,
      },
      {
        id: 'wood-elf',
        name: 'Elfo da Floresta',
        description: 'Elfos de sentidos aguçados e intuição apurada, ágeis e furtivos em suas florestas natais.',
        speed: 35,
        darkvision: 60,
        abilityBonuses: { wis: 1 },
        choiceBonuses: null,
        traits: [
          ELF_WEAPON_TRAINING,
          { name: 'Pés Ligeiros', text: 'Seu deslocamento base de caminhada aumenta para 35 pés.' },
          {
            name: 'Máscara da Natureza',
            text: 'Você pode tentar se esconder mesmo quando estiver apenas levemente obscurecido por folhagem, chuva forte, neve caindo, névoa ou outro fenômeno natural.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
      {
        id: 'drow',
        name: 'Elfo Negro (Drow)',
        description:
          'Descendentes de elfos banidos para o Subterrâneo, os drow se adaptaram à escuridão e são temidos pela crueldade de sua sociedade.',
        speed: 30,
        darkvision: 120,
        abilityBonuses: { cha: 1 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Visão no Escuro Superior',
            text: 'Sua visão no escuro tem alcance de 120 pés, em vez de 60 pés.',
          },
          {
            name: 'Sensibilidade à Luz Solar',
            text: 'Você tem desvantagem em jogadas de ataque e em testes de Sabedoria (Percepção) baseados em visão quando você, o alvo do ataque ou o que tenta perceber estiver sob luz solar direta.',
          },
          {
            name: 'Magia Drow',
            text: 'Você conhece o truque globos de luz. No 3º nível, pode conjurar fogo das fadas uma vez por descanso longo. No 5º nível, pode conjurar escuridão uma vez por descanso longo. Carisma é sua habilidade de conjuração para essas magias.',
          },
          {
            name: 'Treinamento Drow com Armas',
            text: 'Você tem proficiência com rapieiras, espadas curtas e bestas de mão.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'halfling',
    name: 'Halfling',
    description:
      'Pequenos e práticos, os halflings valorizam o lar, a boa comida e a companhia dos amigos. Sua sorte e coragem são lendárias para um povo do seu tamanho.',
    size: 'small',
    speed: 25,
    darkvision: 0,
    abilityBonuses: { dex: 2 },
    choiceBonuses: null,
    traits: [
      {
        name: 'Sortudo',
        text: 'Quando obtiver um 1 natural em uma jogada de ataque, teste de habilidade ou salvaguarda, você pode rolar o dado novamente e deve usar o novo resultado.',
      },
      { name: 'Bravura', text: 'Você tem vantagem em salvaguardas contra ficar amedrontado.' },
      {
        name: 'Agilidade Halfling',
        text: 'Você pode se mover através do espaço de qualquer criatura que seja de um tamanho maior que o seu.',
      },
    ],
    languages: 'Comum e Halfling',
    skillProfs: [],
    skillChoices: 0,
    subraces: [
      {
        id: 'lightfoot-halfling',
        name: 'Pés-Leves',
        description: 'Halflings afáveis e discretos, com uma tendência natural a passar despercebidos.',
        speed: 25,
        darkvision: 0,
        abilityBonuses: { cha: 1 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Furtividade Natural',
            text: 'Você pode tentar se esconder mesmo quando estiver obscurecido apenas por uma criatura que seja pelo menos um tamanho maior que você.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
      {
        id: 'stout-halfling',
        name: 'Robusto',
        description: 'Halflings mais resistentes que os demais, dizem que com um pouco de sangue anão.',
        speed: 25,
        darkvision: 0,
        abilityBonuses: { con: 1 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Resiliência dos Robustos',
            text: 'Você tem vantagem em salvaguardas contra veneno e resistência a dano de veneno.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'human',
    name: 'Humano',
    description:
      'Os mais jovens e adaptáveis entre as raças comuns, os humanos são ambiciosos, diversos e inovadores. Escolha a versão padrão (+1 em todos os atributos) ou a variante humana.',
    size: 'medium',
    speed: 30,
    darkvision: 0,
    // Ability bonuses come from the chosen version (subrace) below.
    abilityBonuses: {},
    choiceBonuses: null,
    traits: [
      {
        name: 'Idiomas',
        text: 'Você fala, lê e escreve Comum e um idioma adicional à sua escolha.',
      },
    ],
    languages: 'Comum e um idioma adicional à sua escolha',
    skillProfs: [],
    skillChoices: 0,
    subraces: [
      {
        id: 'human-standard',
        name: 'Humano (padrão)',
        description: 'Versatilidade pura: um pouco melhor em tudo.',
        speed: 30,
        darkvision: 0,
        abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
        choiceBonuses: null,
        traits: [{ name: 'Aumento no Valor de Habilidade', text: 'Todos os seus valores de habilidade aumentam em 1.' }],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
      {
        id: 'human-variant',
        name: 'Humano Variante',
        description: 'Regra opcional: troca o +1 em todos os atributos por talento, perícia e dois aumentos à escolha.',
        speed: 30,
        darkvision: 0,
        abilityBonuses: {},
        choiceBonuses: { count: 2, amount: 1 },
        traits: [
          { name: 'Aumento no Valor de Habilidade', text: 'Dois valores de habilidade diferentes à sua escolha aumentam em 1.' },
          { name: 'Perícia', text: 'Você ganha proficiência em uma perícia à sua escolha.' },
          { name: 'Talento', text: 'Você ganha um talento à sua escolha.' },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 1,
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'dragonborn',
    name: 'Draconato',
    description:
      'Nascidos de dragões, os draconatos caminham orgulhosamente por um mundo que os recebe com temor. Valorizam o clã, a honra e a autossuficiência acima de tudo.',
    size: 'medium',
    speed: 30,
    darkvision: 0,
    abilityBonuses: { str: 2, cha: 1 },
    choiceBonuses: null,
    traits: [
      {
        name: 'Ancestralidade Dracônica',
        text:
          'Escolha um tipo de dragão; ele determina o tipo de dano e a área da sua Arma de Sopro e sua resistência. ' +
          'Azul: elétrico, linha de 5 × 30 pés (DES). Branco: frio, cone de 15 pés (CON). Bronze: elétrico, linha de 5 × 30 pés (DES). ' +
          'Cobre: ácido, linha de 5 × 30 pés (DES). Latão: fogo, linha de 5 × 30 pés (DES). Negro: ácido, linha de 5 × 30 pés (DES). ' +
          'Ouro: fogo, cone de 15 pés (DES). Prata: frio, cone de 15 pés (CON). Verde: veneno, cone de 15 pés (CON). Vermelho: fogo, cone de 15 pés (DES).',
      },
      {
        name: 'Arma de Sopro',
        text:
          'Você pode usar sua ação para exalar energia destrutiva na área da sua ancestralidade. Cada criatura na área faz uma salvaguarda ' +
          '(CD = 8 + mod. de Constituição + bônus de proficiência), sofrendo 2d6 de dano se falhar ou metade se passar. O dano aumenta para ' +
          '3d6 no 6º nível, 4d6 no 11º e 5d6 no 16º. Após o uso, só pode usá-la novamente após um descanso curto ou longo.',
      },
      {
        name: 'Resistência a Dano',
        text: 'Você tem resistência ao tipo de dano associado à sua ancestralidade dracônica.',
      },
    ],
    languages: 'Comum e Dracônico',
    skillProfs: [],
    skillChoices: 0,
    subraces: [],
  },
  // -------------------------------------------------------------------------
  {
    id: 'gnome',
    name: 'Gnomo',
    description:
      'Curiosos, entusiasmados e inventivos, os gnomos vivem séculos e abraçam a vida com energia contagiante, seja como inventores, ilusionistas ou exploradores.',
    size: 'small',
    speed: 25,
    darkvision: 60,
    abilityBonuses: { int: 2 },
    choiceBonuses: null,
    traits: [
      DARKVISION_60,
      {
        name: 'Esperteza Gnômica',
        text: 'Você tem vantagem em todas as salvaguardas de Inteligência, Sabedoria e Carisma contra magia.',
      },
    ],
    languages: 'Comum e Gnômico',
    skillProfs: [],
    skillChoices: 0,
    subraces: [
      {
        id: 'forest-gnome',
        name: 'Gnomo da Floresta',
        description: 'Gnomos reclusos com talento natural para ilusões e afinidade com pequenos animais.',
        speed: 25,
        darkvision: 60,
        abilityBonuses: { dex: 1 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Ilusionista Nato',
            text: 'Você conhece o truque ilusão menor. Inteligência é sua habilidade de conjuração para ele.',
          },
          {
            name: 'Falar com Bestas Pequenas',
            text: 'Por meio de sons e gestos, você pode comunicar ideias simples a bestas Pequenas ou menores.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
      {
        id: 'rock-gnome',
        name: 'Gnomo das Rochas',
        description: 'Gnomos engenhosos e resistentes, famosos por suas invenções mecânicas.',
        speed: 25,
        darkvision: 60,
        abilityBonuses: { con: 1 },
        choiceBonuses: null,
        traits: [
          {
            name: 'Conhecimento de Artífice',
            text: 'Ao fazer um teste de Inteligência (História) relacionado a itens mágicos, objetos alquímicos ou dispositivos tecnológicos, você adiciona o dobro do seu bônus de proficiência.',
          },
          {
            name: 'Engenhoqueiro',
            text:
              'Você tem proficiência com ferramentas de artesão (ferramentas de funileiro). Com elas, gastando 1 hora e 10 po em materiais, pode construir um ' +
              'dispositivo Miúdo (CA 5, 1 PV): brinquedo mecânico, isqueiro ou caixa de música. Ele funciona por 24 horas e você pode manter até três ativos.',
          },
        ],
        languages: '',
        skillProfs: [],
        skillChoices: 0,
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    id: 'half-elf',
    name: 'Meio-Elfo',
    description:
      'Caminhando entre dois mundos sem pertencer totalmente a nenhum, os meio-elfos combinam a curiosidade e a ambição humanas com os sentidos refinados e o amor élfico pela natureza e pela arte.',
    size: 'medium',
    speed: 30,
    darkvision: 60,
    abilityBonuses: { cha: 2 },
    choiceBonuses: { count: 2, amount: 1 },
    traits: [
      {
        name: 'Aumento no Valor de Habilidade',
        text: 'Seu Carisma aumenta em 2 e dois outros valores de habilidade à sua escolha aumentam em 1.',
      },
      DARKVISION_60,
      FEY_ANCESTRY,
      { name: 'Versatilidade em Perícia', text: 'Você ganha proficiência em duas perícias à sua escolha.' },
    ],
    languages: 'Comum, Élfico e um idioma adicional à sua escolha',
    skillProfs: [],
    skillChoices: 2,
    subraces: [],
  },
  // -------------------------------------------------------------------------
  {
    id: 'half-orc',
    name: 'Meio-Orc',
    description:
      'Marcados pela herança orc, os meio-orcs são fortes, resistentes e intensos. Suas emoções são vívidas e muitos buscam provar seu valor em um mundo que os julga pela aparência.',
    size: 'medium',
    speed: 30,
    darkvision: 60,
    abilityBonuses: { str: 2, con: 1 },
    choiceBonuses: null,
    traits: [
      DARKVISION_60,
      { name: 'Ameaçador', text: 'Você tem proficiência na perícia Intimidação.' },
      {
        name: 'Resistência Implacável',
        text: 'Quando for reduzido a 0 pontos de vida mas não morrer imediatamente, você pode ficar com 1 ponto de vida. Não pode usar esta característica novamente até terminar um descanso longo.',
      },
      {
        name: 'Ataques Selvagens',
        text: 'Quando conseguir um acerto crítico com um ataque corpo a corpo com arma, você pode rolar um dos dados de dano da arma mais uma vez e adicioná-lo ao dano extra do crítico.',
      },
    ],
    languages: 'Comum e Orc',
    skillProfs: ['intimidation'],
    skillChoices: 0,
    subraces: [],
  },
  // -------------------------------------------------------------------------
  {
    id: 'tiefling',
    name: 'Tiefling',
    description:
      'Marcados por uma linhagem infernal, os tieflings carregam chifres, caudas e olhos sem pupilas. Enfrentam desconfiança por onde passam, mas possuem um poder arcano inato.',
    size: 'medium',
    speed: 30,
    darkvision: 60,
    abilityBonuses: { int: 1, cha: 2 },
    choiceBonuses: null,
    traits: [
      DARKVISION_60,
      { name: 'Resistência Infernal', text: 'Você tem resistência a dano de fogo.' },
      {
        name: 'Legado Infernal',
        text: 'Você conhece o truque taumaturgia. No 3º nível, pode conjurar repreensão infernal como uma magia de 2º nível uma vez por descanso longo. No 5º nível, pode conjurar escuridão uma vez por descanso longo. Carisma é sua habilidade de conjuração para essas magias.',
      },
    ],
    languages: 'Comum e Infernal',
    skillProfs: [],
    skillChoices: 0,
    subraces: [],
  },
];

export const RACES_BY_ID: Record<string, RaceData> = Object.fromEntries(RACES.map((r) => [r.id, r]));

export interface ResolvedRace {
  id: string;
  subraceId: string | null;
  /** "Anão da Colina" or "Meio-Elfo". */
  name: string;
  size: RaceData['size'];
  speed: number;
  darkvision: number;
  abilityBonuses: Partial<AbilityScores>;
  choiceBonuses: { count: number; amount: number } | null;
  traits: NamedText[];
  languages: string;
  skillProfs: SkillId[];
  skillChoices: number;
}

/** Merge a race with one of its subraces following the semantics documented at the top of this file. */
export function resolveRace(raceId: string, subraceId?: string | null): ResolvedRace | null {
  const race = RACES_BY_ID[raceId];
  if (!race) return null;
  const sub = subraceId ? race.subraces.find((s) => s.id === subraceId) ?? null : null;
  const bonuses: Partial<AbilityScores> = { ...race.abilityBonuses };
  if (sub) {
    for (const [k, v] of Object.entries(sub.abilityBonuses) as Array<[keyof AbilityScores, number]>) {
      bonuses[k] = (bonuses[k] ?? 0) + v;
    }
  }
  return {
    id: race.id,
    subraceId: sub?.id ?? null,
    name: sub ? sub.name : race.name,
    size: race.size,
    speed: sub ? sub.speed : race.speed,
    darkvision: sub ? sub.darkvision : race.darkvision,
    abilityBonuses: bonuses,
    choiceBonuses: sub?.choiceBonuses ?? race.choiceBonuses,
    traits: sub ? [...race.traits, ...sub.traits] : race.traits.slice(),
    languages: sub?.languages ? `${race.languages}; ${sub.languages}` : race.languages,
    skillProfs: sub ? [...race.skillProfs, ...sub.skillProfs] : race.skillProfs.slice(),
    skillChoices: race.skillChoices + (sub?.skillChoices ?? 0),
  };
}
