// Stripe Customer Portal：讓會員自助管理訂閱（取消/換卡/看發票）。前端帶 JWT 呼叫。
// Secrets：STRIPE_SECRET_KEY（SUPABASE_URL/ANON/SERVICE_ROLE 自動注入）
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
    const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await supa.auth.getUser();
    if (!u || !u.user) return new Response(JSON.stringify({ error: "not-signed-in" }), { status: 401, headers: cors });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: sub } = await admin.from("subscriptions").select("stripe_customer_id").eq("user_id", u.user.id).maybeSingle();
    if (!sub || !sub.stripe_customer_id) return new Response(JSON.stringify({ error: "尚無訂閱資料" }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const origin = body.origin || Deno.env.get("APP_ORIGIN") || "https://trail-tracker-0ma5.onrender.com";
    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
    const portal = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, return_url: origin });
    return new Response(JSON.stringify({ url: portal.url }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
