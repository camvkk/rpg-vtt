/**
 * Grid Utilities for RPG VTT
 * Supports both square and hex (pointy-top) grids
 */

const DEFAULT_GRID_SIZE = 40; // pixels per grid cell
const FEET_PER_CELL = 5;

// ── Square Grid ──

export const snapToGrid = (x, y, gridSize = DEFAULT_GRID_SIZE) => ({
  x: Math.round(x / gridSize) * gridSize,
  y: Math.round(y / gridSize) * gridSize
});

export const snapValue = (value, gridSize = DEFAULT_GRID_SIZE) =>
  Math.round(value / gridSize) * gridSize;

export const pixelToGrid = (x, y, gridSize = DEFAULT_GRID_SIZE) => ({
  x: Math.floor(x / gridSize),
  y: Math.floor(y / gridSize)
});

export const gridToPixel = (gridX, gridY, gridSize = DEFAULT_GRID_SIZE) => ({
  x: gridX * gridSize,
  y: gridY * gridSize
});

export const gridCenterToPixel = (gridX, gridY, gridSize = DEFAULT_GRID_SIZE) => ({
  x: gridX * gridSize + gridSize / 2,
  y: gridY * gridSize + gridSize / 2
});

export const gridDistance = (x1, y1, x2, y2) => {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
};

export const distanceInFeet = (x1, y1, x2, y2) =>
  gridDistance(x1, y1, x2, y2) * FEET_PER_CELL;

export const pixelDistance = (x1, y1, x2, y2) =>
  Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

export const isWithinRange = (x1, y1, x2, y2, range) =>
  gridDistance(x1, y1, x2, y2) <= range;

export const getCellsInRange = (centerX, centerY, range) => {
  const cells = [];
  for (let x = centerX - range; x <= centerX + range; x++) {
    for (let y = centerY - range; y <= centerY + range; y++) {
      if (gridDistance(centerX, centerY, x, y) <= range) cells.push({ x, y });
    }
  }
  return cells;
};

export const getGridBounds = (startX, startY, endX, endY) => ({
  minX: Math.min(startX, endX),
  minY: Math.min(startY, endY),
  maxX: Math.max(startX, endX),
  maxY: Math.max(startY, endY)
});

export const isInBounds = (x, y, minX, minY, maxX, maxY) =>
  x >= minX && x <= maxX && y >= minY && y <= maxY;

export const pixelMovementToGrid = (startPixelX, startPixelY, endPixelX, endPixelY, gridSize = DEFAULT_GRID_SIZE) => {
  const startGrid = pixelToGrid(startPixelX, startPixelY, gridSize);
  const endGrid = pixelToGrid(endPixelX, endPixelY, gridSize);
  return {
    start: startGrid,
    end: endGrid,
    distance: gridDistance(startGrid.x, startGrid.y, endGrid.x, endGrid.y)
  };
};

export const generateGridLines = (width, height, offsetX = 0, offsetY = 0, gridSize = DEFAULT_GRID_SIZE) => {
  const lines = [];
  for (let x = offsetX % gridSize; x < width; x += gridSize) {
    lines.push({ type: 'vertical', x1: x, y1: 0, x2: x, y2: height });
  }
  for (let y = offsetY % gridSize; y < height; y += gridSize) {
    lines.push({ type: 'horizontal', x1: 0, y1: y, x2: width, y2: y });
  }
  return lines;
};

// ── Hex Grid (Pointy-Top) ──
// Pointy-top hex: flat sides on left/right, points on top/bottom
// Using offset coordinates (odd-r: odd rows shifted right)

/**
 * Get hex dimensions from grid size (size = distance from center to vertex)
 */
export const getHexDimensions = (gridSize = DEFAULT_GRID_SIZE) => {
  const size = gridSize / 2; // hex "radius" (center to vertex)
  const w = Math.sqrt(3) * size;  // hex width
  const h = 2 * size;              // hex height
  const horizSpacing = w;           // horizontal spacing between hex centers
  const vertSpacing = h * 0.75;    // vertical spacing between hex centers
  return { size, w, h, horizSpacing, vertSpacing };
};

/**
 * Get the 6 corner points of a pointy-top hex at center (cx, cy)
 */
export const getHexCorners = (cx, cy, gridSize = DEFAULT_GRID_SIZE) => {
  const { size } = getHexDimensions(gridSize);
  const corners = [];
  for (let i = 0; i < 6; i++) {
    const angleDeg = 60 * i - 30; // pointy-top: start at -30°
    const angleRad = (Math.PI / 180) * angleDeg;
    corners.push({
      x: cx + size * Math.cos(angleRad),
      y: cy + size * Math.sin(angleRad)
    });
  }
  return corners;
};

