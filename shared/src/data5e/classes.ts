// The 12 core classes (PT-BR). Core rules and one subclass per class from SRD 5.1 (CC-BY-4.0);
// other subclasses are listed by name/description only.
//
// `ClassFeature.uses.max` mini-language (see `resolveUses`):
// - a number: fixed uses (e.g. 1)
// - "level" / "level*5": class level (times N)
// - "prof": proficiency bonus
// - an ability id ("cha", "wis"...): that ability modifier
// - terms joined by "+": "1+cha" (any expression with an ability has a minimum of 1)
// - a level table "2=1,6=2,18=3": value of the highest key ≤ class level (99 = ilimitado)
import type { Ability, SkillId } from '../types.ts';
import type { ClassData, ClassFeature } from './types.ts';

const ALL_SKILLS: SkillId[] = [
  'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history',
  'insight', 'intimidation', 'investigation', 'medicine', 'nature', 'perception',
  'performance', 'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
];

function f(level: number, name: string, text: string, uses?: ClassFeature['uses']): ClassFeature {
  return uses ? { level, name, text, uses } : { level, name, text };
}

function asi(...levels: number[]): ClassFeature[] {
  return levels.map((level) =>
    f(
      level,
      'Incremento no Valor de Habilidade',
      'Aumente um valor de habilidade em 2, ou dois valores de habilidade em 1 cada (máximo 20). Com a regra opcional de talentos, você pode escolher um talento no lugar.',
    ),
  );
}

const EXTRA_ATTACK = f(5, 'Ataque Extra', 'Você pode atacar duas vezes, em vez de uma, sempre que realizar a ação de Ataque no seu turno.');

const EVASION_TEXT =
  'Quando for alvo de um efeito que permite uma salvaguarda de Destreza para sofrer metade do dano, você não sofre dano algum se passar e apenas metade se falhar.';

const sortFeatures = (list: ClassFeature[]): ClassFeature[] => list.slice().sort((a, b) => a.level - b.level);

