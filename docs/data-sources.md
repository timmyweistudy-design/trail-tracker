# 政府開放資料來源盤點

> 盤點日期：2026-06-26。本專案步道資料以政府開放資料為主。

---

## 一、主要來源

### 1. 林業及自然保育署 — 台灣山林悠遊網（首選）
- 入口：<https://recreation.forest.gov.tw/Service/OpenData>
- 步道相關資料集：
  | 資料集 | 內容 | 格式 |
  | --- | --- | --- |
  | 步道基本資料 | 全台步道基本資料 | CSV / JSON / XML |
  | 步道路況資訊 | 即時路況（只列有狀況者） | CSV / JSON / XML |
  | 步道基本資料（英文版） | 同上，英文 | CSV / JSON / XML |
- 其他可用：國家森林遊樂區、自然教育中心、**山區手機通訊點標示**（可用於 App 安全 / 收訊提示功能）

### 2. 政府資料開放平臺（data.gov.tw）
| 資料集 | 連結 | 備註 |
| --- | --- | --- |
| 列管登山步道 | <https://data.gov.tw/dataset/130417> | 列管登山步道清單（欄位待確認） |
| 觀光資訊資料庫（景點/步道/自行車道） | <https://data.gov.tw/dataset/7777> | 觀光署，含空間 GIS 資料，CSV/JSON/KML/SHP |

### 3. 地方政府開放平台（縣市郊山）
- 台北市資料大平臺：<https://data.taipei/>（親山步道等；列管步道約 154 條）
- 新北市資料開放平臺：<https://data.ntpc.gov.tw/>、步道 GPX：<https://newtaipei.travel/zh-tw/gpx-download>
- 台中市資料開放平臺：<https://opendata.taichung.gov.tw/>
- 內政部資料開放平臺：<https://data.moi.gov.tw/>

### ⚠️ 縣市來源自動接入現況（2026-06-26 實測）
從伺服器端自動抓取縣市平台目前受阻，原因各異：
- **新北市**：有 WAF，程式化請求被擋（Request Rejected）。
- **台北市**：dataset 搜尋頁為 JS 動態渲染；frontstage 搜尋 API 會忽略關鍵字。需先在入口手動找到該資料集的 **resource id (rid)**，再用
  `https://data.taipei/api/v1/dataset/{rid}?scope=resourceAquire` 取資料。
- 多數平台格式不一（CSV/JSON/KML/SHP/GPX）。

**結論**：管線已改為多來源 adapter 架構（見第五節），縣市來源在取得「確切的資料集下載連結 / rid」後，各補一支 mapper 即可接上。

---

## 二、關鍵發現

1. **林業署資料已內建難度分級欄位 `TR_DIF_CLASS`**（1~6 級，數字越大越難）✅
   - 117 條中分布：1級=49、2級=42、3級=22、4級=1、5級=2、6級=1
   - 我們仍可在此基礎上自訂「親子友善」等加值分級（政府資料無結構化親子標記，僅見於文字描述）。

2. **缺結構化「親子步道」欄位** ⚠️
   - 親子相關資訊只出現在 `GUIDE_CONTENT` 描述文字中（117 條裡僅 4 條明確含「親子」字樣）。
   - 親子友善需自行依「低難度 + 短距離 + 路面平緩 + 關鍵字」推算標記。

3. **座標為 TWD97（二度分帶）**，需轉 WGS84 才能在地圖顯示 ⚠️
   - `TR_ENTRANCE` 內 `x`（約 32 萬）、`y`（約 270 萬）為 TWD97 TM2 座標。

4. **格式不統一**（CSV / JSON / XML / KML / SHP / GeoJSON 並存）
   - 需經「清洗 → 統一格式」步驟，建議統一轉為 **GeoJSON**（路線幾何 + 屬性一起保存）。

3. **多源整合**
   - 同一條步道可能出現在多個來源，需設計去重 / 主鍵對應策略。

---

## 三、待確認事項

- [ ] 各資料集實際欄位（是否含海拔落差、路線座標、難度、親子友善標記）
- [ ] 授權條款（政府資料開放授權條款 第1版 為主，需逐一確認）
- [ ] 更新頻率與 API 穩定性
- [ ] 各來源步道的對應 / 去重方式

---

## 四、實測紀錄（林業署「步道基本資料」API）

- **端點**：`https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail`（JSON；`?format=xml` 可換格式）
- **英文版**：路徑加 `/EN/`
- **回應**：HTTP 200，約 160 KB，**117 條步道**（為林業署國家步道系統，不含地方政府郊山，需另外補各縣市來源）
- **編碼**：UTF-8（含 BOM，解析時用 `utf-8-sig`）

