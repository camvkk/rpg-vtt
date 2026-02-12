import { useRef, useEffect, useCallback } from 'react';
import * as PIXI from 'pixi.js';
const { Application, Graphics, Container, Text, TextStyle, Assets, Sprite } = PIXI;
import { useGame } from '../contexts/GameContext';
import { 
  snapToGrid, pixelToGrid, gridCenterToPixel, GRID_CONSTANTS,
  getHexDimensions, getHexCorners, hexToPixel, pixelToHex, snapToHex,
  snapToGridUnified, measureDistanceFeet
} from '../utils/gridUtils';

// ── AoE Utility Functions ──
const getAoEColor = (colorType, alpha = 0.3) => {
  const colors = {
    damage: { fill: 0xff6b35, stroke: 0xd63031, alpha },
    healing: { fill: 0x3b82f6, stroke: 0x2563eb, alpha },
    buff: { fill: 0x10b981, stroke: 0x059669, alpha },
    debuff: { fill: 0x8b5cf6, stroke: 0x7c3aed, alpha },
    utility: { fill: 0xf59e0b, stroke: 0xd97706, alpha }
  };
  return colors[colorType] || colors.damage;
};

const createAoEGraphics = (shape, config, x, y, targetX = null, targetY = null, isPreview = false, gridSize = 40) => {
  const graphics = new Graphics();
  const colors = getAoEColor(config.color, isPreview ? 0.15 : 0.3);
  const feetToPixels = (feet) => (feet / 5) * gridSize;
  
  // Set fill and stroke
  graphics.fill({ color: colors.fill, alpha: colors.alpha });
  graphics.setStrokeStyle({ width: 2, color: colors.stroke, alpha: 0.8 });

  switch (shape) {
    case 'circle': {
      const radiusPixels = feetToPixels(config.radius);
      graphics.circle(x, y, radiusPixels);
      break;
    }
    
    case 'cone': {
      const lengthPixels = feetToPixels(config.length);
      const angleRad = (config.angle * Math.PI) / 180;
      
      // Calculate cone direction
      let direction = 0;
      if (targetX !== null && targetY !== null) {
        direction = Math.atan2(targetY - y, targetX - x);
      }
      
      // Create cone path
      const halfAngle = angleRad / 2;
      const startAngle = direction - halfAngle;
      const endAngle = direction + halfAngle;
      
      // Draw cone as a triangle/sector
      graphics.moveTo(x, y);
      graphics.lineTo(
        x + Math.cos(startAngle) * lengthPixels,
        y + Math.sin(startAngle) * lengthPixels
      );
      
      // Add arc for the cone end
      const steps = 8;
      for (let i = 1; i <= steps; i++) {
        const angle = startAngle + (angleRad * i) / steps;
        graphics.lineTo(
          x + Math.cos(angle) * lengthPixels,
          y + Math.sin(angle) * lengthPixels
        );
      }
      
      graphics.lineTo(x, y);
      break;
    }
    
    case 'line': {
      const lengthPixels = feetToPixels(config.length);
      const widthPixels = feetToPixels(config.width);
      
      // Calculate line direction
      let direction = 0;
      if (targetX !== null && targetY !== null) {
        direction = Math.atan2(targetY - y, targetX - x);
      }
      
      // Calculate line endpoints
      const endX = x + Math.cos(direction) * lengthPixels;
      const endY = y + Math.sin(direction) * lengthPixels;
      
      // Create rectangle along the line
      const perpDir = direction + Math.PI / 2;
      const halfWidth = widthPixels / 2;
      
      const p1x = x + Math.cos(perpDir) * halfWidth;
      const p1y = y + Math.sin(perpDir) * halfWidth;
      const p2x = x - Math.cos(perpDir) * halfWidth;
      const p2y = y - Math.sin(perpDir) * halfWidth;
      const p3x = endX - Math.cos(perpDir) * halfWidth;
      const p3y = endY - Math.sin(perpDir) * halfWidth;
      const p4x = endX + Math.cos(perpDir) * halfWidth;
      const p4y = endY + Math.sin(perpDir) * halfWidth;
      
      graphics.moveTo(p1x, p1y);
      graphics.lineTo(p2x, p2y);
      graphics.lineTo(p3x, p3y);
      graphics.lineTo(p4x, p4y);
      graphics.lineTo(p1x, p1y);
      break;
    }
    
    case 'square': {
      const sizePixels = feetToPixels(config.length);
      const halfSize = sizePixels / 2;
      graphics.rect(x - halfSize, y - halfSize, sizePixels, sizePixels);
      break;
    }
  }
  
  graphics.stroke();
  return graphics;
};

