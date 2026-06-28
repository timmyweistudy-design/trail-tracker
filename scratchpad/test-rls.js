// RLS 整合測試：驗證非好友看不到 friends 貼文、不能改他人資料。
// 需先完成 Supabase 專案 + schema，並建立兩個測試帳號 A、B（互不追蹤）。
// 用法：
//   SB_URL=... SB_ANON=... SB_A_EMAIL=... SB_A_PW=... SB_B_EMAIL=... SB_B_PW=... \
//     node scratchpad/test-rls.js
// 注意：這是對「真實後端」的煙霧測試，本機手動執行，不進 CI；勿提交任何金鑰。
const fs = require("fs"), vm = require("vm");
const ctx = { console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(__dirname + "/../web/vendor/supabase/supabase.js", "utf8"), ctx);
const createClient = ctx.supabase.createClient;

const { SB_URL, SB_ANON, SB_A_EMAIL, SB_A_PW, SB_B_EMAIL, SB_B_PW } = process.env;
if (!SB_URL || !SB_ANON || !SB_A_EMAIL || !SB_B_EMAIL) { console.error("缺少環境變數（SB_URL/SB_ANON/SB_A_*/SB_B_*）"); process.exit(1); }

(async () => {
  const a = createClient(SB_URL, SB_ANON), b = createClient(SB_URL, SB_ANON);
  const ra = await a.auth.signInWithPassword({ email: SB_A_EMAIL, password: SB_A_PW });
  const rb = await b.auth.signInWithPassword({ email: SB_B_EMAIL, password: SB_B_PW });
  if (ra.error || rb.error) { console.error("登入失敗", ra.error || rb.error); process.exit(1); }
  const { data: au } = await a.auth.getUser();

  // A 發一篇 friends 貼文
  const { data: post, error: pe } = await a.from("posts")
    .insert({ author_id: au.user.id, trail_name: "RLS 測試", visibility: "friends" }).select().single();
  if (pe) { console.error("A 建立貼文失敗", pe.message); process.exit(1); }

  // B（非好友）不應讀到
  const { data: seen } = await b.from("posts").select("id").eq("id", post.id).maybeSingle();
  console.log(seen ? "FAIL: 非好友讀到了 friends 貼文" : "ok: 非好友讀不到 friends 貼文");

  // B 不應改 A 的 profile（RLS 會讓 update 影響 0 列）
  const { data: upd } = await b.from("profiles").update({ bio: "hacked" }).eq("id", au.user.id).select();
  console.log((upd && upd.length) ? "FAIL: 改到他人 profile 了" : "ok: 不能改他人 profile");

  // 清理
  await a.from("posts").delete().eq("id", post.id);
})();
