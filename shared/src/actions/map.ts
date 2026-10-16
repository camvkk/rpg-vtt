// Walls/doors, lights, drawings, templates and map notes.
import { z } from 'zod';
import { zDrawing, zId, zLightSource, zNote, zTemplate, zWall } from '../schemas.ts';
import type { Scene } from '../types.ts';
import {
  controlsToken, defineAction, DM_ONLY, dmOnly, isDM, NOT_FOUND, sceneFor, type ActionCtx,
} from './define.ts';
import type { CampaignState } from '../types.ts';

function dmScene(s: CampaignState, sceneId: string, ctx: ActionCtx): string | null {
  if (!isDM(ctx)) return DM_ONLY;
  return s.scenes[sceneId] ? null : NOT_FOUND;
}

const MAX_WALLS = 4000;

export const mapActions = {
  // Walls ---------------------------------------------------------------------
  'wall.create': defineAction({
    schema: z.object({ sceneId: zId, walls: z.array(zWall.omit({ id: true })).min(1).max(500) }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx)
      ?? (Object.keys(s.scenes[p.sceneId]!.walls).length + p.walls.length > MAX_WALLS ? 'Limite de paredes atingido.' : null),
    apply: (s, p, ctx) => {
      const scene = s.scenes[p.sceneId]!;
      const ids: string[] = [];
      for (const w of p.walls) {
        const len = Math.hypot(w.c[2] - w.c[0], w.c[3] - w.c[1]);
        if (len < 2) continue;
        const id = ctx.newId();
        scene.walls[id] = { id, ...w };
        ids.push(id);
      }
      return { ids };
    },
  }),

  'wall.update': defineAction({
    schema: z.object({ sceneId: zId, id: zId, patch: zWall.omit({ id: true }).partial() }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx) ?? (s.scenes[p.sceneId]!.walls[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      Object.assign(s.scenes[p.sceneId]!.walls[p.id]!, p.patch);
    },
  }),

  /** Open/close/lock a door. Players can open/close unlocked doors near a token they control. */
  'wall.door': defineAction({
    schema: z.object({ sceneId: zId, id: zId, state: z.enum(['closed', 'open', 'locked']) }),
    rate: 30,
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      const wall = scene.walls[p.id];
      if (!wall || wall.kind !== 'door') return NOT_FOUND;
      if (isDM(ctx)) return null;
      if (wall.secret) return NOT_FOUND;
      if (wall.door === 'locked') return 'A porta está trancada.';
      if (p.state === 'locked') return DM_ONLY;
      const mx = (wall.c[0] + wall.c[2]) / 2, my = (wall.c[1] + wall.c[3]) / 2;
      const reach = scene.grid.size * 2.5;
      const near = Object.values(scene.tokens).some((t) => {
        if (!controlsToken(s, t, ctx)) return false;
        const half = (t.size * scene.grid.size) / 2;
        return Math.hypot(t.x + half - mx, t.y + half - my) <= reach;
      });
      return near ? null : 'Aproxime um personagem seu da porta.';
    },
    apply: (s, p, ctx) => {
      const wall = s.scenes[p.sceneId]!.walls[p.id]!;
      const prev = wall.door;
      wall.door = p.state;
      if (prev !== p.state) {
        ctx.fx({ type: 'sfx', id: p.state === 'open' ? 'door-open' : p.state === 'locked' ? 'door-locked' : 'door-close' });
      }
    },
  }),

  'wall.delete': defineAction({
    schema: z.object({ sceneId: zId, ids: z.array(zId).min(1).max(MAX_WALLS) }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx),
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) delete scene.walls[id];
    },
  }),

  'wall.clear': defineAction({
    schema: z.object({ sceneId: zId }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx),
    apply: (s, p) => {
      s.scenes[p.sceneId]!.walls = {};
    },
  }),

  // Lights -------------------------------------------------------------------
  'light.create': defineAction({
    schema: z.object({ sceneId: zId, light: zLightSource.omit({ id: true }) }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx),
    apply: (s, p, ctx) => {
      const id = ctx.newId();
      s.scenes[p.sceneId]!.lights[id] = { id, ...p.light };
      return { id };
    },
  }),

  'light.update': defineAction({
    schema: z.object({ sceneId: zId, id: zId, patch: zLightSource.omit({ id: true }).partial() }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx) ?? (s.scenes[p.sceneId]!.lights[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      Object.assign(s.scenes[p.sceneId]!.lights[p.id]!, p.patch);
    },
  }),

  'light.delete': defineAction({
    schema: z.object({ sceneId: zId, ids: z.array(zId).min(1).max(500) }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx),
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) delete scene.lights[id];
    },
  }),

  // Drawings -----------------------------------------------------------------
  'drawing.create': defineAction({
    schema: z.object({ sceneId: zId, drawing: zDrawing.omit({ id: true, authorId: true }) }),
    rate: 60,
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      if (isDM(ctx)) return null;
      if (!s.settings.playerDrawing) return 'O Mestre desativou desenhos de jogadores.';
      if (p.drawing.gmOnly) return DM_ONLY;
      return Object.keys(scene.drawings).length > 3000 ? 'Limite de desenhos atingido.' : null;
    },
    apply: (s, p, ctx) => {
      const id = ctx.newId();
      s.scenes[p.sceneId]!.drawings[id] = { id, authorId: ctx.actor.id, ...p.drawing };
      return { id };
    },
  }),

  'drawing.update': defineAction({
    schema: z.object({ sceneId: zId, id: zId, patch: zDrawing.omit({ id: true, authorId: true }).partial() }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      const d = scene.drawings[p.id];
      if (!d) return NOT_FOUND;
      return isDM(ctx) || d.authorId === ctx.actor.id ? null : 'Você só pode editar seus desenhos.';
    },
    apply: (s, p) => {
      Object.assign(s.scenes[p.sceneId]!.drawings[p.id]!, p.patch);
    },
  }),

  'drawing.delete': defineAction({
    schema: z.object({ sceneId: zId, ids: z.array(zId).min(1).max(3000) }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      if (isDM(ctx)) return null;
      return p.ids.every((id) => scene.drawings[id]?.authorId === ctx.actor.id) ? null : 'Você só pode apagar seus desenhos.';
    },
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) delete scene.drawings[id];
    },
  }),

  'drawing.clear': defineAction({
    schema: z.object({ sceneId: zId, onlyMine: z.boolean() }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      return isDM(ctx) || p.onlyMine ? null : DM_ONLY;
    },
    apply: (s, p, ctx) => {
      const scene = s.scenes[p.sceneId]!;
      for (const d of Object.values(scene.drawings)) {
        if (!p.onlyMine || d.authorId === ctx.actor.id) delete scene.drawings[d.id];
      }
    },
  }),

  // Area templates -----------------------------------------------------------
  'template.create': defineAction({
    schema: z.object({ sceneId: zId, template: zTemplate.omit({ id: true, authorId: true }) }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      if (!isDM(ctx) && !s.settings.playerTemplates) return 'O Mestre desativou áreas de efeito de jogadores.';
      return Object.keys(scene.templates).length > 200 ? 'Muitas áreas na cena.' : null;
    },
    apply: (s, p, ctx) => {
      const id = ctx.newId();
      s.scenes[p.sceneId]!.templates[id] = { id, authorId: ctx.actor.id, ...p.template };
      return { id };
    },
  }),

  'template.update': defineAction({
    schema: z.object({ sceneId: zId, id: zId, patch: zTemplate.omit({ id: true, authorId: true }).partial() }),
    rate: 80,
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      const t = scene.templates[p.id];
      if (!t) return NOT_FOUND;
      return isDM(ctx) || t.authorId === ctx.actor.id ? null : 'Essa área não é sua.';
    },
    apply: (s, p) => {
      Object.assign(s.scenes[p.sceneId]!.templates[p.id]!, p.patch);
    },
  }),

  'template.delete': defineAction({
    schema: z.object({ sceneId: zId, ids: z.array(zId).min(1).max(200) }),
    permit: (s, p, ctx) => {
      const scene = sceneFor(s, p.sceneId, ctx);
      if (typeof scene === 'string') return scene;
      if (isDM(ctx)) return null;
      return p.ids.every((id) => scene.templates[id]?.authorId === ctx.actor.id) ? null : 'Essa área não é sua.';
    },
    apply: (s, p) => {
      const scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) delete scene.templates[id];
    },
  }),

  // Notes ----------------------------------------------------------------------
  'note.create': defineAction({
    schema: z.object({ sceneId: zId, note: zNote.omit({ id: true }) }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx),
    apply: (s, p, ctx) => {
      const id = ctx.newId();
      s.scenes[p.sceneId]!.notes[id] = { id, ...p.note };
      return { id };
    },
  }),

  'note.update': defineAction({
    schema: z.object({ sceneId: zId, id: zId, patch: zNote.omit({ id: true }).partial() }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx) ?? (s.scenes[p.sceneId]!.notes[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      Object.assign(s.scenes[p.sceneId]!.notes[p.id]!, p.patch);
    },
  }),

  'note.delete': defineAction({
    schema: z.object({ sceneId: zId, ids: z.array(zId).min(1).max(500) }),
    permit: (s, p, ctx) => dmScene(s, p.sceneId, ctx),
    apply: (s, p) => {
      const scene: Scene = s.scenes[p.sceneId]!;
      for (const id of p.ids) delete scene.notes[id];
    },
  }),
};

export { dmOnly };
