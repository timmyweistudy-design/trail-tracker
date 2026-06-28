# 社群功能 Phase 1（土台）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立社群功能的雲端土台 —— Supabase 專案、完整資料表 + RLS + 輔助函式、Google/Email 登入與 handle 註冊、個人頁、以及「社群」分頁外殼，讓基礎建設打通可運作。

**Architecture:** 前端（既有純 JS PWA）以 Supabase JS SDK 直連 Supabase（Auth + Postgres + Storage），權限由資料庫的 Row-Level Security 把關，不自建 API 伺服器。新增 `web/js/social/` 模組群與一個「社群」分頁。

**Tech Stack:** 原生 JS（IIFE 模組 + script 標籤，無建置流程）、Supabase（@supabase/supabase-js UMD，自我託管於 vendor/）、Postgres + RLS、Node 用於邏輯單元測試與既有 smoke harness。

設計來源：`docs/superpowers/specs/2026-06-28-social-feed-design.md`

---

## 前置說明：哪些是「使用者動作」

Phase 1 有三個步驟必須由**專案擁有者本人**在瀏覽器操作（無法用程式碼代勞），計畫中標記 **【USER ACTION】**。其餘為可實作/可測試的程式工作。建議順序：先做 Task 1–3（取得憑證、建好後端），再做 Task 4 起的前端（前端依賴真實 URL/anon key 才能整合測試；但 Task 5、6 的純邏輯/外殼可先平行進行）。

## 檔案結構（本階段建立/修改）

- 建立 `supabase/schema.sql` — 一次性資料庫遷移（表 + 函式 + RLS + storage bucket/policy）
- 建立 `web/vendor/supabase/supabase.js` — 自我託管的 supabase-js UMD
- 修改 `web/js/config.js` — 新增 `SUPABASE_URL` / `SUPABASE_ANON_KEY`
- 建立 `web/js/social/supa.js` — Supabase client 初始化 + session 輔助
- 建立 `web/js/social/handle.js` — handle 純驗證邏輯（可單元測試）
- 建立 `web/js/social/auth.js` — 登入/登出/session 監聽/onboarding 建檔
- 建立 `web/js/social/profiles.js` — 個人頁讀取/編輯/渲染
- 建立 `web/js/social/social-ui.js` — 社群分頁外殼、路由（登入 / 註冊 / 個人頁）
- 修改 `web/index.html` — 新增分頁按鈕、社群 section 容器、script 標籤
- 修改 `web/css/style.css` — 社群頁樣式
- 修改 `web/js/app.js` — 分頁切換掛勾 `social`
- 修改 `web/sw.js` — 快取新資產、bump 版本
- 建立 `scratchpad/test-handle.js` — handle 邏輯 node 測試
- 建立 `scratchpad/social-smoke.js` — 用 Supabase mock 驗證社群模組可載入
- 建立 `scratchpad/test-rls.js` — 對「實際」Supabase 的 RLS 整合測試（Task 1–3 完成後執行）

---

## Task 1: 【USER ACTION】建立 Supabase 專案並取得憑證

**Files:** 無（外部操作）

- [ ] **Step 1: 建立專案**

到 https://supabase.com → 用 GitHub/Google 登入 → 「New project」→ 名稱 `trail-tracker`、資料庫密碼自訂並記下、Region 選 `Northeast Asia (Tokyo)`（離台灣近）。等待 ~2 分鐘建立完成。

- [ ] **Step 2: 取得 URL 與 anon key**

專案 → Settings → API → 複製：
- `Project URL`（形如 `https://abcd1234.supabase.co`）
- `Project API keys` 的 **anon / public** 那把（**不是** service_role）。

把這兩個值交給實作者填入 `config.js`（Task 4）。

- [ ] **Step 3: 確認**

兩個值都拿到，且 anon key 開頭為 `eyJ...`（JWT）。**service_role key 絕不可外流或進前端。**

---

## Task 2: 套用資料庫結構（表 + 函式 + RLS + Storage）

**Files:**
- Create: `supabase/schema.sql`

- [ ] **Step 1: 寫遷移檔**

建立 `supabase/schema.sql`：

