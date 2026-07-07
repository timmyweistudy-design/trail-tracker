# 上架素材 store-assets

## ios-screenshots/
App Store 螢幕截圖，已是 **6.7 吋 iPhone 需求尺寸 1290×2796**，可直接上傳（Apple 現在只要 6.7 吋一組即可）。
- `01-explore.png` — 探索步道列表
- `02-detail.png` — 步道詳情＋地形地圖
- `03-me-stats.png` — 我的足跡數據
- `04-achievements.png` — 成就樹
- `05-recording.png` — 記錄中：即時里程/爬升/海拔曲線＋軌跡地圖
- `06-summary.png` — 結算頁：距離/時間/爬升/卡路里/步數＋軌跡
- `07-3d-terrain.png` — 3D 地形：步道路線疊在真實山勢＋衛星影像上

重新產生：用 Playwright（viewport 430×932、deviceScaleFactor 3 → 1290×2796）實開 App 截圖。
> ⚠️ 無頭 Chromium 沒有彩色 emoji 字型，少數 emoji（頭像🧑、🎲、⏸/⏹、🖐）會顯示成方框「□」。
> 全套 01–07 皆如此、風格一致；要完全乾淨版可在實機或裝了 `fonts-noto-color-emoji` 的環境重截。
> 想加「標語文字框」行銷版可再處理。

## 其他上架文件（在 docs/）
- `docs/build-app.md` — 建置與雲端出 App
- `docs/store-listing.md` — 商店文案草稿
- `docs/app-privacy-answers.md` — App 隱私「營養標籤」填答指引

## 線上頁面
- 隱私權政策：`/privacy.html`
- 支援頁：`/support.html`
