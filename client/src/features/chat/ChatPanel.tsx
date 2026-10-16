import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronUp, Dices, MessageCircle, Send, UserRound } from 'lucide-react';
import { act, loadOlderChat } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM, useMyCharacter, useSelectedTokens } from '../../store/hooks.ts';
import { IconButton, Popover, MenuItem } from '../../ui/index.tsx';
import { ChatMessageView } from './ChatMessage.tsx';
import './chat.css';

const COMMANDS: { cmd: string; desc: string; dm?: boolean }[] = [
  { cmd: '/r 1d20+5 Ataque', desc: 'Rolar dados (público)' },
  { cmd: '/gr 2d6', desc: 'Rolagem só para o Mestre' },
  { cmd: '/br 1d20', desc: 'Rolagem cega (nem você vê)' },
  { cmd: '/w Nome mensagem', desc: 'Sussurrar para alguém' },
  { cmd: '/me olha em volta', desc: 'Ação em terceira pessoa' },
  { cmd: '/ooc texto', desc: 'Fora do personagem' },
  { cmd: '/desc A porta range…', desc: 'Narração do Mestre', dm: true },
  { cmd: '/clear', desc: 'Limpar o chat', dm: true },
];

export default function ChatPanel() {
  const chat = useGame((s) => s.chat);
  const complete = useGame((s) => s.chatComplete);
  const listRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [loading, setLoading] = useState(false);

  // Stick to bottom when new messages arrive (if already at bottom).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && atBottom) el.scrollTop = el.scrollHeight;
  }, [chat, atBottom]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const older = async () => {
    const el = listRef.current;
    const prevH = el?.scrollHeight ?? 0;
    setLoading(true);
    await loadOlderChat();
    setLoading(false);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevH;
    });
  };

  return (
    <div className="chat">
      <div className="chat__list" ref={listRef} onScroll={onScroll}>
        {!complete && chat.length >= 100 && (
          <button type="button" className="btn btn--sm btn--ghost chat__older" onClick={older} disabled={loading}><ChevronUp /> Mensagens anteriores</button>
        )}
        {chat.length === 0 && (
          <div className="chat__empty">
            <Dices />
            <div className="u-display">A taverna está silenciosa…</div>
            <div className="u-xs u-muted">Diga olá, role um <span className="kbd">d20</span> ou use <span className="kbd">/r 1d20+5</span></div>
          </div>
        )}
        {chat.map((m, i) => {
          const prev = chat[i - 1];
          const grouped = !!prev && prev.authorId === m.authorId && prev.kind === 'text' && m.kind === 'text'
            && m.ts - prev.ts < 120_000 && prev.speaker === m.speaker && !m.whisperTo.length && !prev.whisperTo.length;
          return <ChatMessageView key={m.id} msg={m} grouped={grouped} />;
        })}
      </div>
      {!atBottom && (
        <button type="button" className="chat__jump" onClick={() => setAtBottom(true)}><ArrowDown size={14} /> Novas mensagens</button>
      )}
      <ChatInput />
    </div>
  );
}

