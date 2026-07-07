# App 隱私「營養標籤」填答指引

送審時 App Store Connect（App Privacy）與 Google Play（Data safety）都會問「你蒐集哪些資料、怎麼用」。
以下是依本 App 實際行為建議的填答，照著勾即可。原則：**都用於 App 功能、不做跨 App 廣告追蹤、不販售**。

## App Store Connect ▸ App Privacy

**Do you or your third-party partners collect data from this app?** → **Yes**
**Do you use data to track users?（跨 App/網站廣告追蹤）** → **No**

逐項（Data Type ▸ 用途 ▸ 是否連結到使用者身分）：

| 資料類型 | 蒐集？ | 用途 | Linked to user | Tracking |
|---|---|---|---|---|
| **Location ▸ Precise Location** | 是 | App Functionality（記錄路徑） | 是（登入雲端備份時） | 否 |
| **Contact Info ▸ Email Address** | 是（登入才會） | App Functionality、Account | 是 | 否 |
| **User Content ▸ Photos or Videos** | 是（發文才會） | App Functionality | 是 | 否 |
| **User Content ▸ Other User Content**（貼文/夥伴/小隊） | 是 | App Functionality | 是 | 否 |
| **Identifiers ▸ User ID** | 是（登入才會） | App Functionality | 是 | 否 |
| **Health & Fitness ▸ Fitness**（里程/步數/卡路里） | 是 | App Functionality | 是（登入雲端備份時） | 否 |

未登入使用時：位置與健身資料**只存在本機**、不上傳，可勾「用於 App 功能、不連結身分」。
> 若日後加入自動崩潰/錯誤回報上傳，要另外勾 **Diagnostics ▸ Crash Data**。目前診斷是手動複製，不自動上傳。

## Google Play ▸ Data safety
- **資料是否加密傳輸**：是（HTTPS）。
- **使用者可否要求刪除資料**：是（來信刪除／App 內清除本機）。
- 蒐集項目同上：位置、Email、相片、使用者內容、App 活動（健身數據）。用途皆「App 功能」，**未用於廣告或分享給第三方做廣告**。
- **背景定位**：Play 要另外在表單說明用途——「使用者主動開始記錄登山軌跡時，用於在背景持續記錄，不記錄時不取用」。

## App Store 其他必填欄位
- **隱私權政策 URL**：`https://trail-tracker-0ma5.onrender.com/privacy.html`
- **支援 URL（Support URL）**：`https://trail-tracker-0ma5.onrender.com/support.html`
- **行銷 URL（選填）**：可填同上或官網。
