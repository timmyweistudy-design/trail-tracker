# 社群功能設計文件（循徑拾光 · 步道社群）

- 日期：2026-06-28
- 狀態：設計定案（待使用者最終複審）
- 範圍：把使用者的健行記錄/收藏/筆記延伸出一個社群分頁，做成「以步道旅行為核心」、可上傳照片影片、留言按讚、追蹤山友、互看彼此步道旅行的動態牆。

---

## 1. 目標與非目標

### 目標
- 新增「社群」分頁，呈現以**健行記錄**為核心的貼文動態牆。
- 使用者可把任一筆已完成的健行記錄**分享成貼文**，附照片/影片與心得。
- **追蹤**其他山友；對每篇貼文設定**公開 / 好友（互追）**可見度。
- 對貼文**留言、按讚**；用 handle **搜尋加好友**。
- 現有 App（步道搜尋、GPS 記錄）維持**免登入、離線優先**，社群為加值分頁。

### 非目標（v1 不做，YAGNI）
- 通知中心、私訊、限時動態、轉發。
- 檢舉/封鎖/內容審核（需嚴肅機制，列後續）。
- 整份本機記錄的雲端同步（可作 Phase 1.5，非社群 v1）。
- 影片伺服器端轉檔。

---

## 2. 整體架構

採 **前端直連 Supabase + Row-Level Security（RLS）**，不自建 API 伺服器。

```
現有 PWA（Render 靜態）
  · 步道搜尋 / GPS 記錄
  · 記錄 / 收藏 / 筆記 / 寵物 → localStorage（本機優先、離線可用）
  · 新增「社群」分頁  ───────────────┐
                                      ▼
                         Supabase（雲端，前端 SDK 直連）
   ┌──────────────┬─────────────────────┬──────────────────┐
   │ Auth          │ Postgres             │ Storage           │
   │ Google/Email  │ profiles / follows / │ media bucket      │
   │ 魔法連結       │ posts / post_media / │ 照片 + 縮圖 + 影片 │
   │               │ comments / likes     │                   │
   │               │  + RLS 權限規則       │                   │
   └──────────────┴─────────────────────┴──────────────────┘
```

**設計原則**
- 本機資料不強制上雲；「分享」是明確動作，只有被分享的內容才離開裝置。
- 社群分頁顯示的是雲端貼文流（自己 + 互追好友 + 公開）。
- 安全由 **RLS 在資料庫層**把關，前端繞不過。

### 與現有程式的關係
- 新增前端模組（暫定）：`js/social/` 下
  - `supa.js`（Supabase client 初始化、session）
  - `auth.js`（登入/登出/onboarding/handle）
  - `feed.js`（動態牆、貼文卡片）
  - `post.js`（發文、貼文詳情、留言、按讚）
  - `profiles.js`（個人頁、搜尋、追蹤）
  - `media.js`（照片壓縮/縮圖、影片封面、上傳）
- `config.js` 新增 `window.SUPABASE_URL` 與 `window.SUPABASE_ANON_KEY`（anon key 放前端是安全的）。
- 底部導覽新增「社群」分頁；其他分頁不變。

---

## 3. 資料模型（Postgres）

| 表 | 主要欄位 | 說明 |
|---|---|---|
| `profiles` | `id`(uuid, = auth.uid, PK)、`handle`(text, unique)、`display_name`、`avatar_url`、`bio`、`created_at` | 每位使用者一列；handle 供搜尋加好友 |
| `follows` | `follower_id`(uuid)、`following_id`(uuid)、`created_at`；PK(follower_id, following_id) | 我追蹤誰；雙向皆存在 = 互追 = 好友 |
| `posts` | `id`(uuid, PK)、`author_id`、`trail_id`(text, 對應 App 內步道 id, 可空)、`trail_name`、`distance_km`、`duration_ms`、`ascent`、`hiked_on`(date)、`caption`(text)、`track`(jsonb, 路線 GeoJSON, 可空)、`visibility`(text: 'public'\|'friends')、`created_at` | 一筆步道旅行貼文（記錄快照，自給自足） |
| `post_media` | `id`(uuid, PK)、`post_id`、`kind`('photo'\|'video')、`path`、`thumb_path`、`w`、`h`、`dur`、`ord`(int) | 一貼文多媒體；`ord` 控制顯示順序 |
| `comments` | `id`(uuid, PK)、`post_id`、`author_id`、`body`(text)、`created_at` | 留言 |
| `likes` | `post_id`、`user_id`、`created_at`；PK(post_id, user_id) | 按讚，複合主鍵防重複 |