### 真實欄位結構
| 欄位 | 說明 | 範例 | 對本專案用途 |
| --- | --- | --- | --- |
| `TRAILID` | 步道代碼 | `002` | 主鍵 |
| `TR_CNAME` | 步道名稱 | 南澳古道 | 顯示 / 搜尋 |
| `TR_DIF_CLASS` | **難度分級 1~6** | `1` | ⭐ 分級基礎 |
| `TR_LENGTH_NUM` | 長度（公里，數值） | `1.5` | 分級 / 顯示 |
| `TR_LENGTH` | 長度（文字） | `1.5公里` | 顯示 |
| `TR_ALT` / `TR_ALT_LOW` | 最高 / 最低海拔（m） | 350 / 250 | ⭐ 算海拔落差 |
| `TR_PAVE` | 路面型態 | 木棧道、碎石山徑 | 分級 / 親子判斷 |
| `TR_TOUR` | 預估耗時 | 半天 / 一天 | 顯示 |
| `TR_ENTRANCE` | 入口座標陣列（TWD97 x/y/height） | [{x,y,height,memo}] | ⭐ 地圖定位（需轉 WGS84） |
| `TR_POSITION` | 所在地 | 宜蘭縣南澳鄉 | 篩選（地區） |
| `TR_MAIN_SYS` / `TR_SUB_SYS` | 所屬步道系統 | 中央山脈脊樑國家步道系統 | 分類 |
| `GUIDE_CONTENT` | 介紹文字（含親子等描述） | … | 詳情頁 / 親子判斷 |
| `TR_BEST_SEASON` | 最佳季節 | 四季皆宜 | 顯示 |
| `TR_PAVE` `CAR`/`M_BUS`/`L_BUS` | 交通可達性 | 1/0 | 篩選 |
| `TR_permit` / `TR_permit_stop` | 是否需入山證 / 是否停止開放 | 無 / 0 | 安全提示 |
| `TR_ADMIN` / `TR_ADMIN_PHONE` | 管理單位 / 電話 | 宜蘭分署 | 詳情頁 |
| `URL` | 官方頁面 | …/Trail/RT?tr_id=002 | 外連 |

### 對分級設計的啟示
- 直接可用 `TR_DIF_CLASS` 當基礎難度；**海拔落差** = `TR_ALT - TR_ALT_LOW`，搭配 `TR_LENGTH_NUM` 可做更細的自訂分數。
- **親子友善**建議規則（草案）：`TR_DIF_CLASS ≤ 2` 且 `TR_LENGTH_NUM ≤ 3` 且路面含鋪面（木棧道/枕木/碎石）→ 標記親子友善，再用 `GUIDE_CONTENT` 關鍵字加權。

---

## 五、多來源管線架構
`data/build_data.py` 的 `SOURCES` 為來源註冊表，每個來源 = `{name, fetch(), map(record)}`：
- `fetch()`：取回該來源的原始陣列
- `map(record)`：呼叫共用的 `make_trail(...)` 正規化器，輸出統一步道結構
- `collect()` 跑遍所有來源（單一來源失敗會略過不中斷），`merge()` 依「同名 + 入口座標 <150m」跨來源去重，保留欄位較完整者

**新增一個縣市**：照 `map_forestry` 寫一支 `fetch_xxx` / `map_xxx`，加進 `SOURCES` 即可；每筆 `id` 會自動帶來源前綴（如 `forestry-002`）。

---

## 六、OSM 全台步道爬蟲（已接入）
- **來源**：OpenStreetMap Overpass API（`route=hiking` 具名健行路線）
- **查詢**：`area["ISO3166-1"="TW"];relation["route"="hiking"]["name"](area.tw);out center tags;`
- **成果**：全台 **795** 條具名步道（去重後約 784 進入資料集），含名稱、座標（out center）、部分距離/網路標籤
- **限制**：原始多無難度/長度；地區用 22 縣市中心點就近指派（近似）
- **強健性**：`fetch_osm()` 含 3 鏡像 + 退避重試 + 本地快取 `osm_cache.json`（Overpass 高負載時常暫時 406/限流）
- **長度補強（已完成）**：`enrich_osm.py` 以 relation id 分批（40/批）抓 `out geom`，haversine 計算實際長度，寫入 `osm_lengths.json`（790 條，中位數 1.83 km、最長 89.8 km）。全台一次 `out geom` 會 406，分批可成功。
- **分級**：`build_data.py` 讀長度快取，用 `grade_by_length()` 估難度並標示「(估)」。全資料集 896 條已分級。
- **待強化**：加入海拔（DEM）讓估算更準；親子友善仍只用描述關鍵字保守判定（OSM 缺路面/地形）。

