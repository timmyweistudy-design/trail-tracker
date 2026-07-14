// 建立 Stripe Checkout（訂閱）。前端帶 JWT 呼叫，回傳結帳網址。
// Secrets：STRIPE_SECRET_KEY、STRIPE_PRICE_ID（訂閱方案的 price_xxx）、APP_ORIGIN（選填）
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await supa.auth.getUser();
    if (!u || !u.user) return new Response(JSON.stringify({ error: "not-signed-in" }), { status: 401, headers: cors });

    const body = await req.json().catch(() => ({}));
    const origin = body.origin || Deno.env.get("APP_ORIGIN") || "https://trail-tracker-0ma5.onrender.com";
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    // 月繳 / 年繳：年繳用 STRIPE_PRICE_ID_YEAR（沒設則退回月繳）
    const price = (body.plan === "year" && Deno.env.get("STRIPE_PRICE_ID_YEAR"))
      ? Deno.env.get("STRIPE_PRICE_ID_YEAR")! : Deno.env.get("STRIPE_PRICE_ID")!;

    // 沿用既有的 Stripe Customer，並「只給沒訂過的人」7 天試用。
    // ⚠️ 原本每次都傳 trial_period_days: 7 且只給 customer_email（Stripe 會每次建新 Customer）
    //    → 訂閱→試用期內取消→再訂，就能無限重複領 7 天免費，永遠不用付錢。
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("subscriptions")
      .select("stripe_customer_id, status").eq("user_id", u.user.id).maybeSingle();
    const customerId = sub && sub.stripe_customer_id ? sub.stripe_customer_id : null;
    const everSubscribed = !!sub;   // 有這筆 row 就代表訂閱過（webhook 寫入的）→ 不再給試用

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price, quantity: 1 }],
      success_url: origin + "/?premium=success",
      cancel_url: origin + "/?premium=cancel",
      client_reference_id: u.user.id,                 // 對應到我們的 user
      ...(customerId ? { customer: customerId } : { customer_email: u.user.email || undefined }),
      metadata: { user_id: u.user.id },
      subscription_data: {
        metadata: { user_id: u.user.id },
        ...(everSubscribed ? {} : { trial_period_days: 7 }),   // 首次訂閱才有 7 天免費試用
      },
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
