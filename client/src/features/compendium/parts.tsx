// Small building blocks shared by the compendium cards: rich text with clickable dice, icons, helpers.
import { Fragment, type ReactNode } from 'react';
import {
  Angry, ArrowDownToLine, Backpack, Ban, BatteryLow, Biohazard, Brain, Coins, Crosshair, Drama, Droplet, EarOff,
  Eye, EyeClosed, EyeOff, FastForward, Feather, Flame, FlaskConical, Gem, Ghost, Grab, Hammer, Heart, Link, Moon,
  Mountain, Music, Orbit, Package, PawPrint, Repeat, Shield, ShieldHalf, Shirt, Skull, Snail, Sparkles, SquareDashed,
  Stars, Sword, WandSparkles, Zap, type LucideIcon,
} from 'lucide-react';
import type { ItemCategory, SpellSchool } from '@shared/data5e/types.ts';
import { act } from '../../net/socket.ts';
import { useUi } from '../../store/ui.ts';

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

/** lucide icon names used by CONDITIONS (static map keeps the bundle tree-shaken). */
const CONDITION_ICONS: Record<string, LucideIcon> = {
  EyeOff, Heart, EarOff, BatteryLow, Ghost, Grab, Ban, SquareDashed, Zap, Mountain, FlaskConical, ArrowDownToLine,
  Link, Stars, Moon, Brain, Skull, Droplet, Sparkles, FastForward, Crosshair, EyeClosed, Angry, Music, ShieldHalf,
  Feather, Flame, Snail, Biohazard,
};

export function iconByName(name: string): LucideIcon {
  return CONDITION_ICONS[name] ?? Sparkles;
}

export const SCHOOL_ICON: Record<SpellSchool, LucideIcon> = {
  abjuration: Shield,
  conjuration: Orbit,
  divination: Eye,
  enchantment: Heart,
  evocation: Flame,
  illusion: Drama,
  necromancy: Skull,
  transmutation: Repeat,
};

export const ITEM_ICON: Record<ItemCategory, LucideIcon> = {
  weapon: Sword,
  armor: Shirt,
  shield: Shield,
  gear: Backpack,
  tool: Hammer,
  pack: Package,
  potion: FlaskConical,
  ammunition: Crosshair,
  focus: WandSparkles,
  magic: Gem,
  mount: PawPrint,
  treasure: Coins,
};

// ---------------------------------------------------------------------------
// Rolling helpers
// ---------------------------------------------------------------------------

export interface RollCtx {
  /** Chat label, e.g. "Goblin — Cimitarra". */
  label: string;
  speaker?: string | null;
  /** Roll privately for the DM. */
  gm?: boolean;
}

export function rollFormula(formula: string, ctx: RollCtx): void {
  const clean = formula.replace(/−/g, '-').replace(/\s+/g, '');
  const { rollMode } = useUi.getState();
  void act('roll.formula', {
    formula: clean,
    label: ctx.label,
    speaker: ctx.speaker ?? null,
    mode: /d20/.test(clean) ? rollMode : undefined,
    visibility: ctx.gm ? 'gm' : 'public',
  });
}

/** Inline clickable dice chip. */
export function DiceChip({ formula, ctx, children, color, tip }: {
  formula: string;
  ctx: RollCtx;
  children?: ReactNode;
  color?: string;
  tip?: string;
}) {
  return (
    <button
      type="button"
      className="cmp-dice"
      style={color ? { ['--dice-c' as string]: color } : undefined}
      data-tip={tip ?? `Rolar ${formula.replace(/\s+/g, '')}`}
      onClick={(e) => {
        e.stopPropagation();
        rollFormula(formula, ctx);
      }}
    >
      {children ?? formula}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Rich text: paragraphs, SRD lead-ins in italics, dice formulas as roll buttons
// ---------------------------------------------------------------------------

const TOKEN_RE = /(\b\d+d\d+(?:\s*[+\-−]\s*\d+(?!d))?\b)|(Ataque (?:Corpo-a-Corpo|Corpo a Corpo|à Distância|Mágico|Corpo-a-Corpo ou à Distância)[^:.]{0,40}:|\b(?:Acerto|Erro|Falha|Sucesso)(?: na Salvaguarda)?:)/g;

const SMALL_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'com', 'por', 'para', 'no', 'na']);

/** "Adaptação Aquática. Seu corpo…" → bold-italic header for SRD sub-options. */
function splitLeadIn(p: string): [string, string] | null {
  const m = /^([A-ZÀ-Ý][^.!?\n:]{1,44})\.\s+(.+)$/s.exec(p);
  if (!m) return null;
  const words = m[1]!.split(/\s+/);
  if (words.length > 6) return null;
  const titled = words.every((w) => SMALL_WORDS.has(w) || /^[A-ZÀ-Ý0-9(]/.test(w));
  return titled ? [m[1]!, m[2]!] : null;
}

function renderInline(text: string, ctx: RollCtx | null, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(text); m; m = TOKEN_RE.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(ctx ? <DiceChip key={`${keyBase}-${i++}`} formula={m[1]} ctx={ctx} /> : <b key={`${keyBase}-${i++}`}>{m[1]}</b>);
    } else {
      out.push(<em key={`${keyBase}-${i++}`} className="cmp-lead">{m[0]}</em>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Text with preserved paragraphs. Dice become roll buttons when `roll` is given. */
export function RichText({ text, roll, className = '', leadIns = true, prefix }: {
  text: string;
  roll?: RollCtx | null;
  className?: string;
  leadIns?: boolean;
  /** Rendered inline at the start of the first paragraph (e.g. the action name). */
  prefix?: ReactNode;
}) {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (!paras.length && prefix) paras.push('');
  return (
    <div className={`cmp-rich ${className}`}>
      {paras.map((p, pi) => {
        const lead = leadIns && !(pi === 0 && prefix) ? splitLeadIn(p) : null;
        const body = lead ? lead[1] : p;
        const lines = body.split('\n');
        return (
          <p key={pi}>
            {pi === 0 && prefix}
            {lead && <strong className="cmp-rich__lead">{lead[0]}. </strong>}
            {lines.map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {line.startsWith('• ') || line.startsWith('- ') ? <span className="cmp-rich__bullet">•</span> : null}
                {renderInline(line.replace(/^[•-]\s/, ''), roll ?? null, `${pi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layout bits
// ---------------------------------------------------------------------------

/** Small labelled tile used by spell and item cards. */
export function StatTile({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`cmp-tile ${wide ? 'cmp-tile--wide' : ''}`}>
      <span className="cmp-tile__label">{label}</span>
      <span className="cmp-tile__value">{children}</span>
    </div>
  );
}

/** Closes the sidebar on narrow screens so the map is visible (after picking a map tool). */
export function revealMapOnMobile(): void {
  if (window.matchMedia('(max-width: 900px)').matches) useUi.getState().set({ sidebarOpen: false });
}

export function newShortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 12);
}
