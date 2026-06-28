# 社群功能 Phase 2（社群核心）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 1 土台上，加入發文（把健行記錄＋照片分享成貼文）、動態牆（好友／探索）、追蹤與搜尋、貼文詳情、留言、按讚，讓社群實際可用。

**Architecture:** 前端 JS 模組（`web/js/social/`）以 Supabase SDK 直連，RLS 把關。新增資料層（media/posts）、UI 層（composer/feed/postview/discover），並把社群分頁登入後的主畫面改為「動態／探索／搜尋／我的」子分頁。動態牆查詢用 PostgREST 內嵌（posts→profiles、post_media、likes/comments 計數）。

**Tech Stack:** 原生 JS（IIFE 模組）、Supabase（@supabase/supabase-js）、Canvas（前端照片壓縮）、Postgres + RLS、Node 單元測試與 vm smoke harness。

設計來源：`docs/superpowers/specs/2026-06-28-social-feed-design.md`。前置：Phase 1 已完成（Supabase 已設定、6 張表 + RLS 已建立）。

---

## 檔案結構（本階段建立/修改）

- 建立 `supabase/schema-phase2.sql` — 內嵌用外鍵 + 效能索引（USER ACTION 執行）
- 建立 `web/js/social/media.js` — 照片壓縮/縮圖、影片封面、上傳 Storage
- 建立 `web/js/social/posts.js` — 建立貼文、取動態牆、使用者貼文、按讚（資料層）
- 建立 `web/js/social/composer.js` — 「分享到社群」發文視窗
- 建立 `web/js/social/feed.js` — 動態牆（好友/探索）與貼文卡片
- 建立 `web/js/social/postview.js` — 貼文詳情 + 留言 + 按讚
- 建立 `web/js/social/discover.js` — 搜尋使用者、追蹤/取消、他人個人頁
- 修改 `web/js/social/social-ui.js` — 登入後子分頁路由（動態/探索/搜尋/我的）
- 修改 `web/js/social/profiles.js` — 個人頁串接貼文牆
- 修改 `web/js/app.js` — 健行總結頁加「分享到社群」按鈕
- 修改 `web/index.html` — 載入新模組 script
- 修改 `web/css/style.css` — 社群 Phase 2 樣式
- 修改 `web/sw.js` — 快取新資產、bump 版本
- 建立 `scratchpad/test-media.js` — targetSize 純函式測試
- 修改 `scratchpad/social-smoke.js` — 納入新模組

---

## Task 1: 【USER ACTION】Phase 2 資料庫遷移（內嵌外鍵 + 索引）

**Files:**
- Create: `supabase/schema-phase2.sql`

- [ ] **Step 1: 寫遷移檔**

建立 `supabase/schema-phase2.sql`：

```sql
-- 讓 PostgREST 能從 posts/comments 內嵌 profiles（embed），並加查詢索引。可重複執行。
alter table public.posts drop constraint if exists posts_author_profile_fk;
alter table public.posts add constraint posts_author_profile_fk
  foreign key (author_id) references public.profiles(id) on delete cascade;

alter table public.comments drop constraint if exists comments_author_profile_fk;
alter table public.comments add constraint comments_author_profile_fk
  foreign key (author_id) references public.profiles(id) on delete cascade;

create index if not exists idx_posts_created   on public.posts (created_at desc);
create index if not exists idx_posts_author    on public.posts (author_id, created_at desc);
create index if not exists idx_posts_vis       on public.posts (visibility, created_at desc);
create index if not exists idx_comments_post   on public.comments (post_id, created_at);
create index if not exists idx_likes_post      on public.likes (post_id);
create index if not exists idx_follows_following on public.follows (following_id);
```

- [ ] **Step 2:【USER ACTION】在 Supabase 執行**

Supabase → SQL Editor → New query → 貼上整個 `schema-phase2.sql` → Run。

- [ ] **Step 3: 驗證**

預期成功無錯誤。可在 SQL Editor 跑 `select conname from pg_constraint where conname = 'posts_author_profile_fk';`，應回一列。

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-phase2.sql
git commit -m "feat(social): Phase 2 schema — embed FKs + indexes"
```

---

## Task 2: media.js（照片壓縮/縮圖/上傳）+ 單元測試

**Files:**
- Create: `web/js/social/media.js`
- Test: `scratchpad/test-media.js`

- [ ] **Step 1: 寫 targetSize 失敗測試**

建立 `scratchpad/test-media.js`：

```js
const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(__dirname + "/../web/js/social/media.js", "utf8");
const ctx = { module: {}, document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) }, URL: {}, Image: function () {} };
vm.createContext(ctx); vm.runInContext(src, ctx);
const Media = ctx.module.exports;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, "got", JSON.stringify(a)); process.exitCode = 1; } else console.log("ok", m); };

