# 原生推播（iOS APNs）設定清單

程式已全部寫好（客戶端 + 後端 + entitlements）。以下是**只有你能在後台做**的設定。
做完重跑 Codemagic build，推播就會通。網頁版維持 Web Push、不受影響。

## 1. Apple Developer（建金鑰）
1. [developer.apple.com](https://developer.apple.com) → Identifiers → `com.timmyweistudy.trailtracker` → 勾 **Push Notifications** → Save。
2. Keys → ＋ → 勾 **Apple Push Notifications service (APNs)** → 下載 **`.p8`**（只能下載一次）→ 記下 **Key ID**。
3. 記下 **Team ID**（10 碼）。

## 2. Supabase Edge Function Secrets（後端發推播用）
Supabase Dashboard → Project Settings → Edge Functions → Secrets，新增：
| Secret | 值 |
|---|---|
| `APNS_KEY_P8` | `.p8` 檔的**全文**（含 `-----BEGIN PRIVATE KEY-----` … `-----END PRIVATE KEY-----`） |
| `APNS_KEY_ID` | 步驟 1 的 Key ID |
| `APNS_TEAM_ID` | 你的 Team ID |

（選填：`APNS_BUNDLE_ID` 預設 `com.timmyweistudy.trailtracker`；`APNS_ENV` 預設 `production`，TestFlight/App Store 都用 production。）

> `send-push` 的觸發（notifications 表 INSERT webhook）與 `SEND_PUSH_SECRET` 你先前已設好，沿用即可。

## 3. 跑一支 SQL（建 token 表）
Supabase Dashboard → SQL Editor → 貼上 `supabase/schema-phase28-native-push.sql` 全文 → Run。
（建 `native_push_tokens` 表 + RLS。可重複跑。）

## 4. 重跑 Codemagic build
一樣 branch `main`、workflow「循徑拾光 iOS」。

⚠️ **可能的簽章卡點**：你在步驟 1 幫 App ID 開了 Push，但**舊的描述檔還沒有 Push 能力**。
若 build 在簽章步驟報「provisioning profile doesn't include the aps-environment entitlement」：
→ App Store Connect（或 developer.apple.com）→ Profiles → **刪掉舊的 iOS Distribution 描述檔** →
再重跑 build，Codemagic 的 `fetch-signing-files --create` 會重新產一個**含 Push** 的。

## 5. 實機測試
1. TestFlight 裝新版 → 登入社群 → 通知分頁應出現 **「開啟推播通知」** 按鈕（原生版本才有）。
2. 點它 → iOS 跳「允許通知」→ 允許。
3. 用**另一個帳號/裝置**對你按讚或追蹤 → 你的手機（App 關著）應收到系統推播。
   - 沒收到：檢查 Supabase Edge Function 的 log（send-push）、確認 secrets 沒貼錯、token 表有無資料。

---

## 運作原理（維運參考）
- App 端 `web/js/native-push.js`：要權限 → `PushNotifications.register()` → 拿 APNs token → 存 `native_push_tokens`。
- 有人按讚/追蹤/留言 → `notifications` 表 INSERT → DB webhook → `send-push` Edge Function。
- `send-push` 讀 `push_subscriptions`（網頁）發 Web Push、讀 `native_push_tokens`（原生）用 .p8 簽 ES256 JWT 走 APNs HTTP/2 發送。
- token 失效（APNs 回 410/400）會自動從表刪除。
