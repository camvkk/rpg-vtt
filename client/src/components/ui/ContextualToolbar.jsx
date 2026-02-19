import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MousePointer2,
  Hand,
  Ruler,
  Cloud,
  Pencil,
  Square,
  Eraser,
  Users,
  Swords,
  Layers,
  DoorOpen,
  Wand2,
} from 'lucide-react';
import { useGame } from '../../contexts/GameContext';
import Tooltip from './Tooltip';

/**
 * IDs de ferramenta devem bater exatamente com o que o MapCanvas e GameBoard esperam.
 * Mapeamento correto (conforme atalhos de teclado em GameBoard.jsx):
 *   select    → 'select'
 *   move-map  → 'move-map'   (era 'move' — ERRADO)
 *   measure   → 'measure'
 *   fog       → 'fog'
 *   wall      → 'wall'
 *   door      → 'door'
 *   aoe       → 'aoe'
 *   draw      → 'draw'
 *   add-token → 'add-token'  (era 'token' — ERRADO)
 */
const TOOLS = {
  select: {
    icon: MousePointer2,
    label: 'Selecionar',
    shortcut: 'S',
    group: 'basic',
  },
  'move-map': {
    icon: Hand,
    label: 'Mover Mapa',
    shortcut: 'H',
    group: 'basic',
  },
  measure: {
    icon: Ruler,
    label: 'Medir Distância',
    shortcut: 'M',
    group: 'basic',
  },
  draw: {
    icon: Pencil,
    label: 'Desenhar',
    shortcut: 'D',
    group: 'draw',
    dmOnly: true,
  },
  eraser: {
    icon: Eraser,
    label: 'Apagar',
    shortcut: 'E',
    group: 'draw',
    dmOnly: true,
  },
  fog: {
    icon: Cloud,
    label: 'Névoa de Guerra',
    shortcut: 'F',
    group: 'dm',
    dmOnly: true,
  },
  wall: {
    icon: Square,
    label: 'Paredes',
    shortcut: 'W',
    group: 'dm',
    dmOnly: true,
  },
  door: {
    icon: DoorOpen,
    label: 'Porta',
    shortcut: 'R',
    group: 'dm',
    dmOnly: true,
  },
  aoe: {
    icon: Wand2,
    label: 'Área de Efeito',
    shortcut: 'A',
    group: 'entity',
    dmOnly: true,
  },
  'add-token': {
    icon: Users,
    label: 'Adicionar Token',
    shortcut: 'T',
    group: 'entity',
    dmOnly: true,
  },
};

const TOOL_GROUPS = {
  // Jogador comum
  default: ['select', 'move-map', 'measure'],
  // Mestre — todas as ferramentas
  dm: ['select', 'move-map', 'measure', 'draw', 'eraser', 'fog', 'wall', 'door', 'aoe', 'add-token'],
};

function ToolDivider() {
  return (
    <div
      style={{
        width: '28px',
        height: '1px',
        background: 'rgba(255, 255, 255, 0.12)',
        margin: '2px 4px',
      }}
    />
  );
}

function ToolButton({ toolId, tool, isActive, onClick }) {
  const Icon = tool.icon;
  return (
    <Tooltip content={`${tool.label} (${tool.shortcut})`} position="right">
      <motion.button
        onClick={() => onClick(toolId)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.92 }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '36px',
          height: '36px',
          border: isActive ? '1px solid rgba(255,255,255,0.25)' : 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          background: isActive
            ? 'rgba(255, 255, 255, 0.18)'
            : 'transparent',
          color: isActive
            ? '#fff'
            : 'rgba(255, 255, 255, 0.6)',
          transition: 'background 0.12s ease, color 0.12s ease',
          position: 'relative',
        }}
        onMouseEnter={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
            e.currentTarget.style.color = '#fff';
          }
        }}
        onMouseLeave={(e) => {
          if (!isActive) {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
          }
        }}
      >
        <Icon size={18} strokeWidth={1.75} />
        {/* Dot indicator when active */}
        {isActive && (
          <span style={{
            position: 'absolute',
            bottom: 3,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: '#60a5fa',
          }} />
        )}
      </motion.button>
    </Tooltip>
  );
}

export default function ContextualToolbar({ context = 'default' }) {
  const { state, actions } = useGame();
  const { activeTool } = state.ui;
  const { isDM } = state.player;

  const visibleTools = useMemo(() => {
    const group = isDM ? TOOL_GROUPS.dm : TOOL_GROUPS.default;
    return group.filter((toolId) => {
      const tool = TOOLS[toolId];
      return tool && (!tool.dmOnly || isDM);
    });
  }, [isDM]);

  // Insere divisores entre grupos diferentes
  const groupedTools = useMemo(() => {
    const result = [];
    let currentGroup = null;
    visibleTools.forEach((toolId, index) => {
      const tool = TOOLS[toolId];
      if (!tool) return;
      if (currentGroup !== null && currentGroup !== tool.group) {
        result.push({ type: 'divider', key: `div-${index}` });
      }
      result.push({ type: 'tool', toolId, tool });
      currentGroup = tool.group;
    });
    return result;
  }, [visibleTools]);

  const handleToolClick = (toolId) => {
    actions.setActiveTool(toolId);
  };

  const containerVariants = {
    hidden: { opacity: 0, x: -16 },
    visible: {
      opacity: 1,
      x: 0,
      transition: { duration: 0.2, ease: [0.4, 0, 0.2, 1], staggerChildren: 0.025 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.8 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.12 } },
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
        alignItems: 'center',
        gap: '2px',
        padding: '8px 6px',
        background: 'rgba(18, 18, 20, 0.88)',
        backdropFilter: 'blur(12px)',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <AnimatePresence mode="popLayout">
        {groupedTools.map((item) => (
          <motion.div
            key={item.type === 'divider' ? item.key : item.toolId}
            variants={itemVariants}
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

export { TOOLS, TOOL_GROUPS };
