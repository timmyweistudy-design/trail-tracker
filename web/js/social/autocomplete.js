// @提及 / #標籤 輸入自動完成：附掛到 textarea/input，打 @ 或 # 跳出建議清單。
const Autocomplete = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  function attach(input) {
    if (!input || input._ac) return; input._ac = true;
    let box = null, timer = null;
    const close = () => { if (box) { box.remove(); box = null; } };

    function tokenAt() {
      const v = input.value, pos = input.selectionStart || v.length;
      const left = v.slice(0, pos);
      const m = left.match(/(^|\s)([@#])([\w一-龥]{0,30})$/);
      if (!m) return null;
      return { kind: m[2], term: m[3], start: pos - m[3].length - 1, end: pos };
    }

    async function update() {
      const tk = tokenAt(); if (!tk) { close(); return; }
      let items = [];
      if (tk.kind === "@") {
        if (tk.term.length < 1) { close(); return; }
        const ps = await Posts.searchHandles(tk.term);
        items = ps.map(p => ({ label: "@" + p.handle, sub: p.display_name || "", insert: "@" + p.handle + " " }));
      } else {
        const hot = await Posts.hotTags(20);
        const t = tk.term.toLowerCase();
        items = hot.filter(h => !t || h.tag.toLowerCase().includes(t)).slice(0, 6).map(h => ({ label: "#" + h.tag, sub: h.n + " 篇", insert: "#" + h.tag + " " }));
      }
      if (!items.length) { close(); return; }
      render(items, tk);
    }

    function render(items, tk) {
      close();
      box = document.createElement("div"); box.className = "ac-box";
      box.innerHTML = items.map((it, i) => `<div class="ac-item" data-i="${i}">${esc(it.label)}${it.sub ? `<span class="ac-sub">${esc(it.sub)}</span>` : ""}</div>`).join("");
      // 定位在輸入框正上方
      const r = input.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.width = Math.min(r.width, 320) + "px";
      box.style.bottom = (window.innerHeight - r.top + 4) + "px";
      document.body.appendChild(box);
      box.querySelectorAll(".ac-item").forEach(el => el.addEventListener("mousedown", e => {
        e.preventDefault();
        const it = items[+el.dataset.i];
        const v = input.value;
        input.value = v.slice(0, tk.start) + it.insert + v.slice(tk.end);
        const caret = tk.start + it.insert.length;
        input.setSelectionRange(caret, caret); input.focus();
        close();
      }));
    }

    input.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(update, 160); });
    input.addEventListener("blur", () => setTimeout(close, 150));
    input.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  }

  return { attach };
})();
