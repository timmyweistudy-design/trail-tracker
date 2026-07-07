# 用「專門的 Google 帳號」管理這個 App — 要改哪些

把個人帳號跟營運帳號分開是對的。以下分成 **A. 程式碼要改的**（我可以幫你改）和 **B. 外部服務要設定的**（要你本人操作）。

先決定：新的專門帳號 Email，例如 `gatherthetrail@gmail.com`（下面用 `<新信箱>` 代表）。

---

## A. 程式碼要改的（共 6 處，都是把個人信箱換成 `<新信箱>`）

| 檔案 | 用途 | 影響 |
|---|---|---|
| `web/js/app.js` `TT_OWNER_EMAIL` | **開發者測試面板的擁有者** | 只有這個 Email 登入才看得到 🛠 測試面板。換了才能用新帳號開面板 |
| `web/privacy.html`（2 處） | 隱私權政策聯絡信箱 | 使用者/審核看到的聯絡窗口 |
| `web/support.html` | 支援頁聯絡信箱 | App Store 必填 Support 頁的聯絡窗口 |
| `codemagic.yaml`（2 處） | 雲端建置完成通知信箱 | 建置好把 APK/結果寄到哪 |

> 這 6 處我可以**一次改好**——你把新信箱給我就行。

**不需要改**：Supabase 的網址與 anon key（`web/js/config.js`）是「專案憑證」不是「帳號」，除非你打算**重建一個新的 Supabase 專案**（見下）才要換。

---

## B. 外部服務要設定的（你本人操作）

### 1. Google Cloud / Google 登入 OAuth ★最重要
Google 登入的背後是一個 Google Cloud 專案裡的 OAuth 用戶端＋同意畫面。使用者按 Google 登入時看到的「App 名稱、支援信箱、開發者」就是這裡設定的。
- 用**新帳號**建 Google Cloud 專案 → 設定 OAuth 同意畫面（App 名稱「循徑拾光」、支援信箱＝`<新信箱>`、開發者聯絡＝`<新信箱>`、隱私權/服務條款網址填我們做好的頁）。
- 建 OAuth 用戶端，把 **Client ID / Secret** 填進 **Supabase ▸ Authentication ▸ Providers ▸ Google**。
- 這樣 Google 登入的門面就是新帳號、跟你個人無關。

### 2. Supabase（帳號驗證/資料庫/雲端備份/貼文）
現有專案：`bkbkamvbczqdejrlpiqo.supabase.co`。兩條路：
- **保留現有專案（推薦，資料不動）**：到 Supabase 專案 ▸ Settings ▸ Team，把 `<新信箱>` 加為 Owner／成員，之後用新帳號管理。`config.js` 不用改。
- **重建新專案**：資料要搬。這樣 `config.js` 的 URL＋anon key 要換成新專案的。除非你想全新開始，否則不建議。
- 另外記得：**Redirect URLs 要有** `com.timmyweistudy.trailtracker://login-callback`（原生登入用）。

### 3. Google Play Console（未來上架 Android）
用**新帳號**註冊（一次性 US$25），之後 Android 上架都在這個帳號。

### 4. 其他（跟 Google 帳號無關，看你要不要一起換）
- **Render（網頁部署）**：目前托管在某帳號。可用新的（或 GitHub）帳號登入管理；網址會變（除非綁自訂網域）。
- **GitHub（`timmyweistudy-design/trail-tracker`）**：程式碼倉庫。可保留、或轉到新帳號/組織。
- **Codemagic**：用 GitHub 登入即可，不需要 Google。
- **Apple Developer（iOS）**：用 **Apple ID**，跟 Google 帳號是兩回事，另外申請。

---

## 建議順序
1. 開好新 Google 帳號 → 把新信箱給我 → 我改程式碼那 6 處。
2. 到 Supabase 把新帳號加為專案成員（資料不動）。
3. 用新帳號建 Google Cloud OAuth（同意畫面填新信箱、隱私/支援網址），更新 Supabase 的 Google Provider。
4. 之後 Apple Developer（iOS）／Play Console（Android）用各自帳號註冊。
