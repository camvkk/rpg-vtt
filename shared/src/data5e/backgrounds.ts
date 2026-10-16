// Backgrounds (PT-BR). Acólito is from SRD 5.1 (CC-BY-4.0); the others follow the PHB.
import type { BackgroundData } from './types.ts';

export const BACKGROUNDS: BackgroundData[] = [
  {
    id: 'acolyte',
    name: 'Acólito',
    description:
      'Você passou a vida a serviço de um templo, atuando como intermediário entre o reino sagrado e o mundo mortal, realizando ritos e oferecendo sacrifícios.',
    skillProfs: ['insight', 'religion'],
    toolProfs: 'Nenhuma',
    languages: 'Dois idiomas à sua escolha',
    equipment:
      'Um símbolo sagrado (presente de quando você entrou no sacerdócio), um livro de orações ou roda de orações, 5 varetas de incenso, vestimentas, um conjunto de roupas comuns e uma algibeira com 15 po',
    feature: {
      name: 'Abrigo dos Fiéis',
      text: 'Você e seus companheiros podem receber cura e cuidados gratuitos em templos, santuários e outras presenças da sua fé (os componentes materiais de magias ficam por sua conta). Fiéis da sua religião o sustentarão com um estilo de vida modesto, e você mantém laços com um templo específico, onde tem aposentos e pode pedir ajuda.',
    },
  },
  {
    id: 'guild-artisan',
    name: 'Artesão de Guilda',
    description:
      'Você é membro de uma guilda de artesãos, hábil em um ofício específico e associado a outros artífices. Aprendeu como aprendiz e hoje é reconhecido pela qualidade do seu trabalho.',
    skillProfs: ['insight', 'persuasion'],
    toolProfs: 'Um tipo de ferramentas de artesão',
    languages: 'Um idioma à sua escolha',
    equipment:
      'Um conjunto de ferramentas de artesão (à sua escolha), uma carta de apresentação da sua guilda, um conjunto de roupas de viajante e uma algibeira com 15 po',
    feature: {
      name: 'Membro de Guilda',
      text: 'Sua guilda oferece hospedagem e comida quando necessário e paga seu funeral. Em algumas cidades, há um salão da guilda onde você pode encontrar membros, contatos e clientes. A guilda pode ajudá-lo em processos legais e lhe dá acesso a figuras políticas poderosas, desde que você pague a taxa de 5 po por mês.',
    },
  },
  {
    id: 'entertainer',
    name: 'Artista',
    description:
      'Você prospera diante de uma plateia. Sabe encantar, entreter e até inspirar as pessoas com sua arte — música, dança, poesia, acrobacias ou contação de histórias.',
    skillProfs: ['acrobatics', 'performance'],
    toolProfs: 'Kit de disfarce, um tipo de instrumento musical',
    languages: 'Nenhum',
    equipment:
      'Um instrumento musical (à sua escolha), o presente de um admirador (carta de amor, mecha de cabelo ou bijuteria), um traje e uma algibeira com 15 po',
    feature: {
      name: 'Por Demanda Popular',
      text: 'Você sempre encontra um lugar para se apresentar — uma estalagem, taverna, circo, teatro ou até a corte de um nobre. Nesses lugares, recebe hospedagem e comida gratuitas de padrão modesto ou confortável enquanto se apresentar todas as noites, e se torna conhecido na região.',
    },
  },
  {
    id: 'charlatan',
    name: 'Charlatão',
    description:
      'Você sempre teve jeito com as pessoas: sabe o que as move e o que elas querem ouvir. Vive de golpes, curas milagrosas falsas e esquemas para enganar os incautos.',
    skillProfs: ['deception', 'sleightOfHand'],
    toolProfs: 'Kit de disfarce, kit de falsificação',
    languages: 'Nenhum',
    equipment:
      'Um conjunto de roupas finas, um kit de disfarce, ferramentas de trapaça à sua escolha (dez garrafas com líquido colorido, um dado viciado, um baralho marcado ou um anel de sinete de um duque imaginário) e uma algibeira com 15 po',
    feature: {
      name: 'Identidade Falsa',
      text: 'Você criou uma segunda identidade, com documentação, conhecidos estabelecidos e disfarces que permitem assumi-la. Também é capaz de falsificar documentos — papéis oficiais e cartas pessoais — desde que tenha visto um exemplo do tipo de documento ou da caligrafia.',
    },
  },
  {
    id: 'criminal',
    name: 'Criminoso',
    description:
      'Você é um criminoso experiente, com um histórico de violar a lei. Passou muito tempo entre outros criminosos e ainda tem contatos no submundo.',
    skillProfs: ['deception', 'stealth'],
    toolProfs: 'Um tipo de kit de jogo, ferramentas de ladrão',
    languages: 'Nenhum',
    equipment: 'Um pé de cabra, um conjunto de roupas escuras comuns com capuz e uma algibeira com 15 po',
    feature: {
      name: 'Contato Criminal',
      text: 'Você tem um contato confiável que serve de ligação com uma rede de criminosos. Sabe como enviar e receber mensagens dele, mesmo a grandes distâncias, por meio de mensageiros locais, mestres de caravana corruptos e marinheiros duvidosos.',
    },
  },
  {
    id: 'hermit',
    name: 'Eremita',
    description:
      'Você viveu recluso por um período formativo, em uma comunidade isolada ou completamente sozinho, em busca de iluminação, paz ou respostas.',
    skillProfs: ['medicine', 'religion'],
    toolProfs: 'Kit de herbalismo',
    languages: 'Um idioma à sua escolha',
    equipment:
      'Um estojo de pergaminhos cheio de anotações sobre seus estudos ou orações, um cobertor de inverno, um conjunto de roupas comuns, um kit de herbalismo e 5 po',
    feature: {
      name: 'Descoberta',
      text: 'A quietude do seu isolamento lhe permitiu fazer uma descoberta única e poderosa: uma verdade sobre o cosmos, os deuses ou as forças da natureza, um local esquecido ou um fato que poderia mudar o destino de alguém. Defina com o Mestre a natureza dessa descoberta e seu impacto na campanha.',
    },
  },
  {
    id: 'outlander',
    name: 'Forasteiro',
    description:
      'Você cresceu nas terras selvagens, longe da civilização e do conforto da cidade e da tecnologia. Testemunhou migrações de manadas, sobreviveu a climas extremos e aprecia a solidão.',
    skillProfs: ['athletics', 'survival'],
    toolProfs: 'Um tipo de instrumento musical',
    languages: 'Um idioma à sua escolha',
    equipment:
      'Um bordão, uma armadilha de caça, um troféu de um animal que você matou, um conjunto de roupas de viajante e uma algibeira com 10 po',
    feature: {
      name: 'Andarilho',
      text: 'Você tem excelente memória para mapas e geografia e sempre consegue recordar a disposição geral do terreno, assentamentos e outras características ao seu redor. Pode encontrar comida e água potável para você e até cinco outras pessoas por dia, se a terra oferecer frutas, caça, água e afins.',
    },
  },
  {
    id: 'folk-hero',
    name: 'Herói do Povo',
    description:
      'Você vem de uma origem humilde, mas está destinado a muito mais. O povo da sua vila já o vê como seu campeão, e seu destino o chama para enfrentar tiranos e monstros.',
    skillProfs: ['animalHandling', 'survival'],
    toolProfs: 'Um tipo de ferramentas de artesão, veículos (terrestres)',
    languages: 'Nenhum',
    equipment:
      'Um conjunto de ferramentas de artesão (à sua escolha), uma pá, um pote de ferro, um conjunto de roupas comuns e uma algibeira com 10 po',
    feature: {
      name: 'Hospitalidade Rústica',
      text: 'Como você veio do povo comum, integra-se a ele com facilidade. Pode encontrar um lugar para se esconder, descansar ou se recuperar entre plebeus, que o protegerão da lei ou de quem o procura — embora não arrisquem a própria vida por você.',
    },
  },
  {
    id: 'sailor',
    name: 'Marinheiro',
    description:
      'Você navegou em uma embarcação marítima por anos. Enfrentou tempestades poderosas, monstros das profundezas e aqueles que queriam afundar seu navio.',
    skillProfs: ['athletics', 'perception'],
    toolProfs: 'Ferramentas de navegador, veículos (aquáticos)',
    languages: 'Nenhum',
    equipment:
      'Uma malagueta (clava), 50 pés de corda de seda, um amuleto da sorte (como um pé de coelho ou uma pedra com um furo no meio), um conjunto de roupas comuns e uma algibeira com 10 po',
    feature: {
      name: 'Passagem de Navio',
      text: 'Quando precisar, você consegue passagem gratuita em um navio para si e seus companheiros. Pode viajar no navio em que serviu ou em outro com que tenha boas relações. Em troca, espera-se que você e seus companheiros ajudem a tripulação durante a viagem.',
    },
  },
  {
    id: 'noble',
    name: 'Nobre',
    description:
      'Você entende de riqueza, poder e privilégio. Carrega um título nobre, e sua família possui terras, cobra impostos e exerce influência política significativa.',
    skillProfs: ['history', 'persuasion'],
    toolProfs: 'Um tipo de kit de jogo',
    languages: 'Um idioma à sua escolha',
    equipment: 'Um conjunto de roupas finas, um anel de sinete, um pergaminho de linhagem e uma bolsa com 25 po',
    feature: {
      name: 'Posição de Privilégio',
      text: 'Graças à sua origem nobre, as pessoas tendem a pensar o melhor de você. Você é bem-vindo na alta sociedade e as pessoas presumem que tem o direito de estar onde está. Plebeus fazem de tudo para acomodá-lo, e você pode conseguir uma audiência com um nobre local se precisar.',
    },
  },
  {
    id: 'urchin',
    name: 'Órfão',
    description:
      'Você cresceu nas ruas, sozinho, órfão e pobre. Aprendeu a se virar sem ninguém para cuidar de você, sobrevivendo graças à astúcia, à força ou à velocidade.',
    skillProfs: ['sleightOfHand', 'stealth'],
    toolProfs: 'Kit de disfarce, ferramentas de ladrão',
    languages: 'Nenhum',
    equipment:
      'Uma faca pequena, um mapa da cidade em que você cresceu, um rato de estimação, uma lembrança de seus pais, um conjunto de roupas comuns e uma algibeira com 10 po',
    feature: {
      name: 'Segredos da Cidade',
      text: 'Você conhece os padrões e o fluxo secretos das cidades e encontra passagens pelo espaço urbano que outros não notariam. Fora de combate, você (e companheiros que conduzir) viaja entre dois pontos de uma cidade com o dobro da velocidade normal.',
    },
  },
  {
    id: 'sage',
    name: 'Sábio',
    description:
      'Você passou anos estudando o saber do multiverso: vasculhou manuscritos, estudou pergaminhos e ouviu os maiores especialistas nos assuntos que lhe interessam.',
    skillProfs: ['arcana', 'history'],
    toolProfs: 'Nenhuma',
    languages: 'Dois idiomas à sua escolha',
    equipment:
      'Um vidro de tinta escura, uma pena, uma faca pequena, uma carta de um colega falecido com uma pergunta que você ainda não conseguiu responder, um conjunto de roupas comuns e uma algibeira com 10 po',
    feature: {
      name: 'Pesquisador',
      text: 'Quando tenta aprender ou recordar uma informação que não conhece, você geralmente sabe onde e de quem pode obtê-la — uma biblioteca, um scriptorium, uma universidade, um sábio ou outra criatura erudita.',
    },
  },
  {
    id: 'soldier',
    name: 'Soldado',
    description:
      'A guerra fez parte da sua vida desde que você se entende por gente. Treinou na juventude, estudou o uso de armas e armaduras e serviu em um exército, milícia ou companhia mercenária.',
    skillProfs: ['athletics', 'intimidation'],
    toolProfs: 'Um tipo de kit de jogo, veículos (terrestres)',
    languages: 'Nenhum',
    equipment:
      'Uma insígnia de patente, um troféu de um inimigo caído (uma adaga, uma lâmina quebrada ou um pedaço de estandarte), um jogo de dados de osso ou um baralho, um conjunto de roupas comuns e uma algibeira com 10 po',
    feature: {
      name: 'Patente Militar',
      text: 'Você tem uma patente militar da sua carreira como soldado. Soldados leais à sua antiga organização ainda reconhecem sua autoridade e influência e o tratam com deferência se forem de patente inferior. Você pode usar sua patente para requisitar equipamento simples ou cavalos para uso temporário e entrar em acampamentos e fortalezas amigos.',
    },
  },
];

export const BACKGROUNDS_BY_ID: Record<string, BackgroundData> = Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b]));
