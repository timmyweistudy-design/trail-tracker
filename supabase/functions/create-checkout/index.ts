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

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: Deno.env.get("STRIPE_PRICE_ID")!, quantity: 1 }],
      success_url: origin + "/?premium=success",
      cancel_url: origin + "/?premium=cancel",
      client_reference_id: u.user.id,                 // 對應到我們的 user
      customer_email: u.user.email || undefined,
      metadata: { user_id: u.user.id },
      subscription_data: { metadata: { user_id: u.user.id } },
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
