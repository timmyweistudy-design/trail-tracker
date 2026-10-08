# 山林夥伴：交接文件（2026-10-07）

接手的人先讀這份，再看 [roadmap.md](roadmap.md) 的「維護備忘 → 山林夥伴」。
上一輪（寵物新一輪 26 項＋神龍尾巴重新設計）已全部推上 main（最後 `4e6f71a`，SW `trail-tracker-v663`），`npm run test:all` 40/40 通過。

---

## 1. 現在的樣子（這一輪新增／改動的地方）

### 檔案分工
| 檔案 | 這輪新增的東西 |
|---|---|
| `web/js/pet-art.js` | 神龍尾巴改成**程序產生**：`DSP` 多兩段貝茲（尾巴 114→約 210）、`dragonDeco()` 由中心線產生外形／腹帶／腹甲／鱗／背鰭、`PET_ART.dragon = { I0, DB, DT0, tail(中心線) }`；尾巴是 `.pr-tail6`（`scale(.1)`、座標×10 取整數，畫在頭和龍珠**後面＝最上層**）、尾鰭 `.pr-fluke`、尾尖接觸點 `.cp-tail`。季節帽 `santa`／`rabbit`。神龍畫布留白 `PADS[6]=125` |
| `web/js/pet-walk.js` | `ropeRender` 每格：身體用 `applyField`（只對身體節點）、尾巴用 `tailDraw(中心線)` 重畫。象鼻 IK：曲率 4 參數 `c0+c1u+c2u²+c3u³`、`TW=[.06,.22]`（只彎後段）、`solveN` 高斯消去、**不再伸長**（舊的 `TS` 拿掉了）。`tailReach` 15 步 |
| `web/js/pet-stage.js` | 作息 `sleepNow/setAsleep/wake`（22～6 睡）、時段權重 `TOD_W`／`weights()`、天氣動作 `shake/shiver/bask`、`play()` 玩松果、`guest()` 朋友的夥伴來訪、`photoSvgs()` 拍照用場景、節日燈籠 `lantern()`、舞台擺設 `.ps-props`、搖手機 `onMotion`→`react("dizzy")`、`react("rub")`、`flash()` 送出 `pet-fx` 事件（音效）。果實落點（神龍）`[82,108,136]` |
| `web/js/pet.js` | 陪伴：`petPatAff`（摸頭每天 3 次 +1）、`petAffRows`（「？」裡的親密來源表）、`PET_AWAY`（不在時做了什麼）、`petRecapLine`（健行感想）、`PET_GIFTS`＋`petGiftGive/Show`（親密滿帶禮物）、`petCompanion(box,i,upd)`（**整張重畫、只更新數字兩條路都要呼叫**）、`PET_TAPS_SP`（每隻台詞）、`PET_FEST`／`petFestival`／`petAnniversary`、`HAT_SEASON`／`hatSeason`、`drawPetPhoto`／`openPetPhoto`、`petGiftBerries`、`petSound`／`petBuzz`、`PET_PROP_EXTRA`／`petPropsAll`（舞台擺設）、`petDebugOn`（日記標 dbg）。進化儀式 `celebrateEvolve` 改剪影交替 |
| `web/js/debug.js` | 「夥伴新功能（試玩用）」一組 15 顆；「📊餵食效能紀錄」`ttDebug.feedPerf()`；`clearDebug` 會刪 dbg 日記與 dbg 禮物 |
| `web/js/native-live.js` ＋ `ios/App/TrailWidgets/HomeWidget.swift` | 小工具資料多 `petStatus`（dawn/day/dusk/eve/night 各一句），Swift 依時間挑、每個時段排一筆 timeline。**Swift 還沒編譯過** |
| `web/js/native-local-notif.js` | `Reminders.refreshPet()`：3 天沒出門，隔天 10:00 一則（ID 103，跟健行提醒同一個開關） |
| `web/js/social/petsocial.js` | `guestVisit(list)`：一天一次，打開好友列表後 2.5 秒朋友的夥伴走進舞台 |
| `scripts/pet-video.js` | 真機錄影 → 總表＋每格＋自動找跳格（ffmpeg：`FFMPEG` 環境變數或 PATH） |
| `scripts/check.js` | 新規則：行內 `//` 後面還有程式就擋 |
| `docs/ios-checklist.md` | iPhone 才會出事的坑 |

### 存檔鍵（localStorage）
- **進雲端備份**（`storage.js` BACKUP_KEYS）：`tt_pet_diary`、`tt_pet_gifts`、`tt_pet_gift_t`、`tt_pet_props`
- **裝置上的小狀態**（check.js 豁免）：`tt_pet_pat_day`、`tt_pet_seen`、`tt_pet_recap`、`tt_pet_woke`、`tt_pet_mood_last`、`tt_pet_sound`、`tt_pet_haptic`、`tt_pet_guest_day`

