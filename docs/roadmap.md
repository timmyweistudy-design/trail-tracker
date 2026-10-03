# 循徑拾光：目前進度與待辦

最後更新：2026-10-03（文件整理後；SW `trail-tracker-v558`；`test:all` 33/33 實跑通過）
上架細節清單見 [launch-checklist.md](launch-checklist.md)。

## 現況

- **定位**：自用（`PERSONAL_MODE=true`，PRO 全開），暫不公開上架；新帳號註冊在 Supabase 關閉中。
- **平台**：iOS 用 Capacitor 6 + Codemagic（Xcode latest）出 TestFlight；網頁版在 Render（自動部署 main）；Android 未上架。
- **資料**：步道 2,939 條（林業署 118、OSM 關係 827、OSM 路徑 1,994）。林業署每月自動比對，OSM 每季自動比對，有差異會開 GitHub issue，比對一致時自動關閉。
- **品質**：`npm run check`（語法、i18n 覆蓋、單元測試、SW 版本、不當字詞清單同步）＋ `npm run test:all` 33 組全過；CI 每天跑。
- **健康度**（10/03 實測）：一般手機 0.55 秒出現步道清單，CPU 降速 4 倍 0.9 秒；近 30 天使用者端錯誤 9 筆，已修 8 筆（剩 1 筆是舊版 debug）；資料庫 15 MB。

## 2026-10-01～10-03 完成

**頁面改版（含資料可靠性）**
- 步道頁：地形算累積爬升、預估時間一致、今日狀態卡、出發前分頁、數字來源標籤、照片地圖合一。
- 記錄／結算頁：存移動時間、校正後重算卡路里、剩餘里程與預計完成、這趟的收穫。
- 夥伴頁：成就事實修正（聖母峰 8,849 m、全馬 42.195 km）、裝扮格線。
- 我的／分析：時速改用移動時間、趨勢刻度不誇大、我的與分析共用總數、時數標「含休息」、步數卡路里標「≈」。
- 社群：揪團免責提醒（含使用條款）、步道人氣隱私說明、大字版面。

**安全與法規**
- 不當字詞過濾全面版：擋繞法、多語詞庫、正常字例外；App 端（`web/js/moderation.js`）＋資料庫端（phase37，已套用）同一份清單。
- CSP：index.html 不再有 inline script，連線白名單；被擋的會記進錯誤紀錄。
- PRO 面板文案對齊實際功能（拿掉已不存在的「爬升速率／分段配速」）。
- 語言選單註明「中文以外是 AI 翻譯」。

**迷路防護**（消防署統計迷路約占山難 37%）
- 登山計畫書（步道頁出發前、留守面板）。
- 海拔 2,000 m 以上：入山申請卡＋「高山常常沒有訊號」卡（iPhone 衛星 SOS 台灣不能用、建議衛星通訊器）。
- 低電量提醒（≤30% 建議省電＋估算可撐時間）。iOS 要重新 build 才有，見下方待辦。
- 記錄中「附近步道 ›」：2 km 內有路線經過的步道，可改照那條走。

**工程**
- 英文字典拆到 `web/js/i18n/en.js`：中文使用者不下載（i18n.js 177→15 KB），英文由 `boot-head.js` 開機同步插入、不閃中文。
- 診斷／回報問題只限網頁版，App 隱藏。
- 修使用者端實際錯誤：照片輪播切地圖時讀不到 credit、Service Worker 檢查新版的未處理 Promise。
- Cloudflare Worker 名稱對齊（`wrangler.toml` name = `trail-tracker`）。

## 待辦

### 有期限
- [ ] **Android：升 Capacitor 8＋target API 36**。Google Play 2026-08-31 起強制，可申請延到 **11-01**（只有要上架 Android 才需要）。iOS 最低版本會跟著從 13 調到 15，要實機測。
- [ ] **重新出 iOS build（Codemagic）**：低電量提醒要新的原生方法（`TrailLive.battery`）；也包含 10/01 之後所有改版。TestFlight 每個 build 90 天到期。
- [ ] **Apple 登入 secret 2027-04-01 到期**：用 .p8 重產（步驟 `docs/apple-sign-in.md`）。

### 要你操作的
- [ ] Open-Meteo 商用金鑰（公開上架前；現在用免費端點）。
- [ ] Esri 金鑰設限（Referrer、只留 Basemaps）。
- [ ] GitHub secrets：`SUPABASE_DB_URL`、`BACKUP_PASSPHRASE`（每週備份用，`docs/backup.md`）。
- [ ] 上架前：撤銷 Supabase 個人 token＋刪 `~/.supabase/access-token`；解除自用模式；重開新帳號註冊（`launch-checklist.md` 送審段）。
- [ ] 商標註冊；請律師看使用條款、隱私權政策（這次新增揪團條款、步道人氣說明）。

### 要你決定的
- [ ] **更多離線底圖**（經建版、魯地圖等）：要先確認授權；不可商用的就不能放進付費版。
- [ ] **OSM issue #3**：木瓜坑瀑布步道的 OSM 關係已刪（App 先保留）、虎山親山步道 OSM 改名（App 保留官方名）。下次重抓 OSM 時一起處理。
- [ ] **社群端對端測試**：要另開一個 Supabase 測試專案，才能用真資料庫跑測試（目前用假資料＋本機 Postgres）。
- [ ] 小語種翻譯（高棉、緬甸、蒙古、尼泊爾等）要不要找母語者校；或上架時先只開中英日韓。

### 之後可以做
- [ ] 原生計步器（CMPedometer）讀真步數、寫入 Apple 健康（現在步數是距離÷步幅估算）。
- [ ] 沿途標記點：社群回報水源、營地、觀景點（從山友路況回報延伸）。
- [ ] 主題任務／每月挑戰跟在地店家或活動合作。
- [ ] OSM 步道重抓（上次 2026-07-30；`data/osm_crawled_at.txt`）。

### 評估過、刻意不做（除非情況改變）
- 首屏 build／minify、抽 critical CSS：跟 no-build 架構衝突（Render 直接吃 `web/`），Render 已 gzip、SW 已快取，效益小、回歸風險大。
- 步道資料首屏拆分：搜尋需要全量資料，拆了複雜、收益低。
- app.js 再拆、inline style 全改 class：純重構，沒有使用者價值；inline 多半是動態計算值。
- 記錄中雲端快照：本機已有崩潰復原（`tt_active_rec` 每 4 秒存一次＋開機還原）。

## 維護備忘

- **新增外部網域**（API、圖磚）：要加進 `web/index.html` 的 CSP `connect-src`，不然會被擋；被擋的會出現在錯誤紀錄（`CSP connect-src ...`）。
- **改不當字詞清單**：只改 `web/js/moderation.js` 的 `TT_BAD` → `node scripts/gen-badwords-sql.mjs` 重產 phase37 → 到 Supabase 執行 → 測試詞在 `scripts/tests/badwords-cases.json`。`npm run check` 會擋兩邊不同步。
- **翻譯**：英文在 `web/js/i18n/en.js`（不是 i18n.js 了）；24 語一起補，用 `python3 scripts/apply-translations.py rows.txt`（每列 25 欄，格式寫在檔頭）。
- **每次改 web/**：bump `web/sw.js` 的 CACHE 版本（check 會擋）。
