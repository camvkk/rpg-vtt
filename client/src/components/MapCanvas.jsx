import { useRef, useEffect, useCallback } from 'react';
import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import { useGame } from '../contexts/GameContext';
import { snapToGrid, pixelToGrid, gridCenterToPixel, GRID_CONSTANTS } from '../utils/gridUtils';

const GRID_SIZE = GRID_CONSTANTS.SIZE;

export default function MapCanvas({ 
  isDM = false, 
  tokenAwaitingPlacement = null, 
  onTokenPlaced = () => {},
  drawColor = '#ff6b6b'
}) {
  const containerRef = useRef(null);
  const pixiRef = useRef(null);
  const layersRef = useRef({});
  const viewRef = useRef({ zoom: 1, panX: 0, panY: 0, isPanning: false, lastPan: { x: 0, y: 0 } });
  const tokensMapRef = useRef(new Map());
  const isRevealingFogRef = useRef(false);
  const rulerRef = useRef({ isActive: false, startPoint: null, endPoint: null, graphics: null });
  const drawingRef = useRef({ isDrawing: false, currentPath: [], graphics: null });
  const drawingsMapRef = useRef(new Map());

  const { state, actions } = useGame();
  const { tokens, fogAreas, drawings, map, ui } = state;

  // ── Init Pixi (v8 async API) ──
  useEffect(() => {
    if (!containerRef.current) return;

    let app;
    let destroyed = false;

    (async () => {
      app = new Application();
      const container = containerRef.current;
      const { width, height } = container.getBoundingClientRect();
      await app.init({
        width: Math.max(width, 100),
        height: Math.max(height, 100),
        background: 0x0f0f1a,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (destroyed) { app.destroy(true, { children: true }); return; }

      container.appendChild(app.canvas);
      pixiRef.current = app;

      // Manual resize observer (avoids Pixi v8 resizeTo bug)
      const resizeObserver = new ResizeObserver((entries) => {
        if (!app || destroyed) return;
        const { width: w, height: h } = entries[0].contentRect;
        if (w > 0 && h > 0) app.renderer.resize(w, h);
      });
      resizeObserver.observe(container);
      app._resizeObserver = resizeObserver;

      // Create ordered layers
      const bgLayer = new Container();
      const gridLayer = new Container();
      const tokenLayer = new Container();
      const fogLayer = new Container();
      const uiLayer = new Container();

      app.stage.addChild(bgLayer, gridLayer, tokenLayer, fogLayer, uiLayer);
      layersRef.current = { bg: bgLayer, grid: gridLayer, token: tokenLayer, fog: fogLayer, ui: uiLayer };

      drawGrid(gridLayer, app.screen.width, app.screen.height);
      setupInteractions(app);
    })();

    return () => {
      destroyed = true;
      if (app) {
        if (app._resizeObserver) app._resizeObserver.disconnect();
        try { app.destroy(true, { children: true }); } catch (e) { /* Pixi v8 destroy race */ }
        pixiRef.current = null;
      }
    };
  }, []);

  // ── Draw Grid ──
  const drawGrid = useCallback((layer, w, h) => {
    layer.removeChildren();
    const g = new Graphics();
    const v = viewRef.current;
    const startX = Math.floor(-v.panX / v.zoom / GRID_SIZE) * GRID_SIZE;
    const startY = Math.floor(-v.panY / v.zoom / GRID_SIZE) * GRID_SIZE;
    const endX = startX + w / v.zoom + GRID_SIZE * 2;
    const endY = startY + h / v.zoom + GRID_SIZE * 2;

    g.setStrokeStyle({ width: 1, color: 0xe2b714, alpha: 0.2 });
    for (let x = startX; x < endX; x += GRID_SIZE) {
      g.moveTo(x, startY).lineTo(x, endY);
    }
    for (let y = startY; y < endY; y += GRID_SIZE) {
      g.moveTo(startX, y).lineTo(endX, y);
    }
    g.stroke();
    layer.addChild(g);
  }, []);

  // ── Fog of War Functions ──
  const drawFogOfWar = useCallback(() => {
    const fogLayer = layersRef.current.fog;
    if (!fogLayer) return;

    fogLayer.removeChildren();

    // Create fog overlay (dark covering the entire map)
    const fog = new Graphics();
    
    // Cover the entire map area with dark fog
    fog.rect(0, 0, 4000, 4000).fill({ color: 0x000000, alpha: 0.8 });

    // Cut out revealed areas using holes
    fogAreas.forEach(area => {
      if (area.radius) {
        // Circular revealed area
        fog.circle(area.x, area.y, area.radius).cut();
      }
    });

    fogLayer.addChild(fog);
  }, [fogAreas]);

  // Reveal fog at a position (for DM only)
  const revealFogAt = useCallback((worldX, worldY, radius = GRID_SIZE * 1.5) => {
    if (!isDM) return;
    actions.revealFog(worldX, worldY, radius);
  }, [isDM, actions]);

  // ── Ruler Functions ──
  const drawRuler = useCallback((startPoint, endPoint) => {
    const uiLayer = layersRef.current.ui;
    if (!uiLayer) return;

    // Clear previous ruler
    if (rulerRef.current.graphics) {
      uiLayer.removeChild(rulerRef.current.graphics);
      rulerRef.current.graphics = null;
    }

    if (!startPoint || !endPoint) return;

    const graphics = new Graphics();
    
    // Draw line
    graphics
      .setStrokeStyle({ width: 3, color: 0xff6b6b, alpha: 0.8 })
      .moveTo(startPoint.x, startPoint.y)
      .lineTo(endPoint.x, endPoint.y)
      .stroke();

    // Draw start point
    graphics
      .circle(startPoint.x, startPoint.y, 8)
      .fill({ color: 0xff6b6b, alpha: 0.6 });

    // Draw end point  
    graphics
      .circle(endPoint.x, endPoint.y, 8)
      .fill({ color: 0xff6b6b, alpha: 0.6 });

    // Calculate distance in grid squares (5ft each)
    const deltaX = Math.abs(endPoint.x - startPoint.x);
    const deltaY = Math.abs(endPoint.y - startPoint.y);
    const distancePixels = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const distanceSquares = distancePixels / GRID_SIZE;
    const distanceFeet = Math.round(distanceSquares * 5);

    // Draw distance text
    const midX = (startPoint.x + endPoint.x) / 2;
    const midY = (startPoint.y + endPoint.y) / 2;
    
    const textStyle = new TextStyle({
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fill: 0xffffff,
      fontWeight: 'bold',
      stroke: { color: 0x000000, width: 2 },
      dropShadow: {
        color: 0x000000,
        angle: 0,
        blur: 4,
        distance: 2
      }
    });

    const distanceText = new Text({
      text: `${distanceFeet}ft`,
      style: textStyle
    });
    
    distanceText.anchor.set(0.5);
    distanceText.x = midX;
    distanceText.y = midY - 20; // Offset above the line

    graphics.addChild(distanceText);
    uiLayer.addChild(graphics);
    rulerRef.current.graphics = graphics;
  }, []);

  const clearRuler = useCallback(() => {
    const uiLayer = layersRef.current.ui;
    if (uiLayer && rulerRef.current.graphics) {
      uiLayer.removeChild(rulerRef.current.graphics);
      rulerRef.current.graphics = null;
    }
    rulerRef.current.isActive = false;
    rulerRef.current.startPoint = null;
    rulerRef.current.endPoint = null;
  }, []);

  // ── Drawing Functions ──
  const startDrawing = useCallback((x, y) => {
    drawingRef.current.isDrawing = true;
    drawingRef.current.currentPath = [{ x, y }];
    
    // Create temporary graphics for live preview
    const uiLayer = layersRef.current.ui;
    if (uiLayer) {
      const graphics = new Graphics();
      uiLayer.addChild(graphics);
      drawingRef.current.graphics = graphics;
    }
  }, []);

  const continueDrawing = useCallback((x, y) => {
    if (!drawingRef.current.isDrawing) return;
    
    drawingRef.current.currentPath.push({ x, y });
    
    // Update live preview
    if (drawingRef.current.graphics) {
      const graphics = drawingRef.current.graphics;
      graphics.clear();
      
      if (drawingRef.current.currentPath.length > 1) {
        graphics.setStrokeStyle({ 
          width: 3, 
          color: parseInt(drawColor.slice(1), 16), 
          alpha: 0.8 
        });
        
        const path = drawingRef.current.currentPath;
        graphics.moveTo(path[0].x, path[0].y);
        for (let i = 1; i < path.length; i++) {
          graphics.lineTo(path[i].x, path[i].y);
        }
        graphics.stroke();
      }
    }
  }, [drawColor]);

  const finishDrawing = useCallback(() => {
    if (!drawingRef.current.isDrawing) return;
    
    const path = drawingRef.current.currentPath;
    if (path.length > 1) {
      // Send the drawing to the server
      actions.addDraw('line', path, drawColor, 3);
    }
    
    // Clean up
    if (drawingRef.current.graphics) {
      const uiLayer = layersRef.current.ui;
      if (uiLayer) {
        uiLayer.removeChild(drawingRef.current.graphics);
      }
      drawingRef.current.graphics = null;
    }
    
    drawingRef.current.isDrawing = false;
    drawingRef.current.currentPath = [];
  }, [actions, drawColor]);

  const drawSavedDrawings = useCallback(() => {
    const uiLayer = layersRef.current.ui;
    if (!uiLayer) return;

    // Clear existing drawings
    drawingsMapRef.current.forEach((graphics) => {
      uiLayer.removeChild(graphics);
    });
    drawingsMapRef.current.clear();

    // Draw all saved drawings
    drawings.forEach((drawing) => {
      const graphics = new Graphics();
      
      if (drawing.type === 'line' && drawing.points.length > 1) {
        graphics.setStrokeStyle({ 
          width: drawing.strokeWidth || 3, 
          color: parseInt(drawing.color.slice(1), 16), 
          alpha: 0.8 
        });
        
        graphics.moveTo(drawing.points[0].x, drawing.points[0].y);
        for (let i = 1; i < drawing.points.length; i++) {
          graphics.lineTo(drawing.points[i].x, drawing.points[i].y);
        }
        graphics.stroke();
      }
      
      uiLayer.addChild(graphics);
      drawingsMapRef.current.set(drawing.id, graphics);
    });
  }, [drawings]);

  const clearAllDrawings = useCallback(() => {
    const uiLayer = layersRef.current.ui;
    if (uiLayer) {
      drawingsMapRef.current.forEach((graphics) => {
        uiLayer.removeChild(graphics);
      });
      drawingsMapRef.current.clear();
    }
  }, []);

  // ── Update view transform ──
  const applyTransform = useCallback(() => {
    const v = viewRef.current;
    const { bg, grid, token, fog } = layersRef.current;
    [bg, grid, token, fog].forEach(c => {
      if (!c) return;
      c.scale.set(v.zoom);
      c.position.set(v.panX, v.panY);
    });
  }, []);

  // ── Interactions ──
  const setupInteractions = useCallback((app) => {
    const canvas = app.canvas;
    let spaceDown = false;

    // Zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const v = viewRef.current;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.15, Math.min(4, v.zoom * factor));

      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - v.panX) / v.zoom;
      const wy = (my - v.panY) / v.zoom;

      v.zoom = newZoom;
      v.panX = mx - wx * newZoom;
      v.panY = my - wy * newZoom;

      applyTransform();
      if (layersRef.current.grid) {
        drawGrid(layersRef.current.grid, app.screen.width, app.screen.height);
      }
    }, { passive: false });

    // Pan
    const keyDown = (e) => { if (e.code === 'Space' && !e.repeat) { spaceDown = true; canvas.style.cursor = 'grab'; } };
    const keyUp = (e) => { if (e.code === 'Space') { spaceDown = false; canvas.style.cursor = 'default'; viewRef.current.isPanning = false; } };
    document.addEventListener('keydown', keyDown);
    document.addEventListener('keyup', keyUp);

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 1 || (e.button === 0 && spaceDown)) {
        e.preventDefault();
        viewRef.current.isPanning = true;
        viewRef.current.lastPan = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
      } else if (e.button === 0 && ui.activeTool === 'fog' && isDM) {
        // Fog reveal mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        revealFogAt(worldX, worldY);
        isRevealingFogRef.current = true;
      } else if (e.button === 0 && ui.activeTool === 'add-token' && tokenAwaitingPlacement && isDM) {
        // Token placement mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        const grid = pixelToGrid(worldX, worldY);
        
        // Place token at grid position
        const newToken = {
          ...tokenAwaitingPlacement,
          x: grid.x,
          y: grid.y
        };
        actions.addToken(newToken);
        onTokenPlaced();
        actions.setActiveTool('select');
      } else if (e.button === 0 && ui.activeTool === 'measure' && isDM) {
        // Ruler/measure mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        // Start measuring
        rulerRef.current.isActive = true;
        rulerRef.current.startPoint = { x: worldX, y: worldY };
        rulerRef.current.endPoint = { x: worldX, y: worldY };
        
        drawRuler(rulerRef.current.startPoint, rulerRef.current.endPoint);
      } else if (e.button === 0 && ui.activeTool === 'draw' && isDM) {
        // Drawing mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        startDrawing(worldX, worldY);
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const v = viewRef.current;
      
      if (v.isPanning) {
        v.panX += e.clientX - v.lastPan.x;
        v.panY += e.clientY - v.lastPan.y;
        v.lastPan = { x: e.clientX, y: e.clientY };
        applyTransform();
        if (layersRef.current.grid) drawGrid(layersRef.current.grid, app.screen.width, app.screen.height);
      } else if (isRevealingFogRef.current && ui.activeTool === 'fog' && isDM) {
        // Continue revealing fog while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        revealFogAt(worldX, worldY);
      } else if (rulerRef.current.isActive && ui.activeTool === 'measure' && isDM) {
        // Update ruler end point while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        rulerRef.current.endPoint = { x: worldX, y: worldY };
        drawRuler(rulerRef.current.startPoint, rulerRef.current.endPoint);
      } else if (drawingRef.current.isDrawing && ui.activeTool === 'draw' && isDM) {
        // Continue drawing while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        continueDrawing(worldX, worldY);
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (e.button === 1 || viewRef.current.isPanning) {
        viewRef.current.isPanning = false;
        canvas.style.cursor = spaceDown ? 'grab' : 'default';
      }
      
      if (isRevealingFogRef.current) {
        isRevealingFogRef.current = false;
      }
      
      // Finish ruler measurement
      if (rulerRef.current.isActive && ui.activeTool === 'measure' && isDM) {
        // Keep the ruler visible for a bit, then clear it
        setTimeout(() => {
          if (ui.activeTool !== 'measure') {
            clearRuler();
          }
        }, 3000); // Auto-clear after 3 seconds
        rulerRef.current.isActive = false;
      }
      
      // Finish drawing
      if (drawingRef.current.isDrawing && ui.activeTool === 'draw' && isDM) {
        finishDrawing();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // Cleanup reference
    canvas._vttCleanup = () => {
      document.removeEventListener('keydown', keyDown);
      document.removeEventListener('keyup', keyUp);
    };
  }, [applyTransform, drawGrid, startDrawing, continueDrawing, finishDrawing]);

  // ── Sync fog of war ──
  useEffect(() => {
    drawFogOfWar();
  }, [fogAreas, drawFogOfWar]);

  // ── Clear ruler when tool changes ──
  useEffect(() => {
    if (ui.activeTool !== 'measure') {
      clearRuler();
    }
  }, [ui.activeTool, clearRuler]);

  // ── Sync drawings ──
  useEffect(() => {
    drawSavedDrawings();
  }, [drawings, drawSavedDrawings]);

  // ── Clear drawing when tool changes ──
  useEffect(() => {
    if (ui.activeTool !== 'draw' && drawingRef.current.isDrawing) {
      finishDrawing();
    }
  }, [ui.activeTool, finishDrawing]);

  // ── Sync tokens to Pixi ──
  useEffect(() => {
    const layer = layersRef.current.token;
    if (!layer) return;

    const existing = tokensMapRef.current;
    const currentIds = new Set(tokens.map(t => t.id));

    // Remove old
    existing.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        layer.removeChild(sprite);
        existing.delete(id);
      }
    });

    // Add / update
    tokens.forEach((token) => {
      let sprite = existing.get(token.id);
      if (!sprite) {
        sprite = createTokenSprite(token);
        layer.addChild(sprite);
        existing.set(token.id, sprite);
      }
      // Update position
      const pos = gridCenterToPixel(token.x || 0, token.y || 0);
      sprite.position.set(pos.x, pos.y);
    });
  }, [tokens]);

  // ── Create a simple token sprite (Pixi v8) ──
  const createTokenSprite = useCallback((token) => {
    const c = new Container();

    const circle = new Graphics();
    const color = token.color || 0x3b82f6;
    circle.circle(0, 0, 18).fill({ color, alpha: 0.85 }).stroke({ width: 2, color: 0xffffff });
    c.addChild(circle);

    const label = new Text({
      text: token.name?.[0]?.toUpperCase() || '?',
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: 14,
        fill: 0xffffff,
        fontWeight: 'bold',
      }),
    });
    label.anchor.set(0.5);
    c.addChild(label);

    const nameTag = new Text({
      text: token.name || '',
      style: new TextStyle({
        fontFamily: 'Inter, sans-serif',
        fontSize: 9,
        fill: 0xe8e8e8,
        stroke: { color: 0x0f0f1a, width: 2 },
      }),
    });
    nameTag.anchor.set(0.5, 0);
    nameTag.position.set(0, 24);
    c.addChild(nameTag);

    c.eventMode = 'static';
    c.cursor = 'pointer';

    // Drag
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };

    c.on('pointerdown', (e) => {
      e.stopPropagation();
      actions.selectToken(token.id);
      dragging = true;
      const local = e.getLocalPosition(c.parent);
      dragOffset = { x: local.x - c.x, y: local.y - c.y };
      c.alpha = 0.7;
    });
    c.on('globalpointermove', (e) => {
      if (!dragging) return;
      const local = e.getLocalPosition(c.parent);
      const snapped = snapToGrid(local.x - dragOffset.x, local.y - dragOffset.y);
      c.position.set(snapped.x + GRID_SIZE / 2, snapped.y + GRID_SIZE / 2);
    });
    c.on('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      c.alpha = 1;
      const grid = pixelToGrid(c.x, c.y);
      actions.moveToken(token.id, grid.x, grid.y);
    });
    c.on('pointerupoutside', () => {
      if (!dragging) return;
      dragging = false;
      c.alpha = 1;
    });

    return c;
  }, [actions]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        background: 'var(--bg-primary)',
      }}
    />
  );
}
