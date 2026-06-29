// Supabase Edge Function：當 notifications 表新增一列時，發送 Web Push 給收件者所有訂閱裝置。
// 觸發方式：Supabase Dashboard → Database → Webhooks → 新增，table=notifications、event=INSERT、
//   type=Supabase Edge Functions、選 send-push。
// 環境變數（Edge Function Secrets）：
//   VAPID_PUBLIC_KEY、VAPID_PRIVATE_KEY（npx web-push generate-vapid-keys 產生）
//   VAPID_SUBJECT（如 mailto:you@example.com）
//   SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY（讀訂閱與觸發者名稱用，service_role 僅存在後端）
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const LABEL: Record<string, string> = {
  follow: "開始追蹤你", like: "讚了你的貼文", comment: "在你的貼文留言",
  team: "邀請你加入小隊", gift: "送了果實給你的夥伴", mention: "在貼文中提到你",
};

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const row = body.record || body; // webhook 會包成 { record, ... }
    const { user_id, actor_id, type, post_id } = row;
    if (!user_id) return new Response("no user", { status: 200 });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com",
      Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!,
    );

    let actorName = "有人";
    if (actor_id) {
      const { data: p } = await admin.from("profiles").select("display_name, handle").eq("id", actor_id).maybeSingle();
      if (p) actorName = p.display_name || p.handle || actorName;
    }
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", user_id);
    if (!subs || !subs.length) return new Response("no subs", { status: 200 });

    const origin = Deno.env.get("APP_ORIGIN") || "https://trail-tracker-0ma5.onrender.com";
    const payload = JSON.stringify({
      title: "循徑拾光",
      body: `${actorName} ${LABEL[type] || "有新動態"}`,
      url: post_id ? `${origin}/?post=${post_id}` : origin,
      tag: type + (post_id || ""),
    });

    await Promise.all(subs.map(async (s: any) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }));
    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("err: " + (e as Error).message, { status: 200 });
  }
});
