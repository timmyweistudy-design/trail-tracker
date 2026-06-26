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
- **限制**：多數無難度/長度（僅 ~21 條有 distance、~3 條有難度線索）→ 列「未分級」；地區用 22 縣市中心點就近指派（近似）
- **強健性**：`fetch_osm()` 含 3 鏡像 + 退避重試 + 本地快取 `osm_cache.json`（Overpass 高負載時常暫時 406/限流）
- **待強化**：以 `out geom` 分區批次計算實際長度（全台一次查詢會 406），再據長度估難度

## 七、步道周邊美食（前端即時查詢）
- **來源**：OpenStreetMap Overpass（`amenity=restaurant|cafe|fast_food`、`shop=bakery`）
- **做法**：在前端開啟步道詳情時，依步道座標查附近 4 km 餐飲，依距離排序取前 8，`localStorage` 快取 7 天
- **理由**：避免對 ~900 條步道做批次爬取（受限流且耗時）；改為使用者實際查看時才查，且資料更新鮮
- **實測**：金瓜寮魚蕨步道周邊回傳公路飯店、永安茶棧、阿牛小吃部等；龍過脈周邊回傳阿香肉羹等（真實在地小吃）
