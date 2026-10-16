// Oráculo: AI assistant for the DM (Kimi via the server). Streams markdown answers and turns structured
// results into table actions (NPC sheets, encounters on the map, narration, journal pages).
import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { create } from 'zustand';
import {
  BookPlus, Check, ChevronRight, Copy, Dices, ExternalLink, Gem, History, KeyRound, MapPin, MessageSquare,
  MessageSquareQuote, Mountain, RotateCcw, Scale, ScrollText, Send, Sparkles, Square, Swords, Tags, Trash2, UserPlus,
  UserRound, type LucideProps,
} from 'lucide-react';
import type { AiRequest } from '@shared/protocol.ts';
import type { Ability, AbilityScores, Attack, DamageType } from '@shared/types.ts';
import type { Monster } from '@shared/data5e/types.ts';
import { MONSTERS_BY_ID } from '@shared/data5e/monsters/index.ts';
import { DIFFICULTY_LABELS, formatCr, type EncounterDifficulty } from '@shared/data5e/tables.ts';
import { parseFormula } from '@shared/dice.ts';
import { SIZE_CELLS } from '@shared/rules5e.ts';
import { isRecord, newId } from '@shared/util.ts';
import { act, askAi } from '../../net/socket.ts';
import { engineApi } from '../../engine/api.ts';
import { useGame } from '../../store/game.ts';
import { getViewScene } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, IconButton, Markdown, Spinner, Toggle, toast } from '../../ui/index.tsx';
import './oracle.css';

type Kind = AiRequest['kind'];
type IconCmp = ComponentType<LucideProps>;

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

interface ModeDef {
  kind: Kind;
  label: string;
  icon: IconCmp;
  blurb: string;
  placeholder: string;
  examples: string[];
  /** The server has a sensible default when the prompt is empty. */
  optional: boolean;
  cta: string;
}

const MODES: ModeDef[] = [
  {
    kind: 'npc',
    label: 'NPC',
    icon: UserRound,
    blurb: 'Personagem memorável com ficha pronta para a mesa.',
    placeholder: 'Quem os heróis vão encontrar? Ex.: um ferreiro anão rabugento que esconde um segredo…',
    examples: ['Taverneira meio-elfa que sabe mais do que diz', 'Capitão da guarda corrupto e perigoso', 'Mago excêntrico que coleciona olhos de vidro'],
    optional: true,
    cta: 'Invocar NPC',
  },
  {
    kind: 'scene',
    label: 'Cena',
    icon: Mountain,
    blurb: 'Texto para ler em voz alta, com os cinco sentidos e um gancho.',
    placeholder: 'Descreva o lugar… Ex.: a entrada de uma cripta inundada ao amanhecer',
    examples: ['Mercado noturno numa cidade portuária', 'Salão do trono abandonado de um rei anão', 'Clareira onde fadas dançam sob a lua'],
    optional: true,
    cta: 'Descrever cena',
  },
  {
    kind: 'encounter',
    label: 'Encontro',
    icon: Swords,
    blurb: 'Monstros do compêndio balanceados para o grupo, prontos para o mapa.',
    placeholder: 'Que tipo de combate? Ex.: emboscada de goblins na estrada da floresta',
    examples: ['Emboscada de goblins liderada por um hobgoblin', 'Mortos-vivos numa cripta, bem difícil', 'Lobos famintos durante uma nevasca'],
    optional: true,
    cta: 'Montar encontro',
  },
  {
    kind: 'rules',
    label: 'Regras',
    icon: Scale,
    blurb: 'Dúvidas de regras do D&D 5e (SRD), com exemplo e sugestão de mesa.',
    placeholder: 'Qual a dúvida? Ex.: como funciona agarrar e empurrar?',
    examples: ['Como funciona ataque de oportunidade?', 'Posso conjurar duas magias no mesmo turno?', 'Regras de cobertura e meia-cobertura'],
    optional: false,
    cta: 'Consultar regras',
  },
  {
    kind: 'summary',
    label: 'Resumo da sessão',
    icon: ScrollText,
    blurb: 'Crônica da sessão escrita a partir do chat e das rolagens.',
    placeholder: 'Observações opcionais… Ex.: destaque a traição do mercador',
    examples: ['Foque nas decisões dos jogadores', 'Escreva como um bardo exagerado', 'Liste as pontas soltas em tópicos'],
    optional: true,
    cta: 'Escrever crônica',
  },
  {
    kind: 'names',
    label: 'Nomes',
    icon: Tags,
    blurb: 'Doze nomes com uma linha de descrição cada.',
    placeholder: 'Nomes para quê? Ex.: anões de uma mina abandonada',
    examples: ['Anões de uma mina abandonada', 'Tavernas de uma cidade portuária', 'Cultistas de um deus esquecido'],
    optional: true,
    cta: 'Gerar nomes',
  },
  {
    kind: 'loot',
    label: 'Tesouro',
    icon: Gem,
    blurb: 'Moedas, curiosidades e no máximo um item mágico adequado ao grupo.',
    placeholder: 'Onde está o tesouro? Ex.: covil de um jovem dragão verde',
    examples: ['Covil de um jovem dragão verde', 'Bolsos de um chefe bandido', 'Altar de um templo profanado'],
    optional: true,
    cta: 'Revelar tesouro',
  },
  {
    kind: 'free',
    label: 'Livre',
    icon: MessageSquare,
    blurb: 'Pergunte qualquer coisa: ganchos, enigmas, vilões, improvisos.',
    placeholder: 'O que você precisa, Mestre?',
    examples: ['Três ganchos de aventura para uma vila pesqueira', 'Um enigma para abrir uma porta antiga', 'Como fazer meus jogadores odiarem o vilão?'],
    optional: false,
    cta: 'Perguntar',
  },
];

