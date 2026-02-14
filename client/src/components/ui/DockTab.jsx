import { motion } from 'framer-motion';

/**
 * DockTab - Individual tab button for the Dock
 * Inspired by Owlbear Rodeo 2.0 design
 */
export default function DockTab({ 
  icon, 
  label, 
  shortcut, 
  isActive, 
  onClick,
  hasNotification = false 
}) {
  return (
    <motion.button
      className={`dock-tab ${isActive ? 'dock-tab--active' : ''}`}
      onClick={onClick}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.95 }}
      title={`${label} (${shortcut})`}
      aria-label={label}
      aria-selected={isActive}
      role="tab"
    >
      <span className="dock-tab__icon">{icon}</span>
      
      {/* Active indicator */}
      {isActive && (
        <motion.div
          className="dock-tab__indicator"
          layoutId="dock-active-indicator"
          initial={false}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        />
      )}
      
      {/* Notification badge */}
      {hasNotification && (
        <motion.span
          className="dock-tab__badge"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0 }}
        />
      )}
      
      {/* Keyboard shortcut hint */}
      <span className="dock-tab__shortcut">{shortcut}</span>
    </motion.button>
  );
}
