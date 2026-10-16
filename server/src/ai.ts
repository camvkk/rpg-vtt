// "Oráculo do Mestre": AI helpers backed by Kimi (Moonshot API or OpenRouter), OpenAI-compatible chat
// completions with streaming. Same providers/keys as v1 (MOONSHOT_API_KEY or OPENROUTER_API_KEY).
import { normalizeCustomSystem } from '../../shared/src/customSystem.ts';
import { MONSTERS } from '../../shared/src/data5e/monsters/index.ts';
import { formatCr, rateEncounter } from '../../shared/src/data5e/tables.ts';
import type { AiRequest, AiResponse, SystemDocument, SystemParseProgress } from '../../shared/src/protocol.ts';
import type { CustomSystem } from '../../shared/src/types.ts';
import { describeRoll } from '../../shared/src/dice.ts';
import { totalLevel } from '../../shared/src/rules5e.ts';
import { aiEnabled, config } from './config.ts';
import type { Room } from './room.ts';

interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const BASE_SYSTEM = `Você é o Oráculo, assistente de um Mestre de RPG de mesa (D&D 5e, SRD 5.1) em uma mesa virtual brasileira.
Responda SEMPRE em português do Brasil, com tom de fantasia sombria elegante, criativo mas útil na mesa.
Seja conciso e prático: o Mestre está no meio da sessão. Use markdown simples (títulos curtos, listas, negrito).
Nunca invente regras como se fossem oficiais; quando improvisar, deixe claro que é sugestão.`;

function provider(): { url: string; key: string; model: string; headers: Record<string, string> } {
  if (config.ai.moonshotKey) {
    return { url: 'https://api.moonshot.ai/v1/chat/completions', key: config.ai.moonshotKey, model: config.ai.model || 'kimi-k2.5', headers: {} };
  }
  return {
    url: 'https://openrouter.ai/api/v1/chat/completions',
    key: config.ai.openrouterKey,
    model: config.ai.model || 'moonshotai/kimi-k2.5',
    headers: { 'HTTP-Referer': 'https://github.com/camvkk/rpg-vtt', 'X-Title': 'RPG VTT Oraculo' },
  };
}

/**
 * Streams a completion, calling onChunk with visible text deltas. Returns the full text.
 * `onThinking` receives the length of reasoning deltas (Kimi thinks before answering) for progress UIs.
 */
async function complete(
  messages: ChatMsg[],
  onChunk: (t: string) => void,
  maxTokens = 3000,
  opts: { timeoutMs?: number; onThinking?: (chars: number) => void } = {},
): Promise<string> {
  if (!aiEnabled()) throw new Error('Oráculo desligado: configure MOONSHOT_API_KEY ou OPENROUTER_API_KEY no servidor.');
  const p = provider();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 120_000);
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}`, ...p.headers },
      body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature: 1, stream: true }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => '');
      console.error('[ai] provider error', res.status, body.slice(0, 500));
      throw new Error(res.status === 401 ? 'Chave de IA inválida.' : res.status === 429 ? 'Limite da IA atingido, tente mais tarde.' : `A IA respondeu com erro ${res.status}.`);
    }
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const json = JSON.parse(data) as { choices?: { delta?: { content?: string; reasoning_content?: string; reasoning?: string } }[] };
          const d = json.choices?.[0]?.delta;
          const delta = d?.content;
          if (delta) {
            full += delta;
            onChunk(delta);
          }
          const thought = d?.reasoning_content ?? d?.reasoning;
          if (thought && opts.onThinking) opts.onThinking(thought.length);
        } catch {
          // keep-alive / partial line
        }
      }
    }
    return full;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('A IA demorou demais para responder.');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract the last ```json block (or a bare {...}) from a reply. */
