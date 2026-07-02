// 照片全螢幕檢視：多圖左右滑動、雙擊放大、計數。點 ✕ 或背景關閉。
const Lightbox = (() => {
  function openGallery(srcs, start) {
    srcs = (srcs || []).filter(Boolean);
    if (!srcs.length) return;
    let i = Math.max(0, Math.min(srcs.length - 1, start || 0));
    let zoom = 1, tx = 0, ty = 0;

    if (document.querySelector(".lightbox")) return;   // 防連點疊層
    const m = document.createElement("div");
    m.className = "lightbox";
    m.innerHTML = `
      <button class="lb-x" aria-label="關閉">✕</button>
      <div class="lb-count"></div>
      <img class="lb-img" alt="" draggable="false">
      <button class="lb-nav lb-prev" aria-label="上一張">‹</button>
      <button class="lb-nav lb-next" aria-label="下一張">›</button>`;
    document.body.appendChild(m);
    const img = m.querySelector(".lb-img");
    const count = m.querySelector(".lb-count");
    const prev = m.querySelector(".lb-prev");
    const next = m.querySelector(".lb-next");
    const close = () => m.remove();

    function resetZoom() { zoom = 1; tx = 0; ty = 0; apply(); }
    function apply() { img.style.transform = `translate(${tx}px,${ty}px) scale(${zoom})`; img.style.cursor = zoom > 1 ? "grab" : ""; }
    function show(n) {
      i = (n + srcs.length) % srcs.length;
      img.src = srcs[i];
      count.textContent = srcs.length > 1 ? `${i + 1} / ${srcs.length}` : "";
      const multi = srcs.length > 1;
      prev.style.display = next.style.display = multi ? "" : "none";
      resetZoom();
    }

    m.querySelector(".lb-x").addEventListener("click", close);
    m.addEventListener("click", e => { if (e.target === m) close(); });
    prev.addEventListener("click", e => { e.stopPropagation(); show(i - 1); });
    next.addEventListener("click", e => { e.stopPropagation(); show(i + 1); });
    document.addEventListener("keydown", function onKey(e) {
      if (!document.body.contains(m)) { document.removeEventListener("keydown", onKey); return; }
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") show(i - 1); else if (e.key === "ArrowRight") show(i + 1);
    });

    // 雙擊放大/還原
    let lastTap = 0;
    img.addEventListener("click", e => {
      e.stopPropagation();
      const now = Date.now();
      if (now - lastTap < 300) { zoom = zoom > 1 ? 1 : 2.4; tx = ty = 0; apply(); }
      lastTap = now;
    });

    // 觸控：放大時拖曳平移；未放大時水平滑動切換
    let sx = 0, sy = 0, dragging = false, startTx = 0, startTy = 0;
    img.addEventListener("touchstart", e => {
      if (e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY; dragging = true; startTx = tx; startTy = ty;
    }, { passive: true });
    img.addEventListener("touchmove", e => {
      if (!dragging || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (zoom > 1) { tx = startTx + dx; ty = startTy + dy; apply(); }
    }, { passive: true });
    img.addEventListener("touchend", e => {
      if (!dragging) return; dragging = false;
      if (zoom > 1) return;   // 放大狀態不換圖
      const dx = (e.changedTouches[0].clientX - sx), dy = (e.changedTouches[0].clientY - sy);
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(i + (dx < 0 ? 1 : -1));
    }, { passive: true });

    show(i);
  }
  function open(src) { openGallery([src], 0); }
  return { open, openGallery };
})();
