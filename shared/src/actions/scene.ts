import { z } from 'zod';
import { createScene } from '../defaults.ts';
import { zFogArea, zGrid, zId, zName, zShape, zUrl } from '../schemas.ts';
import type { Scene } from '../types.ts';
import { defineAction, dmOnly, NOT_FOUND } from './define.ts';

const zScenePatch = z.object({
  name: zName.optional(),
  hidden: z.boolean().optional(),
  map: z.object({
    url: zUrl,
    width: z.number().min(100).max(40_000),
    height: z.number().min(100).max(40_000),
    scale: z.number().min(0.05).max(20),
    background: z.string().max(20),
  }).partial().optional(),
  grid: zGrid.partial().optional(),
  lighting: z.object({ darkness: z.number().min(0).max(1), globalLight: z.boolean() }).partial().optional(),
  fog: z.object({ mode: z.enum(['off', 'dynamic', 'manual']), exploration: z.boolean() }).partial().optional(),
  weather: z.object({
    type: z.enum(['none', 'rain', 'storm', 'snow', 'fog', 'embers', 'ash', 'leaves', 'sandstorm']),
    intensity: z.number().min(0).max(1),
    wind: z.number().min(-360).max(360),
  }).partial().optional(),
  ambience: z.string().max(40).nullable().optional(),
  view: z.object({ x: z.number(), y: z.number(), zoom: z.number().min(0.05).max(10) }).nullable().optional(),
});

function applyScenePatch(scene: Scene, patch: z.output<typeof zScenePatch>): void {
  if (patch.name !== undefined) scene.name = patch.name;
  if (patch.hidden !== undefined) scene.hidden = patch.hidden;
  if (patch.map) Object.assign(scene.map, patch.map);
  if (patch.grid) Object.assign(scene.grid, patch.grid);
  if (patch.lighting) Object.assign(scene.lighting, patch.lighting);
  if (patch.fog) Object.assign(scene.fog, patch.fog);
  if (patch.weather) Object.assign(scene.weather, patch.weather);
  if (patch.ambience !== undefined) scene.ambience = patch.ambience;
  if (patch.view !== undefined) scene.view = patch.view;
}

export const sceneActions = {
  'scene.create': defineAction({
    schema: z.object({ name: zName, patch: zScenePatch.optional(), activate: z.boolean().optional() }),
    permit: dmOnly,
    apply: (s, p) => {
      const scene = createScene(p.name || 'Nova cena');
      if (p.patch) applyScenePatch(scene, p.patch);
      s.scenes[scene.id] = scene;
      s.sceneOrder.push(scene.id);
      if (p.activate) s.activeSceneId = scene.id;
      return { id: scene.id };
    },
  }),

  'scene.update': defineAction({
    schema: z.object({ id: zId, patch: zScenePatch }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      applyScenePatch(s.scenes[p.id]!, p.patch);
    },
  }),

  'scene.duplicate': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.id] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      const src = s.scenes[p.id]!;
      const copy: Scene = structuredClone({ ...src, id: ctx.newId(), name: `${src.name} (cópia)` });
      s.scenes[copy.id] = copy;
      s.sceneOrder.splice(s.sceneOrder.indexOf(p.id) + 1, 0, copy.id);
      return { id: copy.id };
    },
  }),

  'scene.delete': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) =>
      dmOnly(s, p, ctx) ?? (!s.scenes[p.id] ? NOT_FOUND : s.sceneOrder.length <= 1 ? 'A campanha precisa de pelo menos uma cena.' : null),
    apply: (s, p) => {
      delete s.scenes[p.id];
      s.sceneOrder = s.sceneOrder.filter((x) => x !== p.id);
      if (s.activeSceneId === p.id) s.activeSceneId = s.sceneOrder[0] ?? null;
      if (s.combat?.sceneId === p.id) s.combat = null;
    },
  }),

  'scene.activate': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.id] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      s.activeSceneId = p.id;
      const scene = s.scenes[p.id]!;
      scene.hidden = false;
      if (scene.ambience) {
        s.audio.ambience = { [scene.ambience]: { volume: 0.6 } };
      }
      ctx.chat.post({ kind: 'system', text: `Cena: ${scene.name}` });
    },
  }),

  'scene.reorder': defineAction({
    schema: z.object({ order: z.array(zId).max(500) }),
    permit: dmOnly,
    apply: (s, p) => {
      const known = new Set(s.sceneOrder);
      const next = p.order.filter((id) => known.has(id));
      for (const id of s.sceneOrder) if (!next.includes(id)) next.push(id);
      s.sceneOrder = next;
    },
  }),

  // Fog of war (manual areas) ----------------------------------------------
  'fog.add': defineAction({
    schema: z.object({ sceneId: zId, area: zFogArea.omit({ id: true }) }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.sceneId] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      const fog = s.scenes[p.sceneId]!.fog;
      fog.areas.push({ id: ctx.newId(), ...p.area });
      if (fog.areas.length > 600) fog.areas.splice(0, fog.areas.length - 600);
      if (fog.mode === 'off') fog.mode = 'manual';
    },
  }),

  'fog.reset': defineAction({
    schema: z.object({ sceneId: zId, to: z.enum(['hidden', 'revealed']) }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.sceneId] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      const scene = s.scenes[p.sceneId]!;
      scene.fog.areas = p.to === 'hidden'
        ? []
        : [{ id: ctx.newId(), op: 'reveal', shape: { kind: 'rect', x: -50_000, y: -50_000, w: 100_000, h: 100_000 } }];
    },
  }),

  'fog.undo': defineAction({
    schema: z.object({ sceneId: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.scenes[p.sceneId] ? null : NOT_FOUND),
    apply: (s, p) => {
      s.scenes[p.sceneId]!.fog.areas.pop();
    },
  }),
};

export { zShape };