## 七、步道周邊美食（前端即時查詢）
- **來源**：OpenStreetMap Overpass（`amenity=restaurant|cafe|fast_food`、`shop=bakery`）
- **做法**：在前端開啟步道詳情時，依步道座標查附近 4 km 餐飲，依距離排序取前 8，`localStorage` 快取 7 天
- **理由**：避免對 ~900 條步道做批次爬取（受限流且耗時）；改為使用者實際查看時才查，且資料更新鮮
- **實測**：金瓜寮魚蕨步道周邊回傳公路飯店、永安茶棧、阿牛小吃部等；龍過脈周邊回傳阿香肉羹等（真實在地小吃）

## 步道幾何精煉（2026-07-04，refine_geo.py + apply_geo.js）

三條路的誠實結論：
- **(a) 碎片自動接合**：執行期 `chainSegments`（app.js）已把「主線最大連通元件」走完、含岔路折返、濾短自環，多數碎裂在執行期已妥善處理。離線再接合幫助有限，且預接合會把來回路徑併成雙倍——故不做。
- **(b) 官方 GPX**：林業署 BasicInfo API 無幾何欄位；其 ArcGIS（gis.forest.gov.tw）僅公開林班/崩塌/地籍等圖層，**無公開步道中心線**。官方幾何非可取得的開放資料 → 不可行，維持 forestry 借同名 OSM 幾何。
- **(c) 兩版 OSM 交叉比對**：資料夾已有 `osm_paths.json`(way) 與 `osm_routes_geom.json`(relation) 兩份 OSM 幾何（授權乾淨）。`refine_geo.py` 對「明顯過短(<0.65x 官方)」的步道就近彙整兩份片段成候選 → `apply_geo.js` **用執行期同一套 chainSegments 逐條驗收**（只在覆蓋更貼近官方、不超 1.6x 時採用）。結果：78 條候選採用 8 條、駁回 70 條（兩份 OSM 都缺料的補不出來）；整體模擬覆蓋 96.3%→96.7%、零回歸。

**重跑方式**（build_data.py 之後）：`python3 data/refine_geo.py && node data/apply_geo.js`。驗收關卡永遠用 app.js 的 chainSegments，故不會與執行期脫節。

## OSM 覆蓋擴充：放寬 highway/route 條件（2026-07-30）

**病灶**：使用者查「橫嶺古道」（陽明山，士林區永公路）搜不到。診斷後發現不是資料源沒有，是**我們的爬取條件把它濾掉**：

| 元素 | OSM 實際標法 | 舊爬取條件 | 結果 |
|---|---|---|---|
| relation 6000372「橫嶺古道」 | `route=foot`, `network=lwn` | `relation[route=hiking]` | 漏 |
| way 369954916「橫嶺古道」 | `highway=footway`, `surface=dirt`, 0.87km | `way[highway=path]` | 漏 |

不是特例，是系統性缺口。全台具名（名稱含步道/古道/登山/山徑/越嶺）的計數：

| tag | 條數 | 舊條件收嗎 |
|---|---|---|
| `highway=path` | 2172 | ✅ |
| `highway=footway` | **3282** | ❌ |
| `highway=steps/track/bridleway/cycleway` | **1740** | ❌ |
| `relation[route=hiking]` | 792 | ✅ |
| `relation[route=foot]` | **136** | ❌ |

漏掉的比抓到的多。台灣鋪面步道／親山步道常標 `footway`、石階步道標 `steps`、林道標 `track`。

**修法**：
- `crawl_paths.py`：查詢改成 `path`（不限名稱，維持舊行為）＋ `footway|steps|track|bridleway`（名稱須含步道關鍵字，否則整個城市的人行道都會進來）。
- `crawl_routes.py`、`build_data.py::fetch_osm()`：`route` 改 `~"^(hiking|foot)$"`。
- 續傳清單改名 `osm_paths_tiles_v2.json` / `osm_routes_tiles_v2.json` —— 條件變了，舊「已完成」清單不能沿用，否則全部格子被跳過（等於改了沒效果）。

**同時補的品質關卡**（放寬條件會放大既有的垃圾資料問題，實測單格就撈到「禁止通行」「防火巷」「成都路43巷」「2023/07/06市政府終於把列管步道清出來了。」）：
- `way_ok()`：剔除 `abandoned:/disused:` 前綴（實地已不存在）、`access=private` 且 `foot` 未明示可通行。
- `REJECT_NAME`：門牌巷弄／警語當名稱／方向片段描述／設施（橋、涼亭、停車場）／備註或日期當名稱／純通用詞單獨成名。
- `MIN_KM = 0.2`：低於此長度是單段殘片，在 App 上是壞資料（0.0x km 的「步道」）。
- `norm_name()`：正規化名稱空白（OSM 上有「蜜  蜂  巢  古  道」這種排版，不正規化會被當成另一條）。
- `build_data.py::ABANDONED` 擴充警語字（禁止/止步/中斷/拉繩/峭壁…），讓 relation 來源也一起擋。

