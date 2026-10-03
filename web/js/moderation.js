// 社群內容把關（App Store 1.2：有使用者內容的 App 要有「同意社群規範」＋「過濾不當內容」＋檢舉＋封鎖）。
// 1. ttRulesGate()：第一次發文／留言／回報路況／建山社／揪團前，先同意社群規範（只問一次，存 tt_rules_ok）。
// 2. ttBadWord(text)：擋明顯的髒話、色情、賭博廣告。資料庫端 schema-phase35-moderation.sql 有同一份清單當最後防線。
//    清單刻意保守：寧可漏掉一些，也不要把「樹幹」「幹線」這種正常字擋掉。改清單時兩邊一起改。
const TT_BAD_ZH = ["幹你娘", "幹您娘", "幹林娘", "操你媽", "操你妈", "肏", "屌你", "雞掰", "機掰", "鸡掰", "雞巴", "鸡巴", "婊子", "賤人", "贱人", "王八蛋", "去死吧", "約砲", "约炮", "援交", "娛樂城", "娱乐城", "博弈網", "百家樂", "百家乐", "代儲"];
const TT_BAD_EN = ["fuck", "fucking", "motherfucker", "shit", "bitch", "cunt", "nigger", "nigga", "faggot", "asshole", "porn", "xxx"];
const _TT_BAD_RE = new RegExp(`(${TT_BAD_ZH.join("|")})|\\b(${TT_BAD_EN.join("|")})\\b`, "i");
function ttBadWord(...texts) {
  for (const t of texts) { const m = String(t || "").match(_TT_BAD_RE); if (m) return m[0]; }
  return null;
}
// 送出前檢查；有問題就提示並回 false
function ttCleanOk(...texts) {
  if (!ttBadWord(...texts)) return true;
  if (typeof toast === "function") toast(ttT("內容有不適當的字詞，改一下再送出"));
  return false;
}

function ttRulesAgreed() { try { return localStorage.getItem("tt_rules_ok") === "1"; } catch (e) { return false; } }
async function ttRulesGate() {
  if (ttRulesAgreed()) return true;
  const site = TT_SITE_URL();
  const rules = [
    "不騷擾、不歧視、不發色情或暴力內容",
    "不發廣告、詐騙、賭博",
    "路況照實回報，不亂報",
    "不貼別人的個資，也不貼不是你拍的照片",
  ];
  // 對話框是 white-space: pre-line → HTML 不能有換行縮排，不然會變成大片空白
  const msg = `<div class="rules"><b>${ttT("加入前，先看一下社群規範")}</b>`
    + `<ul class="rules-list">${rules.map(r => `<li>${ttT(r)}</li>`).join("")}</ul>`
    + `<p class="rules-note">${ttT("違規內容被檢舉後會先藏起來，我們會在 24 小時內處理，嚴重的會停用帳號。看到不舒服的內容可以檢舉，也可以封鎖對方。")}</p>`
    + `<a href="${site}/terms.html" target="_blank" rel="noopener" class="rules-link">${ttT("完整使用條款")}</a></div>`;
  const ok = await ttChoice({ html: msg }, [
    { label: ttT("先不要"), value: false, cls: "ghost" },
    { label: ttT("我同意"), value: true, cls: "primary" },
  ]);
  if (ok === true) { try { localStorage.setItem("tt_rules_ok", "1"); } catch (e) { /* */ } return true; }
  return false;
}
// 開外部網頁：原生 App 開系統瀏覽器（WKWebView 裡 target=_blank 常常沒反應），網頁版開新分頁
function ttOpenUrl(url) {
  const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
  if (B) { B.open({ url }).catch(() => window.open(url, "_blank")); return; }
  window.open(url, "_blank", "noopener");
}
const TT_SITE_URL = () => window.TT_SITE || "https://trail-tracker-0ma5.onrender.com";
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a.rules-link");
  if (a) { e.preventDefault(); ttOpenUrl(a.href); }
});
if (typeof window !== "undefined") Object.assign(window, { ttBadWord, ttCleanOk, ttRulesGate, ttRulesAgreed, ttOpenUrl });
