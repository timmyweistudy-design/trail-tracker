// 動態語言（第三波）：跟 style.css 的 --ease-* / --dur-* 同一套。
// 1. 彈窗關閉也有動畫：各處關彈窗都是直接 el.remove()（上百個地方），這裡統一接手——
//    真的元素照樣「立刻」移除（之後的邏輯、查找、重開都不受影響），另外放一個不能點、沒有 id 的分身在原地播完離場動畫再拿掉。
// 2. 換分頁有方向：往右邊的分頁從右邊滑進來，往左邊的從左邊。
// 系統設定「減少動態效果」時兩個都不做。
(function () {
  const LEAVE_MS = 180;   // = --dur-s
  const SEL = ".pet-modal, .ys, .input-modal, .onboard, .lightbox";
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };
  const orig = Element.prototype.remove;
  Element.prototype.remove = function () {
    try {
      if (this.isConnected && this.parentNode && this.matches && this.matches(SEL) && !this.classList.contains("tt-leaving") && !reduce()) {
        const ghost = this.cloneNode(true);
        ghost.removeAttribute("id"); ghost.removeAttribute("data-ov");
        ghost.querySelectorAll("[id]").forEach(e => e.removeAttribute("id"));
        ghost.querySelectorAll("[data-ov]").forEach(e => e.removeAttribute("data-ov"));
        ghost.setAttribute("aria-hidden", "true"); ghost.inert = true;
        ghost.classList.add("tt-leaving");
        this.parentNode.insertBefore(ghost, this);
        setTimeout(() => orig.call(ghost), LEAVE_MS);
      }
    } catch (e) { /* 動畫失敗也要照樣關 */ }
    return orig.call(this);
  };
  window.ttMotion = { LEAVE_MS, ease: "cubic-bezier(.2, .8, .2, 1)" };

  // 分頁方向
  function wire() {
    const tabs = [...document.querySelectorAll(".tab[data-view]")];
    if (!tabs.length) return;
    tabs.forEach(t => t.addEventListener("click", () => {
      const cur = tabs.findIndex(b => b.classList.contains("active")), next = tabs.indexOf(t);
      document.body.dataset.nav = cur < 0 || next === cur ? "" : next > cur ? "fwd" : "back";
    }, true));   // 捕獲階段：在分頁切換（app.js 的 click）之前先記下方向
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
})();
