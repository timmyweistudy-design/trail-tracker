# 循徑拾光 上架前最終確認清單

**目前狀態（2026-07-18）**：build **1.0 (25)** 已上 TestFlight、在外部測試群組 → **公測收 feedback 中**。
下一步：收完意見 → 送 App Store 審核（填表步驟見 `docs/app-store-submit.md`）。

---

## ✅ 已完成

### 功能 / 修正
- [x] 生態資訊區塊（小黑蚊警示＋常見動植物＋iNaturalist 目擊）
- [x] 離線地圖免費額度 50MB → 10MB
- [x] 修 bug：PRO 閘門 fail-open、字典重複 key、翻譯吃空白
- [x] 上架前全頁面體檢（功能／效能／排版／UI）
- [x] 付費牆 4 條漏翻補齊（×24 語言）
- [x] **隨手拍相機**：改 Capacitor 相機外掛（原生不再黑畫面）、權限被拒友善引導、選單標籤翻譯
- [x] **原生推播 APNs**：客戶端＋後端＋entitlements，**實機驗證收得到**
- [x] 外部連結（導航/景點/美食）原生改走 Capacitor Browser
- [x] 離線地圖原生**實機飛航驗證正常**

### 訂閱 / 金流
- [x] 訂閱價：月 NT$100 / 年 NT$1000（App Store Connect 已改）
- [x] 7 天免費試用（試賣優惠，月/年都設）
- [x] iOS 內購（RevenueCat）實機購買成功

### 圖資授權（可商用）
- [x] Esri 底圖改 ArcGIS Location Platform 金鑰（授權端點 `ibasemaps-api`）
- [x] 地形底圖改 NLSC 台灣官方（授權端點無地形 raster）；魯地圖移除
- [x] 翻譯年糕移除 Google 非官方端點，只留 MyMemory
- [x] Wikimedia 照片補「作者＋授權」標示
- [x] 其餘（NLSC/林業署/OSM/AWS地形/iNaturalist/Open-Meteo）開放資料、已標註

### 成本（防噴錢，都不會被扣款）
- [x] Google Places：Demo 專案升級正式帳戶；金鑰限 Places API (New)＋應用程式限制「無」；**每日配額 320**（<免費 1 萬/月）
- [x] ArcGIS Esri：**未綁卡** → 免費額度用完自動停

### 商店素材
- [x] iOS 截圖 7 張（1290×2796）
- [x] 商店文案中英（`docs/store-listing.md`）
- [x] 隱私權政策頁 `/privacy.html`、支援頁 `/support.html`（線上）
- [x] App Privacy 問卷答案（`docs/app-privacy-answers.md`）
- [x] 審核測試帳號（已建）

---

## 🔄 進行中
- [ ] **TestFlight 公測**：發連結給山友、收 2–3 天 feedback（build 25）

---

## ⬜ 送審（使用者操作，步驟見 `docs/app-store-submit.md`）
- [ ] App Store Connect 填：副標/描述/關鍵字/What's New
- [ ] 上傳截圖（6.9" 那格）
- [ ] App Privacy 問卷（**別漏 Diagnostics ▸ Other Diagnostic Data**）
- [ ] **兩個訂閱一起加入本次版本送審**（IAP 每個中英中繼資料齊、審核截圖=升級面板）
- [ ] Age Rating 問卷（含 UGC=Yes → 約 4+）
- [ ] 選 build **1.0 (25)**
- [ ] App Review Information 填測試帳號 + 背景定位/登入/IAP 說明
- [ ] 送出審核（首版建議手動發佈）

---

## 🕐 上線後再做（不擋送審）
- [ ] 商標註冊「循徑拾光 / Gather the Trail」名稱＋Logo（智財局）
- [ ] 小隊加入碼：用非隊長帳號實測一次
- [ ] 刪測試用 RevenueCat customer `diag-key-check-20260716`
- [ ] 網頁 Stripe 價格改月 100/年 1000（Stripe 建新 Price + 更新 Supabase secret `STRIPE_PRICE_ID`/`_YEAR`；現況顯示 100 實收 60）
- [ ] Android 上架（RevenueCat Android 金鑰 + Play Console 訂閱產品 + Service Account）
- [ ] 原生推播 APNs：設定清單 `docs/push-setup.md`（已完成）

---

## 收尾流程（公測 → 上架）
1. 公測收 feedback；有 bug 就修、必要時重 build 換上群組（同版本小 build 多半免重審）。
2. App Store Connect 照 `docs/app-store-submit.md` 填完、選 build 25、兩訂閱一起送、送出。
3. 審核 1–3 天 → 過了手動發佈上架。
4. 上線後：停掉/讓 beta 自然到期（90 天）、處理上面「上線後」清單。