eq(Media.targetSize(800, 600, 1600), { w: 800, h: 600 }, "small unchanged");
eq(Media.targetSize(3200, 2400, 1600), { w: 1600, h: 1200 }, "landscape scaled to long edge");
eq(Media.targetSize(2400, 3200, 1600), { w: 1200, h: 1600 }, "portrait scaled to long edge");
eq(Media.targetSize(400, 4000, 400), { w: 40, h: 400 }, "tall scaled");
console.log("done");
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-media.js`
Expected: FAIL，找不到 media.js。

- [ ] **Step 3: 實作 media.js**

建立 `web/js/social/media.js`：

```js
// 媒體處理：照片壓縮 + 縮圖（Canvas）、影片首幀封面、上傳 Supabase Storage。
const Media = (() => {
  // 依長邊上限計算縮放後尺寸（純函式，可測）
  function targetSize(w, h, max) {
    if (w <= max && h <= max) return { w, h };
    const s = max / Math.max(w, h);
    return { w: Math.round(w * s), h: Math.round(h * s) };
  }
  function loadImage(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("image load failed")); };
      img.src = url;
    });
  }
  async function drawJpeg(img, maxLong, quality) {
    const { w, h } = targetSize(img.naturalWidth, img.naturalHeight, maxLong);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").drawImage(img, 0, 0, w, h);
    return await new Promise(r => c.toBlob(r, "image/jpeg", quality));
  }
  // File（圖片）→ { main, thumb, w, h }
  async function compressImage(file, maxLong = 1600, thumbLong = 400, quality = 0.8) {
    const img = await loadImage(file);
    const main = await drawJpeg(img, maxLong, quality);
    const thumb = await drawJpeg(img, thumbLong, quality);
    return { main, thumb, w: img.naturalWidth, h: img.naturalHeight };
  }
  // File（影片）→ 首幀封面 blob（失敗回 null）
  function videoPoster(file) {
    return new Promise((res) => {
      const v = document.createElement("video");
      v.preload = "metadata"; v.muted = true; v.playsInline = true;
      v.onloadeddata = () => {
        try {
          const c = document.createElement("canvas");
          const s = targetSize(v.videoWidth, v.videoHeight, 800);
          c.width = s.w; c.height = s.h;
          c.getContext("2d").drawImage(v, 0, 0, s.w, s.h);
          c.toBlob(b => { URL.revokeObjectURL(v.src); res(b); }, "image/jpeg", 0.8);
        } catch { res(null); }
      };
      v.onerror = () => res(null);
      v.src = URL.createObjectURL(file);
      v.currentTime = 0.1;
    });
  }
  async function upload(userId, postId, blob, name) {
    const c = Supa.client();
    const path = `${userId}/${postId}/${name}`;
    const { error } = await c.storage.from("media").upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true });
    if (error) throw error;
    return path;
  }
  function publicUrl(path) {
    if (!path) return "";
    const c = Supa.client(); if (!c) return "";
    return c.storage.from("media").getPublicUrl(path).data.publicUrl;
  }
  return { targetSize, compressImage, videoPoster, upload, publicUrl };
})();
if (typeof module !== "undefined") module.exports = Media;
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-media.js`
Expected: 全 `ok`，印 `done`，exit 0。

- [ ] **Step 5: Commit**

```bash
git add web/js/social/media.js scratchpad/test-media.js
git commit -m "feat(social): media compress/thumbnail/upload + targetSize unit test"
```

---

## Task 3: posts.js（資料層：建貼文 / 動態牆 / 按讚）

**Files:**
- Create: `web/js/social/posts.js`

- [ ] **Step 1: 建立 posts.js**

建立 `web/js/social/posts.js`：

```js
// 貼文資料層：從健行記錄建立貼文（含上傳照片）、取動態牆、使用者貼文、按讚。
const Posts = (() => {
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function toGeo(track) {
    if (!track || !track.length) return null;
    return { type: "LineString", coordinates: track.map(p => [p.lon, p.lat]) };
  }

  // 從健行記錄 rec + 選好的檔案建立貼文。回傳 { id } 或 { error }。
  async function createFromRecord(rec, opts) {
    const { caption, visibility, files } = opts || {};
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "not-signed-in" };
    const uid = u.user.id, postId = uuid();
    const { error: pe } = await c.from("posts").insert({
      id: postId, author_id: uid,
      trail_id: rec.trailId || null, trail_name: rec.trailName || "自由路線",
      distance_km: rec.distanceKm != null ? rec.distanceKm : null,
      duration_ms: rec.elapsedMs != null ? rec.elapsedMs : null,
      ascent: rec.ascent != null ? rec.ascent : null,
      hiked_on: (rec.date || new Date().toISOString()).slice(0, 10),
      caption: caption || null,
      visibility: visibility === "public" ? "public" : "friends",
      track: toGeo(rec.track),
    });
    if (pe) return { error: pe.message };

    const media = [];
    const list = (files || []).slice(0, 9);
    for (let i = 0; i < list.length; i++) {
      try {
        const { main, thumb, w, h } = await Media.compressImage(list[i]);
        const base = uuid();
        const path = await Media.upload(uid, postId, main, base + ".jpg");
        const thumb_path = await Media.upload(uid, postId, thumb, base + "_thumb.jpg");
        media.push({ post_id: postId, kind: "photo", path, thumb_path, w, h, ord: i });
      } catch (e) { console.warn("media upload failed", e && e.message); }
    }
    if (media.length) { const { error: me } = await c.from("post_media").insert(media); if (me) console.warn(me.message); }
    return { id: postId };
  }

  const SELECT = `
    id, author_id, trail_name, distance_km, duration_ms, ascent, hiked_on, caption, visibility, created_at,
    author:profiles!posts_author_profile_fk(handle, display_name, avatar_url),
    post_media(kind, path, thumb_path, ord),
    likes(count), comments(count)`;

  async function followingIds() {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return [];
    const { data } = await c.from("follows").select("following_id").eq("follower_id", u.user.id);
    return (data || []).map(r => r.following_id);
  }

  // mode: "friends"（我追蹤的人）| "explore"（公開）。beforeISO 供分頁。
  async function feed(mode, beforeISO) {
    const c = Supa.client(); if (!c) return [];
    let q = c.from("posts").select(SELECT).order("created_at", { ascending: false }).limit(20);
    if (beforeISO) q = q.lt("created_at", beforeISO);
    if (mode === "explore") {
      q = q.eq("visibility", "public");
    } else {
      const ids = await followingIds();
      if (!ids.length) return [];
      q = q.in("author_id", ids);
    }
    const { data, error } = await q;
    if (error) { console.warn("feed", error.message); return []; }
    return data || [];
  }

  async function userPosts(userId) {
    const c = Supa.client(); if (!c) return [];
    const { data, error } = await c.from("posts").select(SELECT).eq("author_id", userId)
      .order("created_at", { ascending: false }).limit(40);
    if (error) { console.warn("userPosts", error.message); return []; }
    return data || [];
  }

  async function one(postId) {
    const c = Supa.client(); if (!c) return null;
    const { data } = await c.from("posts").select(SELECT).eq("id", postId).maybeSingle();
    return data || null;
  }

  // 我對哪些 postId 按過讚 → Set
  async function likedSet(postIds) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (!u || !u.user || !postIds.length) return new Set();
    const { data } = await c.from("likes").select("post_id").eq("user_id", u.user.id).in("post_id", postIds);
    return new Set((data || []).map(r => r.post_id));
  }

  async function toggleLike(postId, on) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "not-signed-in" };
    if (on) { const { error } = await c.from("likes").insert({ post_id: postId, user_id: u.user.id }); return { error: error && error.message }; }
    const { error } = await c.from("likes").delete().eq("post_id", postId).eq("user_id", u.user.id);
    return { error: error && error.message };
  }

  async function remove(postId) {
    const c = Supa.client(); const { error } = await c.from("posts").delete().eq("id", postId);
    return { error: error && error.message };
  }

  return { createFromRecord, feed, userPosts, one, likedSet, toggleLike, followingIds, remove };
})();
```

- [ ] **Step 2: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/posts.js`
Expected: 無輸出（OK）。