```sql
-- ===== 表 =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  handle text unique not null check (handle ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  bio text check (char_length(bio) <= 300),
  created_at timestamptz not null default now()
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  trail_id text,
  trail_name text,
  distance_km numeric,
  duration_ms bigint,
  ascent integer,
  hiked_on date,
  caption text check (char_length(caption) <= 2000),
  track jsonb,
  visibility text not null default 'friends' check (visibility in ('public','friends')),
  created_at timestamptz not null default now()
);

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  kind text not null check (kind in ('photo','video')),
  path text not null,
  thumb_path text,
  w integer, h integer, dur numeric,
  ord integer not null default 0
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

-- ===== 輔助函式 =====
create or replace function public.is_friend(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from follows where follower_id = a and following_id = b)
     and exists(select 1 from follows where follower_id = b and following_id = a);
$$;

create or replace function public.can_see_post(p_author uuid, p_visibility text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_visibility = 'public'
      or p_author = auth.uid()
      or (p_visibility = 'friends' and public.is_friend(auth.uid(), p_author));
$$;

-- ===== RLS =====
alter table public.profiles   enable row level security;
alter table public.follows    enable row level security;
alter table public.posts      enable row level security;
alter table public.post_media enable row level security;
alter table public.comments   enable row level security;
alter table public.likes      enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_insert on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy follows_select on public.follows for select to authenticated using (true);
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

create policy posts_select on public.posts for select to authenticated using (public.can_see_post(author_id, visibility));
create policy posts_insert on public.posts for insert to authenticated with check (author_id = auth.uid());
create policy posts_update on public.posts for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy posts_delete on public.posts for delete to authenticated using (author_id = auth.uid());

create policy post_media_select on public.post_media for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
create policy post_media_write on public.post_media for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()))
  with check (exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create policy comments_select on public.comments for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid() or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()));

create policy likes_select on public.likes for select to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
create policy likes_insert on public.likes for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.posts p where p.id = post_id and public.can_see_post(p.author_id, p.visibility)));
create policy likes_delete on public.likes for delete to authenticated using (user_id = auth.uid());

-- ===== Storage =====
insert into storage.buckets (id, name, public) values ('media','media', true) on conflict (id) do nothing;
create policy media_read on storage.objects for select using (bucket_id = 'media');
create policy media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 2:【USER ACTION】在 Supabase 執行**

Supabase 專案 → 左側 SQL Editor → New query → 貼上整個 `supabase/schema.sql` → Run。

- [ ] **Step 3: 驗證**

預期：執行成功無錯誤。Table Editor 應看到 `profiles / follows / posts / post_media / comments / likes` 六張表；Storage 應看到 `media` bucket（public）。

- [ ] **Step 4: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat(social): Supabase schema + RLS + storage for Phase 1"
```

---

## Task 3: 【USER ACTION】設定 Google 登入與 Redirect URL

**Files:** 無（外部操作）

- [ ] **Step 1: 啟用 Email 登入**

Supabase → Authentication → Providers → Email → 確認啟用（預設開）。Authentication → Providers → 確認 "Confirm email" 行為符合預期（magic link 寄送）。

- [ ] **Step 2: 建立 Google OAuth 用戶端**

Google Cloud Console（與現有 Places 同專案即可）→ APIs & Services → Credentials → Create OAuth client ID → Web application。
- Authorized redirect URIs 加入 Supabase 提供的回呼網址：`https://<你的專案>.supabase.co/auth/v1/callback`。
- 建立後取得 Client ID 與 Client Secret。

- [ ] **Step 3: 在 Supabase 填入 Google 憑證**

Supabase → Authentication → Providers → Google → 開啟 → 貼上 Client ID / Secret → Save。

- [ ] **Step 4: 設定站台 Redirect URL**

Supabase → Authentication → URL Configuration：
- Site URL：`https://trail-tracker-0ma5.onrender.com`
- Additional Redirect URLs 加入：`https://trail-tracker-0ma5.onrender.com`、`http://localhost:8080`（本機測試用，連接埠依你本機而定）。

- [ ] **Step 5: 驗證**

Authentication → Providers 顯示 Google 為 Enabled；URL Configuration 已含正式網址。

---

## Task 4: 自我託管 supabase-js 並接上 config + client

**Files:**
- Create: `web/vendor/supabase/supabase.js`
- Modify: `web/js/config.js`
- Create: `web/js/social/supa.js`

- [ ] **Step 1: 下載 supabase-js UMD**

Run:
```bash
cd /mnt/c/Users/timmy/projects/trail-tracker/web
mkdir -p vendor/supabase js/social
curl -L "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js" -o vendor/supabase/supabase.js
```
Expected: 檔案下載成功，大小 > 100KB。

- [ ] **Step 2: 驗證 UMD 全域**

Run:
```bash
node -e 'const w={}; global.window=w; global.self=w; require("/mnt/c/Users/timmy/projects/trail-tracker/web/vendor/supabase/supabase.js"); console.log("createClient:", typeof (w.supabase&&w.supabase.createClient));'
```
Expected: `createClient: function`（若印出 function 即代表 UMD 正常掛上 `window.supabase`）。

- [ ] **Step 3: 在 config.js 加入憑證**

修改 `web/js/config.js`，在檔尾加入（把 `<...>` 換成 Task 1 取得的值）：

