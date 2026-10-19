import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

let admin: SupabaseClient | null = null;

export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error('Missing environment variable ' + name);
  return v;
}

// Server-only client. The service role key can call wallet_topup and wallet_forfeit.
export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  }
  return admin;
}

// The extension and the wallet page both send the Supabase access token as a Bearer token.
export async function userFrom(req: Request): Promise<User | null> {
  const auth = req.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  return error ? null : data.user;
}

function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  const ext = process.env.EXTENSION_ID || 'hjcpkhjkanikiahcjmhcblnnkloopnmc';
  if (origin === 'chrome-extension://' + ext) return origin;
  return null;
}

export function json(req: Request, body: unknown, status = 200): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json', 'cache-control': 'no-store' };
  const origin = allowedOrigin(req);
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['vary'] = 'Origin';
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export function preflight(req: Request): Response {
  const origin = allowedOrigin(req);
  if (!origin) return new Response(null, { status: 204 });
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-max-age': '86400',
      vary: 'Origin'
    }
  });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

type RpcRow = { ok: boolean; balance_paise: number; duplicate: boolean };

export async function rpcWallet(fn: 'wallet_topup' | 'wallet_forfeit', args: Record<string, unknown>): Promise<RpcRow> {
  const { data, error } = await supabaseAdmin().rpc(fn, args);
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined;
  if (!row) throw new Error(fn + ' returned nothing');
  return { ok: !!row.ok, balance_paise: Number(row.balance_paise), duplicate: !!row.duplicate };
}

// Razorpay REST API with Basic auth. Test keys only: live keys are refused.
export async function razorpay(path: string, init?: { method?: string; body?: unknown }): Promise<any> {
  const id = env('RAZORPAY_KEY_ID');
  if (!id.startsWith('rzp_test_')) throw new Error('Only Razorpay test keys (rzp_test_...) are allowed in this build');
  const res = await fetch('https://api.razorpay.com/v1' + path, {
    method: init?.method || 'GET',
    headers: {
      authorization: 'Basic ' + Buffer.from(id + ':' + env('RAZORPAY_KEY_SECRET')).toString('base64'),
      'content-type': 'application/json'
    },
    body: init?.body ? JSON.stringify(init.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error('Razorpay ' + res.status + ': ' + (data?.error?.description || 'request failed'));
  return data;
}