### 測試／除錯開關
- `window.__ps = { tod, season, wx, asleep, fest }`：強制時段／季節／天氣／睡著／節日（`ny`／`db`／`ma`）
- `window.__psNoIdle = true`：關掉隨機待機動作；`window.__psSpots = [...]`：指定果實落點
- `window.__hatSeasonAll`：季節配件當季；`window.__petPropsAll`：擺設全解鎖；`window.__petDbg`：之後寫的日記標 dbg
- `localStorage.tt_test_diary = "1"`：自動測試用測試里程切階段時，日記照常寫（否則會被當 debug 藏起來）
- `localStorage.tt_pet_woke = 現在`：測試開頭設，**不然深夜跑測試夥伴會睡著、點擊變成叫醒**
- **`ttClock`（2026-10-08 R1）**：夥伴所有跟時間有關的判斷都讀它，**新程式不要直接用 `Date.now()`／`new Date()`**（互動計時除外）。`ttClock.set(日期)`／`shift(ms)`／`reset()`；測試面板「⏩」那一排按鈕就是在撥它
- `PetStage.phase()`：現在在做什麼（錄影標籤、`scripts/pet-acceptance.js`、測試共用）；`PetStage.sync()`：睡／醒跟時間對一次

### 測試
- `npm run test:all -- --jobs=3`（40 組，約 13 分；一次全開會記憶體不足）
- 夥伴三支：`scripts/tests/pet-motion.test.js`（虛擬時間逐格；`PM_ONLY=6 PM_SEQ=1`）、`pet-stage.test.js`（`PS_SHARD=i/3` 分三組）、`pet-webkit.test.js`（Safari 引擎、畫到畫布外會紅）
- Playwright 要帶 `LD_LIBRARY_PATH=$HOME/pwlibs/root/usr/lib/x86_64-linux-gnu PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1`
- 交接與時間：`pet-handoff.test.js`（已知問題標 XFAIL，修好會 XPASS 轉紅）、`pet-clock.test.js`
- 七隻驗收接觸表：`node scripts/pet-acceptance.js [階段]` → `scripts/tests/out/acc/sheet-*.png`
- 效能：`node scripts/pet-perf.js 6`（CPU 降速 4 倍；數字會飄，新舊版本要交替跑幾次比）

### 這輪踩到的坑（別再踩）
1. **在一行中間插 `//` 註解會吃掉後面的程式**（犯了 5 次）→ 現在 check 會擋；行內說明用 `/* */`。
2. **單一擁有者偵測器之前一直是瞎的**：Chromium 149 起 `style.transform` 是每個 style 物件自己的屬性，攔原型沒用 → 改成在元素自己的 style 上裝 setter；「0 筆寫入」會判失敗。
3. **`renderPet` 有兩條路**：舞台沒變時只走 `petCardUpdate`（不重畫）。新的「打開夥伴頁要做的事」要同時接兩條（用 `petCompanion`）。
4. **`petSwapText` 有 170ms 延遲**，直接寫的字會被晚到的換字蓋掉 → 要換泡泡的字一律走 `petSwapText`。
5. **神龍的可達表（`warmReach6`）範圍變大會拖慢待機**：只算真的會用到的 x（75～143）。
6. **改了 `web/` 卻在全套測試跑到一半**：`check` 會因為 SW 版本沒 bump 而紅——不是真的壞。
7. 新的面板按鈕組在 `SECTIONS` 裡**拿不到 `ls`、`refresh`**，要用 `localStorage`、`renderPet`。
8. 句子裡有數字或名字：用整句＋`{n}`（`ttT("今天是我們相遇第 {n} 天！").replace("{n}", n)`），不要切片段，不然外語語序會亂。

---

## 2. 只有使用者能做的
- [ ] **Codemagic 重出 iOS build**：小工具狀態、3 天提醒、這一輪所有網頁改動都要 build 才進得了 App。
- [ ] **小工具要先開 App Group**（`docs/ios-widgets.md` 一次性設定），再設 `ENABLE_WIDGETS=1`。
- [ ] 在 iPhone 上看：神龍送果實（順便按「📊餵食效能紀錄」截圖回傳）、提示框位置、睡著／叫醒、拍照存圖、`<use>` 尾巴有沒有殘影（`ios-checklist.md`）。
- [ ] 日記裡如果已經混進以前 debug 的紀錄：測試面板「🧹清空夥伴日記」。

