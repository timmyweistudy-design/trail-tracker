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
    const pa = (typeof Premium !== "undefined" && Premium.isOn()) ? " pro-av" : "";
    const av = prof.avatar_url
      ? `<img class="pf-av${pa}" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph${pa}">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    const ps = (typeof petStats === "function") ? petStats() : null;
    syncMyStats(prof.id);   // 順手同步到雲端
    if (prof.avatar_url) window.__meAvatar = prof.avatar_url;   // 地圖「我」標記＝社群頭像（換頭像後也同步）
    render(`
      <div class="pf${prof.cover_url ? " has-cover" : ""}">
        ${prof.cover_url ? `<div class="pf-cover" style="background-image:url('${esc(prof.cover_url)}')"></div>` : ""}
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
          <button class="link-btn" id="pfInvite">${ic("share")} 邀請好友</button>
          <button class="link-btn" id="pfSettings">${ic("sliders")} 設定</button>
          <button class="link-btn" id="pfSignout">${ic("logout")} 登出</button>
        </div>
        <div id="pfPosts" class="feed-loading"><span class="spin"></span></div>
      </div>`);
    document.getElementById("pfSignout").addEventListener("click", async () => {
      if (!(await ttConfirm("確定要登出嗎？"))) return;
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
    // 邀請好友：分享 App 連結＋自己的帳號，帶動安裝與追蹤（免後端）
    document.getElementById("pfInvite").addEventListener("click", async () => {
      const link = location.origin + location.pathname;
      let text = ttT("一起來用「循徑拾光」記錄爬山、養山林夥伴吧！");
      if (prof.handle) text += "\n" + ttT("在 App 加我：") + "@" + prof.handle;
      try {
        if (navigator.share) await navigator.share({ title: "循徑拾光", text, url: link });
        else if (navigator.clipboard) { await navigator.clipboard.writeText(text + "\n" + link); if (typeof toast === "function") toast(ttT("已複製邀請")); }
        else window.open(link, "_blank");
      } catch (e) { /* 使用者取消分享不算錯 */ }
    });
    document.getElementById("pfSettings").addEventListener("click", () => renderSettings(render, prof));
    Posts.followCounts(prof.id).then(c => {
      const el = document.getElementById("pfFollowCounts"); if (!el) return;
      el.innerHTML = `<span class="cnt-link" data-mode="followers"><b>${c.followers}</b> 粉絲</span>　<span class="cnt-link" data-mode="following"><b>${c.following}</b> 追蹤中</span>`;
      el.querySelectorAll(".cnt-link").forEach(s => s.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openUserList(prof.id, s.dataset.mode); }));
    });
    Posts.userPosts(prof.id).then(async posts => {
      // 舊貼文的星星回填本機步道評分（只補「本機未評分」的，不覆蓋較新的本機評分；自由路線不算）
      try {
        if (typeof Store !== "undefined") for (const p of posts) {
          if (p.trail_id && p.rating > 0 && !(Store.trailLog(String(p.trail_id)).rating > 0)) {
            Store.setTrailLog(String(p.trail_id), { rating: p.rating });
          }
        }
      } catch (e) { /* */ }
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

  // 刪除帳號（App Store 5.1.1(v) 要求）：兩段確認 → 呼叫 delete-account Edge Function（連 storage＋auth＋DB cascade 全清）→ 登出重載
  async function deleteAccount(render, prof) {
    if (!(await ttConfirm("確定要刪除帳號嗎？你的個人檔案、貼文、留言、追蹤、小隊與雲端備份都會永久刪除，無法復原。", "繼續刪除", "取消"))) return;
    if (!(await ttConfirm("最後確認：帳號與所有資料將永久刪除，真的要刪除嗎？", "永久刪除", "取消"))) return;
    const del = document.getElementById("stDelete");
    if (del) { del.disabled = true; del.textContent = ttT("刪除中…"); }
    try {
      const c = Supa.client();
      const { data, error } = await c.functions.invoke("delete-account");
      if (error || (data && data.error)) {
        if (del) { del.disabled = false; del.textContent = ttT("刪除帳號"); }
        if (typeof toast === "function") toast("刪除失敗，請稍後再試或聯絡我們");
        return;
      }
      try { ["tt_records", "tt_profile", "tt_favs", "tt_log", "tt_life", "tt_data_uid", "tt_last_sync", "tt_backup_pending"].forEach(k => localStorage.removeItem(k)); } catch (e) { /* */ }
      try { await Auth.signOut(); } catch (e) { /* */ }
      if (typeof toast === "function") toast("帳號已刪除");
      setTimeout(() => location.reload(), 900);
    } catch (e) {
      if (del) { del.disabled = false; del.textContent = ttT("刪除帳號"); }
      if (typeof toast === "function") toast("刪除失敗，請稍後再試或聯絡我們");
    }
  }
  // 隱私與設定：預設發文可見度 + 封鎖名單管理
  async function renderSettings(render, prof) {
    const defVis = localStorage.getItem("tt_default_vis") || "friends";
    const approval = prof.follow_approval !== false;   // 預設開啟：別人追蹤需我同意
    render(`<div class="pf"><div class="pf-sub-head"><button class="link-btn" id="stBack">‹ 返回</button><b>${ic("sliders")} 隱私與設定</b></div>
      <div class="set-group"><div class="set-label">追蹤請求</div>
        <label class="set-row"><span>別人追蹤我需要我同意（關閉＝任何人可直接追蹤）</span><input type="checkbox" id="stApprove" ${approval ? "checked" : ""}></label>
      </div>
      <div class="set-group"><div class="set-label">預設發文可見度</div>
        <label class="set-row"><span>只給好友</span><input type="radio" name="dvis" value="friends" ${defVis === "friends" ? "checked" : ""}></label>
        <label class="set-row"><span>公開</span><input type="radio" name="dvis" value="public" ${defVis === "public" ? "checked" : ""}></label>
      </div>
      <div class="set-group"><div class="set-label">封鎖名單</div><div id="stBlocks"><div class="feed-loading"><span class="spin"></span></div></div></div>
      <div class="set-group"><div class="set-label">我的檢舉</div><div id="stReports"><div class="feed-loading"><span class="spin"></span></div></div></div>
      <div class="set-group"><div class="set-label">危險區域</div>
        <button class="btn ghost st-danger" id="stDelete">刪除帳號</button>
        <div class="set-empty">永久刪除你的帳號與所有資料（貼文、追蹤、小隊、雲端備份），無法復原。</div>
      </div>
      </div>`);
    const del = document.getElementById("stDelete");
    if (del) del.addEventListener("click", () => deleteAccount(render, prof));
    document.getElementById("stBack").addEventListener("click", () => renderMe(render, prof));
    const ap = document.getElementById("stApprove");
    if (ap) ap.addEventListener("change", async () => {
      const c = Supa.client();
      const { error } = await c.from("profiles").update({ follow_approval: ap.checked }).eq("id", prof.id);
      if (error) { ap.checked = !ap.checked; if (typeof toast === "function") toast("儲存失敗，請先更新資料庫（phase18）"); return; }
      prof.follow_approval = ap.checked;
      if (typeof toast === "function") toast(ap.checked ? "已開啟：追蹤需你同意" : "已關閉：任何人可直接追蹤你");
    });
    document.querySelectorAll('input[name="dvis"]').forEach(r => r.addEventListener("change", () => {
      localStorage.setItem("tt_default_vis", r.value); if (typeof toast === "function") toast("已設定預設可見度");
    }));
    const bb = document.getElementById("stBlocks");
    const people = (typeof Safety !== "undefined") ? await Safety.blockedProfiles() : [];
    if (bb) {
      if (!people.length) bb.innerHTML = `<div class="set-empty">沒有封鎖任何人。</div>`;
      else {
        bb.innerHTML = people.map(p => `<div class="set-block-row" data-id="${p.id}">
          ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
          <div class="disc-id"><b>${esc(p.display_name || p.handle)}</b><span>@${esc(p.handle)}</span></div>
          <button class="btn ghost st-unblock" data-id="${p.id}">解除</button></div>`).join("");
        bb.querySelectorAll(".st-unblock").forEach(b => b.addEventListener("click", async () => {
          await Safety.unblock(b.dataset.id); if (typeof toast === "function") toast("已解除封鎖"); renderSettings(render, prof);
        }));
      }
    }
    renderMyReports(render, prof);
  }

  // 我送出的檢舉：可以看、可以撤回（誤按不用認了）
  async function renderMyReports(render, prof) {
    const rb = document.getElementById("stReports");
    if (!rb || typeof Safety === "undefined" || !Safety.myReports) return;
    const rows = await Safety.myReports();
    if (!rows.length) { rb.innerHTML = `<div class="set-empty">沒有檢舉任何內容。</div>`; return; }
    rb.innerHTML = rows.map(r => {
      // 貼文可能已被刪除（post_id 會被設成 null 或查不到內容）→ 據實說明，不要顯示空白
      const what = r.post_id
        ? (r.postText == null ? "（貼文已刪除）" : `「${esc(String(r.postText).slice(0, 40))}${String(r.postText).length > 40 ? "…" : ""}」`)
        : (r.userName ? `@${esc(r.userName)}` : "（對象已不存在）");
      const when = new Date(r.created_at).toLocaleDateString(typeof ttLocale === "function" ? ttLocale() : "zh-TW");
      return `<div class="set-block-row rp-row" data-id="${r.id}">
        <div class="rp-what"><b>${what}</b><span>${esc(r.reason || "")} · ${when}</span></div>
        <button class="btn ghost rp-undo" data-id="${r.id}" data-post="${esc(r.post_id || "")}">撤回</button></div>`;
    }).join("");
    rb.querySelectorAll(".rp-undo").forEach(b => b.addEventListener("click", async () => {
      b.disabled = true;
      const ok = await Safety.unreport(b.dataset.id, b.dataset.post || null);
      if (typeof toast === "function") toast(ok ? (b.dataset.post ? "已撤回檢舉，貼文回到動態牆" : "已撤回檢舉") : "撤回失敗，請先更新資料庫（phase23）");
      if (ok) renderMyReports(render, prof); else b.disabled = false;
    }));
  }

  function renderEdit(render, prof) {
    let avatarFile = null, coverFile = null;
    const avHtml = prof.avatar_url
      ? `<img class="pf-av" id="edAvImg" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph" id="edAvImg">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    render(`
      <div class="social-auth">
        <h3>編輯檔案</h3>
        <div class="pf-av-edit">${avHtml}
          <label class="comp-add">更換頭像<input type="file" id="edAvFile" accept="image/*" hidden></label></div>
        <label class="ob-l">封面照</label>
        <div class="ed-cover" id="edCoverImg" style="${prof.cover_url ? `background-image:url('${esc(prof.cover_url)}')` : ""}"></div>
        <label class="comp-add">更換封面<input type="file" id="edCoverFile" accept="image/*" hidden></label>
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
    const setAvatar = f => {
      if (!f) return;
      avatarFile = f;
      const old = document.getElementById("edAvImg");
      const img = document.createElement("img"); img.className = "pf-av"; img.id = "edAvImg"; img.src = URL.createObjectURL(f);
      old.replaceWith(img);
    };
    const setCover = f => {
      if (!f) return;
      coverFile = f; document.getElementById("edCoverImg").style.backgroundImage = `url('${URL.createObjectURL(f)}')`;
    };
    document.getElementById("edAvFile").addEventListener("change", e => setAvatar(e.target.files[0]));
    document.getElementById("edCoverFile").addEventListener("change", e => setCover(e.target.files[0]));
    // 原生 App：頭像／封面改走 Capacitor 相機（WKWebView 的 file input 拍照會黑畫面）；網頁維持 file input。
    if (typeof NativeCam !== "undefined" && NativeCam.isNative()) {
      const tx = typeof I18n !== "undefined" ? I18n.tx : null;
      const bind = (inputId, set) => {
        const lab = document.getElementById(inputId).closest(".comp-add");
        if (lab) lab.addEventListener("click", async ev => { ev.preventDefault(); set(await NativeCam.pickImage(tx)); });
      };
      bind("edAvFile", setAvatar);
      bind("edCoverFile", setCover);
    }
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
      if (coverFile) {
        try { patch.cover_url = await Media.uploadCover(prof.id, coverFile); }
        catch (e) { msg.textContent = "封面上傳失敗：" + (e && e.message || e); return; }
      }
      const { error } = await c.from("profiles").update(patch).eq("id", prof.id);
      if (error) { msg.textContent = /duplicate|unique/i.test(error.message) ? "這個 handle 已被使用" : ("儲存失敗：" + error.message); return; }
      renderMe(render, Object.assign({}, prof, patch));
    });
  }

  return { renderMe, renderEdit, renderSaved, renderSettings, syncMyStats };
})();