export function extractJson(text: string): unknown {
  const blocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  const candidate = blocks.length ? blocks[blocks.length - 1]![1]! : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

function stripJsonBlock(text: string): string {
  return text.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
}

function partyLevels(room: Room): number[] {
  return Object.values(room.state.characters)
    .filter((c) => c.kind === 'pc')
    .map((c) => totalLevel(c));
}

function chatLog(room: Room, limit = 220): string {
  const msgs = room.chatFor({ id: 'dm', role: 'dm' }, undefined, limit);
  return msgs
    .map((m) => {
      const who = m.speaker || m.authorName;
      if (m.kind === 'system') return `[sistema] ${m.text}`;
      if (m.roll) return `${who} rolou ${m.text ? `${m.text} ` : ''}= ${m.roll.total} (${describeRoll(m.roll)})`;
      if (m.card?.type === 'attack') {
        const t = m.card.targets.map((x) => `${x.name}: ${x.outcome ?? '?'}`).join(', ');
        return `${who} usou ${m.card.title}${t ? ` contra ${t}` : ''}`;
      }
      if (m.card) return `${who}: ${m.card.type}`;
      return `${who}: ${m.text}`;
    })
    .join('\n');
}

export async function runAi(room: Room, _requestId: string, req: AiRequest, onChunk: (t: string) => void): Promise<AiResponse> {
  const prompt = String(req.prompt ?? '').slice(0, 4_000);
  const scene = room.state.activeSceneId ? room.state.scenes[room.state.activeSceneId] : undefined;
  const levels = partyLevels(room);
  const partyText = levels.length ? `Grupo: ${levels.length} personagens, níveis ${levels.join(', ')}.` : 'Grupo ainda sem fichas.';
  const sceneText = scene ? `Cena atual: "${scene.name}" (escuridão ${Math.round(scene.lighting.darkness * 100)}%, clima: ${scene.weather.type}).` : '';

  switch (req.kind) {
    case 'npc': {
      const text = await complete([
        { role: 'system', content: BASE_SYSTEM },
        {
          role: 'user',
          content: `Crie um NPC memorável para a mesa. ${sceneText}\nPedido do Mestre: ${prompt || 'surpreenda-me'}\n\n` +
            'Formato: primeiro uma ficha em markdown com **Nome**, raça/ocupação, aparência (2 frases), personalidade, maneirismo/voz, ' +
            'o que quer, um segredo, e uma fala marcante entre aspas. Depois, um bloco ```json``` com: ' +
            '{"name": string, "race": string, "role": string, "ac": number, "hp": number, "speed": number, ' +
            '"abilities": {"str":n,"dex":n,"con":n,"int":n,"wis":n,"cha":n}, "attacks": [{"name": string, "bonus": number, "damage": "1d8+2", "type": "slashing|piercing|bludgeoning|fire|..."}], ' +
            '"cr": number, "notes": string} — números coerentes com D&D 5e para o nível do grupo.',
        },
      ], onChunk);
      return { ok: true, kind: 'npc', text: stripJsonBlock(text), data: extractJson(text) };
    }
    case 'scene': {
      const text = await complete([
        { role: 'system', content: BASE_SYSTEM },
        {
          role: 'user',
          content: `Escreva um texto para o Mestre ler em voz alta descrevendo o local. ${sceneText}\n` +
            `Detalhes do Mestre: ${prompt || '(nenhum — use o nome da cena)'}\n` +
            'Use 2 a 3 parágrafos curtos, envolvendo os cinco sentidos, terminando com um gancho. ' +
            'Depois, em "**Para o Mestre**", liste 3 detalhes secretos/interativos do local.',
        },
      ], onChunk, 1800);
      const split = text.split(/\*\*\s*Para o Mestre\s*:?\s*\*\*:?/i);
      return { ok: true, kind: 'scene', text, data: { readAloud: split[0]!.trim(), secrets: (split[1] ?? '').trim() } };
    }
    case 'encounter': {
      const avg = levels.length ? Math.round(levels.reduce((a, b) => a + b, 0) / levels.length) : 3;
      const maxCr = Math.max(1, avg + 3);
      const catalog = MONSTERS.filter((m) => m.cr <= maxCr)
        .map((m) => `${m.id}|${m.name}|ND ${formatCr(m.cr)}|${m.tags.join(',')}`)
        .join('\n');
      const text = await complete([
        { role: 'system', content: BASE_SYSTEM },
        {
          role: 'user',
          content: `Monte um encontro de combate. ${partyText} ${sceneText}\nPedido: ${prompt || 'um encontro desafiador e temático'}\n` +
            `Use SOMENTE monstros desta lista (id|nome|ND|tags):\n${catalog}\n\n` +
            'Responda com uma descrição curta em markdown (situação, táticas dos inimigos, terreno, recompensa) e por fim um bloco ```json``` ' +
            '{"title": string, "monsters": [{"id": string, "count": number}], "difficulty": "fácil|médio|difícil|mortal"}.',
        },
      ], onChunk, 2500);
      const data = extractJson(text) as { title?: string; monsters?: { id: string; count: number }[] } | null;
      const monsters = (data?.monsters ?? [])
        .filter((m) => MONSTERS.some((x) => x.id === m.id))
        .map((m) => ({ id: m.id, count: Math.max(1, Math.min(12, Math.round(Number(m.count) || 1))) }));
      const crs = monsters.flatMap((m) => Array.from({ length: m.count }, () => MONSTERS.find((x) => x.id === m.id)!.cr));
      const rating = crs.length ? rateEncounter(levels.length ? levels : [avg, avg, avg, avg], crs) : null;
      return { ok: true, kind: 'encounter', text: stripJsonBlock(text), data: { title: data?.title ?? 'Encontro', monsters, rating } };
    }
    case 'rules': {
      const text = await complete([
        { role: 'system', content: `${BASE_SYSTEM}\nVocê é especialista nas regras de D&D 5e (SRD 5.1). Explique a regra, dê um exemplo curto e, se houver ambiguidade, sugira uma decisão de mesa.` },
        { role: 'user', content: prompt },
      ], onChunk, 1500);
      return { ok: true, kind: 'rules', text };
    }
    case 'summary': {
      const log = chatLog(room);
      if (!log.trim()) return { ok: false, error: 'O chat está vazio — nada para resumir ainda.' };
      const text = await complete([
        { role: 'system', content: BASE_SYSTEM },
        {
          role: 'user',
          content: `Escreva o diário da sessão a partir do registro abaixo, como um cronista. Inclua: resumo narrativo (2–4 parágrafos), ` +
            `momentos marcantes (críticos, derrotas, decisões), NPCs/lugares citados e pontas soltas para a próxima sessão.\n` +
            `${prompt ? `Observação do Mestre: ${prompt}\n` : ''}\nREGISTRO:\n${log.slice(-24_000)}`,
        },
      ], onChunk, 2500);
      return { ok: true, kind: 'summary', text };
    }
    case 'names': {
      const text = await complete([
        { role: 'system', content: BASE_SYSTEM },
        { role: 'user', content: `Gere 12 nomes de fantasia (com uma linha de descrição cada) para: ${prompt || 'aventureiros variados'}.` },
      ], onChunk, 900);
      return { ok: true, kind: 'names', text };
    }
    case 'loot': {
      const text = await complete([
        { role: 'system', content: BASE_SYSTEM },
        { role: 'user', content: `Crie um tesouro interessante. ${partyText} Contexto: ${prompt || 'covil de monstros'}. Inclua moedas, 2–4 itens mundanos curiosos e no máximo 1 item mágico do SRD com raridade adequada.` },
      ], onChunk, 1200);
      return { ok: true, kind: 'loot', text };
    }
    default: {
      const text = await complete([
        { role: 'system', content: `${BASE_SYSTEM}\n${partyText} ${sceneText}` },
        { role: 'user', content: prompt },
      ], onChunk, 2000);
      return { ok: true, kind: 'free', text };
    }
  }
}

// ---------------------------------------------------------------------------
// Custom system importer ("Sistema Customizado")
// ---------------------------------------------------------------------------

/** Characters of source text sent to the model (~50k tokens; Kimi K2.5 has room, but output time grows). */
export const MAX_SYSTEM_SOURCE_CHARS = 150_000;

const SYSTEM_PARSER = `Você converte regras de RPG de mesa (sistemas próprios/homebrew ou publicados) em JSON para fichas de personagem automáticas de uma mesa virtual.
Responda APENAS com um objeto JSON válido — sem markdown, sem comentários, sem texto antes ou depois — neste formato:
{
  "name": "Nome do sistema",
  "description": "2 a 4 frases: tom, dado principal e como se resolve um teste",
  "modifier": "value",
  "checkFormula": "1d20+@atr",
  "skillFormula": "1d20+@atr+@pericia",
  "hpName": "Vida",
  "defenseName": "Defesa",
  "stats": [{ "key": "forca", "name": "Força", "short": "FOR", "description": "...", "min": 1, "max": 5, "default": 1 }],
  "skills": [{ "key": "atletismo", "name": "Atletismo", "stat": "forca", "description": "..." }],
  "resources": [{ "key": "mana", "name": "Mana", "max": 10, "description": "como calcular e recuperar" }],
  "races": [{ "name": "Elfo", "description": "...", "statBonuses": { "agilidade": 2, "forca": -1 }, "traits": ["Visão no escuro: ..."] }],
  "classes": [{ "name": "Guerreiro", "description": "...", "hitDie": "d10", "primaryStats": ["forca"], "skills": ["atletismo"], "features": ["Nível 1: Ataque Poderoso — ..."] }],
  "equipment": [{ "name": "Espada Longa", "type": "Arma", "damage": "1d8+@forca", "properties": ["versátil"], "cost": "15 po", "description": "..." }],
  "powers": [{ "name": "Bola de Fogo", "level": 3, "cost": "3 PM", "range": "30 m", "formula": "6d6", "description": "..." }],
  "mechanics": [{ "name": "Hackear", "description": "quando e como usar", "formula": "1d20+@mente+@tech" }],
  "rules": [{ "name": "Combate", "description": "resumo fiel da regra" }]
}

Regras:
- "key": identificador ASCII minúsculo, sem acentos nem espaços (ex.: "forca", "sanidade"). As keys dos atributos viram variáveis: @forca.
- Fórmulas: só notação de dados (NdM, + - *, kh/kl para manter maiores/menores, ! para explodir) e variáveis: @atr (modificador do atributo testado), @valor (valor do atributo), @pericia (valor da perícia na ficha), @nivel e @<key do atributo>. Nunca escreva palavras dentro de uma fórmula. Use null quando não houver rolagem.
- Parada de dados (a quantidade de dados vem da ficha): use chaves, ex.: "{@valor+@pericia}d10". Se o sistema conta sucessos, explique a contagem em "rules".
- "modifier": como o valor do atributo vira bônus — "value" (o próprio valor), "dnd" ((valor-10)/2, arredondado para baixo) ou "half" (metade).
- "checkFormula" é o teste de atributo e "skillFormula" o teste de perícia do sistema. "hpName"/"defenseName": como o sistema chama pontos de vida e a defesa/CA.
- "resources": pools além da vida (mana, sanidade, estresse...). "races" e "classes" podem ter outros nomes no sistema (origens, arquétipos, profissões): use-os mesmo assim.
- Mantenha o idioma dos documentos em nomes e descrições. Descrições curtas (até ~300 caracteres); em "rules", resumos fiéis de até ~1200 caracteres com os números importantes.
- Inclua só o que existe nos documentos; use [] para seções ausentes. No máximo 16 atributos, 80 perícias, 150 itens, 200 poderes, 60 mecânicas e 80 regras.`;

/**
 * Parse model output that should be one JSON object: strips fences/prose, tolerates trailing commas and
 * closes a truncated answer (long systems can hit the token limit) at the last complete value.
 */
export function parseJsonLoose(text: string): unknown {
  const fence = /```(?:json)?\s*([\s\S]*?)(?:```|$)/i.exec(text);
  let s = fence && fence[1]!.includes('{') ? fence[1]! : text;
  const start = s.indexOf('{');
  if (start < 0) return null;
  s = s.slice(start);
  const attempt = (x: string): unknown => {
    for (const candidate of [x, x.replace(/,(\s*[}\]])/g, '$1')]) {
      try {
        return JSON.parse(candidate);
      } catch {
        // try the next repair
      }
    }
    return undefined;
  };
  // Walk the text: find where the top-level object ends, or remember safe cut points if it never does.
  const stack: string[] = [];
  const cuts: { at: number; closers: string }[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') {
      stack.push(ch === '{' ? '}' : ']');
      cuts.push({ at: i + 1, closers: [...stack].reverse().join('') });
    } else if (ch === '}' || ch === ']') {
      stack.pop();
      if (!stack.length) {
        const whole = attempt(s.slice(0, i + 1));
        return whole === undefined ? null : whole;
      }
      cuts.push({ at: i + 1, closers: [...stack].reverse().join('') });
    } else if (ch === ',') {
      cuts.push({ at: i, closers: [...stack].reverse().join('') });
    }
  }
  // Truncated: close it right where it stops (a value may be complete), else at the latest safe cut.
  const closeHere = attempt(`${s}${inString ? '"' : ''}${[...stack].reverse().join('')}`);
  if (closeHere !== undefined) return closeHere;
  for (let k = cuts.length - 1, tries = 0; k >= 0 && tries < 400; k--, tries++) {
    const v = attempt(s.slice(0, cuts[k]!.at) + cuts[k]!.closers);
    if (v !== undefined) return v;
  }
  return null;
}

