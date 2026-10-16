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
};

export function aiEnabled(): boolean {
  return !!(config.ai.moonshotKey || config.ai.openrouterKey);
}
