import { json, preflight } from '@/lib/server';
import { CHARITIES, MAX_PLEDGE_RUPEES, MAX_TOPUP_RUPEES, MIN_TOPUP_RUPEES } from '@/lib/money';

export const dynamic = 'force-dynamic';

// Public settings the extension needs to sign in. The anon key is safe to share by design.
export async function GET(req: Request) {
  return json(req, {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    charities: CHARITIES,
    minTopup: MIN_TOPUP_RUPEES,
    maxTopup: MAX_TOPUP_RUPEES,
    maxPledge: MAX_PLEDGE_RUPEES,
    testMode: (process.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test_')
  });
}

export const OPTIONS = preflight;
