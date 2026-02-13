import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const THEMES = {
  classic: {
    id: 'classic',
    name: 'Clássico',
    icon: '🏰',
    description: 'Dark fantasy com tons dourados'
  },
  soft: {
    id: 'soft', 
    name: 'Suave',
    icon: '🌸',
    description: 'Tons de rosa e lilás'
  },
  light: {
    id: 'light',
    name: 'Claro',
    icon: '☀️',
    description: 'Visual limpo e iluminado'
  }
};

const STORAGE_KEY = 'rpg-vtt-theme';
const DEFAULT_THEME = 'classic';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    // Carregar tema do localStorage ou usar padrão
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && THEMES[saved]) {
        return saved;
      }
    } catch (e) {
      console.warn('Failed to load theme from localStorage:', e);
    }
    return DEFAULT_THEME;
  });

  // Aplicar classe no body quando tema mudar
  useEffect(() => {
    const body = document.body;
    
    // Remover classes de tema anteriores
    Object.keys(THEMES).forEach(t => {
      body.classList.remove(`theme-${t}`);
    });
    
    // Adicionar classe do tema atual
    body.classList.add(`theme-${theme}`);
    
    // Salvar no localStorage
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      console.warn('Failed to save theme to localStorage:', e);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme) => {
    if (THEMES[newTheme]) {
      setThemeState(newTheme);
    } else {
      console.warn(`Unknown theme: ${newTheme}`);
    }
  }, []);

  const cycleTheme = useCallback(() => {
    const themeKeys = Object.keys(THEMES);
    const currentIndex = themeKeys.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themeKeys.length;
    setThemeState(themeKeys[nextIndex]);
  }, [theme]);

  const value = {
    theme,
    themeInfo: THEMES[theme],
    themes: THEMES,
    setTheme,
    cycleTheme
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export { THEMES };
