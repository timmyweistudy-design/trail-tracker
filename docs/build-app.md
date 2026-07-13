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

iOS 專案 `ios/` **已經建好並設定完成**（Info.plist 定位權限說明、背景定位模式、Google 登入 URL scheme、App 圖示、直向鎖定都配好了）。
但 iOS **一定要 macOS + Xcode** 才能編譯。你在 Windows，兩條路：

1. **借/租一台 Mac**（或 Mac in the cloud）：
   ```bash
   npm install
   npm run sync            # 複製最新 web/ 進 ios/
   cd ios/App && pod install && cd ../..   # 只有 Mac 能跑（裝原生依賴）
   npx cap open ios        # 用 Xcode 開啟 → 選簽章團隊 → ▶ Run 或 Archive 上傳 App Store
   ```
2. **雲端建置服務**（不用自己有 Mac）：如 [Codemagic](https://codemagic.io/) 或 [Ionic Appflow](https://ionic.io/appflow)，接上這個 Git repo，設定會自動跑 `pod install` 並編譯 iOS。
- 上架 App Store 需要 [Apple Developer Program](https://developer.apple.com/programs/)（US$99/年）。
- iOS 已內建：定位/背景定位權限說明字串、背景定位模式、Google 登入 deep link scheme。**Supabase 後台的 Redirect URLs 一樣要有** `com.timmyweistudy.trailtracker://login-callback`（與 Android 共用）。

---

## 已處理
- App 圖示、啟動畫面（深綠底 #16301f）— 由 `assets/icon.png`＋`assets/splash.png` 產生，指令：`npm run assets`。
- App 名稱、appId、直向鎖定、主題色已設定。
- 定位權限、背景定位、前景服務權限、Google 登入 deep link 都已寫進 `AndroidManifest.xml`。
- **Google 登入（原生可用）**：偵測到在原生 App 時，改用系統瀏覽器（Chrome Custom Tab）開 Google 登入，登完用 deep link `com.timmyweistudy.trailtracker://login-callback` 帶授權碼回來、以 PKCE 換 session。網頁版行為不變。
  - ⚠️ **要在 Supabase 後台設定**：Authentication ▸ URL Configuration ▸ Redirect URLs 加入 `com.timmyweistudy.trailtracker://login-callback`，否則登入回來會被擋。
- **背景定位（原生可用）**：裝了 `@capacitor-community/background-geolocation`，記錄時改用前景服務定位，**螢幕關掉/App 進背景仍持續記錄軌跡**。網頁版仍用瀏覽器定位（不變）。
  - ⚠️ 首次記錄時，Android 會請求定位權限，請選「**一律允許 / Allow all the time**」背景定位才會運作。

## 用外掛（改動後要 sync）
每次 `npm install` 或改了外掛，要 `npm run sync` 才會套進 `android/`。已裝：`@capacitor/browser`、`@capacitor/app`、`@capacitor-community/background-geolocation`。

## 上架前還要處理
- 隱私權政策網址、商店文案、螢幕截圖。
- App 內數位付費一律要走 IAP（外部 Stripe 會被 Apple 拒審，見 `optimization-backlog.md`）。
- 背景定位、Google deep link 兩項在 Android/iOS 都已完整（見「已處理」），但**只在網頁測過**，TestFlight/實機要各跑一次。

## 已完成（別再重做）
- Supabase Redirect URLs 已加 `com.timmyweistudy.trailtracker://login-callback`（2026-07 使用者確認）。
- iOS 的定位權限說明字串、`UIBackgroundModes: location`、`CFBundleURLTypes` scheme 都已寫在 `ios/App/App/Info.plist`（不必再進 Xcode 補）；`AppDelegate.swift` 也已把 `open url` 轉給 `ApplicationDelegateProxy`（少了它 iOS 的 `appUrlOpen` 不會觸發）。
