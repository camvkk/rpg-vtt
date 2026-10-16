import type { ReactNode } from 'react';
import {
  BrickWall, Circle, CloudFog, Cone, DoorClosed, Eraser, Hexagon, Lamp, MapPin, MousePointer2, PenTool, Pencil,
  Radar, RectangleHorizontal, Ruler, Slash, Spline, Square, Trash2, Type, Undo2, Wand2,
} from 'lucide-react';
import { LIGHT_PRESETS } from '@shared/defaults.ts';
import type { TemplateKind, WallKind } from '@shared/types.ts';
import { act } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { useIsDM, useViewSceneId } from '../store/hooks.ts';
import { useUi, type Tool } from '../store/ui.ts';
import { confirmDialog, IconButton, Segmented, Toggle } from '../ui/index.tsx';
import { SpellTemplatePicker } from './SpellTemplatePicker.tsx';

interface ToolDef {
  id: Tool;
  label: string;
  icon: ReactNode;
  kbd: string;
  dm?: boolean;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Selecionar e mover', icon: <MousePointer2 />, kbd: 'V' },
  { id: 'measure', label: 'Régua', icon: <Ruler />, kbd: 'M' },
  { id: 'ping', label: 'Apontar (ping)', icon: <Radar />, kbd: 'P' },
  { id: 'draw', label: 'Desenhar', icon: <Pencil />, kbd: 'D' },
  { id: 'template', label: 'Área de efeito', icon: <Wand2 />, kbd: 'A' },
  { id: 'wall', label: 'Paredes e portas', icon: <BrickWall />, kbd: 'W', dm: true },
  { id: 'light', label: 'Luzes', icon: <Lamp />, kbd: 'L', dm: true },
  { id: 'fog', label: 'Névoa manual', icon: <CloudFog />, kbd: 'F', dm: true },
  { id: 'note', label: 'Notas no mapa', icon: <MapPin />, kbd: 'N', dm: true },
];

export function ToolRail() {
  const tool = useUi((s) => s.tool);
  const isDM = useIsDM();
  const playerDrawing = useGame((s) => s.state?.settings.playerDrawing ?? true);
  const playerTemplates = useGame((s) => s.state?.settings.playerTemplates ?? true);
  const tools = TOOLS.filter((t) => {
    if (t.dm && !isDM) return false;
    if (!isDM && t.id === 'draw' && !playerDrawing) return false;
    if (!isDM && t.id === 'template' && !playerTemplates) return false;
    return true;
  });
  return (
    <>
      <nav className="rail panel" aria-label="Ferramentas">
        {tools.map((t, i) => (
          <div key={t.id} style={{ display: 'contents' }}>
            {t.dm && !tools[i - 1]?.dm && <span className="rail__sep" />}
            <IconButton
              icon={t.icon}
              label={t.label}
              kbd={t.kbd}
              active={tool === t.id}
              dm={t.dm}
              data-tip-side="right"
              onClick={() => useUi.getState().setTool(t.id)}
            />
          </div>
        ))}
      </nav>
      <ToolOptionsPanel />
    </>
  );
}

const COLORS = ['#e0b45a', '#e2554d', '#5fa8f5', '#3fbf8f', '#b8a2ff', '#f0f0f0', '#141414'];

