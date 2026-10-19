'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient, type Session } from '@supabase/supabase-js';
import QRCode from 'qrcode';

type Txn = {
  id: number;
  kind: 'topup' | 'forfeit';
  amount_paise: number;
  balance_after_paise: number;
  task_title: string | null;
  site: string | null;
  charity: string | null;
  created_at: string;
};
type Wallet = { email: string; balancePaise: number; txns: Txn[] };
type Owed = { charity: string; owedPaise: number; upiId: string; site: string; payLink: string };
type Payout = { id: number; charity: string; amount_paise: number; utr: string; paid_at: string };
type Payouts = { owed: Owed[]; payouts: Payout[] };
type Api = (path: string, body?: unknown) => Promise<any>;

declare global {
  interface Window { Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (e: string, fn: (r: any) => void) => void } }
}

const AMOUNTS = [100, 250, 500];
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const rupees = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load Razorpay Checkout'));
    document.head.appendChild(s);
  });
}

export default function WalletPage() {
  const supabase = useMemo(() => (URL_ && ANON ? createClient(URL_, ANON) : null), []);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState(500);
  const [custom, setCustom] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const api = useCallback(async (path: string, body?: unknown) => {
    const res = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: { authorization: 'Bearer ' + (session?.access_token || ''), 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }, [session]);

  const [payouts, setPayouts] = useState<Payouts | null>(null);

  const refresh = useCallback(async () => {
    if (!session) return;
    try {
      const [w, p] = await Promise.all([api('/api/wallet'), api('/api/payouts')]);
      setWallet(w);
      setPayouts(p);
    } catch (e) { setErr((e as Error).message); }
  }, [api, session]);

  // Opened from Still's "Pay now": jump to the charity section once it has loaded.
  useEffect(() => {
    if (payouts && window.location.hash === '#pay') document.getElementById('pay')?.scrollIntoView();
  }, [payouts]);

  useEffect(() => { refresh(); }, [refresh]);

  const signIn = () => supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });
  const signOut = async () => { await supabase?.auth.signOut(); setWallet(null); };

  const chosen = custom ? Number(custom) : amount;

  async function topUp() {
    setErr(''); setMsg('');
    if (!Number.isInteger(chosen) || chosen < 10 || chosen > 5000) { setErr('Pick a whole amount from ₹10 to ₹5,000.'); return; }
    setBusy(true);
    try {
      await loadCheckout();
      const order = await api('/api/topup/order', { amount: chosen });
      const rzp = new window.Razorpay!({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amount,
        currency: 'INR',
        name: 'Still',
        description: 'Focus wallet top-up',
        prefill: { email: order.email },
        theme: { color: '#7A2BF5' },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await api('/api/topup/verify', { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature });
            setMsg('Added ' + rupees(order.amount) + ' to your wallet.');
            setCustom('');
            await refresh();
          } catch (e) {
            setErr((e as Error).message);
          } finally {
            setBusy(false);
          }
        }
      });
      rzp.on('payment.failed', (r) => { setErr(r?.error?.description || 'Payment failed'); setBusy(false); });
      rzp.open();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <nav className="nav">
        <img src="/logo.png" alt="Still" />
        {session && (
          <span className="who">{session.user.email}<button className="btn btn-sm" onClick={signOut}>Sign out</button></span>
        )}
      </nav>
      <main className="page">
        <header className="head">
          <h1>Focus wallet</h1>
          <p className="muted">Money you put on the line. Break a calendar task and its pledge leaves this wallet for charity. Keep the task and it stays yours.</p>
        </header>

        {!supabase && (
          <section className="group">
            <h2>Not set up yet</h2>
            <div className="card list">
              <ol className="steps muted small">
                <li>Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to this app&apos;s environment.</li>
                <li>Redeploy. The sign-in button shows up here after that.</li>
              </ol>
            </div>
          </section>
        )}

        {supabase && ready && !session && (
          <section className="group">
            <h2>Sign in</h2>
            <div className="card list">
              <div className="row">
                <div className="row-text"><b>Use the same Google account as in Still</b><span className="muted small">Your balance follows your account.</span></div>
                <button className="btn btn-primary" onClick={signIn}><span className="g-mark" aria-hidden="true">G</span>Sign in with Google</button>
              </div>
            </div>
          </section>
        )}

        {session && (
          <>
            <section className="group">
              <h2>Balance</h2>
              <div className="card list">
                <div className="row">
                  <div className="row-text"><b>Available for pledges</b><span className="muted small">Pledges only come out when you confirm breaking a task.</span></div>
                  <span className="val big">{wallet ? rupees(wallet.balancePaise) : '…'}</span>
                </div>
              </div>
            </section>

            <section className="group" id="pay">
              <h2>Pay the charity</h2>
              <p className="muted small sub">Broken pledges leave your wallet straight away. Once a month, send what you owe to the charity from your own UPI app and mark it paid here.</p>
              <div className="card list">
                {payouts && payouts.owed.length === 0 && (
                  <div className="row"><div className="row-text"><b>You owe nothing</b><span className="muted small">Break a task and its pledge shows up here.</span></div></div>
                )}
                {payouts?.owed.map((o) => <PayRow key={o.charity} owed={o} api={api} onDone={refresh} />)}
                {payouts?.payouts.map((p) => (
                  <div className="row" key={'p' + p.id}>
                    <div className="row-text"><b>Paid {p.charity}</b><span className="muted small">{when(p.paid_at)} · UPI ref {p.utr}</span></div>
                    <span className="val plus">{rupees(p.amount_paise)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="group">
              <h2>Add money</h2>
              <div className="card list">
                <div className="amounts" role="group" aria-label="Top-up amount">
                  {AMOUNTS.map((a) => (
                    <button key={a} className="amount" aria-pressed={!custom && amount === a} onClick={() => { setAmount(a); setCustom(''); }}>₹{a}</button>
                  ))}
                  <label className="custom">
                    <span className="muted small">or</span>
                    <input inputMode="numeric" placeholder="₹ other" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 4))} aria-label="Other amount in rupees" />
                  </label>
                </div>
                <div className="pay">
                  <button className="btn btn-primary" disabled={busy} onClick={topUp}>{busy ? 'Opening Razorpay…' : 'Add ₹' + (chosen || 0) + ' with UPI or card'}</button>
                  <span className="test">Test mode</span>
                </div>
                {msg && <p className="msg" role="status">{msg}</p>}
                {err && <p className="err" role="alert">{err}</p>}
              </div>
            </section>

            <section className="group">
              <h2>History</h2>
              <div className="card list">
                {wallet && wallet.txns.length === 0 && (
                  <div className="row"><div className="row-text"><b>Nothing yet</b><span className="muted small">Top-ups and broken tasks show up here.</span></div></div>
                )}
                {wallet?.txns.map((t) => (
                  <div className="row" key={t.id}>
                    <div className="row-text">
                      <b>{t.kind === 'topup' ? 'Added money' : 'Broke ' + (t.task_title || 'a task')}</b>
                      <span className="muted small">
                        {when(t.created_at)}
                        {t.kind === 'forfeit' ? (t.site === 'stopped early' ? ' · stopped it early' : ' · opened ' + (t.site || 'a blocked site')) + ' · set aside for ' + t.charity : ''}
                      </span>
                    </div>
                    <span className={'val ' + (t.kind === 'topup' ? 'plus' : 'minus')}>{(t.kind === 'topup' ? '+' : '−') + rupees(t.amount_paise)}</span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

// One charity you owe: save its UPI ID once, scan the QR (amount filled in), then paste the UPI reference.
function PayRow({ owed, api, onDone }: { owed: Owed; api: Api; onDone: () => Promise<void> }) {
  const [qr, setQr] = useState('');
  const [editing, setEditing] = useState(!owed.upiId);
  const [upi, setUpi] = useState(owed.upiId);
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!owed.payLink) { setQr(''); return; }
    QRCode.toDataURL(owed.payLink, { width: 336, margin: 1, color: { dark: '#1D1D1F', light: '#FFFFFF' } }).then(setQr, () => setQr(''));
  }, [owed.payLink]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await fn(); await onDone(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }
  const saveUpi = () => run(async () => { await api('/api/payouts/upi', { charity: owed.charity, upiId: upi }); setEditing(false); });
  const markPaid = () => run(async () => { await api('/api/payouts', { charity: owed.charity, amount: owed.owedPaise / 100, utr }); setUtr(''); });

  return (
    <div className="pay-item">
      <div className="row">
        <div className="row-text"><b>{owed.charity}</b><span className="muted small">From tasks you broke</span></div>
        <span className="val minus">{rupees(owed.owedPaise)}</span>
      </div>
      {editing ? (
        <div className="pay-step">
          <span className="muted small">Copy the charity&apos;s UPI ID from its official donate page{owed.site && <> (<a href={owed.site} target="_blank" rel="noopener noreferrer">{owed.site.replace('https://www.', '')}</a>)</>}. You only do this once.</span>
          <div className="inline">
            <input value={upi} onChange={(e) => setUpi(e.target.value)} placeholder="charity@bank" aria-label={owed.charity + ' UPI ID'} />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveUpi}>Save</button>
          </div>
        </div>
      ) : (
        <div className="pay-step qr-step">
          {qr && <img className="qr" src={qr} alt={'UPI QR code to pay ' + rupees(owed.owedPaise) + ' to ' + owed.charity} />}
          <div className="qr-side">
            <b>Scan with GPay, PhonePe or Paytm</b>
            <span className="muted small">The amount {rupees(owed.owedPaise)} is filled in. Paying to <b>{owed.upiId}</b> <button className="link" onClick={() => setEditing(true)}>Change</button></span>
            <a className="btn btn-sm" href={owed.payLink}>Open UPI app</a>
            <span className="muted small">Paid? Paste the 12-digit UPI reference from your app.</span>
            <div className="inline">
              <input value={utr} onChange={(e) => setUtr(e.target.value.replace(/\s/g, ''))} inputMode="numeric" placeholder="UPI reference" aria-label="UPI reference number" />
              <button className="btn btn-primary btn-sm" disabled={busy || !utr} onClick={markPaid}>Mark as paid</button>
            </div>
          </div>
        </div>
      )}
      {err && <p className="err" role="alert">{err}</p>}
    </div>
  );
}
