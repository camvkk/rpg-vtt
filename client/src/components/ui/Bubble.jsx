import React, { useState, useRef, useId, useEffect } from 'react';
import { motion, useDragControls, useMotionValue } from 'framer-motion';
import { useBubbleManager } from '../../contexts/BubbleZIndexContext';
import './Bubble.css';

/**
 * Bubble - Container flutuante estilo Owlbear Rodeo 2.0
 *
 * Arquitetura (2026-02-19 v3):
 * - UM único motion.div — nunca desmonta ao minimizar/expandir
 *   → evita flash em (0,0) que ocorria ao trocar key entre estados
 * - useMotionValue para x/y → evita bug do 1º drag com animate={{ x, y }}
 * - position state → fonte de verdade para o contexto de anti-sobreposição
 */
const Bubble = ({
  id: providedId,
  title = 'Bubble',
  icon = '💬',
  children,
  initialPosition = { x: 100, y: 100 },
  minimizable = true,
  onMinimize,
  onExpand,
  onClose,
  closable = false,
  minWidth = 280,
  minHeight = 200,
  maxWidth = 500,
  accentColor = '#e2b714',
  className = '',
  badge = 0,
}) => {
  const generatedId = useId();
  const bubbleId = providedId || generatedId;

  const {
    bringToFront,
    getZIndex,
    updatePosition,
    unregisterBubble,
    findNonOverlappingPosition,
  } = useBubbleManager();

  const [isMinimized, setIsMinimized] = useState(true);
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragControls = useDragControls();
  const constraintsRef = useRef(null);
  const dragStartTime = useRef(0);

  const motionX = useMotionValue(initialPosition.x);
  const motionY = useMotionValue(initialPosition.y);

  const zIndex = getZIndex(bubbleId);

  // Registra posição no contexto de anti-sobreposição
  useEffect(() => {
    updatePosition(bubbleId, {
      x: position.x,
      y: position.y,
      isMinimized,
      width: isMinimized ? 48 : minWidth,
      height: isMinimized ? 48 : 200,
    });
  }, [bubbleId, position, isMinimized, minWidth, updatePosition]);

  // Sincroniza state → motion values (anti-overlap pode ajustar o state)
  useEffect(() => {
    motionX.set(position.x);
    motionY.set(position.y);
  }, [position.x, position.y, motionX, motionY]);

  useEffect(() => {
    return () => unregisterBubble(bubbleId);
  }, [bubbleId, unregisterBubble]);

  const handleMinimize = (e) => {
    e.stopPropagation();
    setIsMinimized(true);
    onMinimize?.();
  };

  const handleExpand = () => {
    const dragDuration = Date.now() - dragStartTime.current;
    if (isDragging || dragDuration < 50) return;
    setIsMinimized(false);
    bringToFront(bubbleId);
    onExpand?.();
  };

  const handleDragStart = () => {
    setIsDragging(true);
    dragStartTime.current = Date.now();
    bringToFront(bubbleId);
  };

  const handleDragEnd = () => {
    setTimeout(() => setIsDragging(false), 100);

    const newPos = { x: motionX.get(), y: motionY.get() };
    const size = isMinimized
      ? { width: 48, height: 48 }
      : { width: minWidth, height: 200 };

    const adjustedPos = findNonOverlappingPosition(bubbleId, newPos, size);
    setPosition(adjustedPos);
    motionX.set(adjustedPos.x);
    motionY.set(adjustedPos.y);
  };

  return (
    <>
      <div
        ref={constraintsRef}
        style={{ position: 'fixed', inset: 8, pointerEvents: 'none' }}
      />

      {/* UM único motion.div — nunca desmonta */}
      <motion.div
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={constraintsRef}
        dragElastic={0}
        // Quando minimizado: arrasta clicando em qualquer lugar
        // Quando expandido: só arrasta via dragControls no header
        dragListener={isMinimized}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          x: motionX,
          y: motionY,
          zIndex,
          cursor: isMinimized ? (isDragging ? 'grabbing' : 'grab') : 'default',
          width: isMinimized ? 48 : undefined,
          minWidth: isMinimized ? undefined : minWidth,
          maxWidth: isMinimized ? undefined : maxWidth,
        }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onClick={isMinimized ? handleExpand : undefined}
        onPointerDown={() => bringToFront(bubbleId)}
        className={isMinimized ? 'bubble-minimized' : `bubble ${className}`}
      >
        {isMinimized ? (
          /* ── Estado minimizado: bolinha com ícone ── */
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
              position: 'relative',
            }}
            whileHover={{ scale: 1.1, boxShadow: `0 6px 28px ${accentColor}55` }}
            whileTap={{ scale: 0.95 }}
            title={`Abrir ${title}`}
          >
            {icon}
            {badge > 0 && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -4,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 5px',
                  boxShadow: '0 2px 8px rgba(239,68,68,0.5)',
                }}
              >
                {badge > 99 ? '99+' : badge}
              </motion.div>
            )}
          </motion.div>
        ) : (
          /* ── Estado expandido: painel com header + conteúdo ── */
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            style={{ width: '100%' }}
          >
            {/* Header — drag handle */}
            <div
              className="bubble__header"
              onPointerDown={(e) => {
                bringToFront(bubbleId);
                dragControls.start(e);
              }}
              style={{
                cursor: 'grab',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: `linear-gradient(135deg, ${accentColor}22, ${accentColor}11)`,
                borderBottom: `1px solid ${accentColor}33`,
                borderRadius: '12px 12px 0 0',
                userSelect: 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '1.1rem' }}>{icon}</span>
                <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-text)' }}>
                  {title}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 4 }}>
                {minimizable && (
                  <motion.button
                    onClick={handleMinimize}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'var(--color-text-dim)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                    }}
                    title="Minimizar"
                  >
                    −
                  </motion.button>
                )}
                {closable && onClose && (
                  <motion.button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    whileHover={{ scale: 1.1, background: 'rgba(239,68,68,0.3)' }}
                    whileTap={{ scale: 0.9 }}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      border: 'none',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'var(--color-text-dim)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                    }}
                    title="Fechar"
                  >
                    ✕
                  </motion.button>
                )}
              </div>
            </div>

            {/* Conteúdo */}
            <div
              className="bubble__content"
              style={{
                padding: '12px',
                background: 'var(--bg-surface)',
                borderRadius: '0 0 12px 12px',
                maxHeight: '60vh',
                overflowY: 'auto',
              }}
            >
              {children}
            </div>
          </motion.div>
        )}
      </motion.div>
    </>
  );
};

export default Bubble;
