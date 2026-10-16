import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_GRID } from './defaults.ts';
import {
  cellAt, cellCenter, measureFeet, measurePathFeet, movementBlocked, pointInPolygon, snapTokenPosition,
  tokensInTemplate, visibilityPolygon,
} from './geometry.ts';
import type { GridConfig, Template, Token, Wall } from './types.ts';
import { createToken } from './defaults.ts';

const g: GridConfig = { ...DEFAULT_GRID, size: 50, units: 5 };

test('square cells and snapping', () => {
  assert.deepEqual(cellAt(g, 75, 125), { col: 1, row: 2 });
  assert.deepEqual(cellCenter(g, { col: 1, row: 2 }), { x: 75, y: 125 });
  assert.deepEqual(snapTokenPosition(g, { size: 1 }, 62, 88), { x: 50, y: 100 });
  assert.deepEqual(snapTokenPosition(g, { size: 2 }, 130, 20), { x: 150, y: 0 });
});

test('5e diagonal rules', () => {
  const a = { x: 25, y: 25 };
  const b = { x: 25 + 50 * 3, y: 25 + 50 * 3 };
  assert.equal(measureFeet(g, a, b), 15);
  assert.equal(measureFeet({ ...g, diagonals: '5-10-5' }, a, b), 20);
  assert.equal(measurePathFeet({ ...g, diagonals: '5-10-5' }, [a, { x: 75, y: 75 }, { x: 125, y: 125 }]), 15);
});

test('hex grid round trip', () => {
  const hex: GridConfig = { ...g, type: 'hex-pointy' };
  for (const c of [{ col: 0, row: 0 }, { col: 3, row: -2 }, { col: -4, row: 5 }]) {
    const p = cellCenter(hex, c);
    assert.deepEqual(cellAt(hex, p.x + 3, p.y - 2), c);
  }
  assert.equal(measureFeet(hex, cellCenter(hex, { col: 0, row: 0 }), cellCenter(hex, { col: 3, row: 0 })), 15);
});

test('walls block movement, open doors do not', () => {
  const wall: Wall = { id: 'w', c: [100, 0, 100, 200], kind: 'wall', door: 'closed', secret: false };
  const door: Wall = { ...wall, id: 'd', kind: 'door', door: 'open' };
  assert.equal(movementBlocked({ x: 50, y: 50 }, { x: 150, y: 50 }, [wall]), true);
  assert.equal(movementBlocked({ x: 50, y: 50 }, { x: 150, y: 50 }, [door]), false);
  assert.equal(movementBlocked({ x: 50, y: 50 }, { x: 90, y: 50 }, [wall]), false);
});

test('visibility polygon is cut by a wall', () => {
  const poly = visibilityPolygon({ x: 0, y: 0 }, [[50, -100, 50, 100]], 200);
  assert.ok(poly.length >= 8);
  assert.equal(pointInPolygon(30, 0, poly), true, 'in front of the wall is visible');
  assert.equal(pointInPolygon(120, 0, poly), false, 'behind the wall is hidden');
  assert.equal(pointInPolygon(-150, 0, poly), true, 'other side is open');
});

test('templates find tokens', () => {
  const tokens: Token[] = [
    createToken({ name: 'a', x: 100, y: 100 }),
    createToken({ name: 'b', x: 400, y: 400 }),
  ];
  const fireball: Template = {
    id: 't', authorId: 'p', kind: 'circle', x: 125, y: 125, angle: 0, size: 20, width: 5, color: '#f00', label: '', spellId: null,
  };
  assert.deepEqual(tokensInTemplate(fireball, g, tokens).map((t) => t.name), ['a']);
  const cone: Template = { ...fireball, kind: 'cone', x: 0, y: 125, angle: 0, size: 30 };
  assert.deepEqual(tokensInTemplate(cone, g, tokens).map((t) => t.name), ['a']);
});
