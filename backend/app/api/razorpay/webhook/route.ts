import { json, razorpay, rpcWallet } from '@/lib/server';
import { topupRef, verifyWebhookSignature } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Backup credit path: if the tab closes before /api/topup/verify runs, Razorpay's
// payment.captured webhook still credits the wallet. Same ref, so never twice.
export async function POST(req: Request) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get('x-razorpay-signature') || '', secret)) {
    return json(req, { error: 'Bad signature' }, 400);
  }
  let event: any;
  try { event = JSON.parse(raw); } catch { return json(req, { error: 'Bad JSON' }, 400); }
  if (event.event !== 'payment.captured') return json(req, { ignored: event.event });
  const payment = event.payload?.payment?.entity;
  if (!payment?.order_id) return json(req, { ignored: 'no order' });
  try {
    const order = await razorpay('/orders/' + encodeURIComponent(payment.order_id));
    const userId = order?.notes?.user_id;
    if (order?.notes?.purpose !== 'still-wallet-topup' || !userId) return json(req, { ignored: 'not a wallet order' });
    const r = await rpcWallet('wallet_topup', { p_user: userId, p_amount: Number(order.amount), p_ref: topupRef(payment.id) });
    return json(req, { ok: true, duplicate: r.duplicate });
  } catch (e) {
    return json(req, { error: (e as Error).message }, 500);
  }
}
