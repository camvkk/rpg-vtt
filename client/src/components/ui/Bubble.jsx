import React, { useState, useRef, useId, useEffect } from 'react';
import { motion, useDragControls, useMotionValue } from 'framer-motion';
import { useBubbleManager } from '../../contexts/BubbleZIndexContext';
import './Bubble.css';

/**
 * Bubble - Container flutuante estilo Owlbear Rodeo 2.0
 *
 * Arquitetura de posicionamento (2026-02-19):
 * - `position` state  → fonte de verdade para o contexto de anti-sobreposição
 * - `motionX/motionY` → controla o DOM via framer-motion (evita bug do 1º drag)
 * - Os dois ficam sincronizados: state muda → motion values atualizam;
 *   drag termina → lê dos motion values, escreve no state.
 *
 * Bug corrigido: usar animate={{ x, y }} + drag fazia o framer-motion trackear
 * o offset a partir de (0,0) no 1º arrasto, jogando o elemento pro topo.
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

  // Motion values controlam o DOM — inicializados na posição certa,
  // sem passar por animate (evita o bug do 1º drag)
  const motionX = useMotionValue(initialPosition.x);
  const motionY = useMotionValue(initialPosition.y);

  const zIndex = getZIndex(bubbleId);

  // Registra posição no contexto de anti-sobreposição
  // (disparado no mount e sempre que position ou isMinimized mudam)
  useEffect(() => {
    updatePosition(bubbleId, {
      x: position.x,
      y: position.y,
      isMinimized,
      width: isMinimized ? 48 : minWidth,
      height: isMinimized ? 48 : 200,
    });
  }, [bubbleId, position, isMinimized, minWidth, updatePosition]);

  // Sincroniza state → motion values quando a posição é ajustada externamente
  // (ex: anti-sobreposição ao soltar o drag)
  useEffect(() => {
    motionX.set(position.x);
    motionY.set(position.y);
  }, [position.x, position.y, motionX, motionY]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => unregisterBubble(bubbleId);
  }, [bubbleId, unregisterBubble]);

  const handleMinimize = () => {
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

    // Lê posição real dos motion values (sem depender de info.offset)
    const newPos = {
      x: motionX.get(),
      y: motionY.get(),
    };

    const size = isMinimized
      ? { width: 48, height: 48 }
      : { width: minWidth, height: 200 };

    // Anti-sobreposição: calcula posição ajustada e atualiza state
    // O useEffect acima sincroniza state → motionValues automaticamente
    const adjustedPos = findNonOverlappingPosition(bubbleId, newPos, size);
    setPosition(adjustedPos);

    // Aplica imediatamente nos motion values também (evita delay visual)
    motionX.set(adjustedPos.x);
    motionY.set(adjustedPos.y);
  };

  // Minimized icon view
  if (isMinimized) {
    return (
      <>
        <div
          ref={constraintsRef}
          style={{
            position: 'fixed',
            inset: 8,
            pointerEvents: 'none',
          }}
        />
        <motion.div
          key={`${bubbleId}-minimized`}
          drag
          dragMomentum={false}
          dragConstraints={constraintsRef}
          dragElastic={0}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            x: motionX,
            y: motionY,
            zIndex: zIndex,
            cursor: isDragging ? 'grabbing' : 'grab',
          }}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
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
        </motion.div>
      </>
    );
  }

  // Expanded bubble view
  return (
    <>
      <div
        ref={constraintsRef}
        style={{
          position: 'fixed',
          inset: 8,
          pointerEvents: 'none',
        }}
      />
      <motion.div
        key={`${bubbleId}-expanded`}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        drag
        dragControls={dragControls}
        dragMomentum={false}
        dragConstraints={constraintsRef}
        dragListener={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        style={{
          position: 'fixed',
          left: 0,
          top: 0,
          x: motionX,
          y: motionY,
          minWidth,
          maxWidth,
          zIndex: zIndex,
        }}
        onPointerDown={() => bringToFront(bubbleId)}
        className={`bubble ${className}`}
      >
        {/* Header - drag handle */}
        <motion.div
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
                onClick={onClose}
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
        </motion.div>

        {/* Content */}
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
    </>
  );
};

export default Bubble;
