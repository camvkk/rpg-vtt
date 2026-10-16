// Off-site persistence for hosts without a persistent disk (e.g. Render free, whose filesystem is wiped on
// every deploy, restart and spin-down). The SQLite database and the uploads are mirrored to an S3-compatible
// bucket (Backblaze B2, Cloudflare R2, MinIO...), which is the source of truth:
//   - boot: the database is restored from the bucket BEFORE it is opened; if the bucket can't be reached the
//     server refuses to start, so an empty database never overwrites a real backup;
//   - while running: a consistent snapshot (VACUUM INTO, gzipped) is uploaded whenever something changed;
//   - shutdown: one last snapshot (Render sends SIGTERM before deploys and spin-downs);
//   - uploads go to the bucket before the request succeeds and are fetched back on demand after a restart.
// Disabled (a no-op) unless S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are set.
// Never point two running servers at the same bucket/prefix: each would overwrite the other's snapshots.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config } from './config.ts';
import { getDb } from './db.ts';

const DB_KEY = 'vtt.db.gz';
const SQLITE_MAGIC = 'SQLite format 3\0';

const s3 = config.s3;
let restoredRemote = false;
let lastChanges = -1;
let lastSnapshotAt = 0;
let inFlight: Promise<void> | null = null;
let timer: NodeJS.Timeout | null = null;

export function backupEnabled(): boolean {
  return !!(s3.endpoint && s3.bucket && s3.accessKeyId && s3.secretAccessKey);
}

export function backupStatus(): { enabled: boolean; lastSnapshotAt: number | null } {
  return { enabled: backupEnabled(), lastSnapshotAt: lastSnapshotAt || null };
}

