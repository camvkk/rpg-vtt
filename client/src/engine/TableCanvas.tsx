// React host for the Pixi engine. Subscribes to stores outside React's render cycle.
import { useEffect, useRef } from 'react';
import type { ID, Token } from '@shared/types.ts';
import { onFx } from '../net/socket.ts';
import { useGame } from '../store/game.ts';
import { useUi } from '../store/ui.ts';
import { registerEngine } from './api.ts';
import { Engine, type EngineCtx } from './Engine.ts';

function buildCtx(): EngineCtx | null {
  const g = useGame.getState();
  const ui = useUi.getState();
  const st = g.state;
  const me = g.me;
  if (!st || !me) return null;
  const isDM = me.role === 'dm';
  const sceneId = isDM && ui.viewSceneId && st.scenes[ui.viewSceneId] ? ui.viewSceneId : st.activeSceneId;
  const scene = sceneId ? st.scenes[sceneId] : undefined;
  if (!scene) return null;
  const controlled = new Set<ID>();
  for (const t of Object.values(scene.tokens)) {
    if (isDM || t.ownerIds.includes(me.id)) controlled.add(t.id);
    else if (t.characterId && st.characters[t.characterId]?.ownerId === me.id) controlled.add(t.id);
  }
  let turnTokenId: ID | null = null;
  const combat = st.combat;
  if (combat?.started && combat.sceneId === scene.id && combat.turn >= 0) turnTokenId = combat.combatants[combat.turn]?.tokenId ?? null;
  return {
    scene,
    campaign: st,
    me,
    isDM,
    tool: ui.tool,
    toolOpts: ui.toolOpts,
    selection: new Set(ui.selection),
    targets: new Set(ui.targets),
    hover: ui.hoverTokenId,
    visionPreview: isDM ? ui.visionPreviewTokenId : null,
    turnTokenId,
    controlled,
  };
}

export function TableCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const engine = new Engine(host);
    let alive = true;
    let scheduled = false;
    let raf = 0;
    let timer = 0;
    // Sync on the next frame, or after 60ms when frames are throttled (background tab), whichever comes first.
    const run = () => {
      if (!scheduled) return;
      scheduled = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      const ctx = buildCtx();
      if (ctx && alive) engine.sync(ctx);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      raf = requestAnimationFrame(run);
      timer = window.setTimeout(run, 60);
    };
    const updateInset = () => {
      const open = useUi.getState().sidebarOpen;
      const el = document.querySelector('.sidebar');
      engine.rightInset = open && el && window.innerWidth > 900 ? (el as HTMLElement).offsetWidth + 16 : 0;
    };

    let unsubs: (() => void)[] = [];
    void engine.init().then(() => {
      if (!alive) return;
      if (import.meta.env.DEV) (window as unknown as { __vtt: Engine }).__vtt = engine;
      registerEngine({
        viewCenter: () => engine.viewCenterWorld(),
        centerOn: (x, y, zoom) => engine.centerOn(x, y, zoom),
        worldToScreen: (x, y) => engine.camera.worldToScreen(x, y),
        screenToWorld: (x, y) => engine.camera.screenToWorld(x, y),
        focusToken: (id) => {
          const t = engine.ctx?.scene.tokens[id];
          if (t) engine.focusToken(t);
        },
      });
      updateInset();
      const ctx = buildCtx();
      if (ctx) engine.sync(ctx);
      unsubs = [
        useGame.subscribe((s, p) => {
          if (s.state !== p.state || s.me !== p.me) schedule();
        }),
        useUi.subscribe((s, p) => {
          if (s.sidebarOpen !== p.sidebarOpen) window.setTimeout(updateInset, 260);
          if (
            s.tool !== p.tool || s.toolOpts !== p.toolOpts || s.selection !== p.selection || s.targets !== p.targets
            || s.hoverTokenId !== p.hoverTokenId || s.viewSceneId !== p.viewSceneId || s.visionPreviewTokenId !== p.visionPreviewTokenId
          ) schedule();
        }),
        onFx((e) => {
          const ctx = engine.ctx;
          if (!ctx) return;
          if (e.type === 'ping' && e.sceneId === ctx.scene.id) {
            engine.overlay.addPing(e.x, e.y, e.color);
            if (e.pull) engine.centerOn(e.x, e.y);
          } else if (e.type === 'ruler' && e.sceneId === ctx.scene.id) {
            engine.overlay.setRuler(e.playerId, e.points, e.color, e.label);
          } else if (e.type === 'camera' && e.sceneId === ctx.scene.id) {
            engine.centerOn(e.x, e.y, e.zoom ?? undefined);
          } else if (e.type === 'turn') {
            const tok = Object.values(ctx.scene.tokens).find((t: Token) => {
              const combat = ctx.campaign.combat;
              return combat?.combatants.find((c) => c.id === e.combatantId)?.tokenId === t.id;
            });
            if (tok && (ctx.isDM || ctx.controlled.has(tok.id))) engine.focusToken(tok);
          }
        }),
      ];
    });
    const onResize = () => updateInset();
    window.addEventListener('resize', onResize);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      for (const u of unsubs) u();
      window.removeEventListener('resize', onResize);
      registerEngine(null);
      engine.destroy();
    };
  }, []);

  return <div ref={hostRef} className="table__stage" />;
}
