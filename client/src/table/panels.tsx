// Sidebar tab registry. Each panel is lazy-loaded from its feature folder.
import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react';
import {
  BookOpen, Library, Map as MapIcon, MessageSquare, Music, ScrollText, Settings2, Sparkles, Swords, Users,
} from 'lucide-react';
import type { SidebarTab } from '../store/ui.ts';

export interface PanelDef {
  id: SidebarTab;
  label: string;
  icon: ReactNode;
  dmOnly?: boolean;
  component: LazyExoticComponent<ComponentType>;
}

export const PANELS: PanelDef[] = [
  { id: 'chat', label: 'Chat', icon: <MessageSquare />, component: lazy(() => import('../features/chat/ChatPanel.tsx')) },
  { id: 'character', label: 'Personagem', icon: <ScrollText />, component: lazy(() => import('../features/character/CharacterPanel.tsx')) },
  { id: 'combat', label: 'Combate', icon: <Swords />, component: lazy(() => import('../features/combat/CombatPanel.tsx')) },
  { id: 'compendium', label: 'Compêndio', icon: <Library />, component: lazy(() => import('../features/compendium/CompendiumPanel.tsx')) },
  { id: 'journal', label: 'Diário', icon: <BookOpen />, component: lazy(() => import('../features/journal/JournalPanel.tsx')) },
  { id: 'audio', label: 'Áudio', icon: <Music />, component: lazy(() => import('../features/audio/AudioPanel.tsx')) },
  { id: 'oracle', label: 'Oráculo', icon: <Sparkles />, dmOnly: true, component: lazy(() => import('../features/oracle/OraclePanel.tsx')) },
  { id: 'scenes', label: 'Cenas', icon: <MapIcon />, dmOnly: true, component: lazy(() => import('../features/dm/ScenesPanel.tsx')) },
  { id: 'players', label: 'Mesa', icon: <Users />, component: lazy(() => import('../features/dm/PlayersPanel.tsx')) },
  { id: 'settings', label: 'Ajustes', icon: <Settings2 />, component: lazy(() => import('../features/dm/SettingsPanel.tsx')) },
];
