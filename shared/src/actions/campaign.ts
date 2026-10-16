// Journal, audio, settings, custom system and player profile actions.
import { z } from 'zod';
import { zColor, zCustomSystem, zId, zJournal, zPlaylist, zUrl } from '../schemas.ts';
import { defineAction, DM_ONLY, dmOnly, isDM, NOT_FOUND } from './define.ts';

export const campaignActions = {
  'campaign.rename': defineAction({
    schema: z.object({ name: z.string().min(1).max(80) }),
    permit: dmOnly,
    apply: (s, p) => {
      s.name = p.name;
    },
  }),

  'settings.update': defineAction({
    schema: z.object({
      playerDrawing: z.boolean(),
      playerTemplates: z.boolean(),
      wallsBlockMovement: z.boolean(),
      hpStatusForPlayers: z.boolean(),
      autoRollNpcInitiative: z.boolean(),
      dice3d: z.boolean(),
      system: z.enum(['dnd5e', 'custom']),
    }).partial(),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (p.system === 'custom' && !s.customSystem ? 'Importe um sistema antes de ativá-lo.' : null),
    apply: (s, p) => {
      Object.assign(s.settings, p);
    },
  }),

  // Custom system --------------------------------------------------------------
  /** Save the DM's imported system (from the AI importer or a JSON file) and switch the sheets to it. */
  'system.save': defineAction({
    schema: z.object({ system: zCustomSystem, activate: z.boolean().optional() }),
    rate: 10,
    permit: dmOnly,
    apply: (s, p, ctx) => {
      const replacing = !!s.customSystem;
      s.customSystem = p.system;
      // Sheets keep their values by key; missing ones fall back to the system defaults when read.
      if (p.activate ?? true) {
        s.settings.system = 'custom';
        ctx.chat.post({ kind: 'system', text: `📜 Sistema ${replacing ? 'atualizado' : 'ativado'}: ${p.system.name}. As fichas agora usam as regras dele.` });
      }
      return { name: p.system.name };
    },
  }),

  'system.clear': defineAction({
    schema: z.object({}),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.customSystem ? null : 'Não há sistema customizado.'),
    apply: (s, _p, ctx) => {
      const wasActive = s.settings.system === 'custom';
      s.customSystem = null;
      s.settings.system = 'dnd5e';
      if (wasActive) ctx.chat.post({ kind: 'system', text: '📕 Sistema customizado removido. As fichas voltaram ao D&D 5e.' });
    },
  }),

  'player.update': defineAction({
    schema: z.object({
      playerId: zId.optional(),
      name: z.string().min(1).max(40).optional(),
      color: zColor.optional(),
      avatar: zUrl.optional(),
      characterId: zId.nullable().optional(),
    }),
    permit: (s, p, ctx) => {
      const target = p.playerId ?? ctx.actor.id;
      if (!s.players[target]) return NOT_FOUND;
      if (target !== ctx.actor.id && !isDM(ctx)) return DM_ONLY;
      if (p.characterId) {
        const c = s.characters[p.characterId];
        if (!c) return NOT_FOUND;
        if (!isDM(ctx) && c.ownerId !== ctx.actor.id) return 'Esse personagem não é seu.';
      }
      if (p.name) {
        const taken = Object.values(s.players).some((x) => x.id !== target && x.name.toLowerCase() === p.name!.toLowerCase());
        if (taken) return 'Esse nome já está em uso na mesa.';
      }
      return null;
    },
    apply: (s, p, ctx) => {
      const pl = s.players[p.playerId ?? ctx.actor.id]!;
      if (p.name) pl.name = p.name;
      if (p.color) pl.color = p.color;
      if (p.avatar !== undefined) pl.avatar = p.avatar;
      if (p.characterId !== undefined) pl.characterId = p.characterId;
    },
  }),

  'player.remove': defineAction({
    schema: z.object({ playerId: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.players[p.playerId]?.role === 'player' ? null : 'Não é possível remover.'),
    apply: (s, p) => {
      delete s.players[p.playerId];
      for (const c of Object.values(s.characters)) if (c.ownerId === p.playerId) c.ownerId = null;
    },
  }),

  // Journal ---------------------------------------------------------------------
  'journal.create': defineAction({
    schema: z.object({ entry: zJournal.omit({ id: true, authorId: true, updatedAt: true }).partial() }),
    permit: dmOnly,
    apply: (s, p, ctx) => {
      const id = ctx.newId();
      s.journal[id] = {
        id,
        title: p.entry.title ?? 'Nova página',
        body: p.entry.body ?? '',
        img: p.entry.img ?? null,
        folder: p.entry.folder ?? '',
        sharedWith: p.entry.sharedWith ?? [],
        authorId: ctx.actor.id,
        updatedAt: ctx.now,
      };
      return { id };
    },
  }),

  'journal.update': defineAction({
    schema: z.object({ id: zId, patch: zJournal.omit({ id: true, authorId: true, updatedAt: true }).partial() }),
    rate: 120,
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.journal[p.id] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      Object.assign(s.journal[p.id]!, p.patch, { updatedAt: ctx.now });
    },
  }),

  'journal.delete': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.journal[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      delete s.journal[p.id];
      for (const scene of Object.values(s.scenes)) {
        for (const n of Object.values(scene.notes)) if (n.journalId === p.id) n.journalId = null;
      }
    },
  }),

  /** Pop a handout open on every player's screen (also shares it with everyone). */
  'journal.show': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.journal[p.id] ? null : NOT_FOUND),
    apply: (s, p, ctx) => {
      s.journal[p.id]!.sharedWith = 'all';
      ctx.fx({ type: 'handout', journalId: p.id });
      ctx.fx({ type: 'sfx', id: 'page' });
    },
  }),

  // Audio ------------------------------------------------------------------------
  'audio.music': defineAction({
    schema: z.object({
      track: z.object({
        trackId: zId, playlistId: zId.nullable(), src: z.string().max(2_000), name: z.string().max(120),
        loop: z.boolean(), volume: z.number().min(0).max(1),
      }).nullable(),
    }),
    permit: dmOnly,
    apply: (s, p, ctx) => {
      s.audio.music = p.track ? { ...p.track, startedAt: ctx.now } : null;
    },
  }),

  'audio.musicVolume': defineAction({
    schema: z.object({ volume: z.number().min(0).max(1) }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.audio.music ? null : 'Nada tocando.'),
    apply: (s, p) => {
      s.audio.music!.volume = p.volume;
    },
  }),

  'audio.ambience': defineAction({
    schema: z.object({ layers: z.record(z.string().max(40), z.object({ volume: z.number().min(0).max(1) })) }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (Object.keys(p.layers).length > 6 ? 'Máximo de 6 camadas de ambiente.' : null),
    apply: (s, p) => {
      s.audio.ambience = p.layers;
    },
  }),

  'audio.master': defineAction({
    schema: z.object({ volume: z.number().min(0).max(1) }),
    permit: dmOnly,
    apply: (s, p) => {
      s.audio.masterVolume = p.volume;
    },
  }),

  'audio.playlist.save': defineAction({
    schema: z.object({ playlist: zPlaylist }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (Object.keys(s.audio.playlists).length > 100 ? 'Playlists demais.' : null),
    apply: (s, p) => {
      s.audio.playlists[p.playlist.id] = p.playlist;
    },
  }),

  'audio.playlist.delete': defineAction({
    schema: z.object({ id: zId }),
    permit: (s, p, ctx) => dmOnly(s, p, ctx) ?? (s.audio.playlists[p.id] ? null : NOT_FOUND),
    apply: (s, p) => {
      delete s.audio.playlists[p.id];
    },
  }),

  'audio.sfx': defineAction({
    schema: z.object({ id: z.string().max(40) }),
    rate: 20,
    permit: dmOnly,
    apply: (_s, p, ctx) => {
      ctx.fx({ type: 'sfx', id: p.id });
    },
  }),
};
