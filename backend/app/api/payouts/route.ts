import { json, preflight, readJson, supabaseAdmin, userFrom } from '@/lib/server';
import { CHARITIES, CHARITY_SITES, isUtr, toPaise, upiLink } from '@/lib/money';

export const dynamic = 'force-dynamic';

type Owed = { charity: string; owed_paise: number };

// What you owe each charity right now, its saved UPI ID and a ready-to-scan pay link.
export async function GET(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const db = supabaseAdmin();
  const [owed, upi, paid] = await Promise.all([
    db.rpc('charity_owed', { p_user: user.id }),
    db.from('charity_upi').select('charity, upi_id').eq('user_id', user.id),
    db.from('charity_payouts').select('id, charity, amount_paise, utr, paid_at').eq('user_id', user.id).order('paid_at', { ascending: false }).limit(12)
  ]);
  const error = owed.error || upi.error || paid.error;
  if (error) return json(req, { error: error.message }, 500);
  const ids = new Map((upi.data || []).map((r: { charity: string; upi_id: string }) => [r.charity, r.upi_id]));
  const month = new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' });
  return json(req, {
    owed: ((owed.data || []) as Owed[]).map((o) => {
      const upiId = ids.get(o.charity) || '';
      const owedPaise = Number(o.owed_paise);
      return {
        charity: o.charity,
        owedPaise,
        upiId,
        site: CHARITY_SITES[o.charity] || '',
        payLink: upiId ? upiLink(upiId, o.charity, owedPaise, 'Still pledges ' + month) : ''
      };
    }),
    payouts: (paid.data || []).map((p: any) => ({ ...p, amount_paise: Number(p.amount_paise) }))
  });
}

// Records that you paid a charity, with the UPI reference from your UPI app.
export async function POST(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const b = await readJson(req);
  const charity = String(b.charity || '');
  const amount = toPaise(b.amount, 1, 100000);
  const utr = String(b.utr || '').trim();
  if (!CHARITIES.includes(charity) || !amount) return json(req, { error: 'Pick a charity and amount' }, 400);
  if (!isUtr(utr)) return json(req, { error: 'Paste the UPI reference number (12 digits) from your UPI app' }, 400);
  const { data, error } = await supabaseAdmin().rpc('record_payout', { p_user: user.id, p_charity: charity, p_amount: amount, p_utr: utr });
  if (error) return json(req, { error: error.message }, 500);
  const row = (Array.isArray(data) ? data[0] : data) as { ok: boolean; reason: string | null; owed_paise: number };
  if (!row?.ok) {
    const msg = row?.reason === 'reference already used' ? 'That UPI reference is already recorded' : 'That is more than you owe this charity';
    return json(req, { error: msg }, 409);
  }
  return json(req, { owedPaise: Number(row.owed_paise) });
}

export const OPTIONS = preflight;
