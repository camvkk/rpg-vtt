// Skills, abilities, alignments, languages and damage types (PT-BR). SRD 5.1, CC-BY-4.0.
import type { Ability, DamageType, SkillId } from '../types.ts';

export const ABILITY_IDS: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITIES: Record<Ability, { name: string; short: string }> = {
  str: { name: 'Força', short: 'FOR' },
  dex: { name: 'Destreza', short: 'DES' },
  con: { name: 'Constituição', short: 'CON' },
  int: { name: 'Inteligência', short: 'INT' },
  wis: { name: 'Sabedoria', short: 'SAB' },
  cha: { name: 'Carisma', short: 'CAR' },
};

export const SKILLS: Record<SkillId, { name: string; ability: Ability; description: string }> = {
  acrobatics: {
    name: 'Acrobacia',
    ability: 'dex',
    description: 'Manter o equilíbrio em situações precárias, fazer rolamentos, piruetas, cambalhotas e saltos acrobáticos.',
  },
  animalHandling: {
    name: 'Adestrar Animais',
    ability: 'wis',
    description: 'Acalmar um animal doméstico, impedir que uma montaria se assuste ou intuir as intenções de um animal.',
  },
  arcana: {
    name: 'Arcanismo',
    ability: 'int',
    description: 'Recordar conhecimentos sobre magias, itens mágicos, símbolos místicos, tradições mágicas e planos de existência.',
  },
  athletics: {
    name: 'Atletismo',
    ability: 'str',
    description: 'Escalar, saltar, nadar e realizar proezas de força bruta, como agarrar e empurrar criaturas.',
  },
  deception: {
    name: 'Enganação',
    ability: 'cha',
    description: 'Esconder a verdade de forma convincente, seja por mentiras, disfarces, blefes ou ambiguidades.',
  },
  history: {
    name: 'História',
    ability: 'int',
    description: 'Recordar eventos históricos, pessoas lendárias, reinos antigos, disputas passadas e civilizações perdidas.',
  },
  insight: {
    name: 'Intuição',
    ability: 'wis',
    description: 'Determinar as verdadeiras intenções de uma criatura, detectar mentiras e prever o próximo movimento de alguém.',
  },
  intimidation: {
    name: 'Intimidação',
    ability: 'cha',
    description: 'Influenciar alguém por meio de ameaças explícitas, ações hostis ou violência física.',
  },
  investigation: {
    name: 'Investigação',
    ability: 'int',
    description: 'Procurar pistas e fazer deduções: encontrar passagens ocultas, pontos fracos ou o sentido de documentos antigos.',
  },
  medicine: {
    name: 'Medicina',
    ability: 'wis',
    description: 'Estabilizar um companheiro moribundo ou diagnosticar uma doença.',
  },
  nature: {
    name: 'Natureza',
    ability: 'int',
    description: 'Recordar conhecimentos sobre terrenos, plantas, animais, o clima e os ciclos naturais.',
  },
  perception: {
    name: 'Percepção',
    ability: 'wis',
    description: 'Ver, ouvir ou detectar de outra forma a presença de algo; notar detalhes e perigos no ambiente.',
  },
  performance: {
    name: 'Atuação',
    ability: 'cha',
    description: 'Encantar uma plateia com música, dança, atuação, narração de histórias ou outro tipo de entretenimento.',
  },
  persuasion: {
    name: 'Persuasão',
    ability: 'cha',
    description: 'Influenciar alguém com tato, boas maneiras ou boa índole; negociar e fazer pedidos de forma cordial.',
  },
  religion: {
    name: 'Religião',
    ability: 'int',
    description: 'Recordar conhecimentos sobre divindades, ritos, orações, hierarquias religiosas, símbolos sagrados e cultos.',
  },
  sleightOfHand: {
    name: 'Prestidigitação',
    ability: 'dex',
    description: 'Truques manuais: plantar algo em alguém, bater carteiras ou esconder um objeto em seu corpo.',
  },
  stealth: {
    name: 'Furtividade',
    ability: 'dex',
    description: 'Esconder-se de inimigos, passar despercebido por guardas e mover-se sem ser notado.',
  },
  survival: {
    name: 'Sobrevivência',
    ability: 'wis',
    description: 'Seguir rastros, caçar, guiar o grupo por terras selvagens, prever o clima e evitar perigos naturais.',
  },
};

