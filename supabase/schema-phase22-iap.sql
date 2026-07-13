-- IAP（App Store / Google Play）訂閱來源。可重複執行。
-- subscriptions 仍是訂閱狀態的唯一真相；這裡只是讓它能容納第二個寫入者（RevenueCat）。

alter table public.subscriptions add column if not exists source text not null default 'stripe';   -- stripe / app_store / play_store
alter table public.subscriptions add column if not exists rc_entitlement text;
alter table public.subscriptions add column if not exists store_transaction_id text;

-- 兩個 webhook（Stripe / RevenueCat）共用的唯一寫入口。
-- 防覆蓋規則：若既有訂閱來自「別的來源」且仍有效（active/trialing 且未到期），忽略這次寫入。
-- 沒有這條，Stripe 的 subscription.deleted 會把一位從 App 內訂閱的會員砍掉（反之亦然）。
create or replace function public.upsert_subscription(
  p_user uuid,
  p_source text,
  p_status text,
  p_period_end timestamptz,
  p_stripe_customer text default null,
  p_stripe_sub text default null,
  p_entitlement text default null,
  p_tx text default null
) returns void language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  if p_user is null then return; end if;

  select * into cur from subscriptions where user_id = p_user;
  if cur.user_id is not null
     and cur.source is distinct from p_source
     and cur.status in ('active', 'trialing')
     and (cur.current_period_end is null or cur.current_period_end > now()) then
    return;   -- 另一個來源的訂閱仍有效 → 不覆蓋
  end if;

  insert into subscriptions as s (
    user_id, status, current_period_end, source,
    stripe_customer_id, stripe_subscription_id, rc_entitlement, store_transaction_id, updated_at
  ) values (
    p_user, p_status, p_period_end, p_source,
    p_stripe_customer, p_stripe_sub, p_entitlement, p_tx, now()
  )
  on conflict (user_id) do update set
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    source = excluded.source,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
    rc_entitlement = coalesce(excluded.rc_entitlement, s.rc_entitlement),
    store_transaction_id = coalesce(excluded.store_transaction_id, s.store_transaction_id),
    updated_at = now();

  update profiles set is_premium = (
    p_status in ('active', 'trialing') and (p_period_end is null or p_period_end > now())
  ) where id = p_user;
end; $$;

-- 只有 service_role（webhook）能呼叫，使用者不可自我升級
revoke execute on function public.upsert_subscription(uuid, text, text, timestamptz, text, text, text, text) from authenticated, anon;
