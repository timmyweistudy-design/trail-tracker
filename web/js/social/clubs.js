// 山社：平常一起爬的那群人（資料庫 schema-phase34-clubs.sql）。小隊是「這一趟一起走」，山社是長期的同好會。
// 入口：社群 →「搜尋」頁最上面。加入免費；建立山社是 PRO（每人最多 3 個）。
// 山社頁三格：本週排行（成員最近 7 天發的行程加總）、動態（成員的貼文）、成員。
const Clubs = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const esc = s => Supa.esc(s);
  const say = s => { if (typeof toast === "function") toast(s); };
  let _wrap = null, _view = { k: "list" }, _q = "";

  function errText(m) {
    m = m || "";
    if (/does not exist|schema cache/.test(m)) return T("資料庫還沒開山社功能（要先跑 schema-phase34-clubs.sql）");
    if (/club limit/.test(m)) return T("每人最多建立 3 個山社");
    if (/join limit/.test(m)) return T("最多加入 20 個山社");
    if (/members only/.test(m)) return T("加入後才看得到");
    return T(Supa.errText(m));
  }
  async function rpc(n, args) {
    try { const { data, error } = await Supa.client().rpc(n, args || {}); return { data, error: error && error.message }; }
    catch (e) { return { data: null, error: (e && e.message) || "network" }; }
  }
  function genCode() { const ch = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += ch[Math.floor(Math.random() * ch.length)]; return s; }
  const avatar = p => p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}" alt="">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle || "?").slice(0, 1))}</div>`;
  const meta = c => [c.region ? T(c.region) : "", T("%d 人").replace("%d", c.members), c.is_public ? "" : T("不公開")].filter(Boolean).join(" · ");
  const row = c => `<button class="club-row" data-id="${esc(c.id)}"><span class="club-badge" translate="no">${esc(c.name.slice(0, 1))}</span><span class="club-row-t"><b translate="no">${esc(c.name)}</b><small>${esc(meta(c))}</small></span>${ic("chevron")}</button>`;

  async function open() {
    if (typeof ttBusy === "function" && ttBusy("clubs")) return;
    if (document.querySelector('[data-ov="clubs"]')) return;
    if (typeof Supa === "undefined" || !Supa.ready()) { say(T("社群尚未啟用")); return; }
    const sess = typeof Auth !== "undefined" ? await Auth.session().catch(() => null) : null;
    if (!sess) { say(T("先到「社群」分頁登入")); return; }
    _wrap = document.createElement("div"); _wrap.className = "pv-mask"; _wrap.dataset.ov = "clubs";
    _wrap.innerHTML = `<div class="pv club-sheet"><div class="pv-head"><button class="comp-x" id="clBack" aria-label="${esc(T("關閉"))}">${ic("x")}</button><b id="clTitle" translate="no">${T("山社")}</b><span></span></div>
      <div class="pv-body" id="clBody"></div></div>`;
    document.body.appendChild(_wrap);
    let _a11y = null;
    // 按鈕送出時會 disabled → 焦點掉回 body，全域 Esc 只會按到「返回」；面板在最上層時 Esc 一律整個關掉
    const onEsc = e => {
      if (e.key !== "Escape" || e.defaultPrevented || !_wrap) return;
      if (document.querySelector(".ttdlg-ov, .premium-mask, .img-prev")) return;   // 上面還疊著確認框／升級面板：讓它們自己處理
      const ovs = [...document.querySelectorAll("[data-ov]")].filter(m => m.getClientRects().length > 0);
      if (ovs[ovs.length - 1] === _wrap) { e.preventDefault(); close(); }
    };
    const close = () => { document.removeEventListener("keydown", onEsc, true); if (_a11y) _a11y(); if (_wrap) _wrap.remove(); _wrap = null; };
    document.addEventListener("keydown", onEsc, true);
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(_wrap, close, { focus: "#clBack" });
    _wrap.addEventListener("click", e => { if (e.target === _wrap) close(); });
    _wrap.querySelector("#clBack").addEventListener("click", () => { if (_view.k === "list") close(); else showList(); });
    showList();
  }
  function setHead(title, back) {
    if (!_wrap) return;
    _wrap.querySelector("#clTitle").textContent = title;
    const b = _wrap.querySelector("#clBack");
    b.innerHTML = back ? ic("chevron") : ic("x"); b.classList.toggle("cl-back", !!back);
    b.setAttribute("aria-label", back ? T("返回") : T("關閉"));
    try { b.focus({ preventScroll: true, focusVisible: !!window.__ttKbd }); } catch (e) { /* */ }   // 換頁時焦點留在面板裡，Esc 才關得掉
  }
  const body = () => _wrap && _wrap.querySelector("#clBody");

  // ───────── 列表 ─────────
  async function showList() {
    _view = { k: "list" }; setHead(T("山社"), false);
    const el = body(); if (!el) return;
    el.innerHTML = `<p class="club-intro">${T("山社是平常一起爬的那群人：看彼此的行程、比比這週誰走最多。")}</p>
      <div id="clMine"><div class="feed-loading"><span class="spin"></span></div></div>
      <div class="ob-l">${T("找山社")}</div>
      <input id="clQ" class="auth-input" type="search" placeholder="${esc(T("名稱或地區"))}" value="${esc(_q)}" enterkeyhint="search">
      <div id="clFound"></div>
      <hr class="tm-hr">
      <div class="ob-l">${T("用加入碼加入")}</div>
      <div class="tm-create"><input id="clCode" class="auth-input" placeholder="${esc(T("6 碼"))}" autocapitalize="characters" maxlength="8" autocomplete="off"><button class="btn ghost" id="clJoinCode">${T("加入")}</button></div>
      <button class="btn primary club-new" id="clNew">${ic("plus")}${T("建立山社")}${!isPro() ? ` <span class="pro-tag">PRO</span>` : ""}</button>
      <div class="auth-msg" id="clMsg"></div>`;
    const q = el.querySelector("#clQ"); let t = null;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { _q = q.value.trim(); loadList(); }, 300); });
    el.querySelector("#clJoinCode").addEventListener("click", joinByCode);
    el.querySelector("#clNew").addEventListener("click", () => { if (!_proGate("club")) return; showCreate(); });
    loadList();
  }
  let _lseq = 0;
  async function loadList() {
    const my = ++_lseq;
    const { data, error } = await rpc("club_list", { p_q: _q || null });
    if (my !== _lseq || _view.k !== "list" || !body()) return;
    const mine = body().querySelector("#clMine"), found = body().querySelector("#clFound");
    if (error) { mine.innerHTML = `<div class="social-empty">${esc(errText(error))}</div>`; found.innerHTML = ""; return; }
    const rows = data || [], m = rows.filter(c => c.is_member), f = rows.filter(c => !c.is_member);
    mine.innerHTML = m.length ? `<div class="ob-l">${T("我的山社")}</div>${m.map(row).join("")}`
      : `<div class="social-empty club-empty">${ic("users")}${T("還沒加入山社。找一個附近的，或自己開一個。")}</div>`;
    found.innerHTML = f.length ? f.map(row).join("") : `<div class="club-none">${_q ? T("找不到符合的公開山社") : T("還沒有其他公開山社")}</div>`;
    body().querySelectorAll(".club-row").forEach(b => b.addEventListener("click", () => { const c = rows.find(x => x.id === b.dataset.id); if (c) showClub(c); }));
  }
  async function joinByCode() {
    const el = body(), inp = el.querySelector("#clCode"), msg = el.querySelector("#clMsg"), btn = el.querySelector("#clJoinCode");
    const code = inp.value.trim().toUpperCase(); if (code.length < 4) { msg.textContent = T("加入碼是 6 碼"); return; }
    btn.disabled = true;
    const { data, error } = await rpc("join_club_by_code", { p_code: code });
    btn.disabled = false;
    if (error) { msg.textContent = errText(error); return; }
    if (!data) { msg.textContent = T("找不到這個加入碼，再確認一下"); return; }
    say(T("加入山社了")); openById(data);
  }
  async function openById(id) {
    const { data } = await rpc("club_list", { p_q: null });
    const c = (data || []).find(x => x.id === id);
    if (c) showClub(c); else showList();
  }

  // ───────── 建立 ─────────
  function showCreate() {
    _view = { k: "create" }; setHead(T("建立山社"), true);
    const groups = typeof REGION_GROUPS !== "undefined" ? REGION_GROUPS : [];
    body().innerHTML = `<label class="ob-l" for="clName">${T("名稱")}</label>
      <input id="clName" class="auth-input" maxlength="30" placeholder="${esc(T("例：週六郊山小分隊"))}">
      <label class="ob-l" for="clRegion">${T("地區")}</label>
      <select id="clRegion" class="auth-input"><option value="">${T("不限")}</option>${groups.map(([g, rs]) => `<optgroup label="${esc(T(g))}">${rs.map(r => `<option value="${esc(r)}">${esc(T(r))}</option>`).join("")}</optgroup>`).join("")}</select>
      <label class="ob-l" for="clAbout">${T("介紹")}</label>
      <textarea id="clAbout" class="auth-input" maxlength="200" rows="3" placeholder="${esc(T("多久爬一次、喜歡什麼樣的路線"))}"></textarea>
      <label class="sim-toggle"><input type="checkbox" id="clPublic" checked> ${T("公開（大家搜得到、按一下就能加入）")}</label>
      <button class="btn primary club-new" id="clCreate">${T("建立")}</button><div class="auth-msg" id="clMsg"></div>`;
    const el = body();
    el.querySelector("#clCreate").addEventListener("click", async () => {
      const name = el.querySelector("#clName").value.trim(), msg = el.querySelector("#clMsg"), b = el.querySelector("#clCreate");
      if (!name) { msg.textContent = T("取個名字吧"); el.querySelector("#clName").focus(); return; }
      if (!(await ttRulesGate()) || !ttCleanOk(name, el.querySelector("#clAbout").value)) return;
      b.disabled = true;
      const { data, error } = await rpc("create_club", { p_name: name, p_about: el.querySelector("#clAbout").value.trim() || null, p_region: el.querySelector("#clRegion").value || null, p_public: el.querySelector("#clPublic").checked, p_code: genCode() });
      b.disabled = false;
      if (error) { msg.textContent = errText(error); return; }
      say(T("山社建好了，把加入碼分享給山友吧")); openById(data);
    });
  }

  // ───────── 山社頁 ─────────
  function showClub(c, tab) {
    _view = { k: "club", c, tab: tab || "board" }; setHead(c.name, true);
    const el = body();
    const owner = c.my_role === "owner";
    el.innerHTML = `<div class="club-hero"><span class="club-badge big" translate="no">${esc(c.name.slice(0, 1))}</span><div><h3 translate="no">${esc(c.name)}</h3><small>${esc(meta(c))}</small></div></div>
      ${c.about ? `<p class="club-about" translate="no">${esc(c.about)}</p>` : ""}
      ${c.is_member ? `<div class="team-code club-code">${T("加入碼")} <span class="tc-v">${esc(c.join_code || "")}</span><button class="tc-copy" id="clShare" aria-label="${esc(T("分享加入碼"))}">${ic("share")}</button></div>
        <div class="pk-tabs club-tabs">${[["board", T("本週排行")], ["feed", T("動態")], ["members", T("成員")]].map(([k, l]) => `<button class="pk-tab${_view.tab === k ? " on" : ""}" data-t="${k}">${l}</button>`).join("")}</div>
        <div id="clTab"></div>
        <div class="tm-danger">${owner ? `<button class="link-btn" id="clDelete">${T("刪除山社")}</button>` : ""}<button class="link-btn" id="clLeave">${T("退出山社")}</button></div>`
      : `<button class="btn primary club-new" id="clJoin">${T("加入這個山社")}</button><div class="club-none">${T("加入後就能看到成員、本週排行和大家的行程。")}</div><div class="auth-msg" id="clMsg"></div>`}`;
    if (!c.is_member) {
      el.querySelector("#clJoin").addEventListener("click", async e => {
        e.currentTarget.disabled = true;
        const { data, error } = await rpc("join_club", { p_club: c.id });
        if (error || !data) { e.currentTarget.disabled = false; el.querySelector("#clMsg").textContent = error ? errText(error) : T("這個山社需要加入碼"); return; }
        say(T("加入山社了")); openById(c.id);
      });
      return;
    }
    el.querySelector("#clShare").addEventListener("click", () => ttShareText(T("一起加入「%s」山社！打開循徑拾光 → 社群 → 搜尋 → 山社，輸入加入碼：").replace("%s", c.name) + c.join_code, c.name));
    el.querySelectorAll(".club-tabs .pk-tab").forEach(b => b.addEventListener("click", () => {
      _view.tab = b.dataset.t; el.querySelectorAll(".club-tabs .pk-tab").forEach(x => x.classList.toggle("on", x === b)); loadTab();
    }));
    el.querySelector("#clLeave").addEventListener("click", async () => {
      const msg = owner ? T("你是社長。退出後社長會交給最早加入的成員；沒有其他成員的話山社會刪掉。") : T("確定退出這個山社？");
      if (!(await ttConfirm(msg, T("退出"), T("取消"), { danger: true }))) return;
      const { error } = await rpc("leave_club", { p_club: c.id });
      if (error) { say(errText(error)); return; }
      say(T("已退出山社")); showList();
    });
    const del = el.querySelector("#clDelete");
    if (del) del.addEventListener("click", async () => {
      if (!(await ttConfirm(T("刪除後成員和排行都會不見，不能復原。"), T("刪除"), T("取消"), { danger: true }))) return;
      const { data, error } = await rpc("delete_club", { p_club: c.id });
      if (error || !data) { say(error ? errText(error) : T("只有社長能刪除")); return; }
      say(T("山社已刪除")); showList();
    });
    loadTab();
  }
  let _tseq = 0;
  async function loadTab() {
    const my = ++_tseq, c = _view.c, box = body() && body().querySelector("#clTab"); if (!box) return;
    box.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const stale = () => my !== _tseq || _view.k !== "club" || !body() || !body().querySelector("#clTab");
    if (_view.tab === "board") {
      const { data, error } = await rpc("club_board", { p_club: c.id, p_days: 7 });
      if (stale()) return;
      if (error) { box.innerHTML = `<div class="social-empty">${esc(errText(error))}</div>`; return; }
      const rows = data || [], any = rows.some(r => +r.km > 0);
      box.innerHTML = `<div class="club-note">${T("最近 7 天，成員發到社群的行程加總")}</div>` + rows.map((r, i) => {
        const rank = +r.km > 0 ? i + 1 : null;
        return `<div class="club-rank${rank && rank <= 3 ? " top" + rank : ""}" data-uid="${esc(r.user_id)}"><span class="club-no">${rank || "–"}</span>${avatar(r)}<span class="club-rank-n">${esc(r.display_name || r.handle || T("山友"))}</span><span class="club-rank-v"><span class="club-rank-km"><b>${Math.round(+r.km * 10) / 10}</b> km</span><small>${T("%d 趟").replace("%d", r.hikes)}${r.ascent ? ` · ↑${Math.round(+r.ascent).toLocaleString()} m` : ""}</small></span></div>`;
      }).join("") + (any ? "" : `<div class="club-none">${T("這週還沒有人發行程。走完記得發到社群，就會算進來。")}</div>`);
      box.querySelectorAll(".club-rank").forEach(r => r.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openProfile(r.dataset.uid); }));
    } else if (_view.tab === "members") {
      const { data, error } = await rpc("club_roster", { p_club: c.id });
      if (stale()) return;
      if (error) { box.innerHTML = `<div class="social-empty">${esc(errText(error))}</div>`; return; }
      const me = await Supa.uid().catch(() => null), owner = c.my_role === "owner";
      if (stale()) return;
      box.innerHTML = (data || []).map(m => `<div class="club-mem" data-uid="${esc(m.user_id)}">${avatar(m)}<span class="club-rank-n">${esc(m.display_name || m.handle || T("山友"))}${m.role === "owner" ? ` <span class="club-owner">${ic("crown")}${T("社長")}</span>` : ""}</span>${owner && m.user_id !== me ? `<button class="link-btn club-kick" data-uid="${esc(m.user_id)}" data-n="${esc(m.display_name || m.handle || "")}">${T("移出")}</button>` : ""}</div>`).join("");
      box.querySelectorAll(".club-mem").forEach(r => r.addEventListener("click", e => { if (e.target.closest(".club-kick")) return; if (typeof Discover !== "undefined") Discover.openProfile(r.dataset.uid); }));
      box.querySelectorAll(".club-kick").forEach(b => b.addEventListener("click", async () => {
        if (!(await ttConfirm(T("把 %s 移出山社？").replace("%s", b.dataset.n), T("移出"), T("取消"), { danger: true }))) return;
        const { data: ok, error: e } = await rpc("kick_club_member", { p_club: c.id, p_user: b.dataset.uid });
        if (e || !ok) { say(e ? errText(e) : T("移出失敗")); return; }
        c.members = Math.max(1, c.members - 1); loadTab();
      }));
    } else {
      const { data, error } = await rpc("club_roster", { p_club: c.id });
      if (stale()) return;
      if (error) { box.innerHTML = `<div class="social-empty">${esc(errText(error))}</div>`; return; }
      const posts = await Posts.byAuthors((data || []).map(m => m.user_id), 30);
      if (stale()) return;
      if (!posts.length) { box.innerHTML = `<div class="club-none">${T("成員還沒發過貼文")}</div>`; return; }
      const liked = await Posts.likedSet(posts.map(p => p.id));
      if (stale()) return;
      box.innerHTML = `<div class="feed-list">${posts.map(p => Feed.card(p, liked.has(p.id))).join("")}</div>`;
      Feed.bindCards(box);
    }
  }

  // 社群「搜尋」頁最上面的入口
  function entryHtml() {
    return `<button class="club-entry" id="clubEntry"><span class="club-badge">${ic("users")}</span><span class="club-row-t"><b>${T("山社")}</b><small>${T("找同好，每週一起爬")}</small></span>${ic("chevron")}</button>`;
  }
  return { open, entryHtml, _errText: errText };
})();
if (typeof window !== "undefined") window.Clubs = Clubs;
