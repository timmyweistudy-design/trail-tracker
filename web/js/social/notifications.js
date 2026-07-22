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
    if (n.type === "follow_req") return name + " 請求追蹤你";
    if (n.type === "follow_ok") return name + " 同意了你的追蹤請求";
    if (n.type === "like") return name + " 讚了你的貼文";
    if (n.type === "comment") return name + " 在你的貼文留言";
    if (n.type === "team") return name + " 邀請你加入小隊";
    if (n.type === "gift") return name + " 送了果實給你的夥伴";
    if (n.type === "mention") return name + " 在貼文中提到你";
    return name;
  }
  function icon(t) { return (t === "follow" || t === "follow_req" || t === "follow_ok") ? ic("plus") : t === "like" ? ic("heart") : t === "team" ? ic("users") : t === "gift" ? "🍓" : t === "mention" ? ic("megaphone") : ic("chat"); }

  // 我收到、還沒處理的追蹤請求（phase18；未升級回空集合）
  async function pendingRequestIds() {
    try {
      const c = Supa.client(); const uid = await me(); if (!uid) return new Set();
      const { data, error } = await c.from("follow_requests").select("requester_id").eq("target_id", uid);
      if (error) return new Set();
      return new Set((data || []).map(r => r.requester_id));
    } catch (e) { return new Set(); }
  }

  async function pushBar() {
    // 網頁走 Web Push；原生 App（WKWebView 無 Web Push）走 Capacitor 原生推播
    if (typeof Push !== "undefined" && Push.supported()) {
      const on = await Push.isOn();
      return `<button class="btn ${on ? "ghost" : "primary"} notif-push" id="notifPush">${ic("bell")} ${on ? "關閉推播通知" : "開啟推播通知"}</button>`;
    }
    if (typeof NativePush !== "undefined" && NativePush.available()) {
      const on = await NativePush.isOn();
      return `<button class="btn ${on ? "ghost" : "primary"} notif-push" id="notifPushNative">${ic("bell")} ${on ? "關閉推播通知" : "開啟推播通知"}</button>`;
    }
    return "";
  }
  function wirePush(into, redraw) {
    const b = document.getElementById("notifPush");
    if (b) b.addEventListener("click", async () => { b.disabled = true; await Push.toggle(); redraw(); });
    const bn = document.getElementById("notifPushNative");
    if (bn) bn.addEventListener("click", async () => { bn.disabled = true; await NativePush.toggle(); redraw(); });
  }

  // 把同型別／同貼文的通知收合成一列（如「小明 讚了你的貼文」＋👥3），減少洗版
  function collapseKey(n) {
    if (n.type === "like") return "like:" + (n.post_id || "");
    if (n.type === "comment") return "comment:" + (n.post_id || "");
    if (n.type === "follow") return "follow";
    return "solo:" + n.id;   // 其餘（留言提及/小隊/送禮/追蹤請求/同意）各自成列，保留動作鈕
  }
  function groupNotifs(items) {
    const map = new Map();
    for (const n of items) {   // items 已依時間新→舊排序，第一個即代表（最新）
      const k = collapseKey(n);
      const g = map.get(k);
      if (g) { g.count++; if (!n.read) g.unread = true; }
      else map.set(k, { rep: n, count: 1, unread: !n.read });
    }
    return [...map.values()];
  }

  // 依時間分段（今天／本週／更早），讓通知列表一眼看出新舊。回傳 0/1/2。
  function timeBucket(iso) {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const t = new Date(iso).getTime();
    if (t >= startToday) return 0;
    if (t >= startToday - 6 * 86400000) return 1;
    return 2;
  }
  const SEC_LABEL = ["今天", "本週", "更早"];

  let _filter = "all";
  const GROUPS = [["all", "全部"], ["like", "讚"], ["comment", "留言"], ["follow", "追蹤"]];
  function inGroup(n, g) {
    if (g === "all") return true;
    if (g === "like") return n.type === "like";
    if (g === "comment") return n.type === "comment" || n.type === "mention";
    if (g === "follow") return n.type === "follow" || n.type === "follow_req" || n.type === "follow_ok";
    return true;
  }

  async function render(into) {
    into(`<div class="feed-loading"><span class="spin"></span></div>`);
    const bar = await pushBar();
    const [items, pending] = await Promise.all([list(), pendingRequestIds()]);
    const tabs = `<div class="notif-tabs">${GROUPS.map(([k, l]) => `<button class="notif-tab ${k === _filter ? "on" : ""}" data-g="${k}">${l}</button>`).join("")}</div>`;
    const paint = () => {
      const list2 = groupNotifs(items.filter(n => inGroup(n, _filter)));
      let _curSec = -1;
      const body = list2.length
        ? `<div class="notif-list">${list2.map(g => {
          const n = g.rep;
          let sec = "";
          const b = timeBucket(n.created_at);
          if (b !== _curSec) { _curSec = b; sec = `<div class="notif-sec">${SEC_LABEL[b]}</div>`; }
          const askBtns = (n.type === "follow_req" && n.actor_id && pending.has(n.actor_id))
            ? `<div class="notif-acts"><button class="btn primary nf-ok" data-uid="${n.actor_id}">同意</button><button class="btn ghost nf-no" data-uid="${n.actor_id}">拒絕</button></div>` : "";
          const countChip = g.count > 1 ? `<span class="notif-count">${ic("users")}${g.count}</span>` : "";
          return `${sec}<div class="notif ${g.unread ? "unread" : ""}" data-type="${n.type}" data-post="${n.post_id || ""}" data-uid="${n.actor_id || ""}">
            <span class="notif-ic">${icon(n.type)}</span>
            <div class="notif-body"><div class="notif-line">${label(n)}${countChip}</div><div class="fc-sub">${ago(n.created_at)}</div>${askBtns}</div>
          </div>`;
        }).join("")}</div>`
        : `<div class="social-empty"><span class="ee">🔔</span>${_filter === "all" ? "還沒有通知。" : "這個分類還沒有通知。"}</div>`;
      into(`${bar}${items.length ? tabs : ""}${body}`);
      document.querySelectorAll(".notif-tab").forEach(b => b.addEventListener("click", () => { _filter = b.dataset.g; paint(); }));
      // 同意 / 拒絕追蹤請求
      document.querySelectorAll(".nf-ok, .nf-no").forEach(b => b.addEventListener("click", async e => {
        e.stopPropagation();
        const c = Supa.client(); const ok = b.classList.contains("nf-ok");
        b.disabled = true;
        const { error } = await c.rpc(ok ? "approve_follow" : "decline_follow", { p_requester: b.dataset.uid });
        if (error) { b.disabled = false; if (typeof toast === "function") toast("操作失敗，請先更新資料庫（phase18）"); return; }
        if (typeof toast === "function") toast(ok ? "已同意，對方現在追蹤你了" : "已拒絕請求");
        pending.delete(b.dataset.uid);
        paint();
      }));
      document.querySelectorAll(".notif").forEach(el => el.addEventListener("click", () => {
        if (el.dataset.type === "follow" || el.dataset.type === "follow_req" || el.dataset.type === "follow_ok") { if (typeof Discover !== "undefined" && el.dataset.uid) Discover.openProfile(el.dataset.uid); }
        else if (el.dataset.type === "team") { if (typeof Team !== "undefined") Team.openSheet(); }
        else if (el.dataset.type === "gift") { const b = document.querySelector('.tab[data-view="pet"]'); if (b) b.click(); }
        else if (el.dataset.post && typeof PostView !== "undefined") PostView.open(el.dataset.post);
      }));
      wirePush(into, () => render(into));
    };
    paint();
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
