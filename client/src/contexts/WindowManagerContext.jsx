import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const WindowManagerContext = createContext(null);

const STORAGE_KEY = 'rpg-vtt-windows';

// Default window configurations
const DEFAULT_WINDOWS = {
  leftPanel: {
    id: 'leftPanel',
    title: 'Jogadores & Cenas',
    icon: '👥',
    isOpen: true,
    isMinimized: false,
    defaultPosition: { x: 16, y: 72 },
    defaultSize: { width: 320, height: 600 },
    minSize: { width: 280, height: 300 },
  },
  rightPanel: {
    id: 'rightPanel', 
    title: 'Chat & Dados',
    icon: '💬',
    isOpen: true,
    isMinimized: false,
    defaultPosition: { x: -356, y: 72 }, // Negative means from right edge
    defaultSize: { width: 340, height: 600 },
    minSize: { width: 300, height: 300 },
  },
  initiative: {
    id: 'initiative',
    title: 'Iniciativa',
    icon: '⚔️',
    isOpen: false,
    isMinimized: false,
    defaultPosition: { x: 16, y: 72 },
    defaultSize: { width: 300, height: 500 },
    minSize: { width: 280, height: 200 },
  },
  dmDashboard: {
    id: 'dmDashboard',
    title: 'Painel do Mestre',
    icon: '👑',
    isOpen: false,
    isMinimized: false,
    defaultPosition: { x: 100, y: 100 },
    defaultSize: { width: 1000, height: 700 },
    minSize: { width: 600, height: 400 },
  },
};

// Windows that should always start closed (regardless of localStorage)
const ALWAYS_START_CLOSED = ['initiative', 'dmDashboard'];
// Windows that should always start open (regardless of localStorage)
const ALWAYS_START_OPEN = ['leftPanel', 'rightPanel'];

export function WindowManagerProvider({ children }) {
  const [windows, setWindows] = useState(() => {
    // Load from localStorage or use defaults
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Merge with defaults to handle new windows
        const merged = { ...DEFAULT_WINDOWS, ...parsed };
        
        // Force certain windows to start closed (keep position/size from localStorage)
        ALWAYS_START_CLOSED.forEach(windowId => {
          if (merged[windowId]) {
            merged[windowId] = {
              ...merged[windowId],
              isOpen: false,
              isMinimized: false,
            };
          }
        });
        
        // Force certain windows to always start open (keep position/size from localStorage)
        ALWAYS_START_OPEN.forEach(windowId => {
          if (merged[windowId]) {
            merged[windowId] = {
              ...merged[windowId],
              isOpen: true,
              isMinimized: false,
            };
          }
        });
        
        return merged;
      }
    } catch (e) {
      console.warn('Failed to load window state:', e);
    }
    return DEFAULT_WINDOWS;
  });

  const [topZIndex, setTopZIndex] = useState(100);

  // Save to localStorage whenever windows change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(windows));
    } catch (e) {
      console.warn('Failed to save window state:', e);
    }
  }, [windows]);

  // Open a window
  const openWindow = useCallback((windowId) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        isOpen: true,
        isMinimized: false,
        zIndex: topZIndex + 1,
      }
    }));
    setTopZIndex(z => z + 1);
  }, [topZIndex]);

  // Close a window
  const closeWindow = useCallback((windowId) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        isOpen: false,
        isMinimized: false,
      }
    }));
  }, []);

  // Toggle window open/close
  const toggleWindow = useCallback((windowId) => {
    setWindows(prev => {
      const window = prev[windowId];
      if (!window) return prev;
      
      if (window.isOpen && !window.isMinimized) {
        return {
          ...prev,
          [windowId]: { ...window, isOpen: false }
        };
      } else {
        return {
          ...prev,
          [windowId]: { 
            ...window, 
            isOpen: true, 
            isMinimized: false,
            zIndex: topZIndex + 1 
          }
        };
      }
    });
    setTopZIndex(z => z + 1);
  }, [topZIndex]);

  // Minimize a window
  const minimizeWindow = useCallback((windowId) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        isMinimized: true,
      }
    }));
  }, []);

  // Restore a minimized window
  const restoreWindow = useCallback((windowId) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        isMinimized: false,
        zIndex: topZIndex + 1,
      }
    }));
    setTopZIndex(z => z + 1);
  }, [topZIndex]);

  // Focus a window (bring to front)
  const focusWindow = useCallback((windowId) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        zIndex: topZIndex + 1,
      }
    }));
    setTopZIndex(z => z + 1);
  }, [topZIndex]);

  // Update window position
  const updatePosition = useCallback((windowId, position) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        position,
      }
    }));
  }, []);

  // Update window size
  const updateSize = useCallback((windowId, size) => {
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        size,
      }
    }));
  }, []);

  // Reset window to default position and size
  const resetWindow = useCallback((windowId) => {
    const defaults = DEFAULT_WINDOWS[windowId];
    if (!defaults) return;
    
    setWindows(prev => ({
      ...prev,
      [windowId]: {
        ...prev[windowId],
        position: undefined, // Will use defaultPosition
        size: undefined, // Will use defaultSize
      }
    }));
  }, []);

  // Reset all windows
  const resetAllWindows = useCallback(() => {
    setWindows(DEFAULT_WINDOWS);
    setTopZIndex(100);
  }, []);

  // Get window state
  const getWindow = useCallback((windowId) => {
    return windows[windowId] || null;
  }, [windows]);

  // Get all minimized windows
  const getMinimizedWindows = useCallback(() => {
    return Object.values(windows).filter(w => w.isOpen && w.isMinimized);
  }, [windows]);

  // Register a dynamic window (like character sheets)
  const registerWindow = useCallback((windowId, config) => {
    setWindows(prev => {
      if (prev[windowId]) return prev;
      return {
        ...prev,
        [windowId]: {
          id: windowId,
          isOpen: true,
          isMinimized: false,
          zIndex: topZIndex + 1,
          ...config,
        }
      };
    });
    setTopZIndex(z => z + 1);
  }, [topZIndex]);

  // Unregister a dynamic window
  const unregisterWindow = useCallback((windowId) => {
    setWindows(prev => {
      const { [windowId]: removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const value = {
    windows,
    topZIndex,
    openWindow,
    closeWindow,
    toggleWindow,
    minimizeWindow,
    restoreWindow,
    focusWindow,
    updatePosition,
    updateSize,
    resetWindow,
    resetAllWindows,
    getWindow,
    getMinimizedWindows,
    registerWindow,
    unregisterWindow,
  };

  return (
    <WindowManagerContext.Provider value={value}>
      {children}
    </WindowManagerContext.Provider>
  );
}

export function useWindowManager() {
  const context = useContext(WindowManagerContext);
  if (!context) {
    throw new Error('useWindowManager must be used within WindowManagerProvider');
  }
  return context;
}

export default WindowManagerContext;
