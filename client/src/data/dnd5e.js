// D&D 5e SRD Data for Character Creation

// Races with stat bonuses and traits
export const RACES = [
  {
    name: 'Humano',
    statBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    traits: [
      'Versatilidade: +1 em todos os atributos',
      'Perícia Adicional: Ganhe proficiência em uma perícia à sua escolha',
      'Talento Adicional: Ganhe um talento adicional no 1º nível'
    ],
    description: 'Adaptáveis e ambiciosos, os humanos são a raça mais diversa e numerosa.',
    icon: '👤'
  },
  {
    name: 'Elfo',
    statBonuses: { dex: 2 },
    traits: [
      'Visão no Escuro: 60 pés',
      'Sentidos Aguçados: Proficiência em Percepção',
      'Ancestralidade Feérica: Vantagem em saves contra charme e imune ao sono',
      'Transe: 4 horas de meditação em vez de 8 horas de sono'
    ],
    description: 'Graciosos e de longa vida, os elfos são mestres da magia e das artes.',
    icon: '🧝'
  },
  {
    name: 'Anão',
    statBonuses: { con: 2 },
    traits: [
      'Visão no Escuro: 60 pés',
      'Resistência Anã: Vantagem em saves contra veneno',
      'Treinamento em Combate Anão: Proficiência com machados de guerra, martelos leves, martelos de guerra e machadinhas',
      'Conhecimento de Pedra: Dobra o bônus de proficiência em testes relacionados à pedra'
    ],
    description: 'Robustos e resilientes, os anões são mestres artesãos que habitam montanhas e fortalezas.',
    icon: '🧙‍♂️'
  },
  {
    name: 'Halfling',
    statBonuses: { dex: 2 },
    traits: [
      'Sortudo: Pode rolar novamente um 1 natural',
      'Bravo: Vantagem em saves contra medo',
      'Agilidade Halfling: Pode mover através de criaturas de tamanho Médio ou maior',
      'Tamanho Pequeno: Vantagem em testes de Furtividade'
    ],
    description: 'Pequenos mas corajosos, os halflings são conhecidos por sua sorte e hospitalidade.',
    icon: '🧚'
  },
  {
    name: 'Meio-Orc',
    statBonuses: { str: 2, con: 1 },
    traits: [
      'Visão no Escuro: 60 pés',
      'Resistência Implacável: Quando chega a 0 HP, pode ficar com 1 HP uma vez por descanso longo',
      'Ataques Selvagens: Dados de dano extras em acertos críticos',
      'Intimidação: Proficiência em Intimidação'
    ],
    description: 'Nascidos de duas culturas, os meio-orcs combinam força orcídea com versatilidade humana.',
    icon: '💚'
  },
  {
    name: 'Meio-Elfo',
    statBonuses: { cha: 2 }, // +1 em dois outros atributos à escolha
    traits: [
      'Visão no Escuro: 60 pés',
      'Ancestralidade Feérica: Vantagem em saves contra charme e imune ao sono',
      'Versatilidade de Perícia: Duas perícias à escolha',
      'Atributos Versáteis: +1 em dois atributos diferentes à escolha'
    ],
    description: 'Caminhando entre dois mundos, os meio-elfos combinam o melhor das heranças élfica e humana.',
    icon: '🌟'
  },
  {
    name: 'Gnomo',
    statBonuses: { int: 2 },
    traits: [
      'Visão no Escuro: 60 pés',
      'Esperteza Gnômica: Vantagem em saves de Int, Wis e Cha contra magia',
      'Tamanho Pequeno: Vantagem em testes de Furtividade',
      'Conhecimento de Pedra: Dobra o bônus de proficiência para História sobre itens mágicos, alquímicos e tecnológicos'
    ],
    description: 'Pequenos mas brilhantes, os gnomos são inventores curiosos com afinidade natural pela magia.',
    icon: '🎩'
  },
  {
    name: 'Tiefling',
    statBonuses: { cha: 2, int: 1 },
    traits: [
      'Visão no Escuro: 60 pés',
      'Resistência Infernal: Resistência a dano de fogo',
      'Legado Infernal: Conhece truque Taumaturgia, magias Repreender e Escuridão',
      'Idiomas: Comum e Infernal'
    ],
    description: 'Marcados por sua herança infernal, os tieflings enfrentam preconceito mas possuem poder arcano inato.',
    icon: '😈'
  },
  {
    name: 'Draconato',
    statBonuses: { str: 2, cha: 1 },
    traits: [
      'Ancestralidade Dracônica: Resistência a um tipo de dano baseado na cor do dragão',
      'Sopro Devastador: Arma de sopro baseada na ancestralidade dracônica',
      'Idiomas: Comum e Dracônico',
      'Aparência Dracônica: Escamas, garras e características reptilianas'
    ],
    description: 'Descendentes de dragões, os draconatos carregam o poder e orgulho de sua linhagem ancestral.',
    icon: '🐲'
  }
];

