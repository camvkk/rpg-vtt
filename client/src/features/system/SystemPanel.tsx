// "Sistema" tab: the DM imports a homebrew system (documents → Kimi → preview → save) and everyone reads its
// rules reference. Players only get this tab while the campaign uses the custom system.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { create } from 'zustand';
import {
  BookMarked, Check, ClipboardPaste, Dices, Download, FileText, FileUp, Layers, ListChecks, PencilLine, RotateCcw,
  Scale, Search, Shield, Sparkles, Square, Swords, Trash2, TriangleAlert, UserRound, WandSparkles, X,
} from 'lucide-react';
import type { SystemParseProgress } from '@shared/protocol.ts';
import { SYSTEM_DOC_LIMITS } from '@shared/protocol.ts';
import type { CustomEntry, CustomModifierRule, CustomSystem } from '@shared/types.ts';
import {
  checkCustomFormula, MODIFIER_LABEL, normalizeCustomSystem, prettyFormula,
} from '@shared/customSystem.ts';
import { newId } from '@shared/util.ts';
import { extractDocument, loadSystemSources } from '../../net/api.ts';
import { act, parseSystem } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useIsDM } from '../../store/hooks.ts';
import { Button, confirmDialog, Empty, Field, IconButton, Segmented, Spinner, toast } from '../../ui/index.tsx';
import { norm, Section } from '../character/common.tsx';
import '../character/character.css';
import './system.css';

// ---------------------------------------------------------------------------
// Importer store (survives tab switches, not reloads — the server keeps the last documents)
// ---------------------------------------------------------------------------

interface Doc {
  id: string;
  name: string;
  text: string;
  kind: 'pdf' | 'docx' | 'text' | 'paste' | 'saved';
}

interface ImporterStore {
  docs: Doc[];
  sourcesLoaded: boolean;
  instructions: string;
  busy: boolean;
  /** Bumped to ignore an in-flight parse ("Cancelar"). */
  run: number;
  progress: SystemParseProgress | null;
  startedAt: number;
  draft: CustomSystem | null;
  warnings: string[];
  error: string | null;
  set(p: Partial<Omit<ImporterStore, 'set'>>): void;
}

const useImporter = create<ImporterStore>((set) => ({
  docs: [],
  sourcesLoaded: false,
  instructions: '',
  busy: false,
  run: 0,
  progress: null,
  startedAt: 0,
  draft: null,
  warnings: [],
  error: null,
  set: (p) => set(p),
}));

const KIND_LABEL: Record<Doc['kind'], string> = { pdf: 'PDF', docx: 'DOCX', text: 'Texto', paste: 'Colado', saved: 'Salvo' };
const MAX_FILE_MB = 30;

function addDoc(doc: Omit<Doc, 'id'>): void {
  const st = useImporter.getState();
  if (st.docs.length >= SYSTEM_DOC_LIMITS.maxDocs) {
    toast(`No máximo ${SYSTEM_DOC_LIMITS.maxDocs} documentos por importação.`, 'warning');
    return;
  }
  let text = doc.text.trim();
  if (text.length > SYSTEM_DOC_LIMITS.maxDocChars) {
    text = text.slice(0, SYSTEM_DOC_LIMITS.maxDocChars);
    toast(`"${doc.name}" foi cortado em ${SYSTEM_DOC_LIMITS.maxDocChars.toLocaleString('pt-BR')} caracteres.`, 'warning');
  }
  // Re-adding a file with the same name replaces it.
  const docs = st.docs.filter((d) => d.name !== doc.name);
  st.set({ docs: [...docs, { ...doc, text, id: newId() }], error: null });
}

/** A JSON file may be an exported system: preview it directly, no AI needed. */
function tryJsonSystem(text: string, name: string): boolean {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return false;
  }
  const res = normalizeCustomSystem(data, { sources: [name] });
  if ('error' in res) {
    toast(`${name}: ${res.error}`, 'danger');
    return true;
  }
  useImporter.getState().set({ draft: res.system, warnings: res.warnings, error: null });
  toast('Sistema carregado do JSON — revise e salve.', 'success');
  return true;
}