- [ ] **Step 3: Commit**

```bash
git add web/js/social/posts.js
git commit -m "feat(social): posts data layer (create/feed/like)"
```

---

## Task 4: composer.js（發文視窗）+ 總結頁入口

**Files:**
- Create: `web/js/social/composer.js`
- Modify: `web/js/app.js`（總結頁加「分享到社群」按鈕）

- [ ] **Step 1: 建立 composer.js**

建立 `web/js/social/composer.js`：

```js
// 發文視窗：把一筆健行記錄 + 照片發成貼文。用全螢幕覆蓋層，避免和既有面板衝突。
const Composer = (() => {
  let files = [];

  function open(rec) {
    if (typeof Supa === "undefined" || !Supa.ready()) { alert("社群尚未啟用"); return; }
    Auth.session().then(async (s) => {
      if (!s) { alert("請先到「社群」分頁登入"); return; }
      const prof = await Auth.myProfile();
      if (!prof) { alert("請先到「社群」分頁完成註冊"); return; }
      mount(rec);
    });
  }

  function mount(rec) {
    files = [];
    const wrap = document.createElement("div");
    wrap.className = "composer-mask";
    wrap.innerHTML = `
      <div class="composer">
        <div class="composer-head"><button class="comp-x" id="compX">✕</button><b>分享到社群</b><button class="btn primary comp-post" id="compPost">發布</button></div>
        <div class="comp-trail">⛰️ ${esc(rec.trailName || "自由路線")}　${(rec.distanceKm || 0).toFixed(2)}km　↑${rec.ascent || 0}m</div>
        <textarea id="compCaption" class="comp-cap" placeholder="寫下這趟的心得…" maxlength="2000"></textarea>
        <div class="comp-photos" id="compPhotos"></div>
        <label class="comp-add">＋ 加照片<input type="file" id="compFiles" accept="image/*" multiple hidden></label>
        <div class="comp-vis">
          <label><input type="radio" name="compVis" value="friends" checked> 只給好友</label>
          <label><input type="radio" name="compVis" value="public"> 公開</label>
        </div>
        <div class="comp-msg" id="compMsg"></div>
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector("#compX").addEventListener("click", close);
    wrap.querySelector("#compFiles").addEventListener("change", e => {
      for (const f of e.target.files) if (files.length < 9) files.push(f);
      renderPhotos(wrap);
    });
    wrap.querySelector("#compPost").addEventListener("click", () => submit(wrap, rec, close));
  }

  function renderPhotos(wrap) {
    const box = wrap.querySelector("#compPhotos");
    box.innerHTML = files.map((f, i) => `<div class="comp-thumb"><img src="${URL.createObjectURL(f)}" alt=""><button data-i="${i}" class="comp-del">✕</button></div>`).join("");
    box.querySelectorAll(".comp-del").forEach(b => b.addEventListener("click", () => { files.splice(+b.dataset.i, 1); renderPhotos(wrap); }));
  }

  async function submit(wrap, rec, close) {
    const msg = wrap.querySelector("#compMsg");
    const caption = wrap.querySelector("#compCaption").value.trim();
    const visibility = wrap.querySelector('input[name="compVis"]:checked').value;
    wrap.querySelector("#compPost").disabled = true;
    msg.textContent = "發布中…（上傳照片可能需要一點時間）";
    const r = await Posts.createFromRecord(rec, { caption, visibility, files });
    if (r.error) { msg.textContent = "發布失敗：" + r.error; wrap.querySelector("#compPost").disabled = false; return; }
    msg.textContent = "已發布！";
    if (typeof toast === "function") toast("已分享到社群");
    setTimeout(close, 600);
  }

  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  return { open };
})();
```

- [ ] **Step 2: 在總結頁加入口按鈕**

修改 `web/js/app.js` 的 `openTrackReview`，把 `.link-row` 內容（第 1483–1488 行附近）改為加上分享鍵（非模擬記錄才顯示）：

```js
    <div class="link-row">
      <button class="link-btn" id="trackReplay">▶ 重播路徑</button>
      <button class="link-btn" id="trackCard">🖼 分享圖卡</button>
      <button class="link-btn" id="trackGpx">⬇️ 匯出 GPX</button>
      <button class="link-btn" id="trackShare">↗ 分享行程</button>
      ${rec.sim ? "" : `<button class="link-btn" id="trackSocial">📣 分享到社群</button>`}
    </div>`;
```

