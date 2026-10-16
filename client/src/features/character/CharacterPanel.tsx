// Sidebar tab "Personagem": the player's own sheet (or a creation hero), or the DM's character roster.
import { memo, useMemo, useState } from 'react';
import {
  Copy, Crown, ExternalLink, EllipsisVertical, FilePlus2, GripVertical, MapPin, Plus, Search, ShieldHalf, Skull, Sparkles,
  Trash2, UserPlus, Users, WandSparkles,
} from 'lucide-react';
import type { Character, ID, PlayerInfo } from '@shared/types.ts';
import { computeStats } from '@shared/rules5e.ts';
import { act } from '../../net/socket.ts';
import { setDragPayload } from '../../engine/api.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM, useMyCharacter } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, confirmDialog, HpBar, IconButton, MenuItem, Popover, toast } from '../../ui/index.tsx';
import { CharacterSheet } from './CharacterSheet.tsx';
import { CharacterAvatar, classLine, norm, placeOnMap } from './common.tsx';
import './character.css';

export default function CharacterPanel() {
  const isDM = useIsDM();
  return isDM ? <DmRoster /> : <PlayerView />;
}

function openWizard() {
  useUi.getState().set({ wizardOpen: true });
}

async function createBlank(name: string, kind: 'pc' | 'npc' = 'pc'): Promise<ID | null> {
  const res = await act('character.create', { character: { name: name.trim().slice(0, 120) || (kind === 'npc' ? 'Novo PdM' : 'Aventureiro'), kind } });
  if (!res.ok) return null;
  return (res.result as { id?: ID } | undefined)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

function PlayerView() {
  const me = useGame((s) => s.me);
  const characters = useGame((s) => s.state?.characters);
  const current = useMyCharacter();
  const mine = useMemo(
    () => Object.values(characters ?? {}).filter((c) => c.ownerId === me?.id).sort((a, b) => a.createdAt - b.createdAt),
    [characters, me?.id],
  );

  if (!current) return <CreateHero />;

  return (
    <div className="cs-p">
      {mine.length > 1 && (
        <div className="cs-p-switch" role="tablist" aria-label="Seus personagens">
          {mine.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              className="cs-p-switch__item"
              data-active={c.id === current.id ? 'true' : undefined}
              aria-selected={c.id === current.id}
              onClick={() => c.id !== current.id && void act('player.update', { characterId: c.id })}
            >
              <CharacterAvatar c={c} size={22} />
              <span className="u-ellipsis">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="cs-p-sheet">
        <CharacterSheet key={current.id} characterId={current.id} mode="embedded" headerActions={<PlayerMenu c={current} />} />
      </div>
    </div>
  );
}

function PlayerMenu({ c }: { c: Character }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const close = () => setAnchor(null);
  const remove = async () => {
    close();
    const ok = await confirmDialog('Excluir personagem', <>Excluir <strong>{c.name}</strong> permanentemente? Isso não pode ser desfeito.</>, { danger: true, ok: 'Excluir' });
    if (ok) void act('character.delete', { id: c.id });
  };
  const blank = async () => {
    close();
    const id = await createBlank('Novo aventureiro');
    if (id) void act('player.update', { characterId: id });
  };
  return (
    <>
      <IconButton size="sm" icon={<EllipsisVertical />} label="Opções do personagem" active={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
      {anchor && (
        <Popover anchor={anchor} onClose={close} placement="bottom">
          <div className="menu">
            <MenuItem icon={<MapPin />} onClick={() => { close(); void placeOnMap(c.id); }}>Colocar no mapa</MenuItem>
            <MenuItem icon={<ExternalLink />} onClick={() => { close(); useUi.getState().openSheet(c.id); }}>Abrir em janela</MenuItem>
            <div className="menu__sep" />
            <MenuItem icon={<WandSparkles />} onClick={() => { close(); openWizard(); }}>Novo personagem (assistente)</MenuItem>
            <MenuItem icon={<FilePlus2 />} onClick={() => void blank()}>Nova ficha em branco</MenuItem>
            <div className="menu__sep" />
            <MenuItem icon={<Trash2 />} danger onClick={() => void remove()}>Excluir personagem</MenuItem>
          </div>
        </Popover>
      )}
    </>
  );
}

function CreateHero() {
  const [quick, setQuick] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (busy) return;
    setBusy(true);
    const id = await createBlank(name);
    setBusy(false);
    if (id) {
      void act('player.update', { characterId: id });
      toast('Ficha criada! Preencha os detalhes quando quiser.', 'success');
    }
  };
  return (
    <div className="cs-p cs-p--hero">
      <div className="cs-p-hero">
        <div className="cs-p-hero__sigil" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <defs>
              <linearGradient id="cs-p-gold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#f6dc9a" />
                <stop offset="1" stopColor="#8d6a2d" />
              </linearGradient>
            </defs>
            <circle cx="60" cy="60" r="54" fill="none" stroke="url(#cs-p-gold)" strokeWidth="1.2" opacity="0.6" />
            <circle cx="60" cy="60" r="46" fill="none" stroke="url(#cs-p-gold)" strokeWidth="0.6" strokeDasharray="2 5" opacity="0.7" />
            <path d="M60 14 L100 37 L100 83 L60 106 L20 83 L20 37 Z" fill="rgba(224,180,90,0.06)" stroke="url(#cs-p-gold)" strokeWidth="1.6" />
            <path d="M60 14 L60 106 M20 37 L100 83 M100 37 L20 83 M20 37 L60 60 L100 37 M60 60 L60 106" stroke="url(#cs-p-gold)" strokeWidth="0.8" opacity="0.55" fill="none" />
            <text x="60" y="68" textAnchor="middle" fontFamily="Cinzel, serif" fontSize="22" fontWeight="700" fill="url(#cs-p-gold)">20</text>
          </svg>
        </div>
        <h2 className="cs-p-hero__title">Sua lenda começa aqui</h2>
        <p className="cs-p-hero__text">Forje um herói passo a passo — raça, classe, antecedente e equipamento — ou comece com uma ficha em branco.</p>
        <Button variant="primary" size="lg" block icon={<Sparkles />} onClick={openWizard}>Criar personagem</Button>
        {!quick ? (
          <Button variant="ghost" block icon={<FilePlus2 />} onClick={() => setQuick(true)}>Ficha rápida em branco</Button>
        ) : (
          <form
            className="cs-p-quick"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input className="input" autoFocus maxLength={120} placeholder="Nome do personagem" value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" variant="default" disabled={busy}>Criar</Button>
          </form>
        )}
        <p className="cs-p-hero__foot">O Mestre também pode atribuir um personagem a você.</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// DM roster
// ---------------------------------------------------------------------------

function DmRoster() {
  const characters = useGame((s) => s.state?.characters);
  const players = useGame((s) => s.state?.players);
  const presence = useGame((s) => s.presence);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const nq = norm(q);
    const all = Object.values(characters ?? {}).filter((c) => {
      if (!nq) return true;
      const owner = c.ownerId ? players?.[c.ownerId]?.name ?? '' : '';
      return norm(`${c.name} ${c.race} ${classLine(c)} ${owner}`).includes(nq);
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const byOwner = new Map<string, Character[]>();
    const npcs: Character[] = [];
    for (const c of all) {
      if (c.kind === 'npc') {
        npcs.push(c);
        continue;
      }
      const key = c.ownerId && players?.[c.ownerId] ? c.ownerId : '';
      const list = byOwner.get(key) ?? [];
      list.push(c);
      byOwner.set(key, list);
    }
    const pcGroups = [...byOwner.entries()]
      .map(([ownerId, list]) => ({ owner: ownerId ? players?.[ownerId] ?? null : null, list }))
      .sort((a, b) => (a.owner ? 0 : 1) - (b.owner ? 0 : 1) || (a.owner?.name ?? '').localeCompare(b.owner?.name ?? '', 'pt-BR'));
    return { pcGroups, npcs, total: all.length };
  }, [characters, players, q]);

  const newNpc = async () => {
    const id = await createBlank('Novo PdM', 'npc');
    if (id) useUi.getState().openSheet(id);
  };

  const playerList = useMemo(() => Object.values(players ?? {}).filter((p) => p.role === 'player'), [players]);
  const empty = Object.keys(characters ?? {}).length === 0;

  return (
    <div className="cs-p">
      <div className="cs-p-toolbar">
        <div className="cs-search u-grow">
          <Search />
          <input className="input input--sm" placeholder="Buscar personagem, classe, jogador…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <IconButton size="sm" icon={<UserPlus />} label="Novo PdM" onClick={() => void newNpc()} />
        <IconButton size="sm" icon={<WandSparkles />} label="Criar com o assistente" onClick={openWizard} />
      </div>
      <div className="cs-p-roster">
        {empty && (
          <div className="cs-p-roster__empty">
            <Users />
            <div className="u-display">Nenhum personagem ainda</div>
            <p className="u-xs u-muted">Os jogadores criam suas fichas pela aba Personagem. Você pode criar PdMs aqui.</p>
            <div className="u-row u-wrap u-center">
              <Button size="sm" icon={<Plus />} onClick={() => void newNpc()}>Novo PdM</Button>
              <Button size="sm" variant="primary" icon={<Sparkles />} onClick={openWizard}>Assistente</Button>
            </div>
          </div>
        )}
        {!empty && groups.total === 0 && <div className="cs-empty-line">Nada encontrado para “{q}”.</div>}
        {groups.pcGroups.length > 0 && <div className="cs-p-group__title"><Crown /> Personagens dos jogadores</div>}
        {groups.pcGroups.map((g) => (
          <div key={g.owner?.id ?? 'none'} className="cs-p-group">
            <div className="cs-p-owner">
              <span className="cs-p-owner__dot" style={{ background: g.owner?.color ?? 'var(--ink-500)' }} data-online={g.owner && presence[g.owner.id]?.online ? 'true' : undefined} />
              <span className="u-ellipsis">{g.owner?.name ?? 'Sem jogador'}</span>
              <span className="u-dim u-xs">{g.list.length}</span>
            </div>
            {g.list.map((c) => <RosterRow key={c.id} c={c} players={playerList} />)}
          </div>
        ))}
        {groups.npcs.length > 0 && (
          <div className="cs-p-group">
            <div className="cs-p-group__title"><Skull /> PdMs <span className="u-dim u-xs">{groups.npcs.length}</span></div>
            {groups.npcs.map((c) => <RosterRow key={c.id} c={c} players={playerList} />)}
          </div>
        )}
      </div>
    </div>
  );
}

const RosterRow = memo(function RosterRow({ c, players }: { c: Character; players: PlayerInfo[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const ac = useMemo(() => computeStats(c).ac, [c]);
  const down = c.hp.cur <= 0 && c.hp.max > 0;
  const dead = c.conditions.includes('dead');
  const close = () => setAnchor(null);
  const open = () => useUi.getState().openSheet(c.id);
  const remove = async () => {
    close();
    const ok = await confirmDialog('Excluir personagem', <>Excluir <strong>{c.name}</strong>? Tokens ligados a ele ficarão sem ficha.</>, { danger: true, ok: 'Excluir' });
    if (ok) {
      useUi.getState().closeSheet(c.id);
      void act('character.delete', { id: c.id });
    }
  };
  const duplicate = async () => {
    close();
    const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = c;
    void _id;
    void _c;
    void _u;
    const res = await act('character.create', { character: { ...rest, name: `${c.name} (cópia)`.slice(0, 120) } });
    if (res.ok) toast('Cópia criada.', 'success', 2000);
  };
  const assign = (ownerId: ID | null) => {
    close();
    void act('character.assign', { id: c.id, ownerId });
  };
  return (
    <div
      className="cs-p-row"
      draggable
      onDragStart={(e) => setDragPayload(e, { kind: 'character', id: c.id })}
      data-down={down ? 'true' : undefined}
    >
      <GripVertical className="cs-p-row__grip" aria-hidden="true" />
      <button type="button" className="cs-p-row__main" onClick={open} data-tip="Abrir ficha (arraste para o mapa)">
        <CharacterAvatar c={c} size={36} />
        <span className="cs-p-row__info">
          <span className="cs-p-row__name u-ellipsis">
            {c.name}
            {dead && <Skull className="cs-p-row__dead" />}
          </span>
          <span className="cs-p-row__sub u-ellipsis">{[classLine(c), c.race].filter(Boolean).join(' · ')}</span>
          <span className="cs-p-row__hp">
            <HpBar cur={c.hp.cur} max={c.hp.max} temp={c.hp.temp} />
            <span className="u-tabular">{c.hp.cur}/{c.hp.max}{c.hp.temp ? ` +${c.hp.temp}` : ''}</span>
          </span>
        </span>
      </button>
      <span className="cs-p-row__ac" data-tip="Classe de armadura"><ShieldHalf /><b>{ac}</b></span>
      <div className="cs-p-row__actions">
        <IconButton size="sm" icon={<MapPin />} label="Colocar no mapa" onClick={() => void placeOnMap(c.id)} />
        <IconButton size="sm" icon={<EllipsisVertical />} label="Mais opções" active={!!anchor} onClick={(e) => setAnchor(anchor ? null : e.currentTarget)} />
      </div>
      {anchor && (
        <Popover anchor={anchor} onClose={close} placement="bottom">
          <div className="menu">
            <MenuItem icon={<ExternalLink />} onClick={() => { close(); open(); }}>Abrir ficha</MenuItem>
            <MenuItem icon={<MapPin />} onClick={() => { close(); void placeOnMap(c.id); }}>Colocar no mapa</MenuItem>
            <MenuItem icon={<Copy />} onClick={() => void duplicate()}>Duplicar</MenuItem>
            <div className="menu__sep" />
            <div className="menu__label">Atribuir a</div>
            <MenuItem icon={<Crown />} onClick={() => assign(null)}>
              Mestre (ninguém){c.ownerId === null ? ' ✓' : ''}
            </MenuItem>
            {players.map((p) => (
              <MenuItem key={p.id} icon={<span className="cs-p-owner__dot" style={{ background: p.color }} />} onClick={() => assign(p.id)}>
                {p.name}{c.ownerId === p.id ? ' ✓' : ''}
              </MenuItem>
            ))}
            <div className="menu__sep" />
            <MenuItem icon={<Trash2 />} danger onClick={() => void remove()}>Excluir</MenuItem>
          </div>
        </Popover>
      )}
    </div>
  );
});
