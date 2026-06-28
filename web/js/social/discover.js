// 搜尋使用者（handle/名字）、追蹤/取消、檢視他人個人頁（含其貼文）。
const Discover = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  function render(renderInto) {
    renderInto(`<div class="disc">
      <input id="discQ" class="auth-input" placeholder="搜尋 handle 或名字" autocapitalize="off">
      <div id="discResults"></div></div>`);
    const q = document.getElementById("discQ"); let t = null;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => search(q.value.trim()), 300); });
  }

  async function search(term) {
    const box = document.getElementById("discResults"); if (!box) return;
    if (term.length < 2) { box.innerHTML = `<div class="social-empty">輸入至少 2 個字搜尋山友。</div>`; return; }
    const c = Supa.client();
    const { data } = await c.from("profiles").select("id, handle, display_name, avatar_url")
      .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).limit(20);
    if (!data || !data.length) { box.innerHTML = `<div class="social-empty">找不到符合的山友。</div>`; return; }
    box.innerHTML = data.map(p => `<div class="disc-row" data-id="${p.id}">
      ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
      <div class="disc-id"><b>${esc(p.display_name || p.handle)}</b><span>@${esc(p.handle)}</span></div></div>`).join("");
    box.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", () => openProfile(r.dataset.id)));
  }

  async function isFollowing(targetId) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return false;
    const { data } = await c.from("follows").select("following_id").eq("follower_id", u.user.id).eq("following_id", targetId).maybeSingle();
    return !!data;
  }
  async function follow(targetId, on) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return;
    if (on) await c.from("follows").insert({ follower_id: u.user.id, following_id: targetId });
    else await c.from("follows").delete().eq("follower_id", u.user.id).eq("following_id", targetId);
  }

  async function openProfile(userId) {
    const c = Supa.client();
    const { data: prof } = await c.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!prof) return;
    const { data: me } = await c.auth.getUser();
    const isMe = me && me.user && me.user.id === userId;
    const following = isMe ? false : await isFollowing(userId);
    const wrap = document.createElement("div");
    wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="dpX">✕</button><b>@${esc(prof.handle)}</b><span></span></div>
      <div class="pv-body">
        <div class="pf-top">${prof.avatar_url ? `<img class="pf-av" src="${esc(prof.avatar_url)}">` : `<div class="pf-av pf-av-ph">${esc((prof.display_name || prof.handle).slice(0, 1))}</div>`}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}</div><div class="pf-handle">@${esc(prof.handle)}</div></div></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        ${isMe ? "" : `<button class="btn ${following ? "ghost" : "primary"}" id="dpFollow">${following ? "已追蹤" : "追蹤"}</button>`}
        <div id="dpPosts" class="feed-loading"><span class="spin"></span></div>
      </div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#dpX").addEventListener("click", () => wrap.remove());
    const fb = wrap.querySelector("#dpFollow");
    if (fb) fb.addEventListener("click", async () => {
      const on = fb.textContent === "追蹤";
      fb.textContent = on ? "已追蹤" : "追蹤"; fb.className = "btn " + (on ? "ghost" : "primary");
      await follow(userId, on);
    });
    const posts = await Posts.userPosts(userId);
    const liked = await Posts.likedSet(posts.map(p => p.id));
    const box = wrap.querySelector("#dpPosts");
    box.className = "feed-list";
    box.innerHTML = posts.length ? posts.map(p => Feed.card(p, liked.has(p.id))).join("") : `<div class="social-empty">尚無貼文。</div>`;
    box.querySelectorAll(".feed-card").forEach(card => card.addEventListener("click", () => { if (typeof PostView !== "undefined") PostView.open(card.dataset.id); }));
  }

  return { render, openProfile, follow, isFollowing };
})();