並在同函式內、設定其他按鈕事件的區段附近加入：

```js
  const socialBtn = $("#trackSocial");
  if (socialBtn) socialBtn.addEventListener("click", () => { if (typeof Composer !== "undefined") Composer.open(rec); });
```

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/composer.js && node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/app.js`
Expected: 無輸出（OK）。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/composer.js web/js/app.js
git commit -m "feat(social): post composer + share-from-summary entry"
```

---

## Task 5: feed.js（動態牆：好友/探索 + 貼文卡片）

**Files:**
- Create: `web/js/social/feed.js`

- [ ] **Step 1: 建立 feed.js**

建立 `web/js/social/feed.js`：

```js
// 動態牆：渲染好友/探索貼文清單與卡片；按讚切換；點卡片進詳情。
const Feed = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function fmtAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "剛剛"; if (d < 3600) return Math.floor(d / 60) + " 分鐘前";
    if (d < 86400) return Math.floor(d / 3600) + " 小時前"; return Math.floor(d / 86400) + " 天前";
  }
  function count(arr) { return (arr && arr[0] && arr[0].count) || 0; }

  function card(post, liked) {
    const a = post.author || {};
    const av = a.avatar_url ? `<img class="fc-av" src="${esc(a.avatar_url)}" alt="">`
      : `<div class="fc-av fc-av-ph">${esc((a.display_name || a.handle || "?").slice(0, 1))}</div>`;
    const media = (post.post_media || []).sort((x, y) => x.ord - y.ord);
    const imgs = media.length
      ? `<div class="fc-media">${media.map(m => `<img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt="">`).join("")}</div>` : "";
    const stats = `${(post.distance_km != null ? post.distance_km.toFixed(2) + "km" : "")}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}`;
    return `<article class="feed-card" data-id="${post.id}">
      <div class="fc-top">${av}<div><div class="fc-name">${esc(a.display_name || a.handle || "山友")}</div>
        <div class="fc-sub">${fmtAgo(post.created_at)}${post.visibility === "friends" ? " · 好友" : ""}</div></div></div>
      <div class="fc-trail">⛰️ ${esc(post.trail_name || "自由路線")}　<span class="fc-stats">${stats}</span></div>
      ${post.caption ? `<div class="fc-cap">${esc(post.caption)}</div>` : ""}
      ${imgs}
      <div class="fc-actions">
        <button class="fc-like ${liked ? "on" : ""}" data-id="${post.id}">${liked ? "❤️" : "🤍"} <span>${count(post.likes)}</span></button>
        <button class="fc-comment" data-id="${post.id}">💬 ${count(post.comments)}</button>
      </div>
    </article>`;
  }

  async function render(renderInto, mode) {
    renderInto(`<div class="feed-loading"><span class="spin"></span>載入中…</div>`);
    const posts = await Posts.feed(mode);
    if (!posts.length) {
      renderInto(`<div class="social-empty">${mode === "explore" ? "目前還沒有公開貼文。" : "追蹤山友後，這裡會出現他們的步道旅行。"}</div>`);
      return;
    }
    const liked = await Posts.likedSet(posts.map(p => p.id));
    renderInto(`<div class="feed-list">${posts.map(p => card(p, liked.has(p.id))).join("")}</div>`);
    bind();
  }

  function bind() {
    document.querySelectorAll(".feed-card .fc-like").forEach(b => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      const span = b.querySelector("span"); const n = +span.textContent + (on ? 1 : -1); span.textContent = Math.max(0, n);
      b.firstChild.textContent = on ? "❤️ " : "🤍 ";
      await Posts.toggleLike(b.dataset.id, on);
    }));
    const openDetail = id => { if (typeof PostView !== "undefined") PostView.open(id); };
    document.querySelectorAll(".feed-card .fc-comment").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openDetail(b.dataset.id); }));
    document.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => openDetail(c.dataset.id)));
  }

  return { render, card, _fmtAgo: fmtAgo };
})();
```

