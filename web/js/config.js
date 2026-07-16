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
window.SOCIAL_GOOGLE = true;
// Web Push 推播：填入你的 VAPID 公鑰（base64url）。空＝不顯示「開啟推播」。
// 產生金鑰：npx web-push generate-vapid-keys（公鑰放這、私鑰放 Edge Function 環境變數 VAPID_PRIVATE_KEY）。
window.VAPID_PUBLIC_KEY = "BMYHczEtR9vWkz2gBUuJEpRpJ2APVHRPwNKQL_SZmPJYiu9rQYxSRCHLYR5Y1rhcjG8pi_y0w5qWYGOx2w-5FdA";
// Premium 付費（Stripe）。FUNCTIONS_URL = Supabase Edge Functions 基底網址
//   例：https://bkbkamvbczqdejrlpiqo.supabase.co/functions/v1
// 部署好 create-checkout / stripe-webhook 後把 STRIPE_ENABLED 設 true，「升級」才會去結帳。
window.FUNCTIONS_URL = "https://bkbkamvbczqdejrlpiqo.supabase.co/functions/v1";
window.STRIPE_ENABLED = true;
// 原生 App 內購（RevenueCat）。網頁版不受影響（付費仍走 Stripe）。
// 商店產品與 RevenueCat 後台設好後把 IAP_ENABLED 設 true——設定步驟見 docs/iap-setup.md。
// 這兩把是「public SDK key」，可以放前端（不是密鑰）。
window.IAP_ENABLED = true;    // 原生 App 內購已上線（RevenueCat）；網頁版仍走 Stripe，不受影響
window.REVENUECAT_IOS_KEY = "appl_hOuPaGDfqdHXcBZmyBWdxqUBRGy";   // public key 固定 32 字元（appl_ + 27）；曾經尾巴多貼 age 三個字 → 401 Invalid API Key
window.REVENUECAT_ANDROID_KEY = "";