const MODE_BY_KIND = new Map(MODES.map((m) => [m.kind, m]));

const WAITING_LINES = [
  'O Oráculo consulta as estrelas…',
  'Folheando grimórios esquecidos…',
  'As brasas revelam formas…',
  'Sussurros atravessam o véu…',
  'Tinta dourada escorre pelo pergaminho…',
];

// ---------------------------------------------------------------------------
// Session store (survives panel remounts, not reloads)
// ---------------------------------------------------------------------------

interface OracleItem {
  id: string;
  kind: Kind;
  prompt: string;
  text: string;
  data: unknown;
  status: 'streaming' | 'done' | 'error' | 'stopped';
  error: string | null;
  ts: number;
}

interface OracleStore {
  kind: Kind;
  drafts: Partial<Record<Kind, string>>;
  items: OracleItem[];
  set(p: Partial<Pick<OracleStore, 'kind' | 'drafts' | 'items'>>): void;
  patch(id: string, p: Partial<OracleItem>): void;
}

const useOracle = create<OracleStore>((set, get) => ({
  kind: 'npc',
  drafts: {},
  items: [],
  set: (p) => set(p),
  patch: (id, p) => set({ items: get().items.map((x) => (x.id === id ? { ...x, ...p } : x)) }),
}));

const stopped = new Set<string>();

async function runOracle(kind: Kind, prompt: string): Promise<void> {
  const id = newId();
  const store = useOracle.getState();
  const item: OracleItem = { id, kind, prompt, text: '', data: null, status: 'streaming', error: null, ts: Date.now() };
  store.set({ items: [item, ...store.items].slice(0, 40) });

  let buf = '';
  let timer = 0;
  const flush = () => {
    timer = 0;
    if (!stopped.has(id)) useOracle.getState().patch(id, { text: buf });
  };
  const res = await askAi({ kind, prompt }, (chunk) => {
    if (stopped.has(id)) return;
    buf += chunk;
    if (!timer) timer = window.setTimeout(flush, 50);
  });
  window.clearTimeout(timer);
  if (stopped.has(id)) {
    stopped.delete(id);
    return;
  }
  if (res.ok) {
    useOracle.getState().patch(id, { text: res.text || buf, data: res.data ?? null, status: 'done' });
  } else {
    useOracle.getState().patch(id, { text: buf, status: 'error', error: res.error });
  }
}

function stopOracle(id: string): void {
  stopped.add(id);
  useOracle.getState().patch(id, { status: 'stopped' });
}

// ---------------------------------------------------------------------------
// Parsing helpers (models can return anything — never trust `data`)
// ---------------------------------------------------------------------------

const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_LABELS: Record<Ability, string> = { str: 'FOR', dex: 'DES', con: 'CON', int: 'INT', wis: 'SAB', cha: 'CAR' };

