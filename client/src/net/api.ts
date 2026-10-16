import type { CreateCampaignRequest, CreateCampaignResponse } from '@shared/protocol.ts';
import { useGame } from '../store/game.ts';
import { SERVER_URL } from './socket.ts';

async function json<T>(res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch {
    return { ok: false, error: `Erro ${res.status}` } as T;
  }
}

export async function createCampaign(req: CreateCampaignRequest): Promise<CreateCampaignResponse> {
  try {
    const res = await fetch(`${SERVER_URL}/api/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return await json<CreateCampaignResponse>(res);
  } catch {
    return { ok: false, error: 'Não foi possível falar com o servidor.' };
  }
}

export async function lookupCampaign(code: string): Promise<{ ok: true; name: string; players: number; hasPassword: boolean } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${SERVER_URL}/api/campaigns/${encodeURIComponent(code.toUpperCase())}`);
    return await json(res);
  } catch {
    return { ok: false, error: 'Não foi possível falar com o servidor.' };
  }
}

export interface UploadResult {
  ok: boolean;
  url?: string;
  width?: number;
  height?: number;
  mime?: string;
  error?: string;
}

/** Upload a file to the campaign asset store. */
export async function uploadFile(file: Blob): Promise<UploadResult> {
  const { code, token } = useGame.getState();
  if (!code || !token) return { ok: false, error: 'Sem sessão.' };
  try {
    const res = await fetch(`${SERVER_URL}/api/assets`, {
      method: 'POST',
      headers: { 'x-vtt-code': code, 'x-vtt-token': token, 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const out = await json<UploadResult>(res);
    if (out.ok && out.url && SERVER_URL) out.url = `${SERVER_URL}${out.url}`;
    return out;
  } catch {
    return { ok: false, error: 'Falha no envio.' };
  }
}

export async function setDmPassword(password: string | null): Promise<boolean> {
  const { code, token } = useGame.getState();
  if (!code || !token) return false;
  const res = await fetch(`${SERVER_URL}/api/campaigns/${code}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-vtt-code': code, 'x-vtt-token': token },
    body: JSON.stringify({ password }),
  });
  return res.ok;
}

/** Resolve asset URLs (relative server paths) for split deployments. */
export function assetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (url.startsWith('/assets/') && SERVER_URL) return `${SERVER_URL}${url}`;
  return url;
}