- [ ] **Step 2: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/feed.js`
Expected: 無輸出（OK）。

- [ ] **Step 3: Commit**

```bash
git add web/js/social/feed.js
git commit -m "feat(social): feed (friends/explore) + post cards + like toggle"
```

---

## Task 6: postview.js（貼文詳情 + 留言 + 按讚）

**Files:**
- Create: `web/js/social/postview.js`

- [ ] **Step 1: 建立 postview.js**

建立 `web/js/social/postview.js`：

```js
// 貼文詳情覆蓋層：完整貼文 + 留言串（可留言）+ 按讚。
const PostView = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  async function open(postId) {
    const post = await Posts.one(postId);
    if (!post) { if (typeof toast === "function") toast("貼文不存在或無權限"); return; }
    const wrap = document.createElement("div");
    wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="pvX">✕</button><b>貼文</b><span></span></div>
      <div class="pv-body" id="pvBody"></div>
      <div class="pv-add"><input id="pvInput" class="auth-input" placeholder="留言…" maxlength="1000"><button class="btn primary" id="pvSend">送出</button></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#pvX").addEventListener("click", () => wrap.remove());
    renderBody(wrap, post);
    wrap.querySelector("#pvSend").addEventListener("click", () => send(wrap, postId));
    loadComments(wrap, postId);
  }

  function renderBody(wrap, post) {
    const a = post.author || {};
    const media = (post.post_media || []).sort((x, y) => x.ord - y.ord);
    wrap.querySelector("#pvBody").innerHTML = `
      <div class="fc-name">${esc(a.display_name || a.handle || "山友")} <span class="fc-sub">@${esc(a.handle || "")}</span></div>
      <div class="fc-trail">⛰️ ${esc(post.trail_name || "自由路線")}　<span class="fc-stats">${post.distance_km != null ? post.distance_km.toFixed(2) + "km" : ""}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}</span></div>
      ${post.caption ? `<div class="fc-cap">${esc(post.caption)}</div>` : ""}
      ${media.map(m => `<img class="pv-img" loading="lazy" src="${esc(Media.publicUrl(m.path))}" alt="">`).join("")}
      <div class="pv-comments" id="pvComments"><div class="feed-loading"><span class="spin"></span></div></div>`;
  }

  async function loadComments(wrap, postId) {
    const c = Supa.client();
    const { data } = await c.from("comments")
      .select("id, body, created_at, author:profiles!comments_author_profile_fk(handle, display_name)")
      .eq("post_id", postId).order("created_at", { ascending: true }).limit(200);
    const box = wrap.querySelector("#pvComments"); if (!box) return;
    box.innerHTML = (data && data.length)
      ? data.map(cm => `<div class="pv-cm"><b>${esc((cm.author && (cm.author.display_name || cm.author.handle)) || "山友")}</b> ${esc(cm.body)}</div>`).join("")
      : `<div class="social-empty">還沒有留言，當第一個。</div>`;
  }

  async function send(wrap, postId) {
    const input = wrap.querySelector("#pvInput"); const body = input.value.trim();
    if (!body) return;
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) { alert("請先登入"); return; }
    input.disabled = true;
    const { error } = await c.from("comments").insert({ post_id: postId, author_id: u.user.id, body });
    input.disabled = false;
    if (error) { if (typeof toast === "function") toast("留言失敗：" + error.message); return; }
    input.value = ""; loadComments(wrap, postId);
  }

  return { open };
})();
```

- [ ] **Step 2: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/postview.js`
Expected: 無輸出（OK）。

- [ ] **Step 3: Commit**

```bash
git add web/js/social/postview.js
git commit -m "feat(social): post detail + comments"
```

---

## Task 7: discover.js（搜尋 / 追蹤 / 他人個人頁）

**Files:**
- Create: `web/js/social/discover.js`

- [ ] **Step 1: 建立 discover.js**

建立 `web/js/social/discover.js`：

