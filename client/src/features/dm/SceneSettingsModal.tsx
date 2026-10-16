import { useEffect, useRef, useState } from 'react';
import {
  CloudFog, CloudLightning, CloudRain, Flame, Grid3x3, ImagePlus, Leaf, Map as MapIcon, Moon, Music, Sun, Sunrise, Wind,
  Snowflake, Sparkles, Ban,
} from 'lucide-react';
import type { GridConfig, Scene, WeatherType } from '@shared/types.ts';
import { AMBIENCE_PRESETS } from '../audio/engine/index.ts';
import { assetUrl, uploadFile } from '../../net/api.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { Button, Field, Modal, Segmented, Tabs, Toggle, toast } from '../../ui/index.tsx';
import './dm.css';

type Tab = 'map' | 'grid' | 'light' | 'weather';

const WEATHER: { id: WeatherType; name: string; icon: React.ReactNode }[] = [
  { id: 'none', name: 'Limpo', icon: <Ban /> },
  { id: 'rain', name: 'Chuva', icon: <CloudRain /> },
  { id: 'storm', name: 'Tempestade', icon: <CloudLightning /> },
  { id: 'snow', name: 'Neve', icon: <Snowflake /> },
  { id: 'fog', name: 'Neblina', icon: <CloudFog /> },
  { id: 'embers', name: 'Brasas', icon: <Flame /> },
  { id: 'ash', name: 'Cinzas', icon: <Sparkles /> },
  { id: 'leaves', name: 'Folhas', icon: <Leaf /> },
  { id: 'sandstorm', name: 'Areia', icon: <Wind /> },
];

const DARKNESS_PRESETS = [
  { label: 'Dia', value: 0, icon: <Sun /> },
  { label: 'Entardecer', value: 0.35, icon: <Sunrise /> },
  { label: 'Noite', value: 0.7, icon: <Moon /> },
  { label: 'Breu', value: 0.95, icon: <Moon /> },
];

export default function SceneSettingsModal({ sceneId, onClose }: { sceneId: string; onClose: () => void }) {
  const scene = useGame((s) => s.state?.scenes[sceneId]);
  const [tab, setTab] = useState<Tab>('map');
  if (!scene) return null;
  const update = (patch: Parameters<typeof act<'scene.update'>>[1]['patch']) => act('scene.update', { id: scene.id, patch });
  return (
    <Modal title={`Cena: ${scene.name}`} icon={<MapIcon />} onClose={onClose} size="wide">
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'map', label: 'Mapa', icon: <MapIcon /> },
          { value: 'grid', label: 'Grade', icon: <Grid3x3 /> },
          { value: 'light', label: 'Luz e névoa', icon: <Moon /> },
          { value: 'weather', label: 'Clima e som', icon: <CloudRain /> },
        ]}
      />
      <div className="scene-settings">
        {tab === 'map' && <MapTab scene={scene} update={update} />}
        {tab === 'grid' && <GridTab scene={scene} update={update} />}
        {tab === 'light' && <LightTab scene={scene} update={update} />}
        {tab === 'weather' && <WeatherTab scene={scene} update={update} />}
      </div>
    </Modal>
  );
}

type Update = (patch: Parameters<typeof act<'scene.update'>>[1]['patch']) => Promise<unknown>;

function useDebounced<T>(value: T, onCommit: (v: T) => void, ms = 300): [T, (v: T) => void] {
  const [local, setLocal] = useState(value);
  const timer = useRef(0);
  useEffect(() => setLocal(value), [value]);
  return [local, (v: T) => {
    setLocal(v);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onCommit(v), ms);
  }];
}

