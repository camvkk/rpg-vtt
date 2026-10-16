// Quick reference of core 5e rules (PT-BR), collapsible and searchable. Links "#cond:<id>" open a condition.
import { useMemo, useState, type MouseEvent } from 'react';
import {
  ArrowDownToLine, Brain, ChevronDown, Crosshair, Dices, Eye, Footprints, Grab, Hourglass, Shield, Skull, Sparkles,
  Swords, Target, Tent, Wind, Zap, type LucideIcon,
} from 'lucide-react';
import { CONDITIONS } from '@shared/data5e/conditions.ts';
import { Markdown } from '../../ui/index.tsx';
import { ConditionIcon } from './ConditionCard.tsx';
import { norm } from './format.ts';

export interface RuleSection {
  id: string;
  title: string;
  icon: LucideIcon;
  /** Extra search terms (synonyms, English names). */
  keywords: string;
  /** Markdown body. Condition links: [caído](#cond:prone). */
  body: string;
  /** Renders the official condition chips under the body. */
  conditionList?: boolean;
}

export const RULE_SECTIONS: RuleSection[] = [
  {
    id: 'turn',
    title: 'Seu turno',
    icon: Hourglass,
    keywords: 'turno rodada ação bônus reação interação objeto turn round bonus action reaction',
    body: `Em cada turno você pode **mover-se** até o seu deslocamento e realizar **uma ação**. Também pode ter:

- **Ação bônus** — só quando uma habilidade, magia ou característica concede uma.
- **Reação** — uma por rodada, recuperada no início do seu turno (ex.: ataque de oportunidade).
- **Interação gratuita** com um objeto (sacar a arma, abrir uma porta) durante o movimento ou a ação.
- **Falar** — frases curtas, sem gastar ação.

O movimento pode ser dividido antes e depois da ação. Uma rodada dura cerca de **6 segundos**.`,
  },
  {
    id: 'actions',
    title: 'Ações em combate',
    icon: Swords,
    keywords: 'atacar conjurar disparada desengajar esquivar ajudar esconder preparar procurar usar objeto attack cast dash disengage dodge help hide ready search use object',
    body: `- **Atacar** — um ataque corpo a corpo ou à distância (mais, com Ataque Extra). Agarrar e empurrar substituem um desses ataques.
- **Conjurar uma Magia** — magias com tempo de conjuração de 1 ação.
- **Disparada** — movimento extra igual ao seu deslocamento neste turno.
- **Desengajar** — seu movimento não provoca ataques de oportunidade até o fim do turno.
- **Esquivar** — até o seu próximo turno, ataques contra você têm desvantagem (se você vir o atacante) e você tem vantagem em salvaguardas de Destreza. Termina se ficar [incapacitado](#cond:incapacitated) ou com deslocamento 0.
- **Ajudar** — um aliado tem vantagem no próximo teste da tarefa, ou no próximo ataque contra uma criatura a até 5 pés de você (até o seu próximo turno).
- **Esconder** — teste de Destreza (Furtividade) contra a Percepção passiva dos inimigos. Exige estar fora de vista (cobertura ou área densamente obscurecida).
- **Preparar** — defina um gatilho perceptível e a resposta (ação ou movimento); quando ocorrer, use sua reação. Magia preparada gasta o espaço na hora e exige concentração até ser liberada.
- **Procurar** — teste de Sabedoria (Percepção) ou Inteligência (Investigação).
- **Usar um Objeto** — beber uma poção, ativar um item ou interagir com um segundo objeto no turno.`,
  },
  {
    id: 'movement',
    title: 'Movimento',
    icon: Footprints,
    keywords: 'deslocamento terreno difícil rastejar levantar escalar nadar saltar pulo movement difficult terrain jump climb swim',
    body: `- **Terreno difícil:** cada pé custa 1 pé extra.
- **Levantar-se** de [caído](#cond:prone) custa metade do deslocamento; **rastejar** custa 1 pé extra por pé.
- **Escalar e nadar** (sem deslocamento próprio para isso) custam 1 pé extra por pé.
- **Salto em distância:** até o seu valor de Força em pés com 10 pés de corrida (metade parado). **Salto em altura:** 3 + mod. de Força pés.
- Você atravessa o espaço de aliados; o de um inimigo só se ele for dois tamanhos maior ou menor. Espaço ocupado conta como terreno difícil.`,
  },
  {
    id: 'attacks',
    title: 'Ataques e críticos',
    icon: Crosshair,
    keywords: 'jogada de ataque crítico 20 natural 1 natural duas armas alcance longo acerto attack roll critical hit two weapon',
    body: `**Jogada de ataque:** d20 + modificador de habilidade + proficiência (se proficiente). Acerta se o total for **igual ou maior** que a CA do alvo.

- **20 natural:** acerto **crítico** — role os dados de dano duas vezes e some os modificadores uma vez.
- **1 natural:** erra sempre.
- **Corpo a corpo:** For (ou Des, com acuidade). **À distância:** Des. **Magia:** habilidade de conjuração.
- **Alcance longo** (o segundo número, ex.: 80/320): desvantagem. Além dele, impossível.
- **Inimigo a até 5 pés** ao atacar à distância: desvantagem.
- **Duas armas:** atacando com uma arma leve, use a ação bônus para atacar com outra arma leve — sem somar o modificador ao dano (a menos que seja negativo).
- **Atacante oculto:** vantagem; o ataque revela sua posição, acertando ou não.`,
  },
  {
    id: 'advantage',
    title: 'Vantagem e desvantagem',
    icon: Dices,
    keywords: 'vantagem desvantagem 2d20 inspiração advantage disadvantage inspiration',
    body: `Role **dois d20** e use o **maior** (vantagem) ou o **menor** (desvantagem).

- Várias fontes **não se acumulam**: três vantagens ainda são uma vantagem.
- Vantagem **e** desvantagem ao mesmo tempo se **anulam** — role um único d20, não importa quantas fontes de cada.
- **Vantagem comum:** alvo [cego](#cond:blinded), [paralisado](#cond:paralyzed), [atordoado](#cond:stunned), [impedido](#cond:restrained) ou [inconsciente](#cond:unconscious); atacante não visto; ação Ajudar.
- **Desvantagem comum:** atacante [envenenado](#cond:poisoned), [amedrontado](#cond:frightened), [caído](#cond:prone) ou [cego](#cond:blinded); alvo [invisível](#cond:invisible); alcance longo.
- Alvo [caído](#cond:prone): vantagem a até 5 pés, desvantagem de mais longe.
- **Inspiração:** gaste para ter vantagem em uma jogada de ataque, salvaguarda ou teste de habilidade.`,
  },
  {
    id: 'cover',
    title: 'Cobertura',
    icon: Shield,
    keywords: 'cobertura meia três quartos total cover half three-quarters',
    body: `| Cobertura | Efeito | Exemplo |
|---|---|---|
| **Meia** | +2 na CA e em salvaguardas de Des | Mureta, móvel, outra criatura |
| **Três quartos** | +5 na CA e em salvaguardas de Des | Seteira, tronco grosso |
| **Total** | Não pode ser alvo direto | Atrás de uma parede sólida |

Só conta a cobertura mais robusta — elas **não se somam**. Criaturas entre o atacante e o alvo, aliadas ou não, dão meia cobertura.`,
  },
  {
    id: 'opportunity',
    title: 'Ataques de oportunidade',
    icon: Zap,
    keywords: 'ataque de oportunidade reação alcance sair opportunity attack reaction reach',
    body: `Quando uma criatura hostil que você **pode ver** sai do seu **alcance**, você pode usar a **reação** para fazer um ataque corpo a corpo contra ela, logo antes de ela sair.

- **Não provoca:** usar a ação **Desengajar**, **teletransportar-se** ou ser movido sem gastar movimento, ação ou reação (ex.: ser empurrado).
- Criaturas com Sobrevoo, ou efeitos semelhantes, também não provocam.`,
  },
  {
    id: 'grapple',
    title: 'Agarrar e empurrar',
    icon: Grab,
    keywords: 'agarrar empurrar derrubar escapar atletismo acrobacia grapple shove escape prone',
    body: `Ambos substituem **um ataque** da ação Atacar. O alvo deve estar ao seu alcance e ser no máximo **um tamanho maior** que você.

- **Agarrar:** com uma mão livre, teste de Força (Atletismo) resistido pelo Atletismo ou Acrobacia do alvo (ele escolhe). Sucesso: alvo [agarrado](#cond:grappled). Soltá-lo é gratuito.
- **Mover o agarrado:** seu deslocamento cai pela metade, a menos que ele seja dois ou mais tamanhos menor.
- **Escapar:** o agarrado usa a ação para um teste de Atletismo ou Acrobacia contra o seu Atletismo.
- **Empurrar:** teste de Atletismo resistido (Atletismo ou Acrobacia do alvo). Sucesso: derruba o alvo ([caído](#cond:prone)) ou o afasta 5 pés.`,
  },
  {
    id: 'concentration',
    title: 'Concentração',
    icon: Brain,
    keywords: 'concentração magia salvaguarda constituição dano concentration',
    body: `Algumas magias exigem **concentração** para durar, e só é possível manter **uma** por vez.

- Ao sofrer dano, faça uma salvaguarda de **Constituição** com CD **10 ou metade do dano** (o que for maior). Falha encerra a magia. Cada fonte de dano pede um teste.
- Termina também se você ficar [incapacitado](#cond:incapacitated), morrer ou conjurar outra magia de concentração.`,
  },
  {
    id: 'conditions',
    title: 'Condições',
    icon: Sparkles,
    keywords: 'condições cego enfeitiçado surdo exaustão amedrontado agarrado incapacitado invisível paralisado petrificado envenenado caído impedido atordoado inconsciente conditions',
    body: 'As 15 condições oficiais alteram o que uma criatura pode fazer. Elas duram até serem removidas ou até o fim do efeito que as causou. Toque em uma para ver as regras:',
    conditionList: true,
  },
  {
    id: 'death',
    title: 'Testes contra a morte',
    icon: Skull,
    keywords: 'teste contra a morte 0 pv morrendo estabilizar dano massivo death saving throw stabilize massive damage',
    body: `Com **0 PV** você fica [inconsciente](#cond:unconscious). No início de cada turno seu, role um d20 sem modificadores:

- **10 ou mais:** sucesso. **9 ou menos:** falha.
- **3 sucessos:** você fica estável (ainda inconsciente). **3 falhas:** você morre.
- **20 natural:** recupera 1 PV e acorda. **1 natural:** conta como duas falhas.
- **Sofrer dano** com 0 PV causa uma falha (duas, se for crítico). Se o dano restante igualar ou superar seu PV máximo, morte instantânea (**dano massivo**).
- **Estabilizar:** ação e teste de Sabedoria (Medicina) CD 10. Uma criatura estável recupera 1 PV após 1d4 horas.
- Qualquer cura zera os testes e devolve a consciência.`,
  },
  {
    id: 'rest',
    title: 'Descansos',
    icon: Tent,
    keywords: 'descanso curto longo dados de vida recuperar short rest long rest hit dice',
    body: `**Descanso curto** — ao menos **1 hora** de atividade leve.
- Gaste **Dados de Vida**: para cada um, role o dado + mod. de Constituição e recupere esse total em PV.
- Algumas habilidades recarregam (ex.: Retomar o Fôlego, magia de pacto).

**Descanso longo** — ao menos **8 horas**, com no máximo 2 de vigília leve.
- Recupera **todos os PV** e até **metade dos Dados de Vida** totais (mínimo 1).
- Recupera espaços de magia e a maioria das habilidades; reduz a [exaustão](#cond:exhaustion) em 1 nível (com comida e água).
- Só um a cada **24 horas**, e é preciso ter ao menos 1 PV. Uma hora de atividade extenuante interrompe o descanso.`,
  },
  {
    id: 'dcs',
    title: 'CDs típicas',
    icon: Target,
    keywords: 'cd classe de dificuldade teste resistido passivo dc difficulty class contest passive',
    body: `| Dificuldade | CD |
|---|---|
| Muito fácil | **5** |
| Fácil | **10** |
| Média | **15** |
| Difícil | **20** |
| Muito difícil | **25** |
| Quase impossível | **30** |

**Teste resistido:** os dois rolam; o maior vence e o empate mantém a situação. **Valor passivo:** 10 + modificadores (+5 com vantagem, −5 com desvantagem).`,
  },
  {
    id: 'vision',
    title: 'Luz e visão',
    icon: Eye,
    keywords: 'luz penumbra escuridão visão no escuro obscurecido percepção às cegas visão verdadeira light dim darkness darkvision blindsight truesight',
    body: `| Iluminação | Efeito |
|---|---|
| **Luz plena** | Visão normal |
| **Penumbra** | Levemente obscurecido: desvantagem em Sabedoria (Percepção) que dependa da visão |
| **Escuridão** | Densamente obscurecido: quem tenta ver ali fica efetivamente [cego](#cond:blinded) |

- **Visão no escuro:** dentro do alcance, enxerga penumbra como luz plena e escuridão como penumbra (só em tons de cinza).
- **Percepção às cegas:** percebe os arredores sem depender da visão, no alcance indicado.
- **Visão verdadeira:** enxerga na escuridão (até mágica), vê o invisível, atravessa ilusões e enxerga o Plano Etéreo.
- Névoa leve e folhagem moderada obscurecem levemente; névoa densa e folhagem fechada, densamente.`,
  },
  {
    id: 'falling',
    title: 'Queda',
    icon: ArrowDownToLine,
    keywords: 'queda cair dano contundente altura falling fall damage',
    body: 'Ao fim de uma queda, a criatura sofre **1d6 de dano contundente a cada 10 pés**, até o máximo de **20d6**. Ela termina [caída](#cond:prone), a menos que evite todo o dano.',
  },
  {
    id: 'suffocating',
    title: 'Sufocamento',
    icon: Wind,
    keywords: 'sufocamento prender a respiração afogar engasgar suffocating drowning breath',
    body: `Uma criatura prende a respiração por **1 + mod. de Constituição** minutos (mínimo 30 segundos).

- Quando o fôlego acaba (ou está engasgando), sobrevive mais **rodadas iguais ao mod. de Constituição** (mínimo 1).
- No início do turno seguinte, cai a **0 PV** e está morrendo; não pode recuperar PV nem ser estabilizada até voltar a respirar.`,
  },
];

