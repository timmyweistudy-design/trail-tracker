# 原生 IAP（Premium 訂閱）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 原生 App（iOS/Android）內的 Premium 訂閱改走 RevenueCat IAP，網頁維持 Stripe，兩邊寫進同一張 `subscriptions` 表。

**Architecture:** `subscriptions` 表是唯一真相，只有 service_role 能寫。新增 `revenuecat-webhook` Edge Function 當第二個寫入者；兩個 webhook 都改走 SQL 函式 `upsert_subscription()`，內含「別的來源仍有效就不覆蓋」規則。前端新增 `web/js/iap.js` 包住 RevenueCat SDK，`premium.js` 依平台分流。前端解鎖判斷（`refresh()`/`gate()`）完全不動。

**Tech Stack:** Capacitor 6、`@revenuecat/purchases-capacitor`、Supabase Edge Functions（Deno）、PostgreSQL、原生 JS（無框架、無打包器，`web/js/*.js` 以 script tag 載入）。

**設計來源：** `docs/superpowers/specs/2026-07-13-iap-premium-design.md`

**專案慣例（動手前先讀）：**
- 測試：`node scripts/tests/test-fixes.js`（純 node、無框架，用 `ok(name, cond)` 斷言；`npm run check` 會自動跑）
- 守門：`npm run check` 會擋 commit——含 i18n 規則 H（JS 模板裡的中文字串必須翻得出來）、H2（en 有的 key，23 個語系檔都要有）、以及 **web/ 有改就要 bump `web/sw.js` 的 `CACHE` 版本號**
- 冒煙：`LD_LIBRARY_PATH="$HOME/pw-libs/root/usr/lib/x86_64-linux-gnu" npm run e2e`（Playwright；WSL 缺系統函式庫要帶這個環境變數）

---

### Task 1: 資料庫 — `source` 欄位與 `upsert_subscription()` 防覆蓋函式

**Files:**
- Create: `supabase/schema-phase22-iap.sql`

- [ ] **Step 1: 寫 SQL（可重複執行）**

```sql
-- IAP（App Store / Google Play）訂閱來源。可重複執行。
-- subscriptions 仍是訂閱狀態的唯一真相；這裡只是讓它能容納第二個寫入者（RevenueCat）。

alter table public.subscriptions add column if not exists source text not null default 'stripe';   -- stripe / app_store / play_store
alter table public.subscriptions add column if not exists rc_entitlement text;
alter table public.subscriptions add column if not exists store_transaction_id text;

-- 兩個 webhook（Stripe / RevenueCat）共用的唯一寫入口。
-- 防覆蓋規則：若既有訂閱來自「別的來源」且仍有效（active/trialing 且未到期），忽略這次寫入。
-- 沒有這條，Stripe 的 subscription.deleted 會把一位從 App 內訂閱的會員砍掉（反之亦然）。
create or replace function public.upsert_subscription(
  p_user uuid,
  p_source text,
  p_status text,
  p_period_end timestamptz,
  p_stripe_customer text default null,
  p_stripe_sub text default null,
  p_entitlement text default null,
  p_tx text default null
) returns void language plpgsql security definer set search_path = public as $$
declare cur record;
begin
  if p_user is null then return; end if;

  select * into cur from subscriptions where user_id = p_user;
  if cur.user_id is not null
     and cur.source is distinct from p_source
     and cur.status in ('active', 'trialing')
     and (cur.current_period_end is null or cur.current_period_end > now()) then
    return;   -- 另一個來源的訂閱仍有效 → 不覆蓋
  end if;

  insert into subscriptions as s (
    user_id, status, current_period_end, source,
    stripe_customer_id, stripe_subscription_id, rc_entitlement, store_transaction_id, updated_at
  ) values (
    p_user, p_status, p_period_end, p_source,
    p_stripe_customer, p_stripe_sub, p_entitlement, p_tx, now()
  )
  on conflict (user_id) do update set
    status = excluded.status,
    current_period_end = excluded.current_period_end,
    source = excluded.source,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
    rc_entitlement = coalesce(excluded.rc_entitlement, s.rc_entitlement),
    store_transaction_id = coalesce(excluded.store_transaction_id, s.store_transaction_id),
    updated_at = now();

  update profiles set is_premium = (
    p_status in ('active', 'trialing') and (p_period_end is null or p_period_end > now())
  ) where id = p_user;
end; $$;

-- 只有 service_role（webhook）能呼叫，使用者不可自我升級
revoke execute on function public.upsert_subscription(uuid, text, text, timestamptz, text, text, text, text) from authenticated, anon;
```

