import { useState, useRef, useEffect } from 'react';
import { useTheme, THEMES } from '../contexts/ThemeContext';
import './ThemeSelector.css';

export default function ThemeSelector({ position = 'bottom-right', compact = false }) {
  const { theme, themeInfo, setTheme, cycleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close on escape key
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (compact) {
    // Compact mode: just a button that cycles through themes
    return (
      <button 
        className="theme-selector-compact"
        onClick={cycleTheme}
        title={`Tema: ${themeInfo.name} (clique para trocar)`}
      >
        {themeInfo.icon}
      </button>
    );
  }

  return (
    <div className={`theme-selector ${position}`} ref={menuRef}>
      <button 
        className="theme-selector-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="theme-icon">{themeInfo.icon}</span>
        <span className="theme-name">{themeInfo.name}</span>
        <span className="theme-arrow">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="theme-selector-menu" role="menu">
          <div className="theme-menu-header">
            <span>🎨</span>
            <span>Escolher Tema</span>
          </div>
          
          {Object.values(THEMES).map((t) => (
            <button
              key={t.id}
              className={`theme-option ${theme === t.id ? 'active' : ''}`}
              onClick={() => {
                setTheme(t.id);
                setIsOpen(false);
              }}
              role="menuitem"
            >
              <span className="option-icon">{t.icon}</span>
              <div className="option-info">
                <span className="option-name">{t.name}</span>
                <span className="option-desc">{t.description}</span>
              </div>
              {theme === t.id && <span className="option-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
