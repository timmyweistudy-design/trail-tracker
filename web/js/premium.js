// Premium 付費會員：訂閱狀態、升級彈窗（月/年繳 + 試用 + 比較表）、Stripe 結帳與管理。前端為軟鎖。
const Premium = (() => {
  let _on = false, _loaded = false, _periodEnd = null;

  // 查雲端訂閱狀態。⚠️ 查不到 ≠ 沒訂閱：離線、逾時、Supabase 暫時掛掉都會走到 catch，
  // 這時必須沿用上次的快取結果，否則付費會員在山上（沒訊號）開 App 就會被降級成免費版、PRO 全鎖。
  async function refresh() {
    const cached = localStorage.getItem("tt_premium") === "1";
    try {
      const c = (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) ? Supa.client() : null;
      if (!c) { _on = cached; _loaded = true; return _on; }        // 未登入/未設定：維持快取，不主動降級
      const { data: u } = await c.auth.getUser();
      if (!u || !u.user) { _on = false; _loaded = true; sync(); return false; }   // 確定沒登入 → 才是真的非會員
      const { data, error } = await c.from("subscriptions").select("status, current_period_end").eq("user_id", u.user.id).maybeSingle();
      if (error) { _on = cached; _loaded = true; return _on; }     // 查詢失敗 → 沿用快取，不覆寫
      _periodEnd = data && data.current_period_end ? data.current_period_end : null;
      _on = !!(data && ["active", "trialing"].includes(data.status) && (!_periodEnd || new Date(_periodEnd) > new Date()));
      if (_on && !localStorage.getItem("tt_premium_since")) localStorage.setItem("tt_premium_since", new Date().toISOString());
    } catch (e) {
      _on = cached; _loaded = true; return _on;                    // 離線/逾時 → 沿用快取
    }
    _loaded = true; sync(); return _on;   // 只有真的查到結果才寫回快取
  }
  function sync() { try { localStorage.setItem("tt_premium", _on ? "1" : "0"); } catch (e) { } }
  // 登出時呼叫：清掉會員快取。不清的話，前一位使用者登出後只要不進「我的」分頁，
  // PRO 功能會在這個 session 繼續放行（共用裝置上等於把會員身分留給下一個人）。
  function clearCache() {
    _on = false; _loaded = true; _periodEnd = null;
    try { localStorage.removeItem("tt_premium"); localStorage.removeItem("tt_premium_since"); } catch (e) { /* */ }
  }
  function isOn() { return _loaded ? _on : (localStorage.getItem("tt_premium") === "1"); }
  function gate() { if (isOn()) return true; openUpgrade(); return false; }

  const BENEFITS = [
    ["map", "無限離線地圖", "免費共 10 MB；會員不限量，還能匯出/匯入地圖包跨裝置共用"],
    ["target", "進階分析＋年度回顧", "個人紀錄、配速趨勢、難度雷達、每月卡路里、年度回顧圖卡、匯出 GPX/CSV/KML"],
    ["mountain", "3D 地形地圖", "衛星影像貼在真實地形上、可旋轉傾斜；步道詳情與行程回放都能看"],
    ["bookmark", "無限收藏", "免費上限 20 條；會員不限"],
    ["users", "足跡熱力圖＋好友比較", "所有軌跡疊成一張地圖、好友里程排行"],
    ["route", "軌跡坡度著色＋公里樁", "行程回顧地圖依坡度上色（緩坡綠→陡坡紅），每公里一個標記樁"],
    ["target", "進階數據", "爬升速率 m/hr、分段配速、速度趨勢"],
    ["download", "路線檔匯入匯出", "跟著別人的 GPX 路線走、把自己的軌跡匯出成 GPX"],
    ["play", "模擬模式", "沒有 GPS 也能沿真實步道路線預覽整條路線"],
    ["sparkle", "專屬外觀與身分", "PRO 徽章、頭像框、名字跟色、專屬主題、夥伴命名與裝扮、PRO 表情貼"],
  ];
  // 免費 vs Premium 比較
  const COMPARE = [
    ["離線地圖", "10 MB", "無限"],
    ["記錄時預載周邊地圖", "縮小範圍", "完整"],
    ["地圖包匯出 / 匯入", "—", "✓"],
    ["進階分析", "—", "完整"],
    ["年度回顧", "—", "✓"],
    ["3D 地形地圖", "—", "✓"],
    ["收藏步道", "20 條", "無限"],
    ["足跡熱力圖", "—", "✓"],
    ["軌跡坡度著色 / 公里樁", "—", "✓"],
    ["爬升速率 / 分段配速", "—", "✓"],
    ["GPX 匯入 / 匯出", "—", "✓"],
    ["模擬模式", "—", "✓"],
    ["PRO 徽章 / 主題 / 表情貼", "—", "✓"],
    ["夥伴命名·裝扮 / 頭像框", "—", "✓"],
  ];
  const icc = n => (typeof ic === "function" ? ic(n) : "");

  function openUpgrade() {
    if (document.querySelector(".premium-mask")) return;   // 防連點疊層
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
        <button class="pm-plan on" data-plan="month"><b>月繳</b><span>NT$100 / 月</span></button>
        <button class="pm-plan" data-plan="year"><b>年繳</b><span>NT$1000 / 年</span><i class="pm-save">省 2 個月</i></button>
      </div>
      <button class="btn primary" id="pmGo">免費試用 7 天</button>
      <div class="pm-fine">試用期免費，之後依方案自動續訂，可隨時取消</div>
      <div class="pm-legal"><a href="#" data-legal="privacy">隱私權政策</a> · <a href="#" data-legal="terms">使用條款</a></div>
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
    ov.querySelectorAll("[data-legal]").forEach(a => a.addEventListener("click", e => {
      e.preventDefault(); openLegal(a.getAttribute("data-legal"));
    }));
    applyNative(ov);   // 原生：價格改用商店回傳值、補上「回復購買」
  }

  // Apple 3.1.2：訂閱購買畫面必須有隱私權政策與使用條款連結（缺了是常見退件原因）。
  // 使用條款用 Apple 的標準 EULA（沒自訂 EULA 時 Apple 指定用這份）。
  const SITE = "https://trail-tracker-0ma5.onrender.com";
  const EULA = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";
  function openLegal(which) {
    const url = which === "terms" ? EULA : SITE + "/privacy.html";
    const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
    if (B) { B.open({ url }).catch(() => window.open(url, "_blank")); return; }   // 原生：開系統瀏覽器，不要在 App 內導航離開
    window.open(url, "_blank", "noopener");
  }

  // RevenueCat 的 configure() 一定要先跑，getOfferings() 才不會拋錯。原本它只掛在 social/auth.js
  // 的 onAuthStateChange 裡，而那個 listener 只有切到社群分頁（SocialUI.onShow）才註冊——使用者
  // 開 App 直接點升級就永遠沒 configure 過，面板會誤報「設定中」。這裡自己補齊整條前置。
  // 回傳值：uid = 可購買；"nologin" = 尚未登入；"fail" = configure 失敗。
  async function ensureIapReady() {
    if (typeof Supa === "undefined" && window.loadSocial) { try { await window.loadSocial(); } catch (e) { /* 載不到就當未登入降級 */ } }
    if (typeof Supa === "undefined" || !Supa.ready()) return "nologin";
    const c = Supa.client(); if (!c) return "nologin";
    let uid = null;
    try { const { data } = await c.auth.getSession(); uid = (data && data.session && data.session.user) ? data.session.user.id : null; }
    catch (e) { return "nologin"; }
    if (!uid) return "nologin";
    return (await IAP.init(uid)) ? uid : "fail";
  }

  // 原生 App 專用調整。Apple 要求：價格須與商店一致（不能寫死 NT$60）、必須能回復購買。
  async function applyNative(ov) {
    if (typeof IAP === "undefined" || !IAP.native()) return;
    const go = ov.querySelector("#pmGo");
    if (!IAP.available()) {   // 原生但 IAP 未設定 → 不顯示任何付費入口（更不能退回 Stripe，那是拒審理由）
      ov.querySelector(".pm-plans")?.remove();
      ov.querySelector(".pm-fine")?.remove();
      if (go) { go.disabled = true; go.textContent = ttT("付費功能即將開放，敬請期待"); }
      return;
    }
    // 未登入不能買：RevenueCat 的 app_user_id 必須等於 Supabase user id，否則 webhook 寫回來對不到人
    // （錢收了但功能沒解鎖）。這跟 Stripe 那條路徑的前提一致，只是訊息要講清楚、不能混進「設定中」。
    const st = await ensureIapReady();
    if (st === "nologin") {
      ov.querySelector(".pm-plans")?.remove();
      ov.querySelector(".pm-fine")?.remove();
      if (go) { go.disabled = true; go.textContent = ttT("請先到社群分頁登入再升級"); }
      return;
    }
    const ps = st === "fail" ? null : await IAP.plans();
    if (!ps) {
      // 原生、IAP 已啟用，但商店拿不到方案——最常見是「付費 App 協議尚未生效」或商品剛建好還沒傳播。
      // 不能顯示寫死的假價格＋可按的購買鈕（點了只會靜默失敗），改成明確告知「設定中」。
      ov.querySelector(".pm-plans")?.remove();
      ov.querySelector(".pm-fine")?.remove();
      if (go) { go.disabled = true; go.textContent = ttT("付費方案設定中，請稍後再試"); }
      // 真正的原因由 IAP.note() 記進 client_errors 表（維運後台查得到），不印在使用者畫面上。
      return;
    }
    const m = ov.querySelector('.pm-plan[data-plan="month"] span');
    const y = ov.querySelector('.pm-plan[data-plan="year"] span');
    if (m && ps.month) m.textContent = ps.month.price;
    if (y && ps.year) y.textContent = ps.year.price;
    const r = document.createElement("button");
    r.className = "link-btn pm-restore"; r.id = "pmRestore"; r.textContent = ttT("回復購買");
    ov.querySelector(".premium-card").insertBefore(r, ov.querySelector("#pmLater"));
    r.addEventListener("click", async () => {
      if (typeof toast === "function") toast(ttT("回復購買中…"));
      const on = await IAP.restore();
      if (on) { ov.remove(); pollUnlock(); }
      else if (typeof toast === "function") toast(ttT("找不到可回復的購買"));
    });
  }

  async function authToken() {
    const c = (typeof Supa !== "undefined") ? Supa.client() : null; if (!c) return null;
    const { data } = await c.auth.getSession();
    return data && data.session ? data.session.access_token : null;
  }

  async function startCheckout(plan) {
    // 原生 App 一律走 IAP：Apple/Google 規定 App 內數位功能不得用外部金流，走 Stripe 會被拒審
    if (typeof IAP !== "undefined" && IAP.native()) {
      if (!IAP.available()) { if (typeof toast === "function") toast("付費功能即將開放，敬請期待"); return; }
      const st = await ensureIapReady();   // 面板開著時可能才登入/登出，購買當下重新確認一次
      if (st === "nologin") { if (typeof toast === "function") toast(ttT("請先到社群分頁登入再升級")); return; }
      const r = await IAP.purchase(plan);
      if (r === "cancel") return;                    // 使用者自己取消：安靜收工
      if (r === "noplans") { if (typeof toast === "function") toast("付費方案設定中，請稍後再試"); return; }
      if (r !== "ok") { if (typeof toast === "function") toast("購買失敗，請稍後再試"); return; }
      if (typeof toast === "function") toast("付款完成，歡迎加入 Premium！");
      document.querySelector(".premium-mask")?.remove();
      pollUnlock();                                  // webhook 寫入有延遲 → 輪詢到解鎖為止
      return;
    }
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

  // 管理訂閱：原生開系統的訂閱設定頁，網頁開 Stripe Customer Portal
  async function openPortal() {
    if (typeof IAP !== "undefined" && IAP.native()) {
      const url = IAP.manageUrl();
      const B = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser;
      if (B) { try { await B.open({ url }); return; } catch (e) { /* 落到 window.open */ } }
      window.open(url, "_system");
      return;
    }
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
      const until = _periodEnd ? new Date(_periodEnd).toLocaleDateString(ttLocale()) : "";
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

  // 付款完成 → webhook 寫入可能略有延遲：輪詢到解鎖為止（Stripe 與 IAP 共用）
  function pollUnlock(tries) {
    tries = tries || 0;
    refresh().then(on => {
      if (on) { try { document.querySelector('.tab[data-view="me"]')?.click(); } catch (e) { } return; }
      if (tries < 6) setTimeout(() => pollUnlock(tries + 1), 2500);
      else if (typeof toast === "function") toast("款項處理中，稍後自動生效");
    });
  }

  // 從 Stripe 結帳返回：?premium=success → 提示並更新狀態
  function handleReturn() {
    try {
      const p = new URLSearchParams(location.search).get("premium");
      if (!p) return;
      history.replaceState(null, "", location.pathname);
      if (p === "success") {
        if (typeof toast === "function") toast("付款完成，歡迎加入 Premium！");
        pollUnlock();
      } else if (p === "cancel") {
        if (typeof toast === "function") toast("已取消結帳");
      }
    } catch (e) { /* */ }
  }

  return { refresh, isOn, gate, openUpgrade, openPortal, renderBox, handleReturn, clearCache };
})();
