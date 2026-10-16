// Diário: journal pages and handouts.
// DM: every page grouped by folder, split markdown editor with a local draft (debounced saves), sharing
// controls and "Mostrar aos jogadores". Players: read-only view of the pages shared with them.
import {
  useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import {
  ArrowLeft, Bold, BookOpen, Check, ChevronRight, Columns2, Copy, Eye, FilePlus2, Folder, FolderOpen, Globe, Heading2,
  ImagePlus, Italic, Link2, List, Lock, Maximize2, MoreVertical, Pencil, PenLine, Presentation, Quote, ScrollText, Search,
  Trash2, Upload, Users, X,
} from 'lucide-react';
import type { ID, JournalEntry, PlayerInfo } from '@shared/types.ts';
import { normalize } from '@shared/util.ts';
import { act } from '../../net/socket.ts';
import { assetUrl, uploadFile } from '../../net/api.ts';
import { getPref, setPref } from '../../net/session.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import {
  Button, confirmDialog, Empty, IconButton, Markdown, MenuItem, Modal, Popover, Segmented, Spinner, toast,
} from '../../ui/index.tsx';
import './journal.css';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NO_FOLDER = '';
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

function ago(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'agora';
  if (d < 3_600_000) return `há ${Math.floor(d / 60_000)} min`;
  if (d < 86_400_000) return `há ${Math.floor(d / 3_600_000)} h`;
  if (d < 2 * 86_400_000) return 'ontem';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

const byTitle = (a: JournalEntry, b: JournalEntry) => a.title.localeCompare(b.title, 'pt-BR', { numeric: true, sensitivity: 'base' });

function shareInfo(e: JournalEntry, players: Record<ID, PlayerInfo> | undefined): { icon: ReactNode; label: string; cls: string } {
  if (e.sharedWith === 'all') return { icon: <Globe />, label: 'Todos', cls: 'badge--gold' };
  if (!e.sharedWith.length) return { icon: <Lock />, label: 'Só o Mestre', cls: 'badge--dm' };
  const names = e.sharedWith.map((id) => players?.[id]?.name).filter(Boolean) as string[];
  const label = names.length === 1 ? names[0]! : `${e.sharedWith.length} jogadores`;
  return { icon: <Users />, label, cls: 'badge--info' };
}

/** First text line of a markdown body, for list previews. */
function excerpt(body: string): string {
  const line = body
    .split('\n')
    .map((l) => l.replace(/!\[[^\]]*]\([^)]*\)/g, '').replace(/[#>*_`~-]/g, '').trim())
    .find(Boolean);
  return line ? line.slice(0, 90) : '';
}

async function uploadImage(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) {
    toast('Escolha um arquivo de imagem.', 'warning');
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast('Imagem grande demais (máx. 30 MB).', 'warning');
    return null;
  }
  const res = await uploadFile(file);
  if (!res.ok || !res.url) {
    toast(res.error ?? 'Falha no envio da imagem.', 'danger');
    return null;
  }
  return res.url;
}

function isValidUrl(u: string): boolean {
  return /^(https?:\/\/|\/assets\/|data:image\/)/i.test(u) && u.length <= 2_000;
}

function firstImageFile(list: FileList | null | undefined): File | null {
  if (!list) return null;
  for (const f of Array.from(list)) if (f.type.startsWith('image/')) return f;
  return null;
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function JournalPanel() {
  const isDM = useIsDM();
  return <div className="jr-panel">{isDM ? <DmJournal /> : <PlayerJournal />}</div>;
}

function useEntries() {
  const journal = useGame((s) => s.state?.journal);
  const players = useGame((s) => s.state?.players);
  const entries = useMemo(() => Object.values(journal ?? {}), [journal]);
  return { journal, players, entries };
}

// ---------------------------------------------------------------------------
// DM view
// ---------------------------------------------------------------------------

function DmJournal() {
  const { journal, players, entries } = useEntries();
  const [openId, setOpenId] = useState<ID | null>(null);
  const [creating, setCreating] = useState(false);
  const seenOpen = useRef<ID | null>(null);
  const entry = openId ? journal?.[openId] ?? null : null;

  const playerList = useMemo(
    () => Object.values(players ?? {}).filter((p) => p.role === 'player').sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [players],
  );
  const folders = useMemo(
    () => [...new Set(entries.map((e) => e.folder.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [entries],
  );

  // Close the editor when the open page is deleted elsewhere (but not while a fresh page is still arriving).
  useEffect(() => {
    if (entry) seenOpen.current = entry.id;
    else if (openId && seenOpen.current === openId) setOpenId(null);
  }, [entry, openId]);

  const create = async (folder = NO_FOLDER, base?: Partial<JournalEntry>) => {
    if (creating) return;
    setCreating(true);
    const res = await act('journal.create', {
      entry: {
        title: base?.title ?? 'Nova página',
        body: base?.body ?? '',
        folder: base?.folder ?? folder,
        img: base?.img ?? null,
        sharedWith: base?.sharedWith ?? [],
      },
    });
    setCreating(false);
    const id = res.ok ? (res.result as { id?: string } | undefined)?.id : undefined;
    if (id) setOpenId(id);
  };

  const remove = async (e: JournalEntry) => {
    const ok = await confirmDialog(
      'Excluir página',
      <>A página <strong>{e.title || 'Sem título'}</strong> será apagada para sempre. Notas no mapa que apontam para ela ficarão sem vínculo.</>,
      { danger: true, ok: 'Excluir' },
    );
    if (!ok) return;
    const res = await act('journal.delete', { id: e.id });
    if (res.ok) {
      if (openId === e.id) setOpenId(null);
      toast('Página excluída.', 'success', 2200);
    }
  };

  const show = async (e: JournalEntry) => {
    const res = await act('journal.show', { id: e.id });
    if (res.ok) toast(<>“{e.title || 'Página'}” revelada para a mesa.</>, 'success');
  };

  const rename = (e: JournalEntry, title: string) => {
    const t = title.trim().slice(0, 200);
    if (t && t !== e.title) void act('journal.update', { id: e.id, patch: { title: t } });
  };

  if (openId) {
    if (!entry) {
      return <div className="u-center u-p-4"><Spinner /></div>;
    }
    return (
      <EntryEditorHost
        key={entry.id}
        entry={entry}
        players={playerList}
        playersById={players}
        folders={folders}
        onBack={() => setOpenId(null)}
        onShow={() => show(entry)}
        onDelete={() => remove(entry)}
      />
    );
  }

  return (
    <EntryList
      entries={entries}
      players={players}
      dm
      onOpen={setOpenId}
      header={(
        <Button variant="primary" size="sm" icon={<FilePlus2 />} onClick={() => void create()} disabled={creating}>
          Nova página
        </Button>
      )}
      onCreateInFolder={(f) => void create(f)}
      renderMenu={(e, close, startRename) => (
        <div className="menu">
          <MenuItem icon={<PenLine />} onClick={() => { close(); setOpenId(e.id); }}>Editar</MenuItem>
          <MenuItem icon={<Pencil />} onClick={() => { close(); startRename(); }}>Renomear</MenuItem>
          <MenuItem icon={<Presentation />} onClick={() => { close(); void show(e); }}>Mostrar aos jogadores</MenuItem>
          <MenuItem icon={<Eye />} onClick={() => { close(); useUi.getState().set({ handoutId: e.id }); }}>Ver como handout</MenuItem>
          <MenuItem
            icon={<Copy />}
            onClick={() => {
              close();
              void create(e.folder, { ...e, title: `${e.title} (cópia)`.slice(0, 200), sharedWith: [] });
            }}
          >
            Duplicar
          </MenuItem>
          <div className="menu__sep" />
          <MenuItem icon={<Trash2 />} danger onClick={() => { close(); void remove(e); }}>Excluir</MenuItem>
        </div>
      )}
      onRename={rename}
      emptyAction={(
        <Button variant="primary" icon={<FilePlus2 />} onClick={() => void create()} disabled={creating}>
          Escrever a primeira página
        </Button>
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Player view
// ---------------------------------------------------------------------------

function PlayerJournal() {
  const { journal, players, entries } = useEntries();
  const code = useGame((s) => s.code);
  const [openId, setOpenId] = useState<ID | null>(null);
  const seenKey = `journal.seen.${code ?? ''}`;
  const [seen, setSeen] = useState<Record<ID, number>>(() => getPref(seenKey, {}));
  const entry = openId ? journal?.[openId] ?? null : null;

  useEffect(() => {
    if (openId && !entry) setOpenId(null);
  }, [openId, entry]);

  useEffect(() => {
    if (!entry || seen[entry.id] === entry.updatedAt) return;
    const next = { ...seen, [entry.id]: entry.updatedAt };
    setSeen(next);
    setPref(seenKey, next);
  }, [entry, seen, seenKey]);

  if (entry) return <Reader entry={entry} onBack={() => setOpenId(null)} />;

  return (
    <EntryList
      entries={entries}
      players={players}
      dm={false}
      onOpen={setOpenId}
      isNew={(e) => seen[e.id] !== e.updatedAt}
      emptyText="Quando o Mestre compartilhar cartas, mapas e anotações, eles aparecerão aqui."
    />
  );
}

function Reader({ entry, onBack }: { entry: JournalEntry; onBack: () => void }) {
  const img = assetUrl(entry.img);
  return (
    <div className="jr-reader">
      <div className="jr-reader__bar">
        <IconButton icon={<ArrowLeft />} label="Voltar" size="sm" onClick={onBack} />
        <span className="u-grow u-xs u-muted u-ellipsis">{entry.folder || 'Diário'}</span>
        <Button size="sm" variant="ghost" icon={<Maximize2 />} onClick={() => useUi.getState().set({ handoutId: entry.id })}>
          Destacar
        </Button>
      </div>
      <div className="jr-reader__scroll">
        {img && (
          <button type="button" className="jr-reader__img" onClick={() => useUi.getState().set({ handoutId: entry.id })} aria-label="Abrir imagem em destaque">
            <img src={img} alt="" loading="lazy" />
          </button>
        )}
        <h2 className="jr-reader__title">{entry.title || 'Sem título'}</h2>
        <div className="jr-ornament" aria-hidden="true"><span /></div>
        {entry.body.trim() ? <Markdown text={entry.body} className="jr-md" /> : <p className="u-dim u-flavor">Página em branco.</p>}
        <div className="jr-reader__foot u-xs u-dim">Atualizada {ago(entry.updatedAt)}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Entry list (shared by DM and players)
// ---------------------------------------------------------------------------

function EntryList({
  entries, players, dm, onOpen, header, onCreateInFolder, renderMenu, onRename, emptyAction, emptyText, isNew,
}: {
  entries: JournalEntry[];
  players: Record<ID, PlayerInfo> | undefined;
  dm: boolean;
  onOpen: (id: ID) => void;
  header?: ReactNode;
  onCreateInFolder?: (folder: string) => void;
  renderMenu?: (e: JournalEntry, close: () => void, startRename: () => void) => ReactNode;
  onRename?: (e: JournalEntry, title: string) => void;
  emptyAction?: ReactNode;
  emptyText?: string;
  isNew?: (e: JournalEntry) => boolean;
}) {
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => getPref('journal.collapsed', {}));
  const [menu, setMenu] = useState<{ id: ID; anchor: HTMLElement } | null>(null);
  const [renaming, setRenaming] = useState<ID | null>(null);

  const groups = useMemo(() => {
    const nq = normalize(q);
    const map = new Map<string, JournalEntry[]>();
    for (const e of entries) {
      if (nq && !normalize(`${e.title} ${e.folder} ${e.body.slice(0, 4000)}`).includes(nq)) continue;
      const f = e.folder.trim();
      const list = map.get(f);
      if (list) list.push(e);
      else map.set(f, [e]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => (a === NO_FOLDER ? 1 : b === NO_FOLDER ? -1 : a.localeCompare(b, 'pt-BR')))
      .map(([folder, list]) => ({ folder, list: list.sort(byTitle) }));
  }, [entries, q]);

  const toggleFolder = (f: string) => {
    const next = { ...collapsed, [f]: !collapsed[f] };
    setCollapsed(next);
    setPref('journal.collapsed', next);
  };

  const menuEntry = menu ? entries.find((e) => e.id === menu.id) : undefined;
  const total = entries.length;
  const showFolders = groups.length > 1 || (groups.length === 1 && groups[0]!.folder !== NO_FOLDER);

  return (
    <div className="jr-list">
      <div className="jr-list__top">
        <div className="jr-search">
          <Search aria-hidden="true" />
          <input
            className="input input--sm"
            placeholder={total ? `Buscar em ${total} ${total === 1 ? 'página' : 'páginas'}…` : 'Buscar…'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Buscar no diário"
          />
          {q && <IconButton size="sm" icon={<X />} label="Limpar busca" onClick={() => setQ('')} />}
        </div>
        {header}
      </div>

      <div className="jr-list__scroll">
        {!total ? (
          <Empty icon={<BookOpen />} title={dm ? 'Diário em branco' : 'Nada por aqui… ainda'}>
            <div className="u-col u-center u-gap-3">
              <span>{emptyText ?? 'Crie cartas, lendas, mapas e anotações. Compartilhe com os jogadores quando chegar a hora.'}</span>
              {emptyAction}
            </div>
          </Empty>
        ) : !groups.length ? (
          <Empty icon={<Search />} title="Nada encontrado">Nenhuma página corresponde a “{q}”.</Empty>
        ) : (
          groups.map(({ folder, list }) => {
            const isCollapsed = !q && !!collapsed[folder];
            return (
              <section key={folder || '__none'} className="jr-folder" data-collapsed={isCollapsed ? 'true' : undefined}>
                {showFolders && (
                  <div className="jr-folder__head">
                    <button type="button" className="jr-folder__toggle" onClick={() => toggleFolder(folder)} aria-expanded={!isCollapsed}>
                      <ChevronRight className="jr-folder__chev" />
                      {isCollapsed ? <Folder /> : <FolderOpen />}
                      <span className="u-ellipsis">{folder || 'Sem pasta'}</span>
                      <span className="jr-folder__count">{list.length}</span>
                    </button>
                    {dm && onCreateInFolder && (
                      <IconButton size="sm" icon={<FilePlus2 />} label={`Nova página em ${folder || 'Sem pasta'}`} onClick={() => onCreateInFolder(folder)} />
                    )}
                  </div>
                )}
                {!isCollapsed && (
                  <div className="jr-folder__items">
                    {list.map((e) => (
                      <EntryRow
                        key={e.id}
                        entry={e}
                        dm={dm}
                        share={dm ? shareInfo(e, players) : null}
                        fresh={isNew?.(e) ?? false}
                        renaming={renaming === e.id}
                        onOpen={() => onOpen(e.id)}
                        onMenu={renderMenu ? (anchor) => setMenu({ id: e.id, anchor }) : undefined}
                        onRename={(t) => {
                          setRenaming(null);
                          if (t !== null) onRename?.(e, t);
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })
        )}
      </div>

      {menu && menuEntry && renderMenu && (
        <Popover anchor={menu.anchor} onClose={() => setMenu(null)} placement="bottom">
          {renderMenu(menuEntry, () => setMenu(null), () => setRenaming(menuEntry.id))}
        </Popover>
      )}
    </div>
  );
}

function EntryRow({
  entry, dm, share, fresh, renaming, onOpen, onMenu, onRename,
}: {
  entry: JournalEntry;
  dm: boolean;
  share: { icon: ReactNode; label: string; cls: string } | null;
  fresh: boolean;
  renaming: boolean;
  onOpen: () => void;
  onMenu?: (anchor: HTMLElement) => void;
  onRename: (title: string | null) => void;
}) {
  const img = assetUrl(entry.img);
  const preview = excerpt(entry.body);
  return (
    <div className="jr-row list-item" data-fresh={fresh ? 'true' : undefined} data-renaming={renaming ? 'true' : undefined}>
      {renaming ? (
        <>
          <span className="jr-row__thumb" aria-hidden="true">
            {img ? <img src={img} alt="" loading="lazy" /> : <ScrollText />}
          </span>
          <RenameInput initial={entry.title} onDone={onRename} />
        </>
      ) : (
        <>
          <button type="button" className="jr-row__main" onClick={onOpen}>
            <span className="jr-row__thumb" aria-hidden="true">
              {img ? <img src={img} alt="" loading="lazy" /> : <ScrollText />}
            </span>
            <span className="jr-row__text">
              <span className="jr-row__title u-ellipsis">{entry.title || 'Sem título'}</span>
              <span className="jr-row__meta u-ellipsis">
                {preview || <span className="u-dim">Página em branco</span>}
              </span>
            </span>
          </button>
          <span className="jr-row__side">
            {fresh && <span className="badge badge--gold">Novo</span>}
            {dm && share && (
              <span className={`badge ${share.cls} jr-row__share`} data-tip={share.label}>
                {share.icon}
              </span>
            )}
            {!dm && !fresh && <span className="u-xs u-dim">{ago(entry.updatedAt)}</span>}
            {onMenu && (
              <IconButton
                size="sm"
                icon={<MoreVertical />}
                label="Mais opções"
                className="jr-row__more"
                onClick={(ev) => onMenu(ev.currentTarget)}
              />
            )}
          </span>
        </>
      )}
    </div>
  );
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (t: string | null) => void }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (t: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(t);
  };
  return (
    <input
      className="input input--sm jr-row__rename"
      value={v}
      autoFocus
      maxLength={200}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v);
        if (e.key === 'Escape') {
          e.stopPropagation();
          finish(null);
        }
      }}
      onBlur={() => finish(v)}
      aria-label="Novo título"
    />
  );
}

// ---------------------------------------------------------------------------
// Draft: local copy of the entry so typing never waits for the network.
// ---------------------------------------------------------------------------

type DraftFields = Pick<JournalEntry, 'title' | 'body' | 'folder' | 'img' | 'sharedWith'>;
const DRAFT_FIELDS = ['title', 'body', 'folder', 'img', 'sharedWith'] as const;
type SaveStatus = 'saved' | 'pending' | 'saving' | 'error';

function pickDraft(e: JournalEntry): DraftFields {
  return { title: e.title, body: e.body, folder: e.folder, img: e.img, sharedWith: e.sharedWith };
}

function sameValue(a: unknown, b: unknown): boolean {
  return a === b || (typeof a === 'object' && typeof b === 'object' && JSON.stringify(a) === JSON.stringify(b));
}

function useJournalDraft(entry: JournalEntry) {
  const [draft, setDraft] = useState<DraftFields>(() => pickDraft(entry));
  const [status, setStatus] = useState<SaveStatus>('saved');
  const pending = useRef<Partial<DraftFields>>({});
  const inflight = useRef(0);
  const timer = useRef(0);
  const id = entry.id;

  const flush = useCallback(() => {
    window.clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return;
    pending.current = {};
    inflight.current++;
    setStatus('saving');
    void act('journal.update', { id, patch }).then((res) => {
      inflight.current--;
      if (inflight.current === 0 && !Object.keys(pending.current).length) setStatus(res.ok ? 'saved' : 'error');
    });
  }, [id]);

  const update = useCallback((patch: Partial<DraftFields>, immediate = false) => {
    setDraft((d) => ({ ...d, ...patch }));
    Object.assign(pending.current, patch);
    setStatus('pending');
    window.clearTimeout(timer.current);
    if (immediate) flush();
    else timer.current = window.setTimeout(flush, 650);
  }, [flush]);

  // Save whatever is pending when leaving the editor or the page.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  // Adopt remote changes to fields we are not editing right now.
  useEffect(() => {
    if (inflight.current > 0) return;
    setDraft((d) => {
      let next: DraftFields | null = null;
      for (const k of DRAFT_FIELDS) {
        if (k in pending.current) continue;
        if (!sameValue(d[k], entry[k])) {
          next ??= { ...d };
          Object.assign(next, { [k]: entry[k] });
        }
      }
      return next ?? d;
    });
  }, [entry]);

  return { draft, update, flush, status };
}

type DraftApi = ReturnType<typeof useJournalDraft>;

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function EntryEditorHost({
  entry, players, playersById, folders, onBack, onShow, onDelete,
}: {
  entry: JournalEntry;
  players: PlayerInfo[];
  playersById: Record<ID, PlayerInfo> | undefined;
  folders: string[];
  onBack: () => void;
  onShow: () => void;
  onDelete: () => void;
}) {
  const api = useJournalDraft(entry);
  const [expanded, setExpanded] = useState(false);
  const show = () => {
    api.flush();
    onShow();
  };
  const common = { entry, api, players, playersById, folders, onShow: show, onDelete };
  return (
    <>
      {expanded ? (
        <div className="jr-expanded-note">
          <Maximize2 />
          <div className="u-display">Editando em tela cheia</div>
          <Button size="sm" onClick={() => setExpanded(false)}>Voltar ao painel</Button>
        </div>
      ) : (
        <EditorView {...common} layout="stack" onBack={() => { api.flush(); onBack(); }} onExpand={() => setExpanded(true)} />
      )}
      {expanded && (
        <Modal
          size="full"
          icon={<BookOpen />}
          title={api.draft.title || 'Sem título'}
          onClose={() => setExpanded(false)}
        >
          <EditorView {...common} layout="wide" onExpand={() => setExpanded(false)} />
        </Modal>
      )}
    </>
  );
}

type ViewMode = 'write' | 'split' | 'preview';

function EditorView({
  entry, api, players, playersById, folders, layout, onBack, onExpand, onShow, onDelete,
}: {
  entry: JournalEntry;
  api: DraftApi;
  players: PlayerInfo[];
  playersById: Record<ID, PlayerInfo> | undefined;
  folders: string[];
  layout: 'stack' | 'wide';
  onBack?: () => void;
  onExpand: () => void;
  onShow: () => void;
  onDelete: () => void;
}) {
  const { draft, update, status } = api;
  const wide = layout === 'wide';
  const [mode, setMode] = useState<ViewMode>(wide ? 'split' : 'write');
  const [detailsOpen, setDetailsOpen] = useState(() => !entry.body && !entry.img);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  // Brand-new page: jump straight to naming it.
  const fresh = useRef(!entry.body && !entry.img && entry.title === 'Nova página');
  useEffect(() => {
    if (!fresh.current) return;
    fresh.current = false;
    const el = titleRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
  }, []);
  const listId = `jr-folders-${entry.id}`;
  const share = shareInfo({ ...entry, sharedWith: draft.sharedWith }, playersById);

  const details = (
    <div className="jr-details__grid">
      <label className="field">
        <span className="field__label">Pasta</span>
        <input
          className="input input--sm"
          list={listId}
          value={draft.folder}
          maxLength={80}
          placeholder="Sem pasta"
          onChange={(e) => update({ folder: e.target.value })}
          onBlur={api.flush}
        />
        <datalist id={listId}>
          {folders.map((f) => <option key={f} value={f} />)}
        </datalist>
      </label>
      <div className="field">
        <span className="field__label">Imagem</span>
        <ImageField value={draft.img} onChange={(img) => update({ img }, true)} />
      </div>
      <div className="field">
        <span className="field__label">Quem pode ler</span>
        <ShareControl value={draft.sharedWith} players={players} onChange={(sharedWith) => update({ sharedWith }, true)} />
      </div>
    </div>
  );

  const titleInput = (
    <input
      className="jr-title-input"
      value={draft.title}
      maxLength={200}
      placeholder="Título da página"
      ref={titleRef}
      onChange={(e) => update({ title: e.target.value })}
      onBlur={api.flush}
      aria-label="Título"
    />
  );

  const actions = (
    <div className="jr-actions">
      <Button variant="primary" size="sm" icon={<Presentation />} onClick={onShow} className="u-grow">
        Mostrar aos jogadores
      </Button>
      <IconButton icon={<Eye />} label="Ver como handout" onClick={() => { api.flush(); useUi.getState().set({ handoutId: entry.id }); }} />
      <IconButton icon={<Trash2 />} label="Excluir página" danger onClick={onDelete} />
    </div>
  );

  const body = (
    <BodyEditor
      taRef={taRef}
      value={draft.body}
      onChange={(body) => update({ body })}
      onBlur={api.flush}
      mode={mode}
      setMode={setMode}
      status={status}
      wide={wide}
      onExpand={onExpand}
    />
  );

  if (wide) {
    return (
      <div className="jr-editor jr-editor--wide">
        <aside className="jr-editor__side">
          {titleInput}
          <div className="u-row u-wrap u-gap-1">
            <span className={`badge ${share.cls}`}>{share.icon}{share.label}</span>
            <span className="u-xs u-dim">Atualizada {ago(entry.updatedAt)}</span>
          </div>
          {actions}
          <div className="jr-details">{details}</div>
        </aside>
        <div className="jr-editor__main">{body}</div>
      </div>
    );
  }

  return (
    <div className="jr-editor">
      <div className="jr-editor__head">
        {onBack && <IconButton icon={<ArrowLeft />} label="Voltar à lista" size="sm" onClick={onBack} />}
        {titleInput}
        <IconButton icon={<MoreVertical />} label="Mais opções" size="sm" onClick={(e) => setMenuAnchor(e.currentTarget)} />
      </div>

      <div className="jr-editor__scroll">
        <section className="jr-details" data-open={detailsOpen ? 'true' : undefined}>
          <button type="button" className="jr-details__toggle" onClick={() => setDetailsOpen((v) => !v)} aria-expanded={detailsOpen}>
            <ChevronRight className="jr-folder__chev" />
            <span className="u-grow u-ellipsis">
              {draft.folder.trim() || 'Sem pasta'}
              {draft.img ? ' · com imagem' : ''}
            </span>
            <span className={`badge ${share.cls}`}>{share.icon}{share.label}</span>
          </button>
          {detailsOpen && details}
        </section>

        {actions}
        {body}
      </div>

      {menuAnchor && (
        <Popover anchor={menuAnchor} onClose={() => setMenuAnchor(null)}>
          <div className="menu">
            <MenuItem icon={<Maximize2 />} onClick={() => { setMenuAnchor(null); onExpand(); }}>Editar em tela cheia</MenuItem>
            <MenuItem icon={<Eye />} onClick={() => { setMenuAnchor(null); api.flush(); useUi.getState().set({ handoutId: entry.id }); }}>Ver como handout</MenuItem>
            <MenuItem icon={<Presentation />} onClick={() => { setMenuAnchor(null); onShow(); }}>Mostrar aos jogadores</MenuItem>
            <div className="menu__sep" />
            <MenuItem icon={<Trash2 />} danger onClick={() => { setMenuAnchor(null); onDelete(); }}>Excluir página</MenuItem>
          </div>
        </Popover>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown body editor with toolbar
// ---------------------------------------------------------------------------

function BodyEditor({
  taRef, value, onChange, onBlur, mode, setMode, status, wide, onExpand,
}: {
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
  onBlur: () => void;
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  status: SaveStatus;
  wide: boolean;
  onExpand: () => void;
}) {
  const deferred = useDeferredValue(value);
  const [imgAnchor, setImgAnchor] = useState<HTMLElement | null>(null);
  const [uploading, setUploading] = useState(false);

  /** Replace [start,end) keeping the browser undo stack when possible. */
  const replaceRange = (start: number, end: number, text: string, selStart: number, selEnd: number) => {
    const ta = taRef.current;
    if (!ta) {
      onChange(value.slice(0, start) + text + value.slice(end));
      return;
    }
    ta.focus();
    ta.setSelectionRange(start, end);
    let ok = false;
    try {
      ok = document.execCommand('insertText', false, text);
    } catch {
      ok = false;
    }
    if (!ok || ta.value !== value.slice(0, start) + text + value.slice(end)) {
      onChange(value.slice(0, start) + text + value.slice(end));
    }
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  };

  const wrap = (before: string, after: string, placeholder: string) => {
    const ta = taRef.current;
    const s = ta?.selectionStart ?? value.length;
    const e = ta?.selectionEnd ?? value.length;
    const sel = value.slice(s, e);
    // Toggle off when the selection is already wrapped.
    if (sel && value.slice(s - before.length, s) === before && value.slice(e, e + after.length) === after) {
      replaceRange(s - before.length, e + after.length, sel, s - before.length, e - before.length);
      return;
    }
    const inner = sel || placeholder;
    replaceRange(s, e, before + inner + after, s + before.length, s + before.length + inner.length);
  };

  const prefixLines = (prefix: string, numbered = false) => {
    const ta = taRef.current;
    const s = ta?.selectionStart ?? value.length;
    const e = ta?.selectionEnd ?? value.length;
    const ls = value.lastIndexOf('\n', s - 1) + 1;
    let le = value.indexOf('\n', Math.max(e - (e > s && value[e - 1] === '\n' ? 1 : 0), s));
    if (le < 0) le = value.length;
    const lines = value.slice(ls, le).split('\n');
    const re = numbered ? /^\d+\.\s/ : new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    const all = lines.every((l) => re.test(l));
    const next = lines.map((l, i) => {
      if (all) return l.replace(re, '');
      const clean = l.replace(/^(#{1,6}\s|>\s|-\s|\d+\.\s)/, '');
      return (numbered ? `${i + 1}. ` : prefix) + clean;
    }).join('\n');
    replaceRange(ls, le, next, ls, ls + next.length);
  };

  const insertImage = (url: string, alt = 'imagem') => {
    const ta = taRef.current;
    const s = ta?.selectionStart ?? value.length;
    const e = ta?.selectionEnd ?? value.length;
    const before = s > 0 && value[s - 1] !== '\n' ? '\n' : '';
    const md = `${before}![${alt}](${url})\n`;
    replaceRange(s, e, md, s + md.length, s + md.length);
  };

  const uploadAndInsert = async (file: File) => {
    setUploading(true);
    const url = await uploadImage(file);
    setUploading(false);
    if (url) insertImage(url, file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'imagem');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      wrap('**', '**', 'negrito');
    } else if (mod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      wrap('_', '_', 'itálico');
    } else if (mod && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onBlur();
    } else if (e.key === 'Enter' && !e.shiftKey && !mod) {
      // Continue lists / quotes on Enter.
      const ta = e.currentTarget;
      const s = ta.selectionStart;
      if (s !== ta.selectionEnd) return;
      const ls = value.lastIndexOf('\n', s - 1) + 1;
      const line = value.slice(ls, s);
      const m = /^(\s*)(-|\*|>|\d+\.)\s(.*)$/.exec(line);
      if (!m) return;
      e.preventDefault();
      if (!m[3]!.trim()) {
        replaceRange(ls, s, '', ls, ls);
        return;
      }
      const num = /^\d+/.exec(m[2]!);
      const marker = num ? `${Number(num[0]) + 1}.` : m[2]!;
      const ins = `\n${m[1]}${marker} `;
      replaceRange(s, s, ins, s + ins.length, s + ins.length);
    }
  };

  const tools: { icon: ReactNode; label: string; kbd?: string; run: () => void }[] = [
    { icon: <Bold />, label: 'Negrito', kbd: 'Ctrl+B', run: () => wrap('**', '**', 'negrito') },
    { icon: <Italic />, label: 'Itálico', kbd: 'Ctrl+I', run: () => wrap('_', '_', 'itálico') },
    { icon: <Heading2 />, label: 'Título', run: () => prefixLines('## ') },
    { icon: <List />, label: 'Lista', run: () => prefixLines('- ') },
    { icon: <Quote />, label: 'Citação', run: () => prefixLines('> ') },
  ];

  const statusText = status === 'saving' ? 'Salvando…' : status === 'pending' ? 'Editando…' : status === 'error' ? 'Não salvo' : 'Salvo';
  const words = useMemo(() => (deferred.trim() ? deferred.trim().split(/\s+/).length : 0), [deferred]);

  return (
    <div className="jr-bodyed" data-mode={mode} data-wide={wide ? 'true' : undefined}>
      <div className="jr-toolbar">
        {mode !== 'preview' && (
          <div className="jr-toolbar__group">
            {tools.map((t) => (
              <IconButton key={t.label} size="sm" icon={t.icon} label={t.label} kbd={t.kbd} onMouseDown={(e) => e.preventDefault()} onClick={t.run} />
            ))}
            <IconButton
              size="sm"
              icon={uploading ? <Spinner /> : <ImagePlus />}
              label="Inserir imagem"
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => setImgAnchor(e.currentTarget)}
              disabled={uploading}
            />
          </div>
        )}
        <span className="u-grow" />
        <div className="jr-modes" role="radiogroup" aria-label="Modo de edição">
          {([
            { v: 'write', icon: <PenLine />, label: 'Escrever' },
            { v: 'split', icon: <Columns2 />, label: 'Dividido' },
            { v: 'preview', icon: <Eye />, label: 'Prévia' },
          ] as const).map((m) => (
            <button
              key={m.v}
              type="button"
              role="radio"
              aria-checked={mode === m.v}
              data-active={mode === m.v ? 'true' : undefined}
              data-tip={m.label}
              aria-label={m.label}
              onClick={() => setMode(m.v)}
            >
              {m.icon}
            </button>
          ))}
        </div>
        {!wide && <IconButton size="sm" icon={<Maximize2 />} label="Tela cheia" onClick={onExpand} />}
      </div>

      <div className="jr-bodyed__area">
        {mode !== 'preview' && (
          <textarea
            ref={taRef}
            className="textarea jr-textarea"
            value={value}
            spellCheck
            placeholder={'Escreva em Markdown…\n\n## Um título\n**negrito**, _itálico_, - listas, > citações\n\nArraste ou cole imagens aqui.'}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onBlur}
            onPaste={(e) => {
              const file = firstImageFile(e.clipboardData?.files);
              if (file) {
                e.preventDefault();
                void uploadAndInsert(file);
              }
            }}
            onDragOver={(e) => {
              if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              const file = firstImageFile(e.dataTransfer?.files);
              if (file) {
                e.preventDefault();
                void uploadAndInsert(file);
              }
            }}
          />
        )}
        {mode !== 'write' && (
          <div className="jr-preview">
            {deferred.trim() ? <Markdown text={deferred} className="jr-md" /> : <p className="u-dim u-flavor">Nada para pré-visualizar ainda.</p>}
          </div>
        )}
      </div>

      <div className="jr-bodyed__foot">
        <span className="jr-status" data-status={status}>
          {status === 'saved' ? <Check /> : <span className="jr-status__dot" />}
          {statusText}
        </span>
        <span className="u-dim">{words} {words === 1 ? 'palavra' : 'palavras'} · Markdown</span>
      </div>

      {imgAnchor && (
        <Popover anchor={imgAnchor} onClose={() => setImgAnchor(null)} className="jr-imgpop">
          <ImageInsert
            onUrl={(url) => {
              setImgAnchor(null);
              insertImage(url);
            }}
            onFile={(f) => {
              setImgAnchor(null);
              void uploadAndInsert(f);
            }}
          />
        </Popover>
      )}
    </div>
  );
}

function ImageInsert({ onUrl, onFile }: { onUrl: (url: string) => void; onFile: (f: File) => void }) {
  const [url, setUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const valid = isValidUrl(url.trim());
  return (
    <div className="u-col">
      <div className="menu__label">Inserir imagem</div>
      <Button size="sm" icon={<Upload />} onClick={() => fileRef.current?.click()}>Enviar arquivo</Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
      <div className="u-row">
        <input
          className="input input--sm"
          placeholder="https://…"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) onUrl(url.trim());
          }}
        />
        <IconButton size="sm" icon={<Check />} label="Inserir URL" disabled={!valid} onClick={() => onUrl(url.trim())} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image + sharing fields
// ---------------------------------------------------------------------------

function ImageField({ value, onChange }: { value: string | null; onChange: (url: string | null) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [urlMode, setUrlMode] = useState(false);
  const [url, setUrl] = useState('');
  const [over, setOver] = useState(false);
  const src = assetUrl(value);

  const pickFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    const u = await uploadImage(file);
    setBusy(false);
    if (u) onChange(u);
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="image/*"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0] ?? null;
        e.target.value = '';
        void pickFile(f);
      }}
    />
  );

  if (src) {
    return (
      <div className="jr-imgfield jr-imgfield--has">
        <img src={src} alt="" />
        <div className="jr-imgfield__actions">
          <IconButton size="sm" icon={busy ? <Spinner /> : <Upload />} label="Trocar imagem" onClick={() => fileRef.current?.click()} disabled={busy} />
          <IconButton size="sm" danger icon={<Trash2 />} label="Remover imagem" onClick={() => onChange(null)} />
        </div>
        {fileInput}
      </div>
    );
  }

  if (urlMode) {
    const valid = isValidUrl(url.trim());
    return (
      <div className="u-row">
        <input
          className="input input--sm"
          placeholder="https://exemplo.com/mapa.jpg"
          value={url}
          autoFocus
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && valid) {
              onChange(url.trim());
              setUrlMode(false);
              setUrl('');
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              setUrlMode(false);
            }
          }}
        />
        <IconButton size="sm" icon={<Check />} label="Usar URL" disabled={!valid} onClick={() => { onChange(url.trim()); setUrlMode(false); setUrl(''); }} />
        <IconButton size="sm" icon={<X />} label="Cancelar" onClick={() => setUrlMode(false)} />
      </div>
    );
  }

  return (
    <div
      className="jr-imgfield jr-dropzone"
      data-over={over ? 'true' : undefined}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes('Files')) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        const f = firstImageFile(e.dataTransfer?.files);
        if (f) {
          e.preventDefault();
          void pickFile(f);
        }
      }}
    >
      {busy ? (
        <span className="u-row u-sm u-muted"><Spinner /> Enviando…</span>
      ) : (
        <>
          <button type="button" className="jr-dropzone__btn" onClick={() => fileRef.current?.click()}>
            <ImagePlus />
            Enviar imagem
          </button>
          <span className="jr-dropzone__or">ou</span>
          <button type="button" className="jr-dropzone__btn" onClick={() => setUrlMode(true)}>
            <Link2 />
            Usar URL
          </button>
        </>
      )}
      {fileInput}
    </div>
  );
}

type ShareMode = 'dm' | 'players' | 'all';

function ShareControl({ value, players, onChange }: {
  value: JournalEntry['sharedWith'];
  players: PlayerInfo[];
  onChange: (v: JournalEntry['sharedWith']) => void;
}) {
  const derived: ShareMode = value === 'all' ? 'all' : value.length ? 'players' : 'dm';
  const [mode, setMode] = useState<ShareMode>(derived);
  useEffect(() => {
    setMode((m) => (derived === 'dm' && m === 'players' ? m : derived));
  }, [derived]);
  const ids = value === 'all' ? [] : value;

  const choose = (m: ShareMode) => {
    setMode(m);
    if (m === 'all') onChange('all');
    else if (m === 'dm') onChange([]);
    else onChange(ids);
  };

  const toggle = (id: ID) => {
    onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };

  return (
    <div className="jr-share">
      <Segmented<ShareMode>
        value={mode}
        onChange={choose}
        options={[
          { value: 'dm', label: 'Só o Mestre', icon: <Lock /> },
          { value: 'players', label: 'Jogadores', icon: <Users /> },
          { value: 'all', label: 'Todos', icon: <Globe /> },
        ]}
      />
      {mode === 'players' && (
        <div className="jr-share__players">
          {players.length ? players.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip"
              data-active={ids.includes(p.id) ? 'true' : undefined}
              aria-pressed={ids.includes(p.id)}
              onClick={() => toggle(p.id)}
            >
              <span className="jr-share__dot" style={{ background: p.color }} />
              {p.name}
              {ids.includes(p.id) && <Check />}
            </button>
          )) : <span className="u-xs u-dim">Nenhum jogador entrou na mesa ainda.</span>}
          {players.length > 0 && !ids.length && <span className="jr-share__hint">Escolha quem pode ler esta página.</span>}
        </div>
      )}
    </div>
  );
}
