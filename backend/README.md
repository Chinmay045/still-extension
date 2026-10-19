# Still focus wallet (backend)

A small Next.js app that holds the prepaid wallet behind Still's focus pledges.
The extension stays plain JS; this app only handles accounts and money.

- **Sign-in:** Google through Supabase Auth (the extension and the wallet page use the same account).
- **Top-up:** Razorpay Checkout, **test mode only** (the server refuses keys that don't start with `rzp_test_`).
- **Balance:** Postgres tables in Supabase (`supabase/schema.sql`), stored in paise. Every credit and debit goes
  through one SQL function that locks the wallet row, never lets it go below zero, and ignores a repeat of the same
  payment or task.
- **Forfeit:** when you confirm "Break the task" on the block page (or stop a pledged task early), the extension calls
  `POST /api/forfeit`. One task can only ever cost its pledge once. The money is recorded as set aside for the charity
  you picked.
- **Paying the charity:** lost pledges add up as "owed" per charity. Once a month the wallet page's **Pay the charity**
  section shows a UPI QR with the amount filled in (to the charity's UPI ID, which you copy once from its official site).
  You pay from your own UPI app and paste the UPI reference, which marks that amount as paid.

## API

| Route | What it does |
| --- | --- |
| `GET /api/config` | Public Supabase URL + anon key for the extension's sign-in |
| `GET /api/wallet` | Balance and last 20 transactions (Bearer = Supabase access token) |
| `POST /api/topup/order` | `{ amount }` in rupees, ₹10 to ₹5,000. Creates a Razorpay order |
| `POST /api/topup/verify` | Checks Razorpay's signature and the order owner, then credits |
| `POST /api/razorpay/webhook` | Optional backup credit on `payment.captured` |
| `POST /api/forfeit` | `{ amount, taskKey, taskTitle, site, charity }`. Takes the pledge |
| `GET /api/payouts` | What you owe each charity, its saved UPI ID and a UPI pay link |
| `POST /api/payouts/upi` | `{ charity, upiId }`. Saves the charity's UPI ID |
| `POST /api/payouts` | `{ charity, amount, utr }`. Records a payment you made (never more than you owe) |

## One-time setup (owner)

1. **Supabase:** create a free project at supabase.com. In **SQL Editor**, paste `supabase/schema.sql` and Run. (Running it again later is safe; it only adds what's missing.)
2. **Google sign-in in Supabase:** Authentication, Sign In / Providers, Google: turn it on and paste the client ID and
   secret of the existing Google OAuth client (project still-512106). In Google Cloud, add
   `https://<your-project>.supabase.co/auth/v1/callback` to that client's **Authorized redirect URIs**.
3. **Supabase redirect URLs:** Authentication, URL Configuration, add
   `https://hjcpkhjkanikiahcjmhcblnnkloopnmc.chromiumapp.org/**` and `https://<your-wallet-site>/**`.
4. **Razorpay:** sign up, switch the dashboard to **Test mode**, and generate API keys (Account & Settings, API keys).
5. **Deploy:** on Vercel, import this repo and set **Root Directory** to `backend`. Add the variables from
   `.env.example` (Supabase URL, anon key, service role key, Razorpay test key ID and secret).
6. **Connect Still:** in Still, Settings, Focus wallet, paste the deployed address (or set `WALLET_API` in `js/lib.js`).

Test cards and UPI IDs for Razorpay test mode: https://razorpay.com/docs/payments/payments/test-card-details/
(UPI `success@razorpay` always succeeds).

## Local development

```bash
cd backend
cp .env.example .env.local   # fill in your keys
npm install
npm run dev                  # http://localhost:3000/wallet
npm test                     # signature and amount checks
```
