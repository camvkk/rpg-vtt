import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, Eye, ImagePlus, Map as MapIcon, Play, Plus, Settings2, Trash2 } from 'lucide-react';
import { BUILTIN_MAPS } from '@shared/defaults.ts';
import { assetUrl, uploadFile } from '../../net/api.ts';
import { act } from '../../net/socket.ts';
import { useGame } from '../../store/game.ts';
import { useViewSceneId } from '../../store/hooks.ts';
import { useUi } from '../../store/ui.ts';
import { Button, confirmDialog, IconButton, toast } from '../../ui/index.tsx';
import './dm.css';

export default function ScenesPanel() {
  const scenes = useGame((s) => s.state?.scenes);
  const order = useGame((s) => s.state?.sceneOrder ?? []);
  const activeId = useGame((s) => s.state?.activeSceneId);
  const viewId = useViewSceneId();
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createFromBuiltin = async (id: string) => {
    const b = BUILTIN_MAPS.find((m) => m.id === id)!;
    const res = await act('scene.create', {
      name: b.name,
      patch: {
        map: { url: b.url, width: b.width, height: b.height, scale: 1, background: '#0b0a0f' },
        grid: { size: b.gridSize, opacity: 0.12 },
        lighting: { darkness: b.darkness, globalLight: b.darkness < 0.3 },
        fog: { mode: b.darkness >= 0.3 ? 'dynamic' : 'off' },
        ambience: b.ambience,
      },
    });
    if (res.ok) {
      useUi.getState().set({ viewSceneId: (res.result as { id: string }).id });
      setCreating(false);
    }
  };

  const createFromUpload = async (file: File) => {
    toast('Enviando mapa…', 'info', 1500);
    const up = await uploadFile(file);
    if (!up.ok || !up.url) {
      toast(up.error ?? 'Falha no envio.', 'danger');
      return;
    }
    const w = up.width ?? 2000, h = up.height ?? 1500;
    const res = await act('scene.create', {
      name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Novo mapa',
      patch: { map: { url: up.url, width: w, height: h, scale: 1, background: '#0b0a0f' }, grid: { opacity: 0.2 } },
    });
    if (res.ok) {
      const id = (res.result as { id: string }).id;
      useUi.getState().set({ viewSceneId: id, sceneSettingsId: id });
      toast('Mapa criado! Ajuste a grade para casar com o desenho.', 'success', 5000);
      setCreating(false);
    }
  };

  if (!scenes) return null;
  return (
    <div className="dm-panel u-scroll">
      <div className="dm-panel__actions">
        <Button variant="primary" size="sm" icon={<Plus />} onClick={() => setCreating((v) => !v)}>Nova cena</Button>
      </div>
      {creating && (
        <div className="scene-create">
          <div className="section-title">Mapas prontos</div>
          <div className="scene-create__grid">
            {BUILTIN_MAPS.map((m) => (
              <button key={m.id} type="button" className="scene-thumb" style={{ backgroundImage: `linear-gradient(180deg, transparent 40%, rgba(9,8,12,.95)), url(${m.url})` }} onClick={() => createFromBuiltin(m.id)}>
                <span>{m.name}</span>
              </button>
            ))}
            <button type="button" className="scene-thumb scene-thumb--upload" onClick={() => fileRef.current?.click()}>
              <ImagePlus />
              <span>Enviar imagem</span>
            </button>
            <button type="button" className="scene-thumb scene-thumb--upload" onClick={async () => {
              const res = await act('scene.create', { name: 'Cena em branco' });
              if (res.ok) {
                useUi.getState().set({ viewSceneId: (res.result as { id: string }).id });
                setCreating(false);
              }
            }}>
              <MapIcon />
              <span>Em branco</span>
            </button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void createFromUpload(f);
            e.target.value = '';
          }} />
        </div>
      )}
      <div className="scene-list">
        {order.map((id, i) => {
          const sc = scenes[id];
          if (!sc) return null;
          const live = id === activeId;
          const url = assetUrl(sc.map.url);
          return (
            <div key={id} className="scene-row" data-active={id === viewId ? 'true' : undefined}>
              <button type="button" className="scene-row__thumb" style={url ? { backgroundImage: `url(${url})` } : undefined} onClick={() => useUi.getState().set({ viewSceneId: id })} data-tip="Ver esta cena">
                {!url && <MapIcon />}
              </button>
              <div className="u-grow" style={{ minWidth: 0 }}>
                <div className="u-display u-ellipsis" style={{ fontSize: 14 }}>{sc.name}</div>
                <div className="u-row u-gap-1" style={{ marginTop: 3 }}>
                  {live ? <span className="badge badge--gold">Ao vivo</span> : <span className="badge">Preparação</span>}
                  <span className="u-xs u-dim">{Object.keys(sc.tokens).length} tokens</span>
                </div>
              </div>
              <div className="scene-row__actions">
                {!live && <IconButton size="sm" icon={<Play />} label="Levar jogadores para esta cena" onClick={() => {
                  void act('scene.activate', { id });
                  useUi.getState().set({ viewSceneId: id });
                }} />}
                <IconButton size="sm" icon={<Eye />} label="Ver (só você)" onClick={() => useUi.getState().set({ viewSceneId: id })} />
                <IconButton size="sm" icon={<Settings2 />} label="Configurar" onClick={() => useUi.getState().set({ sceneSettingsId: id })} />
                <IconButton size="sm" icon={<Copy />} label="Duplicar" onClick={() => act('scene.duplicate', { id })} />
                <IconButton size="sm" icon={<ArrowUp />} label="Subir" disabled={i === 0} onClick={() => {
                  const next = [...order];
                  [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                  void act('scene.reorder', { order: next });
                }} />
                <IconButton size="sm" icon={<ArrowDown />} label="Descer" disabled={i === order.length - 1} onClick={() => {
                  const next = [...order];
                  [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
                  void act('scene.reorder', { order: next });
                }} />
                <IconButton size="sm" icon={<Trash2 />} label="Excluir" danger disabled={order.length <= 1} onClick={async () => {
                  if (await confirmDialog('Excluir cena?', `"${sc.name}" e tudo nela (tokens, paredes, luzes) será apagado.`, { danger: true, ok: 'Excluir' })) {
                    void act('scene.delete', { id });
                  }
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
