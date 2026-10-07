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