```js
// Supabase（社群功能）。anon key 放前端是安全的：資料由 RLS 在資料庫層把關。
window.SUPABASE_URL = "https://<你的專案>.supabase.co";
window.SUPABASE_ANON_KEY = "<anon-public-key>";
```

- [ ] **Step 4: 建立 supa.js**

建立 `web/js/social/supa.js`：

```js
// Supabase client 單例 + session 輔助。沒有設定憑證時 ready() 回傳 false，社群分頁顯示「尚未啟用」。
const Supa = (() => {
  let client = null;
  function ready() { return !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient); }
  function client_() {
    if (client) return client;
    if (!ready()) return null;
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    return client;
  }
  async function user() {
    const c = client_(); if (!c) return null;
    const { data } = await c.auth.getUser();
    return data ? data.user : null;
  }
  return { ready, client: client_, user };
})();
if (typeof module !== "undefined") module.exports = Supa;
```

- [ ] **Step 5: Commit**

```bash
git add web/vendor/supabase/supabase.js web/js/config.js web/js/social/supa.js
git commit -m "feat(social): self-host supabase-js, add config + client singleton"
```

---

## Task 5: handle 驗證邏輯（純函式 + 單元測試）

**Files:**
- Create: `web/js/social/handle.js`
- Test: `scratchpad/test-handle.js`

- [ ] **Step 1: 寫失敗測試**

建立 `scratchpad/test-handle.js`：

```js
const Handle = require("/mnt/c/Users/timmy/projects/trail-tracker/web/js/social/handle.js");
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, "got", JSON.stringify(a)); process.exitCode = 1; } else console.log("ok", m); };

eq(Handle.validate("Tim_99").ok, true, "valid mixed→normalized");
eq(Handle.validate("Tim_99").handle, "tim_99", "normalized lowercase");
eq(Handle.validate("ab").ok, false, "too short");
eq(Handle.validate("a".repeat(21)).ok, false, "too long");
eq(Handle.validate("has space").ok, false, "no space");
eq(Handle.validate("王小明").ok, false, "no CJK");
eq(Handle.validate("  Hiker_Tim ").handle, "hiker_tim", "trim+lower");
console.log("done");
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-handle.js`
Expected: FAIL，`Cannot find module .../handle.js`。

- [ ] **Step 3: 實作 handle.js**

建立 `web/js/social/handle.js`：

```js
// handle 純驗證：3–20 字、小寫英數與底線。回傳 { ok, handle?, msg? }。
const Handle = (() => {
  const RE = /^[a-z0-9_]{3,20}$/;
  function normalize(s) { return (s || "").trim().toLowerCase(); }
  function validate(s) {
    const h = normalize(s);
    if (h.length < 3) return { ok: false, msg: "至少 3 個字" };
    if (h.length > 20) return { ok: false, msg: "最多 20 個字" };
    if (!RE.test(h)) return { ok: false, msg: "只能用小寫英文、數字、底線" };
    return { ok: true, handle: h };
  }
  return { normalize, validate, RE };
})();
if (typeof module !== "undefined") module.exports = Handle;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-handle.js`
Expected: 全部 `ok`，最後印 `done`，exit 0。

- [ ] **Step 5: Commit**

```bash
git add web/js/social/handle.js scratchpad/test-handle.js
git commit -m "feat(social): handle validation with unit tests"
```

---

## Task 6: 社群分頁外殼 + 導覽 + 路由骨架

**Files:**
- Modify: `web/index.html`（nav 與 view 容器、script 標籤）
- Create: `web/js/social/social-ui.js`
- Modify: `web/js/app.js`（分頁切換掛勾）

- [ ] **Step 1: 在 index.html 加入分頁按鈕**

修改 `web/index.html` 的 `<nav class="tabbar">`，在「我的」按鈕後加入：

```html
    <button class="tab" data-view="social">
      <svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.2"/><circle cx="17" cy="9" r="2.6"/><path d="M3.5 20c0-3.3 2.6-5.2 5.5-5.2s5.5 1.9 5.5 5.2"/><path d="M15.5 14.4c2.6.2 5 1.9 5 5.6"/></svg>社群
    </button>
```

- [ ] **Step 2: 在 index.html 加入 view 容器**

在 `<section id="view-me" ...>...</section>` 之後、`<nav class="tabbar">` 之前，加入：

```html
  <section id="view-social" class="view">
    <div class="social-head"><h2 class="view-title">社群</h2></div>
    <div id="socialBody"><div class="social-loading"><span class="spin"></span>載入中…</div></div>
  </section>
```

- [ ] **Step 3: 加入 script 標籤（順序很重要）**

修改 `web/index.html`，在 `<script src="js/app.js"></script>` 之**前**加入（supabase 與社群模組需先於 app.js 載入，app.js 才能掛勾）：

