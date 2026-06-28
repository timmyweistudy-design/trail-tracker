// 貼文詳情覆蓋層：完整貼文（照片/影片）+ 按讚 + 留言串（Realtime 即時）+ 作者刪文。
const PostView = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  async function open(postId) {
    const post = await Posts.one(postId);
    if (!post) { if (typeof toast === "function") toast("貼文不存在或無權限"); return; }
    const c = Supa.client();
    const { data: u } = await c.auth.getUser();
    const isMine = u && u.user && post.author_id === u.user.id;
    const likeCount = (post.likes && post.likes[0] && post.likes[0].count) || 0;
    const likedByMe = (await Posts.likedSet([postId])).has(postId);

    const wrap = document.createElement("div");
    wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="pvX">✕</button><b>貼文</b>${isMine ? '<button class="comp-x" id="pvDel" title="刪除">🗑</button>' : "<span></span>"}</div>
      <div class="pv-body" id="pvBody"></div>
      <div class="pv-add"><input id="pvInput" class="auth-input" placeholder="留言…" maxlength="1000"><button class="btn primary" id="pvSend">送出</button></div></div>`;
    document.body.appendChild(wrap);

    // Realtime：留言或按讚有變動就即時刷新
    const channel = c.channel("post-" + postId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => loadComments(wrap, postId))
      .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${postId}` }, () => refreshLikes(wrap, postId))
      .subscribe();
    const close = () => { try { c.removeChannel(channel); } catch (e) { } wrap.remove(); };
    wrap.querySelector("#pvX").addEventListener("click", close);

    if (isMine) wrap.querySelector("#pvDel").addEventListener("click", async () => {
      if (!confirm("確定刪除這篇貼文？")) return;
      const r = await Posts.remove(postId);
      if (r.error) { if (typeof toast === "function") toast("刪除失敗：" + r.error); return; }
      close();
      if (typeof toast === "function") toast("已刪除");
      if (typeof SocialUI !== "undefined") SocialUI.route();
    });

    renderBody(wrap, post, likedByMe, likeCount, isMine);
    bindLike(wrap, postId);
    wrap.querySelector("#pvSend").addEventListener("click", () => send(wrap, postId));
    loadComments(wrap, postId);
  }

  function renderBody(wrap, post, likedByMe, likeCount, isMine) {
    const a = post.author || {};
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    wrap.querySelector("#pvBody").innerHTML = `
      <div class="fc-name fc-author" data-uid="${post.author_id}" style="cursor:pointer">${esc(a.display_name || a.handle || "山友")} <span class="fc-sub">@${esc(a.handle || "")}</span></div>
      <div class="fc-trail">⛰️ ${esc(post.trail_name || "自由路線")}　<span class="fc-stats">${post.distance_km != null ? post.distance_km.toFixed(2) + "km" : ""}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}</span></div>
      ${post.caption ? `<div class="fc-cap">${esc(post.caption)}</div>` : ""}
      ${media.map(m => m.kind === "video"
        ? `<video class="pv-img" controls preload="metadata" poster="${esc(Media.publicUrl(m.thumb_path || ""))}" src="${esc(Media.publicUrl(m.path))}"></video>`
        : `<img class="pv-img pv-photo" loading="lazy" src="${esc(Media.publicUrl(m.path))}" alt="">`).join("")}
      <div class="pv-actions"><button class="fc-like ${likedByMe ? "on" : ""}" id="pvLike">${likedByMe ? "❤️" : "🤍"} <span>${likeCount}</span></button>${isMine ? "" : `<button class="link-btn" id="pvReport">檢舉</button>`}</div>
      <div class="pv-comments" id="pvComments"><div class="feed-loading"><span class="spin"></span></div></div>`;
    wrap.querySelectorAll(".pv-photo").forEach(img => img.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.open(img.src); }));
    const au = wrap.querySelector(".fc-author"); if (au) au.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openProfile(au.dataset.uid); });
    const rep = wrap.querySelector("#pvReport"); if (rep) rep.addEventListener("click", async () => {
      const reason = prompt("檢舉這篇貼文的原因（選填）："); if (reason === null) return;
      await Safety.reportPost(post.id, reason);
      if (typeof toast === "function") toast("已檢舉，感謝回報");
    });
  }

  function bindLike(wrap, postId) {
    const b = wrap.querySelector("#pvLike"); if (!b) return;
    b.addEventListener("click", async () => {
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      const span = b.querySelector("span"); span.textContent = Math.max(0, +span.textContent + (on ? 1 : -1));
      b.firstChild.textContent = on ? "❤️ " : "🤍 ";
      await Posts.toggleLike(postId, on);
    });
  }

  // Realtime 按讚變動 → 重抓權威數字
  async function refreshLikes(wrap, postId) {
    const b = wrap.querySelector("#pvLike"); if (!b) return;
    const count = await Posts.likeCount(postId);
    const liked = (await Posts.likedSet([postId])).has(postId);
    b.classList.toggle("on", liked);
    b.querySelector("span").textContent = count;
    b.firstChild.textContent = liked ? "❤️ " : "🤍 ";
  }

  async function loadComments(wrap, postId) {
    const c = Supa.client();
    const { data } = await c.from("comments")
      .select("id, body, created_at, author:profiles!comments_author_profile_fk(handle, display_name)")
      .eq("post_id", postId).order("created_at", { ascending: true }).limit(200);
    const box = wrap.querySelector("#pvComments"); if (!box) return;
    box.innerHTML = (data && data.length)
      ? data.map(cm => `<div class="pv-cm"><b>${esc((cm.author && (cm.author.display_name || cm.author.handle)) || "山友")}</b> ${esc(cm.body)}</div>`).join("")
      : `<div class="social-empty">還沒有留言，當第一個。</div>`;
  }

  async function send(wrap, postId) {
    const input = wrap.querySelector("#pvInput"); const body = input.value.trim();
    if (!body) return;
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) { alert("請先登入"); return; }
    input.disabled = true;
    const { error } = await c.from("comments").insert({ post_id: postId, author_id: u.user.id, body });
    input.disabled = false;
    if (error) { if (typeof toast === "function") toast("留言失敗：" + error.message); return; }
    input.value = ""; loadComments(wrap, postId);
  }

  return { open };
})();