```js
// 搜尋使用者（handle/名字）、追蹤/取消、檢視他人個人頁（含其貼文）。
const Discover = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  function render(renderInto) {
    renderInto(`<div class="disc">
      <input id="discQ" class="auth-input" placeholder="搜尋 handle 或名字" autocapitalize="off">
      <div id="discResults"></div></div>`);
    const q = document.getElementById("discQ"); let t = null;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => search(q.value.trim()), 300); });
  }

  async function search(term) {
    const box = document.getElementById("discResults"); if (!box) return;
    if (term.length < 2) { box.innerHTML = `<div class="social-empty">輸入至少 2 個字搜尋山友。</div>`; return; }
    const c = Supa.client();
    const { data } = await c.from("profiles").select("id, handle, display_name, avatar_url")
      .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).limit(20);
    if (!data || !data.length) { box.innerHTML = `<div class="social-empty">找不到符合的山友。</div>`; return; }
    box.innerHTML = data.map(p => `<div class="disc-row" data-id="${p.id}">
      ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
      <div class="disc-id"><b>${esc(p.display_name || p.handle)}</b><span>@${esc(p.handle)}</span></div></div>`).join("");
    box.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", () => openProfile(r.dataset.id)));
  }

  async function isFollowing(targetId) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return false;
    const { data } = await c.from("follows").select("following_id").eq("follower_id", u.user.id).eq("following_id", targetId).maybeSingle();
    return !!data;
  }
  async function follow(targetId, on) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return;
    if (on) await c.from("follows").insert({ follower_id: u.user.id, following_id: targetId });
    else await c.from("follows").delete().eq("follower_id", u.user.id).eq("following_id", targetId);
  }

  async function openProfile(userId) {
    const c = Supa.client();
    const { data: prof } = await c.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!prof) return;
    const { data: me } = await c.auth.getUser();
    const isMe = me && me.user && me.user.id === userId;
    const following = isMe ? false : await isFollowing(userId);
    const wrap = document.createElement("div");
    wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="dpX">✕</button><b>@${esc(prof.handle)}</b><span></span></div>
      <div class="pv-body">
        <div class="pf-top">${prof.avatar_url ? `<img class="pf-av" src="${esc(prof.avatar_url)}">` : `<div class="pf-av pf-av-ph">${esc((prof.display_name || prof.handle).slice(0, 1))}</div>`}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}</div><div class="pf-handle">@${esc(prof.handle)}</div></div></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        ${isMe ? "" : `<button class="btn ${following ? "ghost" : "primary"}" id="dpFollow">${following ? "已追蹤" : "追蹤"}</button>`}
        <div id="dpPosts" class="feed-loading"><span class="spin"></span></div>
      </div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#dpX").addEventListener("click", () => wrap.remove());
    const fb = wrap.querySelector("#dpFollow");
    if (fb) fb.addEventListener("click", async () => {
      const on = fb.textContent === "追蹤";
      fb.textContent = on ? "已追蹤" : "追蹤"; fb.className = "btn " + (on ? "ghost" : "primary");
      await follow(userId, on);
    });
    const posts = await Posts.userPosts(userId);
    const liked = await Posts.likedSet(posts.map(p => p.id));
    const box = wrap.querySelector("#dpPosts");
    box.className = "feed-list";
    box.innerHTML = posts.length ? posts.map(p => Feed.card(p, liked.has(p.id))).join("") : `<div class="social-empty">尚無貼文。</div>`;
    box.querySelectorAll(".feed-card").forEach(card => card.addEventListener("click", () => { if (typeof PostView !== "undefined") PostView.open(card.dataset.id); }));
  }

  return { render, openProfile, follow, isFollowing };
})();
```

- [ ] **Step 2: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/discover.js`
Expected: 無輸出（OK）。

- [ ] **Step 3: Commit**

```bash
git add web/js/social/discover.js
git commit -m "feat(social): search users + follow + other profile"
```

---

## Task 8: social-ui.js 子分頁路由 + profiles 串接

**Files:**
- Modify: `web/js/social/social-ui.js`
- Modify: `web/js/social/profiles.js`

- [ ] **Step 1: 改寫 social-ui.js 登入後畫面為子分頁**

把 `web/js/social/social-ui.js` 的 `route()` 改為：登入且有 profile 時，渲染子分頁殼，預設「動態」。整檔replace為：

```js
// 社群分頁外殼與路由：未啟用 / 登入 / 註冊 / （登入後）動態·探索·搜尋·我的 子分頁。
const SocialUI = (() => {
  const $ = s => document.querySelector(s);
  let mounted = false, sub = "friends", myProf = null;

  function render(html) { const b = $("#socialBody"); if (b) b.innerHTML = html; }

  async function onShow() {
    if (typeof Supa === "undefined" || !Supa.ready()) { render(`<div class="social-empty">社群功能尚未啟用（缺少 Supabase 設定）。</div>`); return; }
    if (!mounted) { mounted = true; if (typeof Auth !== "undefined") Auth.init(route); }
    route();
  }

  async function route() {
    if (typeof Auth === "undefined") { render(`<div class="social-empty">載入中…</div>`); return; }
    const sess = await Auth.session();
    if (!sess) { Auth.renderLogin(render); return; }
    myProf = await Auth.myProfile();
    if (!myProf) { Auth.renderOnboarding(render); return; }
    shell();
  }

  function shell() {
    render(`
      <div class="social-subnav">
        ${tab("friends", "動態")}${tab("explore", "探索")}${tab("search", "搜尋")}${tab("me", "我的")}
      </div>
      <div id="subBody"></div>`);
    document.querySelectorAll(".sub-tab").forEach(b => b.addEventListener("click", () => { sub = b.dataset.sub; shell(); }));
    const into = html => { const e = document.getElementById("subBody"); if (e) e.innerHTML = html; };
    if (sub === "friends") Feed.render(into, "friends");
    else if (sub === "explore") Feed.render(into, "explore");
    else if (sub === "search") Discover.render(into);
    else if (sub === "me") Profiles.renderMe(into, myProf);
  }
  function tab(id, label) { return `<button class="sub-tab ${sub === id ? "on" : ""}" data-sub="${id}">${label}</button>`; }

  return { onShow, route, render };
})();
```

- [ ] **Step 2: 讓 profiles.js 個人頁顯示自己的貼文**

修改 `web/js/social/profiles.js` 的 `renderMe`，在 `.pf-posts-empty` 那行之後（仍在 render 字串中）改為帶一個容器，並在綁定事件後載入貼文。把 `renderMe` 的 `.pf-posts-empty` 行替換為：

```js
        <div id="pfPosts" class="feed-loading"><span class="spin"></span></div>
