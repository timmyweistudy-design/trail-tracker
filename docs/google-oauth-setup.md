# 用新帳號設定 Google 登入（OAuth）— 一步一步

目標：讓「用 Google 登入」的門面掛在營運帳號 `gatherthetrail@gmail.com` 下，跟你個人帳號無關。

**先準備好這幾個值（等下要貼）：**
- App 名稱：`循徑拾光`
- 支援/開發者信箱：`gatherthetrail@gmail.com`
- 隱私權政策網址：`https://trail-tracker-0ma5.onrender.com/privacy.html`
- 首頁/網域：`https://trail-tracker-0ma5.onrender.com`
- **Supabase 回呼網址（最關鍵，貼到 Google 的「已授權重新導向 URI」）：**
  `https://bkbkamvbczqdejrlpiqo.supabase.co/auth/v1/callback`

---

## Part 1 — Google Cloud（用 `gatherthetrail@gmail.com` 登入）

1. **登入**：先確定瀏覽器目前是用 `gatherthetrail@gmail.com`（右上角頭像確認），開 <https://console.cloud.google.com/>。
2. **建立專案**：頂端專案選單 → New Project → 名稱填 `Gather the Trail` → Create → 建好後切換到它。
3. **OAuth 同意畫面（Branding）**：左側搜尋或選 **「Google Auth Platform」/「OAuth consent screen」**。
   - User type / Audience：選 **External（外部）**。
   - App name：`循徑拾光`
   - User support email：`gatherthetrail@gmail.com`
   - App logo（選填）：可上傳 `assets/icon.png`。
   - App domain → Application home page：`https://trail-tracker-0ma5.onrender.com`
   - Privacy policy：`https://trail-tracker-0ma5.onrender.com/privacy.html`
   - Terms of service（選填）：可留空或填支援頁。
   - Authorized domains：加 `onrender.com` 和 `supabase.co`。
   - Developer contact information：`gatherthetrail@gmail.com`
   - Scopes：**不用加敏感範圍**，預設 `email`、`profile`、`openid` 即可（只拿基本資料）。
4. **建立 OAuth 用戶端**：左側 **APIs & Services ▸ Credentials ▸ Create Credentials ▸ OAuth client ID**。
   - Application type：**Web application**。
   - Name：`Trail Tracker Web`。
   - **Authorized redirect URIs ▸ Add URI**：貼上
     `https://bkbkamvbczqdejrlpiqo.supabase.co/auth/v1/callback`
   - Authorized JavaScript origins（選填但建議）：`https://trail-tracker-0ma5.onrender.com`
   - Create → 會跳出 **Client ID** 和 **Client Secret**，先複製起來（Part 2 要用）。
5. **發布 App**：回 OAuth 同意畫面 / Audience → 按 **「Publish app / 發布應用程式」**。
   - 因為我們只用非敏感範圍（email/profile），**發布後立即生效、不需要 Google 審核**。
   - 若停在「Testing 測試」狀態，只有你手動加的測試帳號能登入，且 7 天會失效——所以一定要 **Publish**。

## Part 2 — Supabase（把 Google 用戶端接上）

1. 用 `gatherthetrail@gmail.com` 登入 Supabase（已加為成員），進 `trail-tracker` 專案。
2. **Authentication ▸ Sign In / Providers ▸ Google**：
   - 打開 **Enable**。
   - **Client ID**：貼 Part 1 拿到的 Client ID。
   - **Client Secret**：貼 Part 1 拿到的 Secret。
   - （這頁也會顯示 Callback URL，應該就是上面那條 supabase.co/auth/v1/callback，跟 Google 那邊一致）
   - Save。
3. **Authentication ▸ URL Configuration ▸ Redirect URLs**：確認有這兩條
   - `https://trail-tracker-0ma5.onrender.com` （網頁版登入回來）
   - `com.timmyweistudy.trailtracker://login-callback` （原生 App 登入回來）

## Part 3 — 測試
- **網頁**：開 <https://trail-tracker-0ma5.onrender.com> → 社群 → 用 Google 登入，應該能登入且**看到的同意畫面 App 名是「循徑拾光」**。
- **測試面板**：用 `gatherthetrail@gmail.com` 登入後，連點左上標題 5 下 → 應該開得了 🛠 測試面板（因為 TT_OWNER_EMAIL 已改成這個信箱）。

## 常見卡點
- 登入後跳「redirect_uri_mismatch」→ Google 的 Authorized redirect URI 跟 Supabase callback 沒對齊，回 Part 1-4 檢查那條網址一字不差。
- 登入卡在「這個 App 未經驗證」→ 代表還在 Testing，回 Part 1-5 按 Publish。
