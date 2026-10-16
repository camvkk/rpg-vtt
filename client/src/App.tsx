import { lazy, Suspense, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { Lobby } from './lobby/Lobby.tsx';
import { join, JOIN_TIMEOUT } from './net/socket.ts';
import { findTable } from './net/session.ts';
import { useGame } from './store/game.ts';
import { ConfirmLayer, Spinner, Toasts, TooltipLayer } from './ui/index.tsx';

const Table = lazy(() => import('./table/Table.tsx'));

function codeFromPath(): string | null {
  const m = /^\/m\/([A-Za-z0-9]{4,10})\/?$/.exec(window.location.pathname);
  return m ? m[1]!.toUpperCase() : null;
}

export function App() {
  const status = useGame((s) => s.status);
  const code = useGame((s) => s.code);
  const hasState = useGame((s) => !!s.state);
  const [booting, setBooting] = useState(() => {
    const c = codeFromPath();
    return !!(c && findTable(c));
  });
  const [linkCode] = useState(codeFromPath);

  // Auto-rejoin when opening /m/CODE with a remembered session (retrying while the server is unreachable).
  useEffect(() => {
    const c = codeFromPath();
    const saved = c ? findTable(c) : undefined;
    if (!c || !saved) return;
    let cancelled = false;
    void (async () => {
      for (let attempt = 0; attempt < 30 && !cancelled; attempt++) {
        const res = await join({ code: c, token: saved.token, name: saved.playerName });
        if (res.ok || res.error !== JOIN_TIMEOUT) break;
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!cancelled) setBooting(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the URL in sync with the joined table.
  useEffect(() => {
    if (code && hasState) {
      if (codeFromPath() !== code) window.history.replaceState(null, '', `/m/${code}`);
      document.title = `${useGame.getState().state?.name ?? 'Mesa'} — RPG VTT`;
    } else if (!code && status === 'idle' && codeFromPath() && !booting) {
      // stay on /m/CODE so the lobby can prefill the join form
    }
  }, [code, hasState, status, booting]);

  const inTable = hasState && code;

  return (
    <>
      {inTable ? (
        <Suspense fallback={<FullscreenLoading text="Preparando a mesa…" />}>
          <Table />
        </Suspense>
      ) : booting ? (
        <FullscreenLoading text="Voltando para a mesa…" />
      ) : (
        <Lobby initialCode={linkCode} />
      )}
      <Toasts
        icons={{
          info: <Info />,
          success: <CheckCircle2 />,
          warning: <AlertTriangle />,
          danger: <XCircle />,
        }}
      />
      <TooltipLayer />
      <ConfirmLayer />
    </>
  );
}

export function FullscreenLoading({ text }: { text: string }) {
  return (
    <div className="u-center" style={{ height: '100%', flexDirection: 'column', gap: 16, background: 'radial-gradient(circle at 50% 40%, #1d1726, #09080c 70%)' }}>
      <Spinner />
      <div className="u-display u-gold" style={{ letterSpacing: '0.2em', fontSize: 13 }}>{text}</div>
    </div>
  );
}
