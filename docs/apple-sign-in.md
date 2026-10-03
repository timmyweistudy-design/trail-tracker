# 開啟「使用 Apple 繼續」

> **目前狀態（2026-10-03 設定完成）**：已開啟。Services ID `com.timmyweistudy.trailtracker.signin`、Key ID `76DU2688D6`、Team ID `9QVB56C5B6`。
> ⚠️ **Supabase 的 Apple secret 在 2027-04-01 到期**，到期前要用同一個 `.p8` 重新產生並貼回 Supabase（Authentication → Providers → Apple → Secret Key），不然 Apple 登入會失敗。

App Store 審核規則 4.8：App 有 Google 登入，就要再提供一個保護隱私的登入方式，最保險的是「用 Apple 登入」。
程式已經寫好，只差 Apple 和 Supabase 的設定。設定完把 `web/js/config.js` 的 `window.SOCIAL_APPLE` 改成 `true`。

## 1. Apple Developer（developer.apple.com → Certificates, Identifiers & Profiles）
1. **Identifiers → App IDs** → 找到 `com.timmyweistudy.trailtracker` → 勾選 **Sign In with Apple** → Save。
2. **Identifiers → ＋ → Services IDs**：
   - Description：`Gather the Trail Web`
   - Identifier：`com.timmyweistudy.trailtracker.signin`（記下來，等一下叫「Services ID」）
   - 建好後點進去 → 勾 **Sign In with Apple** → Configure：
     - Primary App ID：選上面那個 App ID
     - Domains：`bkbkamvbczqdejrlpiqo.supabase.co`
     - Return URLs：`https://bkbkamvbczqdejrlpiqo.supabase.co/auth/v1/callback`
3. **Keys → ＋**：名稱隨意，勾 **Sign In with Apple** → Configure 選同一個 App ID → 下載 `.p8` 檔（只能下載一次，收好）。記下 **Key ID** 和右上角的 **Team ID**。

## 2. Supabase（Authentication → Sign In / Providers → Apple）
1. 打開 Apple。
2. **Client IDs**：填 Services ID（`com.timmyweistudy.trailtracker.signin`），再加一個 App 的 Bundle ID（`com.timmyweistudy.trailtracker`），用逗號分隔。
3. **Secret Key**：Supabase 頁面上有「Generate secret」的說明。用 Team ID、Key ID、`.p8` 內容產生一把 JWT 填進去。
   ⚠️ 這把 secret **6 個月會過期**，到期前要重新產生，不然 Apple 登入會失敗。可以在行事曆設提醒。
4. Save。

## 3. 打開開關
`web/js/config.js`：`window.SOCIAL_APPLE = true;` → push（網頁自動部署）→ Codemagic 重新打包 App。

## 4. 測試
- 網頁：社群分頁 → 「使用 Apple 繼續」→ 用 Apple ID 登入 → 回到 App 要是登入狀態。
- iPhone App：同上，登完會跳回 App。
- 選「隱藏我的電子郵件」也要能正常建立帳號。
