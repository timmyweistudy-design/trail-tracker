// 個人頁：Phase 1 先做「自己的」檢視與編輯（貼文牆於 Phase 2 接上）。
const Profiles = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  function renderMe(render, prof) {
    const av = prof.avatar_url
      ? `<img class="pf-av" src="${esc(prof.avatar_url)}" alt="">`
      : `<div class="pf-av pf-av-ph">${esc((prof.display_name || prof.handle || "?").slice(0, 1))}</div>`;
    render(`
      <div class="pf">
        <div class="pf-top">${av}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}</div>
            <div class="pf-handle">@${esc(prof.handle)}</div></div>
        </div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        <div class="pf-actions">
          <button class="btn ghost" id="pfEdit">編輯檔案</button>
          <button class="btn ghost" id="pfSignout">登出</button>
        </div>
        <div id="pfPosts" class="feed-loading"><span class="spin"></span></div>
      </div>`);
    document.getElementById("pfSignout").addEventListener("click", async () => { await Auth.signOut(); SocialUI.route(); });
    document.getElementById("pfEdit").addEventListener("click", () => renderEdit(render, prof));
    Posts.userPosts(prof.id).then(async posts => {
      const box = document.getElementById("pfPosts"); if (!box) return;
      box.className = "feed-list";
      if (!posts.length) { box.className = "pf-posts-empty"; box.textContent = "尚未有貼文。完成一趟健行後，在總結頁按「分享到社群」。"; return; }
      const liked = await Posts.likedSet(posts.map(p => p.id));
      box.innerHTML = posts.map(p => Feed.card(p, liked.has(p.id))).join("");
      box.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => { if (typeof PostView !== "undefined") PostView.open(c.dataset.id); }));
    });
  }

  function renderEdit(render, prof) {
    render(`
      <div class="social-auth">
        <h3>編輯檔案</h3>
        <label class="ob-l">顯示名稱</label>
        <input id="edName" class="auth-input" value="${esc(prof.display_name || "")}">
        <label class="ob-l">簡介</label>
        <input id="edBio" class="auth-input" value="${esc(prof.bio || "")}">
        <button class="btn primary" id="edSave">儲存</button>
        <button class="btn ghost" id="edCancel">取消</button>
        <div class="auth-msg" id="edMsg"></div>
      </div>`);
    document.getElementById("edCancel").addEventListener("click", () => renderMe(render, prof));
    document.getElementById("edSave").addEventListener("click", async () => {
      const c = Supa.client(); const msg = document.getElementById("edMsg");
      const display_name = (document.getElementById("edName").value || "").trim();
      const bio = (document.getElementById("edBio").value || "").trim();
      if (bio.length > 300) { msg.textContent = "簡介請少於 300 字"; return; }
      msg.textContent = "儲存中…";
      const { error } = await c.from("profiles").update({ display_name, bio }).eq("id", prof.id);
      if (error) { msg.textContent = "儲存失敗：" + error.message; return; }
      renderMe(render, Object.assign({}, prof, { display_name, bio }));
    });
  }

  return { renderMe, renderEdit };
})();
