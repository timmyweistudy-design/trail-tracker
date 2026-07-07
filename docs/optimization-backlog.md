# 優化 Backlog（2026-07-07 起）

盤點全站可優化/美化項目。分「現在做」與「上架前/需 Mac 再做」。

## 🔴 上架前再做（需決策或 Mac，現在先掛著）

- [ ] **#1 iOS 付費合規 → 改用 Apple IAP（StoreKit）** — 選定做法 **(a)**：iOS 版把 Premium 從 Stripe web checkout 改接 StoreKit/IAP 外掛。
  - 現況：`web/js/config.js` `STRIPE_ENABLED=true`、`web/js/premium.js` 走 Stripe。
  - 為何：Apple 規定 App 內數位功能一律走 IAP，用外部 Stripe 會審核被拒。
  - 何時：**正式送 App Store 審核前**做（TestFlight 階段不擋）。
- [ ] **#21 HealthKit 整合** — 健行寫入 Apple「健康」（距離/步數/卡路里/爬升）。需 Capacitor health 外掛＋Swift＋Mac 建置測試。
- [ ] **#22 Live Activity／動態島** — 鎖定畫面即時里程。需自訂 Swift Widget Extension＋Mac。

## 🟢 現在做（web/PWA 可做並可驗證）

### 效能
- [ ] #2 首屏 JS 選擇性 build（concat/minify，保留 no-build 開發）
- [ ] #3 critical CSS inline、其餘延後
- [ ] #4 圖片 lazy-load＋寬高（食物/景點/隨手拍/社群照片）
- [ ] #5 trails-data 首屏只載可見+索引

### UX / 互動
- [ ] #6 Skeleton 骨架屏（探索列表/社群 feed）
- [ ] #7 列表頁「回頂部」浮鈕
- [ ] #8 搜尋防抖＋模糊/容錯
- [ ] #9 記錄「口袋模式」防誤觸
- [ ] #10 空狀態插畫

### 視覺 / 美化
- [ ] #11 深色模式全面稽核
- [ ] #12 prefers-reduced-motion（關 3D 飛行/confetti/導航旋轉）
- [ ] #13 成就/破紀錄動畫精緻化
- [ ] #14 分享圖卡多版型
- [ ] #15 分頁/sheet 過場動畫

### 無障礙
- [ ] #16 大字模式對比度稽核（WCAG AA）
- [ ] #17 aria-live 報讀（記錄數據/toast）
- [ ] #18 focus ring／鍵盤導覽

### 穩健性
- [ ] #19 離線送出佇列（發文/備份回線補送）
- [ ] #20 記錄中雲端快照（Premium）

### iOS（web/設定可做）
- [ ] #23 iPad 適配（版面 + Info.plist）

### 程式碼品質
- [ ] #24 app.js 再拆模組
- [ ] #25 inline style → CSS class
- [ ] #26 補測試（記錄/休息/爬升校正）
</content>
</invoke>
