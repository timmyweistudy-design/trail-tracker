# 打包成真 App（循徑拾光）

本專案用 [Capacitor](https://capacitorjs.com/) 把現有的網頁 App（`web/`）包成原生 App。
網頁邏輯不變，只是外面套一層原生殼，可安裝、可上架。

- **appId**：`com.timmyweistudy.trailtracker`
- **App 名稱**：循徑拾光
- 原生專案原始碼在 `android/`（已進版控）；`web/` 永遠是唯一真相，改完網頁跑一次 `npm run sync` 就會複製進原生專案。

---

## Android（你是 Windows，可自己做）

### 一次性安裝
1. 裝 [Android Studio](https://developer.android.com/studio)（內含 Android SDK）。
2. 裝 [Node.js](https://nodejs.org/)（LTS）。

### 每次要出 App
```bash
npm install          # 第一次才需要
npm run sync         # 把最新的 web/ 複製進 android/ 並更新外掛
npm run open:android # 用 Android Studio 開啟專案
```
在 Android Studio 裡：
- **測試機安裝**：接上手機（開開發者模式/USB 偵錯）或開模擬器 → 按 ▶ Run。
- **出安裝檔（APK，可直接傳給朋友裝）**：Build ▸ Build Bundle(s)/APK(s) ▸ Build APK(s)。
- **上架 Google Play（AAB）**：Build ▸ Generate Signed Bundle/APK ▸ Android App Bundle，第一次會請你建立**簽章金鑰（keystore）**，請**妥善保管**（之後更新 App 都要用同一把）。

### 上架 Google Play
- 需要 [Google Play 開發者帳號](https://play.google.com/console)（一次性 US$25）。
- 上傳簽章後的 `.aab`、填商店資訊、截圖、隱私權政策，送審。

---

## iOS（需要 Mac 或雲端建置）

iOS **一定要 macOS + Xcode** 才能編譯。你在 Windows，兩條路：
1. **借/租一台 Mac**（或 Mac in the cloud）：
   ```bash
   npm install
   npm i @capacitor/ios
   npx cap add ios
   npm run sync
   npx cap open ios      # 用 Xcode 開啟，Archive 後上傳 App Store
   ```
2. **雲端建置服務**（不用自己有 Mac）：如 [Codemagic](https://codemagic.io/) 或 [Ionic Appflow](https://ionic.io/appflow)，接上這個 Git repo 就能雲端編譯 iOS。
- 上架 App Store 需要 [Apple Developer Program](https://developer.apple.com/programs/)（US$99/年）。

---

## 已處理
- App 圖示、啟動畫面（深綠底 #16301f）— 由 `assets/icon.png`＋`assets/splash.png` 產生，指令：`npm run assets`。
- 定位權限（記錄路徑用）已加進 `AndroidManifest.xml`。
- App 名稱、appId、直向鎖定、主題色已設定。

## 上架前還要處理（需在實機測試）
- **Google 登入**：Google 擋 WebView 內的 OAuth，原生 App 的 Google 登入要改用 `@capacitor/browser`＋深層連結（deep link）流程。**Email 驗證碼登入在原生 App 可正常用**，先用 Email 登入即可。
- **背景定位**：若要「螢幕關閉時仍持續記錄軌跡」，需加原生背景定位外掛並設定前景服務通知（Android）。目前是前景記錄。
- 隱私權政策網址、商店文案、螢幕截圖。
