// Condições do D&D 5e (SRD 5.1, CC-BY-4.0) em PT-BR, mais marcadores auxiliares da mesa virtual.
import type { ConditionData } from './types.ts';

export const CONDITIONS: ConditionData[] = [
  // ---------------------------------------------------------------------------
  // Condições oficiais (SRD 5.1)
  // ---------------------------------------------------------------------------
  {
    id: 'blinded', name: 'Cego', icon: 'EyeOff', color: '#94a3b8', official: true,
    rules: [
      'Uma criatura cega não pode ver e falha automaticamente em qualquer teste de habilidade que exija visão.',
      'Jogadas de ataque contra a criatura têm vantagem, e as jogadas de ataque da criatura têm desvantagem.',
    ],
  },
  {
    id: 'charmed', name: 'Enfeitiçado', icon: 'Heart', color: '#f472b6', official: true,
    rules: [
      'Uma criatura enfeitiçada não pode atacar quem a enfeitiçou nem tê-lo como alvo de habilidades ou efeitos mágicos nocivos.',
      'Quem a enfeitiçou tem vantagem em qualquer teste de habilidade para interagir socialmente com a criatura.',
    ],
  },
  {
    id: 'deafened', name: 'Surdo', icon: 'EarOff', color: '#a78bfa', official: true,
    rules: [
      'Uma criatura surda não pode ouvir e falha automaticamente em qualquer teste de habilidade que exija audição.',
    ],
  },
  {
    id: 'exhaustion', name: 'Exaustão', icon: 'BatteryLow', color: '#d97706', official: true,
    rules: [
      'A exaustão é medida em seis níveis. Um efeito pode conceder a uma criatura um ou mais níveis de exaustão, conforme especificado na descrição do efeito.',
      'Nível 1: desvantagem em testes de habilidade.',
      'Nível 2: deslocamento reduzido à metade.',
      'Nível 3: desvantagem em jogadas de ataque e testes de resistência.',
      'Nível 4: pontos de vida máximos reduzidos à metade.',
      'Nível 5: deslocamento reduzido a 0.',
      'Nível 6: morte.',
      'Se uma criatura já exausta sofrer outro efeito que cause exaustão, seu nível atual de exaustão aumenta na quantidade especificada.',
      'Uma criatura sofre o efeito do seu nível atual de exaustão e de todos os níveis inferiores. Por exemplo, uma criatura com nível 2 de exaustão tem o deslocamento reduzido à metade e desvantagem em testes de habilidade.',
      'Um efeito que remove exaustão reduz o nível conforme especificado; todos os efeitos de exaustão terminam se o nível cair abaixo de 1.',
      'Terminar um descanso longo reduz o nível de exaustão da criatura em 1, desde que ela também tenha ingerido comida e bebida.',
    ],
  },
  {
    id: 'frightened', name: 'Amedrontado', icon: 'Ghost', color: '#c084fc', official: true,
    rules: [
      'Uma criatura amedrontada tem desvantagem em testes de habilidade e jogadas de ataque enquanto a fonte do seu medo estiver em sua linha de visão.',
      'A criatura não pode se mover voluntariamente para mais perto da fonte do seu medo.',
    ],
  },
  {
    id: 'grappled', name: 'Agarrado', icon: 'Grab', color: '#fdba74', official: true,
    rules: [
      'O deslocamento de uma criatura agarrada se torna 0, e ela não pode se beneficiar de nenhum bônus ao seu deslocamento.',
      'A condição termina se quem agarra ficar incapacitado.',
      'A condição também termina se um efeito remover a criatura agarrada do alcance de quem a agarra ou do efeito que a agarra, como quando a criatura é arremessada pela magia onda trovejante.',
    ],
  },
  {
    id: 'incapacitated', name: 'Incapacitado', icon: 'Ban', color: '#fca5a5', official: true,
    rules: [
      'Uma criatura incapacitada não pode realizar ações nem reações.',
    ],
  },
  {
    id: 'invisible', name: 'Invisível', icon: 'SquareDashed', color: '#e2e8f0', official: true,
    rules: [
      'É impossível ver uma criatura invisível sem a ajuda de magia ou de um sentido especial. Para fins de se esconder, a criatura está densamente obscurecida. A localização da criatura pode ser detectada por qualquer barulho que ela faça ou rastros que deixe.',
      'Jogadas de ataque contra a criatura têm desvantagem, e as jogadas de ataque da criatura têm vantagem.',
    ],
  },
  {
    id: 'paralyzed', name: 'Paralisado', icon: 'Zap', color: '#facc15', official: true,
    rules: [
      'Uma criatura paralisada está incapacitada e não pode se mover nem falar.',
      'A criatura falha automaticamente em testes de resistência de Força e Destreza.',
      'Jogadas de ataque contra a criatura têm vantagem.',
      'Qualquer ataque que atinja a criatura é um acerto crítico se o atacante estiver a até 5 pés dela.',
    ],
  },
  {
    id: 'petrified', name: 'Petrificado', icon: 'Mountain', color: '#a8a29e', official: true,
    rules: [
      'Uma criatura petrificada é transformada, junto com qualquer objeto não mágico que esteja vestindo ou carregando, em uma substância sólida inanimada (geralmente pedra). Seu peso aumenta em dez vezes e ela para de envelhecer.',
      'A criatura está incapacitada, não pode se mover nem falar e não tem consciência do que acontece ao seu redor.',
      'Jogadas de ataque contra a criatura têm vantagem.',
      'A criatura falha automaticamente em testes de resistência de Força e Destreza.',
      'A criatura tem resistência a todo tipo de dano.',
      'A criatura é imune a veneno e doença, embora um veneno ou doença já presente em seu organismo seja apenas suspenso, não neutralizado.',
    ],
  },
  {
    id: 'poisoned', name: 'Envenenado', icon: 'FlaskConical', color: '#84cc16', official: true,
    rules: [
      'Uma criatura envenenada tem desvantagem em jogadas de ataque e testes de habilidade.',
    ],
  },
  {
    id: 'prone', name: 'Caído', icon: 'ArrowDownToLine', color: '#d4a373', official: true,
    rules: [
      'A única opção de movimento de uma criatura caída é rastejar, a menos que ela se levante, o que encerra a condição (levantar-se custa metade do deslocamento).',
      'A criatura tem desvantagem em jogadas de ataque.',
      'Uma jogada de ataque contra a criatura tem vantagem se o atacante estiver a até 5 pés dela. Caso contrário, a jogada de ataque tem desvantagem.',
    ],
  },
  {
    id: 'restrained', name: 'Impedido', icon: 'Link', color: '#60a5fa', official: true,
    rules: [
      'O deslocamento de uma criatura impedida se torna 0, e ela não pode se beneficiar de nenhum bônus ao seu deslocamento.',
      'Jogadas de ataque contra a criatura têm vantagem, e as jogadas de ataque da criatura têm desvantagem.',
      'A criatura tem desvantagem em testes de resistência de Destreza.',
    ],
  },
  {
    id: 'stunned', name: 'Atordoado', icon: 'Stars', color: '#f0abfc', official: true,
    rules: [
      'Uma criatura atordoada está incapacitada, não pode se mover e só consegue falar de forma hesitante.',
      'A criatura falha automaticamente em testes de resistência de Força e Destreza.',
      'Jogadas de ataque contra a criatura têm vantagem.',
    ],
  },
  {
    id: 'unconscious', name: 'Inconsciente', icon: 'Moon', color: '#818cf8', official: true,
    rules: [
      'Uma criatura inconsciente está incapacitada, não pode se mover nem falar e não tem consciência do que acontece ao seu redor.',
      'A criatura larga o que estiver segurando e fica caída.',
      'A criatura falha automaticamente em testes de resistência de Força e Destreza.',
      'Jogadas de ataque contra a criatura têm vantagem.',
      'Qualquer ataque que atinja a criatura é um acerto crítico se o atacante estiver a até 5 pés dela.',
    ],
  },

  // ---------------------------------------------------------------------------
  // Marcadores auxiliares da mesa (não são condições oficiais)
  // ---------------------------------------------------------------------------
  {
    id: 'concentrating', name: 'Concentrando', icon: 'Brain', color: '#38bdf8', official: false,
    rules: [
      'Mantendo concentração em uma magia; só é possível se concentrar em uma magia por vez.',
      'Ao sofrer dano, faz um teste de resistência de Constituição (CD 10 ou metade do dano sofrido, o que for maior) para manter a concentração. Cada fonte de dano exige um teste separado.',
      'A concentração termina ao conjurar outra magia que exija concentração, ao ficar incapacitado ou ao morrer.',
    ],
  },
  {
    id: 'dead', name: 'Morto', icon: 'Skull', color: '#ef4444', official: false,
    rules: [
      'A criatura está morta: acumulou três falhas em testes de resistência contra a morte, sofreu dano massivo (dano restante igual ou maior que seus pontos de vida máximos) ou foi alvo de um efeito de morte instantânea.',
      'Só pode voltar à vida por meio de magia, como revivificar ou reviver os mortos.',
    ],
  },
  {
    id: 'bleeding', name: 'Sangrando', icon: 'Droplet', color: '#e11d48', official: false,
    rules: [
      'Marcador de dano contínuo (ferimento aberto, veneno persistente, etc.): sofre o dano indicado pelo efeito no momento indicado (normalmente no início do turno).',
      'Normalmente termina com qualquer cura mágica ou com um teste bem-sucedido de Sabedoria (Medicina), conforme o efeito de origem.',
    ],
  },
  {
    id: 'blessed', name: 'Abençoado', icon: 'Sparkles', color: '#fde68a', official: false,
    rules: [
      'Sob o efeito de bênção: ao fazer uma jogada de ataque ou um teste de resistência, rola 1d4 e adiciona o resultado.',
      'Dura enquanto o conjurador mantiver a concentração (até 1 minuto).',
    ],
  },
  {
    id: 'hasted', name: 'Acelerado', icon: 'FastForward', color: '#22d3ee', official: false,
    rules: [
      'Sob o efeito de velocidade: deslocamento dobrado, +2 na CA e vantagem em testes de resistência de Destreza.',
      'Ganha uma ação adicional em cada turno, usada apenas para Atacar (um único ataque com arma), Disparada, Desengajar, Esconder ou Usar um Objeto.',
      'Quando a magia termina, não pode se mover nem realizar ações até depois do seu próximo turno, por causa da letargia.',
    ],
  },
  {
    id: 'marked', name: 'Marcado', icon: 'Crosshair', color: '#fb923c', official: false,
    rules: [
      'Marcado por um efeito como marca do caçador: quem o marcou causa dano extra (por exemplo, 1d6) ao atingi-lo com um ataque com arma.',
      'Quem o marcou tem vantagem em testes de Sabedoria (Percepção) ou Sabedoria (Sobrevivência) para encontrá-lo.',
    ],
  },
  {
    id: 'hidden', name: 'Escondido', icon: 'EyeClosed', color: '#7c8ba1', official: false,
    rules: [
      'Escondido com a ação Esconder (teste de Destreza (Furtividade)); criaturas que não o percebem não sabem onde ele está.',
      'Suas jogadas de ataque contra criaturas que não o veem têm vantagem, e jogadas de ataque contra ele têm desvantagem.',
      'É revelado ao fazer barulho, ao atacar ou quando uma criatura o encontra com um teste de Sabedoria (Percepção) que iguale ou supere o resultado da Furtividade.',
    ],
  },
  {
    id: 'raging', name: 'Em Fúria', icon: 'Angry', color: '#ff5a36', official: false,
    rules: [
      'Fúria do bárbaro: vantagem em testes de Força e testes de resistência de Força.',
      'Bônus de dano em ataques corpo a corpo com armas usando Força (+2 a +4, conforme o nível).',
      'Resistência a dano contundente, cortante e perfurante.',
      'Não pode conjurar magias nem se concentrar nelas.',
      'Dura 1 minuto; termina antes se ficar inconsciente ou se o turno terminar sem ter atacado uma criatura hostil nem sofrido dano desde o turno anterior.',
    ],
  },
  {
    id: 'inspired', name: 'Inspirado', icon: 'Music', color: '#34d399', official: false,
    rules: [
      'Possui um dado de Inspiração de Bardo (d6 a d12) por até 10 minutos.',
      'Uma vez, pode rolar o dado e adicioná-lo a um teste de habilidade, jogada de ataque ou teste de resistência, depois de rolar o d20 e antes de o Mestre anunciar o resultado.',
    ],
  },
  {
    id: 'dodging', name: 'Esquivando', icon: 'ShieldHalf', color: '#2dd4bf', official: false,
    rules: [
      'Usou a ação Esquivar: até o início do seu próximo turno, jogadas de ataque contra ele têm desvantagem se ele puder ver o atacante.',
      'Tem vantagem em testes de resistência de Destreza.',
      'Perde esses benefícios se ficar incapacitado ou se seu deslocamento cair para 0.',
    ],
  },
  {
    id: 'flying', name: 'Voando', icon: 'Feather', color: '#a5f3fc', official: false,
    rules: [
      'Está voando (use a elevação do token para a altura).',
      'Se ficar caído, tiver o deslocamento reduzido a 0 ou for impedido de se mover enquanto voa, cai, a menos que possa pairar ou esteja sendo sustentado no ar por magia.',
      'Queda: 1d6 de dano contundente para cada 10 pés de queda (máximo 20d6), terminando caído.',
    ],
  },
  {
    id: 'burning', name: 'Em Chamas', icon: 'Flame', color: '#f97316', official: false,
    rules: [
      'Pegando fogo: sofre dano de fogo no início de cada um dos seus turnos (geralmente 1d4 ou o valor indicado pelo efeito).',
      'Uma criatura pode usar sua ação para apagar as chamas; mergulhar em água também as apaga.',
    ],
  },
  {
    id: 'slowed', name: 'Lento', icon: 'Snail', color: '#bef264', official: false,
    rules: [
      'Sob o efeito de lentidão: deslocamento reduzido à metade, -2 na CA e nos testes de resistência de Destreza, e não pode usar reações.',
      'No seu turno, pode usar uma ação ou uma ação bônus, não ambas, e não pode fazer mais de um ataque corpo a corpo ou à distância.',
      'Ao conjurar uma magia com tempo de conjuração de 1 ação, rola um d20: com 11 ou mais, a magia só surte efeito no próximo turno, exigindo a ação desse turno para completá-la; caso contrário, a ação é perdida.',
      'Repete o teste de resistência de Sabedoria ao final de cada um dos seus turnos; com um sucesso, o efeito termina.',
    ],
  },
  {
    id: 'cursed', name: 'Amaldiçoado', icon: 'Biohazard', color: '#d946ef', official: false,
    rules: [
      'Sob o efeito de uma maldição (por exemplo, rogar maldição ou um item amaldiçoado); os efeitos exatos dependem da fonte.',
      'Remover maldição ou restauração maior normalmente encerram o efeito.',
    ],
  },
];

export const CONDITIONS_BY_ID: Record<string, ConditionData> = Object.fromEntries(
  CONDITIONS.map((c) => [c.id, c]),
);
