-- Premium 訂閱（付費解鎖）。可重複執行。
-- 訂閱狀態只由 Stripe webhook（Edge Function，service_role）寫入，使用者不可自行修改。

create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive',          -- active / trialing / past_due / canceled / inactive
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text,
  updated_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;

-- 只能讀自己的訂閱；不開放任何 insert/update/delete 給一般使用者（webhook 用 service_role 繞過 RLS 寫入）
drop policy if exists subs_select on public.subscriptions;
create policy subs_select on public.subscriptions for select to authenticated using (user_id = auth.uid());

-- profiles 加一個顯示用的 is_premium，並「禁止使用者自行修改」此欄位（防止前端 PATCH 自我升級）
alter table public.profiles add column if not exists is_premium boolean not null default false;
revoke update (is_premium) on public.profiles from authenticated;
revoke update (is_premium) on public.profiles from anon;

-- 是否為有效付費會員（給其他 RLS / 查詢可用）
create or replace function public.is_premium(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from subscriptions
    where user_id = uid and status in ('active','trialing')
      and (current_period_end is null or current_period_end > now())
  );
$$;
