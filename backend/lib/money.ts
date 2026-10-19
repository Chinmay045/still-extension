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

// Official sites, linked next to each charity so you can check its real UPI ID or bank details.
export const CHARITY_SITES: Record<string, string> = {
  'Akshaya Patra': 'https://www.akshayapatra.org',
  GiveIndia: 'https://www.giveindia.org',
  CRY: 'https://www.cry.org'
};

export function isUpiId(v: unknown): boolean {
  return typeof v === 'string' && /^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9]{2,64}$/.test(v.trim());
}

// A UPI reference (RRN/UTR) is 12 digits; bank transfers use other lengths, so allow 6 to 30 letters or digits.
export function isUtr(v: unknown): boolean {
  return typeof v === 'string' && /^[A-Za-z0-9]{6,30}$/.test(v.trim());
}

// A UPI intent link with the payee and amount filled in. Scanned as a QR, any UPI app opens it ready to pay.
export function upiLink(upiId: string, payee: string, amountPaise: number, note: string): string {
  // The UPI ID goes in raw (it is already validated): some UPI apps don't decode %40.
  const enc = encodeURIComponent;
  return `upi://pay?pa=${upiId.trim()}&pn=${enc(payee)}&am=${(amountPaise / 100).toFixed(2)}&cu=INR&tn=${enc(note)}`;
}