```

並在 `renderMe` 內、`document.getElementById("pfEdit")...` 之後加入：

```js
    Posts.userPosts(prof.id).then(async posts => {
      const box = document.getElementById("pfPosts"); if (!box) return;
      box.className = "feed-list";
      if (!posts.length) { box.className = "pf-posts-empty"; box.textContent = "尚未有貼文。完成一趟健行後，在總結頁按「分享到社群」。"; return; }
      const liked = await Posts.likedSet(posts.map(p => p.id));
      box.innerHTML = posts.map(p => Feed.card(p, liked.has(p.id))).join("");
      box.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => { if (typeof PostView !== "undefined") PostView.open(c.dataset.id); }));
    });
```

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/social-ui.js && node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/profiles.js`
Expected: 無輸出（OK）。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/social-ui.js web/js/social/profiles.js
git commit -m "feat(social): subnav routing (friends/explore/search/me) + own posts wall"
```

---

## Task 9: 樣式 + script 載入 + smoke + SW + 部署

**Files:**
- Modify: `web/index.html`（新模組 script）
- Modify: `web/css/style.css`
- Modify: `scratchpad/social-smoke.js`
- Modify: `web/sw.js`

- [ ] **Step 1: 載入新模組 script**

修改 `web/index.html`，把 social 模組 script 區塊替換為（在 `js/social/social-ui.js` 之前加入 media/posts/feed/postview/discover/composer，順序：被依賴者在前）：

```html
<script src="js/social/supa.js"></script>
<script src="js/social/handle.js"></script>
<script src="js/social/media.js"></script>
<script src="js/social/posts.js"></script>
<script src="js/social/composer.js"></script>
<script src="js/social/feed.js"></script>
<script src="js/social/postview.js"></script>
<script src="js/social/discover.js"></script>
<script src="js/social/auth.js"></script>
<script src="js/social/profiles.js"></script>
<script src="js/social/social-ui.js"></script>
```

- [ ] **Step 2: 加入 Phase 2 樣式**

在 `web/css/style.css` 末端加入：

```css
/* ===== 社群 Phase 2 ===== */
.social-subnav { display: flex; gap: 6px; padding: 4px 0 12px; position: sticky; top: 0; background: var(--bg); z-index: 5; }
.sub-tab { flex: 1; padding: 9px 0; border: 1px solid var(--line); background: var(--surface); border-radius: 999px; font-size: 13px; color: var(--ink-soft); cursor: pointer; font-weight: 600; }
.sub-tab.on { background: var(--accent); color: #fff; border-color: var(--accent); }
.feed-list { display: flex; flex-direction: column; gap: 14px; }
.feed-loading { text-align: center; color: var(--ink-soft); padding: 30px; }
.feed-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: 13px 14px; cursor: pointer; }
.fc-top { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.fc-av { width: 38px; height: 38px; border-radius: 50%; object-fit: cover; }
.fc-av-ph { display: flex; align-items: center; justify-content: center; background: var(--accent); color: #fff; font-family: var(--serif); }
.fc-name { font-weight: 700; font-size: 14px; }
.fc-sub { color: var(--ink-soft); font-size: 12px; }
.fc-trail { font-size: 14px; margin: 4px 0; }
.fc-stats { color: var(--ink-soft); font-size: 13px; }
.fc-cap { line-height: 1.6; margin: 6px 0; white-space: pre-wrap; }
.fc-media { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 4px; margin-top: 8px; }
.fc-media img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--r-sm); }
.fc-actions { display: flex; gap: 16px; margin-top: 10px; }
.fc-like, .fc-comment { background: none; border: none; cursor: pointer; font-size: 14px; color: var(--ink-soft); }
.fc-like.on { color: var(--danger); }
/* composer / 詳情覆蓋層 */
.composer-mask, .pv-mask { position: fixed; inset: 0; z-index: 120; background: rgba(0,0,0,.4); display: flex; align-items: flex-end; justify-content: center; }
.composer, .pv { background: var(--bg); width: 100%; max-width: 540px; max-height: 92vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 14px 16px calc(20px + var(--safe-b, 0px)); }
.composer-head, .pv-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; position: sticky; top: 0; background: var(--bg); padding-bottom: 8px; }
.comp-x { background: none; border: none; font-size: 18px; cursor: pointer; color: var(--ink-soft); }
.comp-trail { color: var(--ink-soft); font-size: 13px; margin: 6px 0; }
.comp-cap { width: 100%; min-height: 84px; border: 1px solid var(--line); border-radius: var(--r-sm); padding: 10px; font: inherit; background: var(--surface); color: var(--ink); resize: vertical; }
.comp-photos { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.comp-thumb { position: relative; width: 76px; height: 76px; }
.comp-thumb img { width: 100%; height: 100%; object-fit: cover; border-radius: var(--r-sm); }
.comp-del { position: absolute; top: -6px; right: -6px; width: 22px; height: 22px; border-radius: 50%; border: none; background: rgba(0,0,0,.6); color: #fff; cursor: pointer; }
.comp-add { display: inline-block; padding: 8px 14px; border: 1px dashed var(--line); border-radius: var(--r-sm); cursor: pointer; font-size: 13px; color: var(--ink-soft); }
.comp-vis { display: flex; gap: 16px; margin: 12px 0; font-size: 14px; }
.comp-msg, .pv-add { font-size: 13px; }
.pv-img { width: 100%; border-radius: var(--r-sm); margin: 6px 0; }
.pv-comments { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.pv-cm { font-size: 14px; line-height: 1.5; }
.pv-add { display: flex; gap: 8px; position: sticky; bottom: 0; background: var(--bg); padding-top: 8px; }
.pv-add .auth-input { flex: 1; }
.disc { display: flex; flex-direction: column; gap: 10px; }
.disc-row { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: var(--r-sm); cursor: pointer; }
.disc-row:hover { background: var(--surface-2); }
.disc-id { display: flex; flex-direction: column; }
.disc-id span { color: var(--ink-soft); font-size: 12px; }
```

- [ ] **Step 3: 更新 social-smoke.js**

把 `scratchpad/social-smoke.js` 的模組清單（`for (const f of [...]`）改為：

```js
for (const f of ["js/social/supa.js", "js/social/handle.js", "js/social/media.js", "js/social/posts.js", "js/social/composer.js", "js/social/feed.js", "js/social/postview.js", "js/social/discover.js", "js/social/auth.js", "js/social/profiles.js", "js/social/social-ui.js"]) {
```

並在 sandbox 的 `window.supabase.createClient` 回傳物件補上 `storage` 與更完整的 `from` 鏈（避免新模組載入期引用未定義；本 smoke 僅驗證「載入不丟例外」）：在 `from: () => ({...})` 物件中補 `or: () => ({ limit: async () => ({ data: [] }) })`、`in: () => ({}), lt: () => ({}), order: () => ({ limit: async () => ({ data: [] }) })`，並加入：

```js
        storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: "http://x/i.jpg" } }) }) },
