// 置中偵測（2026-10-10 使用者：「山社點進去那個標題好像沒有在中間」「步道卡裡面的資訊可以適當置中」）。scripts/align-scan.js --rule=center 用
//   head ：標題列（左右有按鈕或空白）中間那個標題，視覺上不在整列的正中間
//   cells：一排 2～4 格等寬的資訊格（數字＋標籤），格子內容靠左、只佔一小半寬 → 可以置中
//   mixed：同一張卡片裡，有置中的文字，也有靠左的短句（不是表單）→ 對齊混用
module.exports = () => {
  const vis = el => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && el.getClientRects().length; };
  const txt = el => (el.innerText || "").trim();
  const onScreen = r => r.bottom > 0 && r.top < innerHeight && r.width > 2 && r.height > 2;
  const textBox = el => { const rg = document.createRange(); rg.selectNodeContents(el); const rs = [...rg.getClientRects()].filter(r => r.width > 1 && r.height > 3); if (!rs.length) return null; return { l: Math.min(...rs.map(r => r.left)), r: Math.max(...rs.map(r => r.right)), lines: new Set(rs.map(r => Math.round(r.top))).size }; };
  const isCtl = el => el.matches("button, a, input, select, .comp-x, .sheet-close, [role=button]") || !!el.querySelector("button, input");
  const where = el => (el.id ? "#" + el.id : "") + (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") || el.tagName;
  const out = [];
  for (const C of document.querySelectorAll("body *")) {
    if (!vis(C) || C.closest("svg, .leaflet-container, .maplibregl-map, #debugPanel, .tour, .ps-box")) continue;
    const cr = C.getBoundingClientRect(); if (!onScreen(cr)) continue;
    const s = getComputedStyle(C), kids = [...C.children].filter(k => vis(k) && k.getBoundingClientRect().width > 0 || (k.tagName === "SPAN" && !k.children.length && !txt(k)));
    // head
    if (/flex/.test(s.display) && s.flexDirection.startsWith("row") && kids.length === 3) {
      const [A, T, B] = kids;
      if (txt(T) && !isCtl(T) && (isCtl(A) || isCtl(B)) && txt(T).length <= 24 && !/\n/.test(txt(T))) {
        const tb = textBox(T);
        if (tb) { const off = Math.round((tb.l + tb.r) / 2 - (cr.left + cr.right) / 2); if (Math.abs(off) > 4 && cr.width > 200) out.push({ k: "head", t: txt(T).slice(0, 20), off, where: where(C) }); }
      }
    }
    // cells
    if ((/grid/.test(s.display) || (/flex/.test(s.display) && s.flexDirection.startsWith("row"))) && kids.length >= 2 && kids.length <= 4 && cr.width > 220) {
      const ws = kids.map(k => k.getBoundingClientRect().width);
      if (Math.max(...ws) - Math.min(...ws) < Math.max(...ws) * .08 && kids.every(k => txt(k) && txt(k).length < 40 && !k.matches("button, a, input"))) {
        const lefty = kids.filter(k => { const ks = getComputedStyle(k); const tb = textBox(k); const kr = k.getBoundingClientRect(); return tb && !/center/.test(ks.textAlign) && !/center/.test(ks.alignItems) && (tb.r - tb.l) < kr.width * .7 && tb.l - kr.left < kr.width * .25; });
        if (lefty.length === kids.length) out.push({ k: "cells", t: kids.map(k => txt(k).replace(/\s+/g, " ").slice(0, 14)).join(" | "), where: where(C) });
      }
    }
    // mixed
    const card = (s.backgroundColor !== "rgba(0, 0, 0, 0)" || parseFloat(s.borderTopWidth) > 0 || s.boxShadow !== "none") && cr.width > 220 && cr.width < innerWidth + 1 && !/(fixed)/.test(s.position);
    if (card && !C.querySelector("input, textarea, select")) {
      const blocks = kids.filter(k => txt(k) && /block|flex|grid/.test(getComputedStyle(k).display) && !isCtl(k));
      const centered = blocks.filter(k => getComputedStyle(k).textAlign === "center" && (textBox(k) || {}).lines);
      const leftShort = blocks.filter(k => { const tb = textBox(k); return tb && tb.lines === 1 && /start|left/.test(getComputedStyle(k).textAlign) && (tb.r - tb.l) < k.getBoundingClientRect().width * .6; });
      if (centered.length && leftShort.length) out.push({ k: "mixed", t: "置中：" + txt(centered[0]).slice(0, 12) + "／靠左：" + txt(leftShort[0]).slice(0, 12), where: where(C) });
    }
  }
  return out;
};
