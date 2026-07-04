// 自製對話框（取代原生 confirm/prompt/alert）：可翻譯（MutationObserver 會翻內文與按鈕）、
// 樣式一致、防連點、支援三選（合併/取代/取消）。全部回傳 Promise。
//   ttConfirm(msg, okLabel?, cancelLabel?) → Promise<boolean>
//   ttChoice(msg, buttons:[{label, value, cls?}]) → Promise<value|null>（點背景/ESC = null）
//   ttPrompt(msg, initial?) → Promise<string|null>
//   ttAlertBox(msg) → Promise<void>
(function () {
  let open = null;   // 同時間只開一個

  function build(msg, inner) {
    const ov = document.createElement("div");
    ov.className = "ttdlg-ov";
    ov.innerHTML = `<div class="ttdlg" role="dialog" aria-modal="true">
      <div class="ttdlg-msg"></div>${inner}</div>`;
    ov.querySelector(".ttdlg-msg").textContent = msg;   // textContent：訊息可含使用者內容，避免 XSS
    document.body.appendChild(ov);
    return ov;
  }
  function close(ov) { try { ov.remove(); } catch (e) { /* */ } if (open === ov) open = null; }

  function ttChoice(msg, buttons) {
    if (open) return Promise.resolve(null);   // 防連點：已有對話框就不再開
    return new Promise(resolve => {
      const btnsHtml = `<div class="ttdlg-btns">` +
        buttons.map((b, i) => `<button class="btn ${b.cls || "ghost"}" data-i="${i}">${b.label}</button>`).join("") + `</div>`;
      const ov = build(msg, btnsHtml);
      open = ov;
      const done = v => { close(ov); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = e => { if (e.key === "Escape") done(null); };
      document.addEventListener("keydown", onKey);
      ov.addEventListener("click", e => { if (e.target === ov) done(null); });
      ov.querySelectorAll("[data-i]").forEach(b => b.addEventListener("click", () => done(buttons[+b.dataset.i].value)));
      const first = ov.querySelector(".btn.primary") || ov.querySelector(".btn");
      if (first) first.focus({ preventScroll: true });
    });
  }
  function ttConfirm(msg, okLabel, cancelLabel) {
    return ttChoice(msg, [
      { label: cancelLabel || "取消", value: false, cls: "ghost" },
      { label: okLabel || "確定", value: true, cls: "primary" },
    ]).then(v => v === true);
  }
  function ttAlertBox(msg) {
    return ttChoice(msg, [{ label: "確定", value: true, cls: "primary" }]).then(() => undefined);
  }
  function ttPrompt(msg, initial) {
    if (open) return Promise.resolve(null);
    return new Promise(resolve => {
      const ov = build(msg, `<textarea class="ttdlg-input" rows="3"></textarea>
        <div class="ttdlg-btns"><button class="btn ghost" data-x="c">取消</button><button class="btn primary" data-x="o">確定</button></div>`);
      open = ov;
      const ta = ov.querySelector(".ttdlg-input");
      ta.value = initial || "";
      const done = v => { close(ov); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = e => { if (e.key === "Escape") done(null); };
      document.addEventListener("keydown", onKey);
      ov.addEventListener("click", e => { if (e.target === ov) done(null); });
      ov.querySelector('[data-x="c"]').addEventListener("click", () => done(null));
      ov.querySelector('[data-x="o"]').addEventListener("click", () => done(ta.value));
      ta.focus({ preventScroll: true });
    });
  }

  window.ttConfirm = ttConfirm;
  window.ttChoice = ttChoice;
  window.ttPrompt = ttPrompt;
  window.ttAlertBox = ttAlertBox;
})();
