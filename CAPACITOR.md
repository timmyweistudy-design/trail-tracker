# 把「循徑拾光」打包成真正的 Android App（Capacitor）

現有的 `web/` 網頁不用改，用 Capacitor 包成可安裝的 Android App（APK）。
專案設定檔已備好：`capacitor.config.json`、`package.json`。

---

## 一次性環境準備（在你的電腦，Windows 即可）

1. **Node.js**（18 以上）：https://nodejs.org → 安裝後 `node -v` 確認。
2. **Android Studio**：https://developer.android.com/studio
   - 安裝時勾選 **Android SDK**、**Android SDK Platform**、**Android Virtual Device**。
   - 第一次開啟會自動下載 SDK，照預設一直 Next 即可。
3. **JDK**：Android Studio 內建，不必另裝。

---

## 建立專案（在 repo 根目錄跑，一次性）

```bash
cd trail-tracker
npm install              # 安裝 Capacitor
npm run add:android      # 產生 android/ 原生專案
npm run sync             # 把 web/ 內容複製進去
```

> 之後每次改完 `web/` 的網頁，只要再跑 `npm run sync` 同步即可。

### （可選）自動產生 App 圖示與啟動畫面

用現有的 logo 產生各尺寸圖示：

```bash
# 把一張 ≥1024x1024 的方形圖放到 resources/icon.png（可用 web/icons/icon-512.png 放大）
npx @capacitor/assets generate --android --iconBackgroundColor "#16301f" --splashBackgroundColor "#16301f"
npm run sync
```

---

## 出 APK

```bash
npm run open:android     # 用 Android Studio 開啟專案
```

在 Android Studio 裡：

- **測試**：接上手機（開啟「開發者選項 → USB 偵錯」）或用模擬器，按綠色 ▶ Run。
- **出可安裝的 APK**：選單 **Build → Build Bundle(s) / APK(s) → Build APK(s)**，
  完成後點通知的「locate」找到 `android/app/build/outputs/apk/debug/app-debug.apk`，
  傳到手機點開即可安裝（手機需允許「安裝未知來源」）。

這樣就是一個可以分享給朋友側載的真 App 了，**完全免費**。

---

## 重要注意事項（影響功能）

App 內網頁的網域變成 `https://localhost`，和網站不同，有兩點要留意：

1. **Google Places（周邊美食 / 人文景點 / 設施）**
   你的 Places 金鑰有「HTTP 參照網址限制」只允許網站網域，App 內會被擋。
   解法二選一：
   - （簡單）改用下方「方案 B：指向線上網站」，App 直接載入 Render 網站、沿用網站網域，Places 正常。
   - （進階）在 Google Cloud 為金鑰新增允許參照網址，或改用 Android 套件名稱限制 + Android 版金鑰。

2. **Google 登入（OAuth）**：App 內的網頁 OAuth 轉址會失敗；**Email 驗證碼登入照常可用**（建議 App 主推 Email 登入）。

3. **Web Push 推播**：Capacitor 的 WebView 不支援 Web Push。要原生推播需另加 `@capacitor/push-notifications` + FCM 設定（之後可再做）。站內通知紅點不受影響。

---

## 方案 B：最省事「指向線上網站」（功能最完整）

若想讓 Places / 一切都跟網站一模一樣，把 `capacitor.config.json` 改成載入線上站：

```json
{
  "appId": "com.timmyweistudy.trailtracker",
  "appName": "循徑拾光",
  "webDir": "web",
  "server": { "url": "https://trail-tracker-0ma5.onrender.com", "cleartext": false }
}
```

再 `npm run sync`。差別：App 啟動需網路載入（少了離線殼），但所有金鑰/登入都沿用網站網域、零額外設定。
（預設我給的設定是 **方案 A：打包本機 `web/`**，可離線、但 Places 受上述限制。）

---

## iOS（之後若要）

需要一台 **Mac** + Apple 開發者帳號（每年 US$99）才能編譯與上架。
屆時 `npm i @capacitor/ios && npx cap add ios && npx cap open ios`，其餘同理。

---

## 上架 Google Play（之後若要）

1. Google Play 開發者帳號（一次性 US$25）。
2. Android Studio 出 **簽章過的 AAB**（Build → Generate Signed Bundle）。
3. 到 Play Console 建立 App、填商店圖文、上傳 AAB、送審。