/** Skill ids sorted by their PT-BR name (for UI lists). */
export const SKILL_IDS: SkillId[] = (Object.keys(SKILLS) as SkillId[]).sort((a, b) =>
  SKILLS[a].name.localeCompare(SKILLS[b].name, 'pt-BR'),
);

export const ALIGNMENTS: string[] = [
  'Leal e Bom',
  'Neutro e Bom',
  'Caótico e Bom',
  'Leal e Neutro',
  'Neutro',
  'Caótico e Neutro',
  'Leal e Mau',
  'Neutro e Mau',
  'Caótico e Mau',
];

export const ALIGNMENT_DESCRIPTIONS: Record<string, string> = {
  'Leal e Bom': 'Faz o que é considerado correto pela sociedade, com honra e compaixão.',
  'Neutro e Bom': 'Faz o melhor que pode para ajudar os outros, de acordo com suas necessidades.',
  'Caótico e Bom': 'Age conforme a própria consciência, com pouca consideração pelas expectativas alheias.',
  'Leal e Neutro': 'Age de acordo com a lei, a tradição ou um código pessoal.',
  'Neutro': 'Evita questões morais e não toma partido, fazendo o que parece melhor no momento.',
  'Caótico e Neutro': 'Segue seus caprichos e valoriza a liberdade pessoal acima de tudo.',
  'Leal e Mau': 'Toma o que deseja metodicamente, dentro dos limites de um código, tradição ou lealdade.',
  'Neutro e Mau': 'Faz o que quer que consiga sem ser punido, sem compaixão nem escrúpulos.',
  'Caótico e Mau': 'Age com violência arbitrária, movido pela ganância, pelo ódio ou pela sede de sangue.',
};

/** Standard languages first, then exotic, then secret class languages. */
export const LANGUAGES: string[] = [
  'Comum',
  'Anão',
  'Élfico',
  'Gigante',
  'Gnômico',
  'Goblin',
  'Halfling',
  'Orc',
  'Abissal',
  'Celestial',
  'Dialeto Subterrâneo',
  'Dracônico',
  'Infernal',
  'Primordial',
  'Silvestre',
  'Subcomum',
  'Druídico',
  'Gíria dos Ladrões',
];

export const STANDARD_LANGUAGES: string[] = LANGUAGES.slice(0, 8);
export const EXOTIC_LANGUAGES: string[] = LANGUAGES.slice(8, 16);

export const DAMAGE_TYPES: Record<DamageType, { name: string; color: string }> = {
  acid: { name: 'ácido', color: '#b5d334' },
  bludgeoning: { name: 'contundente', color: '#a1887f' },
  cold: { name: 'frio', color: '#81d4fa' },
  fire: { name: 'fogo', color: '#ff7043' },
  force: { name: 'energia', color: '#d05ce3' },
  lightning: { name: 'elétrico', color: '#4fa3ff' },
  necrotic: { name: 'necrótico', color: '#7e57c2' },
  piercing: { name: 'perfurante', color: '#b0bec5' },
  poison: { name: 'veneno', color: '#66bb3a' },
  psychic: { name: 'psíquico', color: '#f06292' },
  radiant: { name: 'radiante', color: '#ffd54f' },
  slashing: { name: 'cortante', color: '#cfd8dc' },
  thunder: { name: 'trovejante', color: '#7986cb' },
  healing: { name: 'cura', color: '#4caf50' },
  none: { name: 'nenhum', color: '#9e9e9e' },
};
