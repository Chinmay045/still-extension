import { json, preflight, readJson, supabaseAdmin, userFrom } from '@/lib/server';
import { CHARITIES, isUpiId } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Saves the charity's UPI ID (copied from its official donate page) for this person.
export async function POST(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const b = await readJson(req);
  const charity = String(b.charity || '');
  const upiId = String(b.upiId || '').trim();
  if (!CHARITIES.includes(charity)) return json(req, { error: 'Unknown charity' }, 400);
  if (!isUpiId(upiId)) return json(req, { error: 'That does not look like a UPI ID (name@bank)' }, 400);
  const { error } = await supabaseAdmin().from('charity_upi').upsert({ user_id: user.id, charity, upi_id: upiId });
  if (error) return json(req, { error: error.message }, 500);
  return json(req, { ok: true });
}

export const OPTIONS = preflight;