// Classes with hit dice, saving throws, skills, starting equipment
export const CLASSES = [
  {
    name: 'Bárbaro',
    hitDie: 'd12',
    primaryStats: ['Força', 'Constituição'],
    savingThrows: ['str', 'con'],
    skillsAvailable: 2,
    classSkills: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    startingEquipment: {
      choiceA: [
        'Machado Grande ou qualquer arma corpo a corpo',
        '2 Machadinhas ou qualquer arma simples',
        'Kit de Explorador',
        '4 Dardos'
      ],
      choiceB: [
        'Armadura de Couro',
        'Escudo',
        'Espada Longa',
        'Kit de Aventureiro',
        '2 Machadinhas'
      ]
    },
    level1Features: [
      'Fúria: +2 dano corpo a corpo, vantagem em testes de Força, resistência a dano físico',
      'Defesa sem Armadura: CA = 10 + mod DEX + mod CON'
    ],
    description: 'Guerreiro primitivo movido pela fúria interior.',
    icon: '🪓'
  },
  {
    name: 'Bardo',
    hitDie: 'd8',
    primaryStats: ['Carisma', 'Destreza'],
    savingThrows: ['dex', 'cha'],
    skillsAvailable: 3,
    classSkills: ['deception', 'history', 'investigation', 'persuasion', 'performance', 'sleightOfHand'],
    expertise: 2, // Gets expertise in 2 skills
    startingEquipment: {
      choiceA: [
        'Rapieira ou Espada Longa',
        'Kit de Diplomata ou Kit de Artista',
        'Alaúde ou qualquer instrumento',
        'Armadura de Couro',
        'Adaga',
        'Dardos (10)'
      ],
      choiceB: [
        'Besta Leve e 20 virotes',
        'Kit de Entretenimento',
        'Corda (50 pés)',
        'Armadura de Couro Batido'
      ]
    },
    level1Features: [
      'Conjuração: Conhece 2 truques e 4 magias de 1º nível',
      'Inspiração Bárdica: 3 usos por descanso curto (d6)'
    ],
    description: 'Mestre das palavras, música e magia, inspirando aliados.',
    icon: '🎵'
  },
  {
    name: 'Clérigo',
    hitDie: 'd8',
    primaryStats: ['Sabedoria', 'Constituição'],
    savingThrows: ['wis', 'cha'],
    skillsAvailable: 2,
    classSkills: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    startingEquipment: {
      choiceA: [
        'Cota de Malha ou Armadura de Couro',
        'Escudo',
        'Maça ou Martelo de Guerra',
        'Besta Leve e 20 virotes ou qualquer arma simples',
        'Kit de Sacerdote',
        'Símbolo Sagrado'
      ],
      choiceB: [
        'Armadura de Escamas',
        'Escudo',
        'Martelo de Guerra',
        'Kit de Explorador',
        'Símbolo Sagrado'
      ]
    },
    level1Features: [
      'Conjuração: 3 truques e 2 magias de 1º nível',
      'Domínio Divino: Escolha um domínio que concede magias e habilidades extras'
    ],
    description: 'Campeão divino que canaliza o poder dos deuses.',
    icon: '⛪'
  },
  {
    name: 'Druida',
    hitDie: 'd8',
    primaryStats: ['Sabedoria', 'Constituição'],
    savingThrows: ['int', 'wis'],
    skillsAvailable: 2,
    classSkills: ['arcana', 'animalHandling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'],
    startingEquipment: {
      choiceA: [
        'Escudo de Madeira ou qualquer escudo simples',
        'Cimitarra ou qualquer arma corpo a corpo simples',
        'Armadura de Couro',
        'Kit de Explorador',
        'Armadura de Couro Batido',
        'Foco Druídico'
      ],
      choiceB: [
        'Armadura de Couro Batido',
        'Cimitarra',
        'Dardos (10)',
        'Kit de Herbalismo'
      ]
    },
    level1Features: [
      'Druidismo: Conhece Druídico, linguagem secreta dos druidas',
      'Conjuração: 2 truques e 2 magias de 1º nível'
    ],
    description: 'Guardião da natureza que pode se transformar em animais.',
    icon: '🌿'
  },
  {
    name: 'Guerreiro',
    hitDie: 'd10',
    primaryStats: ['Força', 'Destreza'],
    savingThrows: ['str', 'con'],
    skillsAvailable: 2,
    classSkills: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'],
    startingEquipment: {
      choiceA: [
        'Cota de Malha ou Armadura de Couro e Arco Longo com 20 flechas',
        'Escudo',
        'Espada Longa ou qualquer arma corpo a corpo',
        'Besta Leve e 20 virotes ou 2 Machadinhas',
        'Kit de Soldado'
      ],
      choiceB: [
        'Armadura de Escamas',
        'Escudo',
        'Espada Longa',
        'Kit de Explorador'
      ]
    },
    level1Features: [
      'Estilo de Luta: Escolha Arqueirismo, Defesa, Duelismo ou Grande Arma',
      'Retomar Fôlego: Recupera HP = 1d10 + nível uma vez por descanso curto'
    ],
    description: 'Mestre das armas e táticas de combate.',
    icon: '⚔️'
  },
  {
    name: 'Mago',
    hitDie: 'd6',
    primaryStats: ['Inteligência', 'Constituição'],
    savingThrows: ['int', 'wis'],
    skillsAvailable: 2,
    classSkills: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'],
    startingEquipment: {
      choiceA: [
        'Bordão ou Adaga',
        'Bolsa de Componentes ou Foco Arcano',
        'Kit de Acadêmico ou Kit de Explorador',
        'Livro de Magias',
        'Armadura de Couro',
        'Dardos (10)'
      ],
      choiceB: [
        'Besta Leve e 20 virotes',
        'Kit de Acadêmico',
        'Pergaminhos de Magia (2)',
        '2 Adagas'
      ]
    },
    level1Features: [
      'Conjuração: 3 truques e 6 magias de 1º nível no livro de magias',
      'Recuperação Arcana: Recupera espaços de magia gastos uma vez por dia'
    ],
    description: 'Estudioso da magia arcana e seus mistérios.',
    icon: '🧙‍♂️'
  },
  {
    name: 'Monge',
    hitDie: 'd8',
    primaryStats: ['Destreza', 'Sabedoria'],
    savingThrows: ['str', 'dex'],
    skillsAvailable: 2,
    classSkills: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    startingEquipment: {
      choiceA: [
        'Espada Curta ou qualquer arma simples corpo a corpo',
        'Kit de Aventureiro ou Kit de Explorador',
        'Dardos (10)'
      ],
      choiceB: [
        'Armadura de Couro',
        'Kit de Aventureiro',
        'Adaga',
        'Dardos (10)'
      ]
    },
    level1Features: [
      'Defesa sem Armadura: CA = 10 + mod DEX + mod WIS',
      'Artes Marciais: Ataques desarmados causam 1d4 de dano'
    ],
    description: 'Guerreiro místico que canaliza energia interior.',
    icon: '🥋'
  },
  {
    name: 'Paladino',
    hitDie: 'd10',
    primaryStats: ['Força', 'Carisma'],
    savingThrows: ['wis', 'cha'],
    skillsAvailable: 2,
    classSkills: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    startingEquipment: {
      choiceA: [
        'Cota de Malha',
        'Escudo',
        'Espada Longa ou qualquer arma corpo a corpo',
        'Dardos (5) ou qualquer arma simples corpo a corpo',
        'Kit de Sacerdote',
        'Símbolo Sagrado'
      ],
      choiceB: [
        'Armadura de Escamas',
        'Escudo',
        'Martelo de Guerra',
        'Kit de Explorador'
      ]
    },
    level1Features: [
      'Sentido Divino: Detecta celestiais, corruptores e mortos-vivos em 60 pés',
      'Cura pelas Mãos: Conjunto de HP que pode curar = nível × 5'
    ],
    description: 'Guerreiro sagrado jurado a uma causa divina.',
    icon: '🛡️'
  },
  {
    name: 'Patrulheiro',
    hitDie: 'd10',
    primaryStats: ['Destreza', 'Sabedoria'],
    savingThrows: ['str', 'dex'],
    skillsAvailable: 3,
    classSkills: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'],
    startingEquipment: {
      choiceA: [
        'Armadura de Escamas ou Armadura de Couro',
        'Escudo',
        'Espada Curta ou qualquer arma simples corpo a corpo',
        'Arco Longo e Aljava com 20 flechas',
        'Kit de Explorador'
      ],
      choiceB: [
        'Armadura de Couro Batido',
        'Espadas Curtas (2)',
        'Kit de Aventureiro',
        'Arco Longo e 20 flechas'
      ]
    },
    level1Features: [
      'Inimigo Favorito: Vantagem em testes de Sabedoria para rastrear um tipo de criatura',
      'Explorador Natural: Dobra o bônus de proficiência em testes de Sabedoria em terreno favorito'
    ],
    description: 'Guerreiro das terras selvagens, caçador e rastreador.',
    icon: '🏹'
  },
  {
    name: 'Ladino',
    hitDie: 'd8',
    primaryStats: ['Destreza', 'Inteligência'],
    savingThrows: ['dex', 'int'],
    skillsAvailable: 4,
    classSkills: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleightOfHand', 'stealth'],
    expertise: 2, // Gets expertise in 2 skills
    startingEquipment: {
      choiceA: [
        'Rapieira ou Espada Curta',
        'Arco Curto e Aljava com 20 flechas',
        'Kit de Ladrão',
        'Armadura de Couro',
        'Adagas (2)',
        'Ferramentas de Ladrão'
      ],
      choiceB: [
        'Espada Curta',
        'Kit de Aventureiro',
        'Armadura de Couro Batido',
        'Adaga'
      ]
    },
    level1Features: [
      'Expertise: Dobra o bônus de proficiência em duas perícias',
      'Ataque Furtivo: +1d6 de dano com vantagem ou aliado adjacente',
      'Gíria de Ladrão: Linguagem secreta dos ladinos'
    ],
    description: 'Especialista em furtividade, truques e ataques precisos.',
    icon: '🗡️'
  },
  {
    name: 'Feiticeiro',
    hitDie: 'd6',
    primaryStats: ['Carisma', 'Constituição'],
    savingThrows: ['con', 'cha'],
    skillsAvailable: 2,
    classSkills: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    startingEquipment: {
      choiceA: [
        'Besta Leve e 20 virotes ou qualquer arma simples',
        'Bolsa de Componentes ou Foco Arcano',
        'Kit de Aventureiro ou Kit de Explorador',
        'Adagas (2)'
      ],
      choiceB: [
        'Bordão',
        'Kit de Aventureiro',
        'Adaga',
        'Dardos (10)'
      ]
    },
    level1Features: [
      'Conjuração: 4 truques e 2 magias de 1º nível conhecidas',
      'Origem Sorcerosa: Escolha a origem de seu poder mágico (Dracônica, Magia Selvagem, etc.)'
    ],
    description: 'Portador de magia inata oriunda de origem sobrenatural.',
    icon: '✨'
  },
  {
    name: 'Bruxo',
    hitDie: 'd8',
    primaryStats: ['Carisma', 'Constituição'],
    savingThrows: ['wis', 'cha'],
    skillsAvailable: 2,
    classSkills: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'],
    startingEquipment: {
      choiceA: [
        'Besta Leve e 20 virotes ou qualquer arma simples',
        'Bolsa de Componentes ou Foco Arcano',
        'Kit de Acadêmico ou Kit de Aventureiro',
        'Armadura de Couro',
        'Arma Simples',
        'Adagas (2)'
      ],
      choiceB: [
        'Armadura de Couro Batido',
        'Adaga',
        'Kit de Aventureiro',
        'Besta Leve e 20 virotes'
      ]
    },
    level1Features: [
      'Patrono Transcendental: Escolha entidade que concede poder',
      'Magia Pactual: 1 espaço de magia que recarrega em descanso curto',
      'Conjuração: 2 truques e 2 magias de 1º nível conhecidas'
    ],
    description: 'Usuário de magia que fez pacto com entidade poderosa.',
    icon: '👹'
  }
];

