import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * AnimatedContainer - Wrapper com animações spring-based
 * 
 * Inspirado no Owlbear Rodeo 2.0: animações suaves, naturais, responsivas
 */

// Configurações de spring para diferentes "feels"
const springPresets = {
  // Snappy - para UI responsiva (botões, toggles)
  snappy: {
    type: 'spring',
    stiffness: 500,
    damping: 30,
    mass: 1,
  },
  // Gentle - para painéis, modais
  gentle: {
    type: 'spring',
    stiffness: 200,
    damping: 25,
    mass: 1,
  },
  // Bouncy - para feedback, celebração
  bouncy: {
    type: 'spring',
    stiffness: 300,
    damping: 15,
    mass: 1,
  },
  // Slow - para transições dramáticas
  slow: {
    type: 'spring',
    stiffness: 100,
    damping: 20,
    mass: 1.5,
  },
};

// Animações pré-definidas
const animationPresets = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
  },
  slideUp: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
  slideDown: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  },
  slideLeft: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
  },
  slideRight: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
  },
  pop: {
    initial: { opacity: 0, scale: 0.8 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.8 },
  },
  float: {
    initial: { opacity: 0, y: 10, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: 10, scale: 0.98 },
  },
};

/**
 * AnimatedContainer Component
 * 
 * @param {string} animation - Nome da animação preset (fadeIn, scaleIn, slideUp, etc)
 * @param {string} spring - Nome do spring preset (snappy, gentle, bouncy, slow)
 * @param {boolean} show - Controla visibilidade com AnimatePresence
 * @param {number} delay - Delay antes da animação (em segundos)
 * @param {object} custom - Variantes customizadas (override dos presets)
 * @param {string} className - Classes CSS adicionais
 * @param {React.ReactNode} children - Conteúdo
 */
const AnimatedContainer = ({
  children,
  animation = 'fadeIn',
  spring = 'gentle',
  show = true,
  delay = 0,
  custom = null,
  className = '',
  style = {},
  onClick,
  onHoverStart,
  onHoverEnd,
  whileHover,
  whileTap,
  drag = false,
  dragConstraints,
  dragElastic = 0.1,
  onDragEnd,
  layout = false,
  layoutId,
  ...props
}) => {
  // Pega o preset ou usa custom
  const variants = custom || animationPresets[animation] || animationPresets.fadeIn;
  const transition = {
    ...springPresets[spring] || springPresets.gentle,
    delay,
  };

  // Hover e tap defaults
  const hoverAnimation = whileHover || { scale: 1.02 };
  const tapAnimation = whileTap || { scale: 0.98 };

  const motionProps = {
    initial: variants.initial,
    animate: variants.animate,
    exit: variants.exit,
    transition,
    className,
    style,
    onClick,
    onHoverStart,
    onHoverEnd,
    layout,
    layoutId,
    ...props,
  };

  // Adiciona interatividade se houver onClick
  if (onClick || whileHover || whileTap) {
    motionProps.whileHover = whileHover !== false ? hoverAnimation : undefined;
    motionProps.whileTap = whileTap !== false ? tapAnimation : undefined;
    motionProps.style = { ...style, cursor: onClick ? 'pointer' : style.cursor };
  }

  // Adiciona drag se habilitado
  if (drag) {
    motionProps.drag = drag;
    motionProps.dragConstraints = dragConstraints;
    motionProps.dragElastic = dragElastic;
    motionProps.onDragEnd = onDragEnd;
    motionProps.dragMomentum = false;
  }

  // Se show é controlado, usa AnimatePresence
  if (show !== undefined && show !== null) {
    return (
      <AnimatePresence mode="wait">
        {show && (
          <motion.div key="animated-container" {...motionProps}>
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <motion.div {...motionProps}>
      {children}
    </motion.div>
  );
};

/**
 * Hook para criar animações staggered (filhos em sequência)
 */
export const useStaggerChildren = (staggerDelay = 0.05) => ({
  container: {
    animate: {
      transition: {
        staggerChildren: staggerDelay,
      },
    },
  },
  item: animationPresets.slideUp,
});

/**
 * Componente para listas com stagger
 */
export const StaggeredList = ({ 
  children, 
  staggerDelay = 0.05, 
  className = '',
  ...props 
}) => {
  return (
    <motion.div
      className={className}
      initial="initial"
      animate="animate"
      exit="exit"
      variants={{
        animate: {
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      {...props}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div
          key={index}
          variants={animationPresets.slideUp}
          transition={springPresets.gentle}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
};

// Exports
export { springPresets, animationPresets };
export default AnimatedContainer;
