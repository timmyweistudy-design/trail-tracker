# 地圖圖資授權（商用）

App 收訂閱費＝商用，底圖圖磚要用「可商用授權」的來源。本檔記錄現況與待辦。

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
| NLSC 國土測繪中心 | 台灣電子地圖 | 政府開放資料，標註即可（已標「© 內政部國土測繪中心」）|
| 林業署 | 步道資料/分級 | 政府開放資料，已標註 |
| OpenStreetMap | 步道幾何 | ODbL，商用可、需標註（已標「© OpenStreetMap」）|
| AWS/Mapzen terrarium | 高程/3D 地形、步道累積爬升與海拔剖面（scripts/compute-gain.mjs 預先算） | 台灣一帶的來源是 SRTM、GMTED2010（USGS，公有領域）與 ETOPO1（NOAA），規定要標註：3D 地圖與步道頁頁尾都標「SRTM & GMTED2010 courtesy of the U.S. Geological Survey · ETOPO1 courtesy NOAA NCEI」（2026-10-03 補齊）|
| Google Places | 景點/美食/停車廁所 | 已標「Google 地圖」；結果只在記憶體放 30 分鐘（條款不准長期存）。金鑰已設限（2026-10-03）：只准 Places API (New)、只准 `https://trail-tracker-0ma5.onrender.com/*` 和 `capacitor://localhost/*`、SearchNearby 用量上限、預算警示。**換網域或加 Android 版要記得把新網址加進金鑰限制** |
| Wikimedia Commons | 步道照片 | CC 授權，每張已顯示作者＋授權 |
| iNaturalist | 生態目擊 | 只抓 CC0／CC BY／CC BY-SA 的照片（不可商用 NC、保留所有權利的不顯示），每張標拍攝者＋授權（2026-10-03 改）|
| Open-Meteo | 天氣、海拔 | ⚠️ **免費版只限非商用**。收訂閱前要買方案（US$29/月起），金鑰填 `config.js` 的 `OPEN_METEO_KEY` 就會改走商用端點。已標「Open-Meteo」|

## 非底圖的下一步（可上線後再處理）
- Open-Meteo：開始收費前買方案、填 `OPEN_METEO_KEY`。
- 商標：到智慧財產局註冊「循徑拾光 / Gather the Trail」名稱＋Logo。
