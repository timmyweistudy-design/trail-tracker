// 照片全螢幕檢視：點圖放大，點任意處關閉。
const Lightbox = (() => {
  function open(src) {
    if (!src) return;
    const m = document.createElement("div");
    m.className = "lightbox";
    m.innerHTML = `<img src="${src}" alt=""><button class="lb-x" aria-label="關閉">✕</button>`;
    m.addEventListener("click", () => m.remove());
    document.body.appendChild(m);
  }
  return { open };
})();
