# 商店上架文案草稿（循徑拾光 Gather the Trail）

給 App Store / Google Play 用的文案草稿，可直接複製後再微調。隱私權政策網址：
`https://trail-tracker-0ma5.onrender.com/privacy.html`

---

## 基本資訊
- **App 名稱**：循徑拾光
- **英文名稱**：Gather the Trail
- **Bundle ID / 套件名**：`com.timmyweistudy.trailtracker`
- **分類**：健康與健身（主）／導航（次）
- **年齡分級**：4+（無不當內容；含使用者社群內容，建議勾選「使用者生成內容」）
- **支援語言**：繁體中文、English（App 內共 24 種語言）

---

## App Store

**副標題（Subtitle，30 字內）**
- 中：登山步道搜尋・GPS 路徑記錄
- 英：Hike trails, GPS tracking & stats

**宣傳文字（Promotional Text，170 字內）**
- 中：搜尋全台登山與親子步道，記錄你的每一步——里程、爬升、步數、卡路里，還有陪你成長的山林夥伴。
- 英：Find hiking & family trails across Taiwan, and track every step—distance, ascent, calories, and a trail buddy that grows with you.

**描述（Description）**
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
（英文版可依此翻譯；App 內已內建英文介面。）

**關鍵字（Keywords，100 字內，逗號分隔）**
```
登山,健行,步道,爬山,親子步道,GPS,路徑記錄,里程,爬升,離線地圖,台灣,hiking,trail,tracker
```

**What's New（版本更新說明，首版）**
- 中：首次推出！搜尋步道、GPS 記錄、3D 地形、山林夥伴與小隊同行。
- 英：First release! Trail search, GPS tracking, 3D terrain, trail buddy and team live-tracking.

---

## Google Play

**簡短說明（Short description，80 字內）**
- 中：搜尋台灣登山步道，GPS 記錄里程爬升，養山林夥伴，離線也能用。
- 英：Find Taiwan hiking trails, track your route with GPS, and grow a trail buddy.

**完整說明（Full description）**：同上 App Store 描述。

---

## 上架素材檢查清單
- [ ] App 圖示（已生成，1024×1024 來源在 `assets/icon.png`）
- [ ] 手機截圖：探索、步道詳情、記錄中地圖、結算、3D 地形、成就樹（各 2–8 張）
- [ ] 隱私權政策網址（已上線：/privacy.html）
- [ ] App Store：App 隱私「營養標籤」→ 勾選蒐集「位置」（用於 App 功能，不追蹤）、「聯絡資訊 Email」、「使用者內容」
- [ ] Play：資料安全表單 → 同上；並勾選「資料傳輸經加密」「可要求刪除資料」
- [ ] 年齡分級問卷
- [ ] 背景定位用途說明（審核常問）：用於登山記錄，使用者主動開始/結束

## 審核常見注意
- **背景定位**：Apple/Google 會要求說明為何需要背景定位——答：使用者按下開始記錄後，用於在螢幕關閉時持續記錄登山軌跡；不記錄時不取用。（Info.plist / Manifest 已寫用途）
- **Google 登入**：確認 Supabase 後台 Redirect URLs 已加 `com.timmyweistudy.trailtracker://login-callback`。
