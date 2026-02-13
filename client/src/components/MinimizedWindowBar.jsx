import React from 'react';
import { useWindowManager } from '../contexts/WindowManagerContext';
import '../styles/FloatingWindow.css';

/**
 * MinimizedWindowBar - Shows minimized windows as pills at the bottom of screen
 */
export default function MinimizedWindowBar() {
  const { windows, restoreWindow } = useWindowManager();

  // Get all minimized windows
  const minimizedWindows = Object.values(windows).filter(
    w => w.isOpen && w.isMinimized
  );

  // Don't render if no minimized windows
  if (minimizedWindows.length === 0) {
    return null;
  }

  return (
    <div className="minimized-window-bar">
      {minimizedWindows.map(window => (
        <button
          key={window.id}
          className="minimized-pill"
          onClick={() => restoreWindow(window.id)}
          title={`Restaurar ${window.title}`}
        >
          <span className="minimized-pill-icon">{window.icon || '📄'}</span>
          <span className="minimized-pill-title">{window.title}</span>
        </button>
      ))}
    </div>
  );
}