```

> 註：這些鏈只在「呼叫」時才用到；模組頂層只定義函式，smoke 主要驗證 `vm.runInContext` 不丟例外。最小可行是維持原 sandbox，只更新檔案清單；若載入期未引用即可。實作時先只改清單跑跑看，有 `THREW` 再補對應 mock。

- [ ] **Step 4: 跑 smoke 與單元測試**

Run:
```bash
cd /mnt/c/Users/timmy/projects/trail-tracker
node scratchpad/test-media.js && node scratchpad/social-smoke.js
```
Expected: media 測試 `done`；smoke 印出每個模組 `loaded ...` 與 `ALL SOCIAL MODULES LOADED ✓`。

- [ ] **Step 5: 更新 SW 快取**

修改 `web/sw.js`：bump `CACHE`（`v110`→`v111`），ASSETS 的 social 區塊加入：

```js
  "./js/social/media.js", "./js/social/posts.js", "./js/social/composer.js",
  "./js/social/feed.js", "./js/social/postview.js", "./js/social/discover.js",
```

- [ ] **Step 6: 主程式 smoke（確認 app.js 改動沒壞）**

Run: `node /tmp/.../smoke.js`（既有 harness 路徑）
Expected: `ALL FILES EXECUTED WITHOUT THROWING ✓` / `LOGIC OK`。

- [ ] **Step 7: Commit + 部署**

```bash
git add web/index.html web/css/style.css scratchpad/social-smoke.js web/sw.js
git commit -m "feat(social): Phase 2 wiring — scripts, styles, smoke, SW (social core complete)"
git push origin main
```

---

## Phase 2 完成驗收

- [ ] 在健行總結頁按「📣 分享到社群」可開發文視窗，選照片、寫心得、選可見度、發布成功。
- [ ] 社群「動態」顯示我追蹤的人的貼文；「探索」顯示公開貼文。
- [ ] 貼文卡片可按讚（數字即時變化）、點進詳情看完整內容與留言、可留言。
- [ ] 「搜尋」可用 handle/名字找到山友、進其個人頁、追蹤/取消；互追後在「動態」能看到對方 friends 貼文。
- [ ] 「我的」個人頁顯示自己的貼文牆。
- [ ] `test-media.js`、`social-smoke.js`、主程式 smoke 全通過。
- [ ] 其他分頁（探索/記錄/我的）功能不受影響。

---

## Self-Review 紀錄

- **Spec coverage**：發文（Task 3/4）、媒體（Task 2）、動態牆好友/探索（Task 5）、追蹤/搜尋（Task 7）、貼文詳情/留言（Task 6）、按讚（Task 5/6）、子分頁與個人頁貼文牆（Task 8）皆覆蓋設計「Phase 2 社群核心」。
- **Placeholder scan**：各步驟含實際 SQL/JS/指令。Task 9 Step 3 的 smoke mock 補強以「先跑、出現 THREW 再補對應 mock」描述明確最小作法，非 TODO。
- **Type consistency**：`Posts.feed/one/userPosts/likedSet/toggleLike/createFromRecord/followingIds`、`Media.targetSize/compressImage/videoPoster/upload/publicUrl`、`Feed.card(post, liked)`/`Feed.render(into, mode)`、`PostView.open(id)`、`Discover.render(into)/openProfile(id)`、`Composer.open(rec)`、`SocialUI.onShow/route` 命名跨檔一致。內嵌外鍵 hint（`profiles!posts_author_profile_fk`、`profiles!comments_author_profile_fk`）與 Task 1 遷移所建約束名稱一致。Script 載入順序：media/posts 在 composer/feed/postview/discover 之前，全部在 social-ui 之前；auth/profiles 在 social-ui 之前。