export type SystemParseResult = { ok: true; system: CustomSystem; warnings: string[] } | { ok: false; error: string };

/** DM-only: documents → AI → normalized CustomSystem (not saved; the DM previews it, then `system.save`). */
export async function parseCustomSystem(
  docs: SystemDocument[],
  instructions: string,
  progress: (p: SystemParseProgress) => void,
): Promise<SystemParseResult> {
  const warnings: string[] = [];
  let source = docs.map((d) => `=== ${d.name} ===\n${d.text}`).join('\n\n');
  if (source.length > MAX_SYSTEM_SOURCE_CHARS) {
    warnings.push(`Os documentos somam ${source.length.toLocaleString('pt-BR')} caracteres; só os primeiros ${MAX_SYSTEM_SOURCE_CHARS.toLocaleString('pt-BR')} foram lidos pela IA.`);
    source = `${source.slice(0, MAX_SYSTEM_SOURCE_CHARS)}\n\n[... texto cortado por limite de tamanho ...]`;
  }
  let thinking = 0;
  let written = 0;
  let last = 0;
  const report = (phase: SystemParseProgress['phase']) => {
    const now = Date.now();
    if (now - last < 400) return;
    last = now;
    progress({ phase, chars: phase === 'thinking' ? thinking : written });
  };
  const note = instructions.trim().slice(0, 2_000);
  const text = await complete([
    { role: 'system', content: SYSTEM_PARSER },
    { role: 'user', content: `${note ? `Observações do Mestre: ${note}\n\n` : ''}Converta as regras destes documentos:\n\n${source}` },
  ], (chunk) => {
    written += chunk.length;
    report('writing');
  }, 16_000, {
    timeoutMs: 360_000,
    onThinking: (n) => {
      thinking += n;
      report('thinking');
    },
  });
  const json = parseJsonLoose(text);
  if (json === null) {
    console.error('[ai] system parse: no JSON in reply', text.slice(0, 300));
    return { ok: false, error: 'A IA não devolveu um sistema legível. Tente de novo ou envie menos documentos por vez.' };
  }
  const result = normalizeCustomSystem(json, { sources: docs.map((d) => d.name) });
  if ('error' in result) return { ok: false, error: result.error };
  return { ok: true, system: result.system, warnings: [...warnings, ...result.warnings] };
}
