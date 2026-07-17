# App Store 送審「照著填」清單（循徑拾光 iOS）

依 App Store Connect 的畫面順序整理，每欄都附可直接複製的內容。文案原稿見 `store-listing.md`、
隱私問卷見 `app-privacy-answers.md`、內購設定見 `iap-setup.md`。

> 前提：Apple Developer Program（US$99/年）已加入；Codemagic 已把最新 build 傳上 TestFlight。
> 網址：<https://appstoreconnect.apple.com>

---

## 0. 開始前準備一樣東西：審核用測試帳號

Apple 審核員要能登入看社群功能。到 App 裡註冊一個 Email 帳號（隨便一個你控制的信箱），
記下帳密——第 9 步「App Review Information」要填。不必是真人信箱，但要能收驗證碼登入一次。

---

## 1. 建立 App（若還沒建）
**My Apps ▸ ＋ ▸ New App**
- Platform：**iOS**
- Name：`循徑拾光`（App Store 顯示名，全球唯一；若被占用可用 `循徑拾光 Gather the Trail`）
- Primary Language：**Traditional Chinese**
- Bundle ID：`com.timmyweistudy.trailtracker`（下拉選，若沒有先去 Certificates ▸ Identifiers 建）
- SKU：`trailtracker`（自訂，內部識別，隨意）
- User Access：Full Access

---

## 2. App Information（左欄 General ▸ App Information）
- Subtitle（副標，≤30 字）：`登山步道搜尋・GPS 路徑記錄`
- Category：Primary **Health & Fitness**／Secondary **Navigation**
- Content Rights：不含第三方內容 → 勾「Does not contain, show, or access third-party content」
- Privacy Policy URL：`https://trail-tracker-0ma5.onrender.com/privacy.html`

---

## 3. Pricing and Availability（左欄）
- Price：**Free**（免費下載，付費走 App 內訂閱）
- Availability：All countries（或你要的地區）

---

## 4. 這個版本（左欄 iOS App ▸ 1.0 Prepare for Submission）

### 螢幕截圖（Screenshots）
拖曳 `store-assets/ios-screenshots/` 的 7 張（都是 1290×2796，對應 6.9" iPhone）到
**iPhone 6.9" Display** 欄。這一個尺寸就夠過審（Apple 會自動縮給小螢幕）。

### Promotional Text（宣傳文字，≤170 字，可事後改不必送審）
```
搜尋全台登山與親子步道，記錄你的每一步——里程、爬升、步數、卡路里，還有陪你成長的山林夥伴。
```

### Description（描述）
```
循徑拾光，是為台灣山友打造的登山步道 App。

搜尋步道
・全台登山步道與親子友善步道，依難度、主題、地區篩選
・步道詳情：里程、爬升、路況、周邊設施與交通
・3D 地形地圖，出發前先看清楚地勢

記錄你的足跡
・GPS 路徑記錄，即時里程、爬升、步數、卡路里
・導航模式（地圖跟著你的方向轉）
・背景記錄，鎖螢幕也不中斷
・離線地圖，山區沒訊號也能看

山林夥伴與社群
・養一隻陪你登山的夥伴，越走越進化
・成就樹：從初心者到傳說，一步步解鎖
・小隊同行，記錄時看到隊友的即時位置
・分享你的健行成果

資料安全
・雲端備份，換手機也救得回
・可隨時匯出自己的紀錄

開始你的第一條步道吧。
```

### Keywords（關鍵字，≤100 字，逗號分隔）
```
登山,健行,步道,爬山,親子步道,GPS,路徑記錄,里程,爬升,離線地圖,台灣,hiking,trail,tracker
```

### Support URL：`https://trail-tracker-0ma5.onrender.com/support.html`
### Marketing URL（選填）：同上或留空

### What's New in This Version（首版）
```
首次推出！搜尋步道、GPS 記錄、3D 地形、山林夥伴與小隊同行。
```

### （建議加英文語系）
右上 Language 下拉加 **English (U.S.)**，把 `store-listing.md` 的英文副標/描述/What's New 貼進去。
App 內已內建英文介面，App Store 有英文頁對海外能見度較好；不加也能過審。

---

