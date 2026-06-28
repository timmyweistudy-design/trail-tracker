// 動態牆：渲染好友/探索貼文清單與卡片；按讚切換；點卡片進詳情。
const Feed = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function fmtAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "剛剛"; if (d < 3600) return Math.floor(d / 60) + " 分鐘前";
    if (d < 86400) return Math.floor(d / 3600) + " 小時前"; return Math.floor(d / 86400) + " 天前";
  }
  function count(arr) { return (arr && arr[0] && arr[0].count) || 0; }

  function card(post, liked) {
    const a = post.author || {};
    const av = a.avatar_url ? `<img class="fc-av" src="${esc(a.avatar_url)}" alt="">`
      : `<div class="fc-av fc-av-ph">${esc((a.display_name || a.handle || "?").slice(0, 1))}</div>`;
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    const imgs = media.length
      ? `<div class="fc-media">${media.map(m => m.kind === "video"
          ? `<div class="fc-vid"><img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || ""))}" alt=""><span class="fc-play">▶</span></div>`
          : `<img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt="">`).join("")}</div>` : "";
    const stats = `${(post.distance_km != null ? post.distance_km.toFixed(2) + "km" : "")}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}`;
    return `<article class="feed-card" data-id="${post.id}">
      <div class="fc-top fc-author" data-uid="${post.author_id}">${av}<div><div class="fc-name">${esc(a.display_name || a.handle || "山友")}</div>
        <div class="fc-sub">${fmtAgo(post.created_at)}${post.visibility === "friends" ? " · 好友" : ""}</div></div></div>
      <div class="fc-trail">⛰️ ${esc(post.trail_name || "自由路線")}　<span class="fc-stats">${stats}</span></div>
      ${post.caption ? `<div class="fc-cap">${esc(post.caption)}</div>` : ""}
      ${imgs}
      <div class="fc-actions">
        <button class="fc-like ${liked ? "on" : ""}" data-id="${post.id}">${liked ? "❤️" : "🤍"} <span>${count(post.likes)}</span></button>
        <button class="fc-comment" data-id="${post.id}">💬 ${count(post.comments)}</button>
      </div>
    </article>`;
  }

  let _mode = "friends", _posts = [], _into = null;

  async function render(renderInto, mode) {
    _into = renderInto; _mode = mode; _posts = [];
    renderInto(`<div class="feed-loading"><span class="spin"></span>載入中…</div>`);
    await loadMore(true);
  }

  async function loadMore(first) {
    const before = (!first && _posts.length) ? _posts[_posts.length - 1].created_at : null;
    const batch = await Posts.feed(_mode, before);
    _posts = _posts.concat(batch);
    if (!_posts.length) {
      _into(`<div class="social-empty">${_mode === "explore" ? "目前還沒有公開貼文。" : "追蹤山友後，這裡會出現他們的步道旅行（你自己的也會在這）。"}</div>`);
      return;
    }
    const liked = await Posts.likedSet(_posts.map(p => p.id));
    const more = batch.length >= 20 ? `<button class="btn ghost" id="feedMore">載入更多</button>` : "";
    _into(`<div class="feed-list">${_posts.map(p => card(p, liked.has(p.id))).join("")}</div>${more}`);
    bind();
    const mb = document.getElementById("feedMore"); if (mb) mb.addEventListener("click", () => loadMore(false));
  }

  function bind() {
    document.querySelectorAll(".feed-card .fc-like").forEach(b => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      const span = b.querySelector("span"); const n = +span.textContent + (on ? 1 : -1); span.textContent = Math.max(0, n);
      b.firstChild.textContent = on ? "❤️ " : "🤍 ";
      await Posts.toggleLike(b.dataset.id, on);
    }));
    const openDetail = id => { if (typeof PostView !== "undefined") PostView.open(id); };
    document.querySelectorAll(".feed-card .fc-comment").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openDetail(b.dataset.id); }));
    document.querySelectorAll(".feed-card .fc-author").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); if (typeof Discover !== "undefined") Discover.openProfile(b.dataset.uid); }));
    document.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => openDetail(c.dataset.id)));
  }

  return { render, card, _fmtAgo: fmtAgo };
})();
