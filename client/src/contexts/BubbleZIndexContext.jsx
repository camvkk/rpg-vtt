import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

/**
 * BubbleManagerContext - Gerencia z-index E posições das bubbles
 * - Evita sobreposição automaticamente
 * - Bring-to-front quando interage
 */

const BubbleManagerContext = createContext(null);

const BUBBLE_SIZE = 48; // Tamanho da bubble minimizada
const MIN_GAP = 8; // Gap mínimo entre bubbles

export function BubbleZIndexProvider({ children }) {
  // z-index management
  const [zIndexMap, setZIndexMap] = useState({});
  const [nextZIndex, setNextZIndex] = useState(1001);
  
  // Track all bubble positions { bubbleId: { x, y, isMinimized, width, height } }
  const positionsRef = useRef({});

  const bringToFront = useCallback((bubbleId) => {
    setZIndexMap(prev => ({
      ...prev,
      [bubbleId]: nextZIndex
    }));
    setNextZIndex(z => z + 1);
  }, [nextZIndex]);

  const getZIndex = useCallback((bubbleId, baseZIndex = 1000) => {
    return zIndexMap[bubbleId] ?? baseZIndex;
  }, [zIndexMap]);

  // Registra/atualiza posição de uma bubble
  const updatePosition = useCallback((bubbleId, position) => {
    positionsRef.current[bubbleId] = position;
  }, []);

  // Remove bubble do tracking
  const unregisterBubble = useCallback((bubbleId) => {
    delete positionsRef.current[bubbleId];
  }, []);

  // Verifica se duas bubbles colidem
  const checkCollision = (pos1, pos2) => {
    const w1 = pos1.width || BUBBLE_SIZE;
    const h1 = pos1.height || BUBBLE_SIZE;
    const w2 = pos2.width || BUBBLE_SIZE;
    const h2 = pos2.height || BUBBLE_SIZE;

    return !(
      pos1.x + w1 + MIN_GAP < pos2.x ||
      pos2.x + w2 + MIN_GAP < pos1.x ||
      pos1.y + h1 + MIN_GAP < pos2.y ||
      pos2.y + h2 + MIN_GAP < pos1.y
    );
  };

  // Encontra posição livre mais próxima
  const findNonOverlappingPosition = useCallback((bubbleId, desiredPos, size = { width: BUBBLE_SIZE, height: BUBBLE_SIZE }) => {
    const positions = positionsRef.current;
    const otherBubbles = Object.entries(positions)
      .filter(([id]) => id !== bubbleId)
      .map(([, pos]) => pos);

    if (otherBubbles.length === 0) return desiredPos;

    let testPos = { ...desiredPos, ...size };
    
    // Verifica se a posição desejada está livre
    const hasCollision = otherBubbles.some(other => checkCollision(testPos, other));
    if (!hasCollision) return desiredPos;

    // Tenta encontrar posição livre em espiral
    const spiralOffsets = [];
    for (let radius = 1; radius <= 5; radius++) {
      const step = (BUBBLE_SIZE + MIN_GAP) * radius;
      spiralOffsets.push(
        { dx: step, dy: 0 },
        { dx: 0, dy: step },
        { dx: -step, dy: 0 },
        { dx: 0, dy: -step },
        { dx: step, dy: step },
        { dx: -step, dy: step },
        { dx: step, dy: -step },
        { dx: -step, dy: -step },
      );
    }

    for (const offset of spiralOffsets) {
      const candidatePos = {
        x: Math.max(8, desiredPos.x + offset.dx),
        y: Math.max(8, desiredPos.y + offset.dy),
        ...size
      };
      
      const collides = otherBubbles.some(other => checkCollision(candidatePos, other));
      if (!collides) {
        return { x: candidatePos.x, y: candidatePos.y };
      }
    }

    // Fallback: retorna posição original
    return desiredPos;
  }, []);

  const value = useMemo(() => ({
    bringToFront,
    getZIndex,
    updatePosition,
    unregisterBubble,
    findNonOverlappingPosition,
  }), [bringToFront, getZIndex, updatePosition, unregisterBubble, findNonOverlappingPosition]);

  return (
    <BubbleManagerContext.Provider value={value}>
      {children}
    </BubbleManagerContext.Provider>
  );
}

export function useBubbleManager() {
  const context = useContext(BubbleManagerContext);
  
  if (!context) {
    // Fallback sem provider
    return {
      bringToFront: () => {},
      getZIndex: () => 1000,
      updatePosition: () => {},
      unregisterBubble: () => {},
      findNonOverlappingPosition: (id, pos) => pos,
    };
  }

  return context;
}

// Hook simplificado para z-index apenas (compatibilidade)
export function useBubbleZIndex(bubbleId) {
  const { bringToFront, getZIndex } = useBubbleManager();
  
  return {
    zIndex: getZIndex(bubbleId),
    bringToFront: () => bringToFront(bubbleId),
  };
}
