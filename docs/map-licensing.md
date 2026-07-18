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
| AWS/Mapzen terrarium | 高程/3D 地形 | 開放資料，已標「Terrain: AWS/Mapzen」|
| Google Places | 景點/美食 | ⚠️ 確認 Google Cloud 有開帳單、金鑰設限、遵守 Places 條款 |
| Wikimedia Commons | 步道照片 | CC 授權，⚠️ 建議每張補顯示作者＋授權（目前只顯示圖）|
| iNaturalist | 生態目擊 | API 使用條款＋照片 CC，需標註來源（已標 iNaturalist）|
| Open-Meteo | 天氣 | 免費、商用需依其條款（CC-BY），已標「Open-Meteo」|

## 非底圖的下一步（可上線後再處理）
- Google Places：確認帳單與金鑰限制。
- Wikimedia 照片：補作者＋授權標示。
- 商標：到智慧財產局註冊「循徑拾光 / Gather the Trail」名稱＋Logo。
