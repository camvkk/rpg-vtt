// Screen-space weather particles (rain, storm, snow, fog, embers, ash, leaves, sandstorm).
import { Container, Graphics, Particle, ParticleContainer } from 'pixi.js';
import type { WeatherConfig } from '@shared/types.ts';
import type { Engine, EngineCtx, Layer } from '../Engine.ts';
import { particleTexture } from '../textures.ts';

interface P {
  p: Particle;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  max: number;
  baseAlpha: number;
  phase: number;
}

export class WeatherLayer implements Layer {
  container = new Container();
  private pc: ParticleContainer | null = null;
  private parts: P[] = [];
  private tint = new Graphics();
  private flash = new Graphics();
  private cfg: WeatherConfig | null = null;
  private w = 800;
  private h = 600;
  private nextLightning = 0;
  private flashT = 0;
  private engine: Engine;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(engine: Engine) {
    this.engine = engine;
    this.container.addChild(this.tint, this.flash);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.drawTint();
  }

  update(ctx: EngineCtx): void {
    const cfg = ctx.scene.weather;
    if (cfg === this.cfg) return;
    const typeChanged = cfg.type !== this.cfg?.type || Math.abs(cfg.intensity - (this.cfg?.intensity ?? -1)) > 0.05;
    this.cfg = cfg;
    if (typeChanged) this.rebuild();
    this.drawTint();
  }

  private drawTint(): void {
    this.tint.clear();
    const t = this.cfg?.type;
    const k = this.cfg?.intensity ?? 0;
    if (t === 'sandstorm') this.tint.rect(0, 0, this.w, this.h).fill({ color: 0xb08850, alpha: 0.18 * k });
    else if (t === 'storm') this.tint.rect(0, 0, this.w, this.h).fill({ color: 0x0a1020, alpha: 0.22 * k });
    else if (t === 'fog') this.tint.rect(0, 0, this.w, this.h).fill({ color: 0xc8cdd8, alpha: 0.08 * k });
    else if (t === 'snow') this.tint.rect(0, 0, this.w, this.h).fill({ color: 0xdbe8ff, alpha: 0.05 * k });
  }

  private rebuild(): void {
    if (this.pc) {
      this.pc.destroy({ children: true });
      this.pc = null;
    }
    this.parts = [];
    const cfg = this.cfg;
    if (!cfg || cfg.type === 'none' || this.reduced) return;
    const area = (this.w * this.h) / (1280 * 800);
    const k = Math.max(0.1, cfg.intensity);
    let count = 0;
    let tex = particleTexture('flake');
    switch (cfg.type) {
      case 'rain': count = 260 * k; tex = particleTexture('streak'); break;
      case 'storm': count = 480 * k; tex = particleTexture('streak'); break;
      case 'snow': count = 220 * k; break;
      case 'fog': count = 26 * k; tex = particleTexture('cloud'); break;
      case 'embers': count = 90 * k; tex = particleTexture('spark'); break;
      case 'ash': count = 140 * k; break;
      case 'leaves': count = 50 * k; tex = particleTexture('leaf'); break;
      case 'sandstorm': count = 380 * k; tex = particleTexture('streak'); break;
    }
    count = Math.round(Math.min(900, count * Math.max(0.5, area)));
    const pc = new ParticleContainer({ dynamicProperties: { position: true, rotation: true, color: true, vertex: true } });
    this.pc = pc;
    this.container.addChildAt(pc, 1);
    for (let i = 0; i < count; i++) {
      const p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
      pc.addParticle(p);
      const part: P = { p, vx: 0, vy: 0, vr: 0, life: 0, max: 0, baseAlpha: 1, phase: Math.random() * 1000 };
      this.spawn(part, true);
      this.parts.push(part);
    }
    this.nextLightning = performance.now() + 4000 + Math.random() * 6000;
  }

