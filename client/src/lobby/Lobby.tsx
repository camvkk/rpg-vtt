import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowRight, Castle, Crown, Dices, DoorOpen, Flame, KeyRound, Lightbulb, Map as MapIcon, Moon, Plus, Sparkles,
  Swords, Trash2, Trees, Users, Wand2,
} from 'lucide-react';
import { createCampaign, lookupCampaign } from '../net/api.ts';
import { forgetTable, getPref, loadTables, setPref, type SavedTable } from '../net/session.ts';
import { join } from '../net/socket.ts';
import { Button, Field, Segmented, toast } from '../ui/index.tsx';
import { Embers } from './Embers.tsx';
import './lobby.css';

type Starter = 'blank' | 'tavern' | 'dungeon' | 'forest';

const STARTERS: { id: Starter; name: string; desc: string; img: string | null; icon: React.ReactNode }[] = [
  { id: 'tavern', name: 'Taverna', desc: 'Lareira acesa, mesas e quartos', img: '/maps/builtin-tavern.jpg', icon: <Flame /> },
  { id: 'dungeon', name: 'Cripta', desc: 'Escuridão total, visão dinâmica', img: '/maps/builtin-dungeon.jpg', icon: <Castle /> },
  { id: 'forest', name: 'Floresta', desc: 'Noite de luar entre as árvores', img: '/maps/builtin-forest.jpg', icon: <Trees /> },
  { id: 'blank', name: 'Em branco', desc: 'Comece do zero com seu mapa', img: null, icon: <MapIcon /> },
];

