# 步道介紹英文版：data/guides_en.json（人工翻譯的長文）＋ 固定句型規則 → web/js/guides-en.js
# 用法：在 repo 根目錄 python3 scripts/build-guides-en.py
import json,os
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)),".."))
d=json.load(open("data/guides_en.json"))
fields=json.load(open("data/fields_en.json"))   # 基本資料欄位（路面、管理單位、登山口說明…）的英文
body=json.dumps(d,ensure_ascii=False,indent=0,sort_keys=True)
js='''// 步道介紹英文版（優化輪 4 A5）：非中文介面才載入。林業署長文是預先翻好的（LONG），
// 社群（OpenStreetMap）步道的固定句型用規則換；有任何一行換不了就回 null，畫面照舊顯示中文＋翻譯鈕。
// 改了 trails-detail.js 的 guide 要回來補（scripts/tests/guides-en.test.js 會量涵蓋率）。
(function () {
  const LONG = %s;
  const FIELDS = %s;
  const SURF = { "泥土": "dirt", "未鋪面": "unpaved", "石板": "stone slabs", "水泥": "concrete", "木棧道": "boardwalk", "鋪面": "paved", "碎石": "gravel", "柏油": "asphalt", "岩石": "rock", "壓實土石": "compacted earth", "草地": "grass", "鵝卵石": "cobblestone" };
  const SYS = { "地方級": "local", "區域級": "regional", "國家級": "national" };
  const ascii = s => /^[\\x20-\\x7e]*$/.test(s);
  function part(p) {
    p = p.trim(); if (!p) return "";
    let m;
    if (/^此為社群（OpenStreetMap）收錄之步道，詳細介紹有限/.test(p)) return "A community-mapped trail (OpenStreetMap). Details are limited; tap the link below for more.";
    if ((m = p.match(/^此為社群（OpenStreetMap）收錄之步道。(?:路面以(.+?)為主。)?$/))) {
      if (!m[1]) return "A community-mapped trail (OpenStreetMap).";
      const s = SURF[m[1]] || (ascii(m[1]) ? m[1].replace(/_/g, " ").replace(/,/g, ", ") : null);
      return s ? "A community-mapped trail (OpenStreetMap). Surface: mostly " + s + "." : null;
    }
    if ((m = p.match(/^步道系統：(.+)$/))) return SYS[m[1]] ? "Trail system: " + SYS[m[1]] : (ascii(m[1]) ? "Trail system: " + m[1] : null);
    return ascii(p) ? p : null;
  }
  // 基本資料欄位：整句對照（資料裡同一句會出現在很多條步道）
  window.fieldEn = zh => (zh && FIELDS[String(zh).trim()]) || null;
  window.guideEn = function (id, zh) {
    if (LONG[id]) return LONG[id];
    if (!zh) return null;
    const out = [];
    for (const ln of String(zh).replace(/\\r/g, "").split("\\n")) {
      const ps = ln.split("　").map(part);
      if (ps.some(x => x === null)) return null;
      out.push(ps.filter(Boolean).join("  "));
    }
    return out.join("\\n").trim() || null;
  };
})();
''' % (body, json.dumps(fields,ensure_ascii=False,indent=0,sort_keys=True))
open("web/js/guides-en.js","w").write(js)
print(len(d), len(js.encode()))
