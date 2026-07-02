// Premium 付費會員：訂閱狀態、升級彈窗（月/年繳 + 試用 + 比較表）、Stripe 結帳與管理。前端為軟鎖。
const Premium = (() => {
  let _on = false, _loaded = false, _periodEnd = null;

  async function refresh() {
    try {
      const c = (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) ? Supa.client() : null;
      if (!c) { _on = false; _loaded = true; return false; }
      const { data: u } = await c.auth.getUser();
      if (!u || !u.user) { _on = false; _loaded = true; sync(); return false; }
      const { data } = await c.from("subscriptions").select("status, current_period_end").eq("user_id", u.user.id).maybeSingle();
      _periodEnd = data && data.current_period_end ? data.current_period_end : null;
      _on = !!(data && ["active", "trialing"].includes(data.status) && (!_periodEnd || new Date(_periodEnd) > new Date()));
      if (_on && !localStorage.getItem("tt_premium_since")) localStorage.setItem("tt_premium_since", new Date().toISOString());
    } catch (e) { _on = false; }
    _loaded = true; sync(); return _on;
  }
  function sync() { try { localStorage.setItem("tt_premium", _on ? "1" : "0"); } catch (e) { } }
  function isOn() { return _loaded ? _on : (localStorage.getItem("tt_premium") === "1"); }
  function gate() { if (isOn()) return true; openUpgrade(); return false; }

  const BENEFITS = [
    ["map", "無限離線地圖", "免費共 50 MB；會員不限量，一鍵預載全台、收藏與記錄周邊"],
    ["target", "進階分析＋年度回顧", "個人紀錄、配速趨勢、難度雷達、每月卡路里、年度回顧圖卡、匯出 GPX/CSV/KML"],
    ["backup", "雲端備份還原", "行程、寵物、成就、主題設定跨裝置備份"],
    ["bookmark", "無限收藏", "免費上限 20 條；會員不限"],
    ["users", "足跡熱力圖＋好友比較", "所有軌跡疊成一張地圖、好友里程排行"],
    ["sparkle", "專屬外觀與身分", "PRO 徽章、頭像框、名字跟色、專屬主題、夥伴命名、PRO 表情貼"],
  ];
  // 免費 vs Premium 比較
  const COMPARE = [
    ["離線地圖", "50 MB", "無限"],
    ["記錄時預載周邊地圖", "縮小範圍", "完整"],
    ["進階分析", "—", "完整"],
    ["年度回顧", "—", "✓"],
    ["雲端備份還原", "—", "✓"],
    ["收藏步道", "20 條", "無限"],
    ["足跡熱力圖", "—", "✓"],
    ["PRO 徽章 / 主題 / 表情貼", "—", "✓"],
    ["夥伴命名 / 頭像框", "—", "✓"],
  ];
  const icc = n => (typeof ic === "function" ? ic(n) : "");

  function openUpgrade() {
    let plan = "month";
    const ov = document.createElement("div");
    ov.className = "pv-mask premium-mask";
    ov.innerHTML = `<div class="premium-card">
      <button class="comp-x" id="pmX" aria-label="關閉">${icc("x")}</button>
      <div class="pm-crown">${icc("sparkle")}</div>
      <h2>循徑拾光 Premium</h2>
      <p class="pm-sub">支持開發，解鎖全部進階功能</p>
      <div class="pm-benefits">${BENEFITS.map(([i, t, d]) => `<div class="pm-b"><span class="pm-b-ic">${icc(i)}</span><div><b>${t}</b><div class="pm-b-d">${d}</div></div></div>`).join("")}</div>
      <table class="pm-compare"><thead><tr><th></th><th>免費</th><th>Premium</th></tr></thead><tbody>
        ${COMPARE.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td class="pm-pro">${c}</td></tr>`).join("")}
      </tbody></table>
      <div class="pm-plans">
        <button class="pm-plan on" data-plan="month"><b>月繳</b><span>NT$60 / 月</span></button>
        <button class="pm-plan" data-plan="year"><b>年繳</b><span>NT$600 / 年</span><i class="pm-save">省 2 個月</i></button>
      </div>
      <button class="btn primary" id="pmGo">免費試用 7 天</button>
      <div class="pm-fine">試用期免費，之後依方案自動續訂，可隨時取消</div>
      <button class="link-btn pm-later" id="pmLater">以後再說</button>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector("#pmX").addEventListener("click", close);
    ov.querySelector("#pmLater").addEventListener("click", close);
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelectorAll(".pm-plan").forEach(b => b.addEventListener("click", () => {
      plan = b.dataset.plan; ov.querySelectorAll(".pm-plan").forEach(x => x.classList.toggle("on", x === b));
    }));
    ov.querySelector("#pmGo").addEventListener("click", () => startCheckout(plan));
  }

  async function authToken() {
    const c = (typeof Supa !== "undefined") ? Supa.client() : null; if (!c) return null;
    const { data } = await c.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  async function startCheckout(plan) {
    if (!window.STRIPE_ENABLED || !window.FUNCTIONS_URL) { if (typeof toast === "function") toast("付費功能即將開放，敬請期待"); return; }
    const token = await authToken();
    if (!token) { if (typeof toast === "function") toast("請先到社群分頁登入再升級"); return; }
    try {
      if (typeof toast === "function") toast("前往結帳…");
      const r = await fetch(window.FUNCTIONS_URL + "/create-checkout", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "apikey": window.SUPABASE_ANON_KEY || "" },
        body: JSON.stringify({ origin: location.origin, plan: plan || "month" }),
      });
      const j = await r.json();
      if (j.url) location.href = j.url;
      else if (typeof toast === "function") toast("結帳建立失敗：" + (j.error || ""));
    } catch (e) { if (typeof toast === "function") toast("結帳失敗：" + (e && e.message || e)); }
  }

  // 管理訂閱（Stripe Customer Portal）
  async function openPortal() {
    if (!window.FUNCTIONS_URL) return;
    const token = await authToken(); if (!token) return;
    try {
      if (typeof toast === "function") toast("開啟訂閱管理…");
      const r = await fetch(window.FUNCTIONS_URL + "/create-portal", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "apikey": window.SUPABASE_ANON_KEY || "" },
        body: JSON.stringify({ origin: location.origin }),
      });
      const j = await r.json();
      if (j.url) location.href = j.url; else if (typeof toast === "function") toast("無法開啟：" + (j.error || ""));
    } catch (e) { if (typeof toast === "function") toast("失敗：" + (e && e.message || e)); }
  }

  function renderBox(el) {
    if (!el) return;
    if (typeof Supa === "undefined" || !Supa.ready || !Supa.ready()) { el.innerHTML = ""; return; }
    if (isOn()) {
      const until = _periodEnd ? new Date(_periodEnd).toLocaleDateString("zh-TW") : "";
      const since = localStorage.getItem("tt_premium_since");
      let tenure = "";
      if (since) { const mo = Math.max(0, Math.floor((Date.now() - new Date(since)) / 2.628e9)); const tier = mo >= 12 ? "元老" : mo >= 6 ? "資深" : mo >= 1 ? "會員" : "新會員"; tenure = `<span class="pm-tenure">${tier} ・ 第 ${mo + 1} 個月</span>`; }
      el.innerHTML = `<div class="pm-status on"><span class="pm-b-ic">${icc("sparkle")}</span><div><b>Premium 會員${tenure}</b><div class="pm-b-d">進階功能已全部解鎖${until ? ` ・ 續訂日 ${until}` : ""}</div></div></div>
        <button class="btn ghost pm-manage" id="pmManage" style="margin-top:8px">${icc("sliders")} 管理訂閱</button>`;
      const m = el.querySelector("#pmManage"); if (m) m.addEventListener("click", openPortal);
    } else {
      el.innerHTML = `<button class="btn primary pm-upgrade" id="pmUpgradeBtn">${icc("sparkle")} 升級 Premium</button>`;
      const b = el.querySelector("#pmUpgradeBtn"); if (b) b.addEventListener("click", openUpgrade);
    }
  }

  // 從 Stripe 結帳返回：?premium=success → 提示並更新狀態
  function handleReturn() {
    try {
      const p = new URLSearchParams(location.search).get("premium");
      if (!p) return;
      history.replaceState(null, "", location.pathname);
      if (p === "success") {
        if (typeof toast === "function") toast("付款完成，歡迎加入 Premium！");
        let tries = 0;
        const poll = () => { refresh().then(on => { if (on) { try { document.querySelector('.tab[data-view="me"]')?.click(); } catch (e) { } } else if (++tries < 6) setTimeout(poll, 2500); }); };
        poll();   // webhook 寫入可能略有延遲，重試幾次
      } else if (p === "cancel") {
        if (typeof toast === "function") toast("已取消結帳");
      }
    } catch (e) { /* */ }
  }

  return { refresh, isOn, gate, openUpgrade, openPortal, renderBox, handleReturn };
})();
