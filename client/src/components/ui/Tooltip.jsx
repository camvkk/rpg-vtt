import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * Animated tooltip component
 * Inspired by Owlbear Rodeo 2.0 minimal design
 */
export default function Tooltip({ 
  children, 
  content, 
  position = 'right',
  delay = 400,
  disabled = false 
}) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef(null);
  const containerRef = useRef(null);

  const showTooltip = () => {
    if (disabled) return;
    timeoutRef.current = setTimeout(() => setIsVisible(true), delay);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Position offsets
  const positionStyles = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' },
  };

  // Animation variants
  const variants = {
    hidden: {
      opacity: 0,
      scale: 0.85,
      ...(position === 'right' && { x: -8 }),
      ...(position === 'left' && { x: 8 }),
      ...(position === 'top' && { y: 8 }),
      ...(position === 'bottom' && { y: -8 }),
    },
    visible: {
      opacity: 1,
      scale: 1,
      x: 0,
      y: 0,
    },
  };

  return (
    <div
      ref={containerRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      {children}
      
      <AnimatePresence>
        {isVisible && content && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={variants}
            transition={{ 
              duration: 0.15, 
              ease: [0.4, 0, 0.2, 1] 
            }}
            style={{
              position: 'absolute',
              ...positionStyles[position],
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <div
              style={{
                background: 'rgba(15, 15, 15, 0.95)',
                color: 'rgba(255, 255, 255, 0.95)',
                padding: '6px 10px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
