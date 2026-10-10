// Premium 付費會員：訂閱狀態、升級彈窗（月/年繳 + 試用 + 比較表）、Stripe 結帳與管理。前端為軟鎖。
const Premium = (() => {
  let _on = false, _loaded = false, _periodEnd = null;

  // 查雲端訂閱狀態。⚠️ 查不到 ≠ 沒訂閱：離線、逾時、Supabase 暫時掛掉都會走到 catch，
  // 這時必須沿用上次的快取結果，否則付費會員在山上（沒訊號）開 App 就會被降級成免費版、PRO 全鎖。
  // 原生 App：商店端若確認訂閱有效，就直接解鎖，不必等 subscriptions 表。
  // 帳本（subscriptions 表）要靠 RevenueCat webhook 寫回；webhook 慢、失敗、或 app_user_id
  // 沒綁到 Supabase uid 時，使用者會「付了錢卻沒解鎖」——回復購買最明顯：商店說有、App 卻不給。
  // Apple 審核必測回復購買，回復無效是拒審理由。故商店確認就先放行，帳本晚點對上不影響。
  // RevenueCat 沒 configure 過就問不到商店（entitlementActive 直接回 false）。開機時的 refresh 比
  // 社群分頁/升級面板都早，不先補 configure 的話，重開 App 後這條永遠是 false＝帳本沒對上的人又被鎖。
  // configure 需要 Supabase uid，所以未登入時仍問不到（設計如此：匿名 app_user_id 對不回人）。
  async function storeSaysOn() {
    try {
      if (typeof IAP === "undefined" || !IAP.available || !IAP.available()) return false;
      if (IAP.configured && !IAP.configured()) await ensureIapReady();
      return await IAP.entitlementActive();
    } catch (e) { return false; }
  }

  // 自用模式：自己的 App 不必付錢給自己，全部當會員（見 config.js PERSONAL_MODE）
  const personal = () => typeof window !== "undefined" && !!window.PERSONAL_MODE;

  async function refresh() {
    if (personal()) { _on = true; _loaded = true; return true; }
    const cached = localStorage.getItem("tt_premium") === "1";
    try {
      const c = (typeof Supa !== "undefined" && Supa.ready && Supa.ready()) ? Supa.client() : null;
      if (!c) { _on = cached || await storeSaysOn(); _loaded = true; sync(); return _on; }   // 未登入/未設定：維持快取
      const { data: u, error: ue } = await c.auth.getUser();
      if (!u || !u.user) {
        // 拿不到 user 不一定是沒登入：沒訊號時 supabase-js 不會 throw，而是回 { user: null, error:
        // AuthRetryableFetchError }。這種「不確定」要跟上面 catch 一樣沿用快取，不能降級、也不能寫回 0。
        // 只有「沒有 session」或伺服器明確拒絕（4xx，token 失效）才算確定沒登入。
        const unsure = ue && ue.name !== "AuthSessionMissingError" && !(ue.status >= 400 && ue.status < 500);
        if (unsure) { _on = cached || await storeSaysOn(); _loaded = true; return _on; }
        _on = await storeSaysOn();                                // 確定沒登入：商店有訂閱仍算會員
        _loaded = true; sync(); return _on;
      }
      const { data, error } = await c.from("subscriptions").select("status, current_period_end").eq("user_id", u.user.id).maybeSingle();
      if (error) { _on = cached; _loaded = true; return _on; }     // 查詢失敗 → 沿用快取，不覆寫
      _periodEnd = data && data.current_period_end ? data.current_period_end : null;
      _on = !!(data && ["active", "trialing"].includes(data.status) && (!_periodEnd || new Date(_periodEnd) > new Date()));
      if (!_on) _on = await storeSaysOn();                         // 帳本還沒對上 → 以商店為準
      if (_on && !localStorage.getItem("tt_premium_since")) localStorage.setItem("tt_premium_since", new Date().toISOString());
    } catch (e) {
      _on = cached; _loaded = true; return _on;                    // 離線/逾時 → 沿用快取
    }
    _loaded = true; sync(); return _on;   // 只有真的查到結果才寫回快取
  }
  function sync() { try { localStorage.setItem("tt_premium", _on ? "1" : "0"); } catch (e) { } markPro(); }
  // html.is-pro：會員就藏「PRO 功能」提示標籤（身分徽章 .pro-id 不受影響）
  function markPro() { try { document.documentElement.classList.toggle("is-pro", isOn()); } catch (e) { /* */ } }
  // 登出時呼叫：清掉會員快取。不清的話，前一位使用者登出後只要不進「我的」分頁，
  // PRO 功能會在這個 session 繼續放行（共用裝置上等於把會員身分留給下一個人）。
  function clearCache() {
    _on = false; _loaded = true; _periodEnd = null;
    try { localStorage.removeItem("tt_premium"); localStorage.removeItem("tt_premium_since"); } catch (e) { /* */ }
    markPro();
  }
  function isOn() { if (window.TT_DEBUG_FREE) return false; if (personal()) return true; return _loaded ? _on : (localStorage.getItem("tt_premium") === "1"); }
  function gate(feat, note) { if (isOn()) return true; openUpgrade(feat, note); return false; }

  // PRO 功能清單（唯一來源，2026-10-10 優化輪 A4）：升級彈窗的比較表、從某個功能點進來時的說明卡都從這裡畫。
  // 程式裡每個 _proGate(功能 id) 的 id 都必須在這裡（scripts/tests/pro-registry.test.js 會檢查），新增 PRO 功能才不會漏列。
  // [id, 圖示, 名稱, 說明, 免費, PRO]；分組只影響比較表的小標題
  const FEATURES = [
    ["地圖", [
      ["offline", "map", "全台完整離線地圖", "沒有網路也能看全台到縮放 15 級（約 1.7 GB）；還能匯出／匯入地圖包，換手機不必重下", "10 MB（約 20 條步道）", "全台完整"],
      ["3d", "mountain", "3D 地形地圖", "衛星影像貼在真實地形上，可旋轉傾斜", "—", "✓"],
      ["gpx", "route", "跟著路線走（GPX）", "匯入別人的路線跟著走，也能把軌跡匯出", "—", "✓"],
      ["sim", "play", "模擬模式", "沒有 GPS 也能沿真實路線預覽整條步道", "—", "✓"],
    ]],
    ["紀錄與分析", [
      ["analytics", "target", "進階分析", "個人紀錄、時速趨勢、難度雷達、每月卡路里", "—", "✓"],
      ["year", "trophy", "年度回顧＋山行故事", "每頁都能存成限動圖", "—", "✓"],
      ["peaks", "flag", "登頂收集冊", "百岳、小百岳登頂自動蓋章，記下日期", "只蓋章", "✓"],
      ["footmap", "footprints", "足跡熱力圖", "所有軌跡疊成一張地圖", "—", "✓"],
      ["slope", "ruler", "坡度著色＋公里樁", "回顧地圖依坡度上色，每公里一個標記", "—", "✓"],
      ["speed", "clock", "這次和平常比", "結算頁比較這次和平常的移動速度", "—", "✓"],
      ["favs", "star", "收藏步道", "", "20 條", "不限量"],
      ["presets", "bookmark", "口袋路線", "把常用的篩選條件存起來", "3 組", "不限量"],
    ]],
    ["夥伴與外觀", [
      ["journey", "compass", "夥伴的旅行", "明信片、22 縣市地圖、各地區配件", "—", "✓"],
      ["petdress", "sparkle", "夥伴命名與裝扮", "", "挑戰獎勵", "全部"],
      ["petphoto", "camera", "好友夥伴合照", "", "—", "✓"],
      ["look", "crown", "PRO 徽章與主題配色", "頭像框、名字跟色、專屬主題", "—", "✓"],
      ["emoji", "chat", "表情貼", "", "6 個", "30 個"],
      ["widget", "calendar", "主畫面小工具", "主畫面看夥伴、連續天數、本週里程", "—", "✓"],
    ]],
    ["社群", [
      ["club", "users", "建立山社", "", "—", "✓"],
    ]],
  ];
  const FEAT = {}; FEATURES.forEach(([, rows]) => rows.forEach(r => { FEAT[r[0]] = r; }));
  // 永遠免費：安全功能分三組（出發前／山上／互助）；不是安全功能但也免費的另外一行，不混在一起
  const ALWAYS_FREE = [
    ["backpack", "出發前", ["登山計畫書", "留守人", "山頂天氣", "林業署路況"]],
    ["mountain", "在山上", ["偏離路線提醒", "天黑倒數", "原路返回", "高山提醒", "低電量提醒", "求救卡"]],
    ["users", "互助", ["山友路況回報"]],
  ];
  const ALSO_FREE = ["附近步道", "記錄中鎖定畫面卡片", "夥伴養成", "離線地圖 10 MB"];
  const icc = n => (typeof ic === "function" ? ic(n) : "");
  // 預覽圖（優化輪 4 H）：沒用過的人光看文字想像不出來，一排可以左右滑的小插圖（畫在程式裡，不用下載）
  const PREVIEW = [
    ["offline", "全台完整離線地圖", '<rect width="120" height="80" fill="#e9efe3"/><path d="M58 6c10 6 16 20 18 34s-4 30-12 36c-6-8-14-14-16-26S50 14 58 6Z" fill="#9cc49a" stroke="#4f7a52" stroke-width="1.2"/><g stroke="#4f7a52" stroke-opacity=".25">' + [0, 1, 2, 3, 4, 5].map(i => `<path d="M${10 + i * 20} 0v80M0 ${8 + i * 14}h120"/>`).join("") + '</g><circle cx="92" cy="58" r="13" fill="#2c5d3f"/><path d="M92 50v12m-5-4 5 5 5-5" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>'],
    ["3d", "3D 地形地圖", '<defs><linearGradient id="pv3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b8d4e8"/><stop offset="1" stop-color="#e8f1f6"/></linearGradient></defs><rect width="120" height="80" fill="url(#pv3)"/><path d="M0 62 26 30l14 12 22-26 20 22 14-10 24 26v26H0Z" fill="#6f9a64"/><path d="M0 70 30 44l16 10 24-18 22 18 28-12v38H0Z" fill="#4f7a48"/><path d="M62 16l-6 8 6-2 6 3Z" fill="#fff"/><path d="M14 72c12-8 22-14 34-14s22-10 30-20" stroke="#e8893b" stroke-width="2.4" fill="none" stroke-dasharray="4 3"/>'],
    ["footmap", "足跡熱力圖", '<rect width="120" height="80" fill="#eef1ea"/><path d="M0 50h120M0 22h120M40 0v80M84 0v80" stroke="#cfd8c6"/>' + [[8, 70, 40, 30, 70, 46, 110, 14], [14, 66, 44, 36, 76, 40, 104, 20], [6, 44, 36, 50, 62, 30, 112, 36], [20, 74, 50, 52, 82, 58, 116, 66]].map(q => `<path d="M${q[0]} ${q[1]}Q${q[2]} ${q[3]} ${q[4]} ${q[5]}T${q[6]} ${q[7]}" stroke="#e8590c" stroke-opacity=".45" stroke-width="4" fill="none" stroke-linecap="round"/>`).join("")],
    ["slope", "坡度著色＋公里樁", '<rect width="120" height="80" fill="#f4f1e8"/><path d="M6 66 30 58" stroke="#4a8f55" stroke-width="4" stroke-linecap="round"/><path d="M30 58 56 40" stroke="#c39327" stroke-width="4" stroke-linecap="round"/><path d="M56 40 76 18" stroke="#c0542f" stroke-width="4" stroke-linecap="round"/><path d="M76 18 96 30 114 34" stroke="#4a8f55" stroke-width="4" stroke-linecap="round"/>' + [[30, 58, 1], [56, 40, 2], [96, 30, 3]].map(([x, y, n]) => `<circle cx="${x}" cy="${y}" r="7" fill="#fff" stroke="#2c5d3f" stroke-width="1.4"/><text x="${x}" y="${y + 3}" font-size="8" font-weight="700" text-anchor="middle" fill="#2c5d3f">${n}</text>`).join("")],
    ["journey", "夥伴的旅行（明信片）", '<rect width="120" height="80" fill="#efe6d4"/><rect x="14" y="10" width="92" height="60" rx="4" fill="#fffaf0" stroke="#d8c9a8"/><path d="M20 58 40 34l12 12 16-20 14 16 18-10v26H20Z" fill="#8fb08a"/><circle cx="34" cy="24" r="6" fill="#f0b74a"/><rect x="84" y="15" width="16" height="19" rx="2" fill="#fff" stroke="#c2683d" stroke-dasharray="2 1.5"/><path d="M88 29l4-7 4 7Z" fill="#c2683d"/>'],
    ["analytics", "進階分析", '<rect width="120" height="80" fill="#f4f1e8"/>' + [18, 30, 22, 44, 36, 52, 40].map((h, i) => `<rect x="${10 + i * 11}" y="${70 - h}" width="7" height="${h}" rx="2" fill="${i === 5 ? "#e8893b" : "#4a8f55"}"/>`).join("") + '<polygon points="98,16 112,26 108,44 88,44 84,26" fill="#c2683d" fill-opacity=".25" stroke="#c2683d" stroke-width="1.2"/><polygon points="98,8 118,24 112,50 84,50 78,24" fill="none" stroke="#bdb3a0"/>'],
  ];

  // feat：從哪個 PRO 功能點進來（最上面先講那個功能）；note：補一句（例如收集冊「已蓋 5 章」）
  function openUpgrade(feat, note) {
    if (personal()) return;
    if (document.querySelector(".premium-mask")) return;   // 防連點疊層
    let plan = "month";
    const f = typeof feat === "string" ? FEAT[feat] : null;
    const ov = document.createElement("div");
    ov.className = "pv-mask premium-mask";
    ov.innerHTML = `<div class="premium-card">
      <button class="comp-x" id="pmX" aria-label="關閉">${icc("x")}</button>
      <div class="pm-crown">${icc("sparkle")}</div>
      <h2>循徑拾光 Premium</h2>
      <p class="pm-sub">支持開發，解鎖全部進階功能</p>
      ${f ? `<div class="pm-feat" data-feat="${f[0]}"><span class="pm-b-ic">${icc(f[1])}</span><div><b>${f[2]}</b><span class="pro-tag">PRO</span>${f[3] && !note ? `<div class="pm-b-d">${f[3]}</div>` : ""}${note ? `<div class="pm-note">${note}</div>` : ""}</div></div>` : ""}
      <div class="pm-plans">
        <button class="pm-plan on" data-plan="month"><b>月繳</b><span>NT$100 / 月</span></button>
        <button class="pm-plan" data-plan="year"><b>年繳</b><span>NT$1000 / 年</span><i class="pm-save">省 2 個月</i></button>
      </div>
      <button class="btn primary" id="pmGo">免費試用 7 天</button>
      <div class="pm-fine">試用期免費，之後依方案自動續訂，可隨時取消</div>
      <div class="pm-pv" aria-label="Premium">${PREVIEW.map(([id, t, svg]) => `<figure class="pm-pv-c${f && f[0] === id ? " on" : ""}"><svg viewBox="0 0 120 80" aria-hidden="true">${svg}</svg><figcaption>${t}</figcaption></figure>`).join("")}</div>
      <div class="pm-free">
        <div class="pm-free-h">${icc("shield")}<b>安全功能永遠免費</b></div>
        <div class="pm-free-grid">${ALWAYS_FREE.map(([i, t, xs]) => `<div class="pm-fg"><div class="pm-fg-h">${icc(i)}${t}</div><ul>${xs.map(x => `<li>${x}</li>`).join("")}</ul></div>`).join("")}</div>
        <div class="pm-also"><b>也免費</b>${ALSO_FREE.map(x => `<span>${x}</span>`).join("")}</div>
      </div>
      <div class="pm-inc"><div class="pm-inc-h">Premium 包含</div><div class="pm-inc-grid">${FEATURES.map(([, rows]) => rows.map(([id, i, t, , , c]) => `<span class="pm-i${f && f[0] === id ? " on" : ""}">${icc(i)}<span>${t}${c !== "✓" ? `<small>${c}</small>` : ""}</span></span>`).join("")).join("")}</div></div>
      <details class="pm-more"><summary>免費和 Premium 逐項比較</summary>
      <table class="pm-compare"><thead><tr><th></th><th>免費</th><th>Premium</th></tr></thead>
        ${FEATURES.map(([g, rows]) => `<tbody><tr class="pm-g"><th colspan="3">${g}</th></tr>${rows.map(([id, i, t, d, a, c]) => `<tr${f && f[0] === id ? ' class="on"' : ""}><td><span class="pm-t">${icc(i)}<span><b>${t}</b>${d ? `<small>${d}</small>` : ""}</span></span></td><td>${a}</td><td class="pm-pro">${c}</td></tr>`).join("")}</tbody>`).join("")}
      </table></details>
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
    if (which !== "terms" && typeof ttOpenDoc === "function") { ttOpenDoc("privacy"); return; }   // 自己的隱私權政策：App 內有關閉鍵的面板
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
      // 面板開著時可能才登入/登出 → 回復當下重新確認一次綁定（購買路徑本來就有做，這裡原本漏了）。
      // 沒綁對的話，restorePurchases() 會掛在匿名的 app_user_id 上，webhook 寫回來對不到人。
      await ensureIapReady();
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
    if (personal()) {   // 自用：顯示會員身分卡，但沒有訂閱可管理
      if (el) el.innerHTML = `<div class="pm-status on"><span class="pm-b-ic">${icc("sparkle")}</span><div><b>Premium 會員</b><div class="pm-b-d">進階功能已全部解鎖</div></div></div>`;
      return;
    }
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
      // 輪詢到底還是沒解鎖：商店明明說有訂閱卻進不來，多半是 webhook 沒寫回 subscriptions 表
      // 或 app_user_id 沒綁到 Supabase uid。把原因記進 client_errors，別讓它只留一句「處理中」。
      else {
        storeSaysOn().then(storeOn => {
          if (typeof toast === "function") {
            toast(storeOn ? ttT("已購買但同步中，請稍後或重開 App") : ttT("款項處理中，稍後自動生效"));
          }
          if (storeOn) {
            try {
              const a = JSON.parse(localStorage.getItem("tt_errors") || "[]");
              a.unshift({ t: new Date().toISOString(), m: "Premium: 商店 entitlement 有效但 subscriptions 表查不到（webhook 或 app_user_id 綁定問題）" });
              localStorage.setItem("tt_errors", JSON.stringify(a.slice(0, 20)));
            } catch (_) { /* 記錯誤失敗不能再噴錯 */ }
          }
        });
      }
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

  if (typeof document !== "undefined") setTimeout(markPro, 0);   // 開機依快取先標一次
  return { FEATURES, FEAT, refresh, isOn, gate, openUpgrade, openPortal, renderBox, handleReturn, clearCache };
})();