export function Lobby({ initialCode }: { initialCode: string | null }) {
  const [mode, setMode] = useState<'join' | 'create'>(initialCode ? 'join' : 'create');
  const [tables, setTables] = useState<SavedTable[]>(() => loadTables());
  const [name, setName] = useState<string>(() => getPref('playerName', ''));

  useEffect(() => {
    if (name) setPref('playerName', name);
  }, [name]);

  return (
    <div className="lobby">
      <div className="lobby__bg" />
      <Embers />
      <div className="lobby__inner">
        <header className="lobby__hero">
          <div className="lobby__sigil"><Dices /></div>
          <h1 className="lobby__title">RPG VTT</h1>
          <p className="lobby__tagline u-flavor">A mesa que você abre e joga.</p>
          <ul className="lobby__features">
            <li><Lightbulb /> Luz e visão dinâmicas</li>
            <li><Dices /> Dados 3D com física</li>
            <li><Swords /> Combate automatizado 5e</li>
            <li><Sparkles /> Oráculo com IA</li>
          </ul>
        </header>

        <main className="lobby__main">
          <section className="lobby__card panel panel--raised">
            <div className="lobby__switch">
              <Segmented
                value={mode}
                onChange={setMode}
                options={[
                  { value: 'create', label: 'Criar mesa', icon: <Plus /> },
                  { value: 'join', label: 'Entrar', icon: <DoorOpen /> },
                ]}
              />
            </div>
            {mode === 'create'
              ? <CreateForm name={name} setName={setName} />
              : <JoinForm name={name} setName={setName} initialCode={initialCode} />}
          </section>

          {tables.length > 0 && (
            <section className="lobby__recent">
              <div className="section-title">Suas mesas</div>
              <div className="lobby__recent-list">
                {tables.slice(0, 6).map((t) => (
                  <RecentTable
                    key={t.code}
                    table={t}
                    onForget={() => {
                      forgetTable(t.code);
                      setTables(loadTables());
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
        <footer className="lobby__footer u-dim u-xs">
          Baseado no SRD 5.1 (CC-BY-4.0) · sem cadastro · tempo real
        </footer>
      </div>
    </div>
  );
}

function RecentTable({ table, onForget }: { table: SavedTable; onForget: () => void }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const res = await join({ code: table.code, token: table.token, name: table.playerName });
    setBusy(false);
    if (!res.ok) toast(res.error, 'danger');
  };
  return (
    <div className="lobby__recent-item card">
      <div className="lobby__recent-icon">{table.role === 'dm' ? <Crown /> : <Users />}</div>
      <div className="u-grow">
        <div className="u-display u-ellipsis" style={{ fontSize: 15 }}>{table.name}</div>
        <div className="u-xs u-muted">
          {table.role === 'dm' ? 'Mestre' : table.playerName} · <span className="u-mono">{table.code}</span>
        </div>
      </div>
      <button type="button" className="icon-btn icon-btn--sm icon-btn--danger" data-tip="Esquecer" onClick={onForget}><Trash2 /></button>
      <Button size="sm" variant="primary" onClick={go} disabled={busy} icon={<ArrowRight />}>Continuar</Button>
    </div>
  );
}

function CreateForm({ name, setName }: { name: string; setName: (v: string) => void }) {
  const [campaign, setCampaign] = useState('');
  const [password, setPassword] = useState('');
  const [starter, setStarter] = useState<Starter>('tavern');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast('Digite seu nome.', 'warning');
    setBusy(true);
    const res = await createCampaign({
      name: campaign.trim() || 'A Maldição de Strahd', dmName: name.trim(), dmPassword: password || undefined, starter,
    });
    if (!res.ok) {
      setBusy(false);
      toast(res.error, 'danger');
      return;
    }
    const joined = await join({ code: res.code, token: res.token, name: name.trim() });
    setBusy(false);
    if (!joined.ok) toast(joined.error, 'danger');
    else toast(`Mesa criada! Código: ${res.code}`, 'success', 6000);
  };

  return (
    <form className="u-col u-gap-4" onSubmit={submit}>
      <div className="lobby__grid2">
        <Field label="Seu nome">
          <input className="input input--lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mestre das Sombras" maxLength={40} autoFocus />
        </Field>
        <Field label="Nome da campanha">
          <input className="input input--lg" value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder="A Maldição de Strahd" maxLength={80} />
        </Field>
      </div>
      <Field label="Cena inicial">
        <div className="lobby__starters">
          {STARTERS.map((s) => (
            <button
              key={s.id}
              type="button"
              className="lobby__starter"
              aria-label={`${s.name}: ${s.desc}`}
              aria-pressed={starter === s.id}
              data-active={starter === s.id ? 'true' : undefined}
              onClick={() => setStarter(s.id)}
              style={s.img ? { backgroundImage: `linear-gradient(180deg, rgba(9,8,12,.1), rgba(9,8,12,.92)), url(${s.img})` } : undefined}
            >
              <span className="lobby__starter-icon">{s.icon}</span>
              <span className="lobby__starter-name">{s.name}</span>
              <span className="lobby__starter-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      </Field>
      <Field label={<><KeyRound size={12} style={{ verticalAlign: -1 }} /> Senha do Mestre (opcional)</>} hint="Permite voltar como Mestre em outro dispositivo.">
        <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" maxLength={200} autoComplete="new-password" />
      </Field>
      <Button type="submit" variant="primary" size="lg" block disabled={busy} icon={<Wand2 />}>
        {busy ? 'Conjurando a mesa…' : 'Criar mesa'}
      </Button>
    </form>
  );
}

function JoinForm({ name, setName, initialCode }: { name: string; setName: (v: string) => void; initialCode: string | null }) {
  const [code, setCode] = useState(initialCode ?? '');
  const [asDm, setAsDm] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ name: string; players: number } | null>(null);

  useEffect(() => {
    const c = code.trim().toUpperCase();
    if (c.length < 6) {
      setPreview(null);
      return;
    }
    const t = window.setTimeout(async () => {
      const res = await lookupCampaign(c);
      setPreview(res.ok ? { name: res.name, players: res.players } : null);
    }, 350);
    return () => window.clearTimeout(t);
  }, [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return toast('Digite o código da mesa.', 'warning');
    if (!name.trim() && !asDm) return toast('Digite seu nome.', 'warning');
    setBusy(true);
    const res = await join({ code: c, name: name.trim(), dmPassword: asDm ? password : undefined });
    setBusy(false);
    if (!res.ok) toast(res.error, 'danger');
  };

  return (
    <form className="u-col u-gap-4" onSubmit={submit}>
      <Field label="Código da mesa">
        <input
          className="input input--lg input--code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10))}
          placeholder="ABC123"
          autoFocus={!initialCode}
          inputMode="text"
          autoCapitalize="characters"
        />
      </Field>
      <div className="lobby__preview" data-visible={preview ? 'true' : undefined}>
        {preview && (
          <>
            <Moon size={14} />
            <span className="u-display">{preview.name}</span>
            <span className="u-muted u-xs">· {preview.players} {preview.players === 1 ? 'pessoa' : 'pessoas'}</span>
          </>
        )}
      </div>
      <Field label="Seu nome">
        <input className="input input--lg" value={name} onChange={(e) => setName(e.target.value)} placeholder="Thalia, a Ladina" maxLength={40} autoFocus={!!initialCode} />
      </Field>
      <label className="toggle">
        <input type="checkbox" checked={asDm} onChange={(e) => setAsDm(e.target.checked)} />
        <span className="toggle__track" />
        <span>Sou o Mestre desta mesa</span>
      </label>
      {asDm && (
        <Field label="Senha do Mestre">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" autoComplete="current-password" />
        </Field>
      )}
      <Button type="submit" variant="primary" size="lg" block disabled={busy} icon={<DoorOpen />}>
        {busy ? 'Abrindo a porta…' : 'Entrar na mesa'}
      </Button>
    </form>
  );
}
