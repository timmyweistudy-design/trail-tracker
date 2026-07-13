# 原生 App 內購（RevenueCat）設定步驟

程式碼已經全部寫完：
- `supabase/schema-phase22-iap.sql`（`subscriptions` 表加 `source`/`rc_entitlement`/`store_transaction_id`，`upsert_subscription()` 函式含防覆蓋規則）
- `supabase/functions/revenuecat-webhook/index.ts`（收 RevenueCat 事件寫回 `subscriptions`）
- `web/js/iap.js`（`IAP` 模組：`available()`/`init()`/`plans()`/`purchase()`/`restore()`）、`web/js/premium.js`（原生時走 IAP，網頁不變）、`web/js/config.js`（開關）

這份手冊涵蓋的都是**只有你本人能做**的部分：商店後台建產品、RevenueCat 接帳號、Supabase 部署、實機沙盒測試。跟著做就能上線。姊妹篇是 Stripe 那份 `supabase/functions/PREMIUM_SETUP.md`——原理一樣，這裡是原生 App 版。

---

## 0. 前置

已裝好 `@revenuecat/purchases-capacitor@^9.2.2`（`package.json` 已鎖）。**不要**自己升到 10.x 以上：10+ 要 Capacitor 7、12+ 要 Capacitor 8，本專案目前是 Capacitor 6，升級外掛前要先升 Capacitor（不在本次範圍）。

任何時候改了 `web/js/config.js` 或裝新外掛，本機要跑一次：

```bash
npm run sync   # cap sync，把 web/ 與外掛同步進 android/ 與 ios/
```

Codemagic 雲端建置 iOS 時會自己跑 `cap sync`，不用你手動同步 `ios/`。Android 你本機出包前記得跑。

---

## 1. App Store Connect（iOS）

