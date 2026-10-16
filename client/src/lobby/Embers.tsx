import { useEffect, useRef } from 'react';

/** Lightweight floating embers on a 2D canvas (paused when the tab is hidden). */
export function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0, h = 0, raf = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    type P = { x: number; y: number; vx: number; vy: number; r: number; life: number; max: number; hue: number };
    const ps: P[] = [];
    const spawn = (initial = false): P => ({
      x: Math.random() * w,
      y: initial ? Math.random() * h : h + 10,
      vx: (Math.random() - 0.5) * 0.25,
      vy: -(0.25 + Math.random() * 0.7),
      r: 0.6 + Math.random() * 1.8,
      life: 0,
      max: 260 + Math.random() * 420,
      hue: 28 + Math.random() * 22,
    });
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const count = reduce ? 0 : Math.min(90, Math.round((w * h) / 18000));
    for (let i = 0; i < count; i++) ps.push(spawn(true));
    let t = 0;
    const tick = () => {
      t++;
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        p.life++;
        p.x += p.vx + Math.sin((p.y + t) * 0.01) * 0.15;
        p.y += p.vy;
        const k = p.life / p.max;
        const alpha = Math.sin(Math.PI * Math.min(1, k)) * 0.9;
        if (p.life > p.max || p.y < -10) {
          ps[i] = spawn();
          continue;
        }
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `hsla(${p.hue}, 100%, 70%, ${alpha})`);
        g.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(tick);
    };
    if (count) raf = requestAnimationFrame(tick);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && count) raf = requestAnimationFrame(tick);
    };
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  return <canvas ref={ref} className="lobby__embers" aria-hidden="true" />;
}
