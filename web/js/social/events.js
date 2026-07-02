// 揪團活動：列出即將到來的揪團、建立活動、報名/取消。需 phase13。
const Events = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleString("zh-TW", { month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
  }
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await c.auth.getUser(); return data && data.user ? data.user.id : null; }

  async function open(presetTrail) {
    if (typeof ttBusy === "function" && ttBusy("events")) return;   // 防連點
    if (typeof Supa === "undefined" || !Supa.ready()) { if (typeof toast === "function") toast("社群尚未啟用"); return; }
    const sess = await Auth.session(); if (!sess) { if (typeof toast === "function") toast("請先到社群分頁登入"); return; }
    if (document.querySelector('[data-ov="events"]')) return;   // 防連點疊層
    const wrap = document.createElement("div"); wrap.className = "pv-mask"; wrap.dataset.ov = "events";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="evX" aria-label="關閉">✕</button><b>${ic("calendar")} 揪團活動</b><button class="comp-x" id="evNew" title="建立">${ic("plus")}</button></div>
      <div class="pv-body" id="evBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#evX").addEventListener("click", () => wrap.remove());
    wrap.querySelector("#evNew").addEventListener("click", () => renderForm(wrap, presetTrail));
    renderList(wrap);
  }

  async function renderList(wrap) {
    const body = wrap.querySelector("#evBody"); if (!body) return;
    body.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const c = Supa.client();
    const { data, error } = await c.from("events")
      .select("id, trail_id, trail_name, title, when_at, note, creator_id, creator:profiles!events_creator_profile_fk(handle, display_name)")
      .gte("when_at", new Date(Date.now() - 6 * 3600e3).toISOString()).order("when_at", { ascending: true }).limit(50);
    if (error) { body.innerHTML = `<div class="social-empty">活動功能尚未啟用（請先執行 phase13 SQL）。</div>`; return; }
    if (!data || !data.length) { body.innerHTML = `<div class="social-empty"><span class="ee">📅</span>目前沒有揪團活動，點右上角 ＋ 發起一個！</div>`; return; }
    const ids = data.map(e => e.id);
    const { data: rsvps } = await c.from("event_rsvps").select("event_id, user_id").in("event_id", ids);
    const myId = await me();
    const counts = {}, mine = new Set();
    for (const r of (rsvps || [])) { counts[r.event_id] = (counts[r.event_id] || 0) + 1; if (r.user_id === myId) mine.add(r.event_id); }
    body.className = "pv-body";
    body.innerHTML = data.map(e => {
      const going = mine.has(e.id), n = counts[e.id] || 0, isMine = e.creator_id === myId;
      const cname = (e.creator && (e.creator.display_name || e.creator.handle)) || "山友";
      return `<div class="ev-card" data-id="${e.id}">
        <div class="ev-when">${ic("calendar")} ${fmt(e.when_at)}</div>
        <div class="ev-title">${esc(e.title)}</div>
        <div class="ev-meta">${ic("mountain")} ${esc(e.trail_name || "自由路線")}　·　發起人 ${esc(cname)}</div>
        ${e.note ? `<div class="ev-note">${esc(e.note)}</div>` : ""}
        <div class="ev-actions">
          <button class="btn ${going ? "ghost" : "primary"} ev-go" data-id="${e.id}">${going ? "已報名 ✓" : "我要參加"}</button>
          <span class="ev-count">${n} 人參加</span>
          ${isMine ? `<button class="link-btn ev-del" data-id="${e.id}">刪除</button>` : ""}
        </div></div>`;
    }).join("");
    body.querySelectorAll(".ev-go").forEach(b => b.addEventListener("click", async () => {
      const id = b.dataset.id, going = b.textContent.includes("已報名");
      if (going) await c.from("event_rsvps").delete().eq("event_id", id).eq("user_id", myId);
      else await c.from("event_rsvps").insert({ event_id: id, user_id: myId });
      renderList(wrap);
    }));
    body.querySelectorAll(".ev-del").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("刪除這個活動？")) return;
      await c.from("events").delete().eq("id", b.dataset.id); renderList(wrap);
    }));
  }

  function renderForm(wrap, presetTrail) {
    const body = wrap.querySelector("#evBody"); if (!body) return;
    const tName = presetTrail ? (presetTrail.name || "") : "";
    const tId = presetTrail ? presetTrail.id : "";
    body.className = "pv-body";
    body.innerHTML = `<div class="ev-form">
      <label class="ob-l">活動標題</label>
      <input id="evTitle" class="auth-input" maxlength="120" placeholder="例：週末嘉明湖兩天一夜">
      <label class="ob-l">步道</label>
      <input id="evTrail" class="auth-input" maxlength="80" value="${esc(tName)}" placeholder="步道名稱（選填）">
      <label class="ob-l">時間</label>
      <input id="evWhen" class="auth-input" type="datetime-local">
      <label class="ob-l">說明（集合地點、裝備、注意事項…）</label>
      <textarea id="evNote" class="comp-cap" maxlength="1000" placeholder="選填"></textarea>
      <button class="btn primary" id="evSave">發起揪團</button>
      <button class="btn ghost" id="evBack">取消</button>
      <div class="auth-msg" id="evMsg"></div></div>`;
    body.querySelector("#evBack").addEventListener("click", () => renderList(wrap));
    body.querySelector("#evSave").addEventListener("click", async () => {
      const msg = body.querySelector("#evMsg");
      const title = body.querySelector("#evTitle").value.trim();
      const whenV = body.querySelector("#evWhen").value;
      if (!title) { msg.textContent = "請填活動標題"; return; }
      if (!whenV) { msg.textContent = "請選時間"; return; }
      const c = Supa.client(); const myId = await me();
      msg.textContent = "建立中…";
      const { data, error } = await c.from("events").insert({
        creator_id: myId, title, trail_id: tId || null,
        trail_name: body.querySelector("#evTrail").value.trim() || null,
        when_at: new Date(whenV).toISOString(),
        note: body.querySelector("#evNote").value.trim() || null,
      }).select("id").maybeSingle();
      if (error) { msg.textContent = "建立失敗：" + error.message; return; }
      if (data && data.id) await c.from("event_rsvps").insert({ event_id: data.id, user_id: myId });   // 發起人自動報名
      if (typeof toast === "function") toast("已發起揪團");
      renderList(wrap);
    });
  }

  return { open };
})();
