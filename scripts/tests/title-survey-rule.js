// 盤點：每個彈窗／面板的標題是置中還是靠左（2026-10-10 置中排查用，看全 App 是否一致）
module.exports = () => {
  const vis = el => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && el.getClientRects().length; };
  const out = [];
  const cards = [...document.querySelectorAll(".pet-modal-card, .pv, .premium-card, .doc-card, .sheet.open, .ach-modal, .foot-modal, .input-card, .ttdlg, [data-ov] > div")].filter(vis);
  for (const c of cards.slice(-1)) {
    const cr = c.getBoundingClientRect();
    const h = [...c.querySelectorAll("h1, h2, h3, .pv-head b, .doc-head b, [class*='-head'] b, [class*='-title']")].find(e => vis(e) && (e.innerText || "").trim() && e.getBoundingClientRect().top < cr.top + 120);
    if (!h) continue;
    const rg = document.createRange(); rg.selectNodeContents(h); const rs = [...rg.getClientRects()].filter(r => r.width > 1); if (!rs.length) continue;
    const l = Math.min(...rs.map(r => r.left)), r = Math.max(...rs.map(r => r.right)), off = Math.round((l + r) / 2 - (cr.left + cr.right) / 2);
    out.push({ k: Math.abs(off) <= 6 ? "置中" : (l - cr.left < 40 ? "靠左" : "偏 " + off), t: (h.innerText || "").trim().slice(0, 14), card: (c.className || c.tagName).toString().slice(0, 30) });
  }
  return out;
};
