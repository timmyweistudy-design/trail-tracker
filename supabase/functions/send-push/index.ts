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

// 固定時間字串比對（避免 timing side-channel 猜密鑰）
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── 原生推播（iOS APNs）──
// 用 .p8 金鑰簽 ES256 JWT，走 APNs HTTP/2（Deno fetch 支援）。
// Secrets：APNS_KEY_P8（.p8 全文含 BEGIN/END）、APNS_KEY_ID、APNS_TEAM_ID、
//   APNS_BUNDLE_ID（預設 com.timmyweistudy.trailtracker）、APNS_ENV（production/sandbox，預設 production）。
// 未設 APNS_KEY_P8/KEY_ID/TEAM_ID 三者則整段跳過，不影響 Web Push。
function b64url(bytes: Uint8Array): string {
  let s = ""; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function importP8(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
async function apnsJwt(key: CryptoKey, kid: string, team: string): Promise<string> {
  const enc = new TextEncoder();
  const h = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid })));
  const p = b64url(enc.encode(JSON.stringify({ iss: team, iat: Math.floor(Date.now() / 1000) })));
  const data = `${h}.${p}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(data));
  return `${data}.${b64url(new Uint8Array(sig))}`;
}
async function sendNativePush(admin: any, userId: string, msg: { title: string; body: string; url: string }) {
  const p8 = Deno.env.get("APNS_KEY_P8"), kid = Deno.env.get("APNS_KEY_ID"), team = Deno.env.get("APNS_TEAM_ID");
  if (!p8 || !kid || !team) return;   // 未設定 APNs → 跳過
  const { data: toks } = await admin.from("native_push_tokens").select("token, platform").eq("user_id", userId);
  const ios = (toks || []).filter((t: any) => (t.platform || "ios") === "ios");
  if (!ios.length) return;
  const bundle = Deno.env.get("APNS_BUNDLE_ID") || "com.timmyweistudy.trailtracker";
  const host = (Deno.env.get("APNS_ENV") || "production") === "sandbox" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  let jwt: string;
  try { jwt = await apnsJwt(await importP8(p8), kid, team); } catch (_) { return; }
  const body = JSON.stringify({ aps: { alert: { title: msg.title, body: msg.body }, sound: "default" }, url: msg.url });
  await Promise.all(ios.map(async (t: any) => {
    try {
      const res = await fetch(`https://${host}/3/device/${t.token}`, {
        method: "POST",
        headers: { authorization: `bearer ${jwt}`, "apns-topic": bundle, "apns-push-type": "alert", "apns-priority": "10" },
        body,
      });
      // 410 Unregistered / 400 BadDeviceToken → token 失效，刪掉
      if (res.status === 410 || res.status === 400) await admin.from("native_push_tokens").delete().eq("token", t.token);
    } catch (_) { /* 單一裝置失敗不影響其他 */ }
  }));
}

Deno.serve(async (req) => {
  try {
    // ⚠️ 這支是用 --no-verify-jwt 部署的（DB webhook 不帶使用者 JWT），所以「一定要」自己驗身分。
    // 沒有這道檢查的話，任何人知道網址就能對任意 user_id 發推播、還能冒用任何真實使用者的名字
    // （actor_id 會被拿去查 display_name），等於免費的騷擾與社交工程管道，還會燒光 VAPID 額度。
    // 密鑰設定：supabase secrets set SEND_PUSH_SECRET="..."，
    // 並在 Database → Webhooks 的 HTTP Headers 加 Authorization: <同一串>。
    const secret = Deno.env.get("SEND_PUSH_SECRET") || "";
    const got = req.headers.get("Authorization") || "";
    if (!secret || !safeEqual(got, secret)) return new Response("unauthorized", { status: 401 });

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
    const origin = Deno.env.get("APP_ORIGIN") || "https://trail-tracker-0ma5.onrender.com";
    const title = "循徑拾光";
    const bodyText = `${actorName} ${LABEL[type] || "有新動態"}`;
    const url = post_id ? `${origin}/?post=${post_id}` : origin;

    // Web Push（網頁裝置）
    const { data: subs } = await admin.from("push_subscriptions").select("*").eq("user_id", user_id);
    if (subs && subs.length) {
      const payload = JSON.stringify({ title, body: bodyText, url, tag: type + (post_id || "") });
      await Promise.all(subs.map(async (s: any) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        } catch (err: any) {
          if (err?.statusCode === 404 || err?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        }
      }));
    }

    // 原生推播（iOS APNs）——未設定 APNs secrets 則自動跳過，不影響 Web Push
    await sendNativePush(admin, user_id, { title, body: bodyText, url });

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response("err: " + (e as Error).message, { status: 200 });
  }
});
