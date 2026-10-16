import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import type { CreateCampaignRequest } from '../../shared/src/protocol.ts';
import { newId } from '../../shared/src/util.ts';
import { backupAsset, backupEnabled, backupStatus, fetchAsset } from './backup.ts';
import { aiEnabled, config } from './config.ts';
import { imageSize, sniff } from './images.ts';
import { RateLimiter } from './ratelimit.ts';
import { createCampaignFromRequest, getRoom, setCampaignPassword } from './rooms.ts';
import * as store from './store.ts';

const ipLimiter = new RateLimiter(60, 60_000);

function ip(req: Request): string {
  return (req.headers['cf-connecting-ip'] as string) || req.ip || 'unknown';
}

function limited(req: Request, res: Response, bucket: string, capacity: number): boolean {
  if (ipLimiter.take(`${bucket}:${ip(req)}`, capacity)) return false;
  res.status(429).json({ ok: false, error: 'Muitas requisições. Tente de novo em instantes.' });
  return true;
}

function authPlayer(req: Request): { room: NonNullable<ReturnType<typeof getRoom>>; playerId: string; role: 'dm' | 'player' } | null {
  const code = String(req.headers['x-vtt-code'] ?? '').toUpperCase();
  const token = String(req.headers['x-vtt-token'] ?? '');
  if (!code || !token) return null;
  const room = getRoom(code);
  if (!room) return null;
  const session = store.findSession(token);
  if (!session || session.campaign_id !== room.id) return null;
  const player = room.state.players[session.player_id];
  if (!player) return null;
  return { room, playerId: player.id, role: player.role };
}

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  if (config.corsOrigins.length) {
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin && config.corsOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'content-type, x-vtt-code, x-vtt-token');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      }
      if (req.method === 'OPTIONS') {
        res.sendStatus(204);
        return;
      }
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '2.0.0', ai: aiEnabled(), backup: backupStatus() });
  });

  app.post('/api/campaigns', express.json({ limit: '16kb' }), (req, res) => {
    if (limited(req, res, 'create', 20)) return;
    const body = req.body as Partial<CreateCampaignRequest>;
    if (typeof body?.name !== 'string' || typeof body?.dmName !== 'string') {
      res.status(400).json({ ok: false, error: 'Informe o nome da campanha e o seu nome.' });
      return;
    }
    if (body.dmPassword && String(body.dmPassword).length > 200) {
      res.status(400).json({ ok: false, error: 'Senha longa demais.' });
      return;
    }
    const starter = ['blank', 'tavern', 'dungeon', 'forest'].includes(String(body.starter)) ? body.starter : 'blank';
    const result = createCampaignFromRequest({
      name: body.name, dmName: body.dmName, dmPassword: body.dmPassword ? String(body.dmPassword) : undefined, starter,
    });
    res.json({ ok: true, ...result });
  });

  app.get('/api/campaigns/:code', (req, res) => {
    if (limited(req, res, 'lookup', 60)) return;
    const summary = store.campaignSummary(String(req.params.code).toUpperCase());
    if (!summary) {
      res.status(404).json({ ok: false, error: 'Mesa não encontrada.' });
      return;
    }
    res.json({ ok: true, ...summary });
  });

  app.post('/api/campaigns/:code/password', express.json({ limit: '4kb' }), (req, res) => {
    const auth = authPlayer(req);
    if (!auth || auth.role !== 'dm') {
      res.status(403).json({ ok: false, error: 'Apenas o Mestre.' });
      return;
    }
    const pw = (req.body as { password?: string })?.password;
    setCampaignPassword(auth.room, pw && String(pw).trim() ? String(pw).trim().slice(0, 200) : null);
    res.json({ ok: true });
  });

  // Uploads: raw body, sniffed by magic bytes, stored under DATA_DIR/assets/<campaignId>/.
  app.post('/api/assets', express.raw({ type: () => true, limit: `${config.maxUploadMb}mb` }), async (req, res) => {
    if (limited(req, res, 'upload', 40)) return;
    const auth = authPlayer(req);
    if (!auth) {
      res.status(401).json({ ok: false, error: 'Sessão inválida.' });
      return;
    }
    const buf = req.body as Buffer;
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      res.status(400).json({ ok: false, error: 'Arquivo vazio.' });
      return;
    }
    const kind = sniff(buf);
    if (!kind) {
      res.status(415).json({ ok: false, error: 'Formato não suportado. Use PNG, JPG, WEBP, GIF, MP3, OGG, WAV ou PDF.' });
      return;
    }
    if (auth.role !== 'dm' && kind.kind !== 'image') {
      res.status(403).json({ ok: false, error: 'Jogadores só podem enviar imagens.' });
      return;
    }
    if (store.campaignAssetBytes(auth.room.id) + buf.length > config.campaignQuotaMb * 1024 * 1024) {
      res.status(413).json({ ok: false, error: 'Espaço da campanha esgotado.' });
      return;
    }
    const id = newId(16);
    const file = `${id}.${kind.ext}`;
    const dir = path.join(config.dataDir, 'assets', auth.room.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), buf);
    try {
      await backupAsset(auth.room.id, file, buf, kind.mime);
    } catch (e) {
      console.error('[backup] falha ao enviar upload', e);
      fs.rmSync(path.join(dir, file), { force: true });
      res.status(503).json({ ok: false, error: 'Não foi possível guardar o arquivo agora. Tente de novo.' });
      return;
    }
    store.insertAsset({ id, campaignId: auth.room.id, kind: kind.kind, mime: kind.mime, size: buf.length, file });
    const size = kind.kind === 'image' ? imageSize(buf, kind.mime) : null;
    res.json({ ok: true, url: `/assets/${auth.room.id}/${file}`, mime: kind.mime, ...(size ?? {}) });
  });

  if (!config.production) {
    // Dev tooling: save a PNG snapshot of the map canvas for visual checks.
    app.post('/api/dev/snapshot', express.raw({ type: () => true, limit: '20mb' }), (req, res) => {
      const name = String(req.query.name ?? 'snapshot').replace(/[^\w-]/g, '').slice(0, 40) || 'snapshot';
      const dir = path.join(config.dataDir, 'dev-snapshots');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.png`), req.body as Buffer);
      res.json({ ok: true, file: path.join(dir, `${name}.png`) });
    });
  }

  const assetHeaders = (res: Response) => {
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  };
  app.use('/assets', express.static(path.join(config.dataDir, 'assets'), {
    immutable: true,
    maxAge: '365d',
    index: false,
    dotfiles: 'deny',
    setHeaders: assetHeaders,
  }));
  if (backupEnabled()) {
    // Not on local disk (the server restarted on an empty filesystem): bring it back from the bucket.
    app.get('/assets/:campaign/:file', async (req, res, next) => {
      const { campaign, file } = req.params;
      if (!/^[\w-]{1,64}$/.test(campaign) || !/^[\w-]{1,64}\.[a-z0-9]{2,5}$/.test(file)) return next();
      const buf = await fetchAsset(campaign, file);
      if (!buf) return next();
      assetHeaders(res);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.type(path.extname(file)).send(buf);
    });
  }

  // Production: serve the built client (also serves /maps built-ins from client/public).
  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api\/|assets\/|socket\.io\/).*/, (_req, res) => {
      res.sendFile(path.join(config.clientDist, 'index.html'));
    });
  }

  return app;
}