**同時修掉的既有漏抓**：舊 `is_trail()` 對無 `surface`／無 `sac` 的 path 一律不收，把台灣郊山一堆名路線漏掉（單格就漏 35 條以上，含 9.44km 的三方向山路線、7.7km 的五指山系縱走、黃金稜線系列）。改為加一條正面判定 `ROUTE_RE`（路線|路徑|稜|縱走|保線|山腰|O型|環狀|徑|階|線$|道$|路$）。

**結果**：全台 **2217 → 2935 條（+718，+32%）**。relation 942 條有幾何（原 790）、way 10095 段（原 5049）。
各縣市全部增加、無一減少（南投 +117、臺北 +72、新北 +65、臺中 +61、宜蘭 +57…）。
`route=foot` 帶進整個「千里步道」環島路網 37 條（最長 240km）、樟之細路 188km、草嶺古道、鼻頭角步道、桃源谷、小錐麓步道。

**⚠️ 兩個查詢寫法的坑（都造成過靜默漏資料）**：
1. `fetch_osm()` 原本用 `area["ISO3166-1"="TW"][admin_level=2]` 過濾 relation —— area 對 relation 判定不可靠，
   實測漏掉 10 條有幾何的步道，含熱門的「南子吝步道」（relation 21013677，`route=hiking` 卻不在 area 結果裡）。
   已改用 bbox `(21.5,118.0,26.5,122.5)`（含澎湖/金門/馬祖）。
2. 續傳清單（`*_tiles*.json`）記「已完成的格子」。**改了查詢條件就必須換檔名**，否則所有格子被跳過＝改了沒效果。

**重跑方式**：`python3 data/crawl_routes.py && python3 data/crawl_paths.py`，再跑資料管線（見下節），最後 `python3 data/verify_trails.py <備份 trails.json>` 驗收。

### 資料管線完整重跑順序
```bash
python3 data/crawl_routes.py            # relation 幾何（hiking + foot）
python3 data/crawl_paths.py             # way 步道（path + footway/steps/track/bridleway）
python3 data/build_data.py              # → trails.json / trails-data.js / trails-geo.js
python3 data/enrich_osm.py              # relation 長度快取
python3 data/enrich_elevation.py        # 沿線海拔 → 累積爬升（新步道要補）
python3 data/build_data.py              # 再跑一次，讓爬升進到難度分級
python3 data/refine_geo.py && node data/apply_geo.js     # 幾何精煉
python3 data/enrich_waypoints.py && node scripts/apply-detail-fields.mjs   # 沿線地標
node scripts/pack-trails.mjs && node scripts/shard-geo.mjs                 # 前端打包／分片
python3 data/verify_trails.py data/trails.json.bak       # 驗收
node scripts/check.js                   # 專案自檢
```

**驗收腳本 `data/verify_trails.py`**：跑完管線用它確認三件事 ——(1) 與備份比對列出「舊有新無」的步道（回歸偵測，並區分「符合過濾規則＝有意剔除」與「不明消失＝要人工看」）；(2) 掃名稱抓廢棄林道／警語／巷弄／設施；(3) 必要欄位覆蓋率（長度/難度/地區/座標/介紹全滿，爬升與幾何 ≥90%）。

### ⚠️ 管線順序不可調換
`pack-trails.mjs`（打包）一定要放**最後**。`apply_geo.js` 讀的是 `build_data.py` 產出的原格式
`window.TRAILS = [...]`；若先打包成欄式格式，它會解析失敗並把整份 700KB 內容當錯誤吐出來，
完全看不出原因（已在 `apply_geo.js` 加明確守門）。同理 `build_data.py` 會重寫 `trails.json` 與
`trails-geo.js`，所以**重跑 build_data 之後，refine_geo/apply_geo 與 enrich_waypoints 都要跟著重跑**，
否則幾何精煉與沿線地標會被洗掉。

### 過濾規則的維護方式
中文地名用黑名單 regex 極易誤殺（已發生四次：`\d+號` 殺台中大坑1~8號步道、`吊橋` 殺鹿鳴吊橋步道、
全形「、」殺七星山北峰、北北峰箭竹林小徑、「以路/街結尾」殺巴拉卡舊水管路等 16 條）。
因此 `crawl_paths.py --selftest` 固化了 25 個「必須保留」與 29 個「必須剔除」的真實名稱，
並接進 `npm run check`。**改過濾規則後一定要跑它**，光看總條數看不出誤殺。
