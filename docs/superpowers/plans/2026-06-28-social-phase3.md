# 社群功能 Phase 3（豐富媒體與打磨）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Phase 2 社群核心上，加入影片上傳、留言/按讚的 Realtime 即時更新，以及一輪打磨（動態牆分頁載入、貼文刪除、照片全螢幕檢視）。

**Architecture:** 沿用前端直連 Supabase + RLS 架構。影片走 Storage 原檔上傳（限長限大小）+ Canvas 封面；Realtime 用 Supabase Realtime 訂閱 `comments` 變更即時刷新；打磨皆為前端互動強化。

**Tech Stack:** 原生 JS（IIFE 模組）、Supabase（Storage / Realtime / Postgres）、Canvas、Node 單元測試與 vm smoke harness。

設計來源：`docs/superpowers/specs/2026-06-28-social-feed-design.md`。前置：Phase 1、Phase 2 已完成。

---

## 檔案結構（本階段建立/修改）

- 建立 `supabase/schema-phase3.sql` — 開啟 comments/likes 的 Realtime publication（USER ACTION 執行）
- 修改 `web/js/social/media.js` — 影片驗證（長度/大小）+ 影片上傳（原檔 + 封面）
- 修改 `web/js/social/composer.js` — 可選 1 支影片、驗證、上傳
- 修改 `web/js/social/posts.js` — `createFromRecord` 支援影片媒體
- 修改 `web/js/social/feed.js` — 卡片顯示影片封面（▶）；分頁「載入更多」
- 修改 `web/js/social/postview.js` — 播放影片；Realtime 訂閱留言；作者可刪文；照片全螢幕
- 建立 `web/js/social/lightbox.js` — 照片全螢幕檢視器
- 修改 `web/index.html` — 載入 lightbox.js
- 修改 `web/css/style.css` — 影片/lightbox/載入更多 樣式
- 修改 `web/sw.js` — 快取 lightbox.js、bump 版本
- 修改 `scratchpad/test-media.js` — 影片大小/長度驗證測試
- 修改 `scratchpad/social-smoke.js` — 納入 lightbox.js

---

## Task 1: 【USER ACTION】開啟 Realtime publication

**Files:**
- Create: `supabase/schema-phase3.sql`

- [ ] **Step 1: 寫遷移檔**

建立 `supabase/schema-phase3.sql`：

```sql
-- 讓 comments / likes 的變更可被 Realtime 廣播（前端訂閱即時更新）。可重複執行。
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='comments') then
    alter publication supabase_realtime add table public.comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='likes') then
    alter publication supabase_realtime add table public.likes;
  end if;
end $$;
```

- [ ] **Step 2:【USER ACTION】在 Supabase 執行**

Supabase → SQL Editor → 貼上 `schema-phase3.sql` → Run。

- [ ] **Step 3: 驗證**

`select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public';` 應含 `comments` 與 `likes`。

- [ ] **Step 4: Commit**

```bash
git add supabase/schema-phase3.sql
git commit -m "feat(social): Phase 3 — enable realtime for comments/likes"
```

---

## Task 2: media.js 影片驗證 + 上傳

**Files:**
- Modify: `web/js/social/media.js`
- Test: `scratchpad/test-media.js`

- [ ] **Step 1: 加影片大小驗證的失敗測試**

在 `scratchpad/test-media.js` 末端（`console.log("done")` 之前）加入：

```js
// validateSize 是純函式：檢查位元組是否超過 MB 上限
eq(Media.validateSize(10 * 1024 * 1024, 50), true, "10MB under 50MB ok");
eq(Media.validateSize(60 * 1024 * 1024, 50), false, "60MB over 50MB");
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-media.js`
Expected: FAIL，`Media.validateSize is not a function`。

- [ ] **Step 3: 在 media.js 加入影片函式**

修改 `web/js/social/media.js`，在 `return {` 之前加入：

```js
  // 純函式：位元組是否在 MB 上限內（可測）
  function validateSize(bytes, maxMB) { return bytes <= maxMB * 1024 * 1024; }

  // 影片驗證：大小 + 長度。回傳 { ok, msg?, dur? }
  function validateVideo(file, maxSec = 60, maxMB = 50) {
    return new Promise(res => {
      if (!validateSize(file.size, maxMB)) return res({ ok: false, msg: `影片需小於 ${maxMB}MB` });
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); res(d > maxSec ? { ok: false, msg: `影片需短於 ${maxSec} 秒` } : { ok: true, dur: d }); };
      v.onerror = () => { URL.revokeObjectURL(v.src); res({ ok: false, msg: "無法讀取影片" }); };
      v.src = URL.createObjectURL(file);
    });
  }

  // 影片上傳：原檔 + 封面。回傳 { path, thumb_path, dur }
  async function uploadVideo(userId, postId, file, dur) {
    const c = Supa.client();
    const base = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
    const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
    const path = `${userId}/${postId}/${base}.${ext}`;
    const { error } = await c.storage.from("media").upload(path, file, { contentType: file.type || "video/mp4", upsert: true });
    if (error) throw error;
    let thumb_path = null;
    const poster = await videoPoster(file);
    if (poster) thumb_path = await upload(userId, postId, poster, base + "_poster.jpg");
    return { path, thumb_path, dur: dur || null };
  }
```

