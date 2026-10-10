// 排版規則（2026-10-09 使用者）：次要文字靠左的話，最左邊不能比標題更往左。scripts/align-scan.js（全站掃描）跟 align.test.js 共用
module.exports = () => {
  const vis = el => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0 && el.getClientRects().length; };
  const rects = el => { const r = document.createRange(); r.selectNodeContents(el); return [...r.getClientRects()].filter(x => x.width > 2 && x.height > 4 && x.bottom > 0 && x.top < innerHeight); };
  const blockish = el => /block|flex|grid|list-item|table/.test(getComputedStyle(el).display) && !/inline/.test(getComputedStyle(el).display);
  const txt = el => (el.innerText || "").trim();
  const out = [];
  for (const C of document.querySelectorAll("body *")) {
    if (!vis(C) || !blockish(C)) continue;
    const kids = [...C.children].filter(k => vis(k) && blockish(k) && txt(k) && !k.matches("button, .btn, input, select, textarea, svg, img"));
    for (let i = 0; i + 1 < kids.length; i++) {
      const A = kids[i], B = kids[i + 1], sa = getComputedStyle(A), sb = getComputedStyle(B);
      const ra = rects(A), rb = rects(B); if (!ra.length || !rb.length) continue;
      const aLines = new Set(ra.map(r => Math.round(r.top))).size; if (aLines > 2 || txt(A).length > 40) continue;   // 標題：短、最多兩行
      // 下一塊不是「次要文字」就不算：分頁列、按鈕列、格狀統計、卡片（裡面有按鈕或好幾個方塊），或本身是粗體的小節標題（2026-10-10 優化輪 C2/C3：誤報都是這類）
      if (B.querySelector("button, [role=tab], input, select") || [...B.children].filter(k => vis(k) && blockish(k)).length >= 2 || +sb.fontWeight >= 600) continue;
      const big = parseFloat(sa.fontSize) > parseFloat(sb.fontSize) + .5 || (+sa.fontWeight >= 600 && +sb.fontWeight < 600) || /^H[1-4]$/.test(A.tagName);
      if (!big) continue;
      const aL = Math.min(...ra.map(r => r.left)), aR = Math.max(...ra.map(r => r.right)), bL = Math.min(...rb.map(r => r.left));
      const cb = A.getBoundingClientRect(), centered = sa.textAlign === "center" || (Math.abs((aL + aR) / 2 - (cb.left + cb.right) / 2) < 4 && aR - aL < cb.width - 24);
      const bLeft = /start|left|justify/.test(sb.textAlign);
      if (centered && bLeft && bL < aL - 4) out.push({ title: txt(A).slice(0, 30), sub: txt(B).slice(0, 40), over: Math.round(aL - bL), where: (C.className && String(C.className).slice(0, 40)) || C.tagName, a: A.className && String(A.className).slice(0, 30), b: B.className && String(B.className).slice(0, 30) });
    }
  }
  return out;
};
