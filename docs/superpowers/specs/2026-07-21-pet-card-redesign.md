# 山林夥伴卡重新設計（chibi SVG 角色 + 資訊分區）

日期：2026-07-21　狀態：已核准（mockup 通過），實作中

## 問題
夥伴卡把約 10 塊資訊直向堆在 emoji 右側，擁擠不直觀；夥伴只是 emoji，不生動、且在無 emoji 字型環境會變空框。

## 決策（使用者確認）
- 夥伴視覺：**手繪 SVG 動畫角色**，畫風 **圓潤可愛 chibi**，全 7 隻都要精緻（龍最需仔細）。
- 版面：**直向主角版型**（角色放大置中 → 對話泡心情 → 名字+Lv → 單一主進度(下一階)+下一隻縮圖 → 活力/親密迷你雙條 → 里程/同行/連續三格 chip → 動作列）。
- mockup 已核准：`docs/superpowers/specs/` 同批的 pet-mockup（Artifact）。

## 7 階角色（PET_STAGES 對應）
0 神秘之卵 / 1 草叢幼蟲 / 2 翩翩彩蝶 / 3 靈巧山狐 / 4 山林猛虎 / 5 初醒幼龍 / 6 騰雲神龍。
統一 chibi：大頭大眼、圓身、大地色系；viewBox 0 0 200 200。

## 架構
- 新檔 `web/js/pet-art.js`：`window.PET_ART`（每階 SVG inner 內容 + `svg(i, cls)`/`mini(i)` 包裝）。純資產、無邏輯。
  - 掛載於 index.html（pet.js 之前）、加進 sw.js 快取清單。
- 動畫用 CSS class（style.css）：`.pc-bob`(呼吸起伏)、`.pc-eye`(眨眼)、`.pc-tail`(擺尾)、`.pc-wing`(振翅)、`.pc-hover`(漂浮)；`prefers-reduced-motion` 全關。
- `renderPet()` 重寫成新版型；`#petEmoji` → 放 `PET_ART.svg(i)`；點擊反應沿用（tap 動畫 + PET_TAPS）。
- 夥伴手冊(dex)、進化 overlay(openEvolve)、社群夥伴(petsocial) 的 emoji 顯示改用 PET_ART（社群若跨檔麻煩則保留 emoji 後備）。
- 心情 emoji（😊😴…）保留（是表情、非角色本體），放進對話泡。

## 順手修
- **「同行 NaN 天」bug**：`daysSince(petHatch())` 在 hatch 未設/格式異常時回 NaN → 加防護（無效日期回 0 或以首筆紀錄日推算）。

## i18n
新 chip 標籤（累計里程/同行/連續/活力/親密）多數字典已有；缺的補 en+23 語言或用既有詞。物種名維持中文。

## 驗證
check（+新檔語法/i18n/SW 版本）、e2e（寵物頁渲染 + 25 語言）、Playwright 截圖逐隻看角色與版面、量水平溢出=0。SW bump。

## 不做
不改進化門檻/里程邏輯/成就/每日任務；不動棲息地漸層以外的配色系統。