async function addFiles(files: FileList | File[]): Promise<void> {
  for (const file of Array.from(files)) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      toast(`${file.name}: arquivo maior que ${MAX_FILE_MB} MB.`, 'warning');
      continue;
    }
    const lower = file.name.toLowerCase();
    if (/\.(txt|md|markdown|csv|json)$/.test(lower)) {
      const text = await file.text();
      if (lower.endsWith('.json') && tryJsonSystem(text, file.name)) continue;
      addDoc({ name: file.name, text, kind: 'text' });
      continue;
    }
    const res = await extractDocument(file, file.name);
    if (!res.ok) {
      toast(`${file.name}: ${res.error}`, 'danger');
      continue;
    }
    if (res.truncated) toast(`${file.name} é muito longo; só o começo será usado.`, 'warning');
    addDoc({ name: res.name, text: res.text, kind: res.kind });
  }
}

async function runParse(): Promise<void> {
  const st = useImporter.getState();
  if (st.busy || !st.docs.length) return;
  const run = st.run + 1;
  st.set({ busy: true, run, progress: null, startedAt: Date.now(), error: null });
  const res = await parseSystem(
    { documents: st.docs.map((d) => ({ name: d.name, text: d.text })), instructions: st.instructions },
    (progress) => {
      if (useImporter.getState().run === run) useImporter.getState().set({ progress });
    },
  );
  if (useImporter.getState().run !== run) return; // cancelled
  if (res.ok) useImporter.getState().set({ busy: false, draft: res.system, warnings: res.warnings, progress: null });
  else useImporter.getState().set({ busy: false, error: res.error, progress: null });
}

function cancelParse(): void {
  const st = useImporter.getState();
  st.set({ busy: false, run: st.run + 1, progress: null });
}