```html
<script src="vendor/supabase/supabase.js"></script>
<script src="js/social/supa.js"></script>
<script src="js/social/handle.js"></script>
<script src="js/social/auth.js"></script>
<script src="js/social/profiles.js"></script>
<script src="js/social/social-ui.js"></script>
```

> 註：`auth.js`、`profiles.js` 於 Task 7–9 建立；先加 script 標籤會在那之前造成 404。為避免破壞站台，**本 Task 先只加 `supa.js`、`handle.js`、`social-ui.js` 三行**，其餘兩行在 Task 7/9 各自加入。

實際本步驟加入：

```html
<script src="vendor/supabase/supabase.js"></script>
<script src="js/social/supa.js"></script>
<script src="js/social/handle.js"></script>
<script src="js/social/social-ui.js"></script>
```

- [ ] **Step 4: 建立 social-ui.js 外殼**

建立 `web/js/social/social-ui.js`：

```js
// 社群分頁外殼與路由：依登入/註冊狀態渲染對應畫面。Phase 1 路由：未啟用 / 登入 / 註冊 / 個人頁。
const SocialUI = (() => {
  const $ = s => document.querySelector(s);
  let mounted = false;

  function render(html) { const b = $("#socialBody"); if (b) b.innerHTML = html; }

  // 分頁第一次顯示時呼叫
  async function onShow() {
    if (!Supa.ready()) {
      render(`<div class="social-empty">社群功能尚未啟用（缺少 Supabase 設定）。</div>`);
      return;
    }
    if (!mounted) { mounted = true; if (typeof Auth !== "undefined") Auth.init(route); }
    route();
  }

  // 依目前 session / profile 決定畫面（Task 7–9 會填上各畫面）
  async function route() {
    if (typeof Auth === "undefined") { render(`<div class="social-empty">載入中…</div>`); return; }
    const sess = await Auth.session();
    if (!sess) { Auth.renderLogin(render); return; }
    const prof = await Auth.myProfile();
    if (!prof) { Auth.renderOnboarding(render); return; }
    if (typeof Profiles !== "undefined") Profiles.renderMe(render, prof);
    else render(`<div class="social-empty">嗨 @${prof.handle}</div>`);
  }

  return { onShow, route, render };
})();
```

- [ ] **Step 5: 在 app.js 掛勾分頁切換**

修改 `web/js/app.js` 的分頁切換處（`if (view === "me") {...}` 那一行之後）加入：

```js
    if (view === "social" && typeof SocialUI !== "undefined") SocialUI.onShow();
```

- [ ] **Step 6: 手動驗證**

Run: `cd /mnt/c/Users/timmy/projects/trail-tracker/web && python3 -m http.server 8080`（或既有本機伺服器），瀏覽器開 `http://localhost:8080`，點底部「社群」。
Expected: 顯示登入畫面（若 Auth 已做）或「載入中…」；無 console 例外、其他分頁仍正常。

- [ ] **Step 7: Commit**

```bash
git add web/index.html web/js/social/social-ui.js web/js/app.js
git commit -m "feat(social): add 社群 tab shell + routing skeleton"
```

---

## Task 7: 登入畫面 + session 監聽（Google / Email）

**Files:**
- Create: `web/js/social/auth.js`
- Modify: `web/index.html`（加入 `auth.js` script 標籤）

- [ ] **Step 1: 建立 auth.js（登入與 session 部分）**

建立 `web/js/social/auth.js`：

```js
// 認證流程：Google OAuth / Email 魔法連結、session 取得、profile 讀取、onboarding 建檔。
const Auth = (() => {
  let onChange = () => {};

  function init(cb) {
    onChange = cb || (() => {});
    const c = Supa.client(); if (!c) return;
    c.auth.onAuthStateChange(() => onChange());   // 登入/登出/回呼後重新路由
  }

  async function session() {
    const c = Supa.client(); if (!c) return null;
    const { data } = await c.auth.getSession();
    return data ? data.session : null;
  }

  async function signInGoogle() {
    const c = Supa.client(); if (!c) return;
    await c.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } });
  }

  async function signInEmail(email) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    return { error: error ? error.message : null };
  }

  async function signOut() { const c = Supa.client(); if (c) await c.auth.signOut(); }

  function renderLogin(render) {
    render(`
      <div class="social-auth">
        <div class="auth-logo">⛰️</div>
        <h3>加入山友社群</h3>
        <p class="auth-sub">分享你的步道旅行，看看好友走過哪裡。</p>
        <button class="btn primary" id="authGoogle">使用 Google 繼續</button>
        <div class="auth-or">或</div>
        <input type="email" id="authEmail" class="auth-input" placeholder="輸入 Email 收登入連結" inputmode="email">
        <button class="btn ghost" id="authEmailBtn">寄送登入連結</button>
        <div class="auth-msg" id="authMsg"></div>
      </div>`);
    document.getElementById("authGoogle").addEventListener("click", signInGoogle);
    document.getElementById("authEmailBtn").addEventListener("click", async () => {
      const email = (document.getElementById("authEmail").value || "").trim();
      const msg = document.getElementById("authMsg");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { msg.textContent = "請輸入有效的 Email"; return; }
      msg.textContent = "寄送中…";
      const { error } = await signInEmail(email);
      msg.textContent = error ? ("寄送失敗：" + error) : "已寄出！請到信箱點連結登入。";
    });
  }

  // Task 8 會補上 myProfile / renderOnboarding / createProfile
  async function myProfile() { return await _fetchMyProfile(); }
  async function _fetchMyProfile() {
    const c = Supa.client(); if (!c) return null;
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return null;
    const { data } = await c.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
    return data || null;
  }

  return { init, session, signInGoogle, signInEmail, signOut, renderLogin, myProfile, _fetchMyProfile };
})();
```

