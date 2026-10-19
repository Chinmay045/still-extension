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