並把 `return { ... }` 更新為：

```js
  return { targetSize, compressImage, videoPoster, upload, publicUrl, validateSize, validateVideo, uploadVideo };
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node /mnt/c/Users/timmy/projects/trail-tracker/scratchpad/test-media.js`
Expected: 全 `ok`，印 `done`。

- [ ] **Step 5: Commit**

```bash
git add web/js/social/media.js scratchpad/test-media.js
git commit -m "feat(social): video validation + upload in media.js"
```

---

## Task 3: composer 支援影片；posts 寫入影片媒體

**Files:**
- Modify: `web/js/social/composer.js`
- Modify: `web/js/social/posts.js`

- [ ] **Step 1: composer 加影片選擇**

修改 `web/js/social/composer.js`：在 `let files = [];` 之後加入 `let video = null;`。

把「加照片」那個 label 之後，加入一個加影片的 label（在 `mount` 的 innerHTML 內、`comp-add` label 之後）：

```html
        <label class="comp-add">＋ 加影片<input type="file" id="compVideo" accept="video/*" hidden></label>
        <div id="compVideoName" class="comp-trail"></div>
```

在 `mount` 綁定事件區（`compFiles` change 之後）加入：

```js
    wrap.querySelector("#compVideo").addEventListener("change", async e => {
      const f = e.target.files[0]; if (!f) return;
      const msg = wrap.querySelector("#compMsg"); msg.textContent = "檢查影片…";
      const r = await Media.validateVideo(f);
      if (!r.ok) { msg.textContent = r.msg; video = null; wrap.querySelector("#compVideoName").textContent = ""; return; }
      video = { file: f, dur: r.dur }; msg.textContent = "";
      wrap.querySelector("#compVideoName").textContent = "🎬 " + f.name;
    });
```

把 `submit` 內呼叫改為把 video 傳下去：

```js
    const r = await Posts.createFromRecord(rec, { caption, visibility, files, video });
```

並在 `mount` 開頭重設：`files = []; video = null;`。

- [ ] **Step 2: posts.createFromRecord 支援影片**

修改 `web/js/social/posts.js` 的 `createFromRecord`，把 `opts` 解構加入 `video`：

```js
    const { caption, visibility, files, video } = opts || {};
```

在照片上傳迴圈「之後」、`if (media.length)` 之前加入：

```js
    if (video && video.file) {
      try {
        const v = await Media.uploadVideo(uid, postId, video.file, video.dur);
        media.push({ post_id: postId, kind: "video", path: v.path, thumb_path: v.thumb_path, dur: v.dur, ord: media.length });
      } catch (e) { console.warn("video upload failed", e && e.message); }
    }
```

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/composer.js && node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/posts.js`
Expected: 無輸出。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/composer.js web/js/social/posts.js
git commit -m "feat(social): video in composer + post creation"
```

---

## Task 4: feed/postview 顯示與播放影片

**Files:**
- Modify: `web/js/social/feed.js`
- Modify: `web/js/social/postview.js`

- [ ] **Step 1: feed 卡片顯示影片封面**

修改 `web/js/social/feed.js` 的 `card`，把 `imgs` 計算改為（影片顯示封面 + ▶ 疊層）：

```js
    const imgs = media.length
      ? `<div class="fc-media">${media.map(m => m.kind === "video"
          ? `<div class="fc-vid"><img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || ""))}" alt=""><span class="fc-play">▶</span></div>`
          : `<img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt="">`).join("")}</div>` : "";
```

- [ ] **Step 2: postview 播放影片 + 點圖開 lightbox**

修改 `web/js/social/postview.js` 的 `renderBody`，把媒體渲染改為：

```js
      ${media.map(m => m.kind === "video"
        ? `<video class="pv-img" controls preload="metadata" poster="${esc(Media.publicUrl(m.thumb_path || ""))}" src="${esc(Media.publicUrl(m.path))}"></video>`
        : `<img class="pv-img pv-photo" loading="lazy" src="${esc(Media.publicUrl(m.path))}" alt="">`).join("")}
```

並在 `renderBody` 結尾（設定 innerHTML 之後）加入點照片開 lightbox：

