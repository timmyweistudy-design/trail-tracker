# 深連結 / Universal Links（分享的步道連結直接開 App）

## 現況
- **網頁 / PWA**：`https://<你的網域>/?trail=<id>` 或 `?post=<id>` 開啟時，App 會自動路由到該步道／貼文（`app.js` 的 `routeDeepLink()`）。**已可用、不需設定**。
- **原生 App**：`app.js` 已掛好 Capacitor `App` 的 `appUrlOpen` 監聽——只要 OS 把網址交給 App，就會解析參數路由到對應頁。**要 OS 願意把連結交給 App，得再做下面的關聯設定**（不然點連結只會開瀏覽器）。

## 要啟用「點連結直接開 App」需要三步（你本人操作）

### 1. iOS：Associated Domains
- Xcode / Apple Developer：在 App 的 **Signing & Capabilities** 加 **Associated Domains**，值填 `applinks:<你的網域>`（例：`applinks:gatherthetrail.com`）。
- 在網站根目錄放檔案 **`/.well-known/apple-app-site-association`**（純 JSON、**不能有副檔名**、Content-Type 要是 `application/json`、走 HTTPS、不能重導）：
```json
{
  "applinks": {
    "apps": [],
    "details": [
      { "appID": "<APPLE_TEAM_ID>.com.timmyweistudy.trailtracker", "paths": ["*"] }
    ]
  }
}
```
`<APPLE_TEAM_ID>` 在 Apple Developer 帳號右上或 Membership 頁看得到（10 碼）。

### 2. Android：App Links
- 網站根目錄放 **`/.well-known/assetlinks.json`**（HTTPS、Content-Type `application/json`）：
```json
[{
  "relation": ["delegate_permission/common.handle_all_urls"],
  "target": {
    "namespace": "android_app",
    "package_name": "com.timmyweistudy.trailtracker",
    "sha256_cert_fingerprints": ["<簽章 SHA256 指紋>"]
  }
}]
```
指紋來源：Play Console ▸ 應用程式完整性 ▸ 應用程式簽署，複製 **SHA-256**。
- `android/app/src/main/AndroidManifest.xml` 的 MainActivity 加 intent-filter（`android:autoVerify="true"`、`<data android:scheme="https" android:host="<你的網域>"/>`）。

### 3. 驗證
- iOS：Apple 的 [AASA validator](https://branch.io/resources/aasa-validator/) 貼網域檢查。
- Android：`adb shell am start -a android.intent.action.VIEW -d "https://<網域>/?trail=<id>"` 應直接開 App 到該步道。

## 備註
- 檔案要放在**網頁伺服器**（Render）根目錄的 `/.well-known/` 下，不是 App 裡。若用 Render 靜態站，把兩個檔放到 `web/.well-known/` 並確認回傳 `application/json`。
- Service Worker 不影響 iOS/Android 抓 AASA（系統直接抓、不經 App 的 SW）。
- 自訂 scheme（`com.timmyweistudy.trailtracker://…`，Google 登入回呼用的）本來就會進 `appUrlOpen`，所以做完上面關聯，Universal Link 與自訂 scheme 兩種都會被正確路由。