- [ ] **Step 2: 加入 auth.js script 標籤**

修改 `web/index.html`，在 `<script src="js/social/handle.js"></script>` 之後加入：

```html
<script src="js/social/auth.js"></script>
```

- [ ] **Step 3: 確認 social-smoke（暫以 syntax + 載入檢查）**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/auth.js`
Expected: 無輸出（語法 OK）。

- [ ] **Step 4: 手動驗證登入**

本機開站 → 社群分頁 → 應看到登入畫面。點「使用 Google 繼續」→ 完成 Google 流程後跳回，`onAuthStateChange` 觸發 route()。
Expected: 登入後畫面從登入切換為「載入中/註冊」（profile 尚未建立 → 進 onboarding，Task 8 完成後才完整）。

- [ ] **Step 5: Commit**

```bash
git add web/js/social/auth.js web/index.html
git commit -m "feat(social): login screen (Google + email magic link) + session"
```

---

## Task 8: 註冊引導（handle 可用性檢查 + 建立 profile）

**Files:**
- Modify: `web/js/social/auth.js`（補 onboarding）

- [ ] **Step 1: 補 onboarding 到 auth.js**

修改 `web/js/social/auth.js`，在 `return {` 之前插入：

```js
  // 檢查 handle 是否已被使用（RLS 允許登入者讀所有 profiles）
  async function handleTaken(h) {
    const c = Supa.client(); if (!c) return false;
    const { data } = await c.from("profiles").select("id").eq("handle", h).maybeSingle();
    return !!data;
  }

  async function createProfile({ handle, display_name, avatar_url, bio }) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "no-user" };
    const { error } = await c.from("profiles").insert({
      id: u.user.id, handle, display_name: display_name || null, avatar_url: avatar_url || null, bio: bio || null,
    });
    return { error: error ? error.message : null };
  }

  function renderOnboarding(render) {
    const c = Supa.client();
    let meta = {};
    if (c) c.auth.getUser().then(({ data }) => {
      meta = (data && data.user && data.user.user_metadata) || {};
      const dn = document.getElementById("obName"); if (dn && !dn.value) dn.value = meta.full_name || meta.name || "";
    });
    render(`
      <div class="social-auth">
        <h3>建立你的山友檔案</h3>
        <label class="ob-l">帳號 handle（給朋友搜尋你）</label>
        <input id="obHandle" class="auth-input" placeholder="例如 hiker_tim" autocapitalize="off" autocomplete="off">
        <div class="auth-msg" id="obHandleMsg"></div>
        <label class="ob-l">顯示名稱</label>
        <input id="obName" class="auth-input" placeholder="你的名字">
        <label class="ob-l">簡介（選填）</label>
        <input id="obBio" class="auth-input" placeholder="一句話介紹自己">
        <button class="btn primary" id="obSave">完成，開始使用</button>
        <div class="auth-msg" id="obMsg"></div>
      </div>`);
    const hEl = document.getElementById("obHandle");
    const hMsg = document.getElementById("obHandleMsg");
    let t = null, lastOk = false;
    hEl.addEventListener("input", () => {
      clearTimeout(t); lastOk = false;
      const v = Handle.validate(hEl.value);
      if (!v.ok) { hMsg.textContent = v.msg; hMsg.className = "auth-msg bad"; return; }
      hMsg.textContent = "檢查中…"; hMsg.className = "auth-msg";
      t = setTimeout(async () => {
        const taken = await handleTaken(v.handle);
        if (taken) { hMsg.textContent = "這個 handle 已被使用"; hMsg.className = "auth-msg bad"; }
        else { hMsg.textContent = "可以使用 ✓"; hMsg.className = "auth-msg ok"; lastOk = true; }
      }, 350);
    });
    document.getElementById("obSave").addEventListener("click", async () => {
      const v = Handle.validate(hEl.value);
      const msg = document.getElementById("obMsg");
      if (!v.ok) { msg.textContent = v.msg; return; }
      if (!lastOk) { msg.textContent = "請確認 handle 可用"; return; }
      msg.textContent = "建立中…";
      const r = await createProfile({
        handle: v.handle,
        display_name: (document.getElementById("obName").value || "").trim(),
        avatar_url: ((meta && (meta.avatar_url || meta.picture)) || null),
        bio: (document.getElementById("obBio").value || "").trim(),
      });
      if (r.error) { msg.textContent = "建立失敗：" + (/duplicate|unique/i.test(r.error) ? "handle 已被使用" : r.error); return; }
      onChange();   // profile 建好 → 重新路由到個人頁
    });
  }
