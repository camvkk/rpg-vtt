import { useRef, useEffect, useState, useCallback } from 'react';
import { Graphics, Container } from 'pixi.js';
import { pixelToGrid, gridToPixel } from '../utils/gridUtils';

const FogOfWar = ({ 
  pixiApp, 
  container,
  width = 2000,
  height = 2000,
  revealedAreas = [],
  onRevealArea,
  onHideArea,
  isDM = false,
  isActive = false,
  brushSize = 2,
  onBrushSizeChange,
  zoom = 1,
  panX = 0,
  panY = 0
}) => {
  const fogRef = useRef(null);
  const paintStateRef = useRef({
    isPainting: false,
    isRevealing: true,
    lastPoint: null
  });
  const [currentBrushSize, setCurrentBrushSize] = useState(brushSize);
  const [showBrushPreview, setShowBrushPreview] = useState(false);
  const [brushPreviewPos, setBrushPreviewPos] = useState({ x: 0, y: 0 });

  // Create initial fog layer
  useEffect(() => {
    if (!container) return;

    const fogGraphics = new Graphics();
    fogRef.current = fogGraphics;

    // Create full fog overlay
    fogGraphics.beginFill(0x000000, 0.9);
    fogGraphics.drawRect(0, 0, width, height);
    fogGraphics.endFill();

    container.addChild(fogGraphics);

    // Redraw with current revealed areas
    redrawFog();

    return () => {
      if (container && fogGraphics) {
        container.removeChild(fogGraphics);
      }
    };
  }, [container, width, height]);

  // Redraw fog based on revealed areas
  const redrawFog = useCallback(() => {
    const fogGraphics = fogRef.current;
    if (!fogGraphics) return;

    fogGraphics.clear();
    
    // Draw base fog
    fogGraphics.beginFill(0x000000, 0.9);
    fogGraphics.drawRect(0, 0, width, height);
    fogGraphics.endFill();

    // Cut out revealed areas
    revealedAreas.forEach(area => {
      fogGraphics.beginHole();
      if (area.type === 'circle') {
        fogGraphics.drawCircle(area.x, area.y, area.radius);
      } else {
        fogGraphics.drawRect(area.x, area.y, area.width, area.height);
      }
      fogGraphics.endHole();
    });
  }, [revealedAreas, width, height]);

  // Update fog when revealed areas change
  useEffect(() => {
    redrawFog();
  }, [revealedAreas, redrawFog]);

  // Paint fog/reveal areas
  const paintFog = useCallback((worldX, worldY, reveal = true) => {
    const gridSize = 40;
    const brushRadius = currentBrushSize * gridSize / 2;

    const newArea = {
      id: `fog_${Date.now()}_${Math.random()}`,
      type: 'circle',
      x: worldX,
      y: worldY,
      radius: brushRadius
    };

    if (reveal) {
      onRevealArea?.([newArea]);
    } else {
      onHideArea?.([newArea]);
    }
  }, [currentBrushSize, onRevealArea, onHideArea]);

  // Handle mouse interactions for fog painting
  useEffect(() => {
    if (!isDM || !isActive || !pixiApp) return;

    const canvas = pixiApp.view;
    
    const getWorldPosition = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const canvasX = clientX - rect.left;
      const canvasY = clientY - rect.top;
      
      return {
        x: (canvasX - panX) / zoom,
        y: (canvasY - panY) / zoom
      };
    };

    const handleMouseDown = (event) => {
      if (event.button !== 0) return; // Only left click
      
      const paintState = paintStateRef.current;
      paintState.isPainting = true;
      paintState.isRevealing = !event.shiftKey; // Shift to hide fog
      
      const worldPos = getWorldPosition(event.clientX, event.clientY);
      paintState.lastPoint = worldPos;
      
      paintFog(worldPos.x, worldPos.y, paintState.isRevealing);
      
      event.preventDefault();
    };

    const handleMouseMove = (event) => {
      const worldPos = getWorldPosition(event.clientX, event.clientY);
      setBrushPreviewPos(worldPos);

      const paintState = paintStateRef.current;
      if (!paintState.isPainting) return;

      // Paint continuously if mouse moved enough
      if (paintState.lastPoint) {
        const dx = worldPos.x - paintState.lastPoint.x;
        const dy = worldPos.y - paintState.lastPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance > 10) { // Minimum distance to paint
          paintFog(worldPos.x, worldPos.y, paintState.isRevealing);
          paintState.lastPoint = worldPos;
        }
      }
    };

    const handleMouseUp = () => {
      const paintState = paintStateRef.current;
      paintState.isPainting = false;
      paintState.lastPoint = null;
    };

    const handleMouseEnter = () => {
      if (isActive) setShowBrushPreview(true);
    };

    const handleMouseLeave = () => {
      setShowBrushPreview(false);
      const paintState = paintStateRef.current;
      paintState.isPainting = false;
    };

    // Prevent context menu during fog painting
    const handleContextMenu = (event) => {
      if (isActive) event.preventDefault();
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('mouseenter', handleMouseEnter);
    canvas.addEventListener('mouseleave', handleMouseLeave);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('mouseenter', handleMouseEnter);
      canvas.removeEventListener('mouseleave', handleMouseLeave);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isDM, isActive, pixiApp, zoom, panX, panY, paintFog]);

  // Handle brush size changes
  const handleBrushSizeChange = useCallback((newSize) => {
    const clampedSize = Math.max(1, Math.min(10, newSize));
    setCurrentBrushSize(clampedSize);
    onBrushSizeChange?.(clampedSize);
  }, [onBrushSizeChange]);

  // Keyboard shortcuts for brush size
  useEffect(() => {
    if (!isActive) return;

    const handleKeyPress = (event) => {
      if (event.key === '[') {
        handleBrushSizeChange(currentBrushSize - 1);
        event.preventDefault();
      } else if (event.key === ']') {
        handleBrushSizeChange(currentBrushSize + 1);
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isActive, currentBrushSize, handleBrushSizeChange]);

  // Brush preview component
  const BrushPreview = () => {
    if (!showBrushPreview || !isActive || !isDM) return null;

    const screenPos = {
      x: brushPreviewPos.x * zoom + panX,
      y: brushPreviewPos.y * zoom + panY
    };

    const brushRadius = currentBrushSize * 40 / 2 * zoom;

    return (
      <div 
        className="brush-preview"
        style={{
          left: screenPos.x - brushRadius,
          top: screenPos.y - brushRadius,
          width: brushRadius * 2,
          height: brushRadius * 2
        }}
      />
    );
  };

  // Fog controls for DM
  const FogControls = () => {
    if (!isDM) return null;

    return (
      <div className="fog-controls">
        <div className="control-group">
          <label className="control-label">Tamanho do Pincel</label>
          <div className="brush-size-controls">
            <button 
              type="button"
              className="btn-icon"
              onClick={() => handleBrushSizeChange(currentBrushSize - 1)}
              disabled={currentBrushSize <= 1}
            >
              −
            </button>
            <span className="brush-size-value">{currentBrushSize}</span>
            <button 
              type="button"
              className="btn-icon"
              onClick={() => handleBrushSizeChange(currentBrushSize + 1)}
              disabled={currentBrushSize >= 10}
            >
              +
            </button>
          </div>
        </div>

        <div className="fog-instructions">
          <div className="instruction">🖱️ Click + Drag = Revelar</div>
          <div className="instruction">⇧ Shift + Drag = Esconder</div>
          <div className="instruction">⌨️ [ ] = Tamanho do Pincel</div>
        </div>

        <div className="fog-actions">
          <button 
            type="button"
            className="btn btn-accent"
            onClick={() => onHideArea?.(revealedAreas)}
            disabled={revealedAreas.length === 0}
          >
            Esconder Tudo
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <BrushPreview />
      {isDM && <FogControls />}

      <style jsx>{`
        .brush-preview {
          position: absolute;
          border: 2px solid var(--color-primary);
          border-radius: 50%;
          pointer-events: none;
          z-index: 1000;
          opacity: 0.6;
          background: rgba(226, 183, 20, 0.1);
        }

        .fog-controls {
          position: absolute;
          top: 1rem;
          right: 1rem;
          background: rgba(26, 26, 46, 0.95);
          border: 1px solid var(--color-border);
          border-radius: 8px;
          padding: 1rem;
          backdrop-filter: blur(8px);
          z-index: 100;
          min-width: 200px;
        }

        .control-group {
          margin-bottom: 1rem;
        }

        .control-label {
          display: block;
          color: var(--color-text);
          font-size: 0.9rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }

        .brush-size-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .btn-icon {
          width: 32px;
          height: 32px;
          border: 1px solid var(--color-border);
          background: var(--bg-surface-light);
          color: var(--color-text);
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 1.2rem;
          font-weight: bold;
          transition: all var(--transition-fast);
        }

        .btn-icon:hover:not(:disabled) {
          background: var(--color-primary);
          color: var(--bg-primary);
        }

        .btn-icon:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .brush-size-value {
          min-width: 32px;
          text-align: center;
          font-weight: bold;
          color: var(--color-primary);
          font-size: 1.1rem;
        }

        .fog-instructions {
          margin-bottom: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--color-border);
        }

        .instruction {
          font-size: 0.8rem;
          color: var(--color-text-dim);
          margin-bottom: 0.25rem;
        }

        .fog-actions {
          padding-top: 1rem;
          border-top: 1px solid var(--color-border);
        }

        .fog-actions .btn {
          width: 100%;
          font-size: 0.9rem;
          padding: 0.75rem;
        }
      `}</style>
    </>
  );
};

export default FogOfWar;