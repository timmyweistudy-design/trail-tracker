# iOS（WebKit）檢查清單

桌面版 Playwright WebKit 跑得過，**不代表 iPhone 上沒事**——下面每一條都是真的在 iPhone 上出過事、桌面重現不了的。
改到這些地方時，請在 iPhone 上親手確認一次（或請使用者錄影，用 `node scripts/pet-video.js 影片.mp4` 拆格找跳格）。

## 已知的坑

| 情況 | iPhone 上的症狀 | 解法／現況 |
|---|---|---|
| 置中用 `left:50%; transform:translateX(-50%)` 又在改文字 | 提示框出現 0.3 秒時往右下跳 40pt | 改用 `left:0; right:0; margin:auto; width:fit-content`（2026-10-07） |
| SVG 裡有 3D 轉身（rotateY）且畫到畫布外 | 超出 viewBox 的部分被直接裁掉（角色缺一塊） | 主角的畫布每階段留白（pet-art 的 PADS），`pet-webkit.test.js` 檢查有沒有畫到畫布外 |
| 長按 | 跳出「拷貝」藍框、系統選單 | `user-select:none`、`-webkit-touch-callout:none`、攔 `contextmenu`（舞台和角色都要） |
| 陀螺儀、加速度（視差、搖手機頭暈） | 不會自己動：iOS 13 起要在使用者點擊時 `requestPermission()` | 沒授權就沒有，功能要能在沒有感測器時照常用 |
| `navigator.vibrate` | Safari 沒有這個 API | App 裡走 Capacitor Haptics（`ttBuzz`）；網頁版 iPhone 沒有震動是正常的 |
| `AudioContext` | 沒在點擊裡建立／resume 就沒有聲音 | 夥伴音效在使用者打開開關、點擊時才建立，`state === "suspended"` 就 `resume()` |
| `<use>` 引用的路徑每格改 `d`（神龍尾巴、陰影剪裁） | 桌面 WebKit 正常；**iPhone 待確認**有沒有殘影 | 2026-10-07 尾巴重新設計後第一次這樣用 |
| Service Worker 快取 | 推上去了但使用者看到的還是舊版 | 每次改 `web/` 都要 bump `sw.js` 的 CACHE；請使用者把 App 完全關掉再開 |
| iOS App（Capacitor） | `git push` 不會更新 App | 要在 Codemagic 重出一次 build（見 build-app.md） |
| 效能 | 神龍送果實時 18～58 fps（使用者錄影） | 測試面板「📊餵食效能紀錄」在手機上量，截圖回傳對照 |

## 改完要在 iPhone 上看的
- 夥伴頁：待機、餵食（每一隻）、摸／抱／來回摸、睡著／叫醒、節日燈籠、拍照存圖
- 提示框（任何頁面）的位置
- 深色模式、大字級

## 第三版收尾：出一版 iOS（2026-10-09，R14）——使用者要做的，照順序勾

> 我這邊做完的：CI 加了「只編譯不簽章」的 iOS job（`.github/workflows/ios-build.yml`，改到 `ios/` 才跑；**小工具的 Swift 以前從來沒被編譯過，第一次跑如果紅了，把錯誤訊息貼給我**）；小工具戴帽子＋配件、睡覺時間換閉眼圖（跟著你在 App 裡設的睡覺時間）、節日掛燈籠；鎖定畫面／動態島的記錄卡片畫夥伴（走／休息／喘）；「我的」設定最下面顯示版本＋原生 build 號。

- [ ] **0. 先看 GitHub Actions 的「iOS compile check」是綠的**（repo → Actions；推上去後大約 10～20 分鐘）。紅的話先別出 build，把錯誤貼給我
- [ ] **1. Supabase 後台跑兩支 SQL**（SQL Editor 貼上→Run，可以重複跑）：`supabase/schema-phase40-pet-acc.sql`（好友看得到配件）、`supabase/schema-phase41-pet-social.sql`（送小東西、回訪、地圖上隊友的夥伴、封鎖規則）。沒跑之前 App 會自動退回舊行為，不會壞
- [ ] **2. 重新部署 `send-push` Edge Function**（多了「送小東西」「回訪」兩種通知的推播文字）：`supabase functions deploy send-push`
- [ ] **3. App Group 一次性設定**（照 [ios-widgets.md](ios-widgets.md)）→ Codemagic 環境變數 `ENABLE_WIDGETS=1`
- [ ] **4. Codemagic 出 build → TestFlight**（`git push` 不會更新 App；10/01 之後所有網頁改動、3 天提醒、低電量提醒、品牌啟動圖都要這一版才進得了 App）
- [ ] **5. iPhone 上逐項看**（有問題就截圖／錄影回報「哪一項」）：
  - [ ] 「我的」→ 設定最下面那行寫 `版本 v7xx · iOS x.x (build)`（回報問題時附上這行）
  - [ ] 主畫面小工具：小、中、鎖定畫面三種尺寸都能加；夥伴戴著現在的帽子＋配件；**晚上睡覺時間**變閉眼＋「呼呼大睡中」（改 App 裡的睡覺時間後，小工具跟著變）；節日前後一天掛燈籠（可以等中秋／新年，或請我用測試面板強制）
  - [ ] 開始記錄 → 鎖定畫面卡片和動態島：左邊是夥伴圖；暫停時變閉眼＋zzz、爬坡時有風的記號、文字「夥伴跟著走／在休息／喘口氣」
  - [ ] 3 天沒出門的提醒、低電量提醒會跳
  - [ ] 搖手機：第一次會問「動作與方向」權限
  - [ ] 拍照存圖（夥伴頁「拍照」→ 存到相簿）
  - [ ] 神龍餵食效能（測試面板「📊餵食效能紀錄」截圖給我）、神龍尾巴有沒有殘影（`<use>`）
  - [ ] 舞台上每一頂帽子的位置（尤其蝴蝶、毛毛蟲、玉兔耳）
  - [ ] 新功能：點兩下夥伴表演把戲（要先連續 3 天摸頭）、擺設三個位置、好友卡「N 小時前同步」
- [ ] **6. 回報的問題我逐一修，再出一版**
