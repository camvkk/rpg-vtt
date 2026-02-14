import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer2,
  Move,
  Ruler,
  Cloud,
  Pencil,
  Square,
  Circle,
  Eraser,
  Users,
  Swords,
  Plus,
  ChevronDown,
  Layers,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import Tooltip from './Tooltip';

/**
 * Tool definitions with icons and metadata
 */
const TOOLS = {
  select: { 
    icon: MousePointer2, 
    label: 'Selecionar', 
    shortcut: 'V',
    group: 'basic'
  },
  move: { 
    icon: Move, 
    label: 'Mover Canvas', 
    shortcut: 'H',
    group: 'basic'
  },
  measure: { 
    icon: Ruler, 
    label: 'Medir Distância', 
    shortcut: 'M',
    group: 'basic'
  },
  fog: { 
    icon: Cloud, 
    label: 'Névoa de Guerra', 
    shortcut: 'F',
    group: 'dm',
    dmOnly: true
  },
  draw: { 
    icon: Pencil, 
    label: 'Desenhar', 
    shortcut: 'D',
    group: 'draw'
  },
  rectangle: { 
    icon: Square, 
    label: 'Retângulo', 
    shortcut: 'R',
    group: 'draw'
  },
  circle: { 
    icon: Circle, 
    label: 'Círculo', 
    shortcut: 'C',
    group: 'draw'
  },
  eraser: { 
    icon: Eraser, 
    label: 'Apagar', 
    shortcut: 'E',
    group: 'draw'
  },
  token: { 
    icon: Users, 
    label: 'Adicionar Token', 
    shortcut: 'T',
    group: 'entity'
  },
  aoe: { 
    icon: Swords, 
    label: 'Área de Efeito', 
    shortcut: 'A',
    group: 'entity'
  },
};

/**
 * Tool groups for contextual display
 */
const TOOL_GROUPS = {
  default: ['select', 'move', 'measure'],
  drawing: ['draw', 'rectangle', 'circle', 'eraser'],
  combat: ['select', 'move', 'measure', 'aoe'],
  dm: ['select', 'move', 'measure', 'fog', 'token'],
};

/**
 * Divider component for tool groups
 */
function ToolDivider() {
  return (
    <div
      style={{
        width: '1px',
        height: '20px',
        background: 'rgba(255, 255, 255, 0.15)',
        margin: '0 4px',
      }}
    />
  );
}

/**
 * Individual tool button component
 */
function ToolButton({ toolId, tool, isActive, onClick }) {
  const Icon = tool.icon;

  return (
    <Tooltip content={`${tool.label} (${tool.shortcut})`} position="right">
      <motion.button
        onClick={() => onClick(toolId)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.95 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          background: isActive 
            ? 'rgba(255, 255, 255, 0.2)' 
            : 'transparent',
          color: isActive 
            ? '#fff' 
            : 'rgba(255, 255, 255, 0.7)',
          transition: 'background 0.15s ease, color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }
        }}
      >
        <Icon size={20} strokeWidth={1.75} />
      </motion.button>
    </Tooltip>
  );
}

/**
 * Main contextual toolbar component
 * Floats in top-left, shows tools based on context
 */
export default function ContextualToolbar({ context = 'default' }) {
  const { state, actions } = useGame();
  const { activeTool } = state.ui;
  const { isDM } = state.player;

  // Get visible tools based on context
  const visibleTools = useMemo(() => {
    let tools = TOOL_GROUPS[context] || TOOL_GROUPS.default;
    
    // Add DM-specific tools if user is DM
    if (isDM && !tools.includes('fog')) {
      tools = [...tools, 'fog', 'token'];
    }
    
    // Filter out DM-only tools for non-DMs
    return tools.filter(toolId => {
      const tool = TOOLS[toolId];
      return tool && (!tool.dmOnly || isDM);
    });
  }, [context, isDM]);

  // Group tools for rendering with dividers
  const groupedTools = useMemo(() => {
    const result = [];
    let currentGroup = null;

    visibleTools.forEach((toolId, index) => {
      const tool = TOOLS[toolId];
      if (tool) {
        if (currentGroup !== null && currentGroup !== tool.group) {
          result.push({ type: 'divider', key: `divider-${index}` });
        }
        result.push({ type: 'tool', toolId, tool });
        currentGroup = tool.group;
      }
    });

    return result;
  }, [visibleTools]);

  const handleToolClick = (toolId) => {
    actions.setActiveTool(toolId);
  };

  // Container animation
  const containerVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.25,
        ease: [0.4, 0, 0.2, 1],
        staggerChildren: 0.03,
      }
    },
  };

  // Item animation
  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: { duration: 0.15 }
    },
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      style={{
        position: 'fixed',
        top: '80px',
        left: '16px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '8px',
        background: 'rgba(20, 20, 22, 0.85)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <AnimatePresence mode="popLayout">
        {groupedTools.map((item) => (
          <motion.div
            key={item.type === 'divider' ? item.key : item.toolId}
            variants={itemVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            layout
          >
            {item.type === 'divider' ? (
              <ToolDivider />
            ) : (
              <ToolButton
                toolId={item.toolId}
                tool={item.tool}
                isActive={activeTool === item.toolId}
                onClick={handleToolClick}
              />
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
}

// Export tools config for external use
export { TOOLS, TOOL_GROUPS };
