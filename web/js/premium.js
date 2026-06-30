// Premium 付費會員：讀訂閱狀態、升級彈窗、Stripe 結帳。前端為軟鎖（UX），狀態由 webhook 在後端設定。
const Premium = (() => {
  let _on = false, _loaded = false;

  async function refresh() {
    try {
      const c = (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) ? Supa.client() : null;
      if (!c) { _on = false; _loaded = true; return false; }
      const { data: u } = await c.auth.getUser();
      if (!u || !u.user) { _on = false; _loaded = true; sync(); return false; }
      const { data } = await c.from("subscriptions").select("status, current_period_end").eq("user_id", u.user.id).maybeSingle();
      _on = !!(data && ["active", "trialing"].includes(data.status) &&
        (!data.current_period_end || new Date(data.current_period_end) > new Date()));
    } catch (e) { _on = false; }
    _loaded = true; sync(); return _on;
  }
  function sync() { try { localStorage.setItem("tt_premium", _on ? "1" : "0"); } catch (e) { } }
  function isOn() { return _loaded ? _on : (localStorage.getItem("tt_premium") === "1"); }

  // 給付費功能呼叫：是會員回 true；否則跳升級彈窗並回 false
  function gate() { if (isOn()) return true; openUpgrade(); return false; }

  const BENEFITS = [
    ["map", "無限離線地圖", "一鍵預載全台與所有收藏步道，山區沒訊號也安心"],
    ["target", "進階數據分析", "月報、趨勢圖、匯出 GPX / CSV，掌握你的每一步"],
    ["sparkle", "去廣告 ・ 高級外觀", "乾淨無干擾，社群名稱旁顯示專屬 PRO 徽章"],
  ];
  const icc = n => (typeof ic === "function" ? ic(n) : "");

  function openUpgrade() {
    const ov = document.createElement("div");
    ov.className = "pv-mask premium-mask";
    ov.innerHTML = `<div class="premium-card">
      <button class="comp-x" id="pmX" aria-label="關閉">${icc("x")}</button>
      <div class="pm-crown">${icc("sparkle")}</div>
      <h2>循徑拾光 Premium</h2>
      <p class="pm-sub">支持開發，解鎖進階功能</p>
      <div class="pm-benefits">${BENEFITS.map(([i, t, d]) => `<div class="pm-b"><span class="pm-b-ic">${icc(i)}</span><div><b>${t}</b><div class="pm-b-d">${d}</div></div></div>`).join("")}</div>
      <div class="pm-price"><span class="pm-amt">NT$60</span><span class="pm-per"> / 月</span></div>
      <button class="btn primary" id="pmGo">升級 Premium</button>
      <button class="link-btn pm-later" id="pmLater">以後再說</button>
    </div>`;
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.querySelector("#pmX").addEventListener("click", close);
    ov.querySelector("#pmLater").addEventListener("click", close);
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    ov.querySelector("#pmGo").addEventListener("click", () => startCheckout());
  }

  async function startCheckout() {
    if (!window.STRIPE_ENABLED || !window.FUNCTIONS_URL) { if (typeof toast === "function") toast("付費功能即將開放，敬請期待"); return; }
    const c = (typeof Supa !== "undefined") ? Supa.client() : null;
    if (!c) return;
    const { data } = await c.auth.getSession();
    const token = data && data.session ? data.session.access_token : null;
    if (!token) { if (typeof toast === "function") toast("請先到社群分頁登入再升級"); return; }
    try {
      if (typeof toast === "function") toast("前往結帳…");
      const r = await fetch(window.FUNCTIONS_URL + "/create-checkout", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "apikey": window.SUPABASE_ANON_KEY || "" },
        body: JSON.stringify({ origin: location.origin }),
      });
      const j = await r.json();
      if (j.url) location.href = j.url;
      else if (typeof toast === "function") toast("結帳建立失敗：" + (j.error || ""));
    } catch (e) { if (typeof toast === "function") toast("結帳失敗：" + (e && e.message || e)); }
  }

  // 我的頁的會員狀態方塊
  function renderBox(el) {
    if (!el) return;
    if (typeof Supa === "undefined" || !Supa.ready || !Supa.ready()) { el.innerHTML = ""; return; }
    if (isOn()) {
      el.innerHTML = `<div class="pm-status on"><span class="pm-b-ic">${icc("sparkle")}</span><div><b>Premium 會員</b><div class="pm-b-d">感謝你的支持 ・ 進階功能已全部解鎖</div></div></div>`;
    } else {
      el.innerHTML = `<button class="btn primary pm-upgrade" id="pmUpgradeBtn">${icc("sparkle")} 升級 Premium</button>`;
      const b = el.querySelector("#pmUpgradeBtn"); if (b) b.addEventListener("click", openUpgrade);
    }
  }

  return { refresh, isOn, gate, openUpgrade, renderBox };
})();