// D&D 5e Skills
export const SKILLS = {
  // Strength
  athletics: { name: 'Atletismo', ability: 'str', description: 'Escalar, nadar, saltar, erguer peso' },
  
  // Dexterity  
  acrobatics: { name: 'Acrobacia', ability: 'dex', description: 'Equilíbrio, rolamento, manobras acrobáticas' },
  sleightOfHand: { name: 'Prestidigitação', ability: 'dex', description: 'Truques manuais, bater carteira, esconder objetos' },
  stealth: { name: 'Furtividade', ability: 'dex', description: 'Mover-se sem ser detectado, esconder-se' },
  
  // Intelligence
  arcana: { name: 'Arcanismo', ability: 'int', description: 'Conhecimento sobre magia, planos, criaturas mágicas' },
  history: { name: 'História', ability: 'int', description: 'Conhecimento sobre eventos históricos, lendas, figuras' },
  investigation: { name: 'Investigação', ability: 'int', description: 'Procurar pistas, deduzir, resolver mistérios' },
  nature: { name: 'Natureza', ability: 'int', description: 'Conhecimento sobre terrenos, plantas, animais, clima' },
  religion: { name: 'Religião', ability: 'int', description: 'Conhecimento sobre deuses, rituais, hierarquias' },
  
  // Wisdom
  animalHandling: { name: 'Lidar com Animais', ability: 'wis', description: 'Acalmar, treinar, controlar animais' },
  insight: { name: 'Intuição', ability: 'wis', description: 'Determinar intenções, ler linguagem corporal' },
  medicine: { name: 'Medicina', ability: 'wis', description: 'Primeiros socorros, diagnóstico, tratamento' },
  perception: { name: 'Percepção', ability: 'wis', description: 'Notar detalhes, ouvir, ver, detectar' },
  survival: { name: 'Sobrevivência', ability: 'wis', description: 'Rastrear, navegar, encontrar abrigo e comida' },
  
  // Charisma
  deception: { name: 'Enganação', ability: 'cha', description: 'Mentir, blefar, confundir com falsas informações' },
  intimidation: { name: 'Intimidação', ability: 'cha', description: 'Influenciar através de ameaças e hostilidade' },
  performance: { name: 'Atuação', ability: 'cha', description: 'Entreter através de música, dança, teatro' },
  persuasion: { name: 'Persuasão', ability: 'cha', description: 'Influenciar com tato, graça social, boa fé' }
};