function MapTab({ scene, update }: { scene: Scene; update: Update }) {
  const [name, setName] = useDebounced(scene.name, (v) => void update({ name: v || 'Cena' }));
  const [url, setUrl] = useState(scene.map.url ?? '');
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = assetUrl(scene.map.url);
  const setImage = async (file: File) => {
    const up = await uploadFile(file);
    if (!up.ok || !up.url) return toast(up.error ?? 'Falha no envio.', 'danger');
    await update({ map: { url: up.url, width: up.width ?? scene.map.width, height: up.height ?? scene.map.height, scale: 1 } });
    toast('Imagem do mapa atualizada.', 'success');
  };
  const applyUrl = () => {
    const u = url.trim();
    if (!u) return void update({ map: { url: null } });
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => void update({ map: { url: u, width: img.naturalWidth, height: img.naturalHeight, scale: 1 } });
    img.onerror = () => toast('Não foi possível carregar essa imagem (o site pode bloquear o acesso). Prefira enviar o arquivo.', 'warning', 6000);
    img.src = u;
  };
  return (
    <div className="u-col u-gap-4">
      <Field label="Nome da cena"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></Field>
      <div className="map-preview" style={preview ? { backgroundImage: `url(${preview})` } : undefined}>
        {!preview && <span className="u-muted">Sem imagem — o fundo será uma cor sólida</span>}
      </div>
      <div className="map-url-row">
        <Button icon={<ImagePlus />} onClick={() => fileRef.current?.click()}>Enviar imagem</Button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void setImage(f); e.target.value = ''; }} />
        <input className="input u-grow" placeholder="ou cole uma URL de imagem…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyUrl(); }} />
        <Button onClick={applyUrl}>Usar URL</Button>
      </div>
      <div className="grid-2">
        <Field label="Largura (px)"><input className="input" type="number" min={100} max={40000} value={scene.map.width} onChange={(e) => update({ map: { width: Math.max(100, Number(e.target.value) || 100) } })} /></Field>
        <Field label="Altura (px)"><input className="input" type="number" min={100} max={40000} value={scene.map.height} onChange={(e) => update({ map: { height: Math.max(100, Number(e.target.value) || 100) } })} /></Field>
      </div>
      <Field label="Cor de fundo"><input type="color" value={scene.map.background} onChange={(e) => update({ map: { background: e.target.value } })} /></Field>
      <Toggle checked={scene.hidden} onChange={(v) => update({ hidden: v })} label="Cena de preparação (os jogadores não navegam até ela)" />
    </div>
  );
}

