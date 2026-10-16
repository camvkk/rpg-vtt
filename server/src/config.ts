import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(here, '../..');

try {
  process.loadEnvFile(path.join(ROOT_DIR, '.env'));
} catch {
  // no .env — fine
}

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 3001),
  host: env.HOST ?? '0.0.0.0',
  production: env.NODE_ENV === 'production',
  dataDir: path.resolve(ROOT_DIR, env.DATA_DIR ?? 'data'),
  clientDist: path.join(ROOT_DIR, 'dist', 'client'),
  /** Extra allowed origins for CORS/socket (comma separated). Same-origin always works. */
  corsOrigins: (env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  maxUploadMb: Number(env.MAX_UPLOAD_MB ?? 30),
  campaignQuotaMb: Number(env.CAMPAIGN_QUOTA_MB ?? 500),
  ai: {
    moonshotKey: env.MOONSHOT_API_KEY ?? '',
    openrouterKey: env.OPENROUTER_API_KEY ?? '',
    /** Override model name if needed. */
    model: env.AI_MODEL ?? '',
  },
  /** Off-site copy of the database + uploads, for hosts without a persistent disk (see backup.ts). */
  s3: {
    endpoint: s3Endpoint(env.S3_ENDPOINT ?? ''),
    region: env.S3_REGION || /^https:\/\/s3\.([a-z0-9-]+)\./.exec(s3Endpoint(env.S3_ENDPOINT ?? ''))?.[1] || 'us-east-1',
    bucket: env.S3_BUCKET ?? '',
    accessKeyId: env.S3_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? '',
    prefix: (env.S3_PREFIX ?? '').replace(/^\/+|\/+$/g, ''),
    snapshotIntervalMs: Number(env.SNAPSHOT_INTERVAL_MS ?? 30_000),
  },
};

/** Backblaze shows the endpoint without a scheme ("s3.us-east-005.backblazeb2.com"). */
function s3Endpoint(raw: string): string {
  const s = raw.trim().replace(/\/+$/, '');
  return !s || /^https?:\/\//.test(s) ? s : `https://${s}`;
}

export function aiEnabled(): boolean {
  return !!(config.ai.moonshotKey || config.ai.openrouterKey);
}