function ColorRow({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="u-row u-gap-1">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className="swatch"
          style={{ background: c }}
          data-active={value === c ? 'true' : undefined}
          aria-label={c}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

function ToolOptionsPanel() {
  const tool = useUi((s) => s.tool);
  const opts = useUi((s) => s.toolOpts);
  const setOpts = useUi((s) => s.setToolOpts);
  const sceneId = useViewSceneId();
  const isDM = useIsDM();
  if (!sceneId) return null;

  let body: ReactNode = null;
  if (tool === 'draw') {
    body = (
      <>
        <Segmented
          value={opts.draw.kind}
          onChange={(kind) => setOpts('draw', { kind })}
          options={[
            { value: 'path', label: '', icon: <PenTool />, tip: 'Livre' },
            { value: 'line', label: '', icon: <Slash />, tip: 'Linha' },
            { value: 'rect', label: '', icon: <RectangleHorizontal />, tip: 'Retângulo' },
            { value: 'ellipse', label: '', icon: <Circle />, tip: 'Elipse' },
            { value: 'text', label: '', icon: <Type />, tip: 'Texto' },
          ]}
        />
        <ColorRow value={opts.draw.stroke} onChange={(stroke) => setOpts('draw', { stroke })} />
        <div className="u-row">
          <span className="u-xs u-muted">Espessura</span>
          <input className="range" type="range" min={1} max={24} value={opts.draw.width} onChange={(e) => setOpts('draw', { width: Number(e.target.value) })} />
        </div>
        {(opts.draw.kind === 'rect' || opts.draw.kind === 'ellipse') && (
          <Toggle checked={opts.draw.fill} onChange={(fill) => setOpts('draw', { fill })} label="Preencher" />
        )}
        {isDM && <Toggle checked={opts.draw.gmOnly} onChange={(gmOnly) => setOpts('draw', { gmOnly })} label="Só o Mestre vê" />}
        <div className="u-row">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('drawing.clear', { sceneId, onlyMine: true })}><Eraser /> Apagar meus</button>
          {isDM && (
            <button type="button" className="btn btn--sm btn--ghost u-danger" onClick={async () => {
              if (await confirmDialog('Apagar todos os desenhos?', 'Isso remove os desenhos de todos nesta cena.', { danger: true, ok: 'Apagar' })) {
                void act('drawing.clear', { sceneId, onlyMine: false });
              }
            }}><Trash2 /> Todos</button>
          )}
        </div>
      </>
    );
  } else if (tool === 'template') {
    body = (
      <>
        <Segmented<TemplateKind>
          value={opts.template.kind}
          onChange={(kind) => setOpts('template', { kind, spellId: null, label: '' })}
          options={[
            { value: 'circle', label: '', icon: <Circle />, tip: 'Esfera/Raio' },
            { value: 'cone', label: '', icon: <Cone />, tip: 'Cone' },
            { value: 'line', label: '', icon: <Spline />, tip: 'Linha' },
            { value: 'square', label: '', icon: <Square />, tip: 'Cubo' },
          ]}
        />
        <div className="u-row">
          <span className="u-xs u-muted" style={{ width: 70 }}>{opts.template.kind === 'circle' ? 'Raio' : opts.template.kind === 'square' ? 'Lado' : 'Alcance'}</span>
          <input className="input input--sm input--num" style={{ width: 64 }} type="number" min={5} max={500} step={5} value={opts.template.size}
            onChange={(e) => setOpts('template', { size: Math.max(5, Number(e.target.value) || 5) })} />
          <span className="u-xs u-muted">pés</span>
        </div>
        <ColorRow value={opts.template.color} onChange={(color) => setOpts('template', { color })} />
        <SpellTemplatePicker />
        <div className="u-xs u-dim">Clique para posicionar, arraste para mirar. <span className="kbd">Del</span> remove.</div>
      </>
    );
  } else if (tool === 'wall') {
    body = (
      <>
        <Segmented<WallKind>
          value={opts.wall.kind}
          onChange={(kind) => setOpts('wall', { kind })}
          options={[
            { value: 'wall', label: 'Parede', icon: <BrickWall /> },
            { value: 'door', label: 'Porta', icon: <DoorClosed /> },
            { value: 'window', label: 'Janela', icon: <Square /> },
            { value: 'ethereal', label: 'Véu', icon: <Hexagon />, tip: 'Bloqueia visão, não movimento' },
            { value: 'invisible', label: 'Invisível', icon: <Slash />, tip: 'Bloqueia movimento, não visão' },
          ]}
        />
        <Toggle checked={opts.wall.snap} onChange={(snap) => setOpts('wall', { snap })} label="Encaixar na grade" />
        <Toggle checked={opts.wall.chain} onChange={(chain) => setOpts('wall', { chain })} label="Encadear segmentos" />
        <div className="u-xs u-dim">Clique para começar, clique para cada vértice. <span className="kbd">Esc</span> termina. Clique direito numa parede apaga.</div>
        <button type="button" className="btn btn--sm btn--ghost u-danger" onClick={async () => {
          if (await confirmDialog('Apagar todas as paredes?', 'Paredes e portas desta cena serão removidas.', { danger: true, ok: 'Apagar' })) void act('wall.clear', { sceneId });
        }}><Trash2 /> Limpar paredes</button>
      </>
    );
  } else if (tool === 'light') {
    body = (
      <>
        <div className="u-xs u-muted">Fonte de luz</div>
        <div className="u-row u-wrap u-gap-1">
          {Object.entries(LIGHT_PRESETS).map(([id, p]) => (
            <button key={id} type="button" className="chip" data-active={opts.light.preset === id ? 'true' : undefined} onClick={() => setOpts('light', { preset: id })}>
              <span className="dot" style={{ background: p.light.color }} />
              {p.name}
            </button>
          ))}
        </div>
        <div className="u-xs u-dim">Clique no mapa para acender. Arraste para mover. Clique direito apaga.</div>
      </>
    );
  } else if (tool === 'fog') {
    body = (
      <>
        <Segmented
          value={opts.fog.op}
          onChange={(op) => setOpts('fog', { op })}
          options={[
            { value: 'reveal', label: 'Revelar' },
            { value: 'hide', label: 'Esconder' },
          ]}
        />
        <Segmented
          value={opts.fog.shape}
          onChange={(shape) => setOpts('fog', { shape })}
          options={[
            { value: 'rect', label: '', icon: <RectangleHorizontal />, tip: 'Retângulo' },
            { value: 'circle', label: '', icon: <Circle />, tip: 'Círculo' },
            { value: 'poly', label: '', icon: <Hexagon />, tip: 'Polígono (clique, Enter fecha)' },
          ]}
        />
        <div className="u-row">
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('fog.undo', { sceneId })}><Undo2 /> Desfazer</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('fog.reset', { sceneId, to: 'revealed' })}>Revelar tudo</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => act('fog.reset', { sceneId, to: 'hidden' })}>Cobrir tudo</button>
        </div>
      </>
    );
  } else if (tool === 'note') {
    body = <div className="u-xs u-dim">Clique no mapa para fixar uma nota. Notas podem abrir páginas do Diário.</div>;
  } else if (tool === 'measure') {
    body = <div className="u-xs u-dim">Arraste para medir. Clique direito / <span className="kbd">Espaço</span> adiciona pontos. Todos veem sua régua.</div>;
  } else if (tool === 'ping') {
    body = <div className="u-xs u-dim">Clique para chamar atenção. {isDM && <>Com <span className="kbd">Shift</span>, move a câmera de todos.</>}</div>;
  }
  if (!body) return null;
  return <div className="tool-opts panel panel--raised">{body}</div>;
}
