// 揪團活動：列出即將到來的揪團、建立活動、報名/取消。需 phase13。
const Events = (() => {
  const esc = s => Supa.esc(s);
  function fmt(iso) {
    const d = new Date(iso);
    return d.toLocaleString(ttLocale(), { month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
  }
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  // 揪團是山友自己約的，不是 App 辦的活動：講清楚責任歸屬，也提醒出發前該確認的事（入山／入園申請、保險、留行程給家人）
  const disc = () => `<div class="ev-disc">${ic("info")}<span>${T("揪團由山友自行發起，不是本 App 舉辦的活動。出發前請自己確認路況、天氣、入山／入園申請和保險，並把行程留給家人。")}</span></div>`;
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await Supa.meUser(); return data && data.user ? data.user.id : null; }

  async function open(presetTrail) {
    if (typeof ttBusy === "function" && ttBusy("events")) return;   // 防連點
    if (typeof Supa === "undefined" || !Supa.ready()) { if (typeof toast === "function") toast(T("社群尚未啟用")); return; }
    const sess = await Auth.session(); if (!sess) { if (typeof toast === "function") toast(T("請先到社群分頁登入")); return; }
    if (document.querySelector('[data-ov="events"]')) return;   // 防連點疊層
    const wrap = document.createElement("div"); wrap.className = "pv-mask"; wrap.dataset.ov = "events";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="evX" aria-label="${T("關閉")}">${ic("x")}</button><b>${ic("calendar")} ${T("揪團活動")}</b><button class="comp-x" id="evNew" aria-label="${T("發起揪團")}">${ic("plus")}</button></div>
      <div class="pv-body" id="evBody" aria-live="polite"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
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
    if (error) { body.innerHTML = `<div class="social-empty">${T("揪團功能暫時用不了")}</div>`; return; }
    if (!data || !data.length) { body.innerHTML = `<div class="social-empty"><span class="ee">${ic("calendar")}</span>${T("最近沒有揪團。想找人一起走？按右上角的「+」發起一個")}</div>`; return; }
    const ids = data.map(e => e.id);
    const myId = await me();
    // 人數走聚合函式（只回數字）；「我有沒有報名」只查自己的列。
    // 原本是把所有人的報名紀錄（含 user_id）整批抓到前端再自己數 → 任何登入者都能建出
    // 「誰、幾號、會出現在哪座山」的名單，對登山 App 是實質的跟蹤風險。
    const counts = {}, mine = new Set();
    const { data: cs, error: cErr } = await c.rpc("event_rsvp_counts", { p_events: ids });
    if (!cErr) for (const r of (cs || [])) counts[r.event_id] = r.n;
    else {   // 資料庫還沒跑 phase27 → 退回舊查法（仍可運作，只是不含隱私修補）
      const { data: rsvps } = await c.from("event_rsvps").select("event_id, user_id").in("event_id", ids);
      for (const r of (rsvps || [])) counts[r.event_id] = (counts[r.event_id] || 0) + 1;
    }
    if (myId) {
      const { data: my } = await c.from("event_rsvps").select("event_id").eq("user_id", myId).in("event_id", ids);
      for (const r of (my || [])) mine.add(r.event_id);
    }
    body.className = "pv-body";
    body.innerHTML = disc() + data.map(e => {
      const going = mine.has(e.id), n = counts[e.id] || 0, isMine = e.creator_id === myId;
      const cname = (e.creator && (e.creator.display_name || e.creator.handle)) || T("山友");
      return `<div class="ev-card" data-id="${e.id}">
        <div class="ev-when">${ic("calendar")} ${fmt(e.when_at)}</div>
        <div class="ev-title">${esc(e.title)}</div>
        <div class="ev-meta">${ic("mountain")} <span${e.trail_name && T(e.trail_name) === e.trail_name ? " data-raw" : ""}>${esc(T(e.trail_name || "自由路線"))}</span> · <span>${T("發起人")}</span> <span data-raw>${esc(cname)}</span></div>
        ${e.note ? `<div class="ev-note">${esc(e.note)}</div>` : ""}
        <div class="ev-actions">
          <button class="btn ${going ? "ghost" : "primary"} ev-go" data-id="${e.id}" data-going="${going ? 1 : 0}">${going ? `${ic("check")} ${T("已報名")}` : T("我要參加")}</button>
          <span class="ev-count">${n} ${T("人參加")}</span>
          ${isMine ? `<button class="link-btn ev-del" data-id="${e.id}">${T("刪除")}</button>` : ""}
        </div></div>`;
    }).join("");
    body.querySelectorAll(".ev-go").forEach(b => b.addEventListener("click", async () => {
      // 報名狀態看 data-going，不讀按鈕文字（翻成英文後 includes("已報名") 永遠 false → 一直重複報名）
      if (b.disabled) return;
      const id = b.dataset.id, going = b.dataset.going === "1";
      if (going && !(await ttConfirm(T("不去了？會取消報名。"), T("取消報名"), T("先留著")))) return;
      b.disabled = true;
      const { error: err } = going ? await c.from("event_rsvps").delete().eq("event_id", id).eq("user_id", myId)
        : await c.from("event_rsvps").insert({ event_id: id, user_id: myId });
      if (err && typeof toast === "function") toast(T(Supa.errText(err.message)));
      renderList(wrap);
    }));
    body.querySelectorAll(".ev-del").forEach(b => b.addEventListener("click", async () => {
      if (!(await ttConfirm(T("刪除這個揪團？報名的人也會看不到了。"), T("刪除"), T("取消"), { danger: true }))) return;
      b.disabled = true;
      const { error: de } = await c.from("events").delete().eq("id", b.dataset.id);
      if (de) { b.disabled = false; if (typeof toast === "function") toast(T(Supa.errText(de.message))); return; }   // 以前刪不掉也照樣重畫，看起來像刪了
      if (typeof toast === "function") toast(T("揪團刪掉了"));
      renderList(wrap);
    }));
  }

  function renderForm(wrap, presetTrail) {
    const body = wrap.querySelector("#evBody"); if (!body) return;
    const tName = presetTrail ? (presetTrail.name || "") : "";
    const tId = presetTrail ? presetTrail.id : "";
    body.className = "pv-body";
    // 錯誤訊息放在出錯的那一格下面、格子標紅（以前掉在「取消」鈕底下，幾乎看不到）
    body.innerHTML = `<div class="ev-form">
      <label class="ob-l" for="evTitle">${T("活動標題")}</label>
      <input id="evTitle" class="auth-input" maxlength="120" placeholder="${T("例：週末嘉明湖兩天一夜")}">
      <div class="ev-err" data-for="evTitle" hidden></div>
      <label class="ob-l" for="evTrail">${T("步道")}</label>
      <input id="evTrail" class="auth-input" maxlength="80" value="${esc(tName)}" placeholder="${T("步道名稱（選填）")}">
      <label class="ob-l" for="evWhen">${T("時間")}</label>
      <input id="evWhen" class="auth-input" type="datetime-local" min="${new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}">
      <div class="ev-when-pv" id="evWhenPv"></div>
      <div class="ev-err" data-for="evWhen" hidden></div>
      <label class="ob-l" for="evNote">${T("說明（集合地點、裝備、注意事項…）")}</label>
      <textarea id="evNote" class="comp-cap" maxlength="1000" placeholder="${T("選填")}"></textarea>
      ${disc()}
      <div class="auth-msg" id="evMsg"></div>
      <button class="btn primary" id="evSave">${T("發起揪團")}</button>
      <button class="btn ghost" id="evBack">${T("取消")}</button></div>`;
    body.querySelector("#evBack").addEventListener("click", () => renderList(wrap));
    // 時間欄位的格式跟著手機系統走；底下另外用 App 的語言寫一次選好的時間，看得懂選到哪天
    const wEl = body.querySelector("#evWhen"), wPv = body.querySelector("#evWhenPv");
    wEl.addEventListener("input", () => { wPv.textContent = wEl.value ? fmt(new Date(wEl.value).toISOString()) : ""; });
    const fieldErr = (id, text) => {
      body.querySelectorAll(".ev-err").forEach(e => { e.hidden = true; }); body.querySelectorAll(".auth-input.bad").forEach(e => e.classList.remove("bad"));
      if (!id) return;
      const e = body.querySelector(`.ev-err[data-for="${id}"]`), inp = body.querySelector("#" + id);
      e.textContent = text; e.hidden = false; inp.classList.add("bad"); inp.focus();
    };
    ["evTitle", "evWhen"].forEach(id => body.querySelector("#" + id).addEventListener("input", () => fieldErr(null)));
    body.querySelector("#evSave").addEventListener("click", async () => {
      const msg = body.querySelector("#evMsg");
      const title = body.querySelector("#evTitle").value.trim();
      const whenV = body.querySelector("#evWhen").value;
      if (!title) { fieldErr("evTitle", T("取個標題吧")); return; }
      if (!whenV) { fieldErr("evWhen", T("選一下出發時間")); return; }
      if (new Date(whenV).getTime() < Date.now() - 60000) { fieldErr("evWhen", T("這個時間已經過了")); return; }
      fieldErr(null);
      if (body.querySelector("#evSave").disabled) return;
      if (!(await ttRulesGate()) || !ttCleanOk(title, (body.querySelector("#evNote") || {}).value, body.querySelector("#evTrail").value)) return;
      const sv = body.querySelector("#evSave"); if (sv.disabled) return; sv.disabled = true;
      const c = Supa.client(); const myId = await me();
      msg.textContent = T("建立中…");
      const { data, error } = await c.from("events").insert({
        creator_id: myId, title, trail_id: tId || null,
        trail_name: body.querySelector("#evTrail").value.trim() || null,
        when_at: new Date(whenV).toISOString(),
        note: body.querySelector("#evNote").value.trim() || null,
      }).select("id").maybeSingle();
      if (error) { sv.disabled = false; msg.textContent = T(Supa.errText(error.message)); return; }
      if (data && data.id) await c.from("event_rsvps").insert({ event_id: data.id, user_id: myId });   // 發起人自動報名
      if (typeof toast === "function") toast(T("揪團發出去了"));
      renderList(wrap);
    });
  }

  return { open };
})();
