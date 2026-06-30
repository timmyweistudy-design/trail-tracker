# Premium 付費（Stripe 訂閱）設定步驟

前端與資料庫骨架已就緒：
- `supabase/schema-phase14-premium.sql`（subscriptions 表 + profiles.is_premium）
- `web/js/premium.js`（升級彈窗、會員狀態、結帳呼叫）
- Edge Functions：`create-checkout`、`stripe-webhook`

## 1. 跑 SQL
Supabase SQL Editor 執行 `schema-phase14-premium.sql`。

## 2. Stripe 後台
1. 註冊 https://dashboard.stripe.com （台灣可用）。
2. Products → 新增產品「循徑拾光 Premium」→ 定價選 **Recurring（每月）NT$60**（金額自訂）→ 取得 **Price ID**（`price_xxx`）。
3. Developers → API keys → 取得 **Secret key**（`sk_...`，先用測試模式 `sk_test_`）。

## 3. 部署 Edge Functions
```bash
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
supabase secrets set STRIPE_SECRET_KEY="sk_test_..." STRIPE_PRICE_ID="price_..."
# SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY 通常已自動注入
```

## 4. 設定 Stripe Webhook
Stripe Dashboard → Developers → Webhooks → Add endpoint：
- URL：`https://<你的專案>.supabase.co/functions/v1/stripe-webhook`
- 事件：勾 `checkout.session.completed`、`customer.subscription.updated`、`customer.subscription.deleted`
- 建立後複製 **Signing secret**（`whsec_...`）：
```bash
supabase secrets set STRIPE_WEBHOOK_SECRET="whsec_..."
```

## 5. 前端開關
`web/js/config.js`：
```js
window.FUNCTIONS_URL = "https://<你的專案>.supabase.co/functions/v1";
window.STRIPE_ENABLED = true;   // 改成 true
```
重新部署。之後「升級 Premium」就會導去 Stripe 結帳，付款成功 → webhook 自動把該用戶設為會員 → App 內 Premium 功能解鎖。

## 測試
用 Stripe 測試卡 `4242 4242 4242 4242`（任意未來到期日、任意 CVC）。測完上線時把金鑰換成正式 `sk_live_` 並重設 webhook。

## 注意
- 訂閱狀態只由 webhook 寫入，使用者改不了（profiles.is_premium 已 revoke 使用者更新權限）。
- 前端付費功能（離線地圖/分析/外觀）為軟鎖：擋一般使用者足夠，但非強加密。