const DAMAGE_TYPES: DamageType[] = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'piercing', 'poison', 'psychic', 'radiant',
  'slashing', 'thunder', 'healing', 'none',
];
const DAMAGE_ALIASES: Record<string, DamageType> = {
  acido: 'acid', contundente: 'bludgeoning', concussao: 'bludgeoning', frio: 'cold', gelo: 'cold', fogo: 'fire',
  forca: 'force', energia: 'force', eletrico: 'lightning', raio: 'lightning', relampago: 'lightning',
  necrotico: 'necrotic', perfurante: 'piercing', veneno: 'poison', venenoso: 'poison', psiquico: 'psychic',
  radiante: 'radiant', cortante: 'slashing', trovao: 'thunder', cura: 'healing',
};

function str(v: unknown, max = 200): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : '';
}

function num(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /-?\d+(?:[.,]\d+)?/.exec(v);
    if (m) {
      const n = Number(m[0].replace(',', '.'));
      if (Number.isFinite(n)) return n;
    }
  }
  return fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(num(v, fallback))));
}

function damageType(v: unknown): DamageType {
  const s = str(v, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[\s|/,]/)[0] ?? '';
  if ((DAMAGE_TYPES as string[]).includes(s)) return s as DamageType;
  return DAMAGE_ALIASES[s] ?? 'none';
}

function damageFormula(v: unknown): string | null {
  const raw = str(v, 80);
  if (!raw) return null;
  if (parseFormula(raw).ok) return raw;
  const m = /\d*\s*d\s*\d+(?:\s*[+-]\s*\d+)?/i.exec(raw);
  if (m) {
    const f = m[0].replace(/\s+/g, '');
    if (parseFormula(f).ok) return f;
  }
  const flat = /^\d+$/.exec(raw);
  return flat ? raw : null;
}

interface NpcData {
  name: string;
  race: string;
  role: string;
  ac: number;
  hp: number;
  speed: number;
  abilities: AbilityScores;
  attacks: { name: string; bonus: number; damage: string | null; type: DamageType }[];
  cr: number | null;
  notes: string;
}

function parseNpc(d: unknown): NpcData | null {
  if (!isRecord(d)) return null;
  const name = str(d.name, 120);
  if (!name) return null;
  const ab = isRecord(d.abilities) ? d.abilities : {};
  const abilities = Object.fromEntries(ABILITIES.map((a) => [a, int(ab[a], 10, 1, 30)])) as AbilityScores;
  const attacks = (Array.isArray(d.attacks) ? d.attacks : [])
    .filter(isRecord)
    .slice(0, 12)
    .map((a) => ({ name: str(a.name, 120) || 'Ataque', bonus: int(a.bonus, 0, -50, 50), damage: damageFormula(a.damage), type: damageType(a.type) }));
  const crRaw = num(d.cr, Number.NaN);
  return {
    name,
    race: str(d.race, 80),
    role: str(d.role, 120),
    ac: int(d.ac, 12, 0, 60),
    hp: int(d.hp, 10, 1, 100_000),
    speed: int(d.speed, 30, 0, 1000),
    abilities,
    attacks,
    cr: Number.isFinite(crRaw) ? Math.max(0, Math.min(30, crRaw)) : null,
    notes: str(d.notes, 4000),
  };
}

interface EncounterData {
  title: string;
  monsters: { id: string; count: number }[];
  rating: { xp: number; adjustedXp: number; difficulty: EncounterDifficulty } | null;
}

function parseEncounter(d: unknown): EncounterData | null {
  if (!isRecord(d)) return null;
  const monsters = (Array.isArray(d.monsters) ? d.monsters : [])
    .filter(isRecord)
    .map((m) => ({ id: str(m.id, 80), count: int(m.count, 1, 1, 20) }))
    .filter((m) => m.id);
  let rating: EncounterData['rating'] = null;
  if (isRecord(d.rating)) {
    const diff = str(d.rating.difficulty, 20) as EncounterDifficulty;
    rating = {
      xp: int(d.rating.xp, 0, 0, 10_000_000),
      adjustedXp: int(d.rating.adjustedXp, 0, 0, 10_000_000),
      difficulty: diff in DIFFICULTY_LABELS ? diff : 'medium',
    };
  }
  return { title: str(d.title, 120) || 'Encontro', monsters, rating };
}

function monsterInfo(id: string): Monster | undefined {
  const table = MONSTERS_BY_ID as Record<string, Monster | undefined>;
  return Object.prototype.hasOwnProperty.call(table, id) ? table[id] : undefined;
}