// Backgrounds
export const BACKGROUNDS = [
  {
    name: 'Acólito',
    skillProficiencies: ['insight', 'religion'],
    description: 'Você serviu em um templo, aprendendo sobre rituais e hierarquias religiosas.',
    feature: 'Abrigo dos Fiéis: Você e seus companheiros podem receber cuidados gratuitos em templos de sua fé.'
  },
  {
    name: 'Charlatão',
    skillProficiencies: ['deception', 'sleightOfHand'],
    description: 'Você viveu de esquemas e trapaças, desenvolvendo um talento para enganar.',
    feature: 'Identidade Falsa: Você criou uma segunda identidade com documentação e conhecidos.'
  },
  {
    name: 'Criminoso',
    skillProficiencies: ['deception', 'stealth'],
    description: 'Você tem experiência com atividades ilegais e contatos no submundo.',
    feature: 'Contato Criminal: Você tem contato confiável no mundo do crime.'
  },
  {
    name: 'Artista',
    skillProficiencies: ['acrobatics', 'performance'],
    description: 'Você prosperou diante de audiências, vivendo de sua arte.',
    feature: 'Popular: Você pode se apresentar em tavernas por hospedagem e comida.'
  },
  {
    name: 'Herói do Povo',
    skillProficiencies: ['animalHandling', 'survival'],
    description: 'Você vem de uma vila simples, mas se destacou como herói local.',
    feature: 'Hospitalidade Rústica: Pessoas simples fazem de tudo para ajudá-lo.'
  },
  {
    name: 'Nobre',
    skillProficiencies: ['history', 'persuasion'],
    description: 'Você nasceu em uma família de posição social elevada.',
    feature: 'Posição Privilegiada: Você tem acesso a pessoas de alta posição social.'
  },
  {
    name: 'Eremita',
    skillProficiencies: ['medicine', 'religion'],
    description: 'Você viveu em reclusão, seja por escolha ou exílio.',
    feature: 'Descoberta: Você fez uma descoberta única durante seu isolamento.'
  },
  {
    name: 'Marinheiro',
    skillProficiencies: ['athletics', 'perception'],
    description: 'Você navegou pelos mares, enfrentando tempestades e piratas.',
    feature: 'Passagem de Navio: Você pode conseguir passagem gratuita em embarcações.'
  },
  {
    name: 'Sábio',
    skillProficiencies: ['arcana', 'history'],
    description: 'Você passou anos estudando e pesquisando em bibliotecas.',
    feature: 'Pesquisador: Você sabe onde encontrar informações e quem possui conhecimentos.'
  },
  {
    name: 'Soldado',
    skillProficiencies: ['athletics', 'intimidation'],
    description: 'Você serviu em uma força militar, aprendendo disciplina e combate.',
    feature: 'Posição Militar: Você tem patente que lhe confere autoridade sobre soldados.'
  },
  {
    name: 'Órfão',
    skillProficiencies: ['sleightOfHand', 'stealth'],
    description: 'Você cresceu nas ruas, aprendendo a sobreviver por conta própria.',
    feature: 'Segredos da Cidade: Você conhece os padrões secretos e fluxo da cidade.'
  }
];

