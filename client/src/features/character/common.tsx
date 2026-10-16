// Shared helpers for the character feature: optimistic edits, drafts (debounced inputs), rolls, pips, icons.
import {
  memo, useCallback, useEffect, useMemo, useRef, useState,
  type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes,
} from 'react';
import { create } from 'zustand';
import {
  Angry, ArrowDownToLine, Ban, BatteryLow, Biohazard, Brain, Crosshair, Droplet, EarOff, EyeClosed, EyeOff, FastForward,
  Feather, Flame, FlaskConical, Ghost, Grab, Heart, Link, Moon, Mountain, Music, ShieldHalf, Skull, Snail, Sparkles,
  SquareDashed, Stars, Zap, CircleDot, ChevronRight, Camera,
} from 'lucide-react';
import type { ActionPayload } from '@shared/actions/index.ts';
import type { Character, ID, Token } from '@shared/types.ts';
import type { CharacterStats } from '@shared/rules5e.ts';
import { newId } from '@shared/util.ts';
import { act } from '../../net/socket.ts';
import { assetUrl, uploadFile } from '../../net/api.ts';
import { getPref, setPref } from '../../net/session.ts';
import { useGame } from '../../store/game.ts';
import { getViewScene } from '../../store/hooks.ts';
import { useUi, type RollMode } from '../../store/ui.ts';
import { engineApi } from '../../engine/api.ts';
import { Spinner, toast } from '../../ui/index.tsx';

export type CharPatch = ActionPayload<'character.update'>['patch'];

/** Props shared by every sheet tab. */
export interface TabProps {
  c: Character;
  stats: CharacterStats;
  canEdit: boolean;
}

export const uid = (): string => newId(12);

export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ---------------------------------------------------------------------------
// Optimistic character edits
// ---------------------------------------------------------------------------

/** Values sent to the server and not yet acknowledged, layered over the store so the UI reacts instantly. */
const usePending = create<{ map: Record<ID, Partial<Character>> }>(() => ({ map: {} }));

export function getLiveCharacter(id: ID): Character | null {
  const base = useGame.getState().state?.characters[id];
  if (!base) return null;
  const over = usePending.getState().map[id];
  return over ? { ...base, ...over } : base;
}

export function useLiveCharacter(id: ID | null | undefined): Character | null {
  const base = useGame((s) => (id ? s.state?.characters[id] ?? null : null));
  const over = usePending((s) => (id ? s.map[id] : undefined));
  return useMemo(() => (base && over ? { ...base, ...over } : base), [base, over]);
}

/**
 * Patch a character. Pass a function to compute the patch from the freshest (optimistic) state,
 * which keeps nested objects (hp, personality, attacks...) consistent across quick consecutive edits.
 */
export function patchCharacter(
  id: ID,
  patch: Partial<Character> | ((c: Character) => Partial<Character> | null | undefined),
): Promise<boolean> {
  const c = getLiveCharacter(id);
  if (!c) return Promise.resolve(false);
  const p = typeof patch === 'function' ? patch(c) : patch;
  if (!p) return Promise.resolve(false);
  const clean: Partial<Character> = { ...p };
  delete clean.id;
  delete clean.createdAt;
  delete clean.updatedAt;
  const keys = Object.keys(clean) as (keyof Character)[];
  if (!keys.length) return Promise.resolve(false);
  usePending.setState((s) => ({ map: { ...s.map, [id]: { ...s.map[id], ...clean } } }));
  return act('character.update', { id, patch: clean as CharPatch }).then((res) => {
    usePending.setState((s) => {
      const cur = s.map[id];
      if (!cur) return s;
      const next: Partial<Character> = { ...cur };
      const rec = next as Record<string, unknown>;
      for (const k of keys) if (rec[k] === (clean as Record<string, unknown>)[k]) delete rec[k];
      const map = { ...s.map };
      if (Object.keys(next).length) map[id] = next;
      else delete map[id];
      return { map };
    });
    return res.ok;
  });
}

export function canControlCharacter(c: Character | null): boolean {
  const me = useGame.getState().me;
  if (!me || !c) return false;
  return me.role === 'dm' || (c.ownerId !== null && c.ownerId === me.id);
}

export function useCanControl(c: Character | null): boolean {
  const me = useGame((s) => s.me);
  if (!me || !c) return false;
  return me.role === 'dm' || (c.ownerId !== null && c.ownerId === me.id);
}

// ---------------------------------------------------------------------------
// Sheet preferences (DM secret rolls)
// ---------------------------------------------------------------------------

