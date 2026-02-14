import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import DockTab from './DockTab';
import './Dock.css';

/**
 * Dock - Bottom floating bar inspired by Owlbear Rodeo 2.0
 * Replaces traditional sidebars with a modern, expandable dock
 */

const TABS = [
  { id: 'tokens', icon: '🎭', label: 'Tokens', shortcut: '1' },
  { id: 'items', icon: '📦', label: 'Items', shortcut: '2' },
  { id: 'scenes', icon: '🗺️', label: 'Scenes', shortcut: '3' },
  { id: 'search', icon: '🔍', label: 'Search', shortcut: '4' },
  { id: 'settings', icon: '⚙️', label: 'Settings', shortcut: '5' },
];

export default function Dock({ 
  children,
  renderContent,
  defaultTab = null,
  onTabChange,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle tab click
  const handleTabClick = useCallback((tabId) => {
    if (activeTab === tabId) {
      // Toggle collapse if clicking active tab
      setIsExpanded(!isExpanded);
    } else {
      setActiveTab(tabId);
      setIsExpanded(true);
      onTabChange?.(tabId);
    }
  }, [activeTab, isExpanded, onTabChange]);

  // Keyboard shortcuts (1-5)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      const key = e.key;
      const tabIndex = parseInt(key) - 1;
      
      if (tabIndex >= 0 && tabIndex < TABS.length) {
        e.preventDefault();
        handleTabClick(TABS[tabIndex].id);
      }
      
      // Escape to collapse
      if (e.key === 'Escape' && isExpanded) {
        setIsExpanded(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTabClick, isExpanded]);

  // Content panel animation variants
  const contentVariants = {
    collapsed: {
      height: 0,
      opacity: 0,
      transition: {
        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.2 }
      }
    },
    expanded: {
      height: 'auto',
      opacity: 1,
      transition: {
        height: { duration: 0.3, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.3, delay: 0.1 }
      }
    }
  };

  // Dock container animation
  const dockVariants = {
    initial: { y: 100, opacity: 0 },
    animate: { 
      y: 0, 
      opacity: 1,
      transition: { 
        type: 'spring', 
        stiffness: 300, 
        damping: 30,
        delay: 0.2 
      }
    },
    exit: { y: 100, opacity: 0 }
  };

  return (
    <motion.div
      className="dock"
      variants={dockVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {/* Expandable content area */}
      <AnimatePresence mode="wait">
        {isExpanded && activeTab && (
          <motion.div
            className="dock__content"
            key={activeTab}
            variants={contentVariants}
            initial="collapsed"
            animate="expanded"
            exit="collapsed"
          >
            <div className="dock__content-inner">
              {/* Render tab-specific content */}
              {renderContent ? (
                renderContent(activeTab)
              ) : (
                <DockContentPlaceholder tabId={activeTab} />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar */}
      <div className="dock__bar">
        <div className="dock__tabs" role="tablist">
          {TABS.map((tab) => (
            <DockTab
              key={tab.id}
              icon={tab.icon}
              label={tab.label}
              shortcut={tab.shortcut}
              isActive={activeTab === tab.id}
              onClick={() => handleTabClick(tab.id)}
            />
          ))}
        </div>

        {/* Collapse/expand handle */}
        {activeTab && (
          <motion.button
            className="dock__toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            aria-label={isExpanded ? 'Collapse dock' : 'Expand dock'}
          >
            <motion.span
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              ▲
            </motion.span>
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// Placeholder content for development
function DockContentPlaceholder({ tabId }) {
  const placeholders = {
    tokens: {
      title: 'Tokens',
      description: 'Drag tokens onto the map or search your collection.',
      items: ['🧙‍♂️ Wizard', '⚔️ Fighter', '🐉 Dragon', '👹 Goblin']
    },
    items: {
      title: 'Items',
      description: 'Equipment, consumables, and treasures.',
      items: ['🗡️ Sword +1', '🛡️ Shield', '🧪 Potion', '📜 Scroll']
    },
    scenes: {
      title: 'Scenes',
      description: 'Switch between maps and locations.',
      items: ['🏰 Castle', '🌲 Forest', '⛏️ Dungeon', '🏘️ Village']
    },
    search: {
      title: 'Search',
      description: 'Find anything in your campaign.',
      items: []
    },
    settings: {
      title: 'Settings',
      description: 'Configure your game session.',
      items: ['🎨 Theme', '🔊 Audio', '⌨️ Shortcuts', '👥 Players']
    }
  };

  const content = placeholders[tabId] || { title: tabId, description: '', items: [] };

  return (
    <div className="dock-placeholder">
      <h3 className="dock-placeholder__title">{content.title}</h3>
      <p className="dock-placeholder__desc">{content.description}</p>
      
      {tabId === 'search' ? (
        <div className="dock-placeholder__search">
          <input 
            type="text" 
            placeholder="Search tokens, items, scenes..."
            className="dock-placeholder__input"
            autoFocus
          />
        </div>
      ) : (
        <div className="dock-placeholder__grid">
          {content.items.map((item, i) => (
            <motion.div
              key={i}
              className="dock-placeholder__item"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              whileHover={{ scale: 1.05, backgroundColor: 'var(--bg-surface-light)' }}
            >
              {item}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// Export tabs config for external use
export { TABS };
