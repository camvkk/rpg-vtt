// "Traços" tab: features & traits (with uses), proficiencies & languages, personality, backstory and notes.
import { memo, useMemo, useState } from 'react';
import { BookOpen, Drama, Languages, NotebookPen, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react';
import type { Character, Feature, ID } from '@shared/types.ts';
import { act } from '../../net/socket.ts';
import { confirmDialog, IconButton, Markdown, Toggle } from '../../ui/index.tsx';
import {
  DraftInput, DraftTextarea, norm, NumInput, patchCharacter, Pips, RESET_LABEL, Section, uid, type TabProps,
} from './common.tsx';

export function TraitsTab({ c, canEdit }: TabProps) {
  const [editing, setEditing] = useState<ID | null>(null);
  const [q, setQ] = useState('');
  const addFeature = () => {
    const f: Feature = { id: uid(), name: 'Nova característica', source: '', text: '', uses: null };
    void patchCharacter(c.id, (cur) => ({ features: [...cur.features, f] }));
    setEditing(f.id);
  };
  const list = useMemo(() => {
    const nq = norm(q);
    return nq ? c.features.filter((f) => norm(`${f.name} ${f.source} ${f.text}`).includes(nq)) : c.features;
  }, [c.features, q]);

  const prof = (key: keyof Character['proficiencies'], label: string) => (
    <label className="cs-mini-field cs-mini-field--wide" key={key}>
      <span>{label}</span>
      <DraftTextarea
        className="textarea cs-textarea--sm"
        rows={1}
        maxLength={500}
        value={c.proficiencies[key]}
        readOnly={!canEdit}
        placeholder={canEdit ? '—' : ''}
        onCommit={(v) => void patchCharacter(c.id, (cur) => ({ proficiencies: { ...cur.proficiencies, [key]: v } }))}
      />
    </label>
  );
  const persona = (key: keyof Character['personality'], label: string, placeholder: string) => (
    <label className="cs-mini-field cs-mini-field--wide" key={key}>
      <span>{label}</span>
      <DraftTextarea
        className="textarea cs-textarea--sm cs-flavor"
        rows={2}
        maxLength={4000}
        value={c.personality[key]}
        readOnly={!canEdit}
        placeholder={canEdit ? placeholder : ''}
        onCommit={(v) => void patchCharacter(c.id, (cur) => ({ personality: { ...cur.personality, [key]: v } }))}
      />
    </label>
  );

  return (
    <div className="cs-stack">
      <Section
        title="Características"
        icon={<Sparkles />}
        right={canEdit ? <button type="button" className="chip" onClick={addFeature}><Plus /> Nova</button> : undefined}
      >
        {c.features.length > 6 && (
          <div className="cs-search cs-search--inline">
            <Search />
            <input className="input input--sm" placeholder="Filtrar características…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
        {c.features.length === 0 && <div className="cs-empty-line">Nenhuma característica registrada.</div>}
        <div className="cs-feats">
          {list.map((f) => (
            <FeatureCard
              key={f.id}
              cid={c.id}
              f={f}
              canEdit={canEdit}
              editing={editing === f.id}
              onEdit={() => setEditing(editing === f.id ? null : f.id)}
            />
          ))}
        </div>
      </Section>

      <Section title="Proficiências e idiomas" icon={<Languages />} collapsible prefKey="profs">
        {prof('armor', 'Armaduras')}
        {prof('weapons', 'Armas')}
        {prof('tools', 'Ferramentas')}
        {prof('languages', 'Idiomas')}
      </Section>

      <Section title="Personalidade" icon={<Drama />} collapsible prefKey="persona">
        {persona('traits', 'Traços de personalidade', 'Como você age, fala, reage…')}
        {persona('ideals', 'Ideais', 'Aquilo em que você acredita.')}
        {persona('bonds', 'Vínculos', 'Pessoas, lugares e causas que importam.')}
        {persona('flaws', 'Defeitos', 'Vícios, medos, fraquezas.')}
      </Section>

      <Section title="História" icon={<BookOpen />} collapsible prefKey="story">
        <DraftTextarea
          className="textarea cs-flavor"
          rows={5}
          maxLength={40000}
          value={c.backstory}
          readOnly={!canEdit}
          placeholder={canEdit ? 'De onde você veio? O que busca?' : 'Sem história registrada.'}
          onCommit={(v) => void patchCharacter(c.id, { backstory: v })}
        />
      </Section>

      <Section title="Anotações" icon={<NotebookPen />} collapsible prefKey="notes">
        <DraftTextarea
          className="textarea"
          rows={4}
          maxLength={40000}
          value={c.notes}
          readOnly={!canEdit}
          placeholder={canEdit ? 'Pistas, nomes, dívidas, segredos…' : 'Sem anotações.'}
          onCommit={(v) => void patchCharacter(c.id, { notes: v })}
        />
      </Section>
    </div>
  );
}

const FeatureCard = memo(function FeatureCard({ cid, f, canEdit, editing, onEdit }: {
  cid: ID;
  f: Feature;
  canEdit: boolean;
  editing: boolean;
  onEdit: () => void;
}) {
  const [open, setOpen] = useState(false);
  const upd = (fn: (x: Feature) => Partial<Feature>) => patchCharacter(cid, (cur) => ({
    features: cur.features.map((x) => (x.id === f.id ? { ...x, ...fn(x) } : x)),
  }));
  const remove = async () => {
    if (await confirmDialog('Excluir característica', `Excluir "${f.name}"?`, { danger: true, ok: 'Excluir' })) {
      void patchCharacter(cid, (cur) => ({ features: cur.features.filter((x) => x.id !== f.id) }));
    }
  };
  const long = f.text.length > 160;
  return (
    <div className="cs-feat" data-editing={editing ? 'true' : undefined}>
      <div className="cs-feat__head">
        <button type="button" className="cs-feat__title" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="cs-feat__name">{f.name}</span>
          {f.source && <span className="cs-feat__src">{f.source}</span>}
        </button>
        {f.uses && f.uses.max > 0 && (
          <span className="cs-feat__uses" data-tip={RESET_LABEL[f.uses.reset]}>
            <Pips
              total={f.uses.max}
              filled={f.uses.max - f.uses.used}
              disabled={!canEdit}
              label={f.name}
              onSpend={() => void act('character.resource', { id: cid, kind: 'feature', key: f.id, delta: 1 })}
              onRestore={() => void act('character.resource', { id: cid, kind: 'feature', key: f.id, delta: -1 })}
            />
          </span>
        )}
        {canEdit && <IconButton size="sm" icon={<Pencil />} label="Editar" active={editing} onClick={onEdit} />}
      </div>
      {!editing && f.text && (
        <div
          className="cs-feat__text"
          data-clamp={long && !open ? 'true' : undefined}
          onClick={() => long && setOpen(!open)}
        >
          <Markdown text={f.text} />
        </div>
      )}
      {editing && canEdit && (
        <div className="cs-editor">
          <div className="cs-fields">
            <label className="cs-mini-field cs-mini-field--grow">
              <span>Nome</span>
              <DraftInput className="input input--sm" value={f.name} maxLength={120} onCommit={(v) => void upd(() => ({ name: v || f.name }))} />
            </label>
            <label className="cs-mini-field cs-mini-field--grow">
              <span>Origem</span>
              <DraftInput className="input input--sm" value={f.source} maxLength={80} placeholder="Classe, raça, talento…" onCommit={(v) => void upd(() => ({ source: v }))} />
            </label>
          </div>
          <label className="cs-mini-field cs-mini-field--wide">
            <span>Descrição (markdown)</span>
            <DraftTextarea className="textarea cs-textarea--sm" value={f.text} maxLength={40000} rows={3} onCommit={(v) => void upd(() => ({ text: v }))} />
          </label>
          <div className="cs-fields">
            <div className="cs-mini-field">
              <span>Usos limitados</span>
              <Toggle checked={!!f.uses} onChange={(v) => void upd(() => ({ uses: v ? { max: 1, used: 0, reset: 'long' } : null }))} />
            </div>
            {f.uses && (
              <>
                <label className="cs-mini-field">
                  <span>Máximo</span>
                  <NumInput className="input input--num input--sm" value={f.uses.max} min={1} max={100} onCommit={(v) => void upd((x) => ({ uses: x.uses ? { ...x.uses, max: v, used: Math.min(x.uses.used, v) } : null }))} />
                </label>
                <label className="cs-mini-field cs-mini-field--grow">
                  <span>Recupera em</span>
                  <select
                    className="select input--sm"
                    value={f.uses.reset}
                    onChange={(e) => void upd((x) => ({ uses: x.uses ? { ...x.uses, reset: e.target.value as 'short' | 'long' | 'dawn' | 'none' } : null }))}
                  >
                    {(['short', 'long', 'dawn', 'none'] as const).map((r) => <option key={r} value={r}>{RESET_LABEL[r]}</option>)}
                  </select>
                </label>
              </>
            )}
          </div>
          <div className="cs-editor__foot">
            <button type="button" className="btn btn--danger btn--sm" onClick={() => void remove()}><Trash2 /> Excluir</button>
          </div>
        </div>
      )}
    </div>
  );
});