---

## 3. 下一輪待辦（使用者 2026-10-07 要的「在新功能基礎上再優化」清單，尚未開工）

> **2026-10-08：這 38 項已重新整理成修正案 [pet-plan.md](pet-plan.md)（對照程式找到 4 個問題、重排成 R1～R6）。開工前先看那份；下面保留原始清單。**

標記：工作量（小／中／大）；⭐＝建議先做；📱＝要重出 iOS。

### 一、這輪新功能的已知不足
1. ⭐ 神龍手機實測流暢度；吃緊就待機時只重畫尾巴段或降頻（小～中）
2. ⭐ 小工具 Swift 在 Codemagic 編譯驗證，CI 加「只編譯不簽章」（小，📱）
3. ⭐ 朋友來串門子改成打開夥伴頁就自己抓好友資料（現在要先渲染好友列表才觸發）（小）
4. ⭐ 節日日期改用農曆換算（現在寫死到 2030）（小）
5. ⭐ 睡覺時間可在設定調，或照健行習慣推估（小）
6. ⭐ 玩松果：照點舞台的位置丟、玩幾次會累（中）
7. ⭐ 禮物／感想／節日泡泡排隊，不要同時出現（小）

### 二、讓牠更像活著
8. 一天的節奏更細（午睡、看夕陽、每隻的作息個性）（中）
9. 記得你的習慣（週末出門前一晚期待；久沒出門表情慢慢變想念，不懲罰）（中）
10. 天氣更完整：起風毛／翅膀被吹動、颱風躲窩、寒流縮成一團（要接風速）（中）
11. 季節外觀：秋天沾落葉、冬天呼白氣、春天頭上停蝴蝶（中）
12. 睡著時的夢泡泡，畫最近走過的步道類型（中）

### 三、互動
13. 玩具變多（球、樹枝、毛線、雲朵），每隻有喜歡的；小東西可以當玩具（中）
14. 教小把戲（握手、轉圈、噴火），學會寫進日記（中～大）
15. 餵食變化：不同果實不同吃法；季節／地區限定果實（中）
16. ⭐ 拍照模式：選動作、加步道名標題、年底「和夥伴的一年」（中）
17. 記錄時地圖上的夥伴依種類移動、爬升多會喘（中）

### 四、收藏與成長
18. ⭐ 小東西擴充成 30～50 種圖鑑，跟地區／季節／步道類型掛鉤（中）
19. 舞台擺設：拖曳擺放、最多 5 件、整套主題（大）
20. 配件分類：帽子／圍巾／背包同時戴；地區配件成套（中～大）
21. 進化分支外觀（依健行風格，不影響等級）（大）
22. 每月「本月和夥伴」日記頁，可存圖（中）

### 五、社群
23. 串門子雙向：回禮、兩隻一起玩（中）
24. 小隊同行時大家的夥伴在地圖上一起走（大）
25. 可以把小東西送給朋友（中）
26. 好友列表看到對方夥伴現在在做什麼（小～中）

### 六、通知與原生
27. ⭐ 小工具顯示夥伴當下的樣子（睡圖、節日圖）、中大尺寸（中，📱）
28. 動態島：記錄中夥伴跟著走的小動畫（中，📱）
29. 提醒更聰明：避開不出門的日子、天氣好的週末早上才提醒（小）
30. Apple Watch／鎖定畫面顯示夥伴狀態（大，📱）

### 七、無障礙、多語、穩定
31. 讀屏播報每個動作與狀態變化（小）
32. 這輪約 150 句翻譯請母語者／另一模型抽查（中）
33. ⭐ 拍照／禮物／擺設視窗在 iPhone SE、最大字級下檢查（小）
34. ⭐ 雲端備份還原測試：日記、禮物、擺設、季節配件換手機後都回來（小）

### 八、開發工具與測試
35. 錄影分析自動對照逐格測試資料，指出是哪個動作在跳（小）
36. 夜間固定時段跑全套測試，抓跟時間有關的問題（小）
37. ⭐ 效能預算寫進測試：每隻待機／餵食 CPU 超過上限就紅（小）
38. 測試面板「時間快轉」：一鍵跳清晨／傍晚／節日／紀念日（小）

**建議順序**：一（1～7）＋33、34、37 → 18、13、16、27 → 8～12 → 14、19、21、24 留到再下一輪。
使用者的工作方式：每一輪先列清單給他挑；他說「全做不用停」才一路做到底；每項做完驗證（逐格測試＋截圖用眼睛看）、bump `web/sw.js`、`npm run check`、commit、push origin main，最後用中文統一回報。