- [ ] **Step 2: 語法檢查（不需連線資料庫）**

Run: `npm run check`
Expected: `✓ 檢查通過`（SQL 不在 JS 檢查範圍，這裡只是確認沒弄壞別的）

- [ ] **Step 3: Commit**

```bash
git add supabase/schema-phase22-iap.sql
git commit -m "IAP：subscriptions 加 source 欄位與 upsert_subscription 防覆蓋函式"
```

> 這支 SQL 要由使用者在 Supabase SQL Editor 執行（Task 7 的手冊會寫）。實際的防覆蓋行為只能在有資料庫時驗證，手冊附一段可貼上的驗證 SQL。

---

### Task 2: `stripe-webhook` 改走 `upsert_subscription()`

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts:10-18`（`setStatus` 函式）

- [ ] **Step 1: 改寫 `setStatus`，帶 `source='stripe'` 走 RPC**

把現有的 `setStatus`（直接 upsert `subscriptions` 再 update `profiles`）整個換成：

```ts
async function setStatus(userId: string, status: string, periodEnd: number | null, customer: string | null, sub: string | null) {
  if (!userId) return;
  // 統一走 upsert_subscription：內含「IAP 訂閱仍有效就不覆蓋」規則（見 schema-phase22-iap.sql）
  const { error } = await admin.rpc("upsert_subscription", {
    p_user: userId,
    p_source: "stripe",
    p_status: status,
    p_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    p_stripe_customer: customer,
    p_stripe_sub: sub,
  });
  if (error) console.error("upsert_subscription failed", error);
}
```

（`profiles.is_premium` 現在由 SQL 函式內部更新，不必再在 TS 這邊 update。）

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "Stripe webhook 改走 upsert_subscription（避免覆蓋 IAP 訂閱）"
```

---

### Task 3: `revenuecat-webhook` Edge Function

**Files:**
- Create: `supabase/functions/revenuecat-webhook/index.ts`
- Modify: `scripts/tests/test-fixes.js`（尾端追加）

RevenueCat 的 webhook body 形如：

```json
{ "event": { "type": "INITIAL_PURCHASE", "app_user_id": "<supabase uid>", "store": "APP_STORE",
  "period_type": "TRIAL", "expiration_at_ms": 1767225600000,
  "entitlement_ids": ["premium"], "transaction_id": "2000000..." } }
```

- [ ] **Step 1: 先寫失敗的測試**

在 `scripts/tests/test-fixes.js` 尾端（`process.exit` 之前）加：

```js
// 12) RevenueCat webhook：事件 → 訂閱狀態對應
const rcSrc = fs.readFileSync(path.join(ROOT, "supabase", "functions", "revenuecat-webhook", "index.ts"), "utf8");
const rcMap = eval("(" + rcSrc.match(/const EVENT_STATUS[^=]*=\s*(\{[\s\S]*?\})\s*;/)[1] + ")");
ok("RC 續訂→active", rcMap.RENEWAL === "active");
ok("RC 首購→active", rcMap.INITIAL_PURCHASE === "active");
ok("RC 取消→仍 active（期末前有權益）", rcMap.CANCELLATION === "active");
ok("RC 到期→canceled", rcMap.EXPIRATION === "canceled");
ok("RC 退款→canceled", rcMap.REFUND === "canceled");
ok("RC 扣款失敗→past_due", rcMap.BILLING_ISSUE === "past_due");
const rcStore = eval("(" + rcSrc.match(/const STORE_SOURCE[^=]*=\s*(\{[\s\S]*?\})\s*;/)[1] + ")");
ok("RC APP_STORE→app_store", rcStore.APP_STORE === "app_store");
ok("RC PLAY_STORE→play_store", rcStore.PLAY_STORE === "play_store");
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node scripts/tests/test-fixes.js`
Expected: 因為檔案不存在而拋 `ENOENT: no such file or directory ... revenuecat-webhook/index.ts`