```

並把 `return { ... }` 那行補上新導出：

```js
  return { init, session, signInGoogle, signInEmail, signOut, renderLogin, myProfile, _fetchMyProfile, handleTaken, createProfile, renderOnboarding };
```

- [ ] **Step 2: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/auth.js`
Expected: 無輸出（OK）。

- [ ] **Step 3: 手動驗證註冊**

登入後（無 profile）→ 進註冊畫面 → 輸入 handle，觀察即時「可以使用 ✓ / 已被使用」→ 填名稱 → 完成。
Expected: profiles 表新增一列（Supabase Table Editor 可見）；畫面路由到個人頁（Task 9）。重複 handle 會被擋。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/auth.js
git commit -m "feat(social): onboarding — handle availability check + create profile"
```

---

## Task 9: 個人頁（檢視 / 編輯）

**Files:**
- Create: `web/js/social/profiles.js`
- Modify: `web/index.html`（加入 `profiles.js` script 標籤）

- [ ] **Step 1: 建立 profiles.js**

建立 `web/js/social/profiles.js`：

```js
// 個人頁：Phase 1 先做「自己的」檢視與編輯（貼文牆於 Phase 2 接上）。
const Profiles = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  function renderMe(render, prof) {
    const av = prof.avatar_url
      ? `<img class="pf-av" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    render(`
      <div class="pf">
        <div class="pf-top">${av}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}</div>
            <div class="pf-handle">@${esc(prof.handle)}</div></div>
        </div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        <div class="pf-actions">
          <button class="btn ghost" id="pfEdit">編輯檔案</button>
          <button class="btn ghost" id="pfSignout">登出</button>
        </div>
        <div class="pf-posts-empty">尚未有貼文（Phase 2 開放分享步道旅行）。</div>
      </div>`);
    document.getElementById("pfSignout").addEventListener("click", async () => { await Auth.signOut(); SocialUI.route(); });
    document.getElementById("pfEdit").addEventListener("click", () => renderEdit(render, prof));
  }

  function renderEdit(render, prof) {
    render(`
      <div class="social-auth">
        <h3>編輯檔案</h3>
        <label class="ob-l">顯示名稱</label>
        <input id="edName" class="auth-input" value="${esc(prof.display_name || "")}">
        <label class="ob-l">簡介</label>
        <input id="edBio" class="auth-input" value="${esc(prof.bio || "")}">
        <button class="btn primary" id="edSave">儲存</button>
        <button class="btn ghost" id="edCancel">取消</button>
        <div class="auth-msg" id="edMsg"></div>
      </div>`);
    document.getElementById("edCancel").addEventListener("click", () => renderMe(render, prof));
    document.getElementById("edSave").addEventListener("click", async () => {
      const c = Supa.client(); const msg = document.getElementById("edMsg");
      const display_name = (document.getElementById("edName").value || "").trim();
      const bio = (document.getElementById("edBio").value || "").trim();
      if (bio.length > 300) { msg.textContent = "簡介請少於 300 字"; return; }
      msg.textContent = "儲存中…";
      const { error } = await c.from("profiles").update({ display_name, bio }).eq("id", prof.id);
      if (error) { msg.textContent = "儲存失敗：" + error.message; return; }
      renderMe(render, Object.assign({}, prof, { display_name, bio }));
    });
  }

  return { renderMe, renderEdit };
})();
```

- [ ] **Step 2: 加入 profiles.js script 標籤**

修改 `web/index.html`，在 `<script src="js/social/auth.js"></script>` 之後加入：

