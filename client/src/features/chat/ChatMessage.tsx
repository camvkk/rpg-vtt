import { memo, useState } from 'react';
import {
  ChevronDown, Crosshair, Dices, EyeOff, Heart, HeartPulse, Lock, MessageCircle, Shield, Skull, Sparkles, Swords, Trash2,
} from 'lucide-react';
import { describeRoll } from '@shared/dice.ts';
import { ABILITY_NAME, DAMAGE_TYPE_COLOR, DAMAGE_TYPE_NAME } from '@shared/rules5e.ts';
import type { CardTarget, ChatCard, ChatMessage as Msg, RollResult } from '@shared/types.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { canControl } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Markdown } from '../../ui/index.tsx';

function time(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function RollBreakdown({ roll }: { roll: RollResult }) {
  return (
    <span className="roll-terms">
      {roll.terms.map((t, i) => {
        if (t.kind === 'dice') {
          const dice = (t.dice ?? []).filter((d) => !d.rerolled);
          return (
            <span key={i} className="roll-term">
              <span className="roll-term__label">{t.text}</span>
              {dice.map((d, j) => (
                <span
                  key={j}
                  className="die-chip"
                  data-dropped={d.dropped ? 'true' : undefined}
                  data-max={!d.dropped && d.value === d.sides ? 'true' : undefined}
                  data-min={!d.dropped && d.value === 1 ? 'true' : undefined}
                  data-tip={`d${d.sides}${d.exploded ? ' (explodiu)' : ''}`}
                >
                  {d.value}
                </span>
              ))}
              {t.flavor && <span className="roll-term__flavor">{t.flavor}</span>}
            </span>
          );
        }
        if (t.kind === 'op') return <span key={i} className="roll-op">{t.text}</span>;
        if (t.kind === 'number') return <span key={i} className="roll-num">{t.text}</span>;
        return <span key={i} className="roll-op">{t.text}</span>;
      })}
    </span>
  );
}

function Total({ roll, pending, size = 'md' }: { roll: RollResult; pending: boolean; size?: 'md' | 'lg' }) {
  return (
    <span
      className={`roll-total roll-total--${size}`}
      data-crit={!pending && roll.crit ? 'true' : undefined}
      data-fumble={!pending && roll.fumble ? 'true' : undefined}
      data-pending={pending ? 'true' : undefined}
      data-tip={pending ? undefined : describeRoll(roll)}
    >
      {pending ? <Dices className="roll-total__spin" /> : roll.total}
    </span>
  );
}

const OUTCOME: Record<string, { label: string; cls: string }> = {
  hit: { label: 'Acerto', cls: 'badge--success' },
  crit: { label: 'Crítico!', cls: 'badge--gold' },
  miss: { label: 'Erro', cls: 'badge--danger' },
  success: { label: 'Passou', cls: 'badge--success' },
  fail: { label: 'Falhou', cls: 'badge--danger' },
  pending: { label: 'Aguardando', cls: '' },
};

function TargetRow({ msg, t, index, card, pending }: { msg: Msg; t: CardTarget; index: number; card: Extract<ChatCard, { type: 'attack' | 'saveRequest' }>; pending: boolean }) {
  const isDM = useGame((s) => s.me?.role === 'dm');
  const token = useGame((s) => {
    if (!t.tokenId || !s.state) return undefined;
    for (const sc of Object.values(s.state.scenes)) if (sc.tokens[t.tokenId]) return sc.tokens[t.tokenId];
    return undefined;
  });
  const hasDamage = card.type === 'attack' ? card.damage.length > 0 : !!card.damage;
  const healing = card.type === 'attack' && card.damage.length > 0 && card.damage.every((d) => d.type === 'healing');
  const needsSave = t.outcome === 'pending' && (card.type === 'saveRequest' || !!card.save);
  const canRollSave = needsSave && token && canControl(token);
  const o = t.outcome ? OUTCOME[t.outcome] : null;
  return (
    <div className="card-target" data-outcome={pending ? undefined : t.outcome ?? undefined}>
      <Crosshair size={13} className="u-dim" />
      <span className="u-grow u-ellipsis">{t.name}</span>
      {t.ac !== null && <span className="card-target__ac" data-tip="CA"><Shield size={11} />{t.ac}</span>}
      {t.roll && <span className="card-target__roll u-mono" data-tip={describeRoll(t.roll)}>{t.roll.total}</span>}
      {canRollSave ? (
        <button type="button" className="btn btn--sm btn--primary" onClick={(e) => act('card.rollSave', {
          messageId: msg.id, targetIndex: index, mode: e.shiftKey ? 'adv' : e.ctrlKey ? 'dis' : useUi.getState().rollMode,
        })}><Dices /> Rolar</button>
      ) : o && !pending ? <span className={`badge ${o.cls}`}>{o.label}</span> : null}
      {isDM && hasDamage && !pending && t.outcome !== 'pending' && (
        <span className="card-target__apply">
          {healing ? (
            <button type="button" className="mini-btn mini-btn--heal" data-tip="Aplicar cura" onClick={() => act('card.apply', { messageId: msg.id, targetIndex: index, multiplier: 1 })}><Heart size={12} /></button>
          ) : (
            <>
              <button type="button" className="mini-btn" data-tip="Metade do dano" onClick={() => act('card.apply', { messageId: msg.id, targetIndex: index, multiplier: 0.5 })}>½</button>
              <button type="button" className="mini-btn mini-btn--dmg" data-tip="Aplicar dano" onClick={() => act('card.apply', { messageId: msg.id, targetIndex: index, multiplier: 1 })}><Swords size={12} /></button>
              <button type="button" className="mini-btn" data-tip="Dano dobrado (vulnerável)" onClick={() => act('card.apply', { messageId: msg.id, targetIndex: index, multiplier: 2 })}>×2</button>
            </>
          )}
        </span>
      )}
      {t.applied !== null && <span className="card-target__applied" data-tip="Já aplicado">{t.applied > 0 ? `−${t.applied}` : `+${-t.applied}`}</span>}
    </div>
  );
}

function AttackCard({ msg, card, pending }: { msg: Msg; card: Extract<ChatCard, { type: 'attack' }>; pending: boolean }) {
  const [open, setOpen] = useState(false);
  const isDM = useGame((s) => s.me?.role === 'dm');
  const totalDmg = card.damage.reduce((a, d) => a + d.roll.total, 0);
  const healing = card.damage.length > 0 && card.damage.every((d) => d.type === 'healing');
  return (
    <div className="card card--attack" data-crit={!pending && card.toHit?.crit ? 'true' : undefined}>
      <div className="card__head">
        <span className="card__icon">{card.save ? <Sparkles /> : healing ? <HeartPulse /> : <Swords />}</span>
        <div className="u-grow">
          <div className="card__title u-display">{card.title}</div>
          {card.subtitle && <div className="card__sub">{card.subtitle}</div>}
        </div>
        {card.description && (
          <button type="button" className="icon-btn icon-btn--sm" aria-label="Detalhes" onClick={() => setOpen((v) => !v)}>
            <ChevronDown style={{ transform: open ? 'rotate(180deg)' : undefined }} />
          </button>
        )}
      </div>
      {open && <div className="card__desc">{card.description}</div>}
      {card.toHit && (
        <div className="card__row">
          <span className="card__label">Ataque</span>
          <RollBreakdown roll={card.toHit} />
          <Total roll={card.toHit} pending={pending} />
        </div>
      )}
      {card.save && <div className="card__row"><span className="card__label">Salvaguarda</span><span className="u-sm">{ABILITY_NAME[card.save.ability]} CD <strong>{card.save.dc}</strong>{card.save.half ? ' · metade se passar' : ''}</span></div>}
      {card.damage.length > 0 && (
        <div className="card__row card__row--dmg">
          <span className="card__label">{healing ? 'Cura' : 'Dano'}</span>
          <span className="u-grow">
            {card.damage.map((d, i) => (
              <span key={i} className="dmg-part" style={{ '--dmg': DAMAGE_TYPE_COLOR[d.type] } as React.CSSProperties}>
                <RollBreakdown roll={d.roll} />
                <span className="dmg-part__type">{DAMAGE_TYPE_NAME[d.type]}</span>
              </span>
            ))}
          </span>
          <span className="roll-total roll-total--dmg" data-pending={pending ? 'true' : undefined} data-heal={healing ? 'true' : undefined}>
            {pending ? <Dices className="roll-total__spin" /> : totalDmg}
          </span>
        </div>
      )}
      {card.targets.length > 0 && (
        <div className="card__targets">
          {card.targets.map((t, i) => <TargetRow key={`${t.tokenId}${i}`} msg={msg} t={t} index={i} card={card} pending={pending} />)}
          {isDM && card.targets.length > 1 && card.damage.length > 0 && !pending && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('card.apply', { messageId: msg.id, targetIndex: -1, multiplier: 1 })}>
              <Swords /> {healing ? 'Curar todos' : 'Aplicar em todos que foram atingidos'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SaveRequestCard({ msg, card, pending }: { msg: Msg; card: Extract<ChatCard, { type: 'saveRequest' }>; pending: boolean }) {
  const isDM = useGame((s) => s.me?.role === 'dm');
  return (
    <div className="card card--save">
      <div className="card__head">
        <span className="card__icon"><Shield /></span>
        <div className="u-grow">
          <div className="card__title u-display">{card.title}</div>
          <div className="card__sub">{ABILITY_NAME[card.ability]} · CD {card.dc}{card.half ? ' · metade se passar' : ''}</div>
        </div>
      </div>
      {card.damage && (
        <div className="card__row card__row--dmg">
          <span className="card__label">Dano</span>
          <span className="u-grow"><RollBreakdown roll={card.damage.roll} /> <span className="dmg-part__type">{DAMAGE_TYPE_NAME[card.damage.type]}</span></span>
          <span className="roll-total roll-total--dmg" data-pending={pending ? 'true' : undefined}>{pending ? <Dices className="roll-total__spin" /> : card.damage.roll.total}</span>
        </div>
      )}
      <div className="card__targets">
        {card.targets.map((t, i) => <TargetRow key={`${t.tokenId}${i}`} msg={msg} t={t} index={i} card={card} pending={false} />)}
        {isDM && card.damage && card.targets.length > 1 && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('card.apply', { messageId: msg.id, targetIndex: -1, multiplier: 1 })}>
            <Swords /> Aplicar em todos (metade p/ quem passou)
          </button>
        )}
      </div>
    </div>
  );
}

function CardView({ msg, pending }: { msg: Msg; pending: boolean }) {
  const card = msg.card!;
  switch (card.type) {
    case 'attack':
      return <AttackCard msg={msg} card={card} pending={pending} />;
    case 'saveRequest':
      return <SaveRequestCard msg={msg} card={card} pending={pending} />;
    case 'check': {
      const success = card.dc !== null && !pending ? card.roll.total >= card.dc : null;
      return (
        <div className="card card--check">
          <div className="card__head">
            <span className="card__icon"><Dices /></span>
            <div className="u-grow">
              <div className="card__title u-display">{card.title}</div>
              <div className="card__sub"><RollBreakdown roll={card.roll} />{card.roll.mode !== 'normal' && <span className={`badge ${card.roll.mode === 'adv' ? 'badge--success' : 'badge--danger'}`} style={{ marginLeft: 6 }}>{card.roll.mode === 'adv' ? 'vantagem' : 'desvantagem'}</span>}</div>
            </div>
            <Total roll={card.roll} pending={pending} size="lg" />
          </div>
          {success !== null && <div className={`card__verdict ${success ? 'u-success' : 'u-danger'}`}>{success ? 'Sucesso' : 'Falha'} (CD {card.dc})</div>}
        </div>
      );
    }
    case 'spell':
      return (
        <div className="card card--spell">
          <div className="card__head">
            <span className="card__icon"><Sparkles /></span>
            <div className="u-grow">
              <div className="card__title u-display">{card.title}</div>
              <div className="card__sub">{card.level === 0 ? 'Truque' : `${card.level}º nível`}</div>
            </div>
          </div>
          {card.description && <div className="card__desc">{card.description.slice(0, 700)}</div>}
        </div>
      );
    case 'deathSave': {
      const labels = { success: 'Sucesso', fail: 'Falha', crit: '20 natural! Recupera 1 PV', fumble: '1 natural! Duas falhas' };
      return (
        <div className="card card--death" data-result={pending ? undefined : card.result}>
          <div className="card__head">
            <span className="card__icon"><Skull /></span>
            <div className="u-grow">
              <div className="card__title u-display">Teste de Morte</div>
              <div className="card__sub">{pending ? 'Os deuses decidem…' : labels[card.result]}</div>
            </div>
            <Total roll={card.roll} pending={pending} size="lg" />
          </div>
          <div className="death-pips">
            <span>Sucessos</span>{[0, 1, 2].map((i) => <i key={i} data-on={i < card.success ? 'ok' : undefined} />)}
            <span>Falhas</span>{[0, 1, 2].map((i) => <i key={i} data-on={i < card.fail ? 'bad' : undefined} />)}
          </div>
        </div>
      );
    }
  }
}

export const ChatMessageView = memo(function ChatMessageView({ msg, grouped }: { msg: Msg; grouped: boolean }) {
  const player = useGame((s) => (msg.authorId ? s.state?.players[msg.authorId] : undefined));
  const meId = useGame((s) => s.me?.id);
  const isDM = useGame((s) => s.me?.role === 'dm');
  const pending = useUi((s) => !!s.pendingDice[msg.id]);
  const color = player?.color ?? '#9a9284';
  const name = msg.speaker || player?.name || msg.authorName;
  const canDelete = isDM || msg.authorId === meId;
  const whisper = msg.whisperTo.length > 0;
  const recipients = useGame((s) => msg.whisperTo.map((id) => s.state?.players[id]?.name).filter(Boolean).join(', '));

  if (msg.kind === 'system') {
    return (
      <div className="msg msg--system" data-gm={msg.gmOnly ? 'true' : undefined}>
        {msg.gmOnly && <Lock size={11} />}
        <span>{msg.text}</span>
      </div>
    );
  }
  if (msg.kind === 'narration') {
    return (
      <div className="msg msg--narration">
        <div className="ornament"><Sparkles size={12} /></div>
        <Markdown text={msg.text} />
      </div>
    );
  }
  return (
    <div className="msg" data-grouped={grouped ? 'true' : undefined} data-whisper={whisper ? 'true' : undefined} data-gm={msg.gmOnly ? 'true' : undefined} style={{ '--author': color } as React.CSSProperties}>
      {!grouped && (
        <div className="msg__head">
          <span className="msg__dot" />
          <span className="msg__name">{name}</span>
          {msg.speaker && player && msg.speaker !== player.name && <span className="msg__by">({player.name})</span>}
          {whisper && <span className="badge badge--dm"><MessageCircle size={10} />{msg.authorId === meId ? `para ${recipients}` : 'sussurro'}</span>}
          {msg.gmOnly && <span className="badge badge--dm"><EyeOff size={10} />{msg.blind ? 'cega' : 'Mestre'}</span>}
          <span className="msg__time">{time(msg.ts)}</span>
          {canDelete && (
            <button type="button" className="msg__del" aria-label="Apagar mensagem" onClick={() => act('chat.delete', { id: msg.id })}><Trash2 size={12} /></button>
          )}
        </div>
      )}
      {msg.kind === 'emote' && <div className="msg__emote">* {name} {msg.text}</div>}
      {msg.kind === 'ooc' && <div className="msg__ooc">(fora do jogo) {msg.text}</div>}
      {msg.kind === 'text' && <Markdown className="msg__text" text={msg.text} />}
      {msg.kind === 'roll' && (msg.roll ? (
        <div className="roll">
          {msg.text && <div className="roll__label">{msg.text}</div>}
          <div className="roll__body">
            <RollBreakdown roll={msg.roll} />
            <Total roll={msg.roll} pending={pending} size="lg" />
          </div>
        </div>
      ) : <div className="msg__ooc">{msg.text}</div>)}
      {msg.kind === 'card' && msg.card && <CardView msg={msg} pending={pending} />}
    </div>
  );
});