- [ ] **Step 3: 寫 Edge Function**

Create `supabase/functions/revenuecat-webhook/index.ts`：

```ts
// RevenueCat webhook：App Store / Google Play 的訂閱事件 → 寫入 subscriptions（service_role）。
// Secrets：REVENUECAT_WEBHOOK_SECRET、SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY
// 部署時用 --no-verify-jwt（RevenueCat 不會帶 Supabase JWT，改用共享密鑰 header 驗證）。
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// 事件 → 訂閱狀態。CANCELLATION 是「不再自動續訂」，期末前仍有權益，所以維持 active。
const EVENT_STATUS: Record<string, string> = {
  INITIAL_PURCHASE: "active",
  RENEWAL: "active",
  UNCANCELLATION: "active",
  PRODUCT_CHANGE: "active",
  SUBSCRIPTION_EXTENDED: "active",
  NON_RENEWING_PURCHASE: "active",
  CANCELLATION: "active",
  BILLING_ISSUE: "past_due",
  EXPIRATION: "canceled",
  REFUND: "canceled",
  SUBSCRIPTION_PAUSED: "canceled",
};

const STORE_SOURCE: Record<string, string> = {
  APP_STORE: "app_store",
  MAC_APP_STORE: "app_store",
  PLAY_STORE: "play_store",
};

Deno.serve(async (req) => {
  // 共享密鑰驗證（在 RevenueCat 後台 webhook 設定的 Authorization header 填同一個值）
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET") || "";
  if (!secret || req.headers.get("Authorization") !== secret) return new Response("unauthorized", { status: 401 });

  let ev: Record<string, unknown>;
  try {
    const body = await req.json();
    ev = (body.event || {}) as Record<string, unknown>;
  } catch (e) {
    return new Response("bad json: " + (e as Error).message, { status: 400 });
  }

  const type = String(ev.type || "");
  const userId = String(ev.app_user_id || "");
  const status = EVENT_STATUS[type];
  if (!status || !userId) return new Response("ignored", { status: 200 });   // 不認得的事件不當錯誤（RevenueCat 會重送）

  // 試用期：RevenueCat 用 period_type 標，狀態要是 trialing（前端與 is_premium() 都認 trialing）
  const isTrial = String(ev.period_type || "") === "TRIAL";
  const finalStatus = (status === "active" && isTrial) ? "trialing" : status;

  // 退款：立即失效（不留到期末）
  const expMs = Number(ev.expiration_at_ms || 0);
  const periodEnd = (type === "REFUND" || !expMs) ? null : new Date(expMs).toISOString();

  const { error } = await admin.rpc("upsert_subscription", {
    p_user: userId,
    p_source: STORE_SOURCE[String(ev.store || "")] || "app_store",
    p_status: finalStatus,
    p_period_end: type === "REFUND" ? new Date(0).toISOString() : periodEnd,
    p_entitlement: Array.isArray(ev.entitlement_ids) ? String((ev.entitlement_ids as string[])[0] || "premium") : "premium",
    p_tx: ev.transaction_id ? String(ev.transaction_id) : null,
  });
  if (error) { console.error("upsert_subscription failed", error); return new Response("db error", { status: 500 }); }
  return new Response("ok", { status: 200 });
});
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node scripts/tests/test-fixes.js`
Expected: 新增的 8 條 `✓ RC ...` 全過，其餘測試不變

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/revenuecat-webhook/index.ts scripts/tests/test-fixes.js
git commit -m "IAP：revenuecat-webhook Edge Function（事件→訂閱狀態，含試用與退款）"
```

---

### Task 4: `web/js/iap.js` — RevenueCat SDK 包裝層（含安全降級）

**Files:**
- Create: `web/js/iap.js`
- Modify: `web/js/config.js`（尾端追加開關）
- Modify: `web/index.html:482`（在 `premium.js` 之前載入 `iap.js`）
- Modify: `scripts/tests/test-fixes.js`（尾端追加）

- [ ] **Step 1: 先寫失敗的測試**

在 `scripts/tests/test-fixes.js` 尾端追加：

```js
// 13) IAP：非原生 / SDK 不存在 / 未啟用 → available() 為假且不拋錯（安全降級，網頁不受影響）
global.window = global.window || {};
delete global.window.Capacitor;
global.window.IAP_ENABLED = true;
eval(fs.readFileSync(web("iap.js"), "utf8") + "\n;globalThis.IAP = IAP;");
ok("IAP 非原生時 available() 為假", IAP.available() === false);
global.window.Capacitor = { isNativePlatform: () => true, Plugins: {} };          // 原生但沒有 Purchases 外掛
ok("IAP 原生但無 SDK → available() 為假", IAP.available() === false);
global.window.Capacitor = { isNativePlatform: () => true, Plugins: { Purchases: {} } };
global.window.IAP_ENABLED = false;                                                // 開關關閉
ok("IAP 未啟用 → available() 為假", IAP.available() === false);
global.window.IAP_ENABLED = true;
ok("IAP 原生＋有 SDK＋已啟用 → available() 為真", IAP.available() === true);
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node scripts/tests/test-fixes.js`
Expected: `ENOENT ... web/js/iap.js`

- [ ] **Step 3: 寫 `web/js/iap.js`**

```js
// 原生 App 內購（RevenueCat）：Apple StoreKit / Google Play Billing 的統一包裝。
// 網頁版永遠用不到（available() 為假），付費走 Stripe（premium.js）。
// 訂閱狀態的真相仍在 subscriptions 表——這裡只負責「買」與「回復」，狀態由 RevenueCat webhook 寫回。
const IAP = (() => {
  const ENTITLEMENT = "premium";
  let _configured = false, _offering = null;

  function plugin() {
    const w = (typeof window !== "undefined") ? window : {};
    return (w.Capacitor && w.Capacitor.Plugins && w.Capacitor.Plugins.Purchases) || null;
  }
  function native() {
    const w = (typeof window !== "undefined") ? window : {};
    return !!(w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform());
  }
  // 原生 App＋SDK 在＋後台已設定好，三者皆備才走 IAP；缺一律降級（原生顯示「即將開放」，絕不退回 Stripe）
  function available() {
    const w = (typeof window !== "undefined") ? window : {};
    return !!(w.IAP_ENABLED && native() && plugin());
  }
  function apiKey() {
    const w = window, ios = w.Capacitor && w.Capacitor.getPlatform && w.Capacitor.getPlatform() === "ios";
    return ios ? (w.REVENUECAT_IOS_KEY || "") : (w.REVENUECAT_ANDROID_KEY || "");
  }

  // 登入後呼叫：把 RevenueCat 的 app_user_id 綁成 Supabase user id，webhook 才對得回同一個人
  async function init(uid) {
    if (!available() || !uid) return false;
    const P = plugin();
    try {
      if (!_configured) { await P.configure({ apiKey: apiKey(), appUserID: uid }); _configured = true; }
      else await P.logIn({ appUserID: uid });
      return true;
    } catch (e) { return false; }
  }

  // 商店回傳的方案（含當地價格字串）：Apple 規定價格必須與商店一致，不能寫死 NT$60
  async function plans() {
    if (!available()) return null;
    try {
      const r = await plugin().getOfferings();
      const cur = r && r.offerings && r.offerings.current;
      if (!cur) return null;
      _offering = cur;
      const pick = k => {
        const p = cur.availablePackages.find(x => x.packageType === k);
        return p ? { pkg: p, price: (p.product && p.product.priceString) || "" } : null;
      };
      const month = pick("MONTHLY"), year = pick("ANNUAL");
      if (!month && !year) return null;
      return { month, year };
    } catch (e) { return null; }
  }

  // 回傳 "ok"（買到）/ "cancel"（使用者取消，不要 toast）/ "fail"
  async function purchase(plan) {
    if (!available()) return "fail";
    const ps = await plans(); if (!ps) return "fail";
    const target = (plan === "year" ? ps.year : ps.month) || ps.month || ps.year;
    if (!target) return "fail";
    try {
      const r = await plugin().purchasePackage({ aPackage: target.pkg });
      const ent = r && r.customerInfo && r.customerInfo.entitlements && r.customerInfo.entitlements.active;
      return (ent && ent[ENTITLEMENT]) ? "ok" : "fail";
    } catch (e) {
      if (e && (e.code === "1" || e.userCancelled || (e.message || "").toLowerCase().includes("cancel"))) return "cancel";
      return "fail";
    }
  }

  // 回復購買（Apple 審核必要項：換手機/重裝的人要能拿回訂閱）
  async function restore() {
    if (!available()) return false;
    try {
      const r = await plugin().restorePurchases();
      const ent = r && r.customerInfo && r.customerInfo.entitlements && r.customerInfo.entitlements.active;
      return !!(ent && ent[ENTITLEMENT]);
    } catch (e) { return false; }
  }

  // 管理訂閱：開系統的訂閱設定頁（原生不得開 Stripe portal）
  function manageUrl() {
    const w = window, ios = w.Capacitor && w.Capacitor.getPlatform && w.Capacitor.getPlatform() === "ios";
    return ios ? "itms-apps://apps.apple.com/account/subscriptions"
               : "https://play.google.com/store/account/subscriptions";
  }

  return { available, native, init, plans, purchase, restore, manageUrl };
})();
if (typeof module !== "undefined" && module.exports) module.exports = IAP;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node scripts/tests/test-fixes.js`
Expected: 新增的 4 條 `✓ IAP ...` 全過

- [ ] **Step 5: 加設定開關**

在 `web/js/config.js` 尾端（`window.STRIPE_ENABLED = true;` 之後）追加：

```js
// 原生 App 內購（RevenueCat）。網頁版不受影響（付費仍走 Stripe）。
// 商店產品與 RevenueCat 後台設好後把 IAP_ENABLED 設 true——設定步驟見 docs/iap-setup.md。
// 這兩把是「public SDK key」，可以放前端（不是密鑰）。
window.IAP_ENABLED = false;
window.REVENUECAT_IOS_KEY = "";
window.REVENUECAT_ANDROID_KEY = "";
```

- [ ] **Step 6: 載入 iap.js**

在 `web/index.html` 的 `<script src="js/premium.js"></script>`（第 482 行）**之前**插入一行：

```html
<script src="js/iap.js"></script>
```

- [ ] **Step 7: bump SW 版本並跑完整檢查**

把 `web/sw.js` 的 `const CACHE = "trail-tracker-vNNN";` 數字加一。

Run: `npm run check`
Expected: `✓ 檢查通過`

- [ ] **Step 8: Commit**

```bash
git add web/js/iap.js web/js/config.js web/index.html web/sw.js scripts/tests/test-fixes.js
git commit -m "IAP：新增 iap.js（RevenueCat 包裝層，未設定時安全降級）＋設定開關"
```

---

### Task 5: `premium.js` 依平台分流

**Files:**
- Modify: `web/js/premium.js:44-110`（`openUpgrade` / `startCheckout` / `openPortal`）
- Modify: `web/js/social/auth.js`（登入後呼叫 `IAP.init(uid)`）

**硬規則：原生 App 內任何情況都不得出現 Stripe 入口**（`IAP_ENABLED` 為假或 SDK 載入失敗時也一樣——那時顯示「付費功能即將開放，敬請期待」，這個字串 i18n 已有）。

- [ ] **Step 1: `startCheckout` 加原生分支**

把 `startCheckout` 開頭（現在是 `if (!window.STRIPE_ENABLED || !window.FUNCTIONS_URL) {...}`）改成：

```js
  async function startCheckout(plan) {
    // 原生 App：一律走 IAP（Apple/Google 規定 App 內數位功能不得用外部金流，用 Stripe 會被拒審）
    if (typeof IAP !== "undefined" && IAP.native()) {
      if (!IAP.available()) { if (typeof toast === "function") toast("付費功能即將開放，敬請期待"); return; }
      const r = await IAP.purchase(plan);
      if (r === "cancel") return;                                     // 使用者自己取消：安靜收工
      if (r !== "ok") { if (typeof toast === "function") toast("購買失敗，請稍後再試"); return; }
      if (typeof toast === "function") toast("付款完成，歡迎加入 Premium！");
      document.querySelector(".premium-mask")?.remove();
      pollUnlock();                                                    // webhook 有延遲 → 輪詢解鎖
      return;
    }
    if (!window.STRIPE_ENABLED || !window.FUNCTIONS_URL) { if (typeof toast === "function") toast("付費功能即將開放，敬請期待"); return; }
    // …以下維持原本的 Stripe 分支不動…
```

- [ ] **Step 2: 抽出 `pollUnlock()`（Stripe 與 IAP 共用），並讓 `handleReturn()` 改用它**

在 `handleReturn()` 上方新增：

```js
  // 付款完成 → webhook 寫入可能略有延遲：輪詢 subscriptions 直到解鎖（最多 6 次、每 2.5 秒）
  function pollUnlock(tries) {
    tries = tries || 0;
    refresh().then(on => {
      if (on) { try { document.querySelector('.tab[data-view="me"]')?.click(); } catch (e) { } return; }
      if (tries < 6) setTimeout(() => pollUnlock(tries + 1), 2500);
      else if (typeof toast === "function") toast("款項處理中，稍後自動生效");
    });
  }
```

並把 `handleReturn()` 裡原本的 `let tries = 0; const poll = () => {...}; poll();` 整段換成 `pollUnlock();`。

- [ ] **Step 3: `openPortal` 加原生分支**

在 `openPortal()` 最前面插入：

```js
  async function openPortal() {
    // 原生：開系統的訂閱管理頁（不能開 Stripe portal）
    if (typeof IAP !== "undefined" && IAP.native()) {
      const url = IAP.manageUrl();
      const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      if (B) { try { await B.open({ url }); return; } catch (e) { /* 落到 window.open */ } }
      window.open(url, "_system");
      return;
    }
    if (!window.FUNCTIONS_URL) return;
    // …以下維持原本的 Stripe portal 分支不動…
```

- [ ] **Step 4: 升級彈窗：原生用商店價格＋加「回復購買」鈕**

在 `openUpgrade()` 的 `ov.querySelector("#pmGo").addEventListener("click", () => startCheckout(plan));` 之後追加：

```js
    applyNative(ov);   // 原生：價格改用商店回傳的當地價格、補上「回復購買」
  }

  // 原生 App 專用的彈窗調整。Apple 要求：價格須與商店一致（不能寫死 NT$60）、必須提供回復購買。
  async function applyNative(ov) {
    if (typeof IAP === "undefined" || !IAP.native()) return;
    const go = ov.querySelector("#pmGo");
    if (!IAP.available()) {                       // 原生但 IAP 還沒設定好 → 不顯示任何付費入口（更不能退回 Stripe）
      ov.querySelector(".pm-plans")?.remove();
      ov.querySelector(".pm-fine")?.remove();
      if (go) { go.disabled = true; go.textContent = ttT("付費功能即將開放，敬請期待"); }
      return;
    }
    const ps = await IAP.plans();
    if (ps) {
      const m = ov.querySelector('.pm-plan[data-plan="month"] span');
      const y = ov.querySelector('.pm-plan[data-plan="year"] span');
      if (m && ps.month) m.textContent = ps.month.price;
      if (y && ps.year) y.textContent = ps.year.price;
    }
    const r = document.createElement("button");
    r.className = "link-btn pm-restore"; r.id = "pmRestore"; r.textContent = ttT("回復購買");
    ov.querySelector(".premium-card").insertBefore(r, ov.querySelector("#pmLater"));
    r.addEventListener("click", async () => {
      if (typeof toast === "function") toast(ttT("回復購買中…"));
      const on = await IAP.restore();
      if (on) { ov.remove(); pollUnlock(); }
      else if (typeof toast === "function") toast(ttT("找不到可回復的購買"));
    });
  }
```

- [ ] **Step 5: 登入後綁定 RevenueCat 的 app_user_id**

在 `web/js/social/auth.js` 的 `init()` 裡，`c.auth.onAuthStateChange(() => onChange());` 之後加：

```js
    // 原生 IAP：把 RevenueCat 的 app_user_id 綁成 Supabase user id（webhook 才對得回同一個人）
    c.auth.onAuthStateChange(async (_e, s) => {
      const uid = s && s.user ? s.user.id : null;
      if (uid && typeof IAP !== "undefined" && IAP.available()) { try { await IAP.init(uid); } catch (e) { /* */ } }
    });
```

- [ ] **Step 6: 補 i18n 字串（en + 23 語系）**

新增 3 條 key：`回復購買`、`回復購買中…`、`找不到可回復的購買`、`款項處理中，稍後自動生效`、`購買失敗，請稍後再試`（共 5 條）。

en 加在 `web/js/i18n.js` 的 Premium 區塊（約第 322 行，`"管理訂閱"` 那行附近）：

```js
    "回復購買": "Restore purchase", "回復購買中…": "Restoring…", "找不到可回復的購買": "No purchase to restore",
    "款項處理中，稍後自動生效": "Payment processing — it will activate shortly", "購買失敗，請稍後再試": "Purchase failed, please try again",
```

23 個語系檔（`web/js/i18n/*.js`）逐一補同樣 5 條 key。寫一支一次性腳本放 scratchpad（**不要**進版控），照 `web/js/i18n/` 的單行 `"key":"value"` 格式插入。

- [ ] **Step 7: 跑檢查（i18n 規則 H/H2 會擋漏翻）**

Run: `npm run check`
Expected: `✓ 檢查通過`。若出現 `[i18n:xx] 缺詞條`，表示某個語系檔漏了，補上再跑。

- [ ] **Step 8: bump SW 版本、Commit**

```bash
git add web/js/premium.js web/js/social/auth.js web/js/i18n.js web/js/i18n/ web/sw.js
git commit -m "IAP：premium.js 依平台分流（原生走 IAP、不出現 Stripe 入口、加回復購買）"
```

---

### Task 6: E2E — 模擬原生環境，確認 Stripe 入口不出現

**Files:**
- Modify: `scripts/e2e.js`（在既有測項之後追加）

- [ ] **Step 1: 寫失敗的測試**

在 `scripts/e2e.js` 既有測項之後、關閉瀏覽器之前追加：

```js
  // IAP：模擬原生 App（假 Capacitor + 假 Purchases 外掛）→ 升級彈窗不得出現 Stripe 入口、要有回復購買
  {
    const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p2.addInitScript(() => {
      try { localStorage.setItem("tt_onboarded_v2", "1"); } catch (e) { }
      window.Capacitor = {
        isNativePlatform: () => true, getPlatform: () => "ios",
        Plugins: { Purchases: {
          configure: async () => {}, logIn: async () => {},
          getOfferings: async () => ({ offerings: { current: { availablePackages: [
            { packageType: "MONTHLY", product: { priceString: "US$1.99" } },
            { packageType: "ANNUAL", product: { priceString: "US$19.99" } },
          ] } } }),
          purchasePackage: async () => ({ customerInfo: { entitlements: { active: { premium: {} } } } }),
          restorePurchases: async () => ({ customerInfo: { entitlements: { active: {} } } }),
        } },
      };
    });
    let stripeHit = false;
    p2.on("request", r => { if (r.url().includes("create-checkout")) stripeHit = true; });
    await p2.goto(`http://localhost:${PORT}/index.html`);
    await p2.waitForTimeout(2500);
    await p2.evaluate(() => { window.IAP_ENABLED = true; Premium.openUpgrade(); });
    await p2.waitForTimeout(1200);

    const priceM = await p2.locator('.pm-plan[data-plan="month"] span').innerText();
    if (!priceM.includes("US$1.99")) errors.push(`IAP: 原生價格未用商店回傳值（看到「${priceM}」）`);
    else console.log("✓ 原生：價格用商店回傳的當地價格");

    if (await p2.locator("#pmRestore").count() === 0) errors.push("IAP: 原生升級彈窗缺「回復購買」按鈕（Apple 常見退件原因）");
    else console.log("✓ 原生：有回復購買按鈕");

    await p2.click("#pmGo");
    await p2.waitForTimeout(1500);
    if (stripeHit) errors.push("IAP: 原生環境竟打了 Stripe create-checkout（會被 Apple 拒審）");
    else console.log("✓ 原生：購買未觸發 Stripe");
    await p2.close();
  }
```

- [ ] **Step 2: 跑 e2e 確認新測項通過**

Run: `LD_LIBRARY_PATH="$HOME/pw-libs/root/usr/lib/x86_64-linux-gnu" npm run e2e`
Expected: `✓ 原生：價格用商店回傳的當地價格`、`✓ 原生：有回復購買按鈕`、`✓ 原生：購買未觸發 Stripe`，最後 `✓ E2E 冒煙測試全部通過`

- [ ] **Step 3: Commit**

```bash
git add scripts/e2e.js
git commit -m "E2E：模擬原生環境驗證 IAP 分流（無 Stripe 入口、有回復購買、商店價格）"
```

---

### Task 7: 設定手冊與 backlog 收尾

**Files:**
- Create: `docs/iap-setup.md`
- Modify: `docs/optimization-backlog.md:6-10`（#1 條目）

- [ ] **Step 1: 寫 `docs/iap-setup.md`**

內容須涵蓋（每步都要能照做，不要寫「參考官方文件」了事）：

1. **安裝外掛**：`npm i @revenuecat/purchases-capacitor && npm run sync`
2. **App Store Connect**：建兩個 auto-renewable subscription（`tt_premium_month`、`tt_premium_year`，同一個 subscription group）、定價、7 天 introductory offer（free trial）、填 Localization 與審核截圖
3. **Google Play Console**：同樣兩個訂閱 ID、7 天試用
4. **RevenueCat**：建 project → 接 App Store（App-Specific Shared Secret / In-App Purchase Key）與 Play（Service Account JSON）→ 建 entitlement `premium` → 建 offering `default`，把兩個產品掛成 `$rc_monthly` / `$rc_annual` → 取 iOS/Android 的 **public SDK key**
5. **Supabase**：SQL Editor 跑 `schema-phase22-iap.sql`；部署 function 與密鑰：

```bash
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase secrets set REVENUECAT_WEBHOOK_SECRET="$(openssl rand -hex 24)"
```

6. **RevenueCat webhook**：URL 填 `https://<專案>.supabase.co/functions/v1/revenuecat-webhook`，Authorization header 填上一步產生的密鑰
7. **前端開關**：`web/js/config.js` 的 `IAP_ENABLED = true`、填入兩把 public SDK key
8. **沙盒測試（只有你能跑）**：
   - iOS：App Store Connect → Users and Access → Sandbox Testers 建測試帳號；TestFlight 裝 App，裝置「設定 → App Store → Sandbox Account」登入該帳號 → 購買 → 確認 App 內解鎖、Supabase `subscriptions` 出現 `source='app_store'` 的 row
   - 取消測試：沙盒訂閱續期被加速（1 個月 ≈ 5 分鐘），可觀察 `RENEWAL` / `EXPIRATION`
   - 回復測試：刪 App 重裝 → 點「回復購買」→ 應解鎖
   - Android：Play Console → License testing 加測試帳號，用 internal testing 軌道
9. **驗證防覆蓋規則**（貼進 SQL Editor）：

```sql
-- 假設 <uid> 已有一筆 source='app_store' 且 active 的訂閱：
select public.upsert_subscription('<uid>', 'stripe', 'canceled', now(), null, null, null, null);
select source, status from public.subscriptions where user_id = '<uid>';
-- 預期：仍是 app_store / active（Stripe 的取消事件不得砍掉 IAP 會員）
```

- [ ] **Step 2: 更新 backlog**

把 `docs/optimization-backlog.md` 的 #1 條目改成「程式碼已完成，剩商店/RevenueCat 後台設定與沙盒實測，步驟見 `docs/iap-setup.md`」。

- [ ] **Step 3: 最後全跑一次**

Run: `npm run check && LD_LIBRARY_PATH="$HOME/pw-libs/root/usr/lib/x86_64-linux-gnu" npm run e2e`
Expected: 兩者皆 `✓`

- [ ] **Step 4: Commit 並 push**

```bash
git add docs/iap-setup.md docs/optimization-backlog.md
git commit -m "IAP：設定手冊（商店產品、RevenueCat、webhook、沙盒測試）"
git push origin main
```

---

## 完成後的狀態

- 網頁 / PWA：付費行為與現在**完全一樣**（Stripe），`IAP_ENABLED=false` 不影響任何事
- 原生 App：升級走 IAP；後台還沒設好之前顯示「付費功能即將開放」，**不會**出現 Stripe 入口
- 使用者照 `docs/iap-setup.md` 建好商店產品與 RevenueCat、把 `IAP_ENABLED` 轉 true、重建 App → 沙盒實測

**仍需實機驗證（無法自動化）：** 真實購買、續訂、取消、退款、回復購買的完整流程。