/**
 * Convert offset hex coordinates (col, row) to pixel center (odd-r)
 */
export const hexToPixel = (col, row, gridSize = DEFAULT_GRID_SIZE) => {
  const { horizSpacing, vertSpacing } = getHexDimensions(gridSize);
  const x = col * horizSpacing + (row % 2 !== 0 ? horizSpacing / 2 : 0);
  const y = row * vertSpacing;
  return { x, y };
};

/**
 * Convert pixel position to nearest hex offset coordinates (odd-r)
 */
export const pixelToHex = (px, py, gridSize = DEFAULT_GRID_SIZE) => {
  const { size, horizSpacing, vertSpacing } = getHexDimensions(gridSize);

  // Approximate row
  const row = Math.round(py / vertSpacing);
  const offset = row % 2 !== 0 ? horizSpacing / 2 : 0;
  const col = Math.round((px - offset) / horizSpacing);

  // Check neighboring hexes to find the closest center
  let bestCol = col;
  let bestRow = row;
  let bestDist = Infinity;

  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const r = row + dr;
      const c = col + dc;
      const center = hexToPixel(c, r, gridSize);
      const dist = (px - center.x) ** 2 + (py - center.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = c;
        bestRow = r;
      }
    }
  }

  return { col: bestCol, row: bestRow };
};

/**
 * Snap pixel position to nearest hex center
 */
export const snapToHex = (px, py, gridSize = DEFAULT_GRID_SIZE) => {
  const { col, row } = pixelToHex(px, py, gridSize);
  return hexToPixel(col, row, gridSize);
};

/**
 * Convert hex offset coords to cube coords (for distance calc)
 */
const offsetToCube = (col, row) => {
  const x = col - (row - (row & 1)) / 2;
  const z = row;
  const y = -x - z;
  return { x, y, z };
};

/**
 * Hex distance in cells (cube distance)
 */
export const hexDistance = (col1, row1, col2, row2) => {
  const a = offsetToCube(col1, row1);
  const b = offsetToCube(col2, row2);
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
};

/**
 * Hex distance in feet
 */
export const hexDistanceInFeet = (col1, row1, col2, row2) =>
  hexDistance(col1, row1, col2, row2) * FEET_PER_CELL;

/**
 * Pixel distance converted to hex cell distance
 */
export const pixelToHexDistance = (x1, y1, x2, y2, gridSize = DEFAULT_GRID_SIZE) => {
  const h1 = pixelToHex(x1, y1, gridSize);
  const h2 = pixelToHex(x2, y2, gridSize);
  return hexDistance(h1.col, h1.row, h2.col, h2.row);
};

// ── Unified API ──

/**
 * Snap position to grid based on type
 */
export const snapToGridUnified = (px, py, gridType = 'square', gridSize = DEFAULT_GRID_SIZE, snapEnabled = true) => {
  if (!snapEnabled) return { x: px, y: py };
  if (gridType === 'hex') return snapToHex(px, py, gridSize);
  // square: snap to cell center
  const gx = Math.round((px - gridSize / 2) / gridSize);
  const gy = Math.round((py - gridSize / 2) / gridSize);
  return { x: gx * gridSize + gridSize / 2, y: gy * gridSize + gridSize / 2 };
};

/**
 * Measure distance in feet between two pixel positions
 */
export const measureDistanceFeet = (x1, y1, x2, y2, gridType = 'square', gridSize = DEFAULT_GRID_SIZE) => {
  if (gridType === 'hex') {
    return pixelToHexDistance(x1, y1, x2, y2, gridSize) * FEET_PER_CELL;
  }
  const distPixels = pixelDistance(x1, y1, x2, y2);
  const distCells = distPixels / gridSize;
  return Math.round(distCells * FEET_PER_CELL);
};

export const GRID_CONSTANTS = {
  SIZE: DEFAULT_GRID_SIZE,
  FEET_PER_CELL,
  HALF_SIZE: DEFAULT_GRID_SIZE / 2
};

export default {
  snapToGrid, snapValue, pixelToGrid, gridToPixel, gridCenterToPixel,
  gridDistance, distanceInFeet, pixelDistance, isWithinRange, getCellsInRange,
  getGridBounds, isInBounds, pixelMovementToGrid, generateGridLines,
  getHexDimensions, getHexCorners, hexToPixel, pixelToHex, snapToHex,
  hexDistance, hexDistanceInFeet, pixelToHexDistance,
  snapToGridUnified, measureDistanceFeet,
  GRID_CONSTANTS
};
