// 通知：列出別人對你的追蹤/讚/留言，未讀計數，標記已讀，Realtime 即時。
const Notifs = (() => {
  const esc = s => Supa.esc(s);
  const ago = iso => Supa.ago(iso);
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const PAGE = 40;
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await Supa.meUser(); return data && data.user ? data.user.id : null; }

  async function unreadCount() {
    const c = Supa.client(); const uid = await me(); if (!uid) return 0;
    const { count } = await c.from("notifications").select("*", { count: "exact", head: true }).eq("user_id", uid).eq("read", false);
    return count || 0;
  }
  // plan_id 是 phase31（留守人）才有的欄位：資料庫還沒升級時查這欄會整個失敗 → 記住、改用舊欄位再查一次
  let _noPlanCol = false;
  async function list(beforeISO) {
    const c = Supa.client(); const uid = await me(); if (!uid) return [];
    const run = cols => {
      let q = c.from("notifications")
        .select(`id, type, post_id, ${cols}actor_id, read, created_at, actor:profiles!notif_actor_profile_fk(handle, display_name, avatar_url)`)
        .eq("user_id", uid).order("created_at", { ascending: false }).limit(PAGE);
      if (beforeISO) q = q.lt("created_at", beforeISO);   // 看更早的
      return q;
    };
    let { data, error } = await run(_noPlanCol ? "" : "plan_id, ");
    if (error && !_noPlanCol && /plan_id/.test(error.message || "")) { _noPlanCol = true; ({ data } = await run("")); }
    return data || [];
  }
  // ids：只標這一批（畫面上看得到的）；不給就全部
  async function markAllRead(ids) {
    const c = Supa.client(); const uid = await me(); if (!uid) return;
    let q = c.from("notifications").update({ read: true }).eq("user_id", uid).eq("read", false);
    if (ids && ids.length) q = q.in("id", ids);
    await q;
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
    // 留守人（phase31）
    if (n.type === "admin") return T("管理提醒：過去 24 小時有新的檢舉或錯誤，點這裡處理");   // schema-phase36，只有管理員會收到
    if (n.type === "guard") return T("%s 出發了，請你當留守人").replace("%s", name);
    if (n.type === "guard_ext") return T("%s 延後了預計下山時間").replace("%s", name);
    if (n.type === "overdue") return T("%s 超過預計下山時間 30 分鐘還沒回報").replace("%s", name);
    if (n.type === "safe") return T("%s 平安下山了").replace("%s", name);
    return name;
  }
  const GUARD = new Set(["guard", "guard_ext", "overdue", "safe"]);
  function icon(t) { if (t === "admin") return ic("sliders"); if (GUARD.has(t)) return ic(t === "safe" ? "check" : t === "overdue" ? "alert" : "shield"); return (t === "follow" || t === "follow_req" || t === "follow_ok") ? ic("plus") : t === "like" ? ic("heart") : t === "team" ? ic("users") : t === "gift" ? (typeof BERRY_SVG !== "undefined" ? BERRY_SVG : "🍓") : t === "mention" ? ic("megaphone") : ic("chat"); }

  // 我收到、還沒處理的追蹤請求（phase18；未升級回空集合）
  async function pendingRequestIds() {
    try {
      const c = Supa.client(); const uid = await me(); if (!uid) return new Set();
      const { data, error } = await c.from("follow_requests").select("requester_id").eq("target_id", uid);
      if (error) return new Set();
      return new Set((data || []).map(r => r.requester_id));
    } catch (e) { return new Set(); }
  }

  // 推播還沒開才在最下面放一行小提示（以前最上面一顆大按鈕，每次打開都佔一大塊）；關閉改到「設定」
  async function pushBar() {
    try {
      if (localStorage.getItem("tt_push_hint_off") === "1") return "";
      if (typeof Push !== "undefined" && Push.supported()) { if (await Push.isOn()) return ""; }
      else if (typeof NativePush !== "undefined" && NativePush.available()) { if (await NativePush.isOn()) return ""; }
      else return "";
    } catch (e) { return ""; }
    return `<div class="notif-push-hint">${ic("bell")}<span>${T("有人按讚、留言時要通知你嗎？")}</span><button class="link-btn" id="notifPushOn">${T("開啟")}</button><button class="comp-x" id="notifPushX" aria-label="${T("關閉")}">${ic("x")}</button></div>`;
  }
  function wirePush(into, redraw) {
    const b = document.getElementById("notifPushOn");
    if (b) b.addEventListener("click", async () => {
      b.disabled = true;
      if (typeof Push !== "undefined" && Push.supported()) await Push.enable(); else await NativePush.toggle();
      redraw();
    });
    const x = document.getElementById("notifPushX");
    if (x) x.addEventListener("click", () => { try { localStorage.setItem("tt_push_hint_off", "1"); } catch (e) { } const h = x.closest(".notif-push-hint"); if (h) h.remove(); });
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
  const SEC_LABEL = ["今天", "這週", "更早"];

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
    const [bar, items, pending, guardBar] = await Promise.all([pushBar(), list(), pendingRequestIds(),
      typeof Guardian !== "undefined" ? Guardian.bannerHtml().catch(() => "") : ""]);
    let more = items.length >= PAGE;
    const tabs = `<div class="notif-tabs">${GROUPS.map(([k, l]) => `<button class="notif-tab ${k === _filter ? "on" : ""}" data-g="${k}">${T(l)}</button>`).join("")}</div>`;
    const paint = () => {
      const list2 = groupNotifs(items.filter(n => inGroup(n, _filter)));
      let _curSec = -1;
      const body = list2.length
        ? `<div class="notif-list">${list2.map(g => {
          const n = g.rep;
          let sec = "";
          const b = timeBucket(n.created_at);
          if (b !== _curSec) { _curSec = b; sec = `<div class="notif-sec">${T(SEC_LABEL[b])}</div>`; }
          const askBtns = (n.type === "follow_req" && n.actor_id && pending.has(n.actor_id))
            ? `<div class="notif-acts"><button class="btn primary nf-ok" data-uid="${n.actor_id}">${T("同意")}</button><button class="btn ghost nf-no" data-uid="${n.actor_id}">${T("拒絕")}</button></div>` : "";
          // 合併的通知：「＋2」＝另外還有 2 個人（以前顯示總數 👥3，看不出是誰加誰）
          const countChip = g.count > 1 ? `<span class="notif-count" title="${T("還有其他人")}">${ic("users")}+${g.count - 1}</span>` : "";
          return `${sec}<div class="notif ${g.unread ? "unread" : ""}${GUARD.has(n.type) ? " nf-guard nf-" + n.type : ""}" data-type="${n.type}" data-post="${n.post_id || ""}" data-plan="${n.plan_id || ""}" data-uid="${n.actor_id || ""}">
            <span class="notif-ic">${icon(n.type)}</span>
            <div class="notif-body"><div class="notif-line">${label(n)}${countChip}</div><div class="fc-sub">${ago(n.created_at)}</div>${askBtns}</div>
          </div>`;
        }).join("")}</div>`
        : `<div class="social-empty"><span class="ee">${ic("bell")}</span>${T(_filter === "all" ? "還沒有通知。" : "這個分類還沒有通知。")}</div>`;
      const moreBtn = more && list2.length ? `<button class="btn ghost" id="notifMore">${T("看更早的")}</button>` : "";
      into(`${guardBar}${items.length ? tabs : ""}${body}${moreBtn}${bar}`);
      if (guardBar && typeof Guardian !== "undefined") Guardian.wireBanner();
      const mb = document.getElementById("notifMore");
      if (mb) mb.addEventListener("click", async () => {
        mb.disabled = true; mb.innerHTML = `<span class="spin"></span>`;
        const older = await list(items[items.length - 1].created_at);
        items.push(...older); more = older.length >= PAGE; paint();
      });
      document.querySelectorAll(".notif-tab").forEach(b => b.addEventListener("click", () => { _filter = b.dataset.g; paint(); }));
      // 同意 / 拒絕追蹤請求
      document.querySelectorAll(".nf-ok, .nf-no").forEach(b => b.addEventListener("click", async e => {
        e.stopPropagation();
        const c = Supa.client(); const ok = b.classList.contains("nf-ok");
        b.disabled = true;
        const { error } = await c.rpc(ok ? "approve_follow" : "decline_follow", { p_requester: b.dataset.uid });
        if (error) { b.disabled = false; if (typeof toast === "function") toast(T("沒成功，等一下再試試")); return; }
        if (typeof toast === "function") toast(T(ok ? "同意了，對方現在追蹤你了" : "婉拒了"));
        pending.delete(b.dataset.uid);
        paint();
      }));
      document.querySelectorAll(".notif").forEach(el => el.addEventListener("click", () => {
        if (el.dataset.type === "follow" || el.dataset.type === "follow_req" || el.dataset.type === "follow_ok") { if (typeof Discover !== "undefined" && el.dataset.uid) Discover.openProfile(el.dataset.uid); }
        else if (el.dataset.type === "admin") { if (typeof ensureScript === "function") ensureScript("js/admin.js").then(() => Admin.open("queue")); }
        else if (el.dataset.type === "team") { if (typeof Team !== "undefined") Team.openSheet(); }
        else if (GUARD.has(el.dataset.type)) { if (typeof Guardian !== "undefined" && el.dataset.plan) Guardian.openPlan(el.dataset.plan); }
        else if (el.dataset.type === "gift") { const b = document.querySelector('.tab[data-view="pet"]'); if (b) b.click(); }
        else if (el.dataset.post && typeof PostView !== "undefined") PostView.open(el.dataset.post);
      }));
      wirePush(into, () => render(into));
    };
    paint();
    // 已讀：停留 2.5 秒才標，而且只標這次載入的那些（以前一打開就全部標掉，看的當下新通知又進來也一起被吞）。
    // 這次畫面上的未讀圓點保留，下次進來才消失。
    const ids = items.filter(n => !n.read).map(n => n.id);
    if (ids.length) setTimeout(() => { markAllRead(ids).then(() => { if (typeof SocialUI !== "undefined" && SocialUI.updateBadge) SocialUI.updateBadge(); }); }, 2500);
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