export const useSheetPrefs = create<{ secret: boolean; setSecret: (v: boolean) => void }>((set) => ({
  secret: getPref('sheet.secretRolls', false),
  setSecret: (secret) => {
    setPref('sheet.secretRolls', secret);
    set({ secret });
  },
}));

function visibility(): 'gm' | undefined {
  const isDM = useGame.getState().me?.role === 'dm';
  return isDM && useSheetPrefs.getState().secret ? 'gm' : undefined;
}

// ---------------------------------------------------------------------------
// Rolls
// ---------------------------------------------------------------------------

type ModEvent = { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } | null | undefined;

/** Shift = vantagem, Ctrl/Cmd = desvantagem, otherwise the global roll mode. */
export function rollModeFrom(e: ModEvent): RollMode {
  if (e?.shiftKey) return 'adv';
  if (e?.ctrlKey || e?.metaKey) return 'dis';
  return useUi.getState().rollMode;
}

/** The character's token on the scene being viewed (or the active scene). */
export function findCharacterToken(characterId: ID): { token: Token; sceneId: ID } | null {
  const st = useGame.getState().state;
  if (!st) return null;
  const view = getViewScene();
  const scenes = [view, st.activeSceneId ? st.scenes[st.activeSceneId] : null].filter((s): s is NonNullable<typeof s> => !!s);
  for (const scene of scenes) {
    for (const t of Object.values(scene.tokens)) if (t.characterId === characterId) return { token: t, sceneId: scene.id };
  }
  return null;
}

export function rollCheck(characterId: ID, kind: 'ability' | 'save' | 'skill', key: string, e?: ModEvent): void {
  const tok = findCharacterToken(characterId);
  void act('roll.check', {
    characterId,
    tokenId: tok?.token.id,
    kind,
    key,
    mode: rollModeFrom(e),
    visibility: visibility(),
  });
}

/** Roll from a custom-system sheet: stat/skill check or an item, power or mechanic formula. */
export function rollCustom(characterId: ID, kind: ActionPayload<'roll.custom'>['kind'], key: string, e?: ModEvent): void {
  const tok = findCharacterToken(characterId);
  void act('roll.custom', {
    characterId,
    tokenId: tok?.token.id,
    kind,
    key,
    mode: rollModeFrom(e),
    visibility: visibility(),
  });
}

export function rollAttack(characterId: ID, attackId: ID, e?: ModEvent): void {
  const tok = findCharacterToken(characterId);
  const scene = getViewScene();
  void act('roll.attack', {
    characterId,
    tokenId: tok?.token.id,
    sceneId: scene?.id,
    attackId,
    targets: useUi.getState().targets.slice(0, 20),
    mode: rollModeFrom(e),
    visibility: visibility(),
  });
}

export function castSpell(characterId: ID, knownSpellId: ID, slotLevel: number, consumeSlot: boolean, e?: ModEvent): Promise<boolean> {
  const scene = getViewScene();
  return act('roll.spell', {
    characterId,
    knownSpellId,
    slotLevel,
    sceneId: scene?.id,
    targets: useUi.getState().targets.slice(0, 30),
    mode: rollModeFrom(e),
    consumeSlot,
    visibility: visibility(),
  }).then((r) => r.ok);
}

export function rollFormula(formula: string, label: string, speaker: string | null, e?: ModEvent): Promise<number | null> {
  return act('roll.formula', { formula, label, speaker, mode: rollModeFrom(e), visibility: visibility() }).then((r) =>
    r.ok ? ((r.result as { total?: number } | undefined)?.total ?? null) : null,
  );
}

/** Initiative: uses the combat tracker when this character is in it, otherwise a plain roll. */
export function rollInitiative(c: Character, bonus: number, e?: ModEvent): void {
  const g = useGame.getState();
  const combat = g.state?.combat;
  const mode = rollModeFrom(e);
  const combatant = combat?.combatants.find((x) => x.characterId === c.id || (x.tokenId && findCharacterToken(c.id)?.token.id === x.tokenId));
  if (combat && combatant) {
    if (g.me?.role === 'dm') {
      void act('combat.roll', { who: 'ids', ids: [combatant.id], mode });
      return;
    }
    if (combatant.initiative === null) {
      void act('combat.roll', { who: 'mine', mode });
      return;
    }
  }
  void rollFormula(`1d20${signed(bonus)}`, 'Iniciativa', c.name, e);
}

// ---------------------------------------------------------------------------
// Map helpers
// ---------------------------------------------------------------------------