// Alignments
export const ALIGNMENTS = [
  { name: 'Leal e Bom', short: 'LG', description: 'Age com consciência e esperança pelo melhor de todos' },
  { name: 'Neutro e Bom', short: 'NG', description: 'Faz o melhor que pode para ajudar os outros' },
  { name: 'Caótico e Bom', short: 'CG', description: 'Age conforme sua consciência, pouco se importando com expectativas' },
  { name: 'Leal e Neutro', short: 'LN', description: 'Age de acordo com a lei, tradição ou código pessoal' },
  { name: 'Neutro', short: 'N', description: 'Não se inclina para nenhum alinhamento em particular' },
  { name: 'Caótico e Neutro', short: 'CN', description: 'Segue seus caprichos, valoriza liberdade pessoal' },
  { name: 'Leal e Mau', short: 'LE', description: 'Toma o que quer metodicamente, dentro de código de conduta' },
  { name: 'Neutro e Mau', short: 'NE', description: 'Faz o que pode se safar, sem compaixão ou escrúpulos' },
  { name: 'Caótico e Mau', short: 'CE', description: 'Age com violência arbitrária, movido por ganância e ódio' }
];

// Point Buy costs
export const POINT_BUY_COSTS = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9
};

export const POINT_BUY_TOTAL = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

