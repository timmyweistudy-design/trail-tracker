// 小隊：建立/加入小隊、選定目前小隊、成員清單、開關「與小隊同行」（連動 TeamLive）。
const Team = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function genCode() { const ch = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let s = ""; for (let i = 0; i < 6; i++) s += ch[Math.floor(Math.random() * ch.length)]; return s; }
  function activeId() { return localStorage.getItem("tt_team") || null; }
  function activeName() { return localStorage.getItem("tt_team_name") || ""; }
  function setActive(id, name) {
    if (id) { localStorage.setItem("tt_team", id); if (name) localStorage.setItem("tt_team_name", name); }
    else { localStorage.removeItem("tt_team"); localStorage.removeItem("tt_team_name"); }
  }

  async function create(name) {
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const code = genCode();
    const { data, error } = await c.rpc("create_team", { p_name: name, p_code: code });
    if (error) return { error: error.message };
    return { id: data, code, name };
  }
  async function joinByCode(code) {
    const c = Supa.client(); const { data, error } = await c.rpc("join_team_by_code", { p_code: code });
    if (error) return { error: error.message };
    if (!data) return { error: "找不到這個小隊代碼" };
    return { id: data };
  }
  async function myTeams() {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return [];
    const { data } = await c.from("team_members").select("team:teams(id,name,join_code,owner)").eq("user_id", u.user.id);
    return (data || []).map(r => r.team).filter(Boolean);
  }
  async function members(teamId) {
    const c = Supa.client();
    const { data } = await c.from("team_members").select("user_id, user:profiles!tm_user_profile_fk(handle,display_name,avatar_url)").eq("team_id", teamId);
    return data || [];
  }
  async function leave(teamId) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    await c.from("team_members").delete().eq("team_id", teamId).eq("user_id", u.user.id);
    if (activeId() === teamId) setActive(null);
  }

  async function openSheet() {
    if (typeof Supa === "undefined" || !Supa.ready()) { alert("社群尚未啟用"); return; }
    const sess = await Auth.session(); if (!sess) { alert("請先到「社群」分頁登入"); return; }
    const prof = await Auth.myProfile(); if (!prof) { alert("請先到「社群」分頁完成註冊"); return; }
    const myName = prof.display_name || prof.handle || "我";
    const wrap = document.createElement("div"); wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="tmX">✕</button><b>小隊</b><span></span></div>
      <div class="pv-body" id="tmBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#tmX").addEventListener("click", () => wrap.remove());
    renderSheet(wrap, myName);
  }

  async function renderSheet(wrap, myName) {
    const body = wrap.querySelector("#tmBody"); if (!body) return;
    body.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const teams = await myTeams();
    const aId = activeId();
    let html = "";
    if (teams.length) {
      html += `<div class="ob-l">我的小隊</div>`;
      for (const t of teams) {
        const on = t.id === aId;
        html += `<div class="team-row ${on ? "on" : ""}">
          <div><b>${esc(t.name)}</b><div class="team-code">加入碼 ${esc(t.join_code)}</div></div>
          <button class="btn ${on ? "primary" : "ghost"} team-pick" data-id="${esc(t.id)}" data-name="${esc(t.name)}">${on ? "目前" : "設為目前"}</button>
        </div>`;
      }
    } else {
      html += `<div class="social-empty">還沒有小隊。建立一個，把加入碼給隊友。</div>`;
    }
    if (aId) {
      const liveOn = (typeof TeamLive !== "undefined" && TeamLive.isOn());
      html += `<label class="sim-toggle team-live"><input type="checkbox" id="tmLive" ${liveOn ? "checked" : ""}> 👥 與小隊同行（記錄地圖上看到彼此定位）</label>
        <div id="tmMembers"></div>
        <button class="btn ghost" id="tmLeave" style="margin-top:8px">退出目前小隊</button>`;
    }
    html += `<hr class="tm-hr">
      <div class="ob-l">建立小隊</div>
      <div class="tm-create"><input id="tmName" class="auth-input" placeholder="小隊名稱"><button class="btn primary" id="tmCreate">建立</button></div>
      <div class="ob-l">用加入碼加入</div>
      <div class="tm-create"><input id="tmCode" class="auth-input" placeholder="6 碼" autocapitalize="characters"><button class="btn ghost" id="tmJoin">加入</button></div>
      <div class="auth-msg" id="tmMsg"></div>`;
    body.innerHTML = html;

    body.querySelectorAll(".team-pick").forEach(b => b.addEventListener("click", () => { setActive(b.dataset.id, b.dataset.name); renderSheet(wrap, myName); }));
    const leaveBtn = body.querySelector("#tmLeave");
    if (leaveBtn) leaveBtn.addEventListener("click", async () => { if (!confirm("退出目前小隊？")) return; if (typeof TeamLive !== "undefined") TeamLive.stop(); await leave(aId); renderSheet(wrap, myName); });

    const live = body.querySelector("#tmLive");
    if (live) {
      members(aId).then(ms => {
        const el = body.querySelector("#tmMembers"); if (!el) return;
        el.innerHTML = `<div class="team-members">${ms.map(m => { const u = m.user || {}; return `<span class="team-chip">${u.avatar_url ? `<img src="${esc(u.avatar_url)}">` : `<i>${esc((u.display_name || u.handle || "?").slice(0, 1))}</i>`}${esc(u.display_name || u.handle || "隊友")}</span>`; }).join("")}</div>`;
      });
      live.addEventListener("change", e => {
        if (typeof TeamLive === "undefined") return;
        if (e.target.checked) {
          const m = (typeof recMap !== "undefined") ? recMap : null;
          if (!m) { if (typeof toast === "function") toast("請先到記錄頁開啟地圖"); e.target.checked = false; return; }
          TeamLive.start(aId, m, myName);
          if (typeof toast === "function") toast("已開啟小隊同行，回記錄頁地圖看隊友");
        } else TeamLive.stop();
      });
    }

    body.querySelector("#tmCreate").addEventListener("click", async () => {
      const name = (body.querySelector("#tmName").value || "").trim(); const msg = body.querySelector("#tmMsg");
      if (name.length < 1) { msg.textContent = "請輸入小隊名稱"; return; }
      msg.textContent = "建立中…";
      const r = await create(name);
      if (r.error) { msg.textContent = "建立失敗：" + r.error; return; }
      setActive(r.id, name); renderSheet(wrap, myName);
      if (typeof toast === "function") toast("小隊已建立，加入碼 " + r.code);
    });
    body.querySelector("#tmJoin").addEventListener("click", async () => {
      const code = (body.querySelector("#tmCode").value || "").trim(); const msg = body.querySelector("#tmMsg");
      if (code.length < 4) { msg.textContent = "請輸入加入碼"; return; }
      msg.textContent = "加入中…";
      const r = await joinByCode(code);
      if (r.error) { msg.textContent = r.error; return; }
      setActive(r.id); renderSheet(wrap, myName);
      if (typeof toast === "function") toast("已加入小隊");
    });
  }

  return { openSheet, activeId, activeName, setActive };
})();
