// 搜尋使用者（handle/名字）、追蹤/取消、檢視他人個人頁（含其貼文）。
const Discover = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function petLineFor(prof) {
    if (!prof.pet_name && !prof.pet_level) return "";
    const lvl = prof.pet_level || 1;
    const emoji = (typeof PET_STAGES !== "undefined" && PET_STAGES[lvl - 1]) ? PET_STAGES[lvl - 1].e : "🐾";
    return `<div class="pf-pet">${emoji} ${esc(prof.pet_name || "")} · Lv.${lvl}${prof.total_km != null ? `　·　已走 ${prof.total_km} km` : ""}</div>`;
  }

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
    const { data: raw } = await c.from("profiles").select("id, handle, display_name, avatar_url")
      .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).limit(30);
    const blocked = (typeof Safety !== "undefined") ? await Safety.blockedIds() : new Set();
    const data = (raw || []).filter(p => !blocked.has(p.id));   // 過濾已封鎖的人
    if (!data.length) { box.innerHTML = `<div class="social-empty">找不到符合的山友。</div>`; return; }
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
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="dpX">✕</button><b>@${esc(prof.handle)}</b><span></span></div>
      <div class="pv-body">
        <div class="pf-top">${prof.avatar_url ? `<img class="pf-av" src="${esc(prof.avatar_url)}">` : `<div class="pf-av pf-av-ph">${esc((prof.display_name || prof.handle).slice(0, 1))}</div>`}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}</div><div class="pf-handle">@${esc(prof.handle)}</div></div></div>
        ${petLineFor(prof)}
        <div class="pf-counts" id="dpCounts"></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        ${isMe ? "" : `<button class="btn ${following ? "ghost" : "primary"}" id="dpFollow">${following ? "已追蹤" : "追蹤"}</button>
        <div class="pf-safety">${isMe ? "" : `<button class="link-btn" id="dpReport">檢舉</button><button class="link-btn" id="dpBlock">封鎖</button>`}</div>`}
        <div id="dpPosts" class="feed-loading"><span class="spin"></span></div>
      </div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#dpX").addEventListener("click", () => wrap.remove());
    Posts.followCounts(userId).then(c2 => {
      const el = wrap.querySelector("#dpCounts"); if (!el) return;
      el.innerHTML = `<span class="cnt-link" data-mode="followers"><b>${c2.followers}</b> 粉絲</span>　<span class="cnt-link" data-mode="following"><b>${c2.following}</b> 追蹤中</span>`;
      el.querySelectorAll(".cnt-link").forEach(s => s.addEventListener("click", () => openUserList(userId, s.dataset.mode)));
    });
    const fb = wrap.querySelector("#dpFollow");
    if (fb) fb.addEventListener("click", async () => {
      const on = fb.textContent === "追蹤";
      fb.textContent = on ? "已追蹤" : "追蹤"; fb.className = "btn " + (on ? "ghost" : "primary");
      await follow(userId, on);
    });
    const rb = wrap.querySelector("#dpReport");
    if (rb) rb.addEventListener("click", async () => {
      const reason = prompt("檢舉原因（選填）："); if (reason === null) return;
      await Safety.reportUser(userId, reason);
      if (typeof toast === "function") toast("已檢舉，感謝回報");
    });
    const bb = wrap.querySelector("#dpBlock");
    if (bb) {
      Safety.isBlocked(userId).then(b => { bb.textContent = b ? "解除封鎖" : "封鎖"; });
      bb.addEventListener("click", async () => {
        const blocked = bb.textContent === "解除封鎖";
        if (!blocked && !confirm("封鎖後你們將看不到彼此的貼文，並解除互相追蹤。確定？")) return;
        if (blocked) { await Safety.unblock(userId); bb.textContent = "封鎖"; if (typeof toast === "function") toast("已解除封鎖"); }
        else { await Safety.block(userId); if (typeof toast === "function") toast("已封鎖"); wrap.remove(); if (typeof SocialUI !== "undefined") SocialUI.route(); }
      });
    }
    const posts = await Posts.userPosts(userId);
    const liked = await Posts.likedSet(posts.map(p => p.id));
    const box = wrap.querySelector("#dpPosts");
    box.className = "feed-list";
    box.innerHTML = posts.length ? posts.map(p => Feed.card(p, liked.has(p.id))).join("") : `<div class="social-empty">尚無貼文。</div>`;
    box.querySelectorAll(".feed-card").forEach(card => card.addEventListener("click", () => { if (typeof PostView !== "undefined") PostView.open(card.dataset.id); }));
  }

  async function profilesByIds(ids) {
    if (!ids.length) return [];
    const c = Supa.client();
    const { data } = await c.from("profiles").select("id, handle, display_name, avatar_url, pet_level").in("id", ids).limit(200);
    return data || [];
  }
  async function listFollowers(uid) {
    const c = Supa.client();
    const { data } = await c.from("follows").select("follower_id").eq("following_id", uid);
    return profilesByIds((data || []).map(r => r.follower_id));
  }
  async function listFollowing(uid) {
    const c = Supa.client();
    const { data } = await c.from("follows").select("following_id").eq("follower_id", uid);
    return profilesByIds((data || []).map(r => r.following_id));
  }
  function userRow(p) {
    return `<div class="disc-row" data-id="${p.id}">${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}<div class="disc-id"><b>${esc(p.display_name || p.handle)}${p.pet_level ? ` <span class="lv-chip">Lv.${p.pet_level}</span>` : ""}</b><span>@${esc(p.handle)}</span></div></div>`;
  }
  // 粉絲 / 追蹤中 名單覆蓋層
  async function openUserList(uid, mode) {
    const title = mode === "followers" ? "粉絲" : "追蹤中";
    const wrap = document.createElement("div"); wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="ulX">✕</button><b>${title}</b><span></span></div>
      <div class="pv-body" id="ulBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#ulX").addEventListener("click", () => wrap.remove());
    const people = mode === "followers" ? await listFollowers(uid) : await listFollowing(uid);
    const body = wrap.querySelector("#ulBody"); if (!body) return;
    body.innerHTML = people.length ? people.map(userRow).join("") : `<div class="social-empty">還沒有${title}。</div>`;
    body.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", () => { wrap.remove(); openProfile(r.dataset.id); }));
  }

  return { render, openProfile, follow, isFollowing, openUserList };
})();