// Ability Score names and abbreviations  
export const ABILITIES = {
  str: { name: 'Força', short: 'FOR' },
  dex: { name: 'Destreza', short: 'DEX' },
  con: { name: 'Constituição', short: 'CON' },
  int: { name: 'Inteligência', short: 'INT' },
  wis: { name: 'Sabedoria', short: 'SAB' },
  cha: { name: 'Carisma', short: 'CAR' }
};

// Calculate ability modifier
export function getModifier(score) {
  return Math.floor((score - 10) / 2);
}

// Roll 4d6 drop lowest
export function rollAbilityScore() {
  const rolls = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
  rolls.sort((a, b) => b - a);
  return {
    total: rolls.slice(0, 3).reduce((sum, roll) => sum + roll, 0),
    rolls: rolls,
    kept: rolls.slice(0, 3)
  };
}

// Get proficiency bonus by level
export function getProficiencyBonus(level) {
  return Math.ceil(level / 4) + 1;
}

// Calculate HP at level 1
export function calculateLevel1HP(classData, conModifier) {
  const hitDieMax = parseInt(classData.hitDie.slice(1)); // Remove 'd' and get max value
  return hitDieMax + conModifier;
}

// Calculate AC based on equipment
export function calculateAC(equipment, dexModifier) {
  // Basic AC calculation - can be enhanced with actual equipment data
  let baseAC = 10 + dexModifier;
  
  if (equipment.includes('Armadura de Couro')) baseAC = 11 + dexModifier;
  if (equipment.includes('Armadura de Couro Batido')) baseAC = 12 + dexModifier;
  if (equipment.includes('Cota de Malha')) baseAC = 14 + Math.min(dexModifier, 2);
  if (equipment.includes('Armadura de Escamas')) baseAC = 14 + Math.min(dexModifier, 2);
  
  if (equipment.includes('Escudo')) baseAC += 2;
  
  return baseAC;
}