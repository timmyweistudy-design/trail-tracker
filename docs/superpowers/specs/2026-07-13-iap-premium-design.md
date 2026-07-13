# 原生 IAP 取代 Stripe（Premium 訂閱）設計

2026-07-13。對應 `docs/optimization-backlog.md` #1「iOS 付費合規」。

## 背景與目標

Apple 與 Google 都規定 App 內的數位功能付費一律走自家 IAP，現在 `premium.js` 走 Stripe web checkout，直接送審會被拒。

目標：**原生 App（iOS/Android）內走 IAP，網頁/PWA 維持 Stripe**，兩邊寫進同一張 `subscriptions` 表，前端解鎖邏輯不變。

前提（已確認）：Stripe 尚無真實付費用戶 → 不需處理既有訂閱遷移。

## 選型

用 **RevenueCat**（`@revenuecat/purchases-capacitor`），不自幹 StoreKit/Play Billing。

收據驗證、續訂狀態同步、退款、跨裝置還原是 IAP 最容易出錯也最容易被盜刷的部分，自己寫要接 Apple Server Notifications 與 Google Real-time Developer Notifications 兩套。RevenueCat 代管這些，用一個 webhook 把結果推回我們的資料庫。月營收 <$2.5k 免費。

代價：多一個外部服務相依。可接受——它只影響「購買當下」與「狀態回寫」，訂閱狀態的真相仍在我們自己的 `subscriptions` 表，RevenueCat 掛掉不影響既有會員解鎖。

## 架構

`subscriptions` 表是唯一真相（RLS：使用者只能讀自己的，只有 service_role 能寫）。`premium.js` 的 `refresh()` / `isOn()` / `gate()` 不動。

三個付費入口 → 兩個寫入者：

| 平台 | 購買 | 狀態寫入 |
|------|------|----------|
| 網頁 / PWA | Stripe Checkout（現況） | `stripe-webhook`（現況） |
| iOS App | StoreKit via RevenueCat | `revenuecat-webhook`（新） |
| Android App | Play Billing via RevenueCat | `revenuecat-webhook`（新） |

RevenueCat 的 `app_user_id` 設為 Supabase 的 user id（登入後 `Purchases.logIn(uid)`），webhook 事件即可直接對應 `auth.users.id`。

### 資料庫（`supabase/schema-phase22-iap.sql`，可重複執行）

`subscriptions` 加：

- `source text not null default 'stripe'` — `stripe` / `app_store` / `play_store`
- `rc_entitlement text` — RevenueCat entitlement（`premium`）
- `store_transaction_id text`

**防覆蓋規則**：兩個 webhook 各自只更新自己來源的資料。用一個 `security definer` 函式 `upsert_subscription(uid, source, status, period_end, ...)` 收斂：若既有 row 的 `source` 不同、且仍是有效訂閱（`active`/`trialing` 且未到期），則忽略這次寫入。避免 Stripe 的 `customer.subscription.deleted` 把一位從 App 內訂閱的會員砍掉，反之亦然。

### Edge Function `revenuecat-webhook`

- 以 `Authorization` header 的共享密鑰驗證（RevenueCat webhook 支援自訂 header），密鑰存 `REVENUECAT_WEBHOOK_SECRET`。驗不過回 401。
- 事件 → 狀態對應：`INITIAL_PURCHASE` / `RENEWAL` / `UNCANCELLATION` / `PRODUCT_CHANGE` → `active`；`TRIAL_STARTED`（含 `type` 為試用的購買）→ `trialing`；`CANCELLATION` → 保留 `active` 到期末（Apple 的取消是「不再續訂」，期末前仍有權益）；`EXPIRATION` → `canceled`；`REFUND` → `canceled` 且立即失效。
- 以 service_role 呼叫 `upsert_subscription`，`source` 依事件的 `store` 欄位（`APP_STORE` / `PLAY_STORE`）決定。
- 部署時 `--no-verify-jwt`（webhook 沒有使用者 JWT），與 `stripe-webhook` 同。

### 前端

新檔 `web/js/iap.js`（`IAP` 模組，與其他 autoload 模組同風格）：

