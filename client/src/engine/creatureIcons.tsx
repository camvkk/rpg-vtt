// Creature-type glyphs for monster tokens without artwork.
import {
  Biohazard, Bug, Cog, Droplets, Eye, Flame, HandMetal, Mountain, PawPrint, Rat, Skull, Sparkles, Sprout, Sun, Swords,
  Wind, type LucideIcon,
} from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MONSTERS_BY_ID } from '@shared/data5e/monsters/index.ts';

const BY_TYPE: [RegExp, LucideIcon][] = [
  [/^enxame/i, Rat],
  [/^besta/i, PawPrint],
  [/^humanoide/i, Swords],
  [/^drag/i, Flame],
  [/^corruptor|^infernal|^dem[oô]nio|^diabo/i, HandMetal],
  [/^monstruosidade/i, Bug],
  [/^morto/i, Skull],
  [/^gigante/i, Mountain],
  [/^constructo/i, Cog],
  [/^elemental/i, Wind],
  [/^fada/i, Sparkles],
  [/^celestial/i, Sun],
  [/^planta/i, Sprout],
  [/^limo|^gosma/i, Droplets],
  [/^aberra/i, Eye],
];

const cache = new Map<string, string>();

/** SVG markup (white strokes) for a monster's creature type, or null when unknown. */
export function creatureSvg(monsterId: string | null): string | null {
  if (!monsterId) return null;
  const m = Object.prototype.hasOwnProperty.call(MONSTERS_BY_ID, monsterId) ? MONSTERS_BY_ID[monsterId] : undefined;
  if (!m) return null;
  const hit = cache.get(m.type);
  if (hit) return hit;
  const Icon = BY_TYPE.find(([re]) => re.test(m.type))?.[1] ?? Biohazard;
  let svg = renderToStaticMarkup(<Icon size={64} color="#ffffff" strokeWidth={1.8} />);
  if (!svg.includes('xmlns=')) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  cache.set(m.type, svg);
  return svg;
}
