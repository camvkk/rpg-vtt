import { Eye, Info, MapPin, X } from 'lucide-react';
import { act } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { useIsDM, useMyCharacter, useScene, useViewSceneId } from '../store/hooks.ts';
import { useUi } from '../store/ui.ts';
import { engineApi } from '../engine/api.ts';

/** Contextual banners so the table never feels "broken" (dark screen, preview mode…). */
export function Hints() {
  const isDM = useIsDM();
  const scene = useScene();
  const me = useGame((s) => s.me);
  const activeId = useGame((s) => s.state?.activeSceneId);
  const viewId = useViewSceneId();
  const preview = useUi((s) => s.visionPreviewTokenId);
  const myChar = useMyCharacter();
  if (!scene || !me) return null;

  if (isDM) {
    if (preview && scene.tokens[preview]) {
      return (
        <div className="hint hint--dm">
          <Eye size={14} /> Vendo como <strong>{scene.tokens[preview]!.name}</strong>
          <button type="button" className="hint__x" aria-label="Sair" onClick={() => useUi.getState().set({ visionPreviewTokenId: null })}><X size={13} /></button>
        </div>
      );
    }
    if (viewId && viewId !== activeId) {
      return (
        <div className="hint hint--dm">
          <Info size={14} /> Prévia — os jogadores estão em outra cena.
          <button type="button" className="btn btn--sm btn--arcane" onClick={() => act('scene.activate', { id: viewId })}>Levar jogadores</button>
          <button type="button" className="hint__x" aria-label="Voltar" onClick={() => useUi.getState().set({ viewSceneId: activeId ?? null })}><X size={13} /></button>
        </div>
      );
    }
    return null;
  }

  const mine = Object.values(scene.tokens).filter((t) => t.ownerIds.includes(me.id) || (t.characterId && myChar && t.characterId === myChar.id));
  if (scene.fog.mode === 'dynamic' && mine.length === 0) {
    return (
      <div className="hint">
        <MapPin size={14} />
        {myChar ? (
          <>
            {myChar.name} não está nesta cena.
            <button type="button" className="btn btn--sm btn--primary" onClick={() => {
              const c = engineApi.viewCenter();
              const g = scene.grid.size;
              void act('token.create', { sceneId: scene.id, token: { x: c.x - g / 2, y: c.y - g / 2 }, fromCharacter: myChar.id });
            }}>Entrar no mapa</button>
          </>
        ) : (
          <>Crie seu personagem para enxergar o mapa.
            <button type="button" className="btn btn--sm btn--primary" onClick={() => useUi.getState().set({ wizardOpen: true })}>Criar personagem</button>
          </>
        )}
      </div>
    );
  }
  return null;
}
