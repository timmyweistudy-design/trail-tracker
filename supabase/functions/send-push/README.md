# Web Push 設定步驟（一次性）

推播分兩半：**訂閱**（前端，已完成）＋**發送**（這個 Edge Function）。

## 1. 產生 VAPID 金鑰
```bash
npx web-push generate-vapid-keys
```
得到 Public Key 與 Private Key。

## 2. 前端填公鑰
編輯 `web/js/config.js`：
```js
window.VAPID_PUBLIC_KEY = "貼上 Public Key";
```
重新部署。社群「通知」分頁就會出現「🔔 開啟推播通知」。

## 3. 跑 SQL
在 Supabase SQL Editor 執行 `supabase/schema-phase12-push.sql`（建立 push_subscriptions 表）。

## 4. 部署 Edge Function
```bash
supabase functions deploy send-push --no-verify-jwt
supabase secrets set VAPID_PUBLIC_KEY="..." VAPID_PRIVATE_KEY="..." VAPID_SUBJECT="mailto:你的信箱"
# SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 通常已自動注入；若無則一併 set
supabase secrets set APP_ORIGIN="https://trail-tracker-0ma5.onrender.com"
```

## 5. 設 Database Webhook
Dashboard → Database → Webhooks → Create：
- Table: `notifications`，Events: `INSERT`
- Type: `Supabase Edge Functions` → 選 `send-push`

之後只要有人追蹤/按讚/留言/提及你、邀你入隊、送果實，DB 會自動建立 notification → webhook 觸發 → 推播送到你所有已訂閱裝置（含安裝到主畫面的 PWA）。
