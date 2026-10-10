# 授權與條款（商用）

App 收訂閱費＝商用，用到的圖資、資料、字型、程式庫、音效都要是可商用授權。本檔記錄現況與待辦。
App 內給使用者看的版本是 `web/licenses.html`（我的 → 最下面「第三方授權」，社群設定也有）。

## 2026-10-10 全面授權檢查：結果
| # | 項目 | 問題 | 處理 |
|---|---|---|---|
| 1 | Google Places 美食／景點 | 標在詳情頁的 NLSC／Esri 地圖上。Google 條款：Places 結果畫在地圖上**只能用 Google 地圖** | ✅ 已拿掉地圖標記（`plotPoi` 刪除），只列清單；點一下用 Google 地圖開啟；附「Google Maps」文字標示 |
| 2 | Google Places 條款連結 | Google 規定 App 要有公開的使用條款與隱私權政策，並引用 Google 的服務條款與隱私權政策 | ✅ `terms.html`、`privacy.html` 加上 Google 地圖附加條款與 Google 隱私權政策連結 |
| 3 | Google Places 快取 | 只准長期存 `place_id`；我們只在記憶體放 30 分鐘、關 App 就沒 | 維持（屬同一次使用中的暫存，不寫硬碟）|
| 4 | NLSC `EMAP` | 離線下載、PRO 記錄預載存到 z16；一般 EMAP 在 z16 以上不屬開放資料，且服務雲條款排除「付費會員專用」| ✅ 離線一律改存 **`EMAP5_OPENDATA`、最多 z15**（z15 以下和 EMAP 逐位元相同，畫面不變）；z16+ 只線上看一般 EMAP、SW 不存；離線時拿 z15 放大裁切顯示。舊下載會自動搬家（z15 以下改名、z16 刪掉）。**還是建議打給測繪中心 04-22522966 問線上 z16–19 商用要不要申請** |
| 5 | Open-Meteo | 免費版限非商用，`OPEN_METEO_KEY` 是空的 | ⚠️ **要買**：開始收費前買方案（US$29/月起）填金鑰 |
| 6 | 字型 | 子集時把 OFL 授權欄位（name 13/14）裁掉了 | ✅ `build-font-subset.py` 保留 name 0–6/13/14 並重建；另附 `web/vendor/fonts/OFL.txt` |
| 7 | 第三方授權聲明 | MIT／BSD 程式庫、OFL 字型、OSM ODbL、CC0 音效都沒有統一的聲明頁 | ✅ 新增 `web/licenses.html`（含 MIT／BSD 全文、ODbL 衍生資料聲明）|
| 8 | MyMemory 翻譯 | 條款頁抓不到，商用免費額度不確定 | ⚠️ 待確認（貼文翻譯量小；要大量用就換有商用條款的翻譯服務）|
| 9 | Open Topo Data | 公開 API 每天 1000 次、沒明講可商用 | ⚠️ 只用在「沒高度的路線補海拔」；量大了要自架或換服務 |
| 10 | Esri | 走授權金鑰；離線保存衛星圖要符合 Location Platform 條款 | 現況 OK（金鑰已設、有用量上限）|
| 11 | 程式庫 | Leaflet BSD-2、MapLibre BSD-3、markercluster／supabase-js／Capacitor／RevenueCat 皆 MIT | ✅ 都可商用，聲明已放 licenses.html |
| 12 | 音效 | 22/22 CC0 | ✅ |


## Esri 底圖：改用 API 金鑰（授權端點）
程式已改成：`config.js` 的 `window.ARCGIS_API_KEY` 有值 → 走 **Esri 授權端點**
`ibasemaps-api.arcgis.com`（帶 `?token=`）；沒值 → 暫回免費公開端點（僅供未上線前開發）。