/** Hide ```json blocks (closed or still streaming) from the visible answer. */
function visibleText(kind: Kind, text: string): string {
  if (kind !== 'npc' && kind !== 'encounter') return text;
  return text.replace(/```(?:json)?[\s\S]*?(?:```|$)/g, '').trim();
}

/** Narration for the chat: drop the DM-only "Para o Mestre" section. */
function narrationText(text: string): string {
  const cut = text.search(/\n\s*(?:#{1,6}\s*|[*_]{1,2})?\s*Para o Mestre/i);
  let out = (cut >= 0 ? text.slice(0, cut) : text).trim();
  if (out.length > 3_990) {
    out = out.slice(0, 3_990);
    const p = out.lastIndexOf('\n\n');
    if (p > 2_000) out = out.slice(0, p);
  }
  return out;
}

function dmy(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado para a área de transferência.', 'success', 2000);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Copiado para a área de transferência.', 'success', 2000);
    } catch {
      toast('Não foi possível copiar.', 'danger');
    }
    ta.remove();
  }
}

function journalTitle(item: OracleItem): string {
  const p = item.prompt.trim().replace(/\s+/g, ' ').slice(0, 60);
  switch (item.kind) {
    case 'summary': return `Sessão de ${dmy()}`;
    case 'npc': return parseNpc(item.data)?.name ?? (p ? `NPC: ${p}` : 'NPC');
    case 'encounter': return parseEncounter(item.data)?.title ?? 'Encontro';
    case 'scene': return p ? `Cena: ${p}` : 'Cena';
    case 'names': return p ? `Nomes: ${p}` : 'Nomes';
    case 'loot': return p ? `Tesouro: ${p}` : 'Tesouro';
    case 'rules': return p ? `Regra: ${p}` : 'Regra';
    default: return p || 'Oráculo';
  }
}

