import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';

/**
 * Bubble - Base container flutuante estilo Owlbear Rodeo 2.0
 * Props:
 *  - id: string - identificador único
 *  - title: string - título do bubble
 *  - icon: ReactNode - ícone para o header e quando minimizado
 *  - children: ReactNode - conteúdo
 *  - initialPosition: { x, y } - posição inicial
 *  - minimizable: boolean - se pode minimizar
 *  - onMinimize: () => void - callback ao minimizar
 *  - onClose: () => void - callback ao fechar (opcional)
 *  - closable: boolean - se mostra botão de fechar
 *  - minWidth: number - largura mínima
 *  - minHeight: number - altura mínima
 *  - maxWidth: number - largura máxima
 *  - accentColor: string - cor de destaque
 */

const Bubble = ({
  id,
  title = 'Bubble',
  icon = '💬',
  children,
  initialPosition = { x: 100, y: 100 },
  minimizable = true,
  onMinimize,
  onClose,
  closable = false,
  minWidth = 280,
  minHeight = 200,
  maxWidth = 500,
  accentColor = '#e2b714',
  className = '',
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragControls = useDragControls();
  const bubbleRef = useRef(null);

  // Constrain to viewport
  const constrainToViewport = useCallback((pos) => {
    const padding = 8;
    const width = isMinimized ? 48 : minWidth;
    const height = isMinimized ? 48 : minHeight;
    
    return {
      x: Math.max(padding, Math.min(pos.x, window.innerWidth - width - padding)),
      y: Math.max(padding, Math.min(pos.y, window.innerHeight - height - padding)),
    };
  }, [isMinimized, minWidth, minHeight]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => constrainToViewport(prev));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [constrainToViewport]);

  const handleMinimize = () => {
    setIsMinimized(true);
    onMinimize?.();
  };

  const handleExpand = () => {
    setIsMinimized(false);
  };

  const handleDragStart = (event) => {
    setIsDragging(true);
  };

  const handleDragEnd = (event, info) => {
    setIsDragging(false);
    // Usar info.point para posição absoluta (mais preciso)
    const newPos = constrainToViewport({
      x: info.point.x - (minWidth / 2),
      y: info.point.y - 20, // offset do header
    });
    setPosition(newPos);
  };

  // Minimized icon view
  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.8, opacity: 0 }}
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={{ left: 0, top: 0, right: window.innerWidth - 56, bottom: window.innerHeight - 56 }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{
          position: 'fixed',
          left: position.x,
          top: position.y,
          zIndex: 1000,
          cursor: 'grab',
        }}
        whileDrag={{ cursor: 'grabbing' }}
        onClick={handleExpand}
        className="bubble-minimized"
      >
        <motion.div
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}44)`,
            border: `2px solid ${accentColor}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            boxShadow: `0 4px 20px ${accentColor}33, 0 8px 32px rgba(0,0,0,0.4)`,
            backdropFilter: 'blur(8px)',
          }}
          whileHover={{ scale: 1.1, boxShadow: `0 6px 28px ${accentColor}55` }}
          whileTap={{ scale: 0.95 }}
          title={`Expandir ${title}`}
        >
          {icon}
        </motion.div>
      </motion.div>
    );
  }

  // Expanded bubble view
  return (
    <motion.div
      ref={bubbleRef}
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      drag
      dragControls={dragControls}
      dragMomentum={false}
      dragElastic={0}
      dragConstraints={{ left: 0, top: 0, right: window.innerWidth - minWidth, bottom: window.innerHeight - minHeight }}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      dragListener={false}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: isDragging ? 1100 : 1000,
        minWidth,
        minHeight,
        maxWidth,
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
      }}
      className={`bubble ${className}`}
    >
      {/* Glass effect container */}
      <div
        style={{
          background: 'linear-gradient(135deg, rgba(26,26,46,0.95), rgba(22,33,62,0.92))',
          border: `1px solid ${accentColor}44`,
          borderRadius: 16,
          boxShadow: `
            0 8px 32px rgba(0,0,0,0.5),
            0 0 0 1px rgba(255,255,255,0.05) inset,
            0 2px 12px ${accentColor}22
          `,
          backdropFilter: 'blur(12px)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        }}
      >
        {/* Header - draggable area */}
        <motion.div
          onPointerDown={(e) => dragControls.start(e)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 12px',
            background: `linear-gradient(90deg, ${accentColor}15, transparent)`,
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            cursor: 'grab',
          }}
          whileTap={{ cursor: 'grabbing' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '1.1rem' }}>{icon}</span>
            <h3 style={{
              margin: 0,
              fontSize: '0.95rem',
              fontWeight: 700,
              color: accentColor,
              fontFamily: '"Cinzel", Georgia, serif',
              letterSpacing: '0.5px',
            }}>
              {title}
            </h3>
          </div>
          
          <div style={{ display: 'flex', gap: 4 }}>
            {minimizable && (
              <motion.button
                onClick={handleMinimize}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: 'none',
                  background: 'rgba(255,255,255,0.08)',
                  color: '#a0aec0',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                }}
                whileHover={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}
                whileTap={{ scale: 0.9 }}
                title="Minimizar"
              >
                ─
              </motion.button>
            )}
            {closable && onClose && (
              <motion.button
                onClick={onClose}
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  border: 'none',
                  background: 'rgba(255,107,107,0.15)',
                  color: '#ff6b6b',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                }}
                whileHover={{ background: 'rgba(255,107,107,0.3)', scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                title="Fechar"
              >
                ✕
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* Content */}
        <div style={{
          flex: 1,
          overflow: 'auto',
          padding: '12px',
        }}>
          {children}
        </div>
      </div>
    </motion.div>
  );
};

export default Bubble;