**約束**
- `profiles.handle`：`^[a-z0-9_]{3,20}$`（DB check + 前端驗證）。
- `posts.visibility`：check in ('public','friends')。
- `posts.caption`：長度上限（例如 2000 字元）。
- `post_media.kind`：check in ('photo','video')。

**輔助函式**
- `is_friend(a uuid, b uuid) returns boolean`：判斷 a、b 是否互追（兩向 follow 皆存在）。供 RLS 使用。
- `can_see_post(p posts) returns boolean`：`p.visibility='public' OR p.author_id = auth.uid() OR (p.visibility='friends' AND is_friend(auth.uid(), p.author_id))`。

### Storage
- 單一 `media` bucket（**公開讀**，路徑用無法猜測的 UUID）。
- 路徑慣例：`{user_id}/{post_id}/{uuid}.jpg`、縮圖 `{...}/{uuid}_thumb.jpg`、影片封面 `{...}/{uuid}_poster.jpg`。
- 媒體隱私採**方案甲**（公開 bucket + UUID 路徑）；未來要嚴格好友限定再升級為私有 bucket + Edge Function 簽章短效網址（方案乙），架構不變。

---

## 4. 權限規則（RLS）

所有表啟用 RLS。

- **profiles**：`SELECT` 允許所有已登入者（才能找朋友）；`UPDATE/INSERT` 僅限 `id = auth.uid()`。
- **follows**：`SELECT` 允許所有已登入者（計算追蹤/粉絲）；`INSERT/DELETE` 僅限 `follower_id = auth.uid()`（只能決定自己追蹤誰）。
- **posts**：
  - `SELECT`：`can_see_post(posts)`。
  - `INSERT/UPDATE/DELETE`：僅限 `author_id = auth.uid()`。
- **post_media**：
  - `SELECT`：對應的 `posts` 列 `can_see_post` 為真。
  - 寫入：僅限該 post 為自己所有。
- **comments**：
  - `SELECT`：能看到該貼文才能看留言。
  - `INSERT`：`author_id = auth.uid()` 且能看到該貼文。
  - `DELETE`：留言作者或貼文作者。
- **likes**：
  - `SELECT`：能看到該貼文。
  - `INSERT/DELETE`：僅限 `user_id = auth.uid()` 且能看到該貼文。

---

## 5. 帳號與註冊流程

- **入口**：社群分頁；未登入顯示登入畫面。其他分頁維持免登入。
- **登入**：Google OAuth（建議主路徑）或 Email 魔法連結；session 由 Supabase 存 localStorage、自動續期。
- **首次 onboarding**（無 profiles 列）：
  1. 設定 handle（必填、唯一、`a-z0-9_` 3–20 字，即時可用性檢查）。
  2. display_name（Google 名字帶入、可改）、頭像（沿用 Google 照片）、bio（選填）。
  3. 建立 profiles 列 → 進動態牆。
- **新貼文預設可見度**：`friends`（安全側），可逐篇切換為 `public`。
- **一次性基礎設定**：Supabase 與 Google Console 登記 Redirect URL（正式 `trail-tracker-0ma5.onrender.com` + 本機開發）；iOS standalone OAuth 返回需實機驗證。

---

## 6. 畫面構成與 UX

