// Supabase Edge Function：刪除「目前登入者」的帳號與所有資料（App Store 指南 5.1.1(v)：有註冊就必須能在 App 內刪帳號）。
// 前端呼叫：supabase.functions.invoke("delete-account")（會自動帶使用者 JWT）。
// 流程：用呼叫者 JWT 驗身分取 uid → 刪 storage（media 底下該使用者資料夾）→ auth.admin.deleteUser(uid)；
//        資料庫各表都是 references auth.users(id) ON DELETE CASCADE，刪 auth 使用者即連帶清 profiles/posts/likes/
//        follows/comments/teams/team_members/events/rsvps/notifications/backups/native_push_tokens/pet_gifts… 全部。
// 部署：supabase functions deploy delete-account（SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 由平台自動注入）。
import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// 遞迴刪一個 storage 資料夾（Supabase list 不遞迴：資料夾要自己往下走）
async function rmFolder(admin: any, bucket: string, prefix: string) {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data) return;
  const files: string[] = [];
  for (const it of data) {
    const p = prefix ? `${prefix}/${it.name}` : it.name;
    if (it.id === null || it.metadata === null) await rmFolder(admin, bucket, p);   // 是資料夾 → 往下遞迴
    else files.push(p);                                                              // 是檔案 → 收集起來刪
  }
  if (files.length) await admin.storage.from(bucket).remove(files);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "no auth" }, 401);

    // 用呼叫者的 JWT 驗證身分（只能刪自己）
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: ue } = await userClient.auth.getUser();
    if (ue || !u?.user) return json({ error: "unauthorized" }, 401);
    const uid = u.user.id;

    const admin = createClient(url, service);
    try { await rmFolder(admin, "media", uid); } catch (_) { /* storage 清理是 best-effort，失敗不擋刪帳號 */ }

    const { error: de } = await admin.auth.admin.deleteUser(uid);
    if (de) return json({ error: de.message }, 500);
    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