```js
    wrap.querySelectorAll(".pv-photo").forEach(img => img.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.open(img.src); }));
```

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/feed.js && node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/postview.js`
Expected: 無輸出。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/feed.js web/js/social/postview.js
git commit -m "feat(social): render/play video in feed + post detail"
```

---

## Task 5: 留言 Realtime 即時更新 + 作者刪文

**Files:**
- Modify: `web/js/social/postview.js`

- [ ] **Step 1: 訂閱 Realtime 並在關閉時取消**

修改 `web/js/social/postview.js` 的 `open`：在建立 `wrap` 後、`loadComments` 之前訂閱；關閉時移除頻道。把關閉與訂閱改為：

```js
    const c = Supa.client();
    const channel = c.channel("post-" + postId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => loadComments(wrap, postId))
      .subscribe();
    const close = () => { try { c.removeChannel(channel); } catch (e) {} wrap.remove(); };
    wrap.querySelector("#pvX").addEventListener("click", close);
```

（把原本 `wrap.querySelector("#pvX").addEventListener("click", () => wrap.remove());` 那行移除，改用上面的 `close`。）

- [ ] **Step 2: 作者可刪自己的貼文**

在 `open` 內、取得 `post` 後，判斷是否為作者並在標題列加刪除鈕。把 `pv-head` 的 innerHTML 改為帶條件刪除鈕，並在建立後綁定：

於 `open` 取得 `post` 之後加入：

```js
    const { data: u } = await c.auth.getUser();
    const isMine = u && u.user && post.author_id === u.user.id;
```

把 `wrap.innerHTML` 的 head 改為：

```js
      `<div class="pv"><div class="pv-head"><button class="comp-x" id="pvX">✕</button><b>貼文</b>${isMine ? '<button class="comp-x" id="pvDel" title="刪除">🗑</button>' : "<span></span>"}</div>` +
```

並在綁定區加入：

```js
    if (isMine) wrap.querySelector("#pvDel").addEventListener("click", async () => {
      if (!confirm("確定刪除這篇貼文？")) return;
      const r = await Posts.remove(postId);
      if (r.error) { if (typeof toast === "function") toast("刪除失敗：" + r.error); return; }
      close();
      if (typeof toast === "function") toast("已刪除");
      if (typeof SocialUI !== "undefined") SocialUI.route();
    });
```

> 註：因步驟較多，實作時請把 `open` 整個函式對照 Phase 2 版本，套用上述 close/訂閱/刪除三處修改後再存。

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/postview.js`
Expected: 無輸出。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/postview.js
git commit -m "feat(social): realtime comments + author delete post"
```

---

## Task 6: 動態牆分頁「載入更多」

**Files:**
- Modify: `web/js/social/feed.js`

- [ ] **Step 1: render 改為可累加，加「載入更多」**

修改 `web/js/social/feed.js`，把 `render` 與 `bind` 改為支援續載（保留已載清單、用最後一筆 `created_at` 當游標）：

```js
  let _mode = "friends", _posts = [], _into = null;

  async function render(renderInto, mode) {
    _into = renderInto; _mode = mode; _posts = [];
    renderInto(`<div class="feed-loading"><span class="spin"></span>載入中…</div>`);
    await loadMore(true);
  }

  async function loadMore(first) {
    const before = (!first && _posts.length) ? _posts[_posts.length - 1].created_at : null;
    const batch = await Posts.feed(_mode, before);
    _posts = _posts.concat(batch);
    if (!_posts.length) {
      _into(`<div class="social-empty">${_mode === "explore" ? "目前還沒有公開貼文。" : "追蹤山友後，這裡會出現他們的步道旅行。"}</div>`);
      return;
    }
    const liked = await Posts.likedSet(_posts.map(p => p.id));
    const more = batch.length >= 20 ? `<button class="btn ghost" id="feedMore">載入更多</button>` : "";
    _into(`<div class="feed-list">${_posts.map(p => card(p, liked.has(p.id))).join("")}</div>${more}`);
    bind();
    const mb = document.getElementById("feedMore"); if (mb) mb.addEventListener("click", () => loadMore(false));
  }
```

（移除舊的 `render` 內 `Posts.feed`/一次渲染邏輯，改用上面的 `loadMore`。）