export const CLASSES: ClassData[] = [
  // ===========================================================================
  // BÁRBARO
  // ===========================================================================
  {
    id: 'barbarian',
    name: 'Bárbaro',
    description: 'Um guerreiro feroz de origem primitiva que entra em uma fúria de batalha para resistir a golpes e esmagar os inimigos.',
    hitDie: 12,
    primaryAbility: ['str'],
    saves: ['str', 'con'],
    armorProfs: 'Armaduras leves, armaduras médias, escudos',
    weaponProfs: 'Armas simples, armas marciais',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'] },
    spellcasting: null,
    features: sortFeatures([
      f(
        1,
        'Fúria',
        'Ação bônus, sem armadura pesada, dura 1 minuto: vantagem em testes e salvaguardas de Força; bônus de dano em ataques corpo a corpo com arma usando Força (+2; +3 no 9º nível; +4 no 16º); resistência a dano contundente, cortante e perfurante. Você não pode conjurar nem se concentrar em magias. Termina antes se você ficar inconsciente ou se seu turno acabar sem você ter atacado uma criatura hostil nem sofrido dano desde o seu último turno; pode encerrá-la com uma ação bônus. Usos: 2 (1º), 3 (3º), 4 (6º), 5 (12º), 6 (17º), ilimitados (20º).',
        { max: '1=2,3=3,6=4,12=5,17=6,20=99', reset: 'long' },
      ),
      f(1, 'Defesa sem Armadura', 'Sem armadura, sua CA é 10 + mod. de Destreza + mod. de Constituição. Você pode usar um escudo e ainda receber este benefício.'),
      f(2, 'Ataque Descuidado', 'Ao fazer seu primeiro ataque no turno, você pode atacar descuidadamente: tem vantagem em jogadas de ataque corpo a corpo com arma usando Força neste turno, mas jogadas de ataque contra você têm vantagem até o início do seu próximo turno.'),
      f(2, 'Sentido de Perigo', 'Você tem vantagem em salvaguardas de Destreza contra efeitos que possa ver, como armadilhas e magias. Não funciona se estiver cego, surdo ou incapacitado.'),
      f(3, 'Caminho Primitivo', 'Escolha um caminho que molda a natureza da sua fúria. Ele concede características no 3º, 6º, 10º e 14º níveis.'),
      ...asi(4, 8, 12, 16, 19),
      EXTRA_ATTACK,
      f(5, 'Movimento Rápido', 'Seu deslocamento aumenta em 10 pés enquanto você não estiver usando armadura pesada.'),
      f(7, 'Instinto Selvagem', 'Você tem vantagem em jogadas de iniciativa. Se estiver surpreso no início do combate e não estiver incapacitado, pode agir normalmente no primeiro turno, desde que entre em fúria antes de fazer qualquer outra coisa.'),
      f(9, 'Crítico Brutal (1 dado)', 'Você pode rolar um dado de dano da arma adicional ao determinar o dano extra de um acerto crítico com ataque corpo a corpo.'),
      f(9, 'Dano de Fúria +3', 'O bônus de dano da sua Fúria aumenta para +3.'),
      f(11, 'Fúria Implacável', 'Se cair a 0 pontos de vida enquanto estiver em fúria e não morrer imediatamente, faça uma salvaguarda de Constituição CD 10. Se passar, fica com 1 PV. Cada uso posterior aumenta a CD em 5; ela volta a 10 após um descanso curto ou longo.'),
      f(13, 'Crítico Brutal (2 dados)', 'Você rola dois dados de dano da arma adicionais em acertos críticos corpo a corpo.'),
      f(15, 'Fúria Persistente', 'Sua fúria só termina antes se você cair inconsciente ou escolher encerrá-la.'),
      f(16, 'Dano de Fúria +4', 'O bônus de dano da sua Fúria aumenta para +4.'),
      f(17, 'Crítico Brutal (3 dados)', 'Você rola três dados de dano da arma adicionais em acertos críticos corpo a corpo.'),
      f(18, 'Poder Indomável', 'Se o total de um teste de Força for menor que seu valor de Força, você pode usar esse valor no lugar do total.'),
      f(20, 'Campeão Primitivo', 'Seus valores de Força e Constituição aumentam em 4. Seu máximo para esses valores passa a ser 24.'),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Caminho Primitivo',
    subclasses: [
      {
        id: 'berserker',
        name: 'Caminho do Berserker',
        description: 'Para alguns bárbaros, a fúria é um meio para um fim — e esse fim é a violência. O berserker se entrega ao caos da batalha.',
        features: [
          f(3, 'Frenesi', 'Ao entrar em fúria, você pode escolher entrar em frenesi. Enquanto a fúria durar, pode fazer um único ataque corpo a corpo com arma como ação bônus em cada um dos seus turnos após este. Quando a fúria terminar, você sofre um nível de exaustão.'),
          f(6, 'Fúria Inconsciente', 'Você não pode ser enfeitiçado nem amedrontado enquanto estiver em fúria. Se já estiver sob esses efeitos ao entrar em fúria, eles ficam suspensos enquanto ela durar.'),
          f(10, 'Presença Intimidante', 'Com uma ação, amedronte uma criatura a até 30 pés que possa vê-lo ou ouvi-lo (salvaguarda de Sabedoria, CD 8 + bônus de proficiência + mod. de Carisma). Ela fica amedrontada até o fim do seu próximo turno; você pode estender o efeito com sua ação a cada turno. Se a criatura passar ou o efeito terminar, ela fica imune por 24 horas.'),
          f(14, 'Retaliação', 'Quando sofrer dano de uma criatura a até 5 pés de você, pode usar sua reação para fazer um ataque corpo a corpo com arma contra ela.'),
        ],
      },
      { id: 'totem-warrior', name: 'Caminho do Guerreiro Totêmico', description: 'Vínculo espiritual com animais totêmicos (urso, águia, lobo) que concedem poderes durante a fúria.', features: [] },
      { id: 'zealot', name: 'Caminho do Fanático', description: 'A fúria é alimentada pela fé em um deus; o fanático causa dano divino e é quase impossível de matar.', features: [] },
    ],
    startingEquipment: [
      ['Machado grande', 'Qualquer arma marcial corpo a corpo'],
      ['Duas machadinhas', 'Qualquer arma simples'],
      ['Pacote de aventureiro e quatro azagaias'],
    ],
    startingGold: '2d4×10 po',
  },
  // ===========================================================================
  // BARDO
  // ===========================================================================
  {
    id: 'bard',
    name: 'Bardo',
    description: 'Um mágico inspirador cujo poder ecoa a música da criação, capaz de animar aliados, desmoralizar inimigos e dominar qualquer ofício.',
    hitDie: 8,
    primaryAbility: ['cha'],
    saves: ['dex', 'cha'],
    armorProfs: 'Armaduras leves',
    weaponProfs: 'Armas simples, bestas de mão, espadas longas, rapieiras, espadas curtas',
    toolProfs: 'Três instrumentos musicais à sua escolha',
    skillChoices: { count: 3, from: ALL_SKILLS },
    spellcasting: { ability: 'cha', progression: 'full', prepares: false },
    features: sortFeatures([
      f(1, 'Conjuração', 'Você conjura magias de bardo usando Carisma (CD = 8 + bônus de proficiência + mod. de Carisma; ataque = bônus de proficiência + mod. de Carisma). Conhece 2 truques e 4 magias de 1º nível e aprende mais ao subir de nível; pode trocar uma magia conhecida a cada nível. Pode usar um instrumento musical como foco e conjurar como ritual qualquer magia de ritual que conheça.'),
      f(1, 'Inspiração Bárdica (d6)', 'Com uma ação bônus, escolha uma criatura (exceto você) a até 60 pés que possa ouvi-lo. Ela ganha um dado de Inspiração Bárdica (d6) e, nos próximos 10 minutos, pode rolá-lo e somá-lo a um teste de habilidade, jogada de ataque ou salvaguarda, após rolar o d20 e antes de saber o resultado. Usos: mod. de Carisma (mínimo 1), recuperados em descanso longo (curto a partir do 5º nível).', { max: 'cha', reset: 'long' }),
      f(2, 'Pau para Toda Obra', 'Você soma metade do seu bônus de proficiência (arredondado para baixo) a qualquer teste de habilidade que ainda não inclua seu bônus de proficiência.'),
      f(2, 'Canção de Descanso (d6)', 'Durante um descanso curto, você e criaturas amigas que ouvirem sua performance e gastarem Dados de Vida recuperam 1d6 PV extras. Aumenta para d8 (9º), d10 (13º) e d12 (17º).'),
      f(3, 'Colégio Bárdico', 'Escolha um colégio bárdico, que concede características no 3º, 6º e 14º níveis.'),
      f(3, 'Aptidão', 'Escolha duas perícias em que seja proficiente: seu bônus de proficiência é dobrado em testes com elas. No 10º nível, escolha mais duas.'),
      ...asi(4, 8, 12, 16, 19),
      f(5, 'Inspiração Bárdica (d8)', 'Seu dado de Inspiração Bárdica passa a ser um d8.'),
      f(5, 'Fonte de Inspiração', 'Você recupera todos os usos de Inspiração Bárdica ao terminar um descanso curto ou longo.'),
      f(6, 'Contraencanto', 'Com uma ação, inicie uma performance que dura até o fim do seu próximo turno. Você e qualquer criatura amiga a até 30 pés que possa ouvi-lo têm vantagem em salvaguardas contra ficar amedrontado ou enfeitiçado.'),
      f(9, 'Canção de Descanso (d8)', 'O dado extra da Canção de Descanso passa a ser um d8.'),
      f(10, 'Inspiração Bárdica (d10)', 'Seu dado de Inspiração Bárdica passa a ser um d10.'),
      f(10, 'Aptidão (adicional)', 'Escolha mais duas perícias proficientes para dobrar o bônus de proficiência.'),
      f(10, 'Segredos Mágicos', 'Aprenda duas magias de qualquer classe (truques inclusive). Elas contam como magias de bardo e entram no seu total de magias conhecidas. Você aprende mais duas no 14º e no 18º níveis.'),
      f(13, 'Canção de Descanso (d10)', 'O dado extra da Canção de Descanso passa a ser um d10.'),
      f(14, 'Segredos Mágicos (adicional)', 'Aprenda mais duas magias de qualquer classe.'),
      f(15, 'Inspiração Bárdica (d12)', 'Seu dado de Inspiração Bárdica passa a ser um d12.'),
      f(17, 'Canção de Descanso (d12)', 'O dado extra da Canção de Descanso passa a ser um d12.'),
      f(18, 'Segredos Mágicos (adicional)', 'Aprenda mais duas magias de qualquer classe.'),
      f(20, 'Inspiração Superior', 'Ao rolar iniciativa sem usos de Inspiração Bárdica restantes, você recupera um uso.'),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Colégio Bárdico',
    subclasses: [
      {
        id: 'lore',
        name: 'Colégio do Conhecimento',
        description: 'Bardos que colecionam saberes de todas as fontes — de tomos acadêmicos a contos de camponeses — e usam palavras como armas.',
        features: [
          f(3, 'Proficiência Adicional', 'Você ganha proficiência em três perícias à sua escolha.'),
          f(3, 'Palavras de Interrupção', 'Quando uma criatura a até 60 pés que você possa ver fizer uma jogada de ataque, teste de habilidade ou jogada de dano, use sua reação e gaste um uso de Inspiração Bárdica para rolar o dado e subtrair o resultado (após a rolagem, antes de saber o resultado). Não afeta criaturas que não possam ouvi-lo ou imunes a enfeitiçamento.'),
          f(6, 'Segredos Mágicos Adicionais', 'Aprenda duas magias de qualquer classe. Elas contam como magias de bardo, mas não entram no seu total de magias conhecidas.'),
          f(14, 'Perícia Inigualável', 'Ao fazer um teste de habilidade, você pode gastar um uso de Inspiração Bárdica e somar o dado ao resultado, após rolar e antes de saber o resultado.'),
        ],
      },
      { id: 'valor', name: 'Colégio do Valor', description: 'Bardos corajosos que preservam as lendas dos heróis e inspiram aliados em combate; ganham armaduras médias, escudos e armas marciais.', features: [] },
      { id: 'glamour', name: 'Colégio do Glamour', description: 'Bardos que aprenderam sua arte na Agrestia das Fadas e usam magia feérica para encantar e comandar.', features: [] },
    ],
    startingEquipment: [
      ['Rapieira', 'Espada longa', 'Qualquer arma simples'],
      ['Pacote de diplomata', 'Pacote de artista'],
      ['Alaúde', 'Qualquer outro instrumento musical'],
      ['Armadura de couro e uma adaga'],
    ],
    startingGold: '5d4×10 po',
  },
  // ===========================================================================
  // BRUXO
  // ===========================================================================
  {
    id: 'warlock',
    name: 'Bruxo',
    description: 'Um usuário de magia cujo poder vem de um pacto com uma entidade sobrenatural de outro plano.',
    hitDie: 8,
    primaryAbility: ['cha'],
    saves: ['wis', 'cha'],
    armorProfs: 'Armaduras leves',
    weaponProfs: 'Armas simples',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'history', 'intimidation', 'investigation', 'nature', 'religion'] },
    spellcasting: { ability: 'cha', progression: 'pact', prepares: false },
    features: sortFeatures([
      f(1, 'Patrono Transcendental', 'Você firma um pacto com um ser de outro plano. Seu patrono concede características no 1º, 6º, 10º e 14º níveis e expande sua lista de magias.'),
      f(1, 'Magia de Pacto', 'Você conjura magias de bruxo usando Carisma (CD = 8 + bônus de proficiência + mod. de Carisma). Todos os seus espaços de magia têm o mesmo nível e são recuperados em descanso curto ou longo: 1 espaço de 1º nível no 1º nível, 2 espaços no 2º, até 4 espaços de 5º nível no 17º. Conhece 2 truques e 2 magias de 1º nível; pode usar um foco arcano.'),
      f(2, 'Invocações Místicas', 'Aprenda duas invocações místicas (fragmentos de saber proibido que concedem habilidades mágicas). Você conhece 3 no 5º nível, 4 no 7º, 5 no 9º, 6 no 12º, 7 no 15º e 8 no 18º. Ao subir de nível, pode trocar uma invocação por outra.'),
      f(3, 'Dádiva do Pacto', 'Escolha uma dádiva: Pacto da Corrente (aprende convocar familiar e pode escolher diabrete, pseudodragão, quasit ou sprite), Pacto da Lâmina (com uma ação, cria uma arma corpo a corpo de pacto, na qual é proficiente) ou Pacto do Tomo (um Livro das Sombras com três truques de qualquer classe).'),
      ...asi(4, 8, 12, 16, 19),
      f(11, 'Arcana Mística (6º nível)', 'Escolha uma magia de bruxo de 6º nível como arcana. Você pode conjurá-la uma vez sem gastar espaço de magia, recuperando o uso ao terminar um descanso longo.', { max: 1, reset: 'long' }),
      f(13, 'Arcana Mística (7º nível)', 'Escolha uma magia de bruxo de 7º nível como arcana, conjurável uma vez por descanso longo sem gastar espaço.', { max: 1, reset: 'long' }),
      f(15, 'Arcana Mística (8º nível)', 'Escolha uma magia de bruxo de 8º nível como arcana, conjurável uma vez por descanso longo sem gastar espaço.', { max: 1, reset: 'long' }),
      f(17, 'Arcana Mística (9º nível)', 'Escolha uma magia de bruxo de 9º nível como arcana, conjurável uma vez por descanso longo sem gastar espaço.', { max: 1, reset: 'long' }),
      f(20, 'Mestre Místico', 'Você pode passar 1 minuto suplicando ao seu patrono para recuperar todos os espaços de Magia de Pacto gastos. Uma vez por descanso longo.', { max: 1, reset: 'long' }),
    ]),
    subclassLevel: 1,
    subclassLabel: 'Patrono Transcendental',
    subclasses: [
      {
        id: 'fiend',
        name: 'O Corruptor',
        description: 'Você firmou um pacto com um corruptor dos planos inferiores — um lorde demônio, arquidiabo ou outro ser de grande maldade.',
        features: [
          f(1, 'Lista de Magias Expandida', 'Ficam disponíveis como magias de bruxo: mãos flamejantes, comando (1º); cegueira/surdez, raio ardente (2º); bola de fogo, névoa fétida (3º); escudo de fogo, muralha de fogo (4º); coluna de chamas, consagrar (5º).'),
          f(1, 'Bênção do Obscuro', 'Ao reduzir uma criatura hostil a 0 pontos de vida, você ganha PV temporários iguais ao seu mod. de Carisma + nível de bruxo (mínimo 1).'),
          f(6, 'Sorte do Próprio Obscuro', 'Ao fazer um teste de habilidade ou salvaguarda, você pode somar 1d10 à jogada, mesmo após ver o d20, mas antes de saber o resultado. Uma vez por descanso curto ou longo.', { max: 1, reset: 'short' }),
          f(10, 'Resiliência Demoníaca', 'Ao terminar um descanso curto ou longo, escolha um tipo de dano: você tem resistência a ele até escolher outro. Dano de armas mágicas ou de prata ignora essa resistência.'),
          f(14, 'Lançar Através do Inferno', 'Ao atingir uma criatura com um ataque, você pode transportá-la instantaneamente pelos planos inferiores. Ela desaparece e retorna no fim do seu próximo turno ao espaço que ocupava (ou ao mais próximo livre). Se não for um corruptor, sofre 10d10 de dano psíquico. Uma vez por descanso longo.', { max: 1, reset: 'long' }),
        ],
      },
      { id: 'archfey', name: 'A Arquifada', description: 'Patrono da Agrestia das Fadas que concede encantamentos, ilusões e passos feéricos.', features: [] },
      { id: 'great-old-one', name: 'O Grande Antigo', description: 'Uma entidade alienígena e incompreensível que concede telepatia e conhecimento proibido.', features: [] },
      { id: 'celestial', name: 'O Celestial', description: 'Um ser dos Planos Superiores que concede magias de cura e luz radiante.', features: [] },
    ],
    startingEquipment: [
      ['Besta leve e 20 virotes', 'Qualquer arma simples'],
      ['Bolsa de componentes', 'Foco arcano'],
      ['Pacote de estudioso', 'Pacote de explorador'],
      ['Armadura de couro, qualquer arma simples e duas adagas'],
    ],
    startingGold: '4d4×10 po',
  },
  // ===========================================================================
  // CLÉRIGO
  // ===========================================================================
  {
    id: 'cleric',
    name: 'Clérigo',
    description: 'Um campeão sacerdotal que empunha magia divina a serviço de um poder superior.',
    hitDie: 8,
    primaryAbility: ['wis'],
    saves: ['wis', 'cha'],
    armorProfs: 'Armaduras leves, armaduras médias, escudos',
    weaponProfs: 'Armas simples',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['history', 'insight', 'medicine', 'persuasion', 'religion'] },
    spellcasting: { ability: 'wis', progression: 'full', prepares: true },
    features: sortFeatures([
      f(1, 'Conjuração', 'Você prepara magias de clérigo usando Sabedoria: a cada dia, escolha um número de magias igual ao mod. de Sabedoria + nível de clérigo (mínimo 1). CD = 8 + bônus de proficiência + mod. de Sabedoria. Conhece 3 truques, usa um símbolo sagrado como foco e pode conjurar como ritual magias de ritual preparadas.'),
      f(1, 'Domínio Divino', 'Escolha um domínio ligado à sua divindade. Ele concede magias de domínio (sempre preparadas, não contam no limite) e características no 1º, 2º, 6º, 8º e 17º níveis.'),
      f(2, 'Canalizar Divindade', 'Você canaliza energia divina para criar efeitos mágicos: Expulsar Mortos-Vivos e um efeito do seu domínio. Usos: 1 (2º), 2 (6º), 3 (18º), recuperados em descanso curto ou longo. CD = CD de magia de clérigo.', { max: '2=1,6=2,18=3', reset: 'short' }),
      f(2, 'Canalizar Divindade: Expulsar Mortos-Vivos', 'Com uma ação, apresente o símbolo sagrado. Cada morto-vivo a até 30 pés que possa vê-lo ou ouvi-lo faz uma salvaguarda de Sabedoria; se falhar, fica expulso por 1 minuto ou até sofrer dano: deve se afastar de você e não pode se aproximar a menos de 30 pés nem usar reações.'),
      ...asi(4, 8, 12, 16, 19),
      f(5, 'Destruir Mortos-Vivos (ND 1/2)', 'Quando um morto-vivo falhar na salvaguarda contra Expulsar Mortos-Vivos, é destruído instantaneamente se seu ND for 1/2 ou menor. O limite aumenta para ND 1 (8º), 2 (11º), 3 (14º) e 4 (17º).'),
      f(6, 'Canalizar Divindade (2/descanso)', 'Você pode usar Canalizar Divindade duas vezes entre descansos.'),
      f(8, 'Destruir Mortos-Vivos (ND 1)', 'Mortos-vivos de ND 1 ou menor são destruídos por Expulsar Mortos-Vivos.'),
      f(10, 'Intervenção Divina', 'Com uma ação, implore a ajuda da sua divindade e role um d100. Se o resultado for igual ou menor que seu nível de clérigo, ela intervém (efeito a critério do Mestre; uma magia de clérigo ou de domínio é apropriada). Se funcionar, não pode usar de novo por 7 dias; caso contrário, pode tentar após um descanso longo.', { max: 1, reset: 'long' }),
      f(11, 'Destruir Mortos-Vivos (ND 2)', 'Mortos-vivos de ND 2 ou menor são destruídos por Expulsar Mortos-Vivos.'),
      f(14, 'Destruir Mortos-Vivos (ND 3)', 'Mortos-vivos de ND 3 ou menor são destruídos por Expulsar Mortos-Vivos.'),
      f(17, 'Destruir Mortos-Vivos (ND 4)', 'Mortos-vivos de ND 4 ou menor são destruídos por Expulsar Mortos-Vivos.'),
      f(18, 'Canalizar Divindade (3/descanso)', 'Você pode usar Canalizar Divindade três vezes entre descansos.'),
      f(20, 'Intervenção Divina Aprimorada', 'Seu pedido de Intervenção Divina é atendido automaticamente, sem rolagem.'),
    ]),
    subclassLevel: 1,
    subclassLabel: 'Domínio Divino',
    subclasses: [
      {
        id: 'life',
        name: 'Domínio da Vida',
        description: 'Foca na energia positiva que sustenta toda a vida; seus clérigos são curandeiros e protetores incomparáveis.',
        features: [
          f(1, 'Magias de Domínio', 'Sempre preparadas: bênção, curar ferimentos (1º); restauração menor, arma espiritual (3º); sinal de esperança, revivificar (5º); proteção contra a morte, guardião da fé (7º); curar ferimentos em massa, reviver os mortos (9º).'),
          f(1, 'Proficiência Adicional', 'Você ganha proficiência com armaduras pesadas.'),
          f(1, 'Discípulo da Vida', 'Suas magias de 1º nível ou superior que restauram pontos de vida curam 2 + nível da magia PV adicionais.'),
          f(2, 'Canalizar Divindade: Preservar a Vida', 'Com uma ação, restaure um total de PV igual a 5 × seu nível de clérigo, divididos entre criaturas a até 30 pés. Não pode levar uma criatura acima da metade do seu máximo de PV. Não afeta mortos-vivos nem constructos.'),
          f(6, 'Curandeiro Abençoado', 'Quando conjurar uma magia de 1º nível ou superior que restaure PV de outra criatura, você recupera 2 + nível da magia PV.'),
          f(8, 'Golpe Divino (1d8)', 'Uma vez em cada um dos seus turnos, ao atingir uma criatura com um ataque com arma, cause 1d8 de dano radiante extra. Aumenta para 2d8 no 14º nível.'),
          f(14, 'Golpe Divino (2d8)', 'O dano extra do Golpe Divino aumenta para 2d8.'),
          f(17, 'Cura Suprema', 'Quando rolar dados para restaurar PV com uma magia, use o valor máximo possível de cada dado.'),
        ],
      },
      { id: 'light', name: 'Domínio da Luz', description: 'Clérigos da luz, do fogo e da verdade, que repelem as trevas com chamas e clarões radiantes.', features: [] },
      { id: 'war', name: 'Domínio da Guerra', description: 'Guerreiros divinos que inspiram bravura e golpeiam com poder marcial abençoado.', features: [] },
      { id: 'knowledge', name: 'Domínio do Conhecimento', description: 'Guardiões de saberes, idiomas e segredos esquecidos, capazes de ler mentes e o passado.', features: [] },
      { id: 'nature', name: 'Domínio da Natureza', description: 'Servos de deuses da natureza que comandam plantas, animais e elementos.', features: [] },
      { id: 'tempest', name: 'Domínio da Tempestade', description: 'Clérigos que comandam o trovão, o relâmpago e a fúria dos mares.', features: [] },
    ],
    startingEquipment: [
      ['Maça', 'Martelo de guerra (se proficiente)'],
      ['Brunea', 'Armadura de couro', 'Cota de malha (se proficiente)'],
      ['Besta leve e 20 virotes', 'Qualquer arma simples'],
      ['Pacote de sacerdote', 'Pacote de aventureiro'],
      ['Escudo e símbolo sagrado'],
    ],
    startingGold: '5d4×10 po',
  },
  // ===========================================================================
  // DRUIDA
  // ===========================================================================
  {
    id: 'druid',
    name: 'Druida',
    description: 'Um sacerdote da Antiga Fé que empunha os poderes da natureza — luar, crescimento vegetal, fogo e relâmpago — e assume formas animais.',
    hitDie: 8,
    primaryAbility: ['wis'],
    saves: ['int', 'wis'],
    armorProfs: 'Armaduras leves, armaduras médias, escudos (druidas não usam armaduras nem escudos de metal)',
    weaponProfs: 'Clavas, adagas, dardos, azagaias, maças, bordões, cimitarras, foices, fundas, lanças',
    toolProfs: 'Kit de herbalismo',
    skillChoices: { count: 2, from: ['arcana', 'animalHandling', 'insight', 'medicine', 'nature', 'perception', 'religion', 'survival'] },
    spellcasting: { ability: 'wis', progression: 'full', prepares: true },
    features: sortFeatures([
      f(1, 'Druídico', 'Você conhece o Druídico, o idioma secreto dos druidas. Pode falá-lo e deixar mensagens ocultas que outros só percebem com um teste de Sabedoria (Percepção) CD 15, sem conseguir decifrá-las sem magia.'),
      f(1, 'Conjuração', 'Você prepara magias de druida usando Sabedoria: mod. de Sabedoria + nível de druida (mínimo 1). CD = 8 + bônus de proficiência + mod. de Sabedoria. Conhece 2 truques, usa um foco druídico e pode conjurar como ritual magias de ritual preparadas.'),
      f(2, 'Forma Selvagem', 'Com uma ação, transforme-se em uma besta que já tenha visto. Limites: ND 1/4 sem deslocamento de voo ou natação (2º); ND 1/2 sem voo (4º); ND 1 (8º). Dura até metade do seu nível de druida em horas. Você assume os PV e atributos físicos da besta; ao voltar, o dano excedente passa para sua forma normal. Não pode conjurar magias transformado, mas mantém a concentração.', { max: 2, reset: 'short' }),
      f(2, 'Círculo Druídico', 'Escolha um círculo druídico, que concede características no 2º, 6º, 10º e 14º níveis.'),
      f(4, 'Forma Selvagem Aprimorada (ND 1/2)', 'Você pode se transformar em bestas de ND até 1/2, inclusive com deslocamento de natação (ainda sem voo).'),
      ...asi(4, 8, 12, 16, 19),
      f(8, 'Forma Selvagem Aprimorada (ND 1)', 'Você pode se transformar em bestas de ND até 1, inclusive com deslocamento de voo.'),
      f(18, 'Corpo Atemporal', 'A magia primordial reduz seu envelhecimento: para cada 10 anos que passam, seu corpo envelhece apenas 1.'),
      f(18, 'Magias Bestiais', 'Você pode conjurar muitas magias em Forma Selvagem, realizando componentes verbais e somáticos, mas não pode fornecer componentes materiais.'),
      f(20, 'Arquidruida', 'Você pode usar Forma Selvagem um número ilimitado de vezes. Pode ignorar componentes verbais e somáticos das suas magias de druida, bem como componentes materiais sem custo que não sejam consumidos.'),
    ]),
    subclassLevel: 2,
    subclassLabel: 'Círculo Druídico',
    subclasses: [
      {
        id: 'land',
        name: 'Círculo da Terra',
        description: 'Místicos e sábios que guardam conhecimentos e ritos antigos; sua magia é moldada pela terra onde foram iniciados.',
        features: [
          f(2, 'Truque Adicional', 'Você aprende um truque de druida adicional à sua escolha.'),
          f(2, 'Recuperação Natural', 'Durante um descanso curto, recupere espaços de magia gastos com nível combinado igual ou menor que metade do seu nível de druida (arredondado para cima), nenhum de 6º nível ou superior. Uma vez por descanso longo.', { max: 1, reset: 'long' }),
          f(3, 'Magias de Círculo', 'Escolha um terreno — ártico, costa, deserto, floresta, campo, montanha, pântano ou Subterrâneo — e ganhe magias de círculo sempre preparadas no 3º, 5º, 7º e 9º níveis de druida.'),
          f(6, 'Caminho da Terra', 'Mover-se por terreno difícil não mágico não custa movimento extra, e plantas não mágicas não o atrasam nem causam dano. Você tem vantagem em salvaguardas contra plantas criadas ou manipuladas magicamente.'),
          f(10, 'Proteção Natural', 'Você não pode ser enfeitiçado nem amedrontado por elementais ou fadas, e é imune a veneno e doenças.'),
          f(14, 'Santuário Natural', 'Quando uma besta ou planta tentar atacá-lo, ela faz uma salvaguarda de Sabedoria contra sua CD de magia. Se falhar, deve escolher outro alvo ou o ataque erra automaticamente; se passar, fica imune a este efeito por 24 horas.'),
        ],
      },
      { id: 'moon', name: 'Círculo da Lua', description: 'Guardiões ferozes das terras selvagens com Forma Selvagem aprimorada para o combate.', features: [] },
      { id: 'dreams', name: 'Círculo dos Sonhos', description: 'Druidas ligados à Agrestia das Fadas, com cura mágica e passos entre sonhos.', features: [] },
    ],
    startingEquipment: [
      ['Escudo de madeira', 'Qualquer arma simples'],
      ['Cimitarra', 'Qualquer arma simples corpo a corpo'],
      ['Armadura de couro, pacote de aventureiro e foco druídico'],
    ],
    startingGold: '2d4×10 po',
  },
  // ===========================================================================
  // FEITICEIRO
  // ===========================================================================
  {
    id: 'sorcerer',
    name: 'Feiticeiro',
    description: 'Um conjurador cuja magia inata vem de um dom ou de uma linhagem sobrenatural, moldando magias com a força da vontade.',
    hitDie: 6,
    primaryAbility: ['cha'],
    saves: ['con', 'cha'],
    armorProfs: 'Nenhuma',
    weaponProfs: 'Adagas, dardos, fundas, bordões, bestas leves',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'] },
    spellcasting: { ability: 'cha', progression: 'full', prepares: false },
    features: sortFeatures([
      f(1, 'Conjuração', 'Você conjura magias de feiticeiro usando Carisma (CD = 8 + bônus de proficiência + mod. de Carisma). Conhece 4 truques e 2 magias de 1º nível, aprende mais ao subir de nível e pode trocar uma magia conhecida a cada nível. Pode usar um foco arcano.'),
      f(1, 'Origem de Feitiçaria', 'Escolha a origem do seu poder inato. Ela concede características no 1º, 6º, 14º e 18º níveis.'),
      f(2, 'Fonte de Magia', 'Você tem pontos de feitiçaria iguais ao seu nível de feiticeiro, recuperados em descanso longo. Conjuração Flexível: com uma ação bônus, converta um espaço de magia em pontos (iguais ao nível do espaço) ou crie espaços gastando pontos — 1º: 2, 2º: 3, 3º: 5, 4º: 6, 5º: 7 (máximo 5º nível). Espaços criados desaparecem após um descanso longo.', { max: 'level', reset: 'long' }),
      f(3, 'Metamagia', 'Escolha duas opções de Metamagia: Magia Cuidadosa, Distante, Potencializada, Estendida, Elevada, Acelerada, Sutil ou Duplicada. Ganhe mais uma no 10º e no 17º níveis. Só uma opção por magia, salvo indicação contrária.'),
      ...asi(4, 8, 12, 16, 19),
      f(10, 'Metamagia (adicional)', 'Aprenda mais uma opção de Metamagia.'),
      f(17, 'Metamagia (adicional)', 'Aprenda mais uma opção de Metamagia.'),
      f(20, 'Restauração Mística', 'Você recupera 4 pontos de feitiçaria gastos ao terminar um descanso curto.'),
    ]),
    subclassLevel: 1,
    subclassLabel: 'Origem de Feitiçaria',
    subclasses: [
      {
        id: 'draconic',
        name: 'Linhagem Dracônica',
        description: 'Sua magia inata vem da magia dracônica misturada ao sangue de um ancestral seu.',
        features: [
          f(1, 'Ancestral Dracônico', 'Escolha um tipo de dragão como ancestral; ele define o tipo de dano das suas características. Você fala, lê e escreve Dracônico e dobra o bônus de proficiência em testes de Carisma ao interagir com dragões.'),
          f(1, 'Resiliência Dracônica', 'Seu máximo de PV aumenta em 1 por nível de feiticeiro. Partes do seu corpo são cobertas por escamas: sem armadura, sua CA é 13 + mod. de Destreza.'),
          f(6, 'Afinidade Elemental', 'Quando conjurar uma magia que cause o tipo de dano do seu ancestral, some seu mod. de Carisma a uma jogada de dano dela. Também pode gastar 1 ponto de feitiçaria para ganhar resistência a esse tipo de dano por 1 hora.'),
          f(14, 'Asas de Dragão', 'Com uma ação bônus, faça brotar asas dracônicas, ganhando deslocamento de voo igual ao seu deslocamento atual até dispensá-las com outra ação bônus. Não funciona com armadura que não seja feita para acomodá-las.'),
          f(18, 'Presença Dracônica', 'Com uma ação e 5 pontos de feitiçaria, emane uma aura de admiração ou medo de 60 pés por 1 minuto (concentração). Cada criatura hostil que começar o turno na aura faz uma salvaguarda de Sabedoria ou fica enfeitiçada (admiração) ou amedrontada (medo) até a aura terminar. Quem passar fica imune por 24 horas.'),
        ],
      },
      { id: 'wild-magic', name: 'Magia Selvagem', description: 'Magia caótica e imprevisível vinda das forças do caos, com surtos de efeitos aleatórios.', features: [] },
      { id: 'divine-soul', name: 'Alma Divina', description: 'Um toque divino na alma que permite aprender magias da lista de clérigo.', features: [] },
    ],
    startingEquipment: [
      ['Besta leve e 20 virotes', 'Qualquer arma simples'],
      ['Bolsa de componentes', 'Foco arcano'],
      ['Pacote de explorador', 'Pacote de aventureiro'],
      ['Duas adagas'],
    ],
    startingGold: '3d4×10 po',
  },
  // ===========================================================================
  // GUERREIRO
  // ===========================================================================
  {
    id: 'fighter',
    name: 'Guerreiro',
    description: 'Um mestre do combate marcial, hábil com uma grande variedade de armas e armaduras.',
    hitDie: 10,
    primaryAbility: ['str', 'dex'],
    saves: ['str', 'con'],
    armorProfs: 'Todas as armaduras, escudos',
    weaponProfs: 'Armas simples, armas marciais',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['acrobatics', 'animalHandling', 'athletics', 'history', 'insight', 'intimidation', 'perception', 'survival'] },
    spellcasting: null,
    features: sortFeatures([
      f(1, 'Estilo de Luta', 'Escolha um estilo: Arquearia (+2 em ataques à distância com armas); Defesa (+1 na CA usando armadura); Duelismo (+2 de dano com arma corpo a corpo em uma mão e nenhuma outra arma); Combate com Armas Grandes (rerrolar 1 e 2 nos dados de dano de armas de duas mãos ou versáteis empunhadas com as duas mãos); Proteção (com escudo, use a reação para impor desvantagem a um ataque contra criatura a até 5 pés); Combate com Duas Armas (some o mod. de habilidade ao dano do segundo ataque).'),
      f(1, 'Retomar o Fôlego', 'Com uma ação bônus, recupere 1d10 + seu nível de guerreiro em pontos de vida. Uma vez por descanso curto ou longo.', { max: 1, reset: 'short' }),
      f(2, 'Surto de Ação', 'No seu turno, você pode realizar uma ação adicional. Uma vez por descanso curto ou longo; duas vezes a partir do 17º nível (mas só uma por turno).', { max: '2=1,17=2', reset: 'short' }),
      f(3, 'Arquétipo Marcial', 'Escolha um arquétipo marcial, que concede características no 3º, 7º, 10º, 15º e 18º níveis.'),
      ...asi(4, 6, 8, 12, 14, 16, 19),
      EXTRA_ATTACK,
      f(9, 'Indomável', 'Você pode rolar novamente uma salvaguarda em que falhou, devendo usar o novo resultado. Usos: 1 (9º), 2 (13º), 3 (17º) por descanso longo.', { max: '9=1,13=2,17=3', reset: 'long' }),
      f(11, 'Ataque Extra (2)', 'Você pode atacar três vezes sempre que realizar a ação de Ataque.'),
      f(13, 'Indomável (2 usos)', 'Você pode usar Indomável duas vezes entre descansos longos.'),
      f(17, 'Surto de Ação (2 usos)', 'Você pode usar Surto de Ação duas vezes entre descansos, mas apenas uma vez por turno.'),
      f(17, 'Indomável (3 usos)', 'Você pode usar Indomável três vezes entre descansos longos.'),
      f(20, 'Ataque Extra (3)', 'Você pode atacar quatro vezes sempre que realizar a ação de Ataque.'),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Arquétipo Marcial',
    subclasses: [
      {
        id: 'champion',
        name: 'Campeão',
        description: 'O Campeão foca no desenvolvimento do poder físico bruto, aprimorado até a perfeição mortal.',
        features: [
          f(3, 'Crítico Aprimorado', 'Seus ataques com arma conseguem acerto crítico com um resultado de 19 ou 20 no d20.'),
          f(7, 'Atleta Notável', 'Some metade do seu bônus de proficiência (arredondado para cima) a testes de Força, Destreza ou Constituição que ainda não o usem. Ao fazer um salto em distância com corrida, a distância aumenta em pés iguais ao seu mod. de Força.'),
          f(10, 'Estilo de Luta Adicional', 'Escolha uma segunda opção da característica Estilo de Luta.'),
          f(15, 'Crítico Superior', 'Seus ataques com arma conseguem acerto crítico com um resultado de 18 a 20 no d20.'),
          f(18, 'Sobrevivente', 'No início de cada um dos seus turnos, se tiver no máximo metade dos seus PV (e pelo menos 1), você recupera 5 + mod. de Constituição PV.'),
        ],
      },
      { id: 'battle-master', name: 'Mestre de Batalha', description: 'Usa dados de superioridade para manobras táticas que controlam o campo de batalha.', features: [] },
      { id: 'eldritch-knight', name: 'Cavaleiro Arcano', description: 'Combina maestria marcial com magia arcana de abjuração e evocação (conjurador de um terço).', features: [] },
    ],
    startingEquipment: [
      ['Cota de malha', 'Armadura de couro, arco longo e 20 flechas'],
      ['Uma arma marcial e um escudo', 'Duas armas marciais'],
      ['Besta leve e 20 virotes', 'Duas machadinhas'],
      ['Pacote de explorador', 'Pacote de aventureiro'],
    ],
    startingGold: '5d4×10 po',
  },
  // ===========================================================================
  // LADINO
  // ===========================================================================
  {
    id: 'rogue',
    name: 'Ladino',
    description: 'Um trapaceiro que usa furtividade e astúcia para superar obstáculos e inimigos, golpeando onde mais dói.',
    hitDie: 8,
    primaryAbility: ['dex'],
    saves: ['dex', 'int'],
    armorProfs: 'Armaduras leves',
    weaponProfs: 'Armas simples, bestas de mão, espadas longas, rapieiras, espadas curtas',
    toolProfs: 'Ferramentas de ladrão',
    skillChoices: {
      count: 4,
      from: ['acrobatics', 'athletics', 'deception', 'insight', 'intimidation', 'investigation', 'perception', 'performance', 'persuasion', 'sleightOfHand', 'stealth'],
    },
    spellcasting: null,
    features: sortFeatures([
      f(1, 'Aptidão', 'Escolha duas perícias em que seja proficiente (ou uma perícia e ferramentas de ladrão): seu bônus de proficiência é dobrado em testes com elas. No 6º nível, escolha mais duas.'),
      f(1, 'Ataque Furtivo (1d6)', 'Uma vez por turno, cause dano extra a uma criatura que atingir com um ataque usando arma de acuidade ou à distância, se tiver vantagem na jogada ou se outro inimigo do alvo estiver a até 5 pés dele (não incapacitado) e você não tiver desvantagem. O dano é 1d6 e aumenta em 1d6 a cada dois níveis (10d6 no 19º).'),
      f(1, 'Gíria dos Ladrões', 'Você conhece a gíria dos ladrões, uma mistura secreta de dialeto, jargão e códigos que permite esconder mensagens em conversas aparentemente normais, além de sinais secretos.'),
      f(2, 'Ação Ardilosa', 'Você pode usar uma ação bônus em cada um dos seus turnos para realizar a ação Disparada, Desengajar ou Esconder.'),
      f(3, 'Arquétipo de Ladino', 'Escolha um arquétipo, que concede características no 3º, 9º, 13º e 17º níveis.'),
      f(3, 'Ataque Furtivo (2d6)', 'O dano do Ataque Furtivo aumenta para 2d6.'),
      ...asi(4, 8, 10, 12, 16, 19),
      f(5, 'Esquiva Sobrenatural', 'Quando um atacante que você possa ver o atingir com um ataque, use sua reação para reduzir o dano desse ataque à metade.'),
      f(5, 'Ataque Furtivo (3d6)', 'O dano do Ataque Furtivo aumenta para 3d6.'),
      f(6, 'Aptidão (adicional)', 'Escolha mais duas perícias proficientes (ou ferramentas de ladrão) para dobrar o bônus de proficiência.'),
      f(7, 'Evasão', EVASION_TEXT),
      f(7, 'Ataque Furtivo (4d6)', 'O dano do Ataque Furtivo aumenta para 4d6.'),
      f(9, 'Ataque Furtivo (5d6)', 'O dano do Ataque Furtivo aumenta para 5d6.'),
      f(11, 'Talento Confiável', 'Ao fazer um teste de habilidade que inclua seu bônus de proficiência, trate um resultado de 9 ou menos no d20 como 10.'),
      f(11, 'Ataque Furtivo (6d6)', 'O dano do Ataque Furtivo aumenta para 6d6.'),
      f(13, 'Ataque Furtivo (7d6)', 'O dano do Ataque Furtivo aumenta para 7d6.'),
      f(14, 'Sentido Cego', 'Se puder ouvir, você sabe a localização de qualquer criatura escondida ou invisível a até 10 pés de você.'),
      f(15, 'Mente Escorregadia', 'Você ganha proficiência em salvaguardas de Sabedoria.'),
      f(15, 'Ataque Furtivo (8d6)', 'O dano do Ataque Furtivo aumenta para 8d6.'),
      f(17, 'Ataque Furtivo (9d6)', 'O dano do Ataque Furtivo aumenta para 9d6.'),
      f(18, 'Elusivo', 'Nenhuma jogada de ataque tem vantagem contra você enquanto não estiver incapacitado.'),
      f(19, 'Ataque Furtivo (10d6)', 'O dano do Ataque Furtivo aumenta para 10d6.'),
      f(20, 'Golpe de Sorte', 'Se errar um ataque contra um alvo ao seu alcance, você pode transformar o erro em acerto; ou, se falhar em um teste de habilidade, tratar o d20 como 20. Uma vez por descanso curto ou longo.', { max: 1, reset: 'short' }),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Arquétipo de Ladino',
    subclasses: [
      {
        id: 'thief',
        name: 'Ladrão',
        description: 'Mestres da infiltração, do furto e da escalada — e caçadores de tesouros capazes de usar quase qualquer item mágico.',
        features: [
          f(3, 'Mãos Rápidas', 'Você pode usar a ação bônus da Ação Ardilosa para fazer um teste de Destreza (Prestidigitação), usar ferramentas de ladrão para desarmar uma armadilha ou abrir uma fechadura, ou realizar a ação Usar um Objeto.'),
          f(3, 'Andar de Cima', 'Escalar não lhe custa movimento extra. Ao fazer um salto com corrida, a distância aumenta em pés iguais ao seu mod. de Destreza.'),
          f(9, 'Furtividade Suprema', 'Você tem vantagem em testes de Destreza (Furtividade) se não se mover mais da metade do seu deslocamento no turno.'),
          f(13, 'Usar Instrumento Mágico', 'Você ignora todos os requisitos de classe, raça e nível para usar itens mágicos.'),
          f(17, 'Reflexos de Ladrão', 'Você realiza dois turnos durante a primeira rodada de qualquer combate: o primeiro na sua iniciativa normal e o segundo na sua iniciativa − 10. Não funciona se estiver surpreso.'),
        ],
      },
      { id: 'assassin', name: 'Assassino', description: 'Especialista em disfarces, venenos e golpes mortais contra alvos surpresos.', features: [] },
      { id: 'arcane-trickster', name: 'Trapaceiro Arcano', description: 'Ladino que aprimora suas habilidades com ilusões e encantamentos (conjurador de um terço).', features: [] },
    ],
    startingEquipment: [
      ['Rapieira', 'Espada curta'],
      ['Arco curto e aljava com 20 flechas', 'Espada curta'],
      ['Pacote de assaltante', 'Pacote de explorador', 'Pacote de aventureiro'],
      ['Armadura de couro, duas adagas e ferramentas de ladrão'],
    ],
    startingGold: '4d4×10 po',
  },
  // ===========================================================================
  // MAGO
  // ===========================================================================
  {
    id: 'wizard',
    name: 'Mago',
    description: 'Um usuário de magia erudito, capaz de manipular as estruturas da realidade por meio de estudo meticuloso.',
    hitDie: 6,
    primaryAbility: ['int'],
    saves: ['int', 'wis'],
    armorProfs: 'Nenhuma',
    weaponProfs: 'Adagas, dardos, fundas, bordões, bestas leves',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'religion'] },
    spellcasting: { ability: 'int', progression: 'full', prepares: true },
    features: sortFeatures([
      f(1, 'Conjuração', 'Seu grimório começa com seis magias de mago de 1º nível e você adiciona duas a cada nível. Prepare mod. de Inteligência + nível de mago magias do grimório (mínimo 1). CD = 8 + bônus de proficiência + mod. de Inteligência. Conhece 3 truques, pode conjurar rituais do grimório sem prepará-los e copiar magias encontradas (2 horas e 50 po por nível da magia). Usa um foco arcano.'),
      f(1, 'Recuperação Arcana', 'Uma vez por dia, ao terminar um descanso curto, recupere espaços de magia gastos com nível combinado igual ou menor que metade do seu nível de mago (arredondado para cima), nenhum de 6º nível ou superior.', { max: 1, reset: 'long' }),
      f(2, 'Tradição Arcana', 'Escolha uma escola de magia como tradição arcana. Ela concede características no 2º, 6º, 10º e 14º níveis.'),
      ...asi(4, 8, 12, 16, 19),
      f(18, 'Domínio de Magia', 'Escolha uma magia de mago de 1º nível e uma de 2º nível do seu grimório. Com elas preparadas, você pode conjurá-las no nível mínimo sem gastar espaços. Pode trocá-las com 8 horas de estudo.'),
      f(20, 'Assinatura Mágica', 'Escolha duas magias de mago de 3º nível do grimório como assinaturas: estão sempre preparadas, não contam no limite e cada uma pode ser conjurada uma vez no 3º nível sem gastar espaço, recuperando ao terminar um descanso curto ou longo.', { max: 2, reset: 'short' }),
    ]),
    subclassLevel: 2,
    subclassLabel: 'Tradição Arcana',
    subclasses: [
      {
        id: 'evocation',
        name: 'Escola de Evocação',
        description: 'Evocadores criam efeitos elementais poderosos — frio cortante, chamas abrasadoras, trovões e relâmpagos.',
        features: [
          f(2, 'Evocação Instruída', 'O ouro e o tempo necessários para copiar uma magia de evocação no seu grimório são reduzidos à metade.'),
          f(2, 'Esculpir Magias', 'Ao conjurar uma magia de evocação que afete outras criaturas que você possa ver, escolha até 1 + nível da magia delas: elas passam automaticamente na salvaguarda e não sofrem dano se normalmente sofreriam metade.'),
          f(6, 'Truque Potente', 'Seus truques de dano afetam até quem os evita: uma criatura que passar na salvaguarda contra seu truque sofre metade do dano (mas nenhum outro efeito).'),
          f(10, 'Evocação Potencializada', 'Some seu mod. de Inteligência a uma jogada de dano de qualquer magia de evocação de mago que conjurar.'),
          f(14, 'Sobrecarga', 'Ao conjurar uma magia de mago de 1º a 5º nível que cause dano, você pode causar o dano máximo. O primeiro uso não tem custo; cada uso adicional antes de um descanso longo causa a você 2d12 de dano necrótico por nível da magia (+1d12 por uso extra), ignorando resistência e imunidade.'),
        ],
      },
      { id: 'abjuration', name: 'Escola de Abjuração', description: 'Especialista em magias de proteção, banimento e bloqueio, com uma égide arcana.', features: [] },
      { id: 'conjuration', name: 'Escola de Conjuração', description: 'Invoca criaturas e objetos e se teletransporta pelo campo de batalha.', features: [] },
      { id: 'divination', name: 'Escola de Adivinhação', description: 'Prevê o futuro e manipula a sorte com presságios.', features: [] },
      { id: 'enchantment', name: 'Escola de Encantamento', description: 'Controla mentes e encanta criaturas com olhar hipnótico.', features: [] },
      { id: 'illusion', name: 'Escola de Ilusão', description: 'Cria ilusões convincentes que confundem os sentidos e podem se tornar reais.', features: [] },
      { id: 'necromancy', name: 'Escola de Necromancia', description: 'Manipula as forças da vida e da morte e comanda mortos-vivos.', features: [] },
      { id: 'transmutation', name: 'Escola de Transmutação', description: 'Transforma matéria e energia, criando a pedra do transmutador.', features: [] },
    ],
    startingEquipment: [
      ['Bordão', 'Adaga'],
      ['Bolsa de componentes', 'Foco arcano'],
      ['Pacote de estudioso', 'Pacote de aventureiro'],
      ['Grimório'],
    ],
    startingGold: '4d4×10 po',
  },
  // ===========================================================================
  // MONGE
  // ===========================================================================
  {
    id: 'monk',
    name: 'Monge',
    description: 'Um mestre das artes marciais que canaliza o poder do corpo — o ki — em busca da perfeição física e espiritual.',
    hitDie: 8,
    primaryAbility: ['dex', 'wis'],
    saves: ['str', 'dex'],
    armorProfs: 'Nenhuma',
    weaponProfs: 'Armas simples, espadas curtas',
    toolProfs: 'Um tipo de ferramenta de artesão ou um instrumento musical à sua escolha',
    skillChoices: { count: 2, from: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'] },
    spellcasting: null,
    features: sortFeatures([
      f(1, 'Defesa sem Armadura', 'Sem armadura e sem escudo, sua CA é 10 + mod. de Destreza + mod. de Sabedoria.'),
      f(1, 'Artes Marciais (d4)', 'Sem armadura e sem escudo, usando ataques desarmados ou armas de monge (espadas curtas e armas simples corpo a corpo sem as propriedades duas mãos ou pesada): pode usar Destreza em vez de Força; pode rolar o dado de Artes Marciais no lugar do dano normal (d4; d6 no 5º, d8 no 11º, d10 no 17º); e, ao usar a ação de Ataque, pode fazer um ataque desarmado como ação bônus.'),
      f(2, 'Ki', 'Você tem pontos de ki iguais ao seu nível de monge, recuperados em descanso curto ou longo (CD de ki = 8 + bônus de proficiência + mod. de Sabedoria). Rajada de Golpes (1 ki: dois ataques desarmados como ação bônus após a ação de Ataque); Defesa Paciente (1 ki: Esquivar como ação bônus); Passo do Vento (1 ki: Desengajar ou Disparada como ação bônus, e sua distância de salto dobra no turno).', { max: 'level', reset: 'short' }),
      f(2, 'Movimento sem Armadura (+10 pés)', 'Seu deslocamento aumenta em 10 pés sem armadura e sem escudo. O bônus aumenta para 15 (6º), 20 (10º), 25 (14º) e 30 pés (18º).'),
      f(3, 'Tradição Monástica', 'Escolha uma tradição monástica, que concede características no 3º, 6º, 11º e 17º níveis.'),
      f(3, 'Defletir Projéteis', 'Com sua reação, ao ser atingido por um ataque à distância com arma, reduza o dano em 1d10 + mod. de Destreza + nível de monge. Se reduzir a 0 e tiver uma mão livre, pode pegar o projétil e, gastando 1 ki, arremessá-lo como parte da mesma reação (alcance 20/60 pés, proficiente, dano do dado de Artes Marciais).'),
      ...asi(4, 8, 12, 16, 19),
      f(4, 'Queda Lenta', 'Com sua reação ao cair, reduza o dano de queda em 5 × seu nível de monge.'),
      EXTRA_ATTACK,
      f(5, 'Ataque Atordoante', 'Ao atingir outra criatura com um ataque corpo a corpo com arma, gaste 1 ki: o alvo faz uma salvaguarda de Constituição ou fica atordoado até o fim do seu próximo turno.'),
      f(5, 'Artes Marciais (d6)', 'Seu dado de Artes Marciais passa a ser um d6.'),
      f(6, 'Golpes Potencializados por Ki', 'Seus ataques desarmados contam como mágicos para superar resistência e imunidade a ataques e dano não mágicos.'),
      f(6, 'Movimento sem Armadura (+15 pés)', 'O bônus de deslocamento sem armadura aumenta para 15 pés.'),
      f(7, 'Evasão', EVASION_TEXT),
      f(7, 'Mente Tranquila', 'Com uma ação, encerre um efeito em você que o deixe enfeitiçado ou amedrontado.'),
      f(9, 'Movimento sem Armadura Aprimorado', 'Você pode se mover por superfícies verticais e sobre líquidos durante o seu turno sem cair.'),
      f(10, 'Pureza Corporal', 'Seu domínio do ki o torna imune a doenças e venenos.'),
      f(10, 'Movimento sem Armadura (+20 pés)', 'O bônus de deslocamento sem armadura aumenta para 20 pés.'),
      f(11, 'Artes Marciais (d8)', 'Seu dado de Artes Marciais passa a ser um d8.'),
      f(13, 'Idioma do Sol e da Lua', 'Você entende todos os idiomas falados, e qualquer criatura que entenda um idioma consegue entender o que você diz.'),
      f(14, 'Alma de Diamante', 'Você ganha proficiência em todas as salvaguardas. Ao falhar em uma, pode gastar 1 ki para rolar novamente e usar o segundo resultado.'),
      f(14, 'Movimento sem Armadura (+25 pés)', 'O bônus de deslocamento sem armadura aumenta para 25 pés.'),
      f(15, 'Corpo Atemporal', 'Você não sofre as fragilidades da velhice e não pode ser envelhecido magicamente. Não precisa mais de comida nem de água.'),
      f(17, 'Artes Marciais (d10)', 'Seu dado de Artes Marciais passa a ser um d10.'),
      f(18, 'Corpo Vazio', 'Com uma ação e 4 ki, fique invisível por 1 minuto, com resistência a todo dano exceto energia. Com 8 ki, conjure projeção astral sem componentes materiais (apenas em si mesmo).'),
      f(18, 'Movimento sem Armadura (+30 pés)', 'O bônus de deslocamento sem armadura aumenta para 30 pés.'),
      f(20, 'Autoaperfeiçoamento', 'Ao rolar iniciativa sem pontos de ki restantes, você recupera 4 pontos de ki.'),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Tradição Monástica',
    subclasses: [
      {
        id: 'open-hand',
        name: 'Caminho da Mão Aberta',
        description: 'Os mestres supremos do combate desarmado, capazes de empurrar, derrubar e até matar com um toque.',
        features: [
          f(3, 'Técnica da Mão Aberta', 'Ao atingir uma criatura com um ataque da Rajada de Golpes, imponha um efeito: salvaguarda de Destreza ou cai derrubada; salvaguarda de Força ou é empurrada até 15 pés para longe; ou não pode realizar reações até o fim do seu próximo turno.'),
          f(6, 'Integridade Corporal', 'Com uma ação, recupere pontos de vida iguais a 3 × seu nível de monge. Uma vez por descanso longo.', { max: 1, reset: 'long' }),
          f(11, 'Tranquilidade', 'Ao fim de um descanso longo, você ganha o efeito da magia santuário até o início do próximo descanso longo (o efeito termina antes normalmente). CD = 8 + mod. de Sabedoria + bônus de proficiência.'),
          f(17, 'Palma Vibrante', 'Ao atingir uma criatura com um ataque desarmado, gaste 3 ki para criar vibrações imperceptíveis que duram dias iguais ao seu nível de monge. Com uma ação, encerre-as: o alvo faz uma salvaguarda de Constituição; se falhar, cai a 0 PV; se passar, sofre 10d10 de dano necrótico. Apenas uma criatura por vez.'),
        ],
      },
      { id: 'shadow', name: 'Caminho da Sombra', description: 'Monges ninjas que usam escuridão, silêncio e passos entre sombras.', features: [] },
      { id: 'four-elements', name: 'Caminho dos Quatro Elementos', description: 'Monges que canalizam o ki para controlar o fogo, a água, a terra e o ar.', features: [] },
    ],
    startingEquipment: [
      ['Espada curta', 'Qualquer arma simples'],
      ['Pacote de explorador', 'Pacote de aventureiro'],
      ['10 dardos'],
    ],
    startingGold: '5d4 po',
  },
  // ===========================================================================
  // PALADINO
  // ===========================================================================
  {
    id: 'paladin',
    name: 'Paladino',
    description: 'Um guerreiro sagrado unido por um juramento, que combina proezas marciais com magia divina.',
    hitDie: 10,
    primaryAbility: ['str', 'cha'],
    saves: ['wis', 'cha'],
    armorProfs: 'Todas as armaduras, escudos',
    weaponProfs: 'Armas simples, armas marciais',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 2, from: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'] },
    spellcasting: { ability: 'cha', progression: 'half', prepares: true },
    features: sortFeatures([
      f(1, 'Sentido Divino', 'Com uma ação, até o fim do seu próximo turno você sabe a localização de qualquer celestial, corruptor ou morto-vivo a até 60 pés que não esteja atrás de cobertura total, e detecta lugares ou objetos consagrados ou profanados. Usos: 1 + mod. de Carisma por descanso longo.', { max: '1+cha', reset: 'long' }),
      f(1, 'Cura pelas Mãos', 'Você tem uma reserva de cura igual a 5 × seu nível de paladino, recuperada em descanso longo. Com uma ação, toque uma criatura e restaure PV da reserva, ou gaste 5 PV para curar uma doença ou neutralizar um veneno. Não afeta mortos-vivos nem constructos.', { max: 'level*5', reset: 'long' }),
      f(2, 'Estilo de Luta', 'Escolha um estilo: Defesa, Duelismo, Combate com Armas Grandes ou Proteção.'),
      f(2, 'Conjuração', 'Você prepara magias de paladino usando Carisma: mod. de Carisma + metade do nível de paladino (mínimo 1). CD = 8 + bônus de proficiência + mod. de Carisma. Pode usar um símbolo sagrado como foco.'),
      f(2, 'Destruição Divina', 'Ao atingir uma criatura com um ataque corpo a corpo com arma, gaste um espaço de magia para causar dano radiante extra: 2d8 para um espaço de 1º nível, +1d8 por nível acima do 1º (máximo 5d8). +1d8 se o alvo for morto-vivo ou corruptor.'),
      f(3, 'Saúde Divina', 'A magia divina que flui por você o torna imune a doenças.'),
      f(3, 'Juramento Sagrado', 'Faça o juramento que o une como paladino. Ele concede magias de juramento e características no 3º, 7º, 15º e 20º níveis.'),
      f(3, 'Canalizar Divindade', 'Seu juramento permite canalizar energia divina para efeitos mágicos. Um uso por descanso curto ou longo; CD = CD de magia de paladino.', { max: 1, reset: 'short' }),
      ...asi(4, 8, 12, 16, 19),
      EXTRA_ATTACK,
      f(6, 'Aura de Proteção', 'Enquanto você estiver consciente, você e criaturas amigas a até 10 pés somam seu mod. de Carisma (mínimo +1) às salvaguardas. O alcance passa a 30 pés no 18º nível.'),
      f(10, 'Aura de Coragem', 'Enquanto você estiver consciente, você e criaturas amigas a até 10 pés não podem ficar amedrontados. O alcance passa a 30 pés no 18º nível.'),
      f(11, 'Destruição Divina Aprimorada', 'Sempre que atingir uma criatura com uma arma corpo a corpo, ela sofre 1d8 de dano radiante extra.'),
      f(14, 'Toque Purificador', 'Com uma ação, encerre uma magia em você ou em uma criatura voluntária que tocar. Usos: mod. de Carisma (mínimo 1) por descanso longo.', { max: 'cha', reset: 'long' }),
      f(18, 'Aprimoramentos de Aura', 'O alcance das suas auras aumenta para 30 pés.'),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Juramento Sagrado',
    subclasses: [
      {
        id: 'devotion',
        name: 'Juramento de Devoção',
        description: 'O ideal do cavaleiro de armadura brilhante: honra, justiça, virtude e ordem acima de tudo.',
        features: [
          f(3, 'Princípios da Devoção', 'Honestidade, Coragem, Compaixão, Honra e Dever.'),
          f(3, 'Magias de Juramento', 'Sempre preparadas: proteção contra o bem e mal, santuário (3º); restauração menor, zona da verdade (5º); sinal de esperança, dissipar magia (9º); liberdade de movimento, guardião da fé (13º); comunhão, coluna de chamas (17º).'),
          f(3, 'Canalizar Divindade: Arma Sagrada', 'Com uma ação, imbua uma arma que esteja segurando por 1 minuto: some seu mod. de Carisma (mínimo +1) às jogadas de ataque com ela, que emite luz plena em 20 pés e penumbra por mais 20 pés e conta como mágica.'),
          f(3, 'Canalizar Divindade: Expulsar o Profano', 'Com uma ação, cada corruptor ou morto-vivo a até 30 pés que possa vê-lo ou ouvi-lo faz uma salvaguarda de Sabedoria; se falhar, fica expulso por 1 minuto ou até sofrer dano.'),
          f(7, 'Aura de Devoção', 'Enquanto você estiver consciente, você e criaturas amigas a até 10 pés não podem ser enfeitiçados. O alcance passa a 30 pés no 18º nível.'),
          f(15, 'Pureza de Espírito', 'Você está sempre sob os efeitos da magia proteção contra o bem e mal.'),
          f(20, 'Halo Sagrado', 'Com uma ação, emane uma aura de luz solar por 1 minuto: luz plena em 30 pés e penumbra por mais 30 pés. Inimigos que começarem o turno na luz plena sofrem 10 de dano radiante. Você tem vantagem em salvaguardas contra magias de corruptores e mortos-vivos. Uma vez por descanso longo.', { max: 1, reset: 'long' }),
        ],
      },
      { id: 'ancients', name: 'Juramento dos Anciões', description: 'Defende a luz, a vida e a beleza do mundo contra a escuridão.', features: [] },
      { id: 'vengeance', name: 'Juramento de Vingança', description: 'Caçador implacável dedicado a punir os que cometeram pecados graves.', features: [] },
    ],
    startingEquipment: [
      ['Uma arma marcial e um escudo', 'Duas armas marciais'],
      ['Cinco azagaias', 'Qualquer arma simples corpo a corpo'],
      ['Pacote de sacerdote', 'Pacote de aventureiro'],
      ['Cota de malha e símbolo sagrado'],
    ],
    startingGold: '5d4×10 po',
  },
  // ===========================================================================
  // PATRULHEIRO
  // ===========================================================================
  {
    id: 'ranger',
    name: 'Patrulheiro',
    description: 'Um guerreiro das fronteiras que usa proezas marciais e magia da natureza para combater as ameaças das terras selvagens.',
    hitDie: 10,
    primaryAbility: ['dex', 'wis'],
    saves: ['str', 'dex'],
    armorProfs: 'Armaduras leves, armaduras médias, escudos',
    weaponProfs: 'Armas simples, armas marciais',
    toolProfs: 'Nenhuma',
    skillChoices: { count: 3, from: ['animalHandling', 'athletics', 'insight', 'investigation', 'nature', 'perception', 'stealth', 'survival'] },
    spellcasting: { ability: 'wis', progression: 'half', prepares: false },
    features: sortFeatures([
      f(1, 'Inimigo Favorito', 'Escolha um tipo de inimigo favorito: aberrações, bestas, celestiais, constructos, dragões, elementais, fadas, corruptores, gigantes, monstruosidades, limos, plantas ou mortos-vivos (ou duas raças de humanoides). Você tem vantagem em testes de Sabedoria (Sobrevivência) para rastreá-los e de Inteligência para recordar informações sobre eles, e aprende um idioma falado por eles. Escolha mais um no 6º e no 14º níveis.'),
      f(1, 'Explorador Natural', 'Escolha um terreno favorito: ártico, costa, deserto, floresta, campo, montanha, pântano ou Subterrâneo. Em testes de Inteligência ou Sabedoria relacionados a ele, você dobra o bônus de proficiência. Viajando por 1 hora ou mais nele: terreno difícil não atrasa o grupo; o grupo não se perde exceto por magia; você permanece alerta ao perigo; viajando sozinho, move-se furtivamente em ritmo normal; encontra o dobro de comida; e obtém informações precisas sobre criaturas rastreadas. Mais terrenos no 6º e no 10º níveis.'),
      f(2, 'Estilo de Luta', 'Escolha um estilo: Arquearia, Defesa, Duelismo ou Combate com Duas Armas.'),
      f(2, 'Conjuração', 'Você conhece magias de patrulheiro e as conjura usando Sabedoria (CD = 8 + bônus de proficiência + mod. de Sabedoria). Conhece 2 magias de 1º nível no 2º nível e aprende mais conforme a tabela da classe.'),
      f(3, 'Arquétipo de Patrulheiro', 'Escolha um arquétipo, que concede características no 3º, 7º, 11º e 15º níveis.'),
      f(3, 'Prontidão Primitiva', 'Com uma ação e um espaço de magia, por 1 minuto por nível do espaço você sente se há aberrações, celestiais, dragões, elementais, fadas, corruptores ou mortos-vivos a até 1 milha (6 milhas no seu terreno favorito). Não revela localização nem quantidade.'),
      ...asi(4, 8, 12, 16, 19),
      EXTRA_ATTACK,
      f(6, 'Inimigo Favorito e Explorador Natural Aprimorados', 'Escolha um inimigo favorito e um terreno favorito adicionais.'),
      f(8, 'Caminho da Terra', 'Mover-se por terreno difícil não mágico não custa movimento extra, e plantas não mágicas não o atrasam nem causam dano. Vantagem em salvaguardas contra plantas criadas ou manipuladas magicamente.'),
      f(10, 'Explorador Natural Aprimorado', 'Escolha um terreno favorito adicional.'),
      f(10, 'Camuflagem Natural', 'Gaste 1 minuto criando uma camuflagem com lama, folhas e outros materiais naturais. Enquanto permanecer imóvel junto a uma superfície sólida, você tem +10 em testes de Destreza (Furtividade).'),
      f(14, 'Desaparecer', 'Você pode usar a ação Esconder como ação bônus. Além disso, não pode ser rastreado por meios não mágicos, a menos que escolha deixar rastros.'),
      f(14, 'Inimigo Favorito Aprimorado', 'Escolha um inimigo favorito adicional.'),
      f(18, 'Sentidos Selvagens', 'Atacar uma criatura que você não possa ver não impõe desvantagem. Você sabe a localização de qualquer criatura invisível a até 30 pés que não esteja escondida de você, desde que não esteja cego nem surdo.'),
      f(20, 'Matador de Inimigos', 'Uma vez em cada um dos seus turnos, some seu mod. de Sabedoria à jogada de ataque ou de dano de um ataque contra um inimigo favorito.'),
    ]),
    subclassLevel: 3,
    subclassLabel: 'Arquétipo de Patrulheiro',
    subclasses: [
      {
        id: 'hunter',
        name: 'Caçador',
        description: 'Aceita o papel de baluarte entre a civilização e os horrores das terras selvagens, especializando-se em caçar ameaças.',
        features: [
          f(3, 'Presa do Caçador', 'Escolha: Assassino de Colossos (uma vez por turno, +1d8 de dano contra criatura abaixo do seu máximo de PV); Matador de Gigantes (quando uma criatura Grande ou maior a até 5 pés atacá-lo, use a reação para atacá-la logo após); ou Destruidor de Hordas (uma vez por turno, faça outro ataque contra uma criatura diferente a até 5 pés do alvo original e ao seu alcance).'),
          f(7, 'Táticas Defensivas', 'Escolha: Escapar da Horda (ataques de oportunidade contra você têm desvantagem); Defesa contra Ataques Múltiplos (ao ser atingido, +4 na CA contra os demais ataques daquela criatura no turno); ou Vontade de Aço (vantagem em salvaguardas contra ficar amedrontado).'),
          f(11, 'Ataque Múltiplo', 'Escolha: Saraivada (com uma ação, faça um ataque à distância contra qualquer número de criaturas a até 10 pés de um ponto que possa ver, com uma jogada para cada); ou Ataque Giratório (com uma ação, faça um ataque corpo a corpo contra cada criatura a até 5 pés, com uma jogada para cada).'),
          f(15, 'Defesa Superior do Caçador', 'Escolha: Evasão; Manter-se Contra a Maré (quando um ataque corpo a corpo errar você, use a reação para redirecioná-lo a outra criatura, usando a mesma jogada); ou Esquiva Sobrenatural (use a reação para reduzir à metade o dano de um ataque que o atingir).'),
        ],
      },
      { id: 'beast-master', name: 'Mestre das Feras', description: 'Luta lado a lado com um companheiro animal treinado.', features: [] },
      { id: 'horizon-walker', name: 'Andarilho do Horizonte', description: 'Guardião planar que protege o mundo de ameaças de outros planos.', features: [] },
    ],
    startingEquipment: [
      ['Brunea', 'Armadura de couro'],
      ['Duas espadas curtas', 'Duas armas simples corpo a corpo'],
      ['Pacote de explorador', 'Pacote de aventureiro'],
      ['Arco longo e aljava com 20 flechas'],
    ],
    startingGold: '5d4×10 po',
  },
];

export const CLASSES_BY_ID: Record<string, ClassData> = Object.fromEntries(CLASSES.map((c) => [c.id, c]));

/** Features (class + chosen subclass) gained at or below `level`, sorted by level. */
export function classFeaturesUpTo(classId: string, level: number, subclassId?: string | null): ClassFeature[] {
  const cls = CLASSES_BY_ID[classId];
  if (!cls) return [];
  const sub = subclassId ? cls.subclasses.find((s) => s.id === subclassId || s.name === subclassId) : undefined;
  return sortFeatures([...cls.features, ...(sub?.features ?? [])].filter((ft) => ft.level <= level));
}

/** Context for `resolveUses`. `mods` are ability modifiers. */
export interface UsesContext {
  level: number;
  prof: number;
  mods: Partial<Record<Ability, number>>;
}

const ABILITY_KEYS = new Set<string>(['str', 'dex', 'con', 'int', 'wis', 'cha']);

/**
 * Resolve a `ClassFeature.uses.max` value (see the mini-language at the top of this file).
 * Returns 0 if the expression is not understood. 99 means unlimited.
 */
export function resolveUses(max: number | string, ctx: UsesContext): number {
  if (typeof max === 'number') return max;
  const expr = max.replace(/\s+/g, '');
  if (expr.includes('=')) {
    let value = 0;
    for (const pair of expr.split(',')) {
      const [lvl, val] = pair.split('=').map(Number);
      if (Number.isFinite(lvl) && Number.isFinite(val) && ctx.level >= lvl) value = val;
    }
    return value;
  }
  let total = 0;
  let usesAbility = false;
  for (const term of expr.split('+')) {
    if (/^\d+$/.test(term)) total += Number(term);
    else if (term === 'prof') total += ctx.prof;
    else if (ABILITY_KEYS.has(term)) {
      usesAbility = true;
      total += ctx.mods[term as Ability] ?? 0;
    } else {
      const m = /^level(?:([*/])(\d+))?$/.exec(term);
      if (!m) return 0;
      const n = Number(m[2] ?? 1);
      total += m[1] === '/' ? Math.floor(ctx.level / n) : ctx.level * n;
    }
  }
  // Ability-based uses are always at least 1 ("mínimo 1").
  return usesAbility ? Math.max(1, total) : total;
}
