// Local UI state (not shared): tools, selection, targets, panels, windows.
import { create } from 'zustand';
import type { DrawingKind, ID, TemplateKind, WallKind } from '@shared/types.ts';
import { getPref, setPref } from '../net/session.ts';

export type Tool = 'select' | 'measure' | 'ping' | 'draw' | 'template' | 'wall' | 'light' | 'fog' | 'note';
export type SidebarTab = 'chat' | 'character' | 'combat' | 'compendium' | 'journal' | 'audio' | 'oracle' | 'system' | 'scenes' | 'players' | 'settings';
export type RollMode = 'normal' | 'adv' | 'dis';

export interface ToolOptions {
  draw: { kind: DrawingKind; stroke: string; width: number; fill: boolean; gmOnly: boolean };
  template: { kind: TemplateKind; size: number; width: number; color: string; spellId: string | null; label: string };
  wall: { kind: WallKind; snap: boolean; chain: boolean };
  fog: { op: 'reveal' | 'hide'; shape: 'rect' | 'poly' | 'circle' };
  light: { preset: string };
}

interface UiStore {
  tool: Tool;
  toolOpts: ToolOptions;
  selection: ID[];
  targets: ID[];
  hoverTokenId: ID | null;
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  /** Character sheets open as floating windows. */
  sheets: ID[];
  rollMode: RollMode;
  /** Scene the DM is looking at (may differ from the active one). */
  viewSceneId: ID | null;
  sceneSettingsId: ID | null;
  wizardOpen: boolean;
  handoutId: ID | null;
  /** Player chose to see the map as a token (DM vision preview). */
  visionPreviewTokenId: ID | null;
  muted: boolean;
  pendingDice: Record<string, true>;

  setTool(t: Tool): void;
  setToolOpts<K extends keyof ToolOptions>(k: K, v: Partial<ToolOptions[K]>): void;
  select(ids: ID[], additive?: boolean): void;
  toggleTarget(id: ID): void;
  setTargets(ids: ID[]): void;
  setHover(id: ID | null): void;
  openSidebar(tab?: SidebarTab): void;
  toggleSidebar(): void;
  openSheet(id: ID): void;
  closeSheet(id: ID): void;
  setRollMode(m: RollMode): void;
  set(patch: Partial<UiStore>): void;
  addPendingDice(id: string): void;
  resolveDice(id: string): void;
}

export const useUi = create<UiStore>((set, get) => ({
  tool: 'select',
  toolOpts: {
    draw: { kind: 'path', stroke: '#e0b45a', width: 4, fill: false, gmOnly: false },
    template: { kind: 'circle', size: 20, width: 5, color: '#e2554d', spellId: null, label: '' },
    wall: { kind: 'wall', snap: true, chain: true },
    fog: { op: 'reveal', shape: 'rect' },
    light: { preset: 'torch' },
  },
  selection: [],
  targets: [],
  hoverTokenId: null,
  sidebarOpen: getPref('sidebarOpen', window.innerWidth > 900),
  sidebarTab: 'chat',
  sheets: [],
  rollMode: 'normal',
  viewSceneId: null,
  sceneSettingsId: null,
  wizardOpen: false,
  handoutId: null,
  visionPreviewTokenId: null,
  muted: getPref('muted', false),
  pendingDice: {},

  setTool: (tool) => set({ tool }),
  setToolOpts: (k, v) => set({ toolOpts: { ...get().toolOpts, [k]: { ...get().toolOpts[k], ...v } } }),
  select: (ids, additive) => {
    if (!additive) return set({ selection: ids });
    const cur = new Set(get().selection);
    for (const id of ids) {
      if (cur.has(id)) cur.delete(id);
      else cur.add(id);
    }
    set({ selection: [...cur] });
  },
  toggleTarget: (id) => {
    const t = get().targets;
    set({ targets: t.includes(id) ? t.filter((x) => x !== id) : [...t, id] });
  },
  setTargets: (targets) => set({ targets }),
  setHover: (hoverTokenId) => set({ hoverTokenId }),
  openSidebar: (tab) => {
    setPref('sidebarOpen', true);
    set({ sidebarOpen: true, sidebarTab: tab ?? get().sidebarTab });
  },
  toggleSidebar: () => {
    setPref('sidebarOpen', !get().sidebarOpen);
    set({ sidebarOpen: !get().sidebarOpen });
  },
  openSheet: (id) => {
    const sheets = get().sheets.filter((x) => x !== id);
    set({ sheets: [...sheets, id].slice(-4) });
  },
  closeSheet: (id) => set({ sheets: get().sheets.filter((x) => x !== id) }),
  setRollMode: (rollMode) => set({ rollMode }),
  set: (patch) => set(patch),
  addPendingDice: (id) => set({ pendingDice: { ...get().pendingDice, [id]: true } }),
  resolveDice: (id) => {
    const next = { ...get().pendingDice };
    delete next[id];
    set({ pendingDice: next });
  },
}));
