// Cinematic handout viewer: big image with a slow push-in, Cinzel title, markdown on dark parchment.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, ScrollText, X } from 'lucide-react';
import { assetUrl } from '../../net/api.ts';
import { useGame } from '../../store/game.ts';
import { Markdown, Spinner } from '../../ui/index.tsx';
import './journal.css';

const EXIT_MS = 260;

export default function HandoutModal({ journalId, onClose }: { journalId: string; onClose: () => void }) {
  const entry = useGame((s) => s.state?.journal[journalId] ?? null);
  const [closing, setClosing] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const closeBtn = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setClosing(true);
    window.setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  // The fx may arrive a moment before the entry itself is shared with us.
  useEffect(() => {
    if (entry) return;
    const t = window.setTimeout(() => setGaveUp(true), 3_000);
    return () => window.clearTimeout(t);
  }, [entry]);

  useEffect(() => {
    setImgLoaded(false);
    setZoomed(false);
  }, [journalId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (zoomed) setZoomed(false);
      else close();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [close, zoomed]);

  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
  }, []);

  const img = assetUrl(entry?.img);

  return createPortal(
    <div
      className="jr-handout"
      data-closing={closing ? 'true' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={entry?.title ?? 'Handout'}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="jr-handout__vignette" aria-hidden="true" />
      <button ref={closeBtn} type="button" className="jr-handout__close" onClick={close} aria-label="Fechar" data-tip="Fechar (Esc)">
        <X />
      </button>

      {!entry ? (
        <div className="jr-handout__missing">
          {gaveUp ? (
            <>
              <ScrollText />
              <div className="u-display">Esta página não está disponível.</div>
              <button type="button" className="btn btn--sm" onClick={close}>Fechar</button>
            </>
          ) : (
            <Spinner />
          )}
        </div>
      ) : (
        <article className="jr-handout__folio" data-has-img={img ? 'true' : undefined}>
          {img && (
            <figure className="jr-handout__figure" data-loaded={imgLoaded ? 'true' : undefined}>
              <div className="jr-handout__blur" style={{ backgroundImage: `url("${img.replace(/"/g, '%22')}")` }} aria-hidden="true" />
              <img src={img} alt="" onLoad={() => setImgLoaded(true)} onClick={() => setZoomed(true)} />
              <button type="button" className="jr-handout__zoom" onClick={() => setZoomed(true)} aria-label="Ampliar imagem" data-tip="Ampliar">
                <Maximize2 />
              </button>
            </figure>
          )}
          <div className="jr-handout__content">
            {entry.folder && <div className="jr-handout__kicker">{entry.folder}</div>}
            <h1 className="jr-handout__title">{entry.title || 'Sem título'}</h1>
            <div className="jr-ornament jr-ornament--lg" aria-hidden="true"><span /></div>
            {entry.body.trim() && <Markdown text={entry.body} className="jr-md jr-handout__md" />}
          </div>
        </article>
      )}

      {zoomed && img && (
        <div className="jr-lightbox" onClick={() => setZoomed(false)} role="presentation">
          <img src={img} alt={entry?.title ?? ''} />
        </div>
      )}
    </div>,
    document.body,
  );
}