function downloadJson(system: CustomSystem): void {
  const blob = new Blob([JSON.stringify(system, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${system.name.replace(/[^\w\s-]/g, '').trim() || 'sistema'}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export default function SystemPanel() {
  const isDM = useIsDM();
  return <div className="sys-panel u-scroll">{isDM ? <DmSystem /> : <PlayerSystem />}</div>;
}

function PlayerSystem() {
  const system = useGame((s) => (s.state?.settings.system === 'custom' ? s.state.customSystem : null));
  if (!system) {
    return <Empty icon={<BookMarked />} title="Sem sistema customizado">O Mestre está usando D&D 5e nesta mesa.</Empty>;
  }
  return (
    <>
      <SystemHero system={system} />
      <SystemReference system={system} />
    </>
  );
}

function DmSystem() {
  const saved = useGame((s) => s.state?.customSystem ?? null);
  const draft = useImporter((s) => s.draft);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    const st = useImporter.getState();
    if (st.sourcesLoaded) return;
    st.set({ sourcesLoaded: true });
    void loadSystemSources().then((res) => {
      if (!res.ok || !res.documents.length || useImporter.getState().docs.length) return;
      useImporter.getState().set({ docs: res.documents.map((d) => ({ ...d, id: newId(), kind: 'saved' as const })) });
    });
  }, []);

  if (draft) return <DraftPreview draft={draft} replacing={!!saved} />;
  if (!saved) return <Importer intro />;
  return (
    <>
      <CurrentSystem system={saved} />
      <section className="sys-box">
        <button type="button" className="sys-collapse section-title" aria-expanded={importOpen} onClick={() => setImportOpen((v) => !v)}>
          <FileUp /> Reimportar ou atualizar
        </button>
        {importOpen && <Importer />}
      </section>
      <SystemReference system={saved} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Current system (DM)
// ---------------------------------------------------------------------------

function CurrentSystem({ system }: { system: CustomSystem }) {
  const active = useGame((s) => s.state?.settings.system === 'custom');
  const remove = async () => {
    const ok = await confirmDialog(
      'Remover sistema',
      <>Remover <strong>{system.name}</strong>? As fichas voltam ao D&D 5e. Os valores já preenchidos ficam guardados nas fichas.</>,
      { danger: true, ok: 'Remover' },
    );
    if (ok) void act('system.clear', {});
  };
  return (
    <section className="sys-current">
      <SystemHero system={system} badge={<span className={`badge ${active ? 'badge--success' : ''}`}>{active ? 'Em uso' : 'Desativado'}</span>} />
      <div className="field">
        <span className="field__label">Fichas da mesa usam</span>
        <Segmented
          value={active ? 'custom' : 'dnd5e'}
          options={[
            { value: 'dnd5e', label: 'D&D 5e', icon: <Shield /> },
            { value: 'custom', label: system.name.length > 22 ? `${system.name.slice(0, 21)}…` : system.name, icon: <BookMarked /> },
          ]}
          onChange={(v) => void act('settings.update', { system: v })}
        />
      </div>
      <div className="sys-actions">
        <Button size="sm" icon={<PencilLine />} onClick={() => useImporter.getState().set({ draft: structuredClone(system), warnings: [], error: null })}>
          Ajustar
        </Button>
        <Button size="sm" icon={<Download />} onClick={() => downloadJson(system)}>Exportar JSON</Button>
        <span className="u-grow" />
        <IconButton size="sm" danger icon={<Trash2 />} label="Remover sistema" onClick={() => void remove()} />
      </div>
    </section>
  );
}

function SystemHero({ system, badge }: { system: CustomSystem; badge?: ReactNode }) {
  const counts: [number, string][] = [
    [system.stats.length, 'atributos'], [system.skills.length, 'perícias'], [system.races.length, 'raças'],
    [system.classes.length, 'classes'], [system.equipment.length, 'itens'], [system.powers.length, 'poderes'],
    [system.mechanics.length, 'mecânicas'], [system.rules.length, 'regras'],
  ];
  return (
    <div className="sys-hero">
      <div className="sys-hero__head">
        <span className="sys-hero__sigil"><BookMarked /></span>
        <div className="u-grow" style={{ minWidth: 0 }}>
          <h3 className="sys-hero__name">{system.name}</h3>
          {system.sources.length > 0 && (
            <div className="sys-hero__src u-ellipsis" data-tip={system.sources.join('\n')}>
              <FileText /> {system.sources.join(', ')}
            </div>
          )}
        </div>
        {badge}
      </div>
      {system.description && <p className="sys-hero__desc">{system.description}</p>}
      <div className="sys-counts">
        {counts.filter(([n]) => n > 0).map(([n, label]) => <span key={label} className="chip"><b>{n}</b> {label}</span>)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Importer
// ---------------------------------------------------------------------------

function Importer({ intro }: { intro?: boolean }) {
  const aiEnabled = useGame((s) => s.aiEnabled);
  const docs = useImporter((s) => s.docs);
  const instructions = useImporter((s) => s.instructions);
  const busy = useImporter((s) => s.busy);
  const error = useImporter((s) => s.error);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteName, setPasteName] = useState('');
  const total = docs.reduce((s, d) => s + d.text.length, 0);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setReading(true);
    await addFiles(files);
    setReading(false);
  };

  return (
    <div className="sys-import">
      {intro && (
        <div className="sys-intro">
          <span className="sys-intro__sigil"><WandSparkles /></span>
          <h3 className="sys-intro__title">Traga o seu sistema</h3>
          <p className="sys-intro__text">
            Envie as regras do seu RPG (PDF, DOCX, TXT ou MD) ou cole o texto. O Oráculo lê tudo e monta atributos, perícias,
            raças, classes, equipamentos e mecânicas. Você revisa antes de ativar, e as fichas passam a seguir essas regras.
          </p>
        </div>
      )}

      <label
        className="sys-drop"
        data-over={over ? 'true' : undefined}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void onFiles(e.dataTransfer.files);
        }}
      >
        {reading ? <Spinner /> : <FileUp />}
        <span className="sys-drop__title">{reading ? 'Lendo arquivos…' : 'Solte arquivos aqui ou clique para escolher'}</span>
        <span className="sys-drop__hint">PDF, DOCX, TXT, MD · JSON exportado de um sistema também serve</span>
        <input
          type="file"
          multiple
          hidden
          accept=".pdf,.docx,.txt,.md,.markdown,.csv,.json,application/pdf,text/plain"
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </label>

      <div className="sys-paste">
        <textarea
          className="textarea"
          rows={4}
          placeholder="Ou cole aqui o texto das regras (do Google Docs, de um site, de um PDF…)"
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />
        <div className="u-row">
          <input className="input input--sm" placeholder="Nome (opcional)" value={pasteName} maxLength={80} onChange={(e) => setPasteName(e.target.value)} />
          <Button
            size="sm"
            icon={<ClipboardPaste />}
            disabled={!paste.trim()}
            onClick={() => {
              addDoc({ name: pasteName.trim() || `Texto colado ${useImporter.getState().docs.filter((d) => d.kind === 'paste').length + 1}`, text: paste, kind: 'paste' });
              setPaste('');
              setPasteName('');
            }}
          >
            Adicionar
          </Button>
        </div>
      </div>

      {docs.length > 0 && (
        <div className="sys-docs">
          <div className="sys-docs__head">
            <span className="section-title"><Layers /> Documentos ({docs.length})</span>
            <span className="u-xs u-dim u-tabular">{total.toLocaleString('pt-BR')} caracteres</span>
          </div>
          {docs.map((d) => (
            <div key={d.id} className="sys-doc">
              <FileText className="sys-doc__icon" />
              <span className="sys-doc__name u-ellipsis" data-tip={d.text.slice(0, 280)}>{d.name}</span>
              <span className="sys-doc__meta">{KIND_LABEL[d.kind]} · {d.text.length.toLocaleString('pt-BR')}</span>
              <IconButton
                size="sm"
                icon={<X />}
                label="Remover documento"
                disabled={busy}
                onClick={() => useImporter.getState().set({ docs: useImporter.getState().docs.filter((x) => x.id !== d.id) })}
              />
            </div>
          ))}
        </div>
      )}

      {docs.length > 0 && (
        <Field label="Observações para a IA (opcional)" hint="Ex.: “os testes usam 2d6”, “ignore o capítulo de cenário”, “as perícias valem de 0 a 5”.">
          <textarea
            className="textarea"
            rows={2}
            maxLength={2000}
            value={instructions}
            onChange={(e) => useImporter.getState().set({ instructions: e.target.value })}
          />
        </Field>
      )}

      {!aiEnabled && (
        <div className="sys-note">
          <TriangleAlert />
          <span>
            A IA está desligada no servidor. Defina <code>MOONSHOT_API_KEY</code> ou <code>OPENROUTER_API_KEY</code> (Kimi) no{' '}
            <code>.env</code> e reinicie. Importar um JSON de sistema funciona mesmo assim.
          </span>
        </div>
      )}

      {busy ? (
        <ParseProgress />
      ) : (
        <Button variant="primary" block icon={<Sparkles />} disabled={!docs.length || !aiEnabled} onClick={() => void runParse()}>
          Processar com IA
        </Button>
      )}
      {error && (
        <div className="sys-error">
          <TriangleAlert />
          <span className="u-grow">{error}</span>
        </div>
      )}
    </div>
  );
}

const THINKING_LINES = ['Lendo as regras…', 'Separando atributos e perícias…', 'Conferindo raças e classes…', 'Traduzindo dados em fórmulas…'];

function ParseProgress() {
  const progress = useImporter((s) => s.progress);
  const startedAt = useImporter((s) => s.startedAt);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const secs = Math.max(0, Math.round((now - startedAt) / 1000));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const line = progress?.phase === 'writing'
    ? `Escrevendo o sistema… ${progress.chars.toLocaleString('pt-BR')} caracteres`
    : THINKING_LINES[Math.floor(secs / 6) % THINKING_LINES.length]!;
  return (
    <div className="sys-progress" aria-live="polite">
      <Spinner />
      <div className="u-grow" style={{ minWidth: 0 }}>
        <div className="sys-progress__line u-flavor">{line}</div>
        <div className="u-xs u-dim">Sistemas grandes levam alguns minutos · {clock}</div>
      </div>
      <Button size="sm" variant="ghost" icon={<Square />} onClick={cancelParse}>Cancelar</Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft preview + quick adjustments
// ---------------------------------------------------------------------------

function DraftPreview({ draft, replacing }: { draft: CustomSystem; replacing: boolean }) {
  const warnings = useImporter((s) => s.warnings);
  const docs = useImporter((s) => s.docs);
  const busy = useImporter((s) => s.busy);
  const error = useImporter((s) => s.error);
  const aiEnabled = useGame((s) => s.aiEnabled);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<CustomSystem>) => useImporter.getState().set({ draft: { ...draft, ...patch } });
  const checkErr = checkCustomFormula(draft.checkFormula, draft);
  const skillErr = checkCustomFormula(draft.skillFormula, draft);
  const invalid = !!checkErr || !!skillErr || !draft.name.trim() || !draft.hpName.trim() || !draft.defenseName.trim();

  const save = async () => {
    setSaving(true);
    const res = await act('system.save', { system: { ...draft, name: draft.name.trim(), importedAt: Date.now() } });
    setSaving(false);
    if (res.ok) {
      useImporter.getState().set({ draft: null, warnings: [], error: null });
      toast(<>Sistema <strong>{draft.name}</strong> ativado.</>, 'success');
    }
  };

  return (
    <>
      <section className="sys-draft">
        <div className="sys-draft__kicker"><Sparkles /> Prévia — ainda não salvo</div>
        <SystemHero system={draft} />
        {warnings.length > 0 && (
          <ul className="sys-warnings">
            {warnings.map((w) => <li key={w}><TriangleAlert />{w}</li>)}
          </ul>
        )}
        <div className="sys-adjust">
          <div className="section-title"><PencilLine /> Ajustes</div>
          <Field label="Nome do sistema">
            <input className="input" value={draft.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Teste de atributo" error={checkErr} hint={`= ${prettyFormula(draft.checkFormula, draft)}`}>
            <input className="input u-mono" value={draft.checkFormula} maxLength={120} onChange={(e) => set({ checkFormula: e.target.value.trim() })} />
          </Field>
          <Field label="Teste de perícia" error={skillErr} hint={`= ${prettyFormula(draft.skillFormula, draft)}`}>
            <input className="input u-mono" value={draft.skillFormula} maxLength={120} onChange={(e) => set({ skillFormula: e.target.value.trim() })} />
          </Field>
          <div className="u-xs u-dim">
            Variáveis: <code>@atr</code> modificador · <code>@valor</code> valor do atributo · <code>@pericia</code> · <code>@nivel</code>
            {draft.stats.length > 0 && <> · {draft.stats.slice(0, 6).map((s) => <code key={s.key}>@{s.key}</code>)}</>}
            {' '}· parada de dados: <code>{'{@valor}d6'}</code>
          </div>
          <Field label="Modificador do atributo">
            <select className="select" value={draft.modifier} onChange={(e) => set({ modifier: e.target.value as CustomModifierRule })}>
              {(Object.keys(MODIFIER_LABEL) as CustomModifierRule[]).map((k) => <option key={k} value={k}>{MODIFIER_LABEL[k]}</option>)}
            </select>
          </Field>
          <div className="sys-grid-2">
            <Field label="Nome da vida">
              <input className="input" value={draft.hpName} maxLength={30} onChange={(e) => set({ hpName: e.target.value })} />
            </Field>
            <Field label="Nome da defesa">
              <input className="input" value={draft.defenseName} maxLength={30} onChange={(e) => set({ defenseName: e.target.value })} />
            </Field>
          </div>
        </div>
        {busy && <ParseProgress />}
        {error && <div className="sys-error"><TriangleAlert /><span className="u-grow">{error}</span></div>}
        <div className="sys-actions">
          <Button variant="primary" icon={saving ? <Spinner /> : <Check />} disabled={invalid || saving || busy} onClick={() => void save()}>
            {replacing ? 'Salvar e usar' : 'Salvar e ativar'}
          </Button>
          {docs.length > 0 && aiEnabled && (
            <Button icon={<RotateCcw />} disabled={busy || saving} onClick={() => void runParse()}>Reprocessar</Button>
          )}
          <Button variant="ghost" disabled={saving} onClick={() => useImporter.getState().set({ draft: null, warnings: [], error: null })}>
            Descartar
          </Button>
        </div>
      </section>
      <SystemReference system={draft} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Rules reference (read-only, searchable)
// ---------------------------------------------------------------------------

function matches(q: string, ...parts: (string | undefined | null)[]): boolean {
  return !q || norm(parts.filter(Boolean).join(' ')).includes(q);
}

export function SystemReference({ system }: { system: CustomSystem }) {
  const [query, setQuery] = useState('');
  const q = norm(query);
  const statShort = useMemo(() => Object.fromEntries(system.stats.map((s) => [s.key, s.short || s.name])), [system.stats]);
  const skillName = useMemo(() => Object.fromEntries(system.skills.map((s) => [s.key, s.name])), [system.skills]);
  const searching = q.length > 0;

  const stats = system.stats.filter((s) => matches(q, s.name, s.short, s.description));
  const skills = system.skills.filter((s) => matches(q, s.name, s.description));
  const resources = system.resources.filter((r) => matches(q, r.name, r.description));
  const races = system.races.filter((r) => matches(q, r.name, r.description, r.traits.join(' ')));
  const classes = system.classes.filter((k) => matches(q, k.name, k.description, k.features.join(' ')));
  const entry = (e: CustomEntry) => matches(q, e.name, e.tag, e.detail, e.description);
  const equipment = system.equipment.filter(entry);
  const powers = system.powers.filter(entry);
  const mechanics = system.mechanics.filter(entry);
  const rules = system.rules.filter((r) => matches(q, r.name, r.description));
  const nothing = searching && ![stats, skills, resources, races, classes, equipment, powers, mechanics, rules].some((l) => l.length);

  const sec = (key: string, title: string, icon: ReactNode, count: number, body: ReactNode) =>
    count > 0 && (
      <Section
        key={`${key}-${searching}`}
        title={key === 'core' ? title : <>{title} <span className="u-dim u-xs">{count}</span></>}
        icon={icon}
        collapsible={!searching}
        defaultOpen={searching || key === 'core'}
        prefKey={`sys.${key}`}
      >
        {body}
      </Section>
    );

  return (
    <div className="sys-ref">
      <div className="cs-search sys-ref__search">
        <Search />
        <input className="input input--sm" placeholder="Buscar regra, item, poder…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {!searching && sec('core', 'Como se joga', <Scale />, 1, (
        <div className="sys-core">
          <div><span className="sys-core__k">Teste de atributo</span><code className="sys-formula">{prettyFormula(system.checkFormula, system)}</code></div>
          <div><span className="sys-core__k">Teste de perícia</span><code className="sys-formula">{prettyFormula(system.skillFormula, system)}</code></div>
          <div><span className="sys-core__k">Modificador</span><span>{MODIFIER_LABEL[system.modifier]}</span></div>
          <div><span className="sys-core__k">Vida / Defesa</span><span>{system.hpName} · {system.defenseName}</span></div>
        </div>
      ))}

      {sec('stats', 'Atributos', <Dices />, stats.length, (
        <div className="sys-list">
          {stats.map((s) => (
            <div key={s.key} className="sys-item">
              <div className="sys-item__head">
                <span className="sys-short">{s.short}</span>
                <span className="sys-item__name">{s.name}</span>
                <span className="sys-item__meta">{s.min}–{s.max} · inicial {s.default}</span>
              </div>
              {s.description && <p className="sys-item__desc">{s.description}</p>}
            </div>
          ))}
        </div>
      ))}

      {sec('skills', 'Perícias', <ListChecks />, skills.length, (
        <div className="sys-skills">
          {skills.map((s) => (
            <div key={s.key} className="sys-skill" data-tip={s.description || undefined}>
              <span className="u-ellipsis">{s.name}</span>
              {s.stat && <span className="sys-short sys-short--sm">{statShort[s.stat]}</span>}
            </div>
          ))}
        </div>
      ))}

      {sec('resources', 'Recursos', <Layers />, resources.length, (
        <div className="sys-list">
          {resources.map((r) => (
            <div key={r.key} className="sys-item">
              <div className="sys-item__head"><span className="sys-item__name">{r.name}</span><span className="sys-item__meta">máx. inicial {r.max}</span></div>
              {r.description && <p className="sys-item__desc">{r.description}</p>}
            </div>
          ))}
        </div>
      ))}

      {sec('races', 'Raças', <UserRound />, races.length, (
        <div className="sys-list">
          {races.map((r) => (
            <div key={r.key} className="sys-item">
              <div className="sys-item__head">
                <span className="sys-item__name">{r.name}</span>
                <span className="sys-bonuses">
                  {Object.entries(r.statBonuses).map(([k, v]) => <span key={k} className="chip">{v > 0 ? `+${v}` : v} {statShort[k] ?? k}</span>)}
                </span>
              </div>
              {r.description && <p className="sys-item__desc">{r.description}</p>}
              {r.traits.length > 0 && <ul className="sys-bullets">{r.traits.map((t) => <li key={t}>{t}</li>)}</ul>}
            </div>
          ))}
        </div>
      ))}

      {sec('classes', 'Classes', <Swords />, classes.length, (
        <div className="sys-list">
          {classes.map((k) => (
            <div key={k.key} className="sys-item">
              <div className="sys-item__head">
                <span className="sys-item__name">{k.name}</span>
                {k.hitDie > 0 && <span className="badge">d{k.hitDie}</span>}
                <span className="sys-bonuses">{k.primaryStats.map((s) => <span key={s} className="chip">{statShort[s] ?? s}</span>)}</span>
              </div>
              {k.description && <p className="sys-item__desc">{k.description}</p>}
              {k.skills.length > 0 && <div className="u-xs u-muted">Perícias: {k.skills.map((s) => skillName[s] ?? s).join(', ')}</div>}
              {k.features.length > 0 && <ul className="sys-bullets">{k.features.map((f) => <li key={f}>{f}</li>)}</ul>}
            </div>
          ))}
        </div>
      ))}

      {sec('mechanics', 'Mecânicas especiais', <Sparkles />, mechanics.length, <EntryList entries={mechanics} system={system} />)}
      {sec('powers', 'Poderes e magias', <WandSparkles />, powers.length, <EntryList entries={powers} system={system} />)}
      {sec('equipment', 'Equipamento', <Shield />, equipment.length, <EntryList entries={equipment} system={system} />)}

      {sec('rules', 'Regras', <BookMarked />, rules.length, (
        <div className="sys-list">
          {rules.map((r, i) => (
            <div key={`${r.name}-${i}`} className="sys-item">
              <div className="sys-item__head"><span className="sys-item__name">{r.name}</span></div>
              {r.description && <p className="sys-item__desc sys-item__desc--long">{r.description}</p>}
            </div>
          ))}
        </div>
      ))}

      {nothing && <div className="cs-empty-line">Nada encontrado para “{query}”.</div>}
    </div>
  );
}

function EntryList({ entries, system }: { entries: CustomEntry[]; system: CustomSystem }) {
  return (
    <div className="sys-list">
      {entries.map((e) => (
        <div key={e.key} className="sys-item">
          <div className="sys-item__head">
            <span className="sys-item__name">{e.name}</span>
            {e.tag && <span className="badge">{e.tag}</span>}
            {e.formula && <code className="sys-formula sys-formula--sm">{prettyFormula(e.formula, system)}</code>}
          </div>
          {e.detail && <div className="sys-item__meta">{e.detail}</div>}
          {e.description && <p className="sys-item__desc">{e.description}</p>}
        </div>
      ))}
    </div>
  );
}

