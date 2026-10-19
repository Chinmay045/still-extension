import { json, preflight, supabaseAdmin, userFrom } from '@/lib/server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const db = supabaseAdmin();
  const [{ data: wallet }, { data: txns, error }] = await Promise.all([
    db.from('wallets').select('balance_paise').eq('user_id', user.id).maybeSingle(),
    db.from('wallet_txns')
      .select('id, kind, amount_paise, balance_after_paise, task_title, site, charity, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
  ]);
  if (error) return json(req, { error: error.message }, 500);
  return json(req, {
    email: user.email,
    balancePaise: Number(wallet?.balance_paise || 0),
    txns: txns || []
  });
}

export const OPTIONS = preflight;