```html
<script src="js/social/profiles.js"></script>
```

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/profiles.js`
Expected: 無輸出（OK）。

- [ ] **Step 4: 手動驗證**

註冊完成 → 個人頁顯示頭像/名稱/@handle → 點「編輯檔案」改名稱/簡介 → 儲存 → 立即反映。登出 → 回到登入畫面。
Expected: 編輯後 Supabase profiles 該列更新；登出後 session 清除。

- [ ] **Step 5: Commit**

```bash
git add web/js/social/profiles.js web/index.html
git commit -m "feat(social): own profile view + edit"
```

---

## Task 10: 社群樣式 + smoke + SW 快取 + RLS 整合測試

**Files:**
- Modify: `web/css/style.css`
- Create: `scratchpad/social-smoke.js`
- Modify: `web/sw.js`
- Create: `scratchpad/test-rls.js`

- [ ] **Step 1: 加入社群樣式**

在 `web/css/style.css` 末端加入：

```css
/* ===== 社群 ===== */
.social-head { padding: 16px 16px 4px; }
.view-title { font-family: var(--serif); font-size: 22px; font-weight: 700; }
#socialBody { padding: 8px 16px 90px; }
.social-loading, .social-empty, .pf-posts-empty { text-align: center; color: var(--ink-soft); padding: 40px 20px; }
.social-auth { max-width: 360px; margin: 24px auto; display: flex; flex-direction: column; gap: 10px; }
.auth-logo { font-size: 44px; text-align: center; }
.social-auth h3 { font-family: var(--serif); font-size: 20px; text-align: center; }
.auth-sub { text-align: center; color: var(--ink-soft); font-size: 13px; margin-bottom: 8px; }
.auth-or { text-align: center; color: var(--ink-soft); font-size: 12px; margin: 4px 0; }
.auth-input { padding: 11px 13px; border: 1px solid var(--line); border-radius: var(--r-sm); font-size: 15px; background: var(--card); color: var(--ink); }
.auth-msg { font-size: 12px; color: var(--ink-soft); min-height: 16px; }
.auth-msg.ok { color: #2f7d4a; } .auth-msg.bad { color: var(--danger); }
.ob-l { font-size: 12px; color: var(--ink-soft); margin-top: 6px; }
.pf { max-width: 480px; margin: 12px auto; }
.pf-top { display: flex; align-items: center; gap: 14px; }
.pf-av { width: 64px; height: 64px; border-radius: 50%; object-fit: cover; }
.pf-av-ph { display: flex; align-items: center; justify-content: center; background: var(--accent); color: #fff; font-size: 26px; font-family: var(--serif); }
.pf-name { font-family: var(--serif); font-size: 18px; font-weight: 700; }
.pf-handle { color: var(--ink-soft); font-size: 13px; }
.pf-bio { margin: 12px 0; line-height: 1.6; }
.pf-actions { display: flex; gap: 8px; margin: 12px 0; }
```

- [ ] **Step 2: 建立 social-smoke.js（模組載入 + mock Supabase）**

建立 `scratchpad/social-smoke.js`：

```js
// 用 vm 在假 DOM/Supabase 下載入社群模組，確認不丟例外。
const fs = require("fs"), vm = require("vm"), path = require("path");
const W = "/mnt/c/Users/timmy/projects/trail-tracker/web";
const el = () => ({ innerHTML: "", value: "", className: "", textContent: "", style: {}, addEventListener() {}, focus() {}, classList: { add() {}, remove() {}, contains: () => false } });
const sandbox = {
  console,
  document: { querySelector: () => el(), getElementById: () => el(), createElement: el, addEventListener() {} },
  location: { origin: "http://x", pathname: "/" },
  setTimeout, clearTimeout,
  window: {
    SUPABASE_URL: "http://x", SUPABASE_ANON_KEY: "y",
    supabase: { createClient: () => ({ auth: { onAuthStateChange() {}, getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), signInWithOAuth: async () => ({}), signInWithOtp: async () => ({ error: null }), signOut: async () => ({}) }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }), insert: async () => ({ error: null }), update: () => ({ eq: async () => ({ error: null }) }) }) }) },
  },
};
sandbox.global = sandbox; sandbox.self = sandbox.window;
const ctx = vm.createContext(sandbox);
for (const f of ["js/social/supa.js", "js/social/handle.js", "js/social/auth.js", "js/social/profiles.js", "js/social/social-ui.js"]) {
  try { vm.runInContext(fs.readFileSync(path.join(W, f), "utf8"), ctx, { filename: f }); console.log("loaded", f); }
  catch (e) { console.error("THREW in", f, e.message); process.exitCode = 1; }
}
console.log("ALL SOCIAL MODULES LOADED ✓");
```

- [ ] **Step 3: 跑 smoke**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/social-smoke.js`
Expected: 每個檔 `loaded ...`，最後 `ALL SOCIAL MODULES LOADED ✓`，exit 0。

- [ ] **Step 4: 更新 service worker 快取**

修改 `web/sw.js`：
1. bump `CACHE` 版本號（例如 `v109` → `v110`）。
2. 在 `ASSETS` 陣列加入：