- [ ] **Step 2: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/feed.js`
Expected: 無輸出。

- [ ] **Step 3: Commit**

```bash
git add web/js/social/feed.js
git commit -m "feat(social): feed pagination (load more)"
```

---

## Task 7: 照片全螢幕檢視器 lightbox.js

**Files:**
- Create: `web/js/social/lightbox.js`
- Modify: `web/index.html`

- [ ] **Step 1: 建立 lightbox.js**

建立 `web/js/social/lightbox.js`：

```js
// 照片全螢幕檢視：點圖放大，點任意處關閉。
const Lightbox = (() => {
  function open(src) {
    if (!src) return;
    const m = document.createElement("div");
    m.className = "lightbox";
    m.innerHTML = `<img src="${src}" alt=""><button class="lb-x" aria-label="關閉">✕</button>`;
    m.addEventListener("click", () => m.remove());
    document.body.appendChild(m);
  }
  return { open };
})();
```

- [ ] **Step 2: 載入 lightbox.js**

修改 `web/index.html`，在 `<script src="js/social/discover.js"></script>` 之後加入：

```html
<script src="js/social/lightbox.js"></script>
```

- [ ] **Step 3: 語法檢查**

Run: `node --check /mnt/c/Users/timmy/projects/trail-tracker/web/js/social/lightbox.js`
Expected: 無輸出。

- [ ] **Step 4: Commit**

```bash
git add web/js/social/lightbox.js web/index.html
git commit -m "feat(social): photo lightbox viewer"
```

---

## Task 8: 樣式 + smoke + SW + 部署

**Files:**
- Modify: `web/css/style.css`
- Modify: `scratchpad/social-smoke.js`
- Modify: `web/sw.js`

- [ ] **Step 1: 加入 Phase 3 樣式**

在 `web/css/style.css` 末端加入：

```css
/* ===== 社群 Phase 3 ===== */
.fc-vid { position: relative; }
.fc-vid img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--r-sm); display: block; }
.fc-play { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 28px; color: #fff; text-shadow: 0 1px 4px rgba(0,0,0,.6); }
.pv-photo { cursor: zoom-in; }
#feedMore { width: 100%; margin: 14px 0; }
.lightbox { position: fixed; inset: 0; z-index: 200; background: rgba(0,0,0,.92); display: flex; align-items: center; justify-content: center; }
.lightbox img { max-width: 100%; max-height: 100%; object-fit: contain; }
.lb-x { position: fixed; top: calc(12px + var(--safe-t, 0px)); right: 16px; background: rgba(0,0,0,.5); color: #fff; border: none; width: 38px; height: 38px; border-radius: 50%; font-size: 18px; cursor: pointer; }
```

- [ ] **Step 2: smoke 納入 lightbox**

修改 `scratchpad/social-smoke.js` 的模組清單，在 `"js/social/discover.js"` 之後加入 `"js/social/lightbox.js"`。

- [ ] **Step 3: 跑測試**

Run:
```bash
cd /mnt/c/Users/timmy/projects/trail-tracker
node scratchpad/test-media.js && node scratchpad/social-smoke.js
```
Expected: media 測試 `done`；smoke `ALL SOCIAL MODULES LOADED ✓`。

- [ ] **Step 4: 更新 SW**

修改 `web/sw.js`：bump `CACHE`（往上一版），ASSETS 的 social 區塊加入 `"./js/social/lightbox.js",`。

- [ ] **Step 5: 主程式 smoke**

Run: 既有 harness 的 `smoke.js`
Expected: `ALL FILES EXECUTED WITHOUT THROWING ✓` / `LOGIC OK`。

- [ ] **Step 6: Commit + 部署**

```bash
git add web/css/style.css scratchpad/social-smoke.js web/sw.js
git commit -m "feat(social): Phase 3 wiring — styles, smoke, SW (rich media + polish complete)"
git push origin main
```

---

## Phase 3 完成驗收

- [ ] 發文可加 1 支影片（>60 秒或 >50MB 會被擋下並提示）。
- [ ] 動態牆卡片顯示影片封面與 ▶；貼文詳情可播放影片。
- [ ] 詳情頁有人留言時，畫面即時跳出新留言（Realtime）。
- [ ] 作者可刪除自己的貼文。
- [ ] 動態牆超過 20 篇可「載入更多」。
- [ ] 點照片可全螢幕檢視，點一下關閉。
- [ ] `test-media.js`、`social-smoke.js`、主程式 smoke 全通過。

---

## Self-Review 紀錄

- **Spec coverage**：影片上傳（Task 2/3/4）、Realtime 即時更新（Task 1/5）、打磨＝分頁（Task 6）/刪文（Task 5）/全螢幕照片（Task 7）皆覆蓋設計「Phase 3 豐富媒體」。
- **Placeholder scan**：各步驟含實際 SQL/JS/指令；Task 5 因改動分散，明確標註「對照 Phase 2 版本套用三處修改」，非 TODO。
- **Type consistency**：`Media.validateSize/validateVideo/uploadVideo`、`Posts.createFromRecord({..., video})`、`Posts.remove`、`Posts.feed(mode, beforeISO)`、`Feed.card`、`PostView.open`、`Lightbox.open(src)`、`SocialUI.route` 與既有 Phase 1/2 介面一致。Storage 路徑沿用 `{user_id}/{post_id}/...`，符合 Storage RLS（首層資料夾=uid）。
