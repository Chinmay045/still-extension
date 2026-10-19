// Pure helpers with no Next.js or Supabase imports, so they can be unit tested.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const MIN_TOPUP_RUPEES = 10;
export const MAX_TOPUP_RUPEES = 5000;
export const MAX_PLEDGE_RUPEES = 1000;

// Where forfeited pledges are earmarked. Recorded only; nothing is paid out yet.
export const CHARITIES = ['Akshaya Patra', 'GiveIndia', 'CRY'];

// Whole rupees in, paise out. Returns null for anything that isn't a whole number in range.
export function toPaise(rupees: unknown, min: number, max: number): number | null {
  const n = Number(rupees);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n * 100;
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
}

// Razorpay Checkout success: signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret).
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(orderId + '|' + paymentId).digest('hex');
  return safeEqualHex(expected, signature);
}

// Razorpay webhooks: signature = HMAC_SHA256(raw body, webhook_secret).
export function verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

// Every forfeit is keyed by user and task, so one task can only ever cost its pledge once.
export function forfeitRef(userId: string, taskKey: string): string {
  return 'forfeit:' + userId + ':' + String(taskKey).slice(0, 120);
}

export function topupRef(paymentId: string): string {
  return 'rzp:' + paymentId;
}
