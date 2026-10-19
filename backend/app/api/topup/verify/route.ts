import { json, preflight, razorpay, readJson, rpcWallet, userFrom, env } from '@/lib/server';
import { topupRef, verifyCheckoutSignature } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Called by the wallet page right after Razorpay Checkout succeeds.
export async function POST(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const b = await readJson(req);
  const orderId = String(b.orderId || '');
  const paymentId = String(b.paymentId || '');
  if (!verifyCheckoutSignature(orderId, paymentId, String(b.signature || ''), env('RAZORPAY_KEY_SECRET'))) {
    return json(req, { error: 'Payment signature did not match' }, 400);
  }
  try {
    const order = await razorpay('/orders/' + encodeURIComponent(orderId));
    if (order?.notes?.user_id !== user.id) return json(req, { error: 'This payment belongs to another account' }, 403);
    const payment = await razorpay('/payments/' + encodeURIComponent(paymentId));
    if (payment.order_id !== orderId || !['captured', 'authorized'].includes(payment.status)) {
      return json(req, { error: 'Payment is not complete yet' }, 409);
    }
    const r = await rpcWallet('wallet_topup', { p_user: user.id, p_amount: Number(order.amount), p_ref: topupRef(paymentId) });
    return json(req, { balancePaise: r.balance_paise, duplicate: r.duplicate });
  } catch (e) {
    return json(req, { error: (e as Error).message }, 502);
  }
}

export const OPTIONS = preflight;
