// 通知：列出別人對你的追蹤/讚/留言，未讀計數，標記已讀，Realtime 即時。
const Notifs = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function ago(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "剛剛"; if (d < 3600) return Math.floor(d / 60) + " 分前";
    if (d < 86400) return Math.floor(d / 3600) + " 小時前"; return Math.floor(d / 86400) + " 天前";
  }
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await c.auth.getUser(); return data && data.user ? data.user.id : null; }

  async function unreadCount() {
    const c = Supa.client(); const uid = await me(); if (!uid) return 0;
    const { count } = await c.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("read", false);
    return count || 0;
  }
  async function list() {
    const c = Supa.client(); const uid = await me(); if (!uid) return [];
    const { data } = await c.from("notifications")
      .select("id, type, post_id, actor_id, read, created_at, actor:profiles!notif_actor_profile_fk(handle, display_name, avatar_url)")
      .eq("user_id", uid).order("created_at", { ascending: false }).limit(50);
    return data || [];
  }
  async function markAllRead() {
    const c = Supa.client(); const uid = await me(); if (!uid) return;
    await c.from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);
  }
  function label(n) {
    const name = esc((n.actor && (n.actor.display_name || n.actor.handle)) || "有人");
    if (n.type === "follow") return name + " 開始追蹤你";
    if (n.type === "like") return name + " 讚了你的貼文";
    if (n.type === "comment") return name + " 在你的貼文留言";
    if (n.type === "team") return name + " 邀請你加入小隊";
    return name;
  }
  function icon(t) { return t === "follow" ? "➕" : t === "like" ? "❤️" : t === "team" ? "👥" : "💬"; }

  async function render(into) {
    into(`<div class="feed-loading"><span class="spin"></span></div>`);
    const items = await list();
    if (!items.length) { into(`<div class="social-empty">還沒有通知。</div>`); await markAllRead(); return; }
    into(`<div class="notif-list">${items.map(n =>
      `<div class="notif ${n.read ? "" : "unread"}" data-type="${n.type}" data-post="${n.post_id || ""}" data-uid="${n.actor_id || ""}">
        <span class="notif-ic">${icon(n.type)}</span>
        <div class="notif-body">${label(n)}<div class="fc-sub">${ago(n.created_at)}</div></div>
      </div>`).join("")}</div>`);
    document.querySelectorAll(".notif").forEach(el => el.addEventListener("click", () => {
      if (el.dataset.type === "follow") { if (typeof Discover !== "undefined" && el.dataset.uid) Discover.openProfile(el.dataset.uid); }
      else if (el.dataset.type === "team") { if (typeof Team !== "undefined") Team.openSheet(); }
      else if (el.dataset.post && typeof PostView !== "undefined") PostView.open(el.dataset.post);
    }));
    await markAllRead();
  }

  function subscribe(onChange) {
    const c = Supa.client(); if (!c) return;
    me().then(uid => {
      if (!uid) return;
      c.channel("notif-" + uid)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${uid}` }, () => onChange && onChange())
        .subscribe();
    });
  }

  return { unreadCount, list, markAllRead, render, subscribe };
})();
