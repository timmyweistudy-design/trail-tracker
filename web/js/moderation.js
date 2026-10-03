// 社群內容把關（App Store 1.2：有使用者內容的 App 要有「同意社群規範」＋「過濾不當內容」＋檢舉＋封鎖）。
// 1. ttRulesGate()：第一次發文／留言／回報路況／建山社／揪團前，先同意社群規範（只問一次，存 tt_rules_ok）。
// 2. ttBadWord(text)：擋髒話、歧視字眼、色情、賭博毒品廣告。資料庫端 schema-phase37-badwords.sql 用同一份「強」清單當最後防線
//    （由 scripts/gen-badwords-sql.mjs 從這裡產生，check.js 會驗兩邊一致）。
//    先正規化再比對，擋得住常見的繞法：全形／大小寫、中間塞空白或符號（幹 你 娘、f.u.c.k）、數字符號代字母（sh!t、@ss）、
//    拉長字母（fuuuck）、零寬字元。也保留例外，避免誤擋「樹幹」「靠北側」「三小時」「媽媽的」「shiitake（香菇）」這種正常字。
// TT_BAD.sub：在「只留字母」的壓縮字串裡找（中日韓、其他文字，以及英文裡不會出現在正常單字中的字根，字母可以重複）
// TT_BAD.word：英文等拉丁字母語言，要是獨立單字才算（避免 grape、Scunthorpe 這類誤擋）
const TT_BAD = {
  sub: [
    // 中文：幹／操＋你＋娘 這一族（繁簡、台語諧音、網路代字）
    "[幹干乾淦赣][你妳恁拎林您伱尼泥][娘媽妈老母老師老师祖宗全家]", "[操肏草艹靠][你妳恁拎林您伱尼泥][娘媽妈老母老師老师祖宗全家]",
    "草泥[馬马]", "肏", "[屌]你", "[屌]妳", "[雞鸡機机]掰", "[雞鸡]歪", "[雞鸡機机]巴", "懶[叫趴]", "[懒][叫趴]", "羼", "洨", "屄",
    "婊", "[賤贱](人|貨|货|女人|狗|種|种)", "妓女", "王八[蛋羔]", "去死(?![亡角])", "死全家", "[你妳][媽妈]死了", "[他她你妳][媽妈]的",
    "(衝|做|是|講|讲|幹|干|在|看|說|说|吵|共)三小", "三小(啦|喔|啊|阿|咧|拉|啦)", "^三小$", "靠北(?![側侧邊边方端面部])", "靠杯", "靠夭", "哭夭", "白[癡痴]", "智障", "[腦脑][殘残]", "弱智", "低能(兒|儿|仔)", "[你妳]低能",
    "[傻煞][逼屄比筆笔]", "(?<![台臺])北七(?!星)", "娘[炮砲]", "支那(?!雅)", "黑鬼",
    // 色情
    "[約约][砲炮]", "打[砲炮]", "做[愛爱]", "性交", "口交", "肛交", "自慰", "打手槍", "[陰阴][莖茎道]", "[陽阳]具", "裸照", "裸聊",
    "a片", "色情", "援交", "一夜情", "包[養养]",
    // 賭博、毒品廣告
    "[娛娱][樂乐]城", "博弈", "博彩", "百家[樂乐]", "代[儲储]", "[線线]上[賭赌]", "六合彩", "安非他命", "搖頭丸", "摇头丸", "k他命", "海洛因", "冰毒",
    // 注音、拼音
    "ㄍㄢ", "ㄐㄅ", "ㄍㄋㄋ", "ganniniang", "ganlinniang", "ganninia", "kaobei", "cnm(?![a-z])", "nmsl", "jibai",
    // 日、韓
    "死ね", "くそ", "クソ", "ちんこ", "ちんぽ", "まんこ", "セックス", "キチガイ", "きちがい",
    "씨발", "시발", "ㅅㅂ", "병신", "ㅂㅅ", "개새끼", "좆", "존나", "니애미",
    // 俄、烏、泰、越、印地、尼泊爾（非拉丁字母，壓縮後直接找）
    "бля", "сука", "хуй", "хуё", "пизд", "ебат", "ёбан", "мудак", "курва",
    "ควย", "เหี้ย", "เย็ด", "มึง", "địt", "đụ", "lồn", "cặc", "मादरचोद", "बहनचोद", "चूतिया",
  ],
  // 英文等：在壓縮字串裡找也不會誤擋的字根（每個字母可重複：fuuuck）
  root: ["fuck", "fuk", "fvck", "phuck", "fck", "motherfucker", "nigger", "nigga", "faggot", "bitch", "asshole", "whore", "slut", "porn",
    "wanker", "dildo", "blowjob", "handjob", "cumshot", "jizz", "bastard", "killyourself", "putangina", "tangina",
    "madarchod", "behenchod", "bhenchod", "chutiya", "vaffanculo", "hurensohn", "scheisse", "scheiße", "klootzak", "ngentot", "kontol", "memek", "siktir", "orospu", "kurwa"],
  // 要是獨立單字才算的（壓縮後可能是正常字的一部分：shiitake、grape、computadora）
  word: ["shit", "shitty", "cunt", "pussy", "rape", "raped", "retard", "retarded", "nazi", "twat", "xxx", "wtf", "stfu", "kys", "tmd", "dumbass", "jackass",
    "puta", "puto", "mierda", "pendejo", "putain", "merde", "salope", "connard", "fotze", "cazzo", "stronzo", "caralho", "porra", "chuj", "kut",
    "amk", "gago", "bangsat", "anjing"],
};
const _ttLeet = s => s.replace(/[013457@$!|]/g, c => ({ 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", "@": "a", "$": "s", "!": "i", "|": "i" })[c]);
const _ttNorm = s => String(s || "").normalize("NFKC").toLowerCase().replace(/[\u200b-\u200f\u2060\ufeff\u00ad]/g, "");
const _ttRep = w => w.split("").map(c => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "+").join("");   // fuck → f+u+c+k+
const _TT_RE_SUB = new RegExp(TT_BAD.sub.join("|"), "u");
const _TT_RE_ROOT = new RegExp(TT_BAD.root.map(_ttRep).join("|"), "u");
const _TT_RE_WORD = new RegExp(`(?<!\\p{L})(${TT_BAD.word.map(_ttRep).join("|")})(?!\\p{L})`, "u");
function ttBadWord(...texts) {
  for (const t of texts) {
    const n = _ttNorm(t); if (!n) continue;
    const cjk = n.replace(/[^\p{L}]/gu, "");                 // 只留字母（中日韓、注音、各國文字都算字母）：去掉空白、符號、數字、表情
    const lat = _ttLeet(n).replace(/[^\p{L}]/gu, "");        // 同上，但先把 0/1/3/@/$/! 當字母
    const m = cjk.match(_TT_RE_SUB) || lat.match(_TT_RE_ROOT) || _ttLeet(n).match(_TT_RE_WORD);
    if (m) return m[0];
  }
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
// 自己的說明頁（使用條款、隱私權政策）：在 App 裡開一層有「✕」的面板，載入 App 內附的那份（離線也看得到）。
// 以前用新分頁開：加到主畫面的網頁版會直接在原畫面跳過去，沒有返回／關閉鍵，只能整個關掉重開。
function ttOpenDoc(page) {
  if (document.querySelector('[data-ov="doc"]')) return;
  const ov = document.createElement("div"); ov.className = "doc-ov"; ov.dataset.ov = "doc";
  ov.innerHTML = `<div class="doc-card" role="dialog" aria-modal="true"><div class="doc-head"><b>${page === "terms" ? ttT("使用條款與社群規範") : ttT("隱私權政策")}</b><button class="sheet-close" id="docX" aria-label="${ttT("關閉")}">${typeof ic === "function" ? ic("x") : "✕"}</button></div><iframe class="doc-frame" src="${page}.html" title="${page}"></iframe></div>`;
  document.body.appendChild(ov);
  let _a11y = null;
  const close = () => { document.removeEventListener("keydown", onKey, true); if (_a11y) _a11y(); ov.remove(); };
  const onKey = e => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } };   // 開在確認框上面時，Esc 只關這層
  document.addEventListener("keydown", onKey, true);
  if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#docX" });
  ov.querySelector("#docX").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
}
document.addEventListener("click", e => {
  const a = e.target.closest && e.target.closest("a.rules-link");
  if (a) { e.preventDefault(); ttOpenDoc("terms"); }
});
if (typeof window !== "undefined") Object.assign(window, { TT_BAD, ttBadWord, ttCleanOk, ttRulesGate, ttRulesAgreed, ttOpenUrl, ttOpenDoc });
