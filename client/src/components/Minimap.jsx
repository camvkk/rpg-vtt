import { useRef, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { hexToPixel } from '../utils/gridUtils';

const MINIMAP_SIZE = 160;
const MAP_WORLD_SIZE = 4000;

export default function Minimap({ viewRef, pixiRef, onNavigate }) {
  const canvasRef = useRef(null);
  const { state } = useGame();
  const { tokens, gridConfig } = state;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const scale = MINIMAP_SIZE / MAP_WORLD_SIZE;

    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    const gs = gridConfig.gridSize || 40;
    tokens.forEach((token) => {
      let px, py;
      if (gridConfig.gridType === 'hex') {
        const pos = hexToPixel(token.x || 0, token.y || 0, gs);
        px = pos.x;
        py = pos.y;
      } else {
        px = (token.x || 0) * gs + gs / 2;
        py = (token.y || 0) * gs + gs / 2;
      }
      ctx.fillStyle = token.color || '#3b82f6';
      ctx.beginPath();
      ctx.arc(px * scale, py * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    });

    const v = viewRef?.current;
    const app = pixiRef?.current;
    if (v && app) {
      const screenW = app.screen.width;
      const screenH = app.screen.height;
      const vx = (-v.panX / v.zoom) * scale;
      const vy = (-v.panY / v.zoom) * scale;
      const vw = (screenW / v.zoom) * scale;
      const vh = (screenH / v.zoom) * scale;

      ctx.strokeStyle = '#e2b714';
      ctx.lineWidth = 2;
      ctx.strokeRect(vx, vy, vw, vh);
    }
  }, [tokens, gridConfig, viewRef, pixiRef]);

  useEffect(() => {
    draw();
    const id = setInterval(draw, 500);
    return () => clearInterval(id);
  }, [draw]);

  const handleClick = useCallback((e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = MINIMAP_SIZE / MAP_WORLD_SIZE;
    const worldX = mx / scale;
    const worldY = my / scale;
    if (onNavigate) onNavigate(worldX, worldY);
  }, [onNavigate]);

  return (
    <canvas
      ref={canvasRef}
      width={MINIMAP_SIZE}
      height={MINIMAP_SIZE}
      onClick={handleClick}
      style={{
        position: 'absolute',
        bottom: 12,
        right: 12,
        width: MINIMAP_SIZE,
        height: MINIMAP_SIZE,
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        cursor: 'crosshair',
        opacity: 0.85,
        zIndex: 10,
        background: '#0f0f1a',
      }}
    />
  );
}