- **底部導覽**新增「社群」分頁。
- **① 動態牆**：貼文卡片（作者 → 步道名+里程/爬升/時間膠囊 → 照片/影片輪播 → 心得 → 讚/留言數）。頂部切換「好友 / 探索（公開）」。下拉刷新、向下無限載入。
- **② 發文流程**：入口在健行總結頁或「我的」記錄列 →「分享到社群」。自動帶入步道名/里程/爬升/路線縮圖 → 選照片/影片 → 寫心得 → 選可見度 → 發布。未登入先引導登入。
- **③ 貼文詳情**：完整貼文 + 留言串 + 按讚；以 Supabase Realtime 即時更新數字（輕量）。
- **④ 個人頁**：頭像/handle/名字/bio、追蹤鈕、追蹤/粉絲數、可見貼文格狀牆；自己頁可編輯。
- **⑤ 搜尋加好友**：以 handle 或名字搜尋 → 個人頁 → 追蹤；互追成好友。

---

## 7. 媒體上傳

- **照片**：前端 canvas 壓縮（長邊 ≤ 1600px、JPEG ~0.8）+ 縮圖（≤ 400px），處理 EXIF 旋轉；一貼文最多 9 張。
- **影片**：v1 原檔上傳但限制 ≤ 60 秒、≤ 50MB；canvas 抓首幀作封面；一貼文最多 1 支。
- **流程與容錯**：先建 posts 列 → 上傳 Storage（進度條）→ 寫 post_media。單張失敗可重試；放棄則刪除已上傳檔與該 post，不留半截貼文。
- **容量**：免費 1GB，以照片為主、影片設嚴格上限；未來可換 R2/付費，僅換 Storage 後端。

---

## 8. 本機既有資料的處理

- 記錄/收藏/筆記/寵物仍留 localStorage（離線優先），不強制上雲。
- 分享時把該筆記錄的**摘要快照**（步道名、里程、爬升、路線縮圖）+ 媒體複製成雲端貼文；貼文自給自足，不依賴本機那筆是否存在。
- 帳號與本機資料獨立：換手機/清快取，本機資料用現有「備份/還原」，雲端貼文跟帳號回來。

---

## 9. 分階段實作

- **Phase 1｜土台**：建 Supabase 專案、資料表 + RLS + 輔助函式、Google/Email 登入 + handle 註冊、profiles、個人頁、社群分頁外殼。
- **Phase 2｜社群核心**：發文（分享記錄 + 照片）、動態牆（好友/探索）、追蹤/搜尋、貼文詳情、留言、按讚。
- **Phase 3｜豐富媒體**：影片上傳、Realtime 即時更新、打磨。

每個 Phase 各自走 spec → plan → 實作；本文件為整體架構，實作計畫由 Phase 1 開始。

---

## 10. 安全、成本、測試

### 安全
- 核心防線：RLS（資料庫層強制）。
- anon key 放前端安全；**service_role key 絕不進前端**。
- 驗證：handle 格式、心得長度、媒體型別/大小（前端 + DB check）。
- v1 無檢舉/封鎖（列風險），靠 Supabase 內建速率限制擋濫用。
- 媒體隱私採方案甲（公開 bucket + UUID 路徑），已知取捨：URL 被轉傳則知道網址者可看；要嚴格再升級方案乙。

### 成本
- Supabase 免費額度：500MB DB、1GB 儲存、5 萬 MAU、2GB/月流量。
- 最先碰到的瓶頸通常是流量（看圖）；以壓縮 + 縮圖 + 快取緩解。

### 測試
- **RLS 權限測試（最關鍵）**：非好友讀不到 friends 貼文、不能改他人資料、不能對看不到的貼文留言/按讚。
- 既有 smoke harness 擴充 Supabase mock，測新模組可載入。
- 手動：iOS standalone 登入流程實機驗證；弱網上傳容錯。

---

## 11. 已知風險

- iOS 加到主畫面（standalone）的 OAuth 返回行為需實機驗證。
- 無內容審核機制；公開貼文可能出現不當內容（v1 接受，後續加檢舉/封鎖）。
- 影片容量壓力（免費額度有限）。
- 媒體方案甲的隱私限制（如上）。