async function saveToJournal(item: OracleItem): Promise<boolean> {
  const body = visibleText(item.kind, item.text).slice(0, 200_000);
  const res = await act('journal.create', {
    entry: { title: journalTitle(item).slice(0, 200), body, folder: item.kind === 'summary' ? 'Sessões' : 'Oráculo' },
  });
  if (res.ok) {
    toast(
      <span className="orc-toast">
        Salvo no Diário.
        <button type="button" className="orc-toast__btn" onClick={() => useUi.getState().openSidebar('journal')}>Abrir</button>
      </span>,
      'success',
    );
  }
  return res.ok;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function OraclePanel() {
  const aiEnabled = useGame((s) => s.aiEnabled);
  return <div className="orc-panel">{aiEnabled ? <Oracle /> : <OracleAsleep />}</div>;
}

function OracleAsleep() {
  return (
    <div className="orc-scroll">
      <div className="orc-off">
        <div className="orc-off__sigil" aria-hidden="true">
          <Sparkles />
        </div>
        <h3 className="orc-off__title">O Oráculo dorme</h3>
        <p className="orc-off__text">
          Para despertá-lo, o servidor precisa de uma chave da IA <strong>Kimi</strong>. Adicione uma destas variáveis no
          arquivo <code>.env</code> do servidor e reinicie-o:
        </p>
        <pre className="orc-code">
          <span className="orc-code__c"># Moonshot (direto)</span>
          {'\n'}MOONSHOT_API_KEY=sk-…{'\n\n'}
          <span className="orc-code__c"># ou via OpenRouter</span>
          {'\n'}OPENROUTER_API_KEY=sk-or-…
        </pre>
        <div className="orc-off__hint"><KeyRound /> A chave fica só no servidor; os jogadores nunca a veem.</div>
        <div className="orc-off__list">
          {MODES.map((m) => (
            <span key={m.kind} className="chip"><m.icon />{m.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Oracle() {
  const kind = useOracle((s) => s.kind);
  const drafts = useOracle((s) => s.drafts);
  const items = useOracle((s) => s.items);
  const mode = MODE_BY_KIND.get(kind) ?? MODES[0]!;
  const prompt = drafts[kind] ?? '';
  const busy = items.some((x) => x.status === 'streaming');
  const [current, ...older] = items;
  const [historyOpen, setHistoryOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const setPrompt = (v: string) => useOracle.getState().set({ drafts: { ...useOracle.getState().drafts, [kind]: v } });
  const canSend = !busy && (mode.optional || prompt.trim().length > 0);

  const send = (text = prompt) => {
    if (busy) return;
    if (!mode.optional && !text.trim()) {
      taRef.current?.focus();
      return;
    }
    void runOracle(kind, text.trim());
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="orc-scroll" ref={scrollRef}>
      <div className="orc-compose">
        <div className="orc-modes" role="tablist" aria-label="Tipo de consulta">
          {MODES.map((m) => (
            <button
              key={m.kind}
              type="button"
              role="tab"
              className="orc-mode"
              aria-selected={m.kind === kind}
              data-active={m.kind === kind ? 'true' : undefined}
              onClick={() => {
                useOracle.getState().set({ kind: m.kind });
                requestAnimationFrame(() => taRef.current?.focus());
              }}
            >
              <m.icon />
              {m.label}
            </button>
          ))}
        </div>

        <p className="orc-blurb" key={kind}>{mode.blurb}</p>

        <div className="orc-input">
          <textarea
            ref={taRef}
            className="textarea orc-textarea"
            value={prompt}
            maxLength={4000}
            placeholder={mode.placeholder}
            rows={3}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="orc-input__bar">
            <span className="orc-kbd-hint"><span className="kbd">Ctrl</span>+<span className="kbd">Enter</span></span>
            <span className="u-grow" />
            {busy && current?.status === 'streaming' ? (
              <Button size="sm" variant="ghost" icon={<Square />} onClick={() => stopOracle(current.id)}>Parar</Button>
            ) : null}
            <Button size="sm" variant="primary" icon={busy ? <Spinner /> : <Send />} disabled={!canSend} onClick={() => send()}>
              {mode.cta}
            </Button>
          </div>
        </div>

        <div className="orc-examples" key={`ex-${kind}`}>
          {mode.examples.map((ex) => (
            <button
              key={ex}
              type="button"
              className="orc-example"
              onClick={() => {
                setPrompt(ex);
                taRef.current?.focus();
              }}
              disabled={busy}
            >
              <Sparkles />
              {ex}
            </button>
          ))}
        </div>
      </div>

      {current ? (
        <ResultCard key={current.id} item={current} featured scrollRef={scrollRef} />
      ) : (
        <div className="orc-welcome">
          <div className="orc-welcome__orb" aria-hidden="true"><Sparkles /></div>
          <div className="orc-welcome__title">Pergunte ao Oráculo</div>
          <div className="orc-welcome__text">Escolha um tipo de consulta, escreva o pedido (ou use um exemplo) e veja a resposta surgir.</div>
        </div>
      )}

      {older.length > 0 && (
        <section className="orc-history" data-open={historyOpen ? 'true' : undefined}>
          <div className="orc-history__head">
            <button type="button" className="orc-history__toggle" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
              <ChevronRight className="orc-chev" />
              <History />
              Histórico da sessão
              <span className="orc-count">{older.length}</span>
            </button>
            <IconButton
              size="sm"
              icon={<Trash2 />}
              label="Limpar histórico"
              onClick={() => useOracle.getState().set({ items: useOracle.getState().items.slice(0, 1) })}
            />
          </div>
          {historyOpen && (
            <div className="orc-history__list">
              {older.map((it) => <HistoryItem key={it.id} item={it} />)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function HistoryItem({ item }: { item: OracleItem }) {
  const [open, setOpen] = useState(false);
  const mode = MODE_BY_KIND.get(item.kind) ?? MODES[0]!;
  return (
    <div className="orc-hitem" data-open={open ? 'true' : undefined}>
      <button type="button" className="orc-hitem__head" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="orc-hitem__icon"><mode.icon /></span>
        <span className="orc-hitem__text">
          <span className="orc-hitem__kind">{mode.label} · {timeOf(item.ts)}</span>
          <span className="orc-hitem__prompt u-ellipsis">{item.prompt || <em className="u-dim">sem instruções</em>}</span>
        </span>
        <ChevronRight className="orc-chev" />
      </button>
      {open && <ResultCard item={item} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Result card
// ---------------------------------------------------------------------------

function ResultCard({ item, featured, scrollRef }: { item: OracleItem; featured?: boolean; scrollRef?: React.RefObject<HTMLDivElement | null> }) {
  const mode = MODE_BY_KIND.get(item.kind) ?? MODES[0]!;
  const text = useMemo(() => visibleText(item.kind, item.text), [item.kind, item.text]);
  const streaming = item.status === 'streaming';
  const done = item.status === 'done' || item.status === 'stopped';
  const endRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);

  // Keep the end of a streaming answer in view unless the DM scrolls away.
  useEffect(() => {
    const el = scrollRef?.current;
    if (!el || !streaming) return;
    const stop = () => {
      follow.current = false;
    };
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('touchmove', stop, { passive: true });
    return () => {
      el.removeEventListener('wheel', stop);
      el.removeEventListener('touchmove', stop);
    };
  }, [scrollRef, streaming]);
  useEffect(() => {
    if (!streaming || !follow.current || !featured || !text) return;
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [text, streaming, featured]);

  return (
    <article className="orc-result" data-featured={featured ? 'true' : undefined} data-status={item.status}>
      {featured && (
        <header className="orc-result__head">
          <span className="orc-result__icon"><mode.icon /></span>
          <div className="u-grow" style={{ minWidth: 0 }}>
            <div className="orc-result__kind">{mode.label}{streaming && <span className="orc-live">ao vivo</span>}</div>
            <div className="orc-result__prompt u-ellipsis" title={item.prompt}>{item.prompt || 'Sem instruções — o Oráculo escolhe.'}</div>
          </div>
          {done && text && <IconButton size="sm" icon={<Copy />} label="Copiar" onClick={() => void copyText(text)} />}
        </header>
      )}

      <div className="orc-result__body">
        {streaming && !text ? (
          <Waiting />
        ) : text ? (
          <>
            <Markdown text={text} className="orc-md" />
            {streaming && <span className="orc-caret" aria-hidden="true" />}
          </>
        ) : item.status !== 'error' ? (
          <p className="u-dim u-flavor">O Oráculo permaneceu em silêncio.</p>
        ) : null}
        {item.status === 'stopped' && <div className="orc-note">Resposta interrompida.</div>}
        {item.status === 'error' && (
          <div className="orc-error">
            <span>{item.error ?? 'O Oráculo não respondeu.'}</span>
            <Button size="sm" icon={<RotateCcw />} onClick={() => void runOracle(item.kind, item.prompt)}>Tentar de novo</Button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {item.status === 'done' && item.kind === 'npc' && <NpcBlock item={item} />}
      {item.status === 'done' && item.kind === 'encounter' && <EncounterBlock data={item.data} />}

      {done && text && <ResultActions item={item} text={text} />}
    </article>
  );
}

function Waiting() {
  const [i, setI] = useState(() => Math.floor(Math.random() * WAITING_LINES.length));
  useEffect(() => {
    const t = window.setInterval(() => setI((v) => (v + 1) % WAITING_LINES.length), 2400);
    return () => window.clearInterval(t);
  }, []);
  return (
    <div className="orc-wait" aria-live="polite">
      <div className="orc-wait__line u-flavor" key={i}>{WAITING_LINES[i]}</div>
      <div className="orc-shimmer" style={{ width: '92%' }} />
      <div className="orc-shimmer" style={{ width: '78%' }} />
      <div className="orc-shimmer" style={{ width: '85%' }} />
      <div className="orc-shimmer" style={{ width: '55%' }} />
    </div>
  );
}

function ResultActions({ item, text }: { item: OracleItem; text: string }) {
  const [saved, setSaved] = useState(false);
  const [narrated, setNarrated] = useState(false);
  const [busy, setBusy] = useState(false);

  const narrate = async () => {
    const t = narrationText(text);
    if (!t) return;
    setBusy(true);
    const res = await act('chat.send', { text: `/desc ${t}` });
    setBusy(false);
    if (res.ok) {
      setNarrated(true);
      toast('Narração enviada ao chat.', 'success', 2200);
    }
  };

  const save = async () => {
    setBusy(true);
    const ok = await saveToJournal(item);
    setBusy(false);
    if (ok) setSaved(true);
  };

  return (
    <footer className="orc-actions">
      {item.kind === 'scene' && (
        <Button size="sm" variant="primary" icon={narrated ? <Check /> : <MessageSquareQuote />} onClick={() => void narrate()} disabled={busy}>
          {narrated ? 'Narrado' : 'Narrar no chat'}
        </Button>
      )}
      <Button
        size="sm"
        variant={item.kind === 'summary' ? 'primary' : 'default'}
        icon={saved ? <Check /> : <BookPlus />}
        onClick={() => void save()}
        disabled={busy || saved}
      >
        {saved ? 'No Diário' : 'Salvar no Diário'}
      </Button>
      <Button size="sm" variant="ghost" icon={<Copy />} onClick={() => void copyText(text)}>Copiar</Button>
      <span className="u-grow" />
      <IconButton size="sm" icon={<RotateCcw />} label="Gerar de novo" onClick={() => void runOracle(item.kind, item.prompt)} />
    </footer>
  );
}

// ---------------------------------------------------------------------------
// NPC
// ---------------------------------------------------------------------------

function NpcBlock({ item }: { item: OracleItem }) {
  const npc = useMemo(() => parseNpc(item.data), [item.data]);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);

  if (!npc) {
    return <div className="orc-note">A ficha estruturada não veio completa — copie o texto ou gere de novo.</div>;
  }

  const create = async (place: boolean) => {
    setBusy(true);
    let id = createdId;
    if (!id) {
      const attacks: Attack[] = npc.attacks.map((a) => ({
        id: newId(),
        name: a.name,
        ability: 'none',
        proficient: false,
        bonus: a.bonus,
        damage: a.damage ? [{ formula: a.damage, type: a.type }] : [],
        range: '',
        critOn: 20,
        notes: '',
        save: null,
      }));
      const head = [npc.role && `**${npc.role}**`, npc.cr !== null && `ND ${formatCr(npc.cr)}`].filter(Boolean).join(' · ');
      const notes = [head, visibleText('npc', item.text), npc.notes && `---\n${npc.notes}`].filter(Boolean).join('\n\n').slice(0, 40_000);
      const res = await act('character.create', {
        character: {
          kind: 'npc',
          name: npc.name,
          race: npc.race,
          abilities: npc.abilities,
          hp: { cur: npc.hp, max: npc.hp, temp: 0 },
          ac: { mode: 'manual', value: npc.ac, bonus: 0 },
          speed: npc.speed,
          attacks,
          notes,
        },
      });
      id = res.ok ? (res.result as { id?: string } | undefined)?.id ?? null : null;
      if (!id) {
        setBusy(false);
        return;
      }
      setCreatedId(id);
      if (!place) toast(<>Ficha de <strong>{npc.name}</strong> criada.</>, 'success');
    }
    if (place) {
      const scene = getViewScene();
      if (!scene) {
        toast('Nenhuma cena aberta para colocar o token.', 'warning');
      } else {
        const c = engineApi.viewCenter();
        const half = scene.grid.size / 2;
        const res = await act('token.create', { sceneId: scene.id, token: { x: c.x - half, y: c.y - half }, fromCharacter: id });
        if (res.ok) {
          setPlaced(true);
          toast(<><strong>{npc.name}</strong> entrou em cena.</>, 'success');
        }
      }
    }
    setBusy(false);
  };

  return (
    <div className="orc-npc">
      <div className="orc-npc__head">
        <div className="u-grow" style={{ minWidth: 0 }}>
          <div className="orc-npc__name u-ellipsis">{npc.name}</div>
          <div className="orc-npc__sub u-ellipsis">{[npc.race, npc.role].filter(Boolean).join(' · ') || 'NPC'}</div>
        </div>
        {npc.cr !== null && <span className="badge badge--gold">ND {formatCr(npc.cr)}</span>}
      </div>
      <div className="orc-npc__stats">
        <span><b>CA</b>{npc.ac}</span>
        <span><b>PV</b>{npc.hp}</span>
        <span><b>Desl.</b>{npc.speed} pés</span>
      </div>
      <div className="orc-npc__abil">
        {ABILITIES.map((a) => {
          const v = npc.abilities[a];
          const m = Math.floor((v - 10) / 2);
          return (
            <span key={a}>
              <b>{ABILITY_LABELS[a]}</b>
              {v}
              <i>{m >= 0 ? `+${m}` : m}</i>
            </span>
          );
        })}
      </div>
      {npc.attacks.length > 0 && (
        <ul className="orc-npc__atk">
          {npc.attacks.map((a, i) => (
            <li key={i}>
              <Swords />
              <span className="u-grow u-ellipsis">{a.name}</span>
              <span className="u-tabular">{a.bonus >= 0 ? `+${a.bonus}` : a.bonus}</span>
              {a.damage && <span className="u-tabular u-muted">{a.damage}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="orc-npc__actions">
        {createdId ? (
          <Button size="sm" icon={<ExternalLink />} onClick={() => useUi.getState().openSheet(createdId)}>Abrir ficha</Button>
        ) : (
          <Button size="sm" variant="primary" icon={busy ? <Spinner /> : <UserPlus />} onClick={() => void create(false)} disabled={busy}>
            Criar NPC
          </Button>
        )}
        <Button size="sm" variant="arcane" icon={placed ? <Check /> : <MapPin />} onClick={() => void create(true)} disabled={busy}>
          {createdId ? (placed ? 'Colocar outro' : 'Colocar no mapa') : 'Criar e colocar no mapa'}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Encounter
// ---------------------------------------------------------------------------

function EncounterBlock({ data }: { data: unknown }) {
  const enc = useMemo(() => parseEncounter(data), [data]);
  const [rollHp, setRollHp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(0);

  if (!enc || !enc.monsters.length) {
    return <div className="orc-note">Nenhum monstro do compêndio veio na resposta — ajuste o pedido e gere de novo.</div>;
  }

  const total = enc.monsters.reduce((s, m) => s + m.count, 0);
  const diff = enc.rating ? DIFFICULTY_LABELS[enc.rating.difficulty] : null;

  const place = async () => {
    const scene = getViewScene();
    if (!scene) {
      toast('Nenhuma cena aberta para colocar os monstros.', 'warning');
      return;
    }
    setBusy(true);
    const c = engineApi.viewCenter();
    const g = scene.grid.size;
    const n = enc.monsters.length;
    const radius = n > 1 ? g * (2.5 + n * 0.4) : 0;
    let ok = 0;
    for (let i = 0; i < n; i++) {
      const m = enc.monsters[i]!;
      const size = SIZE_CELLS[monsterInfo(m.id)?.size ?? 'medium'] ?? 1;
      const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
      const rowW = m.count * size * g;
      const x = c.x + Math.cos(angle) * radius - rowW / 2;
      const y = c.y + Math.sin(angle) * radius - (size * g) / 2;
      const res = await act('token.create', { sceneId: scene.id, token: { x, y }, fromMonster: m.id, count: m.count, rollHp });
      if (res.ok) ok += m.count;
    }
    setBusy(false);
    if (ok) {
      setPlaced((v) => v + 1);
      toast(<>{ok} {ok === 1 ? 'criatura colocada' : 'criaturas colocadas'} no mapa.</>, 'success');
    }
  };

  return (
    <div className="orc-enc">
      <div className="orc-enc__head">
        <Swords />
        <div className="orc-enc__title u-grow u-ellipsis">{enc.title}</div>
        {diff && (
          <span className="orc-diff" style={{ '--diff': diff.color } as React.CSSProperties}>{diff.name}</span>
        )}
      </div>
      <ul className="orc-enc__list">
        {enc.monsters.map((m) => {
          const info = monsterInfo(m.id);
          return (
            <li key={m.id}>
              <span className="orc-enc__count">×{m.count}</span>
              <span className="u-grow u-ellipsis">{info?.name ?? m.id}</span>
              {info && <span className="badge">ND {formatCr(info.cr)}</span>}
              {info && <span className="u-xs u-muted u-tabular">{info.xp * m.count} XP</span>}
            </li>
          );
        })}
      </ul>
      {enc.rating && (
        <div className="orc-enc__xp">
          <span>{enc.rating.xp.toLocaleString('pt-BR')} XP</span>
          <span className="u-dim">·</span>
          <span>ajustado {enc.rating.adjustedXp.toLocaleString('pt-BR')}</span>
          <span className="u-dim">·</span>
          <span>{total} {total === 1 ? 'criatura' : 'criaturas'}</span>
        </div>
      )}
      <div className="orc-enc__actions">
        <Toggle checked={rollHp} onChange={setRollHp} label={<span className="u-row u-gap-1 u-sm"><Dices className="orc-ic" /> Rolar PV</span>} />
        <span className="u-grow" />
        <Button size="sm" variant="primary" icon={busy ? <Spinner /> : placed ? <Check /> : <MapPin />} onClick={() => void place()} disabled={busy}>
          {placed ? 'Colocar de novo' : 'Colocar no mapa'}
        </Button>
      </div>
    </div>
  );
}