需要 [Apple Developer Program](https://developer.apple.com/programs/)（US$99/年，若還沒加入，`docs/build-app.md` 也提過）。

1. 登入 [App Store Connect](https://appstoreconnect.apple.com/) → 你的 App（`com.timmyweistudy.trailtracker`，若還沒建立 App record，先 My Apps → + → New App 建好）。
2. 左側 **Subscriptions** → **App 內購買項目與訂閱群組** → 先建一個 **Subscription Group**（例如叫「Premium」），月方案與年方案要放在**同一個群組**（讓使用者能在月/年間切換升降級）。
3. 在這個群組底下新增兩個 auto-renewable subscription：
   - Product ID：`tt_premium_month`（Reference Name 隨意，例如「Premium 月訂閱」）
   - Product ID：`tt_premium_year`（Reference Name 例如「Premium 年訂閱」）
   - **Product ID 必須跟程式碼完全一致**（`web/js/iap.js` 靠 RevenueCat offering 拿方案，不直接比對 product ID，但 RevenueCat 後台接商店時要填這兩個 ID，見第 4 節）。
4. 各自設定：
   - **定價（Price Schedule）**：選一個定價階層，月/年自訂，年方案建議定價約等於月方案 × 10（給年繳折扣感），實際金額你自己決定。
   - **Introductory Offer（免費試用）**：兩個訂閱都加 → 類型選 **Free Trial**、期間 **7 天**。這是純後台設定，程式碼不需要改。
   - **Localization**：至少填「繁體中文」與「English (U.S.)」的 Display Name 與 Description（Apple 審核必填，缺一個語系會卡審）。
   - **App 審核資訊（Review Information）**：上傳一張**該訂閱的 App 內截圖**（顯示升級彈窗/方案畫面），並填 Review Notes 說明這是解鎖離線地圖/分析/外觀等 Premium 功能。
5. 存檔後，訂閱狀態會是「準備提交」，等你之後把整個 App 版本送審時會一起審。**沙盒測試不需要等審核過**（見第 8 節）。

---

## 2. Google Play Console（Android）

1. 登入 [Google Play Console](https://play.google.com/console) → 選你的 App。
2. 左側 **Monetize** → **Products** → **Subscriptions** → **Create subscription**。
3. 建兩個訂閱，Product ID 分別填：
   - `tt_premium_month`
   - `tt_premium_year`
4. 各自設定：
   - **Base plan**：週期選對應的 monthly / yearly，填定價（可用「Set prices for all countries/regions」自動換算）。
   - **Free trial（Offer）**：在 base plan 底下加一個 offer，類型選 free trial，天數填 **7**。
   - 兩個訂閱**不需要**手動綁群組——Google Play 一個 App 下的訂閱本來就能被使用者切換，RevenueCat 那邊會用 entitlement 統一辨識。
5. **Activate** 兩個訂閱（草稿狀態測試裝置抓不到）。

---

## 3. RevenueCat

1. 到 [app.revenuecat.com](https://app.revenuecat.com/) 註冊、建一個 Project（例如「循徑拾光」）。
2. **接 App Store**：Project settings → Apps → + New → App Store。
   - 選驗證方式：**App-Specific Shared Secret**（在 App Store Connect → App 資訊 → App-Specific Shared Secret 產生）或 **In-App Purchase Key**（App Store Connect → Users and Access → Integrations → In-App Purchase，新版建議用這個，權限更細）。兩者選一種填進去即可。
   - Bundle ID 填 `com.timmyweistudy.trailtracker`。
3. **接 Google Play**：同一頁 + New → Google Play。
   - 需要一個 **Service Account JSON**：Google Play Console → Setup → API access → 建立/連結一個 Google Cloud 專案的 Service Account，授予「Financial data」讀取權限，下載 JSON key，上傳到 RevenueCat。
   - Package name 填 `com.timmyweistudy.trailtracker`。
4. **建 Entitlement**：Project → Entitlements → + New，identifier 填 **`premium`**（一定要跟 `web/js/iap.js` 的 `ENTITLEMENT = "premium"` 完全一致，大小寫敏感）。
5. **建 Products**：Project → Products → 分別在 App Store 與 Play Store 標籤下把剛才建的 `tt_premium_month`、`tt_premium_year` 匯入（RevenueCat 會自動抓商店已上架的產品，找不到就等商店那邊存檔生效後再試一次，通常幾分鐘內）。把兩個 product 都掛到 `premium` entitlement 上。
6. **建 Offering**：Project → Offerings → 用預設的 `default` offering（或新建一個設成 current）→ 加入兩個 Package：
   - Package type 選 **`$rc_monthly`**（RevenueCat 內部會回傳 `packageType: "MONTHLY"`）→ 對應到 `tt_premium_month`
   - Package type 選 **`$rc_annual`**（回傳 `packageType: "ANNUAL"`）→ 對應到 `tt_premium_year`
   - `web/js/iap.js` 的 `plans()` 就是靠 `availablePackages.find(x => x.packageType === "MONTHLY" | "ANNUAL")` 找方案，package type 一定要選對，否則前端抓不到方案、升級彈窗會顯示空白。
7. **取得 public SDK key**：Project settings → API keys → 分別複製 **Apple App Store** 的 public key（`appl_...`）與 **Google Play Store** 的 public key（`goog_...`）。這兩把可以放前端（不是密鑰），等下填進 `web/js/config.js`。

---

## 4. Supabase：資料庫與 Edge Function

### 4.1 跑 SQL

Supabase Dashboard → SQL Editor → 貼上並執行 `supabase/schema-phase22-iap.sql` 全文（可重複執行，不會破壞既有資料）。這會幫 `subscriptions` 表加上 `source`/`rc_entitlement`/`store_transaction_id` 欄位，並建立 `upsert_subscription()` 函式。

### 4.2 部署 webhook 與密鑰

```bash
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase secrets set REVENUECAT_WEBHOOK_SECRET="$(openssl rand -hex 24)"
```

**為什麼要 `--no-verify-jwt`**：Supabase 預設 Edge Function 需要 `Authorization: Bearer <supabase-jwt>`，但 RevenueCat 送 webhook 時不會帶 Supabase 的使用者 JWT，只能帶你自訂的一個固定 header 值。所以這個 function 關掉 Supabase 內建的 JWT 驗證，改在 function 內部自己比對 `Authorization` header 是否等於 `REVENUECAT_WEBHOOK_SECRET`（見 `index.ts` 第 31–32 行）。`stripe-webhook` 也是同樣理由用 `--no-verify-jwt`。

`SUPABASE_URL` 與 `SUPABASE_SERVICE_ROLE_KEY` 通常已經是 Edge Function 環境自動注入的變數，不用手動設。

**記下 `openssl rand -hex 24` 印出來的那串密鑰**，下一步要用。

---

## 5. RevenueCat：設定 webhook

回到 RevenueCat 後台 → Project settings → Integrations → Webhooks → + Add：

- **URL**：`https://<你的專案>.supabase.co/functions/v1/revenuecat-webhook`（把 `<你的專案>` 換成你的 Supabase project ref，跟 `web/js/config.js` 裡 `FUNCTIONS_URL` 用的是同一個網域）
- **Authorization header value**：貼上第 4.2 步 `openssl rand -hex 24` 產生的那串密鑰，**必須跟 `REVENUECAT_WEBHOOK_SECRET` 一字不差**——`index.ts` 用的是完全字串比對（`req.headers.get("Authorization") !== secret`），差一個字元都會被擋（回 401，見第 10 節疑難排解）。
- 事件不用特別勾選，RevenueCat 預設會送所有事件，`index.ts` 自己用 `EVENT_STATUS` 表判斷認不認得（不認得的事件會回 200 忽略，不會被當錯誤重送）。

---

## 6. 前端開關

編輯 `web/js/config.js`（就在既有 `STRIPE_ENABLED` 那組設定下方）：

```js
window.IAP_ENABLED = true;               // 原本是 false
window.REVENUECAT_IOS_KEY = "appl_...";  // 第 3.7 步取得的 iOS public SDK key
window.REVENUECAT_ANDROID_KEY = "goog_...";
```

**這一步之前完全安全**：`IAP_ENABLED=false` 時，網頁版照走 Stripe 完全不受影響；原生 App 會顯示「付費功能即將開放」，不會 crash、也絕不會退回開 Stripe 結帳頁（`web/js/iap.js` 的 `available()` 三個條件缺一都會安全降級，`premium.js` 的硬規則是原生內任何情況都不出現 Stripe 入口）。所以你可以先把商店產品/RevenueCat 都建好、確認沒問題了，最後一刻才切這個開關。

改完 `config.js` 後：
```bash
npm run sync   # 讓 android/ios 專案拿到新設定
```
然後照 `docs/build-app.md` 的流程出新的 build（Android 本機 Android Studio；iOS 用 Codemagic）。

---

## 7. 沙盒測試（只有你能跑）

### iOS

1. **建沙盒測試帳號**：App Store Connect → Users and Access → **Sandbox** → Testers → + → 用一個沒被真實 Apple ID 註冊過的 email（可以用 email 別名，例如 `you+sandbox1@gmail.com`）建一個測試帳號，密碼另設。
2. **裝 App**：透過 TestFlight 安裝含這次改動的版本（先跑一輪 Codemagic build 上傳）。
3. **裝置登入沙盒帳號**：iPhone **設定 → App Store → 往下拉找到 Sandbox Account（不是頂端那個真實 Apple ID）→ 登入剛建的沙盒帳號**。不要登出你平常用的真實 Apple ID，Sandbox Account 是獨立的一欄。
4. 打開 App，走升級流程 → 選月或年方案購買 → 系統彈出的購買確認框上會標示「Sandbox」字樣，用剛才設的沙盒密碼確認購買（不會真的扣款）。
5. **驗收**：
   - App 內：Premium 功能（離線地圖/分析/外觀）應該解鎖，升級彈窗消失或改顯示已訂閱狀態。
   - Supabase：Table Editor 打開 `subscriptions` 表，該使用者的 row 應該有 `source = 'app_store'`、`status = 'active'`（或 `trialing`，因為設了 7 天試用）。
6. **沙盒訂閱週期被加速**：真實 1 個月的訂閱週期在沙盒環境約 **5 分鐘**就會跑完一輪，可以趁機蹲點觀察 RevenueCat 後台 Events 頁面有沒有陸續送出 `RENEWAL`、之後測試取消時的 `EXPIRATION` 事件，並回頭確認 Supabase `subscriptions` 表的 `status`/`current_period_end` 有沒有跟著更新。
7. **回復購買測試**：App 內刪除重裝 → 重新登入同一個 Supabase 帳號 → 進升級彈窗點「回復購買」按鈕（`IAP.restore()`）→ 應該不用再次付款就直接解鎖（因為沙盒帳號名下已經有一筆有效購買）。

### Android

1. **加測試帳號**：Play Console → Setup → **License testing** → 加入你的 Google 帳號 email 作為 License Tester。
2. **上傳到 internal testing 軌道**：Play Console → Testing → Internal testing → 上傳這次改動的 `.aab`（`npm run open:android` 出包流程參考 `docs/build-app.md`），加入你自己（或另一支測試手機的帳號）為測試人員，用邀請連結安裝。
3. 用該測試帳號在手機上登入 Play Store，打開 internal testing 安裝好的 App，走升級流程購買（License tester 身分下購買不會真的扣款，介面上通常會標示測試訂單）。
4. 驗收方式同 iOS：App 內功能解鎖 + Supabase `subscriptions` 表出現 `source = 'play_store'` 的 row。
5. Google Play 的沙盒訂閱週期也有加速機制（依方案長度不同，通常比照 Apple 的等比例縮短），可以用來看 `RENEWAL`/`CANCELLATION` 事件。

---

## 8. 驗證防覆蓋規則（可貼進 Supabase SQL Editor）

`upsert_subscription()` 的防覆蓋規則是：如果現有訂閱來自「別的來源」且仍然有效（`active`/`trialing` 且未過期），這次寫入會被忽略。這是為了避免 Stripe 的取消事件把一位從 App 內訂閱（IAP）的會員誤砍掉，反之亦然。可以這樣手動驗證：

```sql
-- 前提：<uid> 這位使用者已經有一筆 source='app_store' 且 status='active' 的有效訂閱
-- （可以先用第 7 節沙盒購買一次，或直接手動 insert 一筆來模擬）

-- 模擬 Stripe 那邊送來一筆「取消」事件，想把這位使用者的訂閱改成 canceled
select public.upsert_subscription('<uid>', 'stripe', 'canceled', now(), null, null, null, null);

-- 檢查結果
select source, status from public.subscriptions where user_id = '<uid>';
-- 預期：仍然是 source='app_store'、status='active'（Stripe 的取消事件不得砍掉 IAP 會員）
```

如果查出來變成了 `stripe`/`canceled`，代表防覆蓋規則沒生效，要回頭檢查 `schema-phase22-iap.sql` 是否真的執行成功（尤其 `cur.status in ('active','trialing')` 與到期時間判斷那段）。

---

## 9. 疑難排解

**買了但 App 內沒解鎖：**
1. RevenueCat 後台 → Customer History（用該使用者的 app_user_id，也就是 Supabase user id，搜尋）→ 確認有沒有看到 `INITIAL_PURCHASE` 事件、entitlement `premium` 是否 active。
2. RevenueCat 後台 → Project settings → Integrations → Webhooks → 該 webhook 應該有「最近送出紀錄」，看回應碼是不是 200。若是非 200，點進去看回傳的 body（`revenuecat-webhook` 失敗時會回對應錯誤字串，例如 `db error`）。
3. Supabase Dashboard → Edge Functions → `revenuecat-webhook` → Logs，看有沒有 `upsert_subscription failed` 之類的錯誤 log（`index.ts` 第 64 行 `console.error`）。
4. 最後查 Supabase Table Editor 的 `subscriptions` 表，確認那位使用者的 row 有沒有更新、`user_id` 是否跟登入帳號一致（`IAP.init(uid)` 要在登入後呼叫，`app_user_id` 才會對得上 Supabase user id）。

**webhook 回 401：**
代表 RevenueCat 送來的 `Authorization` header 值跟 Supabase 的 `REVENUECAT_WEBHOOK_SECRET` 密鑰不一致。回第 5 節重新確認兩邊填的是同一串（複製貼上，不要手動打，容易漏字元或多空白）。可以用 `supabase secrets list` 確認密鑰確實有設定成功（值本身不會顯示，但可以確認 key 存在）。

**App 內看不到方案（升級彈窗空白/顯示不出價格）：**
- 檢查 RevenueCat Offering 是否真的設成 **current**，且兩個 Package 的 `packageType` 是否正確選了 `$rc_monthly`/`$rc_annual`（對應程式碼要找的 `MONTHLY`/`ANNUAL`）。
- 檢查 `web/js/config.js` 的 `REVENUECAT_IOS_KEY`/`REVENUECAT_ANDROID_KEY` 有沒有貼對（貼錯會導致 `Purchases.configure` 失敗，`IAP.init()` 靜默回傳 false，`available()` 仍為 true 但 `plans()` 抓不到東西）。
- 檢查商店那邊的訂閱是不是還在「準備提交/草稿」狀態——Google Play 訂閱沒 Activate、或 App Store 訂閱還沒存檔完成，RevenueCat 抓不到對應 product，Offering 底下會顯示紅字提示。
- 確認裝置上的 App 版本已經跑過 `npm run sync` 之後重新編譯（改了 `config.js` 沒有重新 build+sync，舊安裝的 App 還在用舊設定）。
