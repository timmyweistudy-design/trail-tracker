// 語言切換（v2）：字典式中→英翻譯層。
// tt_lang=en 時：TreeWalker 把「完全匹配 DICT」的文字節點與 placeholder/title/aria-label 換成英文；
// 匹配不到再過 PATTERNS（規則式，處理含數字/名字的組合句）；MutationObserver 讓動態面板也翻。
// 步道名稱/介紹等資料內容維持中文。要補翻譯：加 DICT 詞條或 PATTERNS 規則即可。
const I18n = (() => {

  // 規則式翻譯：處理含數字/名字的組合句（exact 匹配不到才會跑到這）
  // 西班牙語字典（機翻底稿＋172 條人工校正）——key 與 DICT 完全相同
  const LANGS = {};   // en 也按需載入（js/i18n/en.js）；英文介面開機時 boot-head.js 已先載好，見下方 __ttEn
  // 按需載入：非 en 語言的字典/規則放 web/js/i18n/<code>.js，載入時呼叫 registerLang 註冊；
  // 規則（P）的函式以 tx 為參數（閉包），註冊時傳入真正的 tx。
  function registerLang(code, factory) { try { if (!LANGS[code]) LANGS[code] = factory(tx); } catch (e) { /* 註冊失敗不影響其他語言 */ } }
  if (typeof window !== "undefined" && window.__ttEn) registerLang("en", window.__ttEn);   // 英文：boot-head.js 已在 <head> 先載入

  const ATTRS = ["placeholder", "title", "aria-label"];

  function lang() { try { return localStorage.getItem("tt_lang") || "zh"; } catch { return "zh"; } }
  function tx(s) {
    if (s == null) return null;
    const k = s.trim();
    if (!k || !/[一-鿿]/.test(k)) return null;   // 沒中文就不必查
    const _l = lang();
    const T = (_l === "zh" || _l === "en") ? LANGS.en : LANGS[_l];
    if (!T) return null;   // 非 en 語言尚未按需載入 → 先不翻（避免閃英文），載入後 walk 會補翻
    let hit = T.D[k];
    if (hit) return hit;
    // 句尾標點正規化：詞條可能沒收句尾的 。／）／：，逐步剝掉再查（補回對應英文標點）
    let base = k, tail = "";
    for (let i = 0; i < 2 && base; i++) {
      const last = base[base.length - 1];
      if (last === "。" || last === "．") { base = base.slice(0, -1); tail = "." ; }
      else if (last === "）") { base = base.slice(0, -1); tail = ")" + tail; }
      else if (last === "：") { base = base.slice(0, -1); tail = ":" + tail; }
      else break;
      hit = T.D[base];
      if (hit) {
        // 譯文自己已經收了括號／冒號就不要再補（以前「（玉山）」變成「(Yushan))」）
        const opens = (hit.match(/[(（]/g) || []).length, closes = (hit.match(/[)）]/g) || []).length;
        let add = tail === "." ? "" : tail;
        if (add.includes(")") && closes >= opens) add = add.replace(/\)/g, "");
        if (add.includes(":") && /[:：]\s*$/.test(hit)) add = add.replace(/:/g, "");
        return hit + add;
      }
    }
    // 地名字典（i18n-names.js 延遲載入）：步道名/縣市/鄉鎮的英文名，各語言共用（專有名詞用羅馬拼音）
    if (!["ja", "cn"].includes(lang()) && typeof window !== "undefined" && window.TT_NAMES && window.TT_NAMES[k]) return window.TT_NAMES[k];   // 日文/簡中：漢字名直接可讀，不用拼音
    for (const [re, fn] of T.P) { const m = k.match(re); if (m) { const r = fn(m); if (r) return r; } }
    return null;
  }

  // 翻譯單一文字節點。tx() 查表前會 trim，但節點的前後空白是版面的一部分——
  // 「免費額度：剩 」後面接 <b>10.0</b>，直接寫入譯文會把那個空格吃掉 → 英文版變成「left:10.0」。
  // 所以只替換 trim 後的那一段，前後空白原樣留著。
  // 值沒變絕不寫回：同形詞條（日文漢字）寫回會再觸發 observer → 無限迴圈（v241 白屏事故）。
  // 使用者自己取的名字（山社名稱等）標 translate="no"：「週末山友會」的頭一個字「週」不會被翻成 weeks
  function txNode(n) {
    if (!n || !n.nodeValue) return;
    const pe = n.parentElement; if (pe && pe.closest && pe.closest('[translate="no"]')) return;
    const v = tx(n.nodeValue);
    if (!v) return;
    const nv = n.nodeValue.replace(n.nodeValue.trim(), v);
    if (nv !== n.nodeValue) n.nodeValue = nv;
  }
  function walk(root) {
    if (!root) return;
    try {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) txNode(n);
      if (root.querySelectorAll) {
        for (const el of root.querySelectorAll("[placeholder],[title],[aria-label]")) {
          for (const a of ATTRS) { const v = el.getAttribute(a); const t = v && tx(v); if (t && t !== v) el.setAttribute(a, t); }
        }
      }
    } catch (e) { /* 翻譯失敗不影響功能 */ }
  }

  // 確保某語言的字典/規則已載入（按需抓 web/js/i18n/<code>.js；英文通常開機時就已經在了）
  function ensureLang(l, cb) {
    if (l === "zh" || LANGS[l]) return cb();
    try {
      const sc = document.createElement("script");
      sc.src = "js/i18n/" + l + ".js";
      sc.onload = () => cb();
      sc.onerror = () => cb();   // 載不到就維持原文，不卡住
      document.head.appendChild(sc);
    } catch (e) { cb(); }
  }
  function startObserver() {
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === "characterData") { txNode(m.target); continue; }
        for (const node of m.addedNodes) {
          if (node.nodeType === 3) txNode(node);      // 對已在 DOM 的元素設 innerHTML → 加進來的是裸文字節點，走這條
          else if (node.nodeType === 1) walk(node);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function start() {
    const l = lang();
    if (l === "zh") return;
    document.documentElement.lang = l;
    ensureLang(l, () => {
      // 地名字典（~85KB）只在非中文介面載，載完重翻整頁讓既有的步道名/縣市也換掉
      try {
        if (l === "ja" || l === "cn") throw 0;   // 日文/簡中不需要地名字典（漢字直讀）
        const sc = document.createElement("script");
        sc.src = "js/i18n-names.js";
        sc.onload = () => { try { walk(document.body); } catch (e) { /* */ } };
        document.head.appendChild(sc);
      } catch (e) { /* 載不到就只翻介面字 */ }
      walk(document.body);
      startObserver();
    });
  }

  function set(l) { try { localStorage.setItem("tt_lang", l); } catch (e) { /* */ } location.reload(); }

  return { lang, set, start, walk, tx, registerLang, ensure: ensureLang, tables: () => LANGS };
})();
if (typeof window !== "undefined") window.I18n = I18n;   // 讓 js/i18n/<code>.js 能呼叫 registerLang
I18n.start();
// 全域翻譯（翻譯年糕共用）：Google 免金鑰端點優先，失敗退 MyMemory。
// 兩層快取：同段文字只翻一次（記憶體 + localStorage 各存 120 筆，免費 API 有每日額度）
const _trMem = new Map();
function _trKey(text, target) { let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0; return `${target}:${h}:${text.length}`; }
// key 是 32-bit 弱雜湊，理論上會碰撞（不同原文拿到別段文字的翻譯，而且不會報錯、看不出來）。
// 解法：entry 連原文一起存，讀取時比對原文；不符就當快取沒命中，重新翻。
function _trCacheGet(k, text) {
  const hit = _trMem.has(k) ? _trMem.get(k) : (() => {
    try { const c = JSON.parse(localStorage.getItem("tt_tr_cache") || "{}"); return c[k] || null; } catch { return null; }
  })();
  if (!hit) return null;
  if (typeof hit === "string") return text == null ? hit : null;   // 舊格式（沒存原文）→ 只在沒給原文時信任
  return (text != null && hit.s === text) ? hit.v : null;          // 原文對得上才算命中
}
function _trCacheSet(k, v, text) {
  const entry = { s: text, v };
  _trMem.set(k, entry);
  try {
    const c = JSON.parse(localStorage.getItem("tt_tr_cache") || "{}");
    c[k] = entry;
    const keys = Object.keys(c);
    if (keys.length > 120) for (const old of keys.slice(0, keys.length - 120)) delete c[old];
    localStorage.setItem("tt_tr_cache", JSON.stringify(c));
  } catch (e) { /* 快取滿了就算了 */ }
}
async function ttTranslate(text, target) {
  const ck = _trKey(text, target);
  const hit = _trCacheGet(ck, text);
  if (hit) return hit;
  const out = await _ttTranslateNet(text, target);
  if (out) _trCacheSet(ck, out, text);
  return out;
}
async function _ttTranslateNet(text, target) {
  // 只用 MyMemory（合法的免費翻譯 API）。原本還打 translate.googleapis.com 的 gtx 端點——那是
  // Google 非官方/未公開端點，違反其服務條款且隨時可能失效，已移除。
  // 加 de=email 參數把匿名每日額度從 ~5k 拉到 ~50k 字（用 App 公用信箱）。
  try {
    const src = /[一-鿿]/.test(text) ? "zh-TW" : "en";
    if (src === target) return text;
    const r = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 450))}&langpair=${src}|${target}&de=gatherthetrail@gmail.com`);
    if (r.ok) { const j = await r.json(); const out = j && j.responseData && j.responseData.translatedText; if (out && !/QUERY LENGTH|INVALID|MYMEMORY WARNING/i.test(out)) return out; }
  } catch (e) { /* 放棄 */ }
  return null;
}
// 純 JS 產生的文字（canvas 圖卡等，不經過 DOM 觀察器）用這個包一層
function ttT(str) { try { return (I18n.lang() !== "zh" && I18n.tx(str)) || str; } catch (e) { return str; } }
// 標點跟著語言走：中日文用全形「」：？（），其他語言用半形（以前英文介面會冒出「：」「？？？」）
function ttCJK() { try { return ["zh", "cn", "ja"].includes(I18n.lang()); } catch (e) { return true; } }
function ttColon() { return ttCJK() ? "：" : ": "; }
function ttQuote(s) { return ttCJK() ? `「${s}」` : `“${s}”`; }
function ttParen(s) { return ttCJK() ? `（${s}）` : ` (${s})`; }
function ttUnknown() { return ttCJK() ? "？？？" : "???"; }
function ttSp() { return ttCJK() ? "" : " "; }
// 這段文字看起來已經是介面語言了嗎？（是的話就不用顯示翻譯鈕——以前中文介面看中文貼文也有翻譯鈕，按了翻出一模一樣的字）
// 只用文字系統判斷：中文介面＋全是漢字、日文介面＋有假名、韓文介面＋有諺文、英文介面＋只有拉丁字母
function ttSameLang(text) {
  const t = String(text || "").replace(/[#@][^\s#@]+/g, "").replace(/https?:\S+/g, "");
  if (!/\p{L}/u.test(t)) return true;   // 只有表情、數字、標籤 → 不用翻
  let l = "zh"; try { l = I18n.lang(); } catch (e) { /* */ }
  const han = /[\u4e00-\u9fff]/.test(t), kana = /[\u3040-\u30ff]/.test(t), hangul = /[\uac00-\ud7af]/.test(t);
  const latin = /[A-Za-z]/.test(t), other = /[^\x00-\u024f\u3000-\u30ff\u4e00-\u9fff\uac00-\ud7af\uff00-\uffef\s\p{P}\p{S}\p{N}]/u.test(t);
  if (l === "zh" || l === "cn") return han && !kana && !hangul && !latin && !other;
  if (l === "ja") return kana && !hangul;
  if (l === "ko") return hangul && !kana;
  if (l === "en") return latin && !han && !kana && !hangul && !other;
  return false;
}   // 拼句子時的字間空白（中日文不空格）
// 顯示用日期/時間的 locale（英文介面用英文月份與 AM/PM）
// 「N 趟／N 天」：各語言的單位＋單複數（英文 1 hike / 2 hikes；原本一律加 s 會出現「1 hikes」）
const _TT_UNITS = {
  hour: { zh: "小時", cn: "小时", en: ["hour", "hours"], de: ["Stunde", "Stunden"], es: ["hora", "horas"], fr: ["heure", "heures"], hi: ["घंटा", "घंटे"], id: "jam", it: ["ora", "ore"],
    ja: "時間", km: "ម៉ោង", ko: "시간", mn: "цаг", ms: "jam", my: "နာရီ", ne: "घण्टा", nl: "uur", pl: ["godzina", "godziny", "godzin"], pt: ["hora", "horas"],
    ru: ["час", "часа", "часов"], th: "ชั่วโมง", tl: "oras", tr: "saat", uk: ["година", "години", "годин"], vi: "giờ" },
  trip: { zh: "趟", cn: "趟", en: ["hike", "hikes"], de: ["Tour", "Touren"], es: ["salida", "salidas"], fr: ["sortie", "sorties"], hi: "हाइक", id: "kali", it: ["uscita", "uscite"],
    ja: "回", km: "ដង", ko: "회", mn: "удаа", ms: "kali", my: "ကြိမ်", ne: "पटक", nl: ["tocht", "tochten"], pl: ["wyjście", "wyjścia", "wyjść"], pt: ["saída", "saídas"],
    ru: ["поход", "похода", "походов"], th: "ครั้ง", tl: "lakad", tr: "yürüyüş", uk: ["похід", "походи", "походів"], vi: "chuyến" },
  day: { zh: "天", cn: "天", en: ["day", "days"], de: ["Tag", "Tage"], es: ["día", "días"], fr: ["jour", "jours"], hi: "दिन", id: "hari", it: ["giorno", "giorni"],
    ja: "日", km: "ថ្ងៃ", ko: "일", mn: "өдөр", ms: "hari", my: "ရက်", ne: "दिन", nl: ["dag", "dagen"], pl: ["dzień", "dni", "dni"], pt: ["dia", "dias"],
    ru: ["день", "дня", "дней"], th: "วัน", tl: "araw", tr: "gün", uk: ["день", "дні", "днів"], vi: "ngày" },
};
function ttCount(n, unit) {
  let l = "zh"; try { l = I18n.lang(); } catch (e) { /* */ }
  const w = (_TT_UNITS[unit] || {})[l] || (_TT_UNITS[unit] || {}).zh || "";
  if (typeof w === "string") return `${n} ${w}`;
  let i = n === 1 ? 0 : 1;
  if (w.length === 3) { const m10 = n % 10, m100 = n % 100; i = (m10 === 1 && m100 !== 11) ? (l === "pl" && n !== 1 ? 2 : 0) : (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? 1 : 2; }
  return `${n} ${w[i]}`;
}
// 「3 小時前」：交給瀏覽器的 Intl，24 種語言都對（不用自己一條條翻）
function ttAgo(sec) {
  if (sec < 60) return ttT("剛剛");
  const [v, u] = sec < 3600 ? [Math.floor(sec / 60), "minute"] : sec < 86400 ? [Math.floor(sec / 3600), "hour"] : [Math.floor(sec / 86400), "day"];
  try { return new Intl.RelativeTimeFormat(ttLocale(), { numeric: "always" }).format(-v, u); }
  catch (e) { return v + " " + ({ minute: "分鐘前", hour: "小時前", day: "天前" })[u]; }
}
function ttLocale() { return ({ en: "en-US", es: "es-ES", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR", de: "de-DE", cn: "zh-CN", pt: "pt-BR", it: "it-IT", ru: "ru-RU", th: "th-TH", vi: "vi-VN", id: "id-ID", tl: "fil-PH", ms: "ms-MY", nl: "nl-NL", pl: "pl-PL", tr: "tr-TR", hi: "hi-IN", my: "my-MM", km: "km-KH", ne: "ne-NP", mn: "mn-MN", uk: "uk-UA" })[I18n.lang()] || "zh-TW"; }
// 翻譯年糕的目標語言（跟介面語言走）
function ttTrTarget() { return ({ en: "en", es: "es", ja: "ja", ko: "ko", fr: "fr", de: "de", cn: "zh-CN", pt: "pt", it: "it", ru: "ru", th: "th", vi: "vi", id: "id", tl: "tl", ms: "ms", nl: "nl", pl: "pl", tr: "tr", hi: "hi", my: "my", km: "km", ne: "ne", mn: "mn", uk: "uk" })[I18n.lang()] || "zh-TW"; }
