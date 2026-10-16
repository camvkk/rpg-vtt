import { Assets, Container, Graphics, Sprite, Texture, TilingSprite } from 'pixi.js';
import type { GridConfig, MapConfig } from '@shared/types.ts';
import { assetUrl } from '../../net/api.ts';
import { toast } from '../../ui/index.tsx';
import type { Engine, EngineCtx, Layer } from '../Engine.ts';
import { gridTile } from '../textures.ts';

export class MapLayer implements Layer {
  container = new Container();
  private bg = new Graphics();
  private sprite: Sprite | null = null;
  private url: string | null = null;
  private prev: MapConfig | null = null;
  private engine: Engine;
  private fadeStart = 0;

  constructor(engine: Engine) {
    this.engine = engine;
    this.container.addChild(this.bg);
  }

  tick(_dt: number, now: number): boolean {
    const s = this.sprite;
    if (!s || s.alpha >= 1) return false;
    s.alpha = Math.min(1, (now - this.fadeStart) / 350);
    return true;
  }

  update(ctx: EngineCtx): void {
    const map = ctx.scene.map;
    if (map === this.prev) return;
    this.prev = map;
    this.bg.clear();
    // Soft drop shadow + board background
    this.bg.rect(-6, -6, map.width + 12, map.height + 12).fill({ color: 0x000000, alpha: 0.45 });
    this.bg.rect(0, 0, map.width, map.height).fill({ color: map.background || '#16141c' });
    const url = assetUrl(map.url);
    if (url !== this.url) {
      this.url = url;
      if (this.sprite) {
        this.sprite.destroy();
        this.sprite = null;
      }
      if (url) void this.load(url);
    } else if (this.sprite) {
      this.sprite.width = map.width;
      this.sprite.height = map.height;
    }
  }

  private async load(url: string): Promise<void> {
    try {
      const tex = (await Assets.load<Texture>({ src: url, parser: 'texture' })) as Texture;
      if (url !== this.url || !this.prev) return;
      const sprite = new Sprite(tex);
      sprite.width = this.prev.width;
      sprite.height = this.prev.height;
      this.sprite = sprite;
      this.container.addChild(sprite);
      sprite.alpha = 0;
      this.fadeStart = performance.now();
      this.engine.requestRender();
    } catch (e) {
      console.warn('map load failed', e);
      toast('Não foi possível carregar a imagem do mapa (o site pode bloquear o acesso).', 'warning');
    }
  }

  reset(): void {
    this.prev = null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export class GridLayer implements Layer {
  container = new Container();
  private tiling: TilingSprite | null = null;
  private prevGrid: GridConfig | null = null;
  private prevMap: MapConfig | null = null;

  constructor(_engine: Engine) {}

  update(ctx: EngineCtx): void {
    const { grid, map } = ctx.scene;
    if (grid === this.prevGrid && map === this.prevMap) return;
    this.prevGrid = grid;
    this.prevMap = map;
    const tile = gridTile(grid);
    if (!tile || !grid.visible) {
      if (this.tiling) this.tiling.visible = false;
      return;
    }
    if (!this.tiling) {
      this.tiling = new TilingSprite({ texture: tile.texture, width: map.width, height: map.height });
      this.container.addChild(this.tiling);
    }
    const t = this.tiling;
    t.visible = true;
    t.texture = tile.texture;
    t.width = map.width;
    t.height = map.height;
    t.tileScale.set(tile.scale);
    t.tilePosition.set(tile.originX, tile.originY);
    t.tint = grid.color;
    t.alpha = grid.opacity;
  }

  reset(): void {
    this.prevGrid = null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

export { Texture };