## 5. App Privacy（左欄 ▸ App Privacy ▸ Edit）
照 `app-privacy-answers.md` 勾。重點：
- Data collection：**Yes**；Tracking：**No**（不做跨 App 廣告追蹤）
- 蒐集項目（用途都選 **App Functionality**，Tracking 全 No）：
  - Location ▸ Precise Location（Linked：Yes）
  - Contact Info ▸ Email Address（Linked：Yes）
  - User Content ▸ Photos or Videos、Other User Content（Linked：Yes）
  - Identifiers ▸ User ID（Linked：Yes）
  - Health & Fitness ▸ Fitness（里程/步數/卡路里，Linked：Yes）
  - **Diagnostics ▸ Other Diagnostic Data**（Linked：Yes）← 別漏，JS 錯誤會自動上傳，不申報＝與實際行為不符會被退

---

## 6. In-App Purchases（左欄 ▸ Monetization / In-App Purchases）
兩個訂閱 `tt_premium_month`、`tt_premium_year`（7/16 測購買時應已建好）。確認每個都：
- 有 **Display Name / Description（中＋英）**——見 `store-listing.md`「訂閱產品文案」；缺任一語系會卡「Missing Metadata」送不出。
- 月訂 NT$60、年訂 NT$600，各含 **7 天免費試用（Introductory Offer：Free Trial）**。
- 上傳一張 **審核截圖**＝App 內升級彈窗（「我的」▸ 進階分析→彈出的面板；畫面要看得到方案價格、自動續訂說明、隱私權政策/使用條款連結）。
- Review Notes（兩個都填）：
```
Premium 解鎖 App 內進階功能：無限離線地圖、3D 地形、進階分析與年度回顧、無限收藏、足跡熱力圖、專屬外觀。
入口：「我的」分頁 →「進階分析」或「升級 Premium」→ 彈出訂閱畫面（即審核截圖）。含 7 天免費試用。
```
> ⚠️ 首次送審：在版本頁把這兩個 IAP **一起提交審核**（版本頁下方 In-App Purchases 區塊勾選加入本次送審），否則 App 過了、訂閱還沒過，購買會失敗。

---

## 7. Age Rating（App Information 內 ▸ Age Rating ▸ Edit）
問卷幾乎全選 **None／No**。會影響分級的兩題：
- User Generated Content（社群貼文）→ **Yes**（有審核/檢舉機制）
- 其餘暴力/成人/賭博等 → None
結果約 **4+**。

---

## 8. Build（版本頁 ▸ Build ▸ ＋ 選 build）
選 Codemagic 剛傳上、狀態不是「Processing」的那個 build。
> 若跳「缺少出口合規 Export Compliance」：App 只用標準 HTTPS 加密 → 選
> 「使用的演算法都是 Apple 提供的標準加密」→ 通常可豁免（Info.plist 也可加
> `ITSAppUsesNonExemptEncryption=false` 一勞永逸）。

---

## 9. App Review Information（版本頁最下）
- Sign-In required：**Yes** → 填第 0 步建的測試帳號 Email／密碼（Apple 要能登入看社群）
- Contact：你的名字、電話、Email
- Notes（貼給審核員）：
```
・本 App 為登山步道記錄工具。GPS 背景定位僅在使用者按「開始記錄」後啟用，用於螢幕關閉時持續記錄軌跡，結束記錄即停止。
・登入支援 Google 與 Email 驗證碼；已附測試帳號。
・付費為 App 內訂閱（RevenueCat + StoreKit），入口在「我的」→ 進階分析/升級 Premium，含 7 天免費試用。
```

---

## 10. 送出
右上 **Add for Review ▸ Submit to App Review**。之後狀態：Waiting for Review → In Review → 通常 1–3 天。
可選 **自動發佈** 或 **手動發佈（過審後你按鈕才上架）**。首版建議手動，過了自己挑時間上。

---

## 常見退件與預防
| 退件原因 | 預防 |
|---|---|
| 3.1.2 訂閱資訊不全 | 升級畫面已含價格＋自動續訂說明＋隱私/條款連結（`premium.js .pm-legal`）；審核截圖要拍到 |
| 5.1.1 背景定位理由 | Notes 已說明「使用者主動開始記錄才用、結束即停」 |
| 2.1 審核員無法登入 | 提供可用的測試帳號（第 0 步）；確認 Supabase Redirect URLs 有 deep link |
| IAP 未一起送審 | 第 6 步把兩個訂閱加入本次版本一起提交 |
| 缺中繼資料 | 每個訂閱的中＋英 Display Name/Description 都要填 |

## 收尾（過審上架後）
- `iap-setup.md` 待辦：刪掉診斷用 RevenueCat customer `diag-key-check-20260716`
- 小隊加入碼用非隊長帳號實測一次
- Android 之後再走（需設 RevenueCat Android 金鑰 + Play Console 訂閱產品）
