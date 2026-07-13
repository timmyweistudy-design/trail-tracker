// RevenueCat webhook：App Store / Google Play 的訂閱事件 → 寫入 subscriptions（service_role）。
// Secrets：REVENUECAT_WEBHOOK_SECRET、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
// 部署時用 --no-verify-jwt（RevenueCat 不會帶 Supabase JWT，改用共享密鑰 header 驗證）。
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 事件 → 訂閱狀態。CANCELLATION 是「不再自動續訂」，期末前仍有權益，所以維持 active。
const EVENT_STATUS: Record<string, string> = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  PRODUCT_CHANGE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  NON_RENEWING_PURCHASE: "active",
  CANCELLATION: "active",
  BILLING_ISSUE: "past_due",
  EXPIRATION: "canceled",
  REFUND: "canceled",
  SUBSCRIPTION_PAUSED: "canceled",
};

const STORE_SOURCE: Record<string, string> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
};

Deno.serve(async (req) => {
  // 共享密鑰驗證（在 RevenueCat 後台 webhook 設定的 Authorization header 填同一個值）
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") || "";
  if (!secret || req.headers.get("Authorization") !== secret) return new Response("unauthorized", { status: 401 });

  let ev: Record<string, unknown>;
  try {
    const body = await req.json();
    ev = (body.event || {}) as Record<string, unknown>;
  } catch (e) {
    return new Response("bad json: " + (e as Error).message, { status: 400 });
  }

  const type = String(ev.type || "");
  const userId = String(ev.app_user_id || "");
  const status = EVENT_STATUS[type];
  if (!status || !userId) return new Response("ignored", { status: 200 });   // 不認得的事件不當錯誤（RevenueCat 會重送）

  // 試用期：RevenueCat 用 period_type 標，狀態要是 trialing（前端與 is_premium() 都認 trialing）
  const isTrial = String(ev.period_type || "") === "TRIAL";
  const finalStatus = (status === "active" && isTrial) ? "trialing" : status;

  // 退款：期末設成過去，立即失效（其餘事件用商店給的到期時間；取消的權益就留到那一刻為止）
  const expMs = Number(ev.expiration_at_ms || 0);
  const periodEnd = type === "REFUND" ? new Date(0).toISOString()
    : (expMs ? new Date(expMs).toISOString() : null);

  const { error } = await admin.rpc("upsert_subscription", {
    p_user: userId,
    p_source: STORE_SOURCE[String(ev.store || "")] || "app_store",
    p_status: finalStatus,
    p_period_end: periodEnd,
    p_entitlement: Array.isArray(ev.entitlement_ids) ? String((ev.entitlement_ids as string[])[0] || "premium") : "premium",
    p_tx: ev.transaction_id ? String(ev.transaction_id) : null,
  });
  if (error) { console.error("upsert_subscription failed", error); return new Response("db error", { status: 500 }); }
  return new Response("ok", { status: 200 });
});
