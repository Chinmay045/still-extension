import { json, preflight, readJson, rpcWallet, userFrom } from '@/lib/server';
import { CHARITIES, MAX_PLEDGE_RUPEES, forfeitRef, toPaise } from '@/lib/money';

export const dynamic = 'force-dynamic';

// The extension calls this only after the user confirms "Break the task" on the
// block page. One forfeit per task: a repeat with the same task key is a no-op.
export async function POST(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const b = await readJson(req);
  const amount = toPaise(b.amount, 1, MAX_PLEDGE_RUPEES);
  const taskKey = String(b.taskKey || '').trim();
  if (!amount || !taskKey) return json(req, { error: 'Missing pledge amount or task' }, 400);
  const charity = CHARITIES.includes(String(b.charity)) ? String(b.charity) : CHARITIES[0];
  try {
    const r = await rpcWallet('wallet_forfeit', {
      p_user: user.id,
      p_amount: amount,
      p_ref: forfeitRef(user.id, taskKey),
      p_task: String(b.taskTitle || ''),
      p_site: String(b.site || ''),
      p_charity: charity
    });
    if (!r.ok) return json(req, { error: 'Not enough in your wallet', code: 'insufficient', balancePaise: r.balance_paise }, 402);
    return json(req, { balancePaise: r.balance_paise, duplicate: r.duplicate, charity });
  } catch (e) {
    return json(req, { error: (e as Error).message }, 500);
  }
}

export const OPTIONS = preflight;
