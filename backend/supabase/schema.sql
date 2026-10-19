-- Still focus wallet. Run once in Supabase: SQL Editor, New query, paste, Run.
-- Money is stored in paise (₹1 = 100 paise) so nothing is ever a float.

create table if not exists public.wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_txns (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('topup', 'forfeit')),
  amount_paise bigint not null check (amount_paise > 0),
  balance_after_paise bigint not null,
  -- Razorpay payment id for a top-up, or the extension's task key for a forfeit.
  -- Unique so a retried request can never credit or debit twice.
  ref text not null unique,
  task_title text,
  site text,
  charity text,
  created_at timestamptz not null default now()
);

create index if not exists wallet_txns_user_created on public.wallet_txns (user_id, created_at desc);

-- People can read their own wallet. Every write goes through the functions below,
-- which only the server (service role key) may call.
alter table public.wallets enable row level security;
alter table public.wallet_txns enable row level security;

drop policy if exists "read own wallet" on public.wallets;
create policy "read own wallet" on public.wallets for select using (auth.uid() = user_id);
drop policy if exists "read own txns" on public.wallet_txns;
create policy "read own txns" on public.wallet_txns for select using (auth.uid() = user_id);

-- Credits a verified Razorpay payment. Safe to call twice with the same payment id.
create or replace function public.wallet_topup(p_user uuid, p_amount bigint, p_ref text)
returns table (ok boolean, balance_paise bigint, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance_paise into v_balance from wallets w where w.user_id = p_user for update;
  if exists (select 1 from wallet_txns t where t.ref = p_ref) then
    return query select true, v_balance, true;
    return;
  end if;
  v_balance := v_balance + p_amount;
  update wallets set balance_paise = v_balance, updated_at = now() where user_id = p_user;
  insert into wallet_txns (user_id, kind, amount_paise, balance_after_paise, ref)
    values (p_user, 'topup', p_amount, v_balance, p_ref);
  return query select true, v_balance, false;
end $$;

-- Takes a pledge when the user breaks a task. Refuses (ok = false) when the balance
-- is too small; never goes below zero. Safe to call twice with the same task key.
create or replace function public.wallet_forfeit(
  p_user uuid, p_amount bigint, p_ref text, p_task text, p_site text, p_charity text
)
returns table (ok boolean, balance_paise bigint, duplicate boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_balance bigint;
begin
  if p_amount <= 0 then raise exception 'amount must be positive'; end if;
  insert into wallets (user_id) values (p_user) on conflict (user_id) do nothing;
  select w.balance_paise into v_balance from wallets w where w.user_id = p_user for update;
  if exists (select 1 from wallet_txns t where t.ref = p_ref) then
    return query select true, v_balance, true;
    return;
  end if;
  if v_balance < p_amount then
    return query select false, v_balance, false;
    return;
  end if;
  v_balance := v_balance - p_amount;
  update wallets set balance_paise = v_balance, updated_at = now() where user_id = p_user;
  insert into wallet_txns (user_id, kind, amount_paise, balance_after_paise, ref, task_title, site, charity)
    values (p_user, 'forfeit', p_amount, v_balance, p_ref, left(p_task, 200), left(p_site, 200), left(p_charity, 80));
  return query select true, v_balance, false;
end $$;

revoke all on function public.wallet_topup(uuid, bigint, text) from public, anon, authenticated;
revoke all on function public.wallet_forfeit(uuid, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.wallet_topup(uuid, bigint, text) to service_role;
grant execute on function public.wallet_forfeit(uuid, bigint, text, text, text, text) to service_role;

-- ---------- Monthly charity payouts (added 2026-10-19) ----------
-- Lost pledges pile up as "owed" per charity. Once a month you pay the charity
-- yourself by UPI and record the UPI reference here, which clears what you owed.

create table if not exists public.charity_payouts (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  charity text not null,
  amount_paise bigint not null check (amount_paise > 0),
  utr text not null,
  paid_at timestamptz not null default now(),
  unique (user_id, utr)
);

-- The charity's UPI ID, saved once per person so the QR code is ready next month.
create table if not exists public.charity_upi (
  user_id uuid not null references auth.users (id) on delete cascade,
  charity text not null,
  upi_id text not null,
  primary key (user_id, charity)
);

alter table public.charity_payouts enable row level security;
alter table public.charity_upi enable row level security;
drop policy if exists "read own payouts" on public.charity_payouts;
create policy "read own payouts" on public.charity_payouts for select using (auth.uid() = user_id);
drop policy if exists "read own charity upi" on public.charity_upi;
create policy "read own charity upi" on public.charity_upi for select using (auth.uid() = user_id);

-- What you still owe each charity: lost pledges minus payouts already recorded.
create or replace function public.charity_owed(p_user uuid)
returns table (charity text, owed_paise bigint, forfeits integer, first_at timestamptz)
language sql security definer set search_path = public as $$
  with lost as (
    select t.charity, sum(t.amount_paise) as amt, count(*)::int as n, min(t.created_at) as first_at
    from wallet_txns t where t.user_id = p_user and t.kind = 'forfeit' group by t.charity
  ), paid as (
    select p.charity, sum(p.amount_paise) as amt from charity_payouts p where p.user_id = p_user group by p.charity
  )
  select lost.charity, lost.amt - coalesce(paid.amt, 0), lost.n, lost.first_at
  from lost left join paid on paid.charity = lost.charity
  where lost.amt - coalesce(paid.amt, 0) > 0
  order by 2 desc;
$$;

-- Records a payment you made to a charity. Refuses more than you owe or a reused UPI reference.
create or replace function public.record_payout(p_user uuid, p_charity text, p_amount bigint, p_utr text)
returns table (ok boolean, reason text, owed_paise bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_owed bigint;
begin
  -- Serialise payouts per person so two tabs can't both clear the same debt.
  perform 1 from wallets w where w.user_id = p_user for update;
  select coalesce(o.owed_paise, 0) into v_owed from charity_owed(p_user) o where o.charity = p_charity;
  v_owed := coalesce(v_owed, 0);
  if p_amount <= 0 or p_amount > v_owed then
    return query select false, 'more than you owe', v_owed;
    return;
  end if;
  if exists (select 1 from charity_payouts c where c.user_id = p_user and c.utr = p_utr) then
    return query select false, 'reference already used', v_owed;
    return;
  end if;
  insert into charity_payouts (user_id, charity, amount_paise, utr) values (p_user, p_charity, p_amount, p_utr);
  return query select true, null::text, v_owed - p_amount;
end $$;

revoke all on function public.charity_owed(uuid) from public, anon, authenticated;
revoke all on function public.record_payout(uuid, text, bigint, text) from public, anon, authenticated;
grant execute on function public.charity_owed(uuid) to service_role;
grant execute on function public.record_payout(uuid, text, bigint, text) to service_role;