**開始收費前務必設好金鑰：**
1. 到 [developer.arcgis.com](https://developer.arcgis.com/) 註冊 **ArcGIS Location Platform** 帳號（有免費額度，基本地圖圖磚每月一定數量內免費，超過才計費）。
2. 建一把 **API key**，權限含 **Basemaps**。
3. 貼進 `web/js/config.js` 的 `window.ARCGIS_API_KEY = "..."`。
4. ⚠️ 在 ArcGIS 後台幫金鑰設**用量上限/警示**，避免被盜刷或爆量。
   （原生 App 無法用網址參照限制，靠用量上限＋監控。）
5. 重新部署（Render 自動）＋重跑 Codemagic build（原生 App 打包新 config）。

> 影響範圍：地形/衛星底圖、地形陰影、3D 衛星、離線地圖下載——全部會自動改走授權端點。
> SW 已把 `ibasemaps-api.arcgis.com` 納入圖磚快取（離線照常）。

## 魯地圖（happyman.idv.tw）：已移除
個人架設的伺服器、商用授權不明、且流量會壓對方主機 → **已從底圖切換移除**（2026-07-18）。
底圖現剩三種：**Esri 地形 / Esri 衛星 / NLSC 台灣官方電子地圖**。
（若日後想加回山徑圖，需先取得魯地圖作者商用同意，或改用其他可商用的等高線圖層。）

## 其他來源（現況／待辦）
| 來源 | 用途 | 授權狀態 |
|---|---|---|
| NLSC 國土測繪中心 | 台灣電子地圖 | ✅ **2026-10-10 已改**：離線只存 `EMAP5_OPENDATA`（z≤15），線上 z16+ 用一般 EMAP（見上表第 4 項）。以下是當時的查證紀錄：WMTS 服務裡 NLSC 把「OpenData」版分開列：`EMAP5_OPENDATA`（套疊等高線）、`EMAP6_OPENDATA`（不含等高線），標明「最大比例尺一萬八千分之一」——實測 OpenData 版**只到 zoom 15**，16 以上是放大 15 的圖。App 用的是**沒標 OpenData 的 `EMAP`、到 zoom 19**（16 以上有真的細節）＝很可能不在開放資料授權範圍內。官方條款網頁抓不到原文。做法二選一：①改用 `EMAP5_OPENDATA`（還多了等高線）、`maxNativeZoom: 15`（16 以上會糊）；②寫信問測繪中心（測繪信箱）`EMAP` 高縮放層級商用要不要申請。已標「© 內政部國土測繪中心」|
| 林業署 | 步道資料/分級 | 政府開放資料，已標註 |
| OpenStreetMap | 步道幾何 | ODbL，商用可、需標註（已標「© OpenStreetMap」）|
| AWS/Mapzen terrarium | 高程/3D 地形、步道累積爬升與海拔剖面（scripts/compute-gain.mjs 預先算） | 台灣一帶的來源是 SRTM、GMTED2010（USGS，公有領域）與 ETOPO1（NOAA），規定要標註：3D 地圖與步道頁頁尾都標「SRTM & GMTED2010 courtesy of the U.S. Geological Survey · ETOPO1 courtesy NOAA NCEI」（2026-10-03 補齊）|
| Google Places | 景點/美食/停車廁所 | 只列清單、**不畫在非 Google 地圖上**（2026-10-10）；已標「Google Maps」；結果只在記憶體放 30 分鐘（條款不准長期存）。金鑰已設限（2026-10-03）：只准 Places API (New)、只准 `https://trail-tracker-0ma5.onrender.com/*` 和 `capacitor://localhost/*`、SearchNearby 用量上限、預算警示。**換網域或加 Android 版要記得把新網址加進金鑰限制** |
| Freesound（夥伴音效） | **2026-10-10 音效暫停，App 已不附任何音檔**（以前用的全是 CC0；重做時再補） |
| Wikimedia Commons | 步道照片 | CC 授權，每張已顯示作者＋授權 |
| iNaturalist | 生態目擊 | 只抓 CC0／CC BY／CC BY-SA 的照片（不可商用 NC、保留所有權利的不顯示），每張標拍攝者＋授權（2026-10-03 改）|
| Open-Meteo | 天氣、海拔 | ⚠️ **免費版只限非商用**。收訂閱前要買方案（US$29/月起），金鑰填 `config.js` 的 `OPEN_METEO_KEY` 就會改走商用端點。已標「Open-Meteo」|

## 非底圖的下一步（可上線後再處理）
- Open-Meteo：開始收費前買方案、填 `OPEN_METEO_KEY`。
- 商標：到智慧財產局註冊「循徑拾光 / Gather the Trail」名稱＋Logo。
