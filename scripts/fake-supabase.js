// 假 Supabase（社群頁測試用）：在頁面裡呼叫 window.__installFakeSupa(opts) 換掉真的連線，給一組固定的貼文/通知/揪團資料。
window.__installFakeSupa = function (opts) {
  opts = opts || {};
  const now = Date.now(), iso = h => new Date(now - h * 3600e3).toISOString();
  const ph = (c1, c2, t) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><defs><linearGradient id='g' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${c1}'/><stop offset='1' stop-color='${c2}'/></linearGradient></defs><rect width='400' height='300' fill='url(#g)'/><path d='M0 230 L90 140 L160 200 L250 100 L400 220 L400 300 L0 300Z' fill='#2f4f3a' opacity='.8'/><text x='20' y='40' font-size='22' fill='#fff'>${t || ""}</text></svg>`);
  const me = { id: "me", handle: "timmy_hike", display_name: "Timmy", avatar_url: null, bio: "週末爬山，平日想爬山", pet_level: 3, pet_name: "小苔", total_km: 158.8, is_premium: true, follow_approval: true, cover_url: opts.cover ? ph("#7fb3d5", "#dfe9d8") : null };
  const people = [me,
    { id: "u1", handle: "mei_trail", display_name: "阿梅", avatar_url: ph("#e8b4a0", "#c2683d"), pet_level: 5, pet_name: "毛毛", total_km: 420, is_premium: false },
    { id: "u2", handle: "ridge_walker_long_name", display_name: "一個名字非常非常長的山友測試看會不會爆版", avatar_url: null, pet_level: 1, is_premium: true },
    { id: "u3", handle: "hsu", display_name: "許", avatar_url: null, pet_level: 7, pet_name: "雲豹", total_km: 1200 }];
  const P = id => people.find(p => p.id === id);
  const thumb = [[121.5, 25.1], [121.51, 25.11], [121.52, 25.105], [121.53, 25.12], [121.54, 25.115]];
  const mk = (id, au, h, extra) => Object.assign({ id, author_id: au, trail_id: null, trail_name: "自由路線", distance_km: 6.42, duration_ms: 3 * 3600e3, ascent: 512, hiked_on: "2026-09-30", caption: null, visibility: "public", created_at: iso(h), track_thumb: thumb, rating: null, author: P(au), post_media: [], likes: [{ count: 0 }], comments: [{ count: 0 }], pinned: false, track: { type: "LineString", coordinates: thumb } }, extra);
  const posts = opts.empty ? [] : [
    mk("p1", "u1", 0.3, { trail_name: "南澳古道", trail_id: "forestry-002", caption: "今天天氣超好！#南澳古道 跟 @timmy_hike 一起走，溪水好清涼\n下次還要再來", rating: 5, post_media: [{ kind: "photo", path: ph("#9cc9e8", "#e7efe0", "1"), thumb_path: ph("#9cc9e8", "#e7efe0", "1"), ord: 0, km: 1.2 }, { kind: "photo", path: ph("#f3c98b", "#e7a36b", "2"), thumb_path: ph("#f3c98b", "#e7a36b", "2"), ord: 1, km: 3.4 }, { kind: "photo", path: ph("#a7d3a0", "#6aa36f", "3"), thumb_path: ph("#a7d3a0", "#6aa36f", "3"), ord: 2 }], likes: [{ count: 12 }], comments: [{ count: 3 }] }),
    mk("p2", "me", 5, { caption: "一個人的夜爬，星星多到數不完 #夜爬", visibility: "friends", likes: [{ count: 1 }], rating: 4, distance_km: 12.345, ascent: 1234 }),
    mk("p3", "u2", 30, { trail_name: "一條名字非常長的步道名稱看看會不會把卡片擠爆的那種", caption: "", distance_km: 101.2, ascent: 12345, likes: [{ count: 1234 }], comments: [{ count: 56 }], post_media: [1, 2, 3, 4, 5, 6].map(i => ({ kind: "photo", path: ph("#ccc", "#888", i), thumb_path: ph("#ccc", "#888", i), ord: i })) }),
    mk("p4", "u3", 24 * 9, { caption: "🔁 轉發 @mei_trail\n好美", distance_km: null, ascent: null, track_thumb: null }),
  ];
  const notifs = opts.empty ? [] : [
    { id: "n1", user_id: "me", type: "like", post_id: "p2", actor_id: "u1", read: false, created_at: iso(0.1), actor: P("u1") },
    { id: "n2", user_id: "me", type: "like", post_id: "p2", actor_id: "u3", read: false, created_at: iso(0.5), actor: P("u3") },
    { id: "n3", user_id: "me", type: "follow_req", actor_id: "u2", read: false, created_at: iso(2), actor: P("u2") },
    { id: "n4", user_id: "me", type: "comment", post_id: "p2", actor_id: "u1", read: true, created_at: iso(30), actor: P("u1") },
    { id: "n5", user_id: "me", type: "gift", actor_id: "u3", read: true, created_at: iso(24 * 3), actor: P("u3") },
    { id: "n6", user_id: "me", type: "mention", post_id: "p1", actor_id: "u1", read: true, created_at: iso(24 * 20), actor: P("u1") },
    { id: "n7", user_id: "me", type: "team", actor_id: "u3", read: true, created_at: iso(24 * 21), actor: P("u3") }];
  const comments = [
    { id: "c1", post_id: "p1", body: "好美！下次揪我 @mei_trail", author_id: "u1", parent_id: null, created_at: iso(1), author: P("u1") },
    { id: "c2", post_id: "p1", body: "好啊，下週六？", author_id: "me", parent_id: "c1", created_at: iso(0.8), author: me },
    { id: "c3", post_id: "p1", body: "This trail looks amazing, how long did it take?", author_id: "u2", parent_id: null, created_at: iso(0.2), author: P("u2") }];
  const T = {
    profiles: people, posts, notifications: notifs, comments,
    follows: opts.empty ? [] : [{ follower_id: "me", following_id: "u1" }, { follower_id: "u1", following_id: "me" }, { follower_id: "me", following_id: "u3" }, { follower_id: "u3", following_id: "me" }],
    likes: [{ post_id: "p1", user_id: "me" }], reactions: [{ user_id: "u1", emoji: "🔥" }, { user_id: "u3", emoji: "🔥" }], comment_likes: [],
    follow_requests: [{ requester_id: "u2", target_id: "me" }], blocks: [], reports: [],
    events: opts.empty ? [] : [{ id: "e1", trail_name: "嘉明湖", title: "週末嘉明湖兩天一夜", when_at: iso(-72), note: "向陽森林遊樂區 6:00 集合，要帶頭燈", creator_id: "u1", creator: P("u1") }],
    event_rsvps: [], pet_gifts: [], push_subscriptions: [],
  };
  const calls = window.__supaCalls = { total: 0, byTable: {}, getUser: 0 };
  function Q(table) {
    const f = []; let single = false, head = false, cnt = false;
    const b = {
      select(_s, o) { if (o && o.head) head = true; if (o && o.count) cnt = true; return b; },
      eq(k, v) { f.push(r => r[k] === v || (k === "id" && r.id === v)); return b; }, neq() { return b; },
      in(k, vs) { f.push(r => vs.includes(r[k])); return b; }, lt() { return b; }, gte() { return b; }, gt() { return b; },
      order() { return b; }, limit() { return b; }, or() { return b; }, ilike(k, v) { const t = v.replace(/%/g, "").toLowerCase(); f.push(r => String(r[k] || "").toLowerCase().includes(t)); return b; }, not() { return b; },
      maybeSingle() { single = true; return b; }, single() { single = true; return b; },
      insert() { return b; }, update() { return b; }, delete() { return b; }, upsert() { return b; },
      then(res, rej) {
        calls.total++; calls.byTable[table] = (calls.byTable[table] || 0) + 1;
        let rows = (T[table] || []).filter(r => f.every(fn => fn(r)));
        const out = head ? { data: null, count: rows.length, error: null } : { data: single ? (rows[0] || null) : rows, count: cnt ? rows.length : null, error: null };
        return new Promise(r => setTimeout(() => r(out), opts.lag || 60)).then(res, rej);
      },
    };
    return b;
  }
  const sess = opts.loggedOut ? null : { user: { id: "me", user_metadata: {} } };
  const client = {
    auth: {
      getSession: async () => ({ data: { session: sess } }),
      getUser: async () => { calls.getUser++; await new Promise(r => setTimeout(r, opts.lag || 60)); return { data: { user: sess && sess.user } }; },
      onAuthStateChange() { return { data: { subscription: { unsubscribe() { } } } }; }, signOut: async () => ({}),
      signInWithOtp: async () => ({}), verifyOtp: async () => ({}),
    },
    from: Q, rpc: async (n) => ({ data: n === "event_rsvp_counts" ? [{ event_id: "e1", n: 3 }] : null, error: null }),
    channel() { const ch = { on() { return ch; }, subscribe() { return ch; } }; return ch; }, removeChannel() { },
    storage: { from: () => ({ getPublicUrl: p => ({ data: { publicUrl: p } }), upload: async p => ({ data: { path: p } }) }) },
    functions: { invoke: async () => ({ data: {} }) },
  };
  Supa.ready = () => true; Supa.client = () => client;
  if (opts.noProfile) T.profiles = people.slice(1);
};