export async function placeOnMap(characterId: ID): Promise<boolean> {
  const scene = getViewScene();
  if (!scene) {
    toast('Nenhuma cena ativa para colocar o personagem.', 'warning');
    return false;
  }
  const existing = Object.values(scene.tokens).find((t) => t.characterId === characterId);
  if (existing) {
    engineApi.focusToken(existing.id);
    toast('Esse personagem já está nesta cena.', 'info');
    return false;
  }
  const c = engineApi.viewCenter();
  const half = scene.grid.size / 2;
  const res = await act('token.create', { sceneId: scene.id, token: { x: c.x - half, y: c.y - half }, fromCharacter: characterId });
  if (res.ok) {
    toast('Personagem colocado no mapa.', 'success', 2200);
    const id = (res.result as { ids?: string[] } | undefined)?.ids?.[0];
    if (id) window.setTimeout(() => engineApi.focusToken(id), 80);
  }
  return res.ok;
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

/** Downscale an image file (keeps aspect ratio) so portraits stay light. Falls back to the original file. */
export async function downscaleImage(file: Blob, maxSide = 512): Promise<Blob> {
  try {
    if (typeof createImageBitmap !== 'function' || file.type === 'image/gif') return file;
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && file.size < 400_000) {
      bmp.close();
      return file;
    }
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.9));
    return blob && blob.size > 0 ? blob : file;
  } catch {
    return file;
  }
}

export async function uploadPortrait(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) {
    toast('Escolha um arquivo de imagem.', 'warning');
    return null;
  }
  const blob = await downscaleImage(file, 512);
  const res = await uploadFile(blob);
  if (!res.ok || !res.url) {
    toast(res.error ?? 'Falha ao enviar a imagem.', 'danger');
    return null;
  }
  return res.url;
}

// ---------------------------------------------------------------------------
// Draft inputs (local state + debounced commit; never lose focus while typing)
// ---------------------------------------------------------------------------

export function useDraft<T>(value: T, commit: (v: T) => void, delay = 400) {
  const [draft, setDraft] = useState(value);
  const timer = useRef(0);
  const pending = useRef(false);
  const latest = useRef(value);
  const commitRef = useRef(commit);
  commitRef.current = commit;

  useEffect(() => {
    if (!pending.current) {
      latest.current = value;
      setDraft(value);
    }
  }, [value]);

  const flush = useCallback(() => {
    if (!pending.current) return;
    window.clearTimeout(timer.current);
    pending.current = false;
    commitRef.current(latest.current);
  }, []);

  const change = useCallback((v: T) => {
    latest.current = v;
    setDraft(v);
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, delay);
  }, [delay, flush]);

  const reset = useCallback((v: T) => {
    window.clearTimeout(timer.current);
    pending.current = false;
    latest.current = v;
    setDraft(v);
  }, []);

  useEffect(() => () => flush(), [flush]);
  return { draft, change, flush, reset };
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'defaultValue'>;

export const DraftInput = memo(function DraftInput({ value, onCommit, delay, className = 'input', ...rest }: InputProps & {
  value: string;
  onCommit: (v: string) => void;
  delay?: number;
}) {
  const { draft, change, flush } = useDraft(value, onCommit, delay);
  return (
    <input
      {...rest}
      className={className}
      value={draft}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        flush();
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') flush();
        rest.onKeyDown?.(e);
      }}
    />
  );
});

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'defaultValue'>;