  private spawn(part: P, initial: boolean): void {
    const cfg = this.cfg!;
    const p = part.p;
    const wind = (cfg.wind * Math.PI) / 180;
    const wx = Math.cos(wind), wy = Math.sin(wind);
    p.x = Math.random() * (this.w + 200) - 100;
    p.y = initial ? Math.random() * this.h : -40;
    part.life = 0;
    part.phase = Math.random() * 1000;
    switch (cfg.type) {
      case 'rain':
      case 'storm': {
        const speed = (cfg.type === 'storm' ? 1400 : 1000) * (0.8 + Math.random() * 0.4);
        const lean = (wx * 0.35);
        part.vx = speed * lean;
        part.vy = speed * Math.max(0.6, Math.abs(wy) || 1);
        p.rotation = -Math.atan2(part.vx, part.vy);
        p.scaleX = 0.6 + Math.random() * 0.5;
        p.scaleY = 0.5 + Math.random() * 0.6;
        part.baseAlpha = 0.25 + Math.random() * 0.35;
        part.max = 99;
        break;
      }
      case 'sandstorm': {
        p.x = initial ? Math.random() * this.w : -40;
        p.y = Math.random() * this.h;
        part.vx = 700 + Math.random() * 500;
        part.vy = 60 + Math.random() * 80;
        p.rotation = -Math.PI / 2 + 0.1;
        p.scaleX = 0.5;
        p.scaleY = 0.4 + Math.random() * 0.6;
        p.tint = 0xd8b07a;
        part.baseAlpha = 0.2 + Math.random() * 0.3;
        part.max = 99;
        break;
      }
      case 'snow':
      case 'ash': {
        part.vx = wx * 30 + (Math.random() - 0.5) * 20;
        part.vy = 30 + Math.random() * 50;
        const s = 0.15 + Math.random() * (cfg.type === 'ash' ? 0.2 : 0.35);
        p.scaleX = p.scaleY = s;
        p.tint = cfg.type === 'ash' ? 0x8c8680 : 0xffffff;
        part.baseAlpha = 0.5 + Math.random() * 0.5;
        part.max = 99;
        break;
      }
      case 'embers': {
        p.y = initial ? Math.random() * this.h : this.h + 20;
        part.vx = (Math.random() - 0.5) * 20 + wx * 20;
        part.vy = -(30 + Math.random() * 60);
        const s = 0.1 + Math.random() * 0.25;
        p.scaleX = p.scaleY = s;
        p.tint = Math.random() < 0.5 ? 0xff8a2b : 0xffc35c;
        part.baseAlpha = 0.6 + Math.random() * 0.4;
        part.max = 4 + Math.random() * 6;
        break;
      }
      case 'leaves': {
        part.vx = wx * 60 + 20 + Math.random() * 30;
        part.vy = 30 + Math.random() * 40;
        part.vr = (Math.random() - 0.5) * 3;
        const s = 0.5 + Math.random() * 0.6;
        p.scaleX = p.scaleY = s;
        p.tint = [0xc2410c, 0xd97706, 0x65a30d, 0xa16207][Math.floor(Math.random() * 4)]!;
        part.baseAlpha = 0.85;
        part.max = 99;
        break;
      }
      case 'fog': {
        p.x = initial ? Math.random() * this.w : -300;
        p.y = Math.random() * this.h;
        part.vx = 8 + Math.random() * 14 + wx * 6;
        part.vy = (Math.random() - 0.5) * 4;
        const s = 2.5 + Math.random() * 3;
        p.scaleX = p.scaleY = s;
        p.tint = 0xe7ebf3;
        part.baseAlpha = 0.25 + Math.random() * 0.25;
        part.max = 99;
        break;
      }
      default:
    }
    p.alpha = part.baseAlpha;
  }

  tick(dt: number, now: number): boolean {
    let anim = false;
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt / 1000);
      this.flash.clear();
      if (this.flashT > 0) this.flash.rect(0, 0, this.w, this.h).fill({ color: 0xdfe8ff, alpha: Math.min(0.55, this.flashT * 1.4) });
      anim = true;
    }
    if (!this.parts.length || !this.cfg) return anim;
    const s = dt / 1000;
    const cfg = this.cfg;
    for (const part of this.parts) {
      const p = part.p;
      part.life += s;
      if (cfg.type === 'snow' || cfg.type === 'ash') p.x += Math.sin((now + part.phase * 7) / 900) * 12 * s;
      if (cfg.type === 'leaves') {
        p.rotation += part.vr * s;
        p.x += Math.sin((now + part.phase * 5) / 600) * 40 * s;
      }
      p.x += part.vx * s;
      p.y += part.vy * s;
      if (cfg.type === 'embers') p.alpha = part.baseAlpha * Math.max(0, Math.sin(Math.PI * Math.min(1, part.life / part.max)));
      if (p.y > this.h + 60 || p.y < -80 || p.x > this.w + 320 || p.x < -340 || part.life > part.max) this.spawn(part, false);
    }
    if (cfg.type === 'storm' && now > this.nextLightning) {
      this.flashT = 0.35 + Math.random() * 0.25;
      this.nextLightning = now + 5000 + Math.random() * 9000;
      window.dispatchEvent(new CustomEvent('vtt:thunder'));
    }
    return true;
  }

  reset(): void {
    this.cfg = null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
