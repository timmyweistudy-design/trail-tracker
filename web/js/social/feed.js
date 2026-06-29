// 動態牆：渲染好友/探索貼文清單與卡片；按讚切換；點卡片進詳情。
const Feed = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function fmtAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "剛剛"; if (d < 3600) return Math.floor(d / 60) + " 分鐘前";
    if (d < 86400) return Math.floor(d / 3600) + " 小時前"; return Math.floor(d / 86400) + " 天前";
  }
  function count(arr) { return (arr && arr[0] && arr[0].count) || 0; }
  // 用降取樣的軌跡縮圖畫出路線形狀（純 SVG，不載地圖、很輕）
  function routeSvg(thumb) {
    if (!thumb || thumb.length < 2) return "";
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of thumb) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const w = 100, h = 46, pad = 5, sx = (maxX - minX) || 1e-6, sy = (maxY - minY) || 1e-6;
    const co = thumb.map(p => [pad + (p[0] - minX) / sx * (w - 2 * pad), pad + (1 - (p[1] - minY) / sy) * (h - 2 * pad)]);
    const pts = co.map(c => c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
    const a = co[0], b = co[co.length - 1];
    return `<svg class="fc-route" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<polyline points="${pts}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle class="s" cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="2.6"/>` +
      `<circle class="e" cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="2.6"/></svg>`;
  }

  function card(post, liked) {
    const a = post.author || {};
    const av = a.avatar_url ? `<img class="fc-av" src="${esc(a.avatar_url)}" alt="">`
      : `<div class="fc-av fc-av-ph">${esc((a.display_name || a.handle || "?").slice(0, 1))}</div>`;
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    const imgs = media.length
      ? `<div class="fc-media fc-media-${Math.min(media.length, 4)}">${media.map(m => m.kind === "video"
          ? `<div class="fc-vid"><img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || ""))}" alt=""><span class="fc-play">▶</span></div>`
          : `<img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt="">`).join("")}</div>` : "";
    const stats = `${(post.distance_km != null ? post.distance_km.toFixed(2) + "km" : "")}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}`;
    const trailName = post.trail_id
      ? `<span class="fc-traillink" data-trail="${esc(post.trail_id)}">⛰️ ${esc(post.trail_name || "自由路線")}</span>`
      : `⛰️ ${esc(post.trail_name || "自由路線")}`;
    return `<article class="feed-card" data-id="${post.id}">
      <div class="fc-top fc-author" data-uid="${post.author_id}">${av}<div><div class="fc-name">${esc(a.display_name || a.handle || "山友")}${a.pet_level ? ` <span class="lv-chip">Lv.${a.pet_level}</span>` : ""}</div>
        <div class="fc-sub">${fmtAgo(post.created_at)}${post.visibility === "friends" ? " · 好友" : ""}</div></div></div>
      <div class="fc-trail">${trailName}　<span class="fc-stats">${stats}</span></div>
      ${routeSvg(post.track_thumb)}
      ${post.caption ? `<div class="fc-cap">${esc(post.caption)}</div>` : ""}
      ${imgs}
      <div class="fc-actions">
        <button class="fc-like ${liked ? "on" : ""}" data-id="${post.id}">${liked ? "❤️" : "🤍"} <span>${count(post.likes)}</span></button>
        <button class="fc-comment" data-id="${post.id}">💬 ${count(post.comments)}</button>
      </div>
    </article>`;
  }

  let _mode = "friends", _posts = [], _into = null, _gen = 0;

  async function render(renderInto, mode) {
    const g = ++_gen;   // 世代：切分頁/刷新後，舊查詢結果作廢
    _into = renderInto; _mode = mode; _posts = [];
    renderInto(`<div class="feed-loading"><span class="spin"></span>載入中…</div>`);
    await loadMore(true, g);
  }

  async function loadMore(first, g) {
    if (g == null) g = _gen;
    const before = (!first && _posts.length) ? _posts[_posts.length - 1].created_at : null;
    const batch = await Posts.feed(_mode, before);
    if (g !== _gen) return;   // 已切到別的分頁/刷新 → 丟棄
    _posts = _posts.concat(batch);
    const refresh = `<button class="feed-refresh" id="feedRefresh">↻ 重新整理</button>`;
    if (!_posts.length) {
      _into(`${refresh}<div class="social-empty">${_mode === "explore" ? "目前還沒有公開貼文。" : "追蹤山友後，這裡會出現他們的步道旅行（你自己的也會在這）。"}</div>`);
      const r0 = document.getElementById("feedRefresh"); if (r0) r0.addEventListener("click", () => render(_into, _mode));
      return;
    }
    const liked = await Posts.likedSet(_posts.map(p => p.id));
    const more = batch.length >= 20 ? `<button class="btn ghost" id="feedMore">載入更多</button>` : "";
    _into(`${refresh}<div class="feed-list">${_posts.map(p => card(p, liked.has(p.id))).join("")}</div>${more}`);
    bind();
    const rb = document.getElementById("feedRefresh"); if (rb) rb.addEventListener("click", () => render(_into, _mode));
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
    document.querySelectorAll(".feed-card .fc-traillink").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); if (typeof window.openDetail === "function") window.openDetail(b.dataset.trail); }));
    document.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => openDetail(c.dataset.id)));
  }

  return { render, card, _fmtAgo: fmtAgo };
})();