export const DraftTextarea = memo(function DraftTextarea({ value, onCommit, delay, className = 'textarea', autoGrow = true, ...rest }: TextareaProps & {
  value: string;
  onCommit: (v: string) => void;
  delay?: number;
  autoGrow?: boolean;
}) {
  const { draft, change, flush } = useDraft(value, onCommit, delay);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight + 2, 640)}px`;
  }, [draft, autoGrow]);
  return (
    <textarea
      {...rest}
      ref={ref}
      className={className}
      value={draft}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        flush();
        rest.onBlur?.(e);
      }}
    />
  );
});

/** Integer input: free typing, commits on blur / Enter / pause. Accepts "+3" / "-2" relative to the value when `relative`. */
export const NumInput = memo(function NumInput({ value, onCommit, min = -9999, max = 99999, relative, className = 'input input--num', delay = 700, ...rest }: InputProps & {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  relative?: boolean;
  delay?: number;
}) {
  const parse = useCallback((s: string): number | null => {
    const t = s.trim().replace(',', '.');
    if (!t) return null;
    let n: number;
    if (relative && /^[+-]\d+$/.test(t)) n = value + Number(t);
    else n = Math.round(Number(t));
    if (!Number.isFinite(n)) return null;
    return Math.max(min, Math.min(max, n));
  }, [min, max, relative, value]);
  const commit = useCallback((s: string) => {
    const n = parse(s);
    if (n !== null && n !== value) onCommit(n);
  }, [parse, value, onCommit]);
  const { draft, change, flush, reset } = useDraft(String(value), commit, relative ? 1e9 : delay);
  return (
    <input
      inputMode="numeric"
      {...rest}
      className={className}
      value={draft}
      onFocus={(e) => {
        e.currentTarget.select();
        rest.onFocus?.(e);
      }}
      onChange={(e) => change(e.target.value)}
      onBlur={(e) => {
        flush();
        const n = parse(e.currentTarget.value);
        if (n === null || n === value) reset(String(value));
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          flush();
          e.currentTarget.blur();
        } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const next = Math.max(min, Math.min(max, value + (e.key === 'ArrowUp' ? 1 : -1)));
          if (next !== value) onCommit(next);
        }
        rest.onKeyDown?.(e);
      }}
    />
  );
});

// ---------------------------------------------------------------------------
// Pips (spell slots, feature uses, death saves)
// ---------------------------------------------------------------------------

/**
 * `filled` pips out of `total`. Clicking a filled pip calls onSpend, an empty one onRestore.
 * When there are many uses, a compact counter is shown instead.
 */
export const Pips = memo(function Pips({ total, filled, onSpend, onRestore, disabled, tone = 'gold', label }: {
  total: number;
  filled: number;
  onSpend?: () => void;
  onRestore?: () => void;
  disabled?: boolean;
  tone?: 'gold' | 'arcane' | 'success' | 'danger' | 'azure';
  label?: string;
}) {
  if (total > 12) {
    return (
      <span className={`cs-pips cs-pips--count cs-pips--${tone}`}>
        <button type="button" className="cs-pips__step" disabled={disabled || filled <= 0} onClick={onSpend} aria-label="Gastar">−</button>
        <span className="u-tabular">{filled}/{total}</span>
        <button type="button" className="cs-pips__step" disabled={disabled || filled >= total} onClick={onRestore} aria-label="Recuperar">+</button>
      </span>
    );
  }
  return (
    <span className={`cs-pips cs-pips--${tone}`} role="group" aria-label={label}>
      {Array.from({ length: total }, (_, i) => {
        const on = i < filled;
        return (
          <button
            key={i}
            type="button"
            className="cs-pip"
            data-on={on ? 'true' : undefined}
            disabled={disabled}
            aria-label={on ? 'Gastar' : 'Recuperar'}
            onClick={(e) => {
              e.stopPropagation();
              if (on) onSpend?.();
              else onRestore?.();
            }}
          />
        );
      })}
    </span>
  );
});

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

const CONDITION_ICONS: Record<string, ReactNode> = {
  EyeOff: <EyeOff />, Heart: <Heart />, EarOff: <EarOff />, BatteryLow: <BatteryLow />, Ghost: <Ghost />, Grab: <Grab />,
  Ban: <Ban />, SquareDashed: <SquareDashed />, Zap: <Zap />, Mountain: <Mountain />, FlaskConical: <FlaskConical />,
  ArrowDownToLine: <ArrowDownToLine />, Link: <Link />, Stars: <Stars />, Moon: <Moon />, Brain: <Brain />, Skull: <Skull />,
  Droplet: <Droplet />, Sparkles: <Sparkles />, FastForward: <FastForward />, Crosshair: <Crosshair />, EyeClosed: <EyeClosed />,
  Angry: <Angry />, Music: <Music />, ShieldHalf: <ShieldHalf />, Feather: <Feather />, Flame: <Flame />, Snail: <Snail />,
  Biohazard: <Biohazard />,
};

export function conditionIcon(name: string): ReactNode {
  return CONDITION_ICONS[name] ?? <CircleDot />;
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

export function classLine(c: Pick<Character, 'classes'>): string {
  if (!c.classes.length) return 'Sem classe';
  return c.classes.map((k) => `${k.name || 'Classe'} ${k.level}`).join(' / ');
}

export function ordinal(level: number): string {
  return `${level}º`;
}

export const EXHAUSTION_EFFECTS = [
  'Sem exaustão',
  'Desvantagem em testes de habilidade',
  'Deslocamento reduzido à metade',
  'Desvantagem em ataques e salvaguardas',
  'PV máximos reduzidos à metade',
  'Deslocamento reduzido a 0',
  'Morte',
];

export const RESET_LABEL: Record<'short' | 'long' | 'dawn' | 'none', string> = {
  short: 'Descanso curto',
  long: 'Descanso longo',
  dawn: 'Amanhecer',
  none: 'Manual',
};

// ---------------------------------------------------------------------------
// Lazy compendium modules (keep the sheet light until the data is needed)
// ---------------------------------------------------------------------------

type SpellsModule = typeof import('@shared/data5e/spells/index.ts');
type ItemsModule = typeof import('@shared/data5e/items.ts');

let spellsCache: SpellsModule | null = null;
let itemsCache: ItemsModule | null = null;
let spellsPromise: Promise<SpellsModule> | null = null;
let itemsPromise: Promise<ItemsModule> | null = null;

export function loadSpells(): Promise<SpellsModule> {
  spellsPromise ??= import('@shared/data5e/spells/index.ts').then((m) => (spellsCache = m));
  return spellsPromise;
}

export function loadItems(): Promise<ItemsModule> {
  itemsPromise ??= import('@shared/data5e/items.ts').then((m) => (itemsCache = m));
  return itemsPromise;
}

export function useSpellsModule(enabled = true): SpellsModule | null {
  const [mod, setMod] = useState<SpellsModule | null>(spellsCache);
  useEffect(() => {
    if (!enabled || mod) return;
    let alive = true;
    void loadSpells().then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, [enabled, mod]);
  return mod;
}

export function useItemsModule(enabled = true): ItemsModule | null {
  const [mod, setMod] = useState<ItemsModule | null>(itemsCache);
  useEffect(() => {
    if (!enabled || mod) return;
    let alive = true;
    void loadItems().then((m) => alive && setMod(m));
    return () => {
      alive = false;
    };
  }, [enabled, mod]);
  return mod;
}

/** Accent-insensitive lowercase. */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// Section (optionally collapsible, open state remembered)
// ---------------------------------------------------------------------------

export function Section({ title, icon, right, children, collapsible, defaultOpen = true, prefKey, className = '' }: {
  title: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  prefKey?: string;
  className?: string;
}) {
  const [open, setOpen] = useState<boolean>(() => (collapsible && prefKey ? getPref(`sheet.sec.${prefKey}`, defaultOpen) : defaultOpen));
  const toggle = () => {
    const v = !open;
    setOpen(v);
    if (prefKey) setPref(`sheet.sec.${prefKey}`, v);
  };
  const isOpen = !collapsible || open;
  return (
    <section className={`cs-section ${className}`} data-open={isOpen ? 'true' : undefined}>
      <div className="cs-section__head">
        {collapsible ? (
          <button type="button" className="cs-section__toggle section-title" onClick={toggle} aria-expanded={open}>
            <ChevronRight className="cs-section__chev" />
            {icon}
            <span>{title}</span>
          </button>
        ) : (
          <span className="section-title">{icon}<span>{title}</span></span>
        )}
        {right && <div className="cs-section__right">{right}</div>}
      </div>
      {isOpen && <div className="cs-section__body">{children}</div>}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Portrait (click or drop an image to upload)
// ---------------------------------------------------------------------------

export function Portrait({ c, canEdit, size = 'md' }: { c: Pick<Character, 'id' | 'name' | 'portrait'>; canEdit: boolean; size?: 'md' | 'lg' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const initials = c.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    const url = await uploadPortrait(file);
    setBusy(false);
    if (url) void patchCharacter(c.id, { portrait: url });
  };
  const img = assetUrl(c.portrait);
  return (
    <button
      type="button"
      className={`cs-portrait cs-portrait--${size}`}
      data-over={over ? 'true' : undefined}
      disabled={!canEdit}
      data-tip={canEdit ? 'Trocar retrato (clique ou solte uma imagem)' : undefined}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        if (!canEdit || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        setOver(false);
        void onFile(e.dataTransfer.files[0]);
      }}
    >
      {img ? <img src={img} alt="" draggable={false} /> : <span className="cs-portrait__initials">{initials}</span>}
      {canEdit && <span className="cs-portrait__overlay">{busy ? <Spinner /> : <Camera />}</span>}
      {canEdit && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            void onFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      )}
    </button>
  );
}

export function CharacterAvatar({ c, size = 32 }: { c: Pick<Character, 'name' | 'portrait'>; size?: number }) {
  const img = assetUrl(c.portrait);
  const initials = c.name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span className="cs-avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}>
      {img ? <img src={img} alt="" draggable={false} /> : initials}
    </span>
  );
}
