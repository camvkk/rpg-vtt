import { lazy, Suspense, useEffect } from 'react';
import { useGame } from '../store/game.ts';
import { useActiveCustomSystem } from '../store/hooks.ts';
import { useUi } from '../store/ui.ts';
import { TableCanvas } from '../engine/TableCanvas.tsx';
import { TopBar } from './TopBar.tsx';
import { ToolRail } from './ToolRail.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Hotbar } from './Hotbar.tsx';
import { CombatBar } from '../features/combat/CombatBar.tsx';
import { TokenHud } from './TokenHud.tsx';
import { FxLayer } from './FxLayer.tsx';
import { Hints } from './Hints.tsx';
import { SheetWindows } from '../features/character/SheetWindows.tsx';
import { useShortcuts } from './shortcuts.ts';
import './table.css';

const SceneSettingsModal = lazy(() => import('../features/dm/SceneSettingsModal.tsx'));
const CharacterWizard = lazy(() => import('../features/character/CharacterWizard.tsx'));
const CustomCharacterCreate = lazy(() => import('../features/character/CustomCharacterCreate.tsx'));
const HandoutModal = lazy(() => import('../features/journal/HandoutModal.tsx'));

export default function Table() {
  const status = useGame((s) => s.status);
  const sidebarOpen = useUi((s) => s.sidebarOpen);
  const sceneSettingsId = useUi((s) => s.sceneSettingsId);
  const wizardOpen = useUi((s) => s.wizardOpen);
  const handoutId = useUi((s) => s.handoutId);
  const customSystem = useActiveCustomSystem();
  useShortcuts();

  useEffect(() => {
    document.body.classList.add('in-table');
    return () => document.body.classList.remove('in-table');
  }, []);

  return (
    <div className="table" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      <TableCanvas />
      <div className="table__overlay">
        <TopBar />
        <CombatBar />
        <ToolRail />
        <TokenHud />
        <Hints />
        <Hotbar />
        <Sidebar />
        <SheetWindows />
      </div>
      <FxLayer />
      {status !== 'online' && (
        <div className="table__conn" role="status">
          <span className="spinner" />
          {status === 'offline' ? 'Desconectado — tentando reconectar…' : 'Reconectando…'}
        </div>
      )}
      <Suspense fallback={null}>
        {sceneSettingsId && <SceneSettingsModal sceneId={sceneSettingsId} onClose={() => useUi.getState().set({ sceneSettingsId: null })} />}
        {wizardOpen && (customSystem
          ? <CustomCharacterCreate system={customSystem} onClose={() => useUi.getState().set({ wizardOpen: false })} />
          : <CharacterWizard onClose={() => useUi.getState().set({ wizardOpen: false })} />)}
        {handoutId && <HandoutModal journalId={handoutId} onClose={() => useUi.getState().set({ handoutId: null })} />}
      </Suspense>
    </div>
  );
}
