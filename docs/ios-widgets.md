# iOS 小工具與鎖定畫面即時顯示：開通步驟

程式都寫好了，但要先在 Apple 後台開一個「App Group」，主 App 才能把資料分給小工具。
這一步只能用你的 Apple Developer 帳號做，做完再打開 Codemagic 的開關。
開關沒開之前，iOS 建置和以前完全一樣，不會壞。

## 會多什麼

- **記錄中的鎖定畫面卡片與動態島**（iOS 16.2 以上）：
  - 步道名、公里數、計時、爬升、海拔。
  - 暫停時會變橘色。
  - 走完後成績會在鎖定畫面多留 10 分鐘。
- **主畫面小工具**（小、中兩種尺寸）：夥伴、連續天數、本週里程、本月挑戰進度。
- **鎖定畫面小工具**（圓形、長方形）：連續天數、本週里程。

## 一次性設定（約 10 分鐘）

1. 到 [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list)。
2. 建立 App Group：
   - 右上角的下拉選單選 **App Groups**，按 **+**。
   - Identifier 填 `group.com.timmyweistudy.trailtracker`。
3. 主 App 加入 App Group：
   - 回到 App IDs，點 `com.timmyweistudy.trailtracker`。
   - 勾 **App Groups**，按 Configure，選剛剛的 group，存檔。
4. 新增小工具的 App ID：
   - 按 **+**，選 App IDs → App。
   - Bundle ID 選 Explicit，填 `com.timmyweistudy.trailtracker.widgets`。
   - 一樣勾 **App Groups** 並選同一個 group。
5. 到 Profiles，把主 App 舊的 App Store 描述檔刪掉。
   - 開了新能力之後，舊的描述檔會失效。Codemagic 會自動重建。
6. 到 Codemagic 打開開關：
   - 進 Codemagic → 這個 App → Environment variables。
   - 新增 `ENABLE_WIDGETS` = `1`（放在 `signing` 群組）。
7. 重新建置一次 iOS。

## 建置時做了什麼

在 `npx cap sync ios` 之後，執行 `node scripts/ios-add-widgets.mjs ios/App`：

- 新增 `TrailWidgets` target：
  - 原始碼在 `ios/App/TrailWidgets/`。
  - 最低 iOS 16.2。
- `ios/App/Shared/TrailActivityAttributes.swift` 同時編進主 App 和小工具。
- 主 App 加入以下兩個檔案，並且嵌入小工具、設定相依：
  - `TrailLivePlugin.swift`：JS 的 `TrailLive` 外掛。
  - `MainViewController.swift`：註冊外掛用。
- 其他檔案的修改：
  - `Info.plist` 加 `NSSupportsLiveActivities`。
  - `App.entitlements` 加 App Group。
  - `Main.storyboard` 改用 `MainViewController`。

JS 端是 `web/js/native-live.js`。它會先問原生端有沒有這個功能，沒有就什麼都不做，所以網頁版和沒開小工具的 iOS 版都不受影響。

## 如果建置失敗

- **簽章錯誤，訊息提到 App Groups**：
  - 回頭確認第 3、4 步兩個 App ID 都勾了同一個 group。
  - 再刪一次舊的描述檔。
- **想先恢復原本的建置**：把 `ENABLE_WIDGETS` 改成 `0`。
