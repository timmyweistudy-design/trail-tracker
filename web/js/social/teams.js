// 小隊：建立/加入小隊、選定目前小隊、成員清單、開關「與小隊同行」（連動 TeamLive）。
const Team = (() => {
  const ttT = s => (typeof window.ttT === "function" ? window.ttT(s) : s);
  const esc = s => Supa.esc(s);
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
    if (!data) return { error: ttT("找不到這個加入碼，再確認一下") };
    return { id: data };
  }
  async function myTeams() {
    const c = Supa.client(); const { data: u } = await Supa.meUser(); if (!u || !u.user) return [];
    const { data } = await c.from("team_members").select("team:teams(id,name,join_code,owner)").eq("user_id", u.user.id);
    return (data || []).map(r => r.team).filter(Boolean);
  }
  async function members(teamId) {
    const c = Supa.client();
    const { data } = await c.from("team_members").select("user_id, user:profiles!tm_user_profile_fk(handle,display_name,avatar_url)").eq("team_id", teamId);
    return data || [];
  }
  async function leave(teamId) {
    const c = Supa.client(); const { data: u } = await Supa.meUser();
    await c.from("team_members").delete().eq("team_id", teamId).eq("user_id", u.user.id);
    if (activeId() === teamId) setActive(null);
  }

  async function openSheet() {
    if (typeof ttBusy === "function" && ttBusy("teamsheet")) return;   // 防連點（登入/建檔查詢的空窗）
    if (typeof Supa === "undefined" || !Supa.ready()) { toast(ttT("社群尚未啟用")); return; }
    const sess = await Auth.session(); if (!sess) { toast(ttT("先到「社群」分頁登入")); return; }
    const prof = await Auth.myProfile(); if (!prof) { toast(ttT("先到「社群」分頁建好帳號")); return; }
    const info = { name: prof.display_name || prof.handle || "我", avatar: prof.avatar_url || null, pet: (typeof petStats === "function" ? petStats().emoji : null) };
    if (document.querySelector('[data-ov="team"]')) return;   // 防連點疊層
    const wrap = document.createElement("div"); wrap.className = "pv-mask"; wrap.dataset.ov = "team";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="tmX">${ic("x")}</button><b>${ttT("小隊")}</b><span></span></div>
      <div class="pv-body" id="tmBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#tmX").addEventListener("click", () => wrap.remove());
    renderSheet(wrap, info);
  }

  // 互相追蹤的好友
  async function friends() { return (await Supa.mutualFriends()) || []; }
  async function invite(teamId, userId) {
    const c = Supa.client(); const { data, error } = await c.rpc("invite_to_team", { p_team: teamId, p_user: userId });
    return { ok: !error && data, error: error && error.message };
  }

  // 與小隊同行「預設開啟」：進記錄頁時，有目前小隊＋已登入就自動連上（使用者手動關過則不自動開）
  async function autoLive(map) {
    try {
      if (typeof TeamLive === "undefined" || TeamLive.isOn()) return;
      if (localStorage.getItem("tt_team_live") === "0") return;   // 使用者手動關閉過
      const aId = activeId(); if (!aId || !map) return;
      if (typeof Supa === "undefined" || !Supa.ready()) return;
      const sess = await Auth.session().catch(() => null); if (!sess) return;
      const prof = await Auth.myProfile().catch(() => null); if (!prof) return;
      const info = { name: prof.display_name || prof.handle || "我", avatar: prof.avatar_url || null, pet: (typeof petStats === "function" ? petStats().emoji : null) };
      const teams = await myTeams();
      let t = teams.find(x => x.id === aId);
      if (!t) {
        // 隊長不在 team_members / RLS 讀不到時，直接查 teams 表，避免隊長 autoLive 提早 return
        // →連不上自己的小隊（症狀：隊長看不到隊員、隊員只看到隊長的離線名字）
        const c = Supa.client();
        const { data: row } = await c.from("teams").select("id,name,owner").eq("id", aId).maybeSingle();
        if (!row) return;   // 真的查不到（已被刪）→ 不連
        t = row;
      }
      await TeamLive.start(aId, map, info, { leader: t.owner || null });
      if (typeof toast === "function") toast(`${ttT("小隊同行已連上")}：${t.name}`);
    } catch (e) { /* 自動開啟失敗不影響記錄 */ }
  }

  async function renderSheet(wrap, info) {
    const myName = info.name, myId = await Supa.uid();
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
          <div class="team-row-info"><b>${esc(t.name)}</b><div class="team-code">${ttT("加入碼")} <span class="tc-v">${esc(t.join_code)}</span><button class="tc-copy" data-code="${esc(t.join_code)}" data-name="${esc(t.name)}" aria-label="${ttT("分享加入碼")}">${ic("share")}</button></div></div>
          ${on ? `<span class="team-now">目前</span>` : `<button class="btn ghost team-pick" data-id="${esc(t.id)}" data-name="${esc(t.name)}">設為目前</button>`}
        </div>`;
      }
    } else {
      html += `<div class="social-empty">還沒有小隊。建立一個，把加入碼給隊友。</div>`;
    }
    const activeTeam = teams.find(t => t.id === aId) || null;
    if (aId) {
      const liveOn = (typeof TeamLive !== "undefined" && TeamLive.isOn());
      html += `<label class="sim-toggle team-live"><input type="checkbox" id="tmLive" ${liveOn ? "checked" : ""}> ${ic("users")} 與小隊同行（記錄地圖上看到彼此定位）</label>
        <div class="team-rule">${ic("crown")}<span>${ttT("隊長按「開始」，全隊一起記錄；隊員先在記錄頁按「準備」。隊長沒訊號時，隊員也能自己按「結束」。")}</span></div>
        <div id="tmMembers"></div>
        <div class="ob-l">${ttT("邀請好友")}</div><div id="tmInvite"><div class="feed-loading"><span class="spin"></span></div></div>
        <div class="tm-danger">${activeTeam && activeTeam.owner === myId ? `<button class="link-btn" id="tmDissolve">${ttT("解散小隊")}</button>` : ""}<button class="link-btn" id="tmLeave">${ttT("退出這個小隊")}</button></div>`;
    }
    html += `<hr class="tm-hr">
      <div class="ob-l">${ttT("建立小隊")}</div>
      <div class="tm-create"><input id="tmName" class="auth-input" placeholder="${ttT("小隊名稱")}" maxlength="30"><button class="btn primary" id="tmCreate">${ttT("建立")}</button></div>
      <div class="ob-l">${ttT("用加入碼加入")}</div>
      <div class="tm-create"><input id="tmCode" class="auth-input" placeholder="${ttT("6 碼")}" autocapitalize="characters" maxlength="8" autocomplete="off"><button class="btn ghost" id="tmJoin">${ttT("加入")}</button></div>
      <div class="auth-msg" id="tmMsg"></div>`;
    body.innerHTML = html;

    // 首次開啟小隊浮層 → 情境導覽（導覽字串集中在 app.js，避免這裡新增多語字典）
    if (typeof window.ttCoachTeam === "function") setTimeout(() => window.ttCoachTeam(!!aId), 350);

    body.querySelectorAll(".team-pick").forEach(b => b.addEventListener("click", () => { setActive(b.dataset.id, b.dataset.name); renderSheet(wrap, info); }));
    const leaveBtn = body.querySelector("#tmLeave");
    if (leaveBtn) leaveBtn.addEventListener("click", async () => { if (!(await ttConfirm(ttT("退出這個小隊？"), ttT("退出"), ttT("取消")))) return; if (typeof TeamLive !== "undefined") TeamLive.stop(); await leave(aId); renderSheet(wrap, info); });
    // 加入碼：一鍵分享／複製（以前只能用看的自己抄）
    body.querySelectorAll(".tc-copy").forEach(b => b.addEventListener("click", async () => {
      const text = `${ttT("來加入我的小隊")}「${b.dataset.name}」，${ttT("加入碼")}：${b.dataset.code}`;
      try { if (navigator.share) { await navigator.share({ text }); return; } } catch (e) { return; }
      if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.code).then(() => toast(ttT("加入碼複製好了")));
    }));
    // 解散小隊（隊長）
    const dis = body.querySelector("#tmDissolve");
    if (dis) dis.addEventListener("click", async () => {
      if (!(await ttConfirm(ttT("解散這個小隊？所有人都會被移出，沒辦法復原。"), ttT("解散"), ttT("取消")))) return;
      const { error } = await Supa.client().from("teams").delete().eq("id", aId);
      if (error) { toast(ttT(Supa.errText(error.message))); return; }
      if (typeof TeamLive !== "undefined") TeamLive.stop();
      setActive(null); toast(ttT("小隊解散了")); renderSheet(wrap, info);
    });

    const live = body.querySelector("#tmLive");
    if (live) {
      members(aId).then(ms => {
        const el = body.querySelector("#tmMembers"); if (!el) return;
        const ownerId = activeTeam ? activeTeam.owner : null;
        // 隊長排在最前面並掛皇冠，讓「加入別人小隊」的人也一眼看到誰是隊長（修：設為目前的小隊看不到隊長）
        const sorted = ms.slice().sort((a, b) => (b.user_id === ownerId) - (a.user_id === ownerId));
        const iAmLead = ownerId && ownerId === myId;
        el.innerHTML = `<div class="team-members">${sorted.map(m => { const u = m.user || {}; const isLead = m.user_id === ownerId; const nm = u.display_name || u.handle || ttT("隊友");
          const mgr = iAmLead && !isLead ? `<button class="tm-mgr" data-uid="${esc(m.user_id)}" data-name="${esc(nm)}" aria-label="${ttT("管理")}">${ic("more")}</button>` : "";
          return `<span class="team-chip${isLead ? " leader" : ""}">${isLead ? `${ic("crown")} ` : ""}${u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="">` : `<i>${esc(nm.slice(0, 1))}</i>`}${esc(nm)}${mgr}</span>`; }).join("")}</div>`;
        // 隊長管理成員：移出小隊、把隊長交給他（需資料庫 phase29；沒跑會講清楚）
        el.querySelectorAll(".tm-mgr").forEach(b => b.addEventListener("click", async () => {
          const act = await ttChoice(esc(b.dataset.name), [
            { label: ttT("把隊長交給他"), value: "lead", cls: "ghost" },
            { label: ttT("移出小隊"), value: "kick", cls: "ghost danger" },
            { label: ttT("取消"), value: null, cls: "primary" }]);
          const c = Supa.client();
          if (act === "kick") {
            if (!(await ttConfirm(`${b.dataset.name}：${ttT("移出小隊？")}`, ttT("移出"), ttT("取消")))) return;
            const { error, count } = await c.from("team_members").delete({ count: "exact" }).eq("team_id", aId).eq("user_id", b.dataset.uid);
            if (error || count === 0) { toast(ttT("資料庫還沒開放隊長移人（要先跑 phase29）")); return; }
            toast(ttT("移出了")); renderSheet(wrap, info);
          } else if (act === "lead") {
            if (!(await ttConfirm(`${ttT("把隊長交給")} ${b.dataset.name}？${ttT("之後由他按開始和結束。")}`, ttT("交給他"), ttT("取消")))) return;
            const { data, error } = await c.rpc("transfer_team", { p_team: aId, p_user: b.dataset.uid });
            if (error || !data) { toast(ttT("資料庫還沒開放交接隊長（要先跑 phase29）")); return; }
            if (typeof TeamLive !== "undefined" && TeamLive.isOn()) { TeamLive.stop(); }
            toast(ttT("隊長交出去了")); renderSheet(wrap, info);
          }
        }));
      });
      // 邀請好友（互相追蹤、且尚未在隊上的）
      (async () => {
        const [fr, ms] = await Promise.all([friends(), members(aId)]);
        const inTeam = new Set(ms.map(m => m.user_id));
        const box = body.querySelector("#tmInvite"); if (!box) return;
        const list = fr.filter(f => !inTeam.has(f.id));
        if (!list.length) { box.innerHTML = `<div class="social-empty" style="padding:10px">${ttT("沒有可以邀請的好友（要互相追蹤才算）")}</div>`; return; }
        box.innerHTML = list.map(f => `<div class="disc-row"><div class="disc-id"><b>${esc(f.display_name || f.handle)}</b><span>@${esc(f.handle)}</span></div><button class="btn ghost team-invite" data-id="${esc(f.id)}" data-name="${esc(f.display_name || f.handle)}">邀請</button></div>`).join("");
        box.querySelectorAll(".team-invite").forEach(b => b.addEventListener("click", async () => {
          b.disabled = true; b.textContent = ttT("邀請中…");
          const r = await invite(aId, b.dataset.id);
          if (r.ok) { b.textContent = ttT("已邀請"); if (typeof toast === "function") toast(`${ttT("邀請了")} ${b.dataset.name}`); }
          else { b.disabled = false; b.textContent = ttT("邀請"); if (typeof toast === "function") toast(ttT(Supa.errText(r.error))); }
        }));
      })();
      live.addEventListener("change", e => {
        if (typeof TeamLive === "undefined") return;
        if (e.target.checked) {
          localStorage.setItem("tt_team_live", "1");   // 之後進記錄頁自動開啟
          const m = (typeof recMap !== "undefined") ? recMap : null;
          if (!m) { if (typeof toast === "function") toast(ttT("先到記錄頁打開地圖")); e.target.checked = false; return; }
          TeamLive.start(aId, m, info, { leader: activeTeam ? activeTeam.owner : null });
          if (typeof toast === "function") toast(ttT("小隊同行開了，回記錄頁按「準備」等隊長開始"));
        } else { localStorage.setItem("tt_team_live", "0"); TeamLive.stop(); if (window.syncTeamRecBtns) window.syncTeamRecBtns(); }
      });
    }

    body.querySelector("#tmCreate").addEventListener("click", async () => {
      const name = (body.querySelector("#tmName").value || "").trim(); const msg = body.querySelector("#tmMsg");
      if (name.length < 1) { msg.textContent = ttT("取個小隊名稱"); return; }
      msg.textContent = ttT("建立中…");
      const r = await create(name);
      if (r.error) { msg.textContent = ttT(Supa.errText(r.error)); return; }
      setActive(r.id, name); renderSheet(wrap, info);
      if (typeof toast === "function") toast(`${ttT("小隊建好了，加入碼")} ${r.code}`);
    });
    body.querySelector("#tmJoin").addEventListener("click", async () => {
      const code = (body.querySelector("#tmCode").value || "").replace(/\s/g, "").toUpperCase(); const msg = body.querySelector("#tmMsg");
      if (code.length < 4) { msg.textContent = ttT("輸入 6 碼的加入碼"); return; }
      msg.textContent = ttT("加入中…");
      const r = await joinByCode(code);
      if (r.error) { msg.textContent = r.error; return; }
      setActive(r.id); renderSheet(wrap, info);
      if (typeof toast === "function") toast(ttT("加入小隊了"));
    });
  }

  return { openSheet, activeId, activeName, setActive, autoLive };
})();
