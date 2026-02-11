/**
 * Grid Utilities for RPG VTT
 * Handles snapping to grid, coordinate conversions, and distance calculations
 */

const GRID_SIZE = 40; // pixels per grid cell (5ft in D&D)
const FEET_PER_CELL = 5;

/**
 * Snap a coordinate to the nearest grid intersection
 */
export const snapToGrid = (x, y) => {
  return {
    x: Math.round(x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(y / GRID_SIZE) * GRID_SIZE
  };
};

/**
 * Snap a single coordinate value to grid
 */
export const snapValue = (value) => {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
};

/**
 * Convert pixel coordinates to grid coordinates
 */
export const pixelToGrid = (x, y) => {
  return {
    x: Math.floor(x / GRID_SIZE),
    y: Math.floor(y / GRID_SIZE)
  };
};

/**
 * Convert grid coordinates to pixel coordinates (top-left of cell)
 */
export const gridToPixel = (gridX, gridY) => {
  return {
    x: gridX * GRID_SIZE,
    y: gridY * GRID_SIZE
  };
};

/**
 * Get the center of a grid cell in pixel coordinates
 */
export const gridCenterToPixel = (gridX, gridY) => {
  return {
    x: gridX * GRID_SIZE + GRID_SIZE / 2,
    y: gridY * GRID_SIZE + GRID_SIZE / 2
  };
};

/**
 * Calculate distance between two points in grid units
 */
export const gridDistance = (x1, y1, x2, y2) => {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  
  // D&D 5e diagonal distance rules: 
  // First diagonal is 1 square, second is 2, etc.
  // This approximates to: distance = max(dx, dy) + min(dx, dy) / 2
  return Math.max(dx, dy) + Math.floor(Math.min(dx, dy) / 2);
};

/**
 * Calculate distance in feet
 */
export const distanceInFeet = (x1, y1, x2, y2) => {
  return gridDistance(x1, y1, x2, y2) * FEET_PER_CELL;
};

/**
 * Calculate pixel distance between two pixel points
 */
export const pixelDistance = (x1, y1, x2, y2) => {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
};

/**
 * Check if a point is within a certain range of another point (in grid units)
 */
export const isWithinRange = (x1, y1, x2, y2, range) => {
  return gridDistance(x1, y1, x2, y2) <= range;
};

/**
 * Get all grid cells within a certain range of a point
 */
export const getCellsInRange = (centerX, centerY, range) => {
  const cells = [];
  
  for (let x = centerX - range; x <= centerX + range; x++) {
    for (let y = centerY - range; y <= centerY + range; y++) {
      if (gridDistance(centerX, centerY, x, y) <= range) {
        cells.push({ x, y });
      }
    }
  }
  
  return cells;
};

/**
 * Get the bounds of a rectangular area in grid coordinates
 */
export const getGridBounds = (startX, startY, endX, endY) => {
  return {
    minX: Math.min(startX, endX),
    minY: Math.min(startY, endY),
    maxX: Math.max(startX, endX),
    maxY: Math.max(startY, endY)
  };
};

/**
 * Check if a grid coordinate is within bounds
 */
export const isInBounds = (x, y, minX, minY, maxX, maxY) => {
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
};

/**
 * Convert a movement in pixels to grid movement
 */
export const pixelMovementToGrid = (startPixelX, startPixelY, endPixelX, endPixelY) => {
  const startGrid = pixelToGrid(startPixelX, startPixelY);
  const endGrid = pixelToGrid(endPixelX, endPixelY);
  
  return {
    start: startGrid,
    end: endGrid,
    distance: gridDistance(startGrid.x, startGrid.y, endGrid.x, endGrid.y)
  };
};

/**
 * Generate grid lines for rendering
 */
export const generateGridLines = (width, height, offsetX = 0, offsetY = 0) => {
  const lines = [];
  
  // Vertical lines
  for (let x = offsetX % GRID_SIZE; x < width; x += GRID_SIZE) {
    lines.push({
      type: 'vertical',
      x1: x,
      y1: 0,
      x2: x,
      y2: height
    });
  }
  
  // Horizontal lines
  for (let y = offsetY % GRID_SIZE; y < height; y += GRID_SIZE) {
    lines.push({
      type: 'horizontal',
      x1: 0,
      y1: y,
      x2: width,
      y2: y
    });
  }
  
  return lines;
};

/**
 * Constants for export
 */
export const GRID_CONSTANTS = {
  SIZE: GRID_SIZE,
  FEET_PER_CELL,
  HALF_SIZE: GRID_SIZE / 2
};

export default {
  snapToGrid,
  snapValue,
  pixelToGrid,
  gridToPixel,
  gridCenterToPixel,
  gridDistance,
  distanceInFeet,
  pixelDistance,
  isWithinRange,
  getCellsInRange,
  getGridBounds,
  isInBounds,
  pixelMovementToGrid,
  generateGridLines,
  GRID_CONSTANTS
};