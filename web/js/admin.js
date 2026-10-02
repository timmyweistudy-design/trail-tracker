// 管理後台（只給開發者；資料庫端由 schema-phase33 的 is_app_admin() 把關，前端這裡只是介面）
// 從測試面板 →「管理」打開；延遲載入。兩頁：檢舉處理（路況回報＋貼文）、錯誤紀錄（使用者手機上的錯誤，最近 7 天）。
const Admin = (() => {
  const esc = s => String(s == null ? "" : s).replace(/[<>&"']/g, ch => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch]));
  const when = iso => { try { return new Date(iso).toLocaleString("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }); } catch (e) { return ""; } };
  async function ready() {
    if (window.loadSocial) { try { await window.loadSocial(); } catch (e) { /* */ } }
    return typeof Supa !== "undefined" && Supa.ready && Supa.ready() && Supa.client();
  }
  function errMsg(error) {
    const m = (error && error.message) || "";
    if (/admin only/.test(m)) return "你的帳號不是管理員（app_admins 表裡沒有你）";
    if (/does not exist|schema cache/.test(m)) return "資料庫還沒跑 schema-phase33-admin.sql";
    return "載入失敗：" + m;
  }
  async function renderQueue(body) {
    body.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const { data, error } = await Supa.client().rpc("admin_queue");
    if (error) { body.innerHTML = `<div class="gd-empty">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) { body.innerHTML = `<div class="gd-empty">沒有待處理的檢舉 🎉</div>`; return; }
    body.innerHTML = data.map(r => `<div class="adm-item${r.hidden ? " is-hidden" : ""}">
      <div class="adm-top"><span class="adm-kind">${r.kind === "post" ? "貼文" : "路況回報"}</span><b>${esc(r.author)}</b><small>${when(r.created_at)}</small><span class="adm-flags">${r.flags} 次檢舉</span></div>
      <div class="adm-body">${esc(r.body) || "（沒有文字）"}</div>
      <div class="adm-meta">${r.trail ? esc(r.trail) + "・" : ""}理由：${esc(r.reasons || "—")}</div>
      <button class="btn ${r.hidden ? "ghost" : "danger"} adm-tog" data-kind="${r.kind}" data-id="${r.id}" data-hidden="${r.hidden ? 1 : 0}">${r.hidden ? "恢復顯示" : "藏起來"}</button>
    </div>`).join("");
    body.querySelectorAll(".adm-tog").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      const hide = b.dataset.hidden !== "1";
      const { error: e } = await Supa.client().rpc("admin_set_hidden", { p_kind: b.dataset.kind, p_id: b.dataset.id, p_hidden: hide });
      if (e) { b.disabled = false; toast(errMsg(e)); return; }
      toast(hide ? "藏起來了" : "恢復顯示了"); renderQueue(body);
    }));
  }
  async function renderErrors(body) {
    body.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const { data, error } = await Supa.client().rpc("admin_errors", { p_days: 7 });
    if (error) { body.innerHTML = `<div class="gd-empty">${esc(errMsg(error))}</div>`; return; }
    if (!data.length) { body.innerHTML = `<div class="gd-empty">最近 7 天沒有錯誤回報</div>`; return; }
    body.innerHTML = `<div class="adm-note">最近 7 天，依訊息分組（只收到已登入使用者的）</div>` + data.map(r => `<div class="adm-item">
      <div class="adm-top"><span class="adm-flags">${r.n} 次・${r.users} 人</span><small>最後 ${when(r.last_at)}${r.app_ver ? "・" + esc(r.app_ver) : ""}</small></div>
      <div class="adm-body adm-mono">${esc(r.message)}</div>
      <div class="adm-meta">${esc((r.ua || "").slice(0, 120))}</div>
    </div>`).join("");
  }
  async function open(tab) {
    if (document.querySelector('[data-ov="admin"]')) return;
    if (!(await ready())) { toast("社群模組還沒好，等一下再試"); return; }
    const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "admin";
    ov.innerHTML = `<div class="pet-modal-card adm-card"><button class="sheet-close" id="admX" aria-label="關閉">${ic("x")}</button>
      <h2>${ic("sliders")} 管理</h2>
      <div class="pk-tabs"><button class="pk-tab" data-t="queue">檢舉處理</button><button class="pk-tab" data-t="errors">錯誤紀錄</button></div>
      <div class="adm-list"></div></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#admX" });
    ov.querySelector("#admX").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const body = ov.querySelector(".adm-list");
    const show = t => { ov.querySelectorAll(".pk-tab").forEach(b => b.classList.toggle("on", b.dataset.t === t)); (t === "errors" ? renderErrors : renderQueue)(body); };
    ov.querySelectorAll(".pk-tab").forEach(b => b.onclick = () => show(b.dataset.t));
    show(tab || "queue");
  }
  return { open };
})();
if (typeof window !== "undefined") window.Admin = Admin;
