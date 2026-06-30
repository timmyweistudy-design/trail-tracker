// Stripe webhook：訂閱成立/更新/取消 → 寫入 subscriptions 表 + profiles.is_premium（service_role）。
// Secrets：STRIPE_SECRET_KEY、STRIPE_WEBHOOK_SECRET、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
// 部署時請用 --no-verify-jwt（Stripe 不會帶 Supabase JWT）。
import Stripe from "npm:stripe@16";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function setStatus(userId: string, status: string, periodEnd: number | null, customer: string | null, sub: string | null) {
  if (!userId) return;
  const active = ["active", "trialing"].includes(status);
  await admin.from("subscriptions").upsert({
    user_id: userId, status,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    stripe_customer_id: customer, stripe_subscription_id: sub, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  await admin.from("profiles").update({ is_premium: active }).eq("id", userId);
}

Deno.serve(async (req) => {
  const sig = req.headers.get("stripe-signature") || "";
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, Deno.env.get("STRIPE_WEBHOOK_SECRET")!);
  } catch (e) {
    return new Response("bad signature: " + (e as Error).message, { status: 400 });
  }
  try {
    if (event.type === "checkout.session.completed") {
      const s = event.data.object as Stripe.Checkout.Session;
      const userId = (s.metadata?.user_id as string) || (s.client_reference_id as string) || "";
      let periodEnd: number | null = null, status = "active";
      if (s.subscription) {
        const sub = await stripe.subscriptions.retrieve(s.subscription as string);
        periodEnd = sub.current_period_end; status = sub.status;
      }
      await setStatus(userId, status, periodEnd, s.customer as string, s.subscription as string);
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      const userId = (sub.metadata?.user_id as string) || "";
      await setStatus(userId, event.type.endsWith("deleted") ? "canceled" : sub.status, sub.current_period_end, sub.customer as string, sub.id);
    }
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("err: " + (e as Error).message, { status: 200 });
  }
});
