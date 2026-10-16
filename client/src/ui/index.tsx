// UI primitives. Styling lives in styles/components.css (class names documented there).
// Tooltips: put `data-tip="Texto"` (and optional `data-kbd="T"`) on any element — a global listener shows them.
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import {
  useEffect, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { create } from 'zustand';

type Variant = 'default' | 'primary' | 'danger' | 'success' | 'ghost' | 'arcane';

export function Button({
  variant = 'default', size, block, icon, children, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'lg'; block?: boolean; icon?: ReactNode }) {
  const cls = ['btn', variant !== 'default' && `btn--${variant}`, size && `btn--${size}`, block && 'btn--block', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}

export function IconButton({
  icon, label, kbd, active, size, dm, danger, className = '', ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; label: string; kbd?: string; active?: boolean; size?: 'sm' | 'lg'; dm?: boolean; danger?: boolean }) {
  const cls = ['icon-btn', size && `icon-btn--${size}`, dm && 'icon-btn--dm', danger && 'icon-btn--danger', className].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} aria-label={label} data-tip={label} data-kbd={kbd} data-active={active ? 'true' : undefined} {...rest}>
      {icon}
    </button>
  );
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className="toggle" style={disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span className="toggle__track" />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Field({ label, hint, error, children, style }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <label className="field" style={style}>
      {label && <span className="field__label">{label}</span>}
      {children}
      {error ? <span className="field__error">{error}</span> : hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: {
  value: T;
  options: { value: T; label: ReactNode; icon?: ReactNode; tip?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} data-active={value === o.value ? 'true' : undefined} data-tip={o.tip} onClick={() => onChange(o.value)}>
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>({ value, tabs, onChange, className = '' }: {
  value: T;
  tabs: { value: T; label: ReactNode; icon?: ReactNode; badge?: ReactNode }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={`tabs ${className}`} role="tablist">
      {tabs.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} data-active={value === t.value ? 'true' : undefined} onClick={() => onChange(t.value)}>
          {t.icon}
          {t.label}
          {t.badge}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, color, img, size }: { name: string; color?: string; img?: string | null; size?: 'sm' | 'lg' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
  return (
    <span className={`avatar ${size ? `avatar--${size}` : ''}`} style={{ background: color }}>
      {img ? <img src={img} alt="" /> : initials}
    </span>
  );
}

export function HpBar({ cur, max, temp = 0, masked }: { cur: number; max: number; temp?: number; masked?: boolean }) {
  const pct = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  const color = pct > 0.5 ? 'linear-gradient(90deg,#2f9e6e,#3fbf8f)' : pct > 0.25 ? 'linear-gradient(90deg,#c27c1e,#f0a43a)' : 'linear-gradient(90deg,#b8322b,#e2554d)';
  const tempPct = max > 0 ? Math.min(1, temp / max) : 0;
  return (
    <div className="hp-bar" title={masked ? undefined : `${cur}/${max}${temp ? ` (+${temp})` : ''}`}>
      <div className="hp-bar__fill" style={{ width: `${pct * 100}%`, background: color }} />
      {tempPct > 0 && <div className="hp-bar__temp" style={{ width: `${tempPct * 100}%` }} />}
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-label="Carregando" />;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div className="empty__title">{title}</div>
      {children && <div className="u-sm">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function Modal({ title, icon, onClose, children, footer, size, headerExtra, dismissable = true }: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'wide' | 'full';
  headerExtra?: ReactNode;
  dismissable?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, dismissable]);
  return createPortal(
    <div className="modal-backdrop" onPointerDown={(e) => { if (e.target === e.currentTarget && dismissable) onClose(); }}>
      <div className={`modal ${size ? `modal--${size}` : ''}`} role="dialog" aria-modal="true">
        <div className="modal__header">
          {icon && <span className="u-gold u-center">{icon}</span>}
          <div className="modal__title u-ellipsis">{title}</div>
          {headerExtra}
          {dismissable && <IconButton icon={<X />} label="Fechar" onClick={onClose} />}
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Popover (anchored, portal, flips inside the viewport)
// ---------------------------------------------------------------------------

export type Anchor = HTMLElement | { x: number; y: number };

export function Popover({ anchor, onClose, children, placement = 'bottom', className = '', style, offset = 8 }: {
  anchor: Anchor;
  onClose: () => void;
  children: ReactNode;
  placement?: 'bottom' | 'top' | 'right' | 'left';
  className?: string;
  style?: React.CSSProperties;
  offset?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : new DOMRect(anchor.x, anchor.y, 0, 0);
    const w = el.offsetWidth, h = el.offsetHeight;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = r.left, top = r.bottom + offset;
    if (placement === 'top') top = r.top - h - offset;
    if (placement === 'right') { left = r.right + offset; top = r.top; }
    if (placement === 'left') { left = r.left - w - offset; top = r.top; }
    if (placement === 'bottom' && top + h > vh - 8) top = r.top - h - offset;
    if (placement === 'top' && top < 8) top = r.bottom + offset;
    if (placement === 'right' && left + w > vw - 8) left = r.left - w - offset;
    left = Math.max(8, Math.min(left, vw - w - 8));
    top = Math.max(8, Math.min(top, vh - h - 8));
    setPos({ left, top });
  }, [anchor, placement, offset]);
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (anchor instanceof HTMLElement && anchor.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const id = window.setTimeout(() => window.addEventListener('pointerdown', onDown, true), 0);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className={`popover ${className}`} style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, ...style }}>
      {children}
    </div>,
    document.body,
  );
}

export function MenuItem({ icon, children, onClick, danger, disabled, kbd }: { icon?: ReactNode; children: ReactNode; onClick?: () => void; danger?: boolean; disabled?: boolean; kbd?: string }) {
  return (
    <button type="button" className={`menu__item ${danger ? 'menu__item--danger' : ''}`} onClick={onClick} disabled={disabled}>
      {icon}
      <span className="u-grow">{children}</span>
      {kbd && <span className="kbd">{kbd}</span>}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export type Tone = 'info' | 'success' | 'warning' | 'danger';
interface ToastItem { id: number; text: ReactNode; tone: Tone; icon?: ReactNode }

export const useToasts = create<{ items: ToastItem[]; push: (text: ReactNode, tone?: Tone, ms?: number, icon?: ReactNode) => void; dismiss: (id: number) => void }>((set, get) => ({
  items: [],
  push: (text, tone = 'info', ms = 3800, icon) => {
    const id = Date.now() + Math.random();
    set({ items: [...get().items.slice(-4), { id, text, tone, icon }] });
    window.setTimeout(() => get().dismiss(id), ms);
  },
  dismiss: (id) => set({ items: get().items.filter((t) => t.id !== id) }),
}));

export const toast = (text: ReactNode, tone: Tone = 'info', ms?: number) => useToasts.getState().push(text, tone, ms);

export function Toasts({ icons }: { icons: Record<Tone, ReactNode> }) {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  return createPortal(
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`} onClick={() => dismiss(t.id)}>
          {t.icon ?? icons[t.tone]}
          <span>{t.text}</span>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Global tooltip (data-tip)
// ---------------------------------------------------------------------------

export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; kbd?: string; x: number; y: number; below: boolean; right?: boolean } | null>(null);
  useEffect(() => {
    let timer = 0;
    let current: HTMLElement | null = null;
    const show = (el: HTMLElement) => {
      const text = el.dataset.tip;
      if (!text) return;
      const r = el.getBoundingClientRect();
      const below = r.top < 60;
      const side = el.dataset.tipSide;
      if (side === 'right') setTip({ text, kbd: el.dataset.kbd, x: r.right + 10, y: r.top + r.height / 2, below: false, right: true });
      else setTip({ text, kbd: el.dataset.kbd, x: r.left + r.width / 2, y: below ? r.bottom + 8 : r.top - 8, below });
    };
    const over = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
      if (el === current) return;
      current = el;
      window.clearTimeout(timer);
      setTip(null);
      if (el) timer = window.setTimeout(() => show(el), 380);
    };
    const hide = () => {
      window.clearTimeout(timer);
      current = null;
      setTip(null);
    };
    window.addEventListener('pointerover', over);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, { passive: true });
    return () => {
      window.removeEventListener('pointerover', over);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide);
    };
  }, []);
  if (!tip) return null;
  return createPortal(
    <div
      className="tooltip"
      style={{
        left: tip.x,
        top: tip.y,
        transform: tip.right ? 'translate(0, -50%)' : tip.below ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      {tip.text}
      {tip.kbd && <span className="kbd">{tip.kbd}</span>}
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string, {
    FORBID_TAGS: ['style', 'iframe', 'form', 'input', 'script'],
    FORBID_ATTR: ['style', 'onerror', 'onclick'],
  });
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className={`markdown ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

// ---------------------------------------------------------------------------
// Confirm dialog (promise based)
// ---------------------------------------------------------------------------

const useConfirm = create<{ req: { title: string; text: ReactNode; danger?: boolean; ok: string; resolve: (v: boolean) => void } | null }>(() => ({ req: null }));

export function confirmDialog(title: string, text: ReactNode, opts: { danger?: boolean; ok?: string } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirm.setState({ req: { title, text, danger: opts.danger, ok: opts.ok ?? 'Confirmar', resolve } });
  });
}

export function ConfirmLayer() {
  const req = useConfirm((s) => s.req);
  if (!req) return null;
  const close = (v: boolean) => {
    req.resolve(v);
    useConfirm.setState({ req: null });
  };
  return (
    <Modal
      title={req.title}
      onClose={() => close(false)}
      footer={(
        <>
          <Button variant="ghost" onClick={() => close(false)}>Cancelar</Button>
          <Button variant={req.danger ? 'danger' : 'primary'} onClick={() => close(true)} autoFocus>{req.ok}</Button>
        </>
      )}
    >
      <div className="u-soft">{req.text}</div>
    </Modal>
  );
}