function GridTab({ scene, update }: { scene: Scene; update: Update }) {
  const g = scene.grid;
  const set = (patch: Partial<GridConfig>) => update({ grid: patch });
  const [size, setSize] = useDebounced(g.size, (v) => void set({ size: v }), 120);
  return (
    <div className="u-col u-gap-4">
      <Field label="Tipo de grade">
        <Segmented
          value={g.type}
          onChange={(type) => set({ type })}
          options={[
            { value: 'square', label: 'Quadrada' },
            { value: 'hex-pointy', label: 'Hex (vértice)' },
            { value: 'hex-flat', label: 'Hex (lado)' },
            { value: 'none', label: 'Sem grade' },
          ]}
        />
      </Field>
      <Field label={`Tamanho da célula: ${size}px`} hint="Ajuste até as linhas casarem com o desenho do mapa. Dica: conte quantas células o mapa tem e divida a largura.">
        <div className="u-row">
          <input className="range" type="range" min={20} max={300} step={1} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <input className="input input--sm input--num" style={{ width: 70 }} type="number" min={10} max={500} step={0.5} value={size} onChange={(e) => setSize(Math.max(10, Number(e.target.value) || 10))} />
        </div>
      </Field>
      <div className="grid-2">
        <Field label={`Deslocamento X: ${Math.round(g.offsetX)}px`}>
          <input className="range" type="range" min={-g.size} max={g.size} step={1} value={g.offsetX} onChange={(e) => set({ offsetX: Number(e.target.value) })} />
        </Field>
        <Field label={`Deslocamento Y: ${Math.round(g.offsetY)}px`}>
          <input className="range" type="range" min={-g.size} max={g.size} step={1} value={g.offsetY} onChange={(e) => set({ offsetY: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Pés por célula"><input className="input" type="number" min={1} max={100} value={g.units} onChange={(e) => set({ units: Math.max(1, Number(e.target.value) || 5) })} /></Field>
        <Field label="Diagonais">
          <Segmented value={g.diagonals} onChange={(diagonals) => set({ diagonals })} options={[
            { value: '5e', label: '5e (5 pés)', tip: 'Regra padrão do 5e' },
            { value: '5-10-5', label: '5-10-5', tip: 'Regra opcional do DMG' },
            { value: 'euclidean', label: 'Real' },
          ]} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="Cor das linhas"><input type="color" value={g.color.slice(0, 7)} onChange={(e) => set({ color: e.target.value })} /></Field>
        <Field label={`Opacidade: ${Math.round(g.opacity * 100)}%`}>
          <input className="range" type="range" min={0} max={1} step={0.02} value={g.opacity} onChange={(e) => set({ opacity: Number(e.target.value) })} />
        </Field>
      </div>
      <div className="u-row u-gap-4">
        <Toggle checked={g.visible} onChange={(visible) => set({ visible })} label="Mostrar grade" />
        <Toggle checked={g.snap} onChange={(snap) => set({ snap })} label="Encaixar tokens" />
      </div>
    </div>
  );
}

function LightTab({ scene, update }: { scene: Scene; update: Update }) {
  const [dark, setDark] = useDebounced(scene.lighting.darkness, (v) => void update({ lighting: { darkness: v } }), 80);
  return (
    <div className="u-col u-gap-4">
      <Field label={`Escuridão: ${Math.round(dark * 100)}%`} hint="Luzes (tochas, magias, lampiões) e visão no escuro recortam a escuridão respeitando paredes.">
        <input className="range" type="range" min={0} max={1} step={0.01} value={dark} onChange={(e) => setDark(Number(e.target.value))} />
      </Field>
      <div className="u-row u-wrap">
        {DARKNESS_PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip" data-active={Math.abs(dark - p.value) < 0.02 ? 'true' : undefined} onClick={() => setDark(p.value)}>{p.icon}{p.label}</button>
        ))}
      </div>
      <Toggle checked={scene.lighting.globalLight} onChange={(globalLight) => update({ lighting: { globalLight } })} label="Iluminação global (tokens enxergam tudo na linha de visão, mesmo no escuro)" />
      <hr className="divider" />
      <Field label="Névoa de guerra">
        <Segmented
          value={scene.fog.mode}
          onChange={(mode) => update({ fog: { mode } })}
          options={[
            { value: 'off', label: 'Desligada' },
            { value: 'dynamic', label: 'Visão dinâmica', tip: 'Jogadores veem o que seus tokens veem (paredes + luz)' },
            { value: 'manual', label: 'Manual', tip: 'Você revela áreas com a ferramenta Névoa' },
          ]}
        />
      </Field>
      <Toggle checked={scene.fog.exploration} onChange={(exploration) => update({ fog: { exploration } })} label="Lembrar áreas exploradas (ficam esmaecidas)" />
      <div className="u-row">
        <Button size="sm" onClick={() => act('fog.reset', { sceneId: scene.id, to: 'hidden' })}>Cobrir tudo</Button>
        <Button size="sm" onClick={() => act('fog.reset', { sceneId: scene.id, to: 'revealed' })}>Revelar tudo</Button>
      </div>
    </div>
  );
}

function WeatherTab({ scene, update }: { scene: Scene; update: Update }) {
  const w = scene.weather;
  return (
    <div className="u-col u-gap-4">
      <Field label="Clima">
        <div className="weather-grid">
          {WEATHER.map((x) => (
            <button key={x.id} type="button" className="weather-opt" data-active={w.type === x.id ? 'true' : undefined} onClick={() => update({ weather: { type: x.id } })}>
              {x.icon}
              <span>{x.name}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid-2">
        <Field label={`Intensidade: ${Math.round(w.intensity * 100)}%`}>
          <input className="range" type="range" min={0.1} max={1} step={0.05} value={w.intensity} onChange={(e) => update({ weather: { intensity: Number(e.target.value) } })} />
        </Field>
        <Field label={`Vento: ${Math.round(w.wind)}°`}>
          <input className="range" type="range" min={0} max={180} step={5} value={w.wind} onChange={(e) => update({ weather: { wind: Number(e.target.value) } })} />
        </Field>
      </div>
      <Field label={<><Music size={12} style={{ verticalAlign: -1 }} /> Ambiente sonoro ao ativar a cena</>}>
        <select className="select" value={scene.ambience ?? ''} onChange={(e) => update({ ambience: e.target.value || null })}>
          <option value="">Nenhum</option>
          {AMBIENCE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
    </div>
  );
}
