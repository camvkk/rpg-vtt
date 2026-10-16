// Condition icons: React components for the UI + SVG strings for Pixi textures.
import {
  Angry, ArrowDownToLine, Ban, BatteryLow, Biohazard, Brain, CircleDot, Crosshair, Droplet, EarOff, EyeClosed, EyeOff,
  FastForward, Feather, Flame, FlaskConical, Ghost, Grab, Heart, Link, Moon, Mountain, Music, ShieldHalf, Skull,
  Snail, Sparkles, SquareDashed, Stars, Zap, type LucideIcon,
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONDITIONS_BY_ID } from '@shared/data5e/conditions.ts';

const ICONS: Record<string, LucideIcon> = {
  Angry, ArrowDownToLine, Ban, BatteryLow, Biohazard, Brain, Crosshair, Droplet, EarOff, EyeClosed, EyeOff, FastForward,
  Feather, Flame, FlaskConical, Ghost, Grab, Heart, Link, Moon, Mountain, Music, ShieldHalf, Skull, Snail, Sparkles,
  SquareDashed, Stars, Zap,
};

export function conditionMeta(id: string): { name: string; color: string; Icon: LucideIcon; rules: string[] } {
  const c = CONDITIONS_BY_ID[id];
  return {
    name: c?.name ?? id,
    color: c?.color ?? '#9ca3af',
    Icon: (c && ICONS[c.icon]) || CircleDot,
    rules: c?.rules ?? [],
  };
}

export function ConditionIcon({ id, size = 14 }: { id: string; size?: number }) {
  const { Icon, color } = conditionMeta(id);
  return <Icon size={size} color={color} strokeWidth={2.2} />;
}

const svgCache = new Map<string, string>();

/** White-stroked SVG markup of a condition icon (for Pixi textures). */
export function conditionSvg(id: string, stroke = '#ffffff'): string {
  const key = `${id}|${stroke}`;
  let svg = svgCache.get(key);
  if (!svg) {
    const { Icon } = conditionMeta(id);
    svg = renderToStaticMarkup(<Icon size={48} color={stroke} strokeWidth={2.4} />);
    if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    svgCache.set(key, svg);
  }
  return svg;
}
