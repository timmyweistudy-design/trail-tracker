// Google Places 金鑰（前端可見）。
// ⚠️ 安全：請在 Google Cloud 設此金鑰的「HTTP 參照網址限制」只允許本站網址、
//    「API 限制」只允許 Places API，並設預算/配額上限，避免被盜刷。
window.PLACES_KEY = "AIzaSyBmv_wzflejv2ViaLe0_IXt90McrXCMKik";
// 即時路況代理（Cloudflare Worker）網址；空＝用烘焙路況。
window.CONDITIONS_PROXY = "https://trail-tracker.timmyweistudy.workers.dev";
// Supabase（社群功能）。anon key 放前端是安全的：資料由 RLS 在資料庫層把關。
// ⚠️ 填入你的 Supabase 專案 URL 與 anon/public key（兩者皆空＝社群分頁顯示「尚未啟用」）。
//    service_role key 絕不可放這裡。
window.SUPABASE_URL = "https://bkbkamvbczqdejrlpiqo.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_3VM6B_9iEw1vt3BTZpTo3w_-r3wkimi";
// 設 true 才顯示「使用 Google 繼續」（需先在 Supabase 設定 Google provider）。目前用 Email 驗證碼登入。
window.SOCIAL_GOOGLE = false;
