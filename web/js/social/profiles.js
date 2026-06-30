// 個人頁：Phase 1 先做「自己的」檢視與編輯（貼文牆於 Phase 2 接上）。
const Profiles = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  // 把本機寵物名字/等級/里程同步到雲端 profile，讓好友看得到進度
  async function syncMyStats(uid) {
    if (typeof petStats !== "function") return;
    const s = petStats(); const c = Supa.client(); if (!c) return;
    try { await c.from("profiles").update({ pet_name: s.name, pet_level: s.level, total_km: s.km }).eq("id", uid); } catch (e) { /* */ }
  }
  function petLine(ps) {
    if (!ps) return "";
    return `<div class="pf-pet">${ps.emoji} ${esc(ps.name)} <span class="lv-chip lvt-${Math.min(ps.level, 7)}">Lv.${ps.level}</span>　·　已走 ${ps.km} km</div>`;
  }

  function renderMe(render, prof) {
    const av = prof.avatar_url
      ? `<img class="pf-av" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    const ps = (typeof petStats === "function") ? petStats() : null;
    syncMyStats(prof.id);   // 順手同步到雲端
    if (prof.avatar_url) window.__meAvatar = prof.avatar_url;   // 地圖「我」標記＝社群頭像（換頭像後也同步）
    render(`
      <div class="pf">
        <div class="pf-top">${av}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}${(typeof Premium !== "undefined" && Premium.isOn()) ? '<span class="pro-tag pro-mine">PRO</span>' : ""}</div>
            <div class="pf-handle">@${esc(prof.handle)}</div></div>
        </div>
        ${petLine(ps)}
        <div class="pf-counts"><span id="pfPostCount"></span><span id="pfFollowCounts"></span></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        <div class="link-row pf-actions">
          <button class="link-btn" id="pfEdit">${ic("pencil")} 編輯</button>
          <button class="link-btn" id="pfSaved">${ic("bookmark")} 收藏</button>
          <button class="link-btn" id="pfEvents">${ic("calendar")} 揪團</button>
          <button class="link-btn" id="pfSettings">${ic("sliders")} 設定</button>
          <button class="link-btn" id="pfSignout">${ic("logout")} 登出</button>
        </div>
        <div id="pfPosts" class="feed-loading"><span class="spin"></span></div>
      </div>`);
    document.getElementById("pfSignout").addEventListener("click", async () => {
      if (!confirm("確定要登出嗎？")) return;
      const btn = document.getElementById("pfSignout");
      if (btn) { btn.disabled = true; btn.textContent = "登出中…"; }
      try { window.__meAvatar = null; if (typeof TeamLive !== "undefined") TeamLive.stop(); } catch (e) { }
      await Auth.signOut();
      if (typeof toast === "function") toast("已登出");
      SocialUI.route();   // 立即切回登入畫面，不必重開 App
    });
    document.getElementById("pfEdit").addEventListener("click", () => renderEdit(render, prof));
    document.getElementById("pfSaved").addEventListener("click", () => renderSaved(render, prof));
    document.getElementById("pfEvents").addEventListener("click", () => { if (typeof Events !== "undefined") Events.open(); });
    document.getElementById("pfSettings").addEventListener("click", () => renderSettings(render, prof));
    Posts.followCounts(prof.id).then(c => {
      const el = document.getElementById("pfFollowCounts"); if (!el) return;
      el.innerHTML = `<span class="cnt-link" data-mode="followers"><b>${c.followers}</b> 粉絲</span>　<span class="cnt-link" data-mode="following"><b>${c.following}</b> 追蹤中</span>`;
      el.querySelectorAll(".cnt-link").forEach(s => s.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openUserList(prof.id, s.dataset.mode); }));
    });
    Posts.userPosts(prof.id).then(async posts => {
      const pc = document.getElementById("pfPostCount"); if (pc) pc.innerHTML = `<b>${posts.length}</b> 篇　`;
      const box = document.getElementById("pfPosts"); if (!box) return;
      box.className = "feed-list";
      if (!posts.length) { box.className = "pf-posts-empty"; box.textContent = "尚未有貼文。完成一趟健行後，在總結頁按「分享到社群」。"; return; }
      const liked = await Posts.likedSet(posts.map(p => p.id));
      box.innerHTML = posts.map(p => Feed.card(p, liked.has(p.id))).join("");
      box.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => { if (typeof PostView !== "undefined") PostView.open(c.dataset.id); }));
    });
  }

  // 收藏的貼文
  async function renderSaved(render, prof) {
    render(`<div class="pf"><div class="pf-sub-head"><button class="link-btn" id="svBack">‹ 返回</button><b>${ic("bookmark")} 我的收藏</b></div><div id="svPosts" class="feed-loading"><span class="spin"></span></div></div>`);
    document.getElementById("svBack").addEventListener("click", () => renderMe(render, prof));
    const posts = await Posts.savedPosts();
    const box = document.getElementById("svPosts"); if (!box) return;
    if (!posts.length) { box.className = "social-empty"; box.innerHTML = `<span class="ee">🔖</span>還沒有收藏。在貼文右上角點書籤圖示即可收藏。`; return; }
    const liked = await Posts.likedSet(posts.map(p => p.id));
    box.className = "feed-list";
    box.innerHTML = posts.map(p => Feed.card(p, liked.has(p.id))).join("");
    box.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", e => {
      if (e.target.closest(".fc-author") || e.target.closest(".fc-traillink") || e.target.closest(".fc-like") || e.target.closest(".fc-vid")) return;
      if (typeof PostView !== "undefined") PostView.open(c.dataset.id);
    }));
  }

  // 隱私與設定：預設發文可見度 + 封鎖名單管理
  async function renderSettings(render, prof) {
    const defVis = localStorage.getItem("tt_default_vis") || "friends";
    render(`<div class="pf"><div class="pf-sub-head"><button class="link-btn" id="stBack">‹ 返回</button><b>${ic("sliders")} 隱私與設定</b></div>
      <div class="set-group"><div class="set-label">預設發文可見度</div>
        <label class="set-row"><span>只給好友</span><input type="radio" name="dvis" value="friends" ${defVis === "friends" ? "checked" : ""}></label>
        <label class="set-row"><span>公開</span><input type="radio" name="dvis" value="public" ${defVis === "public" ? "checked" : ""}></label>
      </div>
      <div class="set-group"><div class="set-label">封鎖名單</div><div id="stBlocks"><div class="feed-loading"><span class="spin"></span></div></div></div>
      </div>`);
    document.getElementById("stBack").addEventListener("click", () => renderMe(render, prof));
    document.querySelectorAll('input[name="dvis"]').forEach(r => r.addEventListener("change", () => {
      localStorage.setItem("tt_default_vis", r.value); if (typeof toast === "function") toast("已設定預設可見度");
    }));
    const bb = document.getElementById("stBlocks");
    const people = (typeof Safety !== "undefined") ? await Safety.blockedProfiles() : [];
    if (!bb) return;
    if (!people.length) { bb.innerHTML = `<div class="set-empty">沒有封鎖任何人。</div>`; return; }
    bb.innerHTML = people.map(p => `<div class="set-block-row" data-id="${p.id}">
      ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
      <div class="disc-id"><b>${esc(p.display_name || p.handle)}</b><span>@${esc(p.handle)}</span></div>
      <button class="btn ghost st-unblock" data-id="${p.id}">解除</button></div>`).join("");
    bb.querySelectorAll(".st-unblock").forEach(b => b.addEventListener("click", async () => {
      await Safety.unblock(b.dataset.id); if (typeof toast === "function") toast("已解除封鎖"); renderSettings(render, prof);
    }));
  }

  function renderEdit(render, prof) {
    let avatarFile = null;
    const avHtml = prof.avatar_url
      ? `<img class="pf-av" id="edAvImg" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph" id="edAvImg">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    render(`
      <div class="social-auth">
        <h3>編輯檔案</h3>
        <div class="pf-av-edit">${avHtml}
          <label class="comp-add">更換頭像<input type="file" id="edAvFile" accept="image/*" hidden></label></div>
        <label class="ob-l">帳號 handle（給朋友搜尋你）</label>
        <input id="edHandle" class="auth-input" value="${esc(prof.handle || "")}" autocapitalize="off" autocomplete="off">
        <div class="auth-msg" id="edHandleMsg"></div>
        <label class="ob-l">顯示名稱</label>
        <input id="edName" class="auth-input" value="${esc(prof.display_name || "")}">
        <label class="ob-l">簡介</label>
        <input id="edBio" class="auth-input" value="${esc(prof.bio || "")}">
        <button class="btn primary" id="edSave">儲存</button>
        <button class="btn ghost" id="edCancel">取消</button>
        <div class="auth-msg" id="edMsg"></div>
      </div>`);
    document.getElementById("edAvFile").addEventListener("change", e => {
      const f = e.target.files[0]; if (!f) return;
      avatarFile = f;
      const old = document.getElementById("edAvImg");
      const img = document.createElement("img"); img.className = "pf-av"; img.id = "edAvImg"; img.src = URL.createObjectURL(f);
      old.replaceWith(img);
    });
    // handle 即時可用性檢查（與目前相同則略過）
    const hEl = document.getElementById("edHandle"), hMsg = document.getElementById("edHandleMsg");
    let ht = null, hOk = true;
    hEl.addEventListener("input", () => {
      clearTimeout(ht); const v = Handle.validate(hEl.value);
      if (v.handle === prof.handle) { hMsg.textContent = ""; hMsg.className = "auth-msg"; hOk = true; return; }
      if (!v.ok) { hMsg.textContent = v.msg; hMsg.className = "auth-msg bad"; hOk = false; return; }
      hMsg.textContent = "檢查中…"; hMsg.className = "auth-msg"; hOk = false;
      ht = setTimeout(async () => {
        const taken = await Auth.handleTaken(v.handle);
        if (taken) { hMsg.textContent = "這個 handle 已被使用"; hMsg.className = "auth-msg bad"; hOk = false; }
        else { hMsg.textContent = "可以使用 ✓"; hMsg.className = "auth-msg ok"; hOk = true; }
      }, 350);
    });
    document.getElementById("edCancel").addEventListener("click", () => renderMe(render, prof));
    document.getElementById("edSave").addEventListener("click", async () => {
      const c = Supa.client(); const msg = document.getElementById("edMsg");
      const display_name = (document.getElementById("edName").value || "").trim();
      const bio = (document.getElementById("edBio").value || "").trim();
      if (bio.length > 300) { msg.textContent = "簡介請少於 300 字"; return; }
      const hv = Handle.validate(hEl.value);
      if (!hv.ok) { msg.textContent = "handle：" + hv.msg; return; }
      const handleChanged = hv.handle !== prof.handle;
      if (handleChanged && !hOk) { msg.textContent = "請確認 handle 可用"; return; }
      msg.textContent = "儲存中…";
      const patch = { display_name, bio };
      if (handleChanged) patch.handle = hv.handle;
      if (avatarFile) {
        try { patch.avatar_url = await Media.uploadAvatar(prof.id, avatarFile); }
        catch (e) { msg.textContent = "頭像上傳失敗：" + (e && e.message || e); return; }
      }
      const { error } = await c.from("profiles").update(patch).eq("id", prof.id);
      if (error) { msg.textContent = /duplicate|unique/i.test(error.message) ? "這個 handle 已被使用" : ("儲存失敗：" + error.message); return; }
      renderMe(render, Object.assign({}, prof, patch));
    });
  }

  return { renderMe, renderEdit, renderSaved, renderSettings, syncMyStats };
})();
