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
- 中：台灣步道搜尋・安全登山記錄
- 英：Taiwan trails & safe hiking

**宣傳文字（Promotional Text，170 字內，可隨時改、不用送審）**
- 中：一句話找步道，出發前看清路況與山頂天氣。留守人、求救卡、原路返回全部免費。還有陪你越走越大的山林夥伴，和一起爬的山社。
- 英：Find trails by just describing them, check closures and summit weather before you go. Check-in contacts, SOS card and backtrack are free for everyone. Plus a buddy that grows as you hike, and clubs to hike with.

**描述（Description）**
```
循徑拾光，是為台灣山友做的登山 App。

一句話找步道
・全台 2,900 多條步道，打「台北 3 小時內 有瀑布 不要太陡」就幫你篩好
・依難度、主題、地區、親子友善篩選，也能在地圖上找

出發前看清楚
・林業署封閉／坍方公告，收藏的步道路況變了會提醒
・依海拔修正的山頂天氣，雷雨、低溫、強陣風先警告
・山友即時回報路況、近期人氣
・地形地圖、3D 地形、海拔剖面

安全功能，全部免費
・留守人：設好預計下山時間，超時自動通知家人
・求救卡：經緯度、TWD97 座標、一鍵撥 112
・原路返回：沿你走來的軌跡帶你回去
・天黑倒數、偏離路線提醒、離線地圖

記錄每一步
・GPS 記錄里程、爬升、步數、卡路里，鎖螢幕也不中斷
・鎖定畫面與動態島即時顯示
・登頂收集冊：走到百岳、小百岳山頂自動蓋章

山林夥伴與山友
・養一隻陪你登山的夥伴，從一顆蛋走到神龍
・每日任務、每月挑戰、成就
・小隊同行看彼此位置；山社每週排行；拜訪好友的夥伴

PRO 會員（可免費試用 7 天）
無限離線地圖、進階分析、年度回顧與山行故事、3D 地形、軌跡坡度著色、GPX 匯入匯出、主畫面小工具、夥伴裝扮、建立山社等。
安全相關功能永遠免費。

開始你的下一條步道吧。
```
**Description（English）**
```
Gather the Trail is a hiking app made for Taiwan's mountains.

Find trails by describing them
・2,900+ trails across Taiwan. Type "Taipei waterfall under 3 hours, not too steep" and get a filtered list
・Filter by difficulty, theme, region or family-friendly, or browse the map

Know before you go
・Official Forestry Agency closures and landslide notices, with alerts when a saved trail changes
・Summit forecasts corrected for elevation, with storm, cold and gust warnings
・Live trail reports from other hikers, recent crowd levels
・Terrain maps, 3D terrain and elevation profiles

Safety tools, free for everyone
・Check-in contact: set your expected return and they're notified if you're late
・SOS card: coordinates (incl. TWD97) and one-tap call to 112
・Backtrack: follow your own track back out
・Sunset countdown, off-route alerts, offline maps

Track every step
・GPS distance, ascent, steps and calories, even with the screen locked
・Live Activity on the Lock Screen and Dynamic Island
・Summit log: reach a Top 100 or Hundred Hills peak and it's stamped automatically

A buddy and a crew
・Raise a trail buddy that grows from an egg into a dragon
・Daily quests, monthly challenges, achievements
・Team live-tracking, club weekly rankings, visit friends' buddies

PRO (7-day free trial)
Unlimited offline maps, advanced stats, year in review and hike stories, 3D terrain, slope-colored tracks, GPX import/export, Home Screen widgets, buddy outfits, creating clubs and more.
Safety features always stay free.

Find your next trail.
```

**關鍵字（Keywords，100 字元內，逗號分隔，不要重複 App 名稱與副標題已有的字）**
- 中：登山,健行,爬山,百岳,小百岳,郊山,親子步道,GPS,軌跡,離線地圖,山頂天氣,林道,古道,瀑布,求救,留守,集章
- 英：hiking,hike,trail,trek,Taiwan,GPS,tracker,offline map,peak,summit,mountain,walk,outdoor,SOS,route

**What's New（這一版）**
- 中：新增一句話找步道、山社、拜訪好友的夥伴與合照；山友路況可檢舉；更新更順暢。
- 英：New: describe-a-trail search, clubs, visiting friends' buddies with photos; trail reports can be flagged; smoother overall.

**截圖**：`store-assets/ios-6.9/zh/`（繁中）、`store-assets/ios-6.9/en/`（英文），各 6 張，1290×2796。

---

## Google Play

**簡短說明（Short description，80 字內）**
- 中：搜尋台灣登山步道，GPS 記錄里程爬升，養山林夥伴，離線也能用。
- 英：Find Taiwan hiking trails, track your route with GPS, and grow a trail buddy.

**完整說明（Full description）**：同上 App Store 描述。

---

## 訂閱產品文案（App Store Connect 建 IAP 時每個訂閱都要填）

在 App Store Connect 建 `tt_premium_month` / `tt_premium_year` 時，**每個訂閱、每個語系**都要填 Display Name 與 Description，漏填會卡在「缺少中繼資料」送不出審核。設定步驟見 `docs/iap-setup.md`。

**tt_premium_month（月訂閱）**
- Display Name 中：`Premium 月訂閱` ／ 英：`Premium Monthly`
- Description 中：`解鎖無限離線地圖、3D 地形、進階分析與年度回顧、無限收藏、足跡熱力圖與專屬外觀。按月自動續訂，可隨時取消。`
- Description 英：`Unlock unlimited offline maps, 3D terrain, advanced stats and yearly review, unlimited saves, heatmaps and exclusive looks. Auto-renews monthly, cancel anytime.`

**tt_premium_year（年訂閱）**
- Display Name 中：`Premium 年訂閱` ／ 英：`Premium Yearly`
- Description 中：`與月訂閱相同的完整功能，年繳更划算。按年自動續訂，可隨時取消。`
- Description 英：`Everything in Premium, billed yearly at a discount. Auto-renews yearly, cancel anytime.`

**Review Notes（審核備註，兩個訂閱都填）**
```
Premium 解鎖 App 內的進階功能：無限離線地圖、3D 地形地圖、進階分析與年度回顧、無限收藏、
足跡熱力圖、專屬外觀。訂閱畫面可在「我的」分頁點「升級 Premium」進入，
審核截圖即為該畫面。附 7 天免費試用。
```

**訂閱審核截圖**：上傳 App 內的升級彈窗畫面（顯示方案、價格、自動續訂說明與隱私權政策/使用條款連結）。這張截圖 Apple 必看——畫面上沒有那兩個連結會被以 Guideline 3.1.2 退件（程式碼已補，見 `web/js/premium.js` 的 `.pm-legal`）。

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