/** Restores the database from the bucket. Call before getDb(). Throws if the bucket stays unreachable. */
export async function restoreBackup(opts: { attempts?: number; delayMs?: number } = {}): Promise<void> {
  if (!backupEnabled()) return;
  const attempts = opts.attempts ?? 5;
  for (let attempt = 1; ; attempt++) {
    try {
      const gz = await s3Request('GET', DB_KEY);
      if (!gz) {
        console.log('[backup] bucket sem banco ainda — começando com os dados locais');
        return;
      }
      const buf = zlib.gunzipSync(gz);
      if (buf.subarray(0, 16).toString('latin1') !== SQLITE_MAGIC) throw new Error('o backup não é um banco SQLite');
      const dbPath = path.join(config.dataDir, 'vtt.db');
      fs.mkdirSync(config.dataDir, { recursive: true });
      fs.writeFileSync(`${dbPath}.restore`, buf);
      for (const f of [`${dbPath}-wal`, `${dbPath}-shm`]) fs.rmSync(f, { force: true });
      fs.renameSync(`${dbPath}.restore`, dbPath);
      restoredRemote = true;
      console.log(`[backup] banco restaurado do bucket (${(buf.length / 1024).toFixed(0)} KB)`);
      return;
    } catch (e) {
      if (attempt >= attempts) throw new Error(`[backup] não foi possível restaurar do bucket: ${(e as Error).message}`);
      console.error(`[backup] tentativa ${attempt} de restaurar falhou: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, (opts.delayMs ?? 2_000) * attempt));
    }
  }
}

/** Starts periodic snapshots. A freshly restored database isn't re-uploaded until it changes. */
export function startBackups(): void {
  if (!backupEnabled() || timer) return;
  if (restoredRemote) lastChanges = totalChanges();
  timer = setInterval(() => void snapshotIfChanged(), s3.snapshotIntervalMs);
  timer.unref();
  void snapshotIfChanged();
}

/** Final snapshot on shutdown. */
export async function flushBackup(): Promise<void> {
  if (!backupEnabled()) return;
  if (timer) clearInterval(timer);
  timer = null;
  await inFlight;
  await snapshotIfChanged();
}

export async function backupAsset(campaignId: string, file: string, body: Buffer, mime: string): Promise<void> {
  if (!backupEnabled()) return;
  await s3Request('PUT', `assets/${campaignId}/${file}`, body, mime);
}

/** Fetches an upload that isn't on local disk (after a restart) and caches it there. */
export async function fetchAsset(campaignId: string, file: string): Promise<Buffer | null> {
  if (!backupEnabled()) return null;
  const buf = await s3Request('GET', `assets/${campaignId}/${file}`);
  if (!buf) return null;
  const dir = path.join(config.dataDir, 'assets', campaignId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return buf;
}

function totalChanges(): number {
  return (getDb().prepare('SELECT total_changes() AS n').get() as { n: number }).n;
}

function snapshotIfChanged(): Promise<void> {
  if (inFlight) return inFlight;
  const changes = totalChanges();
  if (changes === lastChanges) return Promise.resolve();
  inFlight = (async () => {
    const tmp = path.join(config.dataDir, 'vtt.snapshot.db');
    fs.rmSync(tmp, { force: true });
    getDb().exec(`VACUUM INTO '${tmp.replaceAll("'", "''")}'`);
    const gz = zlib.gzipSync(fs.readFileSync(tmp));
    fs.rmSync(tmp, { force: true });
    await s3Request('PUT', DB_KEY, gz, 'application/gzip');
    lastChanges = changes;
    lastSnapshotAt = Date.now();
  })()
    .catch((e) => console.error('[backup] falha ao enviar snapshot (tento de novo em instantes)', e))
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

// --- Minimal S3 client (path-style URLs, AWS Signature V4) ------------------------------------------------

/** GET returns null on 404; PUT returns null. Anything else non-2xx throws. */
async function s3Request(method: 'GET' | 'PUT', key: string, body?: Buffer, contentType?: string): Promise<Buffer | null> {
  const fullKey = s3.prefix ? `${s3.prefix}/${key}` : key;
  const url = new URL(s3.endpoint);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/${[s3.bucket, ...fullKey.split('/')].map(uriEncode).join('/')}`;
  const payload = body ?? Buffer.alloc(0);
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': sha256Hex(payload),
    'x-amz-date': amzDate(new Date()),
  };
  if (contentType) headers['content-type'] = contentType;
  headers.authorization = signV4({
    method, path: url.pathname, query: '', headers, region: s3.region,
    accessKeyId: s3.accessKeyId, secretAccessKey: s3.secretAccessKey,
  });
  const { host: _host, ...sent } = headers; // fetch sets Host itself
  const res = await fetch(url, {
    method,
    headers: sent,
    body: method === 'PUT' ? new Uint8Array(payload) : undefined,
    signal: AbortSignal.timeout(60_000),
  });
  if (method === 'GET' && res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 ${method} ${fullKey}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return method === 'GET' ? Buffer.from(await res.arrayBuffer()) : null;
}

export interface SignInput {
  method: string;
  /** Already URI-encoded path. */
  path: string;
  /** Already canonical (sorted, encoded) query string, or ''. */
  query: string;
  /** Every header here is signed; must include host, x-amz-date and x-amz-content-sha256. */
  headers: Record<string, string>;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Returns the Authorization header value for an S3 request (AWS Signature Version 4). */
export function signV4(r: SignInput): string {
  const names = Object.keys(r.headers).map((h) => h.toLowerCase()).sort();
  const lower = Object.fromEntries(Object.entries(r.headers).map(([k, v]) => [k.toLowerCase(), v.trim()]));
  const signedHeaders = names.join(';');
  const canonical = [
    r.method, r.path, r.query,
    names.map((h) => `${h}:${lower[h]}\n`).join(''),
    signedHeaders, lower['x-amz-content-sha256'],
  ].join('\n');
  const date = lower['x-amz-date']!;
  const scope = `${date.slice(0, 8)}/${r.region}/s3/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', date, scope, sha256Hex(canonical)].join('\n');
  let key: Buffer = hmac(`AWS4${r.secretAccessKey}`, date.slice(0, 8));
  for (const part of [r.region, 's3', 'aws4_request']) key = hmac(key, part);
  const signature = hmac(key, toSign).toString('hex');
  return `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

function hmac(key: string | Buffer, data: string): Buffer {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function amzDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function uriEncode(s: string): string {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}
