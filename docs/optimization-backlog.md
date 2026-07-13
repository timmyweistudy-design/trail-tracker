# 優化 Backlog（2026-07-07 起）

盤點全站可優化/美化項目。分「現在做」與「上架前/需 Mac 再做」。

## 🔴 上架前再做（需決策或 Mac，現在先掛著）

- [ ] **#1 iOS 付費合規 → 改用 Apple IAP（StoreKit）** — 程式碼已完成（RevenueCat，原生走 IAP、網頁維持 Stripe），剩商店/RevenueCat 後台設定與沙盒實測，步驟見 `docs/iap-setup.md`。
  - 現況：`web/js/iap.js`（IAP 模組）、`supabase/functions/revenuecat-webhook`、`supabase/schema-phase22-iap.sql` 都已就緒，`web/js/config.js` `IAP_ENABLED=false` 待後台設好後開啟。
  - 為何：Apple 規定 App 內數位功能一律走 IAP，用外部 Stripe 會審核被拒。
  - 何時：**正式送 App Store 審核前**做（TestFlight 階段不擋）。
- [ ] **#21 HealthKit 整合** — 健行寫入 Apple「健康」（距離/步數/卡路里/爬升）。需 Capacitor health 外掛＋Swift＋Mac 建置測試。
- [ ] **#22 Live Activity／動態島** — 鎖定畫面即時里程。需自訂 Swift Widget Extension＋Mac。

## ✅ 已完成（本輪，2026-07-07）
- [x] #7 列表/長頁「回到頂部」浮鈕
- [x] #13 破紀錄徽章彈入動畫（pbPop）
- [x] #17 aria-live 報讀（toast / 記錄狀態）
- [x] #4 圖片 lazy 補齊（隨手拍/燈箱）
- [x] #9 記錄「口袋模式」鎖定畫面防誤觸（長按解鎖，2 語言字串 ×24）
- [x] #14 分享圖卡多版型（森林/暮色/晨霧，每按一次換）
- [x] #23 iPad 直向適配（680px 置中欄＋步道清單雙欄，700–899px tier）

## ✅ 盤點後確認「原已實作」（不需重做）
- #6 Skeleton 骨架卡（.skel shimmer）
- #8 搜尋 180ms 防抖
- #10 空狀態插圖（EMPTY_ART）
- #11 深色模式（大量 html[data-theme=dark] 覆蓋）
- #12 prefers-reduced-motion（全域關動畫）
- #15 分頁/卡片過場（viewIn/rise/fadein）
- #16 對比度（--ink-faint 已調至 WCAG AA）
- #18 focus-visible（全域 outline ring）

## ⏭ 本輪跳過（有疑慮，依指示先擱置）
- [ ] #2 首屏 build/minify — **與 no-build 架構衝突**（README 明訂 Render 直吃 web/），Render 本就 gzip，效益有限。
- [ ] #3 critical CSS 抽離 — 156KB 手寫 CSS 抽 critical 易造成 FOUC/回歸；首訪後 SW 已快取。
- [ ] #5 trails-data 首屏拆分 — 探索即首屏、搜尋需全量，拆分複雜且效益低。
- [ ] #19 離線送出佇列 — 依賴 Supabase，本機無登入環境無法驗證送出/補送，觸及發文流程有風險。
- [ ] #20 記錄中雲端快照 — 本機崩潰復原（tt_active_rec 每 4 秒 + restore）已保護進行中行程；雲端版觸及備份格式且無法驗證。
- [ ] #24 app.js 再拆 — 純重構、動到大量全域函式與載入順序，回歸風險高、無使用者價值。
- [ ] #25 inline style → class — 多數為動態計算值必須留 inline，可搬的少、價值低。
- [ ] #26 補測試 — 記錄/休息邏輯依賴瀏覽器 API，已由 e2e（休息、模擬記錄、結算）覆蓋；純單元測試不易抽離。
</content>
</invoke>