- `available()` — 是原生 App、SDK 存在、且 `IAP_ENABLED` 為真。
- `init(uid)` — `Purchases.configure({ apiKey })`（iOS/Android 各一把 public SDK key）＋ `logIn(uid)`。在 Auth 狀態變動後呼叫。
- `plans()` — 取 offering，回傳含**商店回傳的當地價格字串**的月/年方案。
- `purchase(plan)` — `purchasePackage`；使用者取消 → 靜默返回（不 toast）。
- `restore()` — `restorePurchases()`。

`premium.js` 改動：

- `startCheckout(plan)`：`IAP.available()` → `IAP.purchase(plan)`；否則現有 Stripe 分支。
- `openPortal()`：原生 → 開系統訂閱管理（iOS `itms-apps://apps.apple.com/account/subscriptions`、Android `https://play.google.com/store/account/subscriptions`），**不得**開 Stripe portal。
- 升級彈窗：原生時價格改用 `IAP.plans()` 回傳的當地價格（不寫死 NT$60/NT$600），並加一顆「回復購買」按鈕（Apple 審核必要項，缺少是常見退件原因）。
- 購買成功後 webhook 有延遲 → 沿用 `handleReturn()` 既有的輪詢重試（每 2.5 秒、最多 6 次）解鎖。

**硬規則：原生 App 內任何情況都不得出現 Stripe 入口。** 即使 `IAP_ENABLED` 為假或 SDK 載入失敗，原生也只顯示「付費功能即將開放」，絕不退回 Stripe（退回去就是拒審理由）。

### 設定（`web/js/config.js`）

```js
window.IAP_ENABLED = false;              // 商店產品建好、RevenueCat 接好後改 true
window.REVENUECAT_IOS_KEY = "";          // public SDK key，可放前端
window.REVENUECAT_ANDROID_KEY = "";
```

未設定時安全降級：網頁照走 Stripe，原生顯示「即將開放」。程式碼可以先進版控、先上網頁，不影響現況。

### 商店產品

- Product ID：`tt_premium_month`、`tt_premium_year`（兩商店同名）
- RevenueCat entitlement：`premium`；offering `default` 含 `$rc_monthly` / `$rc_annual`
- 7 天免費試用：在 App Store Connect / Play Console 設 introductory offer，**不需程式碼**

## 錯誤處理

| 情況 | 行為 |
|------|------|
| 使用者取消購買 | 靜默，不 toast |
| 購買失敗（網路/商店） | toast 錯誤訊息，維持未解鎖 |
| 購買成功但 webhook 未到 | 輪詢重試；仍未解鎖 → 提示「款項處理中，稍後自動生效」＋ 保留「回復購買」按鈕 |
| RevenueCat SDK 載入失敗 | `available()` 為假 → 原生顯示「即將開放」，不 crash、不退回 Stripe |
| webhook 密鑰驗證失敗 | 401，不寫入 |

## i18n

新字串走既有規則（`web/js/i18n.js` en 字典 + `web/js/i18n/*.js` 23 語系；`check.js` 規則 H/H2 會擋）。預期新增：「回復購買」「款項處理中，稍後自動生效」「付費功能即將開放」（後者可能已有）。

## 驗證

可自動驗（我做）：

- 網頁版付費流程未被改動（Stripe 分支行為不變）
- 模擬 `Capacitor.isNativePlatform() === true` 時，升級彈窗不出現任何 Stripe 入口、`startCheckout` 不打 `create-checkout`
- RevenueCat SDK 不存在時 `IAP.available()` 為假且不拋錯
- `npm run check`（含 i18n 規則）與 `npm run e2e` 全過

只能實機驗（使用者做，手冊會寫）：沙盒帳號實際購買、續訂、取消、回復購買、退款。

## 交付物

1. `supabase/schema-phase22-iap.sql`
2. `supabase/functions/revenuecat-webhook/index.ts`
3. `web/js/iap.js`（新）、`web/js/premium.js`（改）、`web/js/config.js`（開關）、`index.html`（載入 iap.js）
4. i18n 字串（en + 23 語系）
5. `docs/iap-setup.md` — RevenueCat 帳號、商店產品、webhook、沙盒測試的完整步驟手冊

## 不做（YAGNI）

- 既有 Stripe 訂閱遷移（沒有付費用戶）
- App 內顯示「去網頁訂閱比較便宜」之類的外部導引（Apple 禁止，會被拒審）
- 多階訂閱、家庭方案、買斷制