const searchCache = new Map<string, string>();

/** Normalised searchable text of a section (title + keywords + body without markdown). */
export function ruleSearchText(s: RuleSection): string {
  let t = searchCache.get(s.id);
  if (t === undefined) {
    const plain = s.body.replace(/\]\(#[^)]*\)/g, ']').replace(/[*|#[\]_-]+/g, ' ');
    t = norm(`${s.title} ${s.keywords} ${plain}`);
    searchCache.set(s.id, t);
  }
  return t;
}

export function ruleMatches(s: RuleSection, q: string): boolean {
  if (!q) return true;
  const text = ruleSearchText(s);
  return q.split(' ').every((w) => text.includes(w));
}

function handleLinks(e: MouseEvent, onOpenCondition: (id: string) => void) {
  const a = (e.target as HTMLElement).closest?.('a');
  const href = a?.getAttribute('href') ?? '';
  if (href.startsWith('#cond:')) {
    e.preventDefault();
    onOpenCondition(href.slice(6));
  }
}

function RuleBody({ section, onOpenCondition }: { section: RuleSection; onOpenCondition: (id: string) => void }) {
  return (
    <div className="cmp-rule__body" onClick={(e) => handleLinks(e, onOpenCondition)}>
      <Markdown text={section.body} className="cmp-rule__md" />
      {section.conditionList && (
        <div className="cmp-rule__conds">
          {CONDITIONS.filter((c) => c.official).map((c) => (
            <button key={c.id} type="button" className="chip cmp-cond-chip" onClick={() => onOpenCondition(c.id)}>
              <ConditionIcon condition={c} size="sm" />
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A single section, always open (used as a detail view). */
export function RuleSectionCard({ section, onOpenCondition }: { section: RuleSection; onOpenCondition: (id: string) => void }) {
  const Icon = section.icon;
  return (
    <article className="cmp-card cmp-rule-card">
      <header className="cmp-rule-card__head">
        <span className="cmp-rule__ico"><Icon /></span>
        <h2 className="cmp-card__title">{section.title}</h2>
      </header>
      <RuleBody section={section} onOpenCondition={onOpenCondition} />
    </article>
  );
}

/** Collapsible cheat sheet. `query` is already normalised; matching sections open automatically. */
export function RulesReference({ query, onOpenCondition }: { query: string; onOpenCondition: (id: string) => void }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(['turn']));
  const sections = useMemo(() => RULE_SECTIONS.filter((s) => ruleMatches(s, query)), [query]);
  const searching = query.length > 0;
  const allOpen = sections.every((s) => open.has(s.id));

  const toggle = (id: string) => {
    setOpen((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!sections.length) {
    return <div className="cmp-none">Nenhuma regra encontrada para essa busca.</div>;
  }

  return (
    <div className="cmp-rules">
      {!searching && (
        <div className="cmp-rules__bar">
          <span className="u-xs u-dim">Referência rápida · SRD 5.1</span>
          <button
            type="button"
            className="cmp-linkbtn"
            onClick={() => setOpen(allOpen ? new Set() : new Set(RULE_SECTIONS.map((s) => s.id)))}
          >
            {allOpen ? 'Recolher tudo' : 'Expandir tudo'}
          </button>
        </div>
      )}
      {sections.map((s) => {
        const Icon = s.icon;
        const isOpen = searching || open.has(s.id);
        return (
          <section key={s.id} className="cmp-rule" data-open={isOpen ? 'true' : undefined}>
            <button type="button" className="cmp-rule__head" aria-expanded={isOpen} onClick={() => toggle(s.id)} disabled={searching}>
              <span className="cmp-rule__ico"><Icon /></span>
              <span className="cmp-rule__title">{s.title}</span>
              <ChevronDown className="cmp-rule__chev" />
            </button>
            {isOpen && <RuleBody section={s} onOpenCondition={onOpenCondition} />}
          </section>
        );
      })}
    </div>
  );
}