import Minimap from './Minimap';

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
  const aoeRef = useRef({ previewGraphics: null, isPlacing: false });
  const aoeMapRef = useRef(new Map());
  const wallPlacementRef = useRef({ isPlacing: false, startPoint: null, graphics: null });
  const wallsMapRef = useRef(new Map());

  const { state, actions } = useGame();
  const { tokens, fogAreas, drawings, walls, map, ui, aoeEffects, player, gridConfig } = state;
  const GRID_SIZE = gridConfig.gridSize || 40;
  const GRID_TYPE = gridConfig.gridType || 'square';
  const SNAP_ENABLED = gridConfig.snapEnabled !== false;
  const GRID_VISIBLE = gridConfig.gridVisible !== false;
  
  // Refs for values accessed in event handlers (avoid stale closures)
  const activeToolRef = useRef(ui.activeTool);
  const isDMRef = useRef(isDM);
  const tokenPlacementRef = useRef(tokenAwaitingPlacement);
  const gridSizeRef = useRef(GRID_SIZE);
  const gridTypeRef = useRef(GRID_TYPE);
  const snapEnabledRef = useRef(SNAP_ENABLED);
  const gridVisibleRef = useRef(GRID_VISIBLE);
  activeToolRef.current = ui.activeTool;
  isDMRef.current = isDM;
  tokenPlacementRef.current = tokenAwaitingPlacement;
  gridSizeRef.current = GRID_SIZE;
  gridTypeRef.current = GRID_TYPE;
  snapEnabledRef.current = SNAP_ENABLED;
  gridVisibleRef.current = GRID_VISIBLE;

  // ── Init Pixi (v8 async API) ──
  useEffect(() => {
    if (!containerRef.current) return;

    let app;
    let destroyed = false;

    (async () => {
      try {
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
      const wallLayer = new Container();
      const lightingLayer = new Container();
      const fogLayer = new Container();
      const uiLayer = new Container();

      app.stage.addChild(bgLayer, gridLayer, tokenLayer, wallLayer, lightingLayer, fogLayer, uiLayer);
      layersRef.current = { bg: bgLayer, grid: gridLayer, token: tokenLayer, wall: wallLayer, lighting: lightingLayer, fog: fogLayer, ui: uiLayer };

      drawGrid(gridLayer, app.screen.width, app.screen.height);
      setupInteractions(app);
      } catch (err) {
        console.error('PIXI INIT ERROR:', err);
      }
    })();

    return () => {
      destroyed = true;
      if (app) {
        if (app._resizeObserver) app._resizeObserver.disconnect();
        
        // Cleanup all token animations before destroying
        tokensMapRef.current.forEach((sprite) => {
          if (sprite._vttCleanup) sprite._vttCleanup();
        });
        tokensMapRef.current.clear();
        
        try {
          const canvas = app.renderer?.canvas;
          if (canvas?._vttCleanup) canvas._vttCleanup();
        } catch (e) { /* canvas may not exist if init didn't complete */ }
        try { app.destroy(true, { children: true }); } catch (e) { /* Pixi v8 destroy race */ }
        pixiRef.current = null;
      }
    };
  }, []);

  // ── Load map background image ──
  useEffect(() => {
    const app = pixiRef.current;
    const bgLayer = layersRef.current.bg;
    if (!app || !bgLayer || !map.url) return;

    let cancelled = false;
    (async () => {
      try {
        // Assets and Sprite already imported statically
        // Resolve URL (could be relative like /public/maps/...)
        const fullUrl = map.url.startsWith('http') ? map.url : 
          (import.meta.env.VITE_SERVER_URL || window.location.origin) + map.url;
        const texture = await Assets.load(fullUrl);
        if (cancelled) return;
        bgLayer.removeChildren();
        const sprite = new Sprite(texture);
        bgLayer.addChild(sprite);
      } catch (err) {
        console.error('Failed to load map:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [map.url]);

  // ── Draw Grid ──
  const drawGrid = useCallback((layer, w, h) => {
    layer.removeChildren();
    if (!gridVisibleRef.current) return;
    
    const g = new Graphics();
    const v = viewRef.current;
    const gs = gridSizeRef.current;
    const gt = gridTypeRef.current;

    if (gt === 'hex') {
      // Pointy-top hex grid
      const { horizSpacing, vertSpacing, size } = getHexDimensions(gs);
      const startCol = Math.floor((-v.panX / v.zoom - horizSpacing) / horizSpacing) - 1;
      const startRow = Math.floor((-v.panY / v.zoom - vertSpacing) / vertSpacing) - 1;
      const endCol = startCol + Math.ceil(w / v.zoom / horizSpacing) + 3;
      const endRow = startRow + Math.ceil(h / v.zoom / vertSpacing) + 3;

      g.setStrokeStyle({ width: 1, color: 0xe2b714, alpha: 0.2 });
      for (let row = startRow; row < endRow; row++) {
        for (let col = startCol; col < endCol; col++) {
          const center = hexToPixel(col, row, gs);
          const corners = getHexCorners(center.x, center.y, gs);
          g.moveTo(corners[0].x, corners[0].y);
          for (let i = 1; i < 6; i++) {
            g.lineTo(corners[i].x, corners[i].y);
          }
          g.lineTo(corners[0].x, corners[0].y);
        }
      }
      g.stroke();
    } else {
      // Square grid
      const startX = Math.floor(-v.panX / v.zoom / gs) * gs;
      const startY = Math.floor(-v.panY / v.zoom / gs) * gs;
      const endX = startX + w / v.zoom + gs * 2;
      const endY = startY + h / v.zoom + gs * 2;

      g.setStrokeStyle({ width: 1, color: 0xe2b714, alpha: 0.2 });
      for (let x = startX; x < endX; x += gs) {
        g.moveTo(x, startY).lineTo(x, endY);
      }
      for (let y = startY; y < endY; y += gs) {
        g.moveTo(startX, y).lineTo(endX, y);
      }
      g.stroke();
    }
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

    // Calculate distance using unified grid API
    const distanceFeet = measureDistanceFeet(
      startPoint.x, startPoint.y, endPoint.x, endPoint.y,
      gridTypeRef.current, gridSizeRef.current
    );

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

  // ── AoE Functions ──
  const showAoEPreview = useCallback((worldX, worldY, targetX = null, targetY = null) => {
    const uiLayer = layersRef.current.ui;
    if (!uiLayer || !ui.aoeConfig) return;

    // Clear previous preview
    if (aoeRef.current.previewGraphics) {
      uiLayer.removeChild(aoeRef.current.previewGraphics);
      aoeRef.current.previewGraphics = null;
    }

    // Create new preview
    const graphics = createAoEGraphics(
      ui.aoeConfig.shape,
      ui.aoeConfig,
      worldX,
      worldY,
      targetX,
      targetY,
      true // isPreview
    );
    
    uiLayer.addChild(graphics);
    aoeRef.current.previewGraphics = graphics;
  }, [ui.aoeConfig]);

  const clearAoEPreview = useCallback(() => {
    const uiLayer = layersRef.current.ui;
    if (uiLayer && aoeRef.current.previewGraphics) {
      uiLayer.removeChild(aoeRef.current.previewGraphics);
      aoeRef.current.previewGraphics = null;
    }
  }, []);

  const placeAoE = useCallback((worldX, worldY, targetX = null, targetY = null) => {
    if (!ui.aoeConfig || !isDM) return;

    const aoeData = {
      id: `aoe_${Date.now()}`,
      shape: ui.aoeConfig.shape,
      x: worldX,
      y: worldY,
      targetX,
      targetY,
      config: { ...ui.aoeConfig },
      timestamp: Date.now(),
      playerName: player?.name || 'DM'
    };

    actions.addAoE(aoeData);
    clearAoEPreview();
  }, [ui.aoeConfig, isDM, actions, clearAoEPreview]);

  const drawAoEEffects = useCallback(() => {
    const uiLayer = layersRef.current.ui;
    if (!uiLayer) return;

    // Clear existing AoE graphics and their animations
    aoeMapRef.current.forEach((graphics) => {
      // Remove animation from ticker
      const app = pixiRef.current;
      if (app && graphics._pulseAnimate) {
        app.ticker.remove(graphics._pulseAnimate);
      }
      uiLayer.removeChild(graphics);
    });
    aoeMapRef.current.clear();

    // Draw all AoE effects
    aoeEffects.forEach((aoe) => {
      const graphics = createAoEGraphics(
        aoe.shape,
        aoe.config,
        aoe.x,
        aoe.y,
        aoe.targetX,
        aoe.targetY,
        false // not preview
      );

      // Add pulsing animation
      let pulseDirection = 1;
      let currentAlpha = 0.3;
      const pulseSpeed = 0.02;
      const minAlpha = 0.2;
      const maxAlpha = 0.5;

      const animate = () => {
        currentAlpha += pulseSpeed * pulseDirection;
        
        if (currentAlpha >= maxAlpha) {
          pulseDirection = -1;
          currentAlpha = maxAlpha;
        } else if (currentAlpha <= minAlpha) {
          pulseDirection = 1;
          currentAlpha = minAlpha;
        }

        graphics.alpha = currentAlpha;
      };

      // Add to ticker for animation
      const app = pixiRef.current;
      if (app) {
        app.ticker.add(animate);
        graphics._pulseAnimate = animate; // Store reference for cleanup
      }

      uiLayer.addChild(graphics);
      aoeMapRef.current.set(aoe.id, graphics);
    });
  }, [aoeEffects]);

  // ── Wall Placement Functions ──
  const startWallPlacement = useCallback((x, y) => {
    wallPlacementRef.current.isPlacing = true;
    wallPlacementRef.current.startPoint = { x, y };
    
    // Create temporary graphics for live preview
    const uiLayer = layersRef.current.ui;
    if (uiLayer) {
      const graphics = new Graphics();
      uiLayer.addChild(graphics);
      wallPlacementRef.current.graphics = graphics;
    }
  }, []);

  const updateWallPlacement = useCallback((x, y) => {
    if (!wallPlacementRef.current.isPlacing || !wallPlacementRef.current.startPoint) return;
    
    if (wallPlacementRef.current.graphics) {
      const graphics = wallPlacementRef.current.graphics;
      graphics.clear();
      
      const start = wallPlacementRef.current.startPoint;
      graphics
        .setStrokeStyle({ width: 4, color: 0x8b5cf6, alpha: 0.8 })
        .moveTo(start.x, start.y)
        .lineTo(x, y)
        .stroke();
      
      // Draw end points
      graphics
        .circle(start.x, start.y, 4)
        .fill({ color: 0x8b5cf6, alpha: 0.8 })
        .circle(x, y, 4)
        .fill({ color: 0x8b5cf6, alpha: 0.8 });
    }
  }, []);

  const finishWallPlacement = useCallback((x, y) => {
    if (!wallPlacementRef.current.isPlacing || !wallPlacementRef.current.startPoint) return;
    
    const start = wallPlacementRef.current.startPoint;
    const end = { x, y };
    
    // Calculate minimum distance to place wall
    const distance = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);
    if (distance > GRID_SIZE / 4) { // Only place if wall is longer than quarter grid size
      actions.addWall(start.x, start.y, end.x, end.y);
    }
    
    // Clean up
    if (wallPlacementRef.current.graphics) {
      const uiLayer = layersRef.current.ui;
      if (uiLayer) {
        uiLayer.removeChild(wallPlacementRef.current.graphics);
      }
      wallPlacementRef.current.graphics = null;
    }
    
    wallPlacementRef.current.isPlacing = false;
    wallPlacementRef.current.startPoint = null;
  }, [actions]);

  const drawWalls = useCallback(() => {
    const wallLayer = layersRef.current.wall;
    if (!wallLayer) return;

    // Clear existing wall graphics
    wallsMapRef.current.forEach((graphics) => {
      wallLayer.removeChild(graphics);
    });
    wallsMapRef.current.clear();

    // Draw all walls
    walls.forEach((wall) => {
      const graphics = new Graphics();
      
      graphics
        .setStrokeStyle({ width: 6, color: 0x4a5568, alpha: 0.9 })
        .moveTo(wall.x1, wall.y1)
        .lineTo(wall.x2, wall.y2)
        .stroke();
      
      // Add end caps
      graphics
        .circle(wall.x1, wall.y1, 3)
        .fill({ color: 0x4a5568, alpha: 0.9 })
        .circle(wall.x2, wall.y2, 3)
        .fill({ color: 0x4a5568, alpha: 0.9 });
      
      wallLayer.addChild(graphics);
      wallsMapRef.current.set(wall.id, graphics);
    });
  }, [walls]);

  // ── Raycasting Algorithm for Dynamic Lighting ──
  const lineIntersection = useCallback((x1, y1, x2, y2, x3, y3, x4, y4) => {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-10) return null; // Lines are parallel
    
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: x1 + t * (x2 - x1),
        y: y1 + t * (y2 - y1),
        distance: Math.sqrt((x1 + t * (x2 - x1) - x1) ** 2 + (y1 + t * (y2 - y1) - y1) ** 2)
      };
    }
    return null;
  }, []);

  const castRay = useCallback((startX, startY, angle, maxDistance) => {
    const endX = startX + Math.cos(angle) * maxDistance;
    const endY = startY + Math.sin(angle) * maxDistance;
    
    let nearestIntersection = null;
    let minDistance = maxDistance;
    
    // Check intersection with all walls
    for (const wall of walls) {
      const intersection = lineIntersection(startX, startY, endX, endY, wall.x1, wall.y1, wall.x2, wall.y2);
      if (intersection && intersection.distance < minDistance) {
        nearestIntersection = intersection;
        minDistance = intersection.distance;
      }
    }
    
    if (nearestIntersection) {
      return { x: nearestIntersection.x, y: nearestIntersection.y };
    }
    return { x: endX, y: endY };
  }, [walls, lineIntersection]);

  const calculateVisibilityPolygon = useCallback((lightX, lightY, lightRadius) => {
    const maxDistance = lightRadius * GRID_SIZE;
    const rays = [];
    
    // Cast rays at regular intervals
    const angleStep = Math.PI / 180; // 1 degree in radians
    for (let angle = 0; angle < Math.PI * 2; angle += angleStep) {
      const endpoint = castRay(lightX, lightY, angle, maxDistance);
      rays.push(endpoint);
    }
    
    // Add extra rays toward wall endpoints for sharp shadows
    for (const wall of walls) {
      const wallPoints = [
        { x: wall.x1, y: wall.y1 },
        { x: wall.x2, y: wall.y2 }
      ];
      
      for (const point of wallPoints) {
        const dx = point.x - lightX;
        const dy = point.y - lightY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < maxDistance) {
          // Cast rays slightly offset from the wall endpoint
          const baseAngle = Math.atan2(dy, dx);
          const offsets = [-0.01, 0.01]; // Small angle offsets in radians
          
          for (const offset of offsets) {
            const angle = baseAngle + offset;
            const endpoint = castRay(lightX, lightY, angle, maxDistance);
            rays.push(endpoint);
          }
        }
      }
    }
    
    // Sort rays by angle for proper polygon creation
    rays.sort((a, b) => {
      const angleA = Math.atan2(a.y - lightY, a.x - lightX);
      const angleB = Math.atan2(b.y - lightY, b.x - lightX);
      return angleA - angleB;
    });
    
    return rays;
  }, [walls, castRay]);

  const drawDynamicLighting = useCallback(() => {
    const lightingLayer = layersRef.current.lighting;
    if (!lightingLayer) return;

    // Clear previous lighting
    lightingLayer.removeChildren();

    // Find tokens with light sources
    const lightSources = tokens.filter(token => token.lightRadius && token.lightRadius > 0);

    if (lightSources.length === 0) {
      // No light sources and no walls — skip darkness overlay entirely
      // (only apply dynamic lighting when the system is actually in use)
      if (walls.length === 0) return;
    }

    // Create darkness overlay with holes for lit areas
    const darkness = new Graphics();
    darkness.rect(0, 0, 4000, 4000).fill({ color: 0x000000, alpha: 0.85 });

    // Create visibility holes for each light source
    for (const token of lightSources) {
      try {
        // Calculate token center position in world coordinates
        let tokenWorldX, tokenWorldY;
        if (GRID_TYPE === 'hex') {
          const hpos = hexToPixel(token.x, token.y, GRID_SIZE);
          tokenWorldX = hpos.x;
          tokenWorldY = hpos.y;
        } else {
          tokenWorldX = (token.x + 0.5) * GRID_SIZE;
          tokenWorldY = (token.y + 0.5) * GRID_SIZE;
        }
        
        // Calculate visibility polygon
        const visibilityPoints = calculateVisibilityPolygon(tokenWorldX, tokenWorldY, token.lightRadius);
        
        if (visibilityPoints.length > 3) { // Need at least 3 points for a polygon
          // Create visibility polygon as a hole in darkness
          const firstPoint = visibilityPoints[0];
          darkness.moveTo(firstPoint.x, firstPoint.y);
          
          for (let i = 1; i < visibilityPoints.length; i++) {
            darkness.lineTo(visibilityPoints[i].x, visibilityPoints[i].y);
          }
          
          darkness.closePath().cut(); // Cut a hole in the darkness
        }
      } catch (error) {
        console.warn('Error creating visibility polygon for token:', token.name, error);
      }
    }

    lightingLayer.addChild(darkness);
  }, [tokens, walls, calculateVisibilityPolygon]);

  // ── Update view transform ──
  const applyTransform = useCallback(() => {
    const v = viewRef.current;
    const { bg, grid, token, wall, lighting, fog, ui } = layersRef.current;
    [bg, grid, token, wall, lighting, fog, ui].forEach(c => {
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
      } else if (e.button === 0 && activeToolRef.current === 'fog' && isDMRef.current) {
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
      } else if (e.button === 0 && activeToolRef.current === 'add-token' && tokenPlacementRef.current && isDMRef.current) {
        // Token placement mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        const gs = gridSizeRef.current;
        const gt = gridTypeRef.current;
        let grid;
        if (gt === 'hex') {
          const hex = pixelToHex(worldX, worldY, gs);
          grid = { x: hex.col, y: hex.row };
        } else {
          grid = pixelToGrid(worldX, worldY, gs);
        }
        
        // Place token at grid position
        const newToken = {
          ...tokenPlacementRef.current,
          x: grid.x,
          y: grid.y
        };
        actions.addToken(newToken);
        onTokenPlaced();
        actions.setActiveTool('select');
      } else if (e.button === 0 && activeToolRef.current === 'measure') {
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
      } else if (e.button === 0 && activeToolRef.current === 'draw' && isDMRef.current) {
        // Drawing mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        startDrawing(worldX, worldY);
      } else if (e.button === 0 && activeToolRef.current === 'wall' && isDMRef.current) {
        // Wall placement mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        startWallPlacement(worldX, worldY);
      } else if (e.button === 0 && activeToolRef.current === 'aoe' && isDMRef.current) {
        // AoE placement mode
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        // Snap to grid center for placement
        const snappedPos = snapToGridUnified(worldX, worldY, gridTypeRef.current, gridSizeRef.current, snapEnabledRef.current);
        
        placeAoE(snappedPos.x, snappedPos.y, worldX, worldY);
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
      } else if (isRevealingFogRef.current && activeToolRef.current === 'fog' && isDMRef.current) {
        // Continue revealing fog while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        revealFogAt(worldX, worldY);
      } else if (rulerRef.current.isActive && activeToolRef.current === 'measure') {
        // Update ruler end point while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        rulerRef.current.endPoint = { x: worldX, y: worldY };
        drawRuler(rulerRef.current.startPoint, rulerRef.current.endPoint);
      } else if (drawingRef.current.isDrawing && activeToolRef.current === 'draw' && isDMRef.current) {
        // Continue drawing while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        continueDrawing(worldX, worldY);
      } else if (wallPlacementRef.current.isPlacing && activeToolRef.current === 'wall' && isDMRef.current) {
        // Update wall placement preview while dragging
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        updateWallPlacement(worldX, worldY);
      } else if (activeToolRef.current === 'aoe' && isDMRef.current && !v.isPanning) {
        // Show AoE preview on hover
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        // Snap to grid center for preview
        const snappedPos = snapToGridUnified(worldX, worldY, gridTypeRef.current, gridSizeRef.current, snapEnabledRef.current);
        
        showAoEPreview(snappedPos.x, snappedPos.y, worldX, worldY);
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
      if (rulerRef.current.isActive && activeToolRef.current === 'measure') {
        // Keep the ruler visible for a bit, then clear it
        setTimeout(() => {
          if (ui.activeTool !== 'measure') {
            clearRuler();
          }
        }, 3000); // Auto-clear after 3 seconds
        rulerRef.current.isActive = false;
      }
      
      // Finish drawing
      if (drawingRef.current.isDrawing && activeToolRef.current === 'draw' && isDMRef.current) {
        finishDrawing();
      }
      
      // Finish wall placement
      if (wallPlacementRef.current.isPlacing && activeToolRef.current === 'wall' && isDMRef.current) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const v = viewRef.current;
        const worldX = (canvasX - v.panX) / v.zoom;
        const worldY = (canvasY - v.panY) / v.zoom;
        
        finishWallPlacement(worldX, worldY);
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

  // ── Clear wall placement when tool changes ──
  useEffect(() => {
    if (ui.activeTool !== 'wall' && wallPlacementRef.current.isPlacing) {
      // Clean up wall placement preview
      if (wallPlacementRef.current.graphics) {
        const uiLayer = layersRef.current.ui;
        if (uiLayer) {
          uiLayer.removeChild(wallPlacementRef.current.graphics);
        }
        wallPlacementRef.current.graphics = null;
      }
      wallPlacementRef.current.isPlacing = false;
      wallPlacementRef.current.startPoint = null;
    }
  }, [ui.activeTool]);

  // ── Sync walls ──
  useEffect(() => {
    drawWalls();
  }, [walls, drawWalls]);

  // ── Sync dynamic lighting ──
  useEffect(() => {
    drawDynamicLighting();
  }, [tokens, walls, drawDynamicLighting]);

  // ── Sync AoE effects ──
  useEffect(() => {
    drawAoEEffects();
  }, [aoeEffects, drawAoEEffects]);

  // ── Clear AoE preview when tool changes ──
  useEffect(() => {
    if (ui.activeTool !== 'aoe') {
      clearAoEPreview();
    }
  }, [ui.activeTool, clearAoEPreview]);

  // ── Redraw grid when config changes ──
  useEffect(() => {
    const app = pixiRef.current;
    const gridLayer = layersRef.current.grid;
    if (app && gridLayer) {
      drawGrid(gridLayer, app.screen.width, app.screen.height);
    }
  }, [GRID_SIZE, GRID_TYPE, GRID_VISIBLE, drawGrid]);

  // ── Create a token sprite with visual effects (Pixi v8) ──
  const createTokenSprite = useCallback((token) => {
    const c = new Container();
    const sizeMultiplier = token.size === 'small' ? 0.7 : token.size === 'large' ? 1.5 : 1;
    const baseRadius = 18 * sizeMultiplier;
    const conditions = token.conditions || [];
    const hp = token.hp || null;

    // Store references for animations and cleanup
    const tokenRefs = { 
      animations: [],
      baseElement: null,
      effectsContainer: new Container()
    };

    // Create effects container (for animations and overlays)
    c.addChild(tokenRefs.effectsContainer);

    // Apply condition-based visual effects BEFORE creating the main sprite
    const isInvisible = conditions.some(c => c.name === 'Invisível');
    const isPoisoned = conditions.some(c => c.name === 'Envenenado');
    const isProne = conditions.some(c => c.name === 'Prone');
    const isConcentrating = conditions.some(c => c.name === 'Concentrating');

    // Draw light radius indicator if token has light (DM only)
    if (token.lightRadius && token.lightRadius > 0 && isDM) {
      const lightCircle = new Graphics();
      lightCircle.circle(0, 0, token.lightRadius * GRID_SIZE)
        .stroke({ width: 2, color: 0xffd700, alpha: 0.3 });
      tokenRefs.effectsContainer.addChild(lightCircle);
    }

    // Create main token container
    const tokenContainer = new Container();
    
    // Apply prone effect (flatten token)
    if (isProne) {
      tokenContainer.scale.y = 0.6; // Visually "flattened"
    }

    // Apply invisible effect (semi-transparent for DM, hidden for players)
    if (isInvisible) {
      tokenContainer.alpha = isDM ? 0.3 : (state.player.isDM ? 0.3 : 0.1);
    }

    // Create fallback colored circle first
    const circle = new Graphics();
    const color = token.color || 0x3b82f6;
    
    // Apply poison tint
    let fillColor = color;
    let fillAlpha = 0.85;
    if (isPoisoned) {
      fillColor = 0x44cc44; // Green tint
      fillAlpha = 0.9;
      
      // Add green glow effect
      const glowCircle = new Graphics();
      glowCircle.circle(0, 0, baseRadius + 4).fill({ color: 0x44cc44, alpha: 0.3 });
      tokenRefs.effectsContainer.addChild(glowCircle);
    }

    circle.circle(0, 0, baseRadius).fill({ color: fillColor, alpha: fillAlpha }).stroke({ width: 2, color: 0xffffff });
    tokenContainer.addChild(circle);
    tokenRefs.baseElement = circle;

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
    tokenContainer.addChild(label);

    // Add token container to main container
    c.addChild(tokenContainer);

    // If token has an image, load it asynchronously
    if (token.imageUrl) {
      (async () => {
        try {
          const GraphicsMask = Graphics;
          // Resolve URL (could be relative like /public/tokens/...)
          const fullUrl = token.imageUrl.startsWith('http') ? token.imageUrl : 
            (import.meta.env.VITE_SERVER_URL || window.location.origin) + token.imageUrl;
          
          const texture = await Assets.load(fullUrl);
          
          // Create image sprite
          const sprite = new Sprite(texture);
          sprite.anchor.set(0.5);
          
          // Scale to fit the token size
          const diameter = baseRadius * 2;
          const scale = Math.min(diameter / texture.width, diameter / texture.height);
          sprite.scale.set(scale);
          
          // Create circular mask
          const mask = new GraphicsMask();
          mask.circle(0, 0, baseRadius).fill({ color: 0xffffff });
          sprite.mask = mask;
          tokenContainer.addChild(mask); // Add mask to container
          
          // Replace circle and label with image
          tokenContainer.removeChild(circle);
          tokenContainer.removeChild(label);
          tokenContainer.addChildAt(sprite, 0); // Add image at bottom layer
          tokenRefs.baseElement = sprite;
          
        } catch (err) {
          console.warn('Failed to load token image, using fallback:', err);
          // Keep the colored circle as fallback
        }
      })();
    }

    // ── Condition Visual Effects ──
    
    // Concentrating: Blue ring around token
    if (isConcentrating) {
      const concentrationRing = new Graphics();
      concentrationRing.circle(0, 0, baseRadius + 6).stroke({ width: 3, color: 0x3b82f6, alpha: 0.8 });
      tokenRefs.effectsContainer.addChild(concentrationRing);
    }

    // Stunned: Spinning yellow stars
    const isStunned = conditions.some(c => c.name === 'Atordoado');
    if (isStunned) {
      const starsContainer = new Container();
      
      // Create multiple star shapes around the token
      for (let i = 0; i < 3; i++) {
        const star = new Graphics();
        const angle = (i * Math.PI * 2) / 3;
        const radius = baseRadius + 15;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        
        // Simple star shape (could be improved)
        star.star(0, 0, 4, 8, 0, 0).fill({ color: 0xffdd44, alpha: 0.8 });
        star.position.set(x, y);
        starsContainer.addChild(star);
      }
      
      tokenRefs.effectsContainer.addChild(starsContainer);
      
      // Animation: rotate stars around token
      if (pixiRef.current) {
        const animateSpin = (delta) => {
          starsContainer.rotation += 0.05 * delta;
        };
        pixiRef.current.ticker.add(animateSpin);
        tokenRefs.animations.push(() => pixiRef.current?.ticker.remove(animateSpin));
      }
    }

    // On fire/burning: Orange particle effect
    const isBurning = conditions.some(c => c.name && (
      c.name.toLowerCase().includes('queimando') || 
      c.name.toLowerCase().includes('chamas') || 
      c.name.toLowerCase().includes('fogo') || 
      c.name.toLowerCase().includes('burning') ||
      c.name === 'Em Chamas' ||
      c.name === 'Queimando'
    ));
    if (isBurning) {
      const fireContainer = new Container();
      
      // Create simple fire particles
      for (let i = 0; i < 6; i++) {
        const particle = new Graphics();
        const size = 2 + Math.random() * 3;
        particle.circle(0, 0, size).fill({ color: 0xff6600, alpha: 0.7 });
        
        // Random position around token
        const angle = Math.random() * Math.PI * 2;
        const radius = baseRadius + Math.random() * 10;
        particle.position.set(
          Math.cos(angle) * radius,
          Math.sin(angle) * radius - 5
        );
        
        fireContainer.addChild(particle);
      }
      
      tokenRefs.effectsContainer.addChild(fireContainer);
      
      // Animation: flicker particles
      if (pixiRef.current) {
        let time = 0;
        const animateFirey = (delta) => {
          time += 0.1 * delta;
          fireContainer.children.forEach((particle, i) => {
            particle.alpha = 0.5 + 0.3 * Math.sin(time + i * 0.5);
            particle.y += Math.sin(time + i) * 0.5;
          });
        };
        pixiRef.current.ticker.add(animateFirey);
        tokenRefs.animations.push(() => pixiRef.current?.ticker.remove(animateFirey));
      }
    }

    // Default condition indicators: small colored dots for other conditions
    const specialConditions = ['Invisível', 'Envenenado', 'Prone', 'Atordoado', 'Concentrating'];
    const otherConditions = conditions.filter(c => !specialConditions.includes(c.name));
    
    if (otherConditions.length > 0) {
      const indicatorsContainer = new Container();
      
      otherConditions.forEach((condition, index) => {
        const indicator = new Graphics();
        const dotSize = 3;
        const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];
        const color = colors[index % colors.length];
        
        indicator.circle(0, 0, dotSize).fill({ color, alpha: 0.9 });
        
        // Position dots in a row below the token
        const spacing = 8;
        const totalWidth = (otherConditions.length - 1) * spacing;
        const startX = -totalWidth / 2;
        
        indicator.position.set(startX + index * spacing, baseRadius + 20);
        indicatorsContainer.addChild(indicator);
        
        // Add tooltip-like text on hover (simple implementation)
        indicator.eventMode = 'static';
        const tooltipText = new Text({
          text: `${condition.icon || '⚡'} ${condition.name}`,
          style: new TextStyle({
            fontFamily: 'Inter, sans-serif',
            fontSize: 8,
            fill: 0xffffff,
            stroke: { color: 0x000000, width: 1 },
          }),
        });
        tooltipText.anchor.set(0.5, 1);
        tooltipText.position.set(0, -5);
        tooltipText.visible = false;
        indicator.addChild(tooltipText);
        
        indicator.on('pointerover', () => { tooltipText.visible = true; });
        indicator.on('pointerout', () => { tooltipText.visible = false; });
      });
      
      tokenRefs.effectsContainer.addChild(indicatorsContainer);
    }

    // ── HP Bar ──
    if (hp && hp.max > 0) {
      const hpBarContainer = new Container();
      
      const barWidth = baseRadius * 2;
      const barHeight = 4;
      const currentHP = Math.max(0, hp.current || 0);
      const maxHP = hp.max;
      const tempHP = hp.temp || 0;
      const percentage = currentHP / maxHP;
      
      // Background bar
      const bgBar = new Graphics();
      bgBar.rect(-barWidth / 2, 0, barWidth, barHeight).fill({ color: 0x333333, alpha: 0.8 });
      hpBarContainer.addChild(bgBar);
      
      // HP fill with color gradient
      if (currentHP > 0) {
        const hpBar = new Graphics();
        let hpColor;
        if (percentage > 0.75) hpColor = 0x44cc44; // Green
        else if (percentage > 0.5) hpColor = 0xcccc44; // Yellow
        else if (percentage > 0.25) hpColor = 0xcc8844; // Orange
        else hpColor = 0xcc4444; // Red
        
        const fillWidth = (currentHP / maxHP) * barWidth;
        hpBar.rect(-barWidth / 2, 0, fillWidth, barHeight).fill({ color: hpColor, alpha: 0.9 });
        hpBarContainer.addChild(hpBar);
      }
      
      // Temp HP (additional blue bar)
      if (tempHP > 0) {
        const tempBar = new Graphics();
        const tempWidth = Math.min((tempHP / maxHP) * barWidth, barWidth * 0.3); // Cap temp HP visual
        tempBar.rect(barWidth / 2 - tempWidth, 0, tempWidth, barHeight).fill({ color: 0x4488cc, alpha: 0.7 });
        hpBarContainer.addChild(tempBar);
      }
      
      // Position HP bar below name tag
      hpBarContainer.position.set(0, baseRadius + 18);
      c.addChild(hpBarContainer);
    }

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
    nameTag.position.set(0, baseRadius + 6);
    c.addChild(nameTag);

    c.eventMode = 'static';
    c.cursor = 'pointer';

    // Store cleanup function for animations
    c._vttCleanup = () => {
      tokenRefs.animations.forEach(cleanup => cleanup());
      tokenRefs.animations = [];
    };

    // Drag
    let dragging = false;
    let dragOffset = { x: 0, y: 0 };

    c.on('pointerdown', (e) => {
      if (activeToolRef.current !== 'select') return;
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
      const rawX = local.x - dragOffset.x;
      const rawY = local.y - dragOffset.y;
      const snapped = snapToGridUnified(rawX, rawY, gridTypeRef.current, gridSizeRef.current, snapEnabledRef.current);
      c.position.set(snapped.x, snapped.y);
    });
    c.on('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      c.alpha = 1;
      // Convert pixel position back to grid coords
      const gs = gridSizeRef.current;
      const gt = gridTypeRef.current;
      let gridX, gridY;
      if (gt === 'hex') {
        const hex = pixelToHex(c.x, c.y, gs);
        gridX = hex.col;
        gridY = hex.row;
      } else {
        gridX = Math.round((c.x - gs / 2) / gs);
        gridY = Math.round((c.y - gs / 2) / gs);
      }
      actions.moveToken(token.id, gridX, gridY);
    });
    c.on('pointerupoutside', () => {
      if (!dragging) return;
      dragging = false;
      c.alpha = 1;
    });

    return c;
  }, [actions, isDM, state.player.isDM]);

  // ── Sync tokens to Pixi ──
  useEffect(() => {
    const layer = layersRef.current.token;
    if (!layer) return;

    const existing = tokensMapRef.current;
    const currentIds = new Set(tokens.map(t => t.id));

    // Remove old
    existing.forEach((sprite, id) => {
      if (!currentIds.has(id)) {
        if (sprite._vttCleanup) sprite._vttCleanup();
        layer.removeChild(sprite);
        existing.delete(id);
      }
    });

    // Add / update
    tokens.forEach((token) => {
      let sprite = existing.get(token.id);
      const needsRecreate = sprite && (
        JSON.stringify(sprite._lastConditions) !== JSON.stringify(token.conditions) ||
        JSON.stringify(sprite._lastHP) !== JSON.stringify(token.hp)
      );
      
      if (!sprite || needsRecreate) {
        if (sprite) {
          if (sprite._vttCleanup) sprite._vttCleanup();
          layer.removeChild(sprite);
        }
        
        sprite = createTokenSprite(token);
        sprite._lastConditions = JSON.parse(JSON.stringify(token.conditions || []));
        sprite._lastHP = JSON.parse(JSON.stringify(token.hp || null));
        
        layer.addChild(sprite);
        existing.set(token.id, sprite);
      }
      
      let pos;
      if (GRID_TYPE === 'hex') {
        pos = hexToPixel(token.x || 0, token.y || 0, GRID_SIZE);
      } else {
        pos = gridCenterToPixel(token.x || 0, token.y || 0, GRID_SIZE);
      }
      sprite.position.set(pos.x, pos.y);
    });
  }, [tokens, createTokenSprite, GRID_SIZE, GRID_TYPE]);

  // Minimap navigation
  const handleMinimapNavigate = useCallback((worldX, worldY) => {
    const app = pixiRef.current;
    if (!app) return;
    const v = viewRef.current;
    v.panX = -worldX * v.zoom + app.screen.width / 2;
    v.panY = -worldY * v.zoom + app.screen.height / 2;
    const { bg, grid, token, wall, lighting, fog, ui } = layersRef.current;
    [bg, grid, token, wall, lighting, fog, ui].forEach(c => {
      if (!c) return;
      c.scale.set(v.zoom);
      c.position.set(v.panX, v.panY);
    });
    if (layersRef.current.grid) drawGrid(layersRef.current.grid, app.screen.width, app.screen.height);
  }, [drawGrid]);

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
        position: 'relative',
      }}
    >
      <Minimap
        viewRef={viewRef}
        pixiRef={pixiRef}
        onNavigate={handleMinimapNavigate}
      />
    </div>
  );
}
