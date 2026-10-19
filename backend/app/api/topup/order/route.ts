import { json, preflight, razorpay, readJson, userFrom } from '@/lib/server';
import { MAX_TOPUP_RUPEES, MIN_TOPUP_RUPEES, toPaise } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Creates a Razorpay order for a top-up. The wallet is credited only after the
// payment's signature checks out (see /api/topup/verify and the webhook).
export async function POST(req: Request) {
  const user = await userFrom(req);
  if (!user) return json(req, { error: 'Sign in again' }, 401);
  const body = await readJson(req);
  const amount = toPaise(body.amount, MIN_TOPUP_RUPEES, MAX_TOPUP_RUPEES);
  if (!amount) return json(req, { error: `Pick a whole amount from ₹${MIN_TOPUP_RUPEES} to ₹${MAX_TOPUP_RUPEES}` }, 400);
  try {
    const order = await razorpay('/orders', {
      method: 'POST',
      body: { amount, currency: 'INR', receipt: 'still-' + Date.now(), notes: { user_id: user.id, purpose: 'still-wallet-topup' } }
    });
    return json(req, { orderId: order.id, amount, keyId: process.env.RAZORPAY_KEY_ID, email: user.email });
  } catch (e) {
    return json(req, { error: (e as Error).message }, 502);
  }
}

export const OPTIONS = preflight;