```js
  "./vendor/supabase/supabase.js",
  "./js/social/supa.js", "./js/social/handle.js", "./js/social/auth.js",
  "./js/social/profiles.js", "./js/social/social-ui.js",
```

- [ ] **Step 5: 建立 RLS 整合測試（對真實 Supabase）**

建立 `scratchpad/test-rls.js`（需 Task 1–3 完成；用兩個測試帳號驗證權限）：

```js
// RLS 整合測試：驗證非好友看不到 friends 貼文、不能改他人資料。
// 用法：先在 Supabase Auth 建兩個測試 Email 帳號並登入取得 access token，
// 或用 service_role 在本機腳本建立 session（勿提交金鑰）。
// 這是「對真實後端」的煙霧測試，於本機手動執行，不進 CI。
const { createClient } = require("/mnt/c/Users/timmy/projects/trail-tracker/web/vendor/supabase/supabase.js").supabase
  || require("@supabase/supabase-js");
const URL = process.env.SB_URL, KEY = process.env.SB_ANON;
if (!URL || !KEY) { console.error("set SB_URL / SB_ANON env"); process.exit(1); }

(async () => {
  const a = createClient(URL, KEY), b = createClient(URL, KEY);
  await a.auth.signInWithPassword({ email: process.env.SB_A_EMAIL, password: process.env.SB_A_PW });
  await b.auth.signInWithPassword({ email: process.env.SB_B_EMAIL, password: process.env.SB_B_PW });
  const { data: au } = await a.auth.getUser();
  // A 發一篇 friends 貼文
  const { data: post, error: pe } = await a.from("posts").insert({ author_id: au.user.id, trail_name: "測試", visibility: "friends" }).select().single();
  if (pe) { console.error("A insert post failed", pe.message); process.exit(1); }
  // B（非好友）不應讀到
  const { data: seen } = await b.from("posts").select("id").eq("id", post.id).maybeSingle();
  console.log(seen ? "FAIL: 非好友讀到了 friends 貼文" : "ok: 非好友讀不到 friends 貼文");
  // B 不應改 A 的 profile
  const { error: ue } = await b.from("profiles").update({ bio: "hacked" }).eq("id", au.user.id);
  console.log(ue ? "ok: 不能改他人 profile" : "FAIL: 改到他人 profile 了");
  // 清理
  await a.from("posts").delete().eq("id", post.id);
})();
```

- [ ] **Step 6:【USER ACTION / 手動】執行 RLS 整合測試**

在 Supabase Auth 建立兩個測試帳號（A、B，互不追蹤），設環境變數後：
Run:
```bash
SB_URL=... SB_ANON=... SB_A_EMAIL=... SB_A_PW=... SB_B_EMAIL=... SB_B_PW=... \
  node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-rls.js
```
Expected：兩行皆 `ok:`（非好友讀不到 friends 貼文、不能改他人 profile）。

- [ ] **Step 7: Commit + 部署**

```bash
git add web/css/style.css web/sw.js scratchpad/social-smoke.js scratchpad/test-rls.js
git commit -m "feat(social): styles + module smoke + RLS integration test + SW cache (Phase 1 complete)"
git push origin main
```

---

## Phase 1 完成驗收

- [ ] 社群分頁可開，未登入顯示登入畫面。
- [ ] Google 與 Email 登入皆可成功（實機含 iOS standalone）。
- [ ] 首次登入可設定唯一 handle（即時可用性檢查、重複被擋）。
- [ ] 個人頁顯示資料、可編輯名稱/簡介、可登出。
- [ ] `social-smoke.js`、`test-handle.js` 通過；`test-rls.js` 兩項權限驗證通過。
- [ ] 其他分頁（探索/記錄/我的）功能不受影響。

---

## Self-Review 紀錄

- **Spec coverage**：Phase 1 範圍（Supabase 專案、表+RLS+函式、Google/Email 登入+handle 註冊、profiles、個人頁、社群分頁外殼）皆有對應 Task 1–10。posts/media/comments/likes 表雖屬 Phase 2 功能，但 schema 於 Task 2 一次建立（符合設計「Phase 1 含資料表+RLS」）。
- **Placeholder scan**：各步驟均含實際 SQL/JS/指令；無 TODO/TBD。`auth.js` 分兩個 Task 漸進（Task 7 登入、Task 8 onboarding），導出清單在 Task 8 補齊。
- **Type consistency**：`Supa.client()`、`Auth.session()/myProfile()/renderLogin/renderOnboarding/signOut`、`Profiles.renderMe(render, prof)`、`SocialUI.onShow/route/render`、`Handle.validate().handle` 在各 Task 間命名一致。script 載入順序（supabase → supa → handle → auth → profiles → social-ui → app）已於 Task 6/7/9 對齊。