function ChatInput() {
  const [text, setText] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIndex, setHIndex] = useState(-1);
  const [speakerAnchor, setSpeakerAnchor] = useState<HTMLElement | null>(null);
  const [whisperAnchor, setWhisperAnchor] = useState<HTMLElement | null>(null);
  const [speaker, setSpeaker] = useState<string | null>(null);
  const [whisperTo, setWhisperTo] = useState<string[]>([]);
  const isDM = useIsDM();
  const me = useGame((s) => s.me);
  const players = useGame((s) => s.state?.players);
  const myChar = useMyCharacter();
  const selected = useSelectedTokens();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Default to speaking as my character.
    if (!isDM && myChar && speaker === null) setSpeaker(myChar.name);
  }, [isDM, myChar, speaker]);

  const hints = useMemo(() => {
    if (!text.startsWith('/') || text.includes(' ')) return [];
    return COMMANDS.filter((c) => (!c.dm || isDM) && c.cmd.startsWith(text.toLowerCase().slice(0, 3)));
  }, [text, isDM]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    setHistory((h) => [t, ...h.slice(0, 30)]);
    setHIndex(-1);
    const res = await act('chat.send', { text: t, speaker: t.startsWith('/') && !/^\/(r|roll|gr|br|me)\b/.test(t) ? null : speaker, whisperTo: whisperTo.length ? whisperTo : undefined });
    if (!res.ok) setText(t);
  };

  const autosize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  };
  useLayoutEffect(autosize, [text]);

  const speakerOptions: { label: string; value: string | null }[] = [{ label: me?.name ?? 'Eu', value: null }];
  if (myChar) speakerOptions.push({ label: myChar.name, value: myChar.name });
  if (isDM) for (const t of selected) speakerOptions.push({ label: t.name, value: t.name });

  return (
    <div className="chat__input">
      {hints.length > 0 && (
        <div className="chat__hints">
          {hints.map((h) => (
            <button key={h.cmd} type="button" className="menu__item" onClick={() => { setText(`${h.cmd.split(' ')[0]} `); ref.current?.focus(); }}>
              <span className="u-mono u-gold">{h.cmd}</span>
              <span className="u-grow u-xs u-muted" style={{ textAlign: 'right' }}>{h.desc}</span>
            </button>
          ))}
        </div>
      )}
      <div className="chat__meta">
        <button type="button" className="chip" onClick={(e) => setSpeakerAnchor(e.currentTarget)} data-tip="Falar como">
          <UserRound /> {speaker ?? me?.name}
        </button>
        <button type="button" className="chip" data-active={whisperTo.length ? 'true' : undefined} onClick={(e) => setWhisperAnchor(e.currentTarget)} data-tip="Sussurrar">
          <MessageCircle /> {whisperTo.length ? `Sussurro: ${whisperTo.map((id) => players?.[id]?.name).join(', ')}` : 'Todos'}
        </button>
      </div>
      <div className="chat__box">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          placeholder={whisperTo.length ? 'Sussurrar…' : 'Mensagem, ou /r 1d20+5'}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            } else if (e.key === 'ArrowUp' && !text && history.length) {
              e.preventDefault();
              const i = Math.min(history.length - 1, hIndex + 1);
              setHIndex(i);
              setText(history[i]!);
            } else if (e.key === 'Escape') {
              (e.target as HTMLTextAreaElement).blur();
            }
          }}
        />
        <IconButton icon={<Send />} label="Enviar (Enter)" onClick={() => void send()} disabled={!text.trim()} />
      </div>
      {speakerAnchor && (
        <Popover anchor={speakerAnchor} onClose={() => setSpeakerAnchor(null)} placement="top">
          <div className="menu">
            <div className="menu__label">Falar como</div>
            {speakerOptions.map((o) => (
              <MenuItem key={o.label} icon={<UserRound />} onClick={() => { setSpeaker(o.value); setSpeakerAnchor(null); }}>{o.label}</MenuItem>
            ))}
          </div>
        </Popover>
      )}
      {whisperAnchor && players && (
        <Popover anchor={whisperAnchor} onClose={() => setWhisperAnchor(null)} placement="top">
          <div className="menu">
            <div className="menu__label">Sussurrar para</div>
            <MenuItem onClick={() => { setWhisperTo([]); setWhisperAnchor(null); }}>Todos (público)</MenuItem>
            {Object.values(players).filter((p) => p.id !== me?.id).map((p) => (
              <MenuItem key={p.id} onClick={() => setWhisperTo((w) => (w.includes(p.id) ? w.filter((x) => x !== p.id) : [...w, p.id]))}>
                <span className={whisperTo.includes(p.id) ? 'u-gold' : undefined}>{whisperTo.includes(p.id) ? '✓ ' : ''}{p.name}{p.role === 'dm' ? ' (Mestre)' : ''}</span>
              </MenuItem>
            ))}
          </div>
        </Popover>
      )}
    </div>
  );
}
